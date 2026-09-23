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
import { briefVigente, cargarProyecto, type FormatoPieza } from "./datos";
import { EsquemaRutas, PALANCAS, type RutaPropuesta } from "./esquemas";

// ---------------------------------------------------------------------------
// Contexto creativo: brief, sitio del cliente, gustos y el territorio agotado
// ---------------------------------------------------------------------------
async function contextoCreativo(ctx: ContextoMotor, proyectoId: string) {
  const [proyecto, brief, refs, investigacion, rutasPrevias, mensajes] = await Promise.all([
    cargarProyecto(ctx, proyectoId),
    briefVigente(ctx, proyectoId),
    ctx.db.from("referencias").select("tipo, nota, analisis").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId),
    ctx.db.from("investigaciones").select("informe, omitida").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.db.from("rutas_creativas").select("nombre, concepto, palanca, estado, motivo_descarte").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId),
    ctx.db.from("mensajes").select("meta").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId),
  ]);
  if (!brief?.aprobado) throw new Error("Aprueba el brief antes de pedir rutas.");

  type Analisis = { resumen?: string; paleta?: string[]; estilo?: string; composicion?: string; que_evitar?: string[]; que_tomar?: string[] } | null;
  const describir = (r: { nota: string | null; analisis: unknown }) => {
    const a = r.analisis as Analisis;
    return `- ${r.nota ?? ""} ${a ? `${a.resumen} Estilo: ${a.estilo}. Composición: ${a.composicion}. Paleta: ${(a.paleta ?? []).join(" ")}` : "(sin analizar)"}`;
  };
  const lista = refs.data ?? [];
  const yaVisto = lista.filter((r) => r.tipo === "ya_visto" || r.tipo === "no_me_gusta").map(describir).join("\n");
  const gusta = lista.filter((r) => r.tipo === "me_gusta" || r.tipo === "inspiracion").map(describir).join("\n");
  const activos = lista.filter((r) => r.tipo === "activo_del_cliente").map(describir).join("\n");
  const sitio = (mensajes.data ?? [])
    .map((m) => (m.meta as { lectura_web?: { contenido: string } } | null)?.lectura_web?.contenido)
    .filter(Boolean)
    .join("\n\n");
  const previas = (rutasPrevias.data ?? []).map((r) => `- ${r.nombre} [${r.palanca ?? "sin palanca"}]: ${r.concepto}${r.estado === "descartada" ? ` (DESCARTADA: ${r.motivo_descarte})` : ""}`).join("\n");

  return { proyecto, brief: brief.contenido, yaVisto, gusta, activos, sitio, previas, investigacion: investigacion.data && !investigacion.data.omitida ? investigacion.data.informe : "" };
}

function descripcionFormato(f: FormatoPieza | undefined, caras: string[]) {
  const ancho = f?.ancho_mm ?? 148;
  const alto = f?.alto_mm ?? 210;
  const anillado = f?.encuadernacion === "anillado" ? `, anillado (espiral a la ${f.lado_anillado === "derecho" ? "derecha" : "izquierda"} de la portada y en espejo en la contraportada)` : "";
  return `${caras.join(" y ")} de ${ancho}×${alto} mm, vertical${anillado}`;
}

const LISTA_PALANCAS = Object.entries(PALANCAS).map(([k, v]) => `- ${k}: ${v}`).join("\n");

const GENERADOR = (guia: string) => `Eres el director creativo de una agencia de diseño premiada. Tu trabajo es DIVERGIR: proponer rutas que un cliente no haya visto nunca y que ningún competidor pueda usar.

Método obligatorio:
1. Antes de idear, haz un inventario del OFICIO del cliente: procesos, máquinas, materiales, mermas, herramientas, marcas técnicas, gestos de sus operarios, lo que sus productos protegen. Las mejores ideas salen de ahí, no de los adjetivos del brief ("flexible", "innovador", "sostenible" llevan directo al cliché).
2. Cada ruta usa una PALANCA creativa distinta (no repitas palanca):
${LISTA_PALANCAS}
3. Respeta el TERRITORIO AGOTADO: nada de lo que aparece en "Ya visto / no repetir" puede reaparecer (ni su paleta dominante, ni su metáfora, ni su composición). Si el brief pide un color de marca, úsalo de otra forma.
4. Varía también la composición entre rutas (centrada, asimétrica, sangrada, modular, un solo elemento, collage) y el fondo (claro, oscuro, color saturado, fotografía, textura).

Para cada ruta escribe "prompt_mockup" en inglés, listo para pegar en un generador de imágenes con el LOGO DEL CLIENTE ADJUNTO:
- Pide una foto de producto limpia y creíble de la pieza completa (todas las caras lado a lado), luz de estudio suave.
- Indica que el logo adjunto se reproduzca EXACTAMENTE, sin redibujarlo.
- Escribe entre comillas los textos reales que deben aparecer (marca, claim, datos de contacto) tal como están en el brief; nada inventado.
- Describe la idea visual con precisión de director de arte; prohíbe explícitamente los clichés del territorio agotado.

"prompt_arte": el arte de fondo solo, sin textos ni logo, para producción posterior.

${guia}`;

const CRITICO = `Eres el director creativo ejecutivo que revisa el trabajo de tu equipo antes de mostrárselo al cliente. Eres implacable con los clichés.

Recibes rutas candidatas. Tu tarea:
1. Descarta las que se parezcan entre sí, las que repitan algo del territorio agotado, las que traduzcan literalmente un adjetivo del brief (ola = flexible, hoja = sostenible, circuito = tecnología, degradado azul = innovación) y las genéricas que servirían para cualquier empresa.
2. Quédate con las mejores, cada una con una palanca distinta. Si una idea es buena pero su ejecución cae en cliché, corrígela.
3. Revisa cada prompt_mockup: logo adjunto reproducido exactamente, textos reales entre comillas y escritos sin errores, todas las caras de la pieza, y una prohibición explícita de los clichés.
Devuelve la lista final con el mismo formato.`;

export async function proponerRutas(ctx: ContextoMotor, proyectoId: string, cantidad = 6) {
  const c = await contextoCreativo(ctx, proyectoId);
  const caras = c.brief.caras?.length ? c.brief.caras : ["portada", "contraportada"];
  const formato = descripcionFormato(c.proyecto.tipo_pieza?.formato, caras);
  const guia = await guiaAntiIA();
  const contexto = [
    `Pieza: ${c.proyecto.tipo_pieza?.nombre ?? c.brief.tipo_pieza}. Formato: ${formato}.`,
    `Brief aprobado: ${JSON.stringify(c.brief)}`,
    c.sitio && `Lo que dice el sitio web del cliente:\n${c.sitio}`,
    c.activos && `Activos del cliente (el logo va adjunto en la generación):\n${c.activos}`,
    c.proyecto.cliente && `Historial del cliente (gustos y rechazos): ${JSON.stringify(c.proyecto.cliente.preferencias)}`,
    c.gusta && `Le gusta / inspiración:\n${c.gusta}`,
    `TERRITORIO AGOTADO (ya visto o rechazado, no repetir):\n${c.yaVisto || "(nada cargado)"}${c.previas ? `\nRutas ya propuestas en este proyecto:\n${c.previas}` : ""}`,
    c.investigacion && `Investigación:\n${c.investigacion}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 1. Divergir: más candidatas de las necesarias.
  const candidatas = await llamarEstructurado({
    ctx,
    proyectoId,
    concepto: "Rutas candidatas (divergencia)",
    sistema: GENERADOR(guia),
    contenido: `${contexto}\n\nPropón ${cantidad + 3} rutas candidatas, cada una con una palanca distinta.`,
    esquema: EsquemaRutas,
    esfuerzo: "high",
  });
  // 2. Criticar y quedarse con las mejores.
  const finales = await llamarEstructurado({
    ctx,
    proyectoId,
    concepto: "Crítica del director creativo",
    sistema: CRITICO,
    contenido: `${contexto}\n\nCandidatas:\n${JSON.stringify(candidatas.rutas)}\n\nDevuelve exactamente ${cantidad} rutas.`,
    esquema: EsquemaRutas,
    esfuerzo: "high",
  });
  const rutas: RutaPropuesta[] = finales.rutas.slice(0, cantidad);

  // Primero se guardan las nuevas; solo si eso funciona se retiran las propuestas
  // anteriores sin elegir (las descartadas quedan como memoria). Nunca se pierde trabajo.
  const { data: anteriores } = await ctx.db.from("rutas_creativas").select("id").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "propuesta");
  const { error } = await ctx.db.from("rutas_creativas").insert(
    rutas.map((r, i) => ({
      owner_id: ctx.ownerId,
      proyecto_id: proyectoId,
      orden: i,
      nombre: r.nombre,
      palanca: r.palanca,
      metafora: r.metafora,
      evita: r.evita,
      concepto: r.concepto,
      paleta: r.paleta,
      tipografias: r.tipografias,
      mood: r.mood,
      caso_uso: r.caso_uso,
      por_que_encaja: r.por_que_encaja,
      prompts: { mockup: r.prompt_mockup, arte: r.prompt_arte },
    })),
  );
  if (error) {
    throw new Error(
      error.message.includes("schema cache") || error.message.includes("column")
        ? "La base de datos no tiene las columnas nuevas. Aplica la migración 20260923000004_propuestas.sql en Supabase."
        : `No se pudieron guardar las rutas: ${error.message}`,
    );
  }
  const idsAnteriores = (anteriores ?? []).map((r) => r.id);
  if (idsAnteriores.length) await ctx.db.from("rutas_creativas").delete().in("id", idsAnteriores).eq("owner_id", ctx.ownerId);
  await ctx.db.from("proyectos").update({ estado: "rutas" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).in("estado", ["recepcion", "investigacion", "rutas"]);
}

// ---------------------------------------------------------------------------
// Mockups: una imagen completa por ruta, con el logo como referencia
// ---------------------------------------------------------------------------
async function solicitudesMockup(ctx: ContextoMotor, proyectoId: string, rutaIds: string[] | null): Promise<SolicitudGeneracion[]> {
  let q = ctx.db
    .from("rutas_creativas")
    .select("id, nombre, concepto, paleta, prompts")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .in("estado", ["propuesta", "elegida"])
    .order("orden");
  if (rutaIds?.length) q = q.in("id", rutaIds);
  const [{ data: rutas }, { data: logos }, { data: conMockup }] = await Promise.all([
    q,
    ctx.db.from("referencias").select("archivo").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("tipo", "activo_del_cliente").order("created_at").limit(3),
    ctx.db.from("generaciones").select("ruta_id").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("caso_uso", "mockup").neq("estado", "fallida"),
  ]);
  const yaTienen = new Set((conMockup ?? []).map((g) => g.ruta_id));
  const referencias = (logos ?? []).map((l) => ({ bucket: "referencias" as const, ruta: l.archivo as string }));
  return (rutas ?? [])
    .filter((r) => rutaIds?.length || !yaTienen.has(r.id))
    .map((r) => ({
      proyectoId,
      rutaId: r.id,
      casoUso: "mockup" as const,
      prompt: (r.prompts as { mockup?: string })?.mockup ?? r.concepto,
      // Mockup horizontal: las caras lado a lado.
      parametros: { ancho_px: 2048, alto_px: 1536 },
      imagenesEntrada: referencias,
      paleta: r.paleta,
      omitirQC: true,
    }));
}

export async function estimarMockups(ctx: ContextoMotor, proyectoId: string, presupuestoMensual: number, rutaIds: string[] | null = null) {
  const lista = await solicitudesMockup(ctx, proyectoId, rutaIds);
  const costos = await Promise.all(lista.map((s) => estimarSolicitud(ctx, s)));
  const total = ctx.config.modoFal === "stub" ? 0 : costos.reduce((a, b) => a + b, 0);
  return { imagenes: lista.length, presupuesto: await verificarPresupuesto(ctx, proyectoId, total, presupuestoMensual), modo: ctx.config.modoFal };
}

export async function generarMockups(
  ctx: ContextoMotor,
  proyectoId: string,
  presupuestoMensual: number,
  confirmado: boolean,
  rutaIds: string[] | null = null,
): Promise<{ ok: true; creadas: number } | { ok: false; presupuesto: EstadoPresupuesto }> {
  const { presupuesto } = await estimarMockups(ctx, proyectoId, presupuestoMensual, rutaIds);
  if (presupuesto.requiere_confirmacion && !confirmado && ctx.config.modoFal === "real") return { ok: false, presupuesto };
  const lista = await solicitudesMockup(ctx, proyectoId, rutaIds);
  const r = await Promise.allSettled(lista.map((s) => crearGeneracion(ctx, s)));
  const fallidas = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  if (fallidas.length === lista.length && fallidas.length) throw fallidas[0].reason;
  return { ok: true, creadas: lista.length - fallidas.length };
}

/** Registra una imagen generada fuera de la app (p. ej. ChatGPT) como mockup de una ruta. */
export async function registrarMockupExterno(ctx: ContextoMotor, proyectoId: string, rutaId: string, archivo: string, ancho: number, alto: number) {
  if (!archivo.startsWith(`${ctx.ownerId}/${proyectoId}/`)) throw new Error("Ruta de archivo no válida.");
  const { data: ruta } = await ctx.db.from("rutas_creativas").select("prompts").eq("id", rutaId).eq("owner_id", ctx.ownerId).single();
  const { error } = await ctx.db.from("generaciones").insert({
    owner_id: ctx.ownerId,
    proyecto_id: proyectoId,
    ruta_id: rutaId,
    caso_uso: "mockup",
    endpoint: "externo",
    prompt: (ruta?.prompts as { mockup?: string })?.mockup ?? "Imagen subida",
    parametros: { ancho_px: ancho, alto_px: alto, omitir_qc: true, origen: "externo" },
    estado: "lista",
    archivo,
    ancho,
    alto,
    costo_usd: 0,
    aviso: "Generada fuera de la app (subida a mano).",
  });
  if (error) throw new Error(`No se pudo registrar la imagen: ${error.message}`);
}
