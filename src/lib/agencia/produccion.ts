import "server-only";
import {
  crearGeneracion,
  ErrorMotor,
  escribirEdicion,
  escribirPrompt,
  estimarSolicitud,
  verificarPresupuesto,
  type ClaveCasoUso,
  type ContextoMotor,
  type EstadoPresupuesto,
  type SolicitudGeneracion,
} from "@/lib/motor-creativo";
import { briefVigente, cargarProyecto, tamanoGeneracion } from "./datos";

export type AccionProduccion =
  | { tipo: "muestras"; cantidad: number }
  | { tipo: "variar"; base: string; cantidad: number; indicacion?: string }
  | { tipo: "editar"; base: string; instruccion: string }
  | { tipo: "modelo"; base: string; modeloId: string };

interface Base {
  id: string;
  ruta_id: string | null;
  caso_uso: ClaveCasoUso;
  prompt: string;
  archivo: string | null;
  parametros: { ancho_px: number; alto_px: number; paleta?: string[]; contexto_qc?: string };
}

async function rutaElegida(ctx: ContextoMotor, proyectoId: string) {
  const { data } = await ctx.db
    .from("rutas_creativas")
    .select("id, nombre, concepto, paleta, mood, tipografias, caso_uso, prompts")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .eq("estado", "elegida")
    .maybeSingle();
  if (!data) throw new ErrorMotor("No hay ruta elegida.", "Elige una ruta en la pestaña Rutas.");
  return data as { id: string; nombre: string; concepto: string; paleta: string[]; mood: string | null; tipografias: string[]; caso_uso: ClaveCasoUso; prompts: { muestras?: string[]; arte?: string } };
}

async function base(ctx: ContextoMotor, id: string): Promise<Base> {
  const { data } = await ctx.db
    .from("generaciones")
    .select("id, ruta_id, caso_uso, prompt, archivo, parametros, estado")
    .eq("id", id)
    .eq("owner_id", ctx.ownerId)
    .single();
  if (!data?.archivo || !["lista", "rechazada_qc"].includes(data.estado)) {
    throw new ErrorMotor("Esa imagen todavía no está lista.", "Espera a que termine de generarse.");
  }
  return data as Base;
}

/**
 * Arma las solicitudes de una acción. Con `redactar` = false no llama a Claude
 * (sirve para estimar el costo al instante con prompts provisionales).
 */
async function solicitudes(ctx: ContextoMotor, proyectoId: string, a: AccionProduccion, redactar: boolean): Promise<SolicitudGeneracion[]> {
  const ruta = await rutaElegida(ctx, proyectoId);
  const contexto = `Ruta "${ruta.nombre}": ${ruta.concepto} Mood: ${ruta.mood}. Paleta: ${ruta.paleta.join(" ")}.`;

  if (a.tipo === "muestras") {
    const proyecto = await cargarProyecto(ctx, proyectoId);
    const tam = tamanoGeneracion(proyecto.tipo_pieza?.formato);
    const prompts = ruta.prompts?.arte ? [ruta.prompts.arte] : ruta.prompts?.muestras?.length ? ruta.prompts.muestras : [ruta.concepto];
    return Array.from({ length: a.cantidad }, (_, i) => ({
      proyectoId,
      rutaId: ruta.id,
      casoUso: ruta.caso_uso,
      prompt: prompts[i % prompts.length],
      parametros: { ancho_px: tam.ancho_px, alto_px: tam.alto_px },
      paleta: ruta.paleta,
      contextoQC: `${contexto} Arte para ${tam.descripcion}.`,
    }));
  }

  const b = await base(ctx, a.base);
  // Los mockups llevan el logo del cliente como referencia y no pasan por QC automático.
  const esMockup = b.caso_uso === "mockup";
  const logos = esMockup
    ? ((await ctx.db.from("referencias").select("archivo").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("tipo", "activo_del_cliente").order("created_at").limit(3)).data ?? [])
        .map((l) => ({ bucket: "referencias" as const, ruta: l.archivo as string }))
    : [];
  const comun = {
    proyectoId,
    rutaId: b.ruta_id ?? ruta.id,
    parentId: b.id,
    parametros: { ancho_px: b.parametros.ancho_px, alto_px: b.parametros.alto_px },
    paleta: b.parametros.paleta ?? ruta.paleta,
    contextoQC: b.parametros.contexto_qc ?? contexto,
    omitirQC: esMockup,
  };

  if (a.tipo === "variar") {
    const brief = redactar ? (await briefVigente(ctx, proyectoId))?.contenido : undefined;
    const lista: SolicitudGeneracion[] = [];
    for (let i = 0; i < a.cantidad; i++) {
      const prompt = redactar
        ? (
            await escribirPrompt(
              ctx,
              {
                casoUso: b.caso_uso,
                encargo: `Nueva ejecución a partir de este prompt aprobado:\n${b.prompt}`,
                ruta: { nombre: ruta.nombre, concepto: ruta.concepto, paleta: ruta.paleta, mood: ruta.mood, tipografias: ruta.tipografias },
                brief,
                variacion: a.indicacion?.trim() || (i === 0 ? "cambia composición y encuadre, conserva técnica y paleta" : "explora otra escala del motivo principal y otro ritmo de espacio negativo"),
              },
              proyectoId,
            )
          ).prompt
        : b.prompt;
      lista.push({ ...comun, casoUso: b.caso_uso, prompt, imagenesEntrada: logos });
    }
    return lista;
  }

  if (a.tipo === "editar") {
    if (b.archivo!.endsWith(".svg")) {
      throw new ErrorMotor("Las imágenes vectoriales no se editan por instrucción.", "Usa Variar o cambia a un modelo raster.");
    }
    const prompt = redactar ? await escribirEdicion(ctx, a.instruccion, comun.contextoQC, proyectoId) : a.instruccion;
    return [{ ...comun, casoUso: "edicion", prompt, imagenesEntrada: [{ bucket: "generaciones", ruta: b.archivo! }] }];
  }

  // Mismo prompt con otro modelo elegido a mano (sin respaldo automático).
  return [{ ...comun, casoUso: b.caso_uso, prompt: b.prompt, modeloId: a.modeloId, imagenesEntrada: logos }];
}

export async function estimarProduccion(ctx: ContextoMotor, proyectoId: string, a: AccionProduccion, presupuestoMensual: number) {
  const lista = await solicitudes(ctx, proyectoId, a, false);
  const costos = await Promise.all(lista.map((s) => estimarSolicitud(ctx, s)));
  const total = ctx.config.modoFal === "stub" ? 0 : costos.reduce((x, y) => x + y, 0);
  return { imagenes: lista.length, presupuesto: await verificarPresupuesto(ctx, proyectoId, total, presupuestoMensual) };
}

export async function ejecutarProduccion(
  ctx: ContextoMotor,
  proyectoId: string,
  a: AccionProduccion,
  presupuestoMensual: number,
  confirmado: boolean,
): Promise<{ ok: true; creadas: number } | { ok: false; presupuesto: EstadoPresupuesto }> {
  const { presupuesto } = await estimarProduccion(ctx, proyectoId, a, presupuestoMensual);
  if (presupuesto.requiere_confirmacion && !confirmado && ctx.config.modoFal === "real") return { ok: false, presupuesto };
  const lista = await solicitudes(ctx, proyectoId, a, true);
  const r = await Promise.allSettled(lista.map((s) => crearGeneracion(ctx, s)));
  const fallidas = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  if (fallidas.length === lista.length && fallidas.length) throw fallidas[0].reason;
  return { ok: true, creadas: lista.length - fallidas.length };
}
