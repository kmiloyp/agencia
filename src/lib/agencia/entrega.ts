import "server-only";
import { cargarPiezasCtx } from "@/lib/composicion/cargar-ctx";
import { exportarPDF } from "@/lib/composicion/pdf";
import { type CapaImagen, dpiEfectivo, esVector } from "@/lib/composicion/tipos";
import {
  crearGeneracion,
  estimarSolicitud,
  guardar,
  leer,
  verificarPresupuesto,
  type Bucket,
  type ContextoMotor,
  type EstadoPresupuesto,
  type SolicitudGeneracion,
} from "@/lib/motor-creativo";

interface Escalado {
  estado: string;
  archivo: string | null;
  ancho: number | null;
  alto: number | null;
}

/** Último escalado de cada archivo original ("bucket/ruta" → generación de escalado). */
async function escalados(ctx: ContextoMotor, proyectoId: string) {
  const { data } = await ctx.db
    .from("generaciones")
    .select("estado, archivo, ancho, alto, imagenes_entrada, created_at")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .eq("caso_uso", "escalado")
    .order("created_at", { ascending: true });
  const mapa = new Map<string, Escalado>();
  for (const g of data ?? []) {
    const original = (g.imagenes_entrada as string[])[0];
    if (!original) continue;
    const previo = mapa.get(original);
    // Un escalado listo no se reemplaza por uno fallido posterior.
    if (previo?.estado === "lista" && g.estado !== "lista") continue;
    mapa.set(original, g as Escalado);
  }
  return mapa;
}

export interface FilaResolucion {
  cara: string;
  capa: string;
  archivo: string;
  vector: boolean;
  dpi: number;
  dpiObjetivo: number;
  estado: "ok" | "bajo" | "escalando" | "escalado" | "fallo_escalado";
  dpiFinal: number;
}

export async function revisarResolucion(ctx: ContextoMotor, proyectoId: string): Promise<FilaResolucion[]> {
  const [{ piezas }, mapa] = await Promise.all([cargarPiezasCtx(ctx, proyectoId), escalados(ctx, proyectoId)]);
  const filas: FilaResolucion[] = [];
  for (const p of piezas) {
    for (const c of p.composicion.capas) {
      if (c.tipo !== "imagen" || !c.visible) continue;
      const vector = esVector(c);
      const dpi = vector ? p.formato.dpi_objetivo : dpiEfectivo(c);
      const e = mapa.get(c.imagen.archivo);
      let estado: FilaResolucion["estado"] = vector || dpi >= p.formato.dpi_objetivo * 0.95 ? "ok" : "bajo";
      let dpiFinal = dpi;
      if (estado === "bajo" && e) {
        if (e.estado === "lista" && e.ancho) {
          dpiFinal = dpiEfectivo({ ...c, imagen: { ...c.imagen, ancho_px: e.ancho, alto_px: e.alto ?? e.ancho } } as CapaImagen);
          estado = "escalado";
        } else if (["en_cola", "generando", "qc"].includes(e.estado)) estado = "escalando";
        else estado = "fallo_escalado";
      }
      filas.push({ cara: p.cara, capa: c.nombre, archivo: c.imagen.archivo, vector, dpi, dpiObjetivo: p.formato.dpi_objetivo, estado, dpiFinal });
    }
  }
  return filas;
}

async function solicitudesEscalado(ctx: ContextoMotor, proyectoId: string): Promise<SolicitudGeneracion[]> {
  const { piezas } = await cargarPiezasCtx(ctx, proyectoId);
  const mapa = await escalados(ctx, proyectoId);
  const vistos = new Set<string>();
  const lista: SolicitudGeneracion[] = [];
  for (const p of piezas) {
    for (const c of p.composicion.capas) {
      if (c.tipo !== "imagen" || !c.visible || esVector(c) || vistos.has(c.imagen.archivo)) continue;
      const dpi = dpiEfectivo(c);
      const e = mapa.get(c.imagen.archivo);
      if (dpi >= p.formato.dpi_objetivo * 0.95 || (e && e.estado !== "fallida" && e.estado !== "rechazada_qc")) continue;
      vistos.add(c.imagen.archivo);
      // Factor en pasos de 0,5 hasta alcanzar el objetivo (el modelo acepta hasta 4×).
      const factor = Math.min(4, Math.max(1.5, Math.ceil((p.formato.dpi_objetivo / Math.max(1, dpi)) * 2) / 2));
      const i = c.imagen.archivo.indexOf("/");
      let tipo = "ilustracion";
      if (c.imagen.generacion_id) {
        const { data } = await ctx.db.from("generaciones").select("caso_uso").eq("id", c.imagen.generacion_id).maybeSingle();
        if (data?.caso_uso === "fotorrealismo") tipo = "foto";
      }
      lista.push({
        proyectoId,
        parentId: c.imagen.generacion_id ?? null,
        casoUso: "escalado",
        prompt: `Escalado ×${factor} de "${c.nombre}" para impresión a ${p.formato.dpi_objetivo} dpi`,
        parametros: { ancho_px: c.imagen.ancho_px, alto_px: c.imagen.alto_px, factor_escalado: factor, tipo_contenido: tipo },
        imagenesEntrada: [{ bucket: c.imagen.archivo.slice(0, i) as Bucket, ruta: c.imagen.archivo.slice(i + 1) }],
      });
    }
  }
  return lista;
}

export async function estimarEscalado(ctx: ContextoMotor, proyectoId: string, presupuestoMensual: number) {
  const lista = await solicitudesEscalado(ctx, proyectoId);
  const costos = await Promise.all(lista.map((s) => estimarSolicitud(ctx, s)));
  const total = ctx.config.modoFal === "stub" ? 0 : costos.reduce((a, b) => a + b, 0);
  return { imagenes: lista.length, presupuesto: await verificarPresupuesto(ctx, proyectoId, total, presupuestoMensual) };
}

export async function escalar(
  ctx: ContextoMotor,
  proyectoId: string,
  presupuestoMensual: number,
  confirmado: boolean,
): Promise<{ ok: true; creadas: number } | { ok: false; presupuesto: EstadoPresupuesto }> {
  const { presupuesto } = await estimarEscalado(ctx, proyectoId, presupuestoMensual);
  if (presupuesto.requiere_confirmacion && !confirmado && ctx.config.modoFal === "real") return { ok: false, presupuesto };
  const lista = await solicitudesEscalado(ctx, proyectoId);
  const r = await Promise.allSettled(lista.map((s) => crearGeneracion(ctx, s)));
  const fallidas = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  if (fallidas.length === lista.length && fallidas.length) throw fallidas[0].reason;
  return { ok: true, creadas: lista.length - fallidas.length };
}

function sinTildes(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

export async function generarPDF(ctx: ContextoMotor, proyectoId: string, marcas: boolean) {
  const [{ titulo, piezas }, mapa] = await Promise.all([cargarPiezasCtx(ctx, proyectoId), escalados(ctx, proyectoId)]);
  if (!piezas.length) throw new Error("Aún no hay caras compuestas.");
  const leerArchivo = (a: string) => {
    const i = a.indexOf("/");
    return leer(ctx, a.slice(0, i) as Bucket, a.slice(i + 1));
  };
  const r = await exportarPDF(piezas, {
    leer: leerArchivo,
    reemplazo: (a) => {
      const e = mapa.get(a);
      return e?.estado === "lista" && e.archivo ? `generaciones/${e.archivo}` : undefined;
    },
  }, { marcas, titulo });

  const nombre = `${sinTildes(titulo) || "pieza"}-impresion${marcas ? "-marcas" : ""}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.pdf`;
  const ruta = `${ctx.ownerId}/${proyectoId}/${nombre}`;
  await guardar(ctx, "entregas", ruta, Buffer.from(r.bytes), "application/pdf");
  await ctx.db.from("entregas").insert({
    owner_id: ctx.ownerId,
    proyecto_id: proyectoId,
    archivos: [ruta],
    formato: "pdf_impresion",
    detalle: { avisos: r.avisos, imagenes: r.imagenes, marcas, color: "RGB", tamano_bytes: r.bytes.length },
  });
  await ctx.db.from("proyectos").update({ estado: "entregado" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "composicion");
  return { ruta, avisos: r.avisos };
}

/** Copia los SVG vectoriales usados o aprobados a la carpeta de entregas. */
export async function entregarSVG(ctx: ContextoMotor, proyectoId: string) {
  const { data } = await ctx.db
    .from("generaciones")
    .select("id, archivo, voto")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .like("archivo", "%.svg")
    .in("estado", ["lista", "rechazada_qc"]);
  const { piezas } = await cargarPiezasCtx(ctx, proyectoId);
  const usados = new Set(piezas.flatMap((p) => p.composicion.capas.flatMap((c) => (c.tipo === "imagen" ? [c.imagen.archivo] : []))));
  const elegidos = (data ?? []).filter((g) => g.voto === "aprobada" || usados.has(`generaciones/${g.archivo}`));
  if (!elegidos.length) throw new Error("No hay SVG aprobados ni usados en la composición.");
  const rutas: string[] = [];
  for (const [i, g] of elegidos.entries()) {
    const bytes = await leer(ctx, "generaciones", g.archivo as string);
    const ruta = `${ctx.ownerId}/${proyectoId}/vector-${i + 1}-${g.id.slice(0, 6)}.svg`;
    await guardar(ctx, "entregas", ruta, bytes, "image/svg+xml");
    rutas.push(ruta);
  }
  await ctx.db.from("entregas").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, archivos: rutas, formato: "svg", detalle: {} });
  return rutas.length;
}
