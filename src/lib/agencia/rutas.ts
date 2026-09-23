import "server-only";
import {
  crearGeneracion,
  estimarSolicitud,
  guiaAntiIA,
  llamarEstructurado,
  verificarPresupuesto,
  type ContextoMotor,
  type EstadoPresupuesto,
  type SolicitudGeneracion,
} from "@/lib/motor-creativo";
import { briefVigente, cargarProyecto, resumenReferencias, tamanoGeneracion } from "./datos";
import { EsquemaRutas } from "./esquemas";

export async function proponerRutas(ctx: ContextoMotor, proyectoId: string) {
  const [proyecto, brief, referencias, investigacion, descartadas] = await Promise.all([
    cargarProyecto(ctx, proyectoId),
    briefVigente(ctx, proyectoId),
    resumenReferencias(ctx, proyectoId),
    ctx.db.from("investigaciones").select("informe, omitida").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.db.from("rutas_creativas").select("nombre, concepto, motivo_descarte").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "descartada"),
  ]);
  if (!brief?.aprobado) throw new Error("Aprueba el brief antes de pedir rutas.");
  const tam = tamanoGeneracion(proyecto.tipo_pieza?.formato);
  const guia = await guiaAntiIA();

  const sistema = `Eres el director creativo de una agencia de diseño de primer nivel. Propones exactamente 3 rutas creativas REALMENTE distintas (concepto, técnica y paleta diferentes; no tres variaciones de la misma idea). Cada ruta: nombre evocador, concepto en 2 frases, paleta de 4–5 hex, 2 tipografías de Google Fonts (titular + texto), mood, caso de uso de imagen y por qué encaja con el brief (mencionando lo que el cliente rechazó).

Para cada ruta escribe 2 prompts de imagen en inglés siguiendo la guía anti-IA de abajo: dos ejecuciones distintas de la misma ruta. La imagen es el arte de fondo de la cara principal; los textos se ponen después en el canvas como texto real, así que deja espacio negativo para título y marca.

${guia}`;

  const contenido = [
    `Pieza: ${proyecto.tipo_pieza?.nombre ?? brief.contenido.tipo_pieza}. Formato de la imagen: ${tam.descripcion}.`,
    `Brief aprobado: ${JSON.stringify(brief.contenido)}`,
    proyecto.cliente && `Preferencias históricas del cliente: ${JSON.stringify(proyecto.cliente.preferencias)}`,
    referencias && `Referencias analizadas:\n${referencias}`,
    investigacion.data && !investigacion.data.omitida && `Investigación:\n${investigacion.data.informe}`,
    descartadas.data?.length && `Rutas ya descartadas (no repetir): ${JSON.stringify(descartadas.data)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await llamarEstructurado({ ctx, proyectoId, concepto: "Propuesta de rutas creativas", sistema, contenido, esquema: EsquemaRutas, esfuerzo: "high" });
  const rutas = r.rutas.slice(0, 3);

  // Las propuestas anteriores sin elegir se reemplazan.
  await ctx.db.from("rutas_creativas").delete().eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "propuesta");
  const { data, error } = await ctx.db
    .from("rutas_creativas")
    .insert(
      rutas.map((ruta, i) => ({
        owner_id: ctx.ownerId,
        proyecto_id: proyectoId,
        orden: i,
        nombre: ruta.nombre,
        concepto: ruta.concepto,
        paleta: ruta.paleta,
        tipografias: ruta.tipografias,
        mood: ruta.mood,
        caso_uso: ruta.caso_uso,
        por_que_encaja: ruta.por_que_encaja,
        prompts: { muestras: ruta.prompts.slice(0, 2) },
      })),
    )
    .select("id");
  if (error) throw new Error(`No se pudieron guardar las rutas: ${error.message}`);
  await ctx.db.from("proyectos").update({ estado: "rutas" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId);
  return data;
}

async function solicitudesMuestras(ctx: ContextoMotor, proyectoId: string, muestrasPorRuta: number) {
  const proyecto = await cargarProyecto(ctx, proyectoId);
  const tam = tamanoGeneracion(proyecto.tipo_pieza?.formato);
  const { data: rutas } = await ctx.db
    .from("rutas_creativas")
    .select("id, nombre, concepto, paleta, mood, caso_uso, prompts")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .eq("estado", "propuesta")
    .order("orden");
  const solicitudes: SolicitudGeneracion[] = [];
  for (const ruta of rutas ?? []) {
    const prompts: string[] = (ruta.prompts as { muestras?: string[] })?.muestras ?? [];
    for (let i = 0; i < muestrasPorRuta; i++) {
      solicitudes.push({
        proyectoId,
        rutaId: ruta.id,
        casoUso: ruta.caso_uso,
        prompt: prompts[i % Math.max(1, prompts.length)] ?? ruta.concepto,
        parametros: { ancho_px: tam.ancho_px, alto_px: tam.alto_px },
        paleta: ruta.paleta,
        contextoQC: `Ruta "${ruta.nombre}": ${ruta.concepto} Mood: ${ruta.mood}. Paleta: ${ruta.paleta.join(" ")}. Arte para ${tam.descripcion}.`,
      });
    }
  }
  return solicitudes;
}

export async function estimarMuestras(ctx: ContextoMotor, proyectoId: string, presupuestoMensual: number, muestrasPorRuta = 2) {
  const solicitudes = await solicitudesMuestras(ctx, proyectoId, muestrasPorRuta);
  const costos = await Promise.all(solicitudes.map((s) => estimarSolicitud(ctx, s)));
  const total = costos.reduce((a, b) => a + b, 0);
  const presupuesto = await verificarPresupuesto(ctx, proyectoId, total, presupuestoMensual);
  return { imagenes: solicitudes.length, presupuesto, modo: ctx.config.modoFal };
}

export async function generarMuestras(
  ctx: ContextoMotor,
  proyectoId: string,
  presupuestoMensual: number,
  confirmado: boolean,
  muestrasPorRuta = 2,
): Promise<{ ok: true; creadas: number } | { ok: false; presupuesto: EstadoPresupuesto }> {
  const { presupuesto } = await estimarMuestras(ctx, proyectoId, presupuestoMensual, muestrasPorRuta);
  if (presupuesto.requiere_confirmacion && !confirmado && ctx.config.modoFal === "real") {
    return { ok: false, presupuesto };
  }
  const solicitudes = await solicitudesMuestras(ctx, proyectoId, muestrasPorRuta);
  // En paralelo: cada una entra a la cola de fal por separado.
  const resultados = await Promise.allSettled(solicitudes.map((s) => crearGeneracion(ctx, s)));
  const fallidas = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (fallidas.length === solicitudes.length && fallidas.length > 0) throw fallidas[0].reason;
  return { ok: true, creadas: solicitudes.length - fallidas.length };
}
