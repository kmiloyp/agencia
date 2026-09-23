"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ejecutarProduccion, estimarProduccion, type AccionProduccion } from "@/lib/agencia/produccion";
import { carasDe, type FormatoPiezaBD } from "@/lib/composicion/formato";
import { COMPOSICION_VACIA } from "@/lib/composicion/tipos";
import { contextoUsuario } from "@/lib/contexto";
import { env } from "@/lib/env";
import { estimarSolicitud, reintentarGeneracion, solicitudDeFila, verificarPresupuesto, type EstadoPresupuesto } from "@/lib/motor-creativo";
import { fallo, type Resultado } from "@/lib/resultado";

function validar(a: AccionProduccion): string | null {
  if (a.tipo === "editar" && !a.instruccion?.trim()) return "Describe qué quieres cambiar.";
  if ((a.tipo === "variar" || a.tipo === "muestras") && !(a.cantidad >= 1 && a.cantidad <= 4)) return "Entre 1 y 4 imágenes por tanda.";
  return null;
}

export async function estimarAccion(proyectoId: string, a: AccionProduccion): Promise<Resultado<{ imagenes: number; presupuesto: EstadoPresupuesto; modo: string }>> {
  try {
    const invalido = validar(a);
    if (invalido) return { ok: false, error: invalido };
    const ctx = await contextoUsuario();
    const r = await estimarProduccion(ctx, proyectoId, a, env.presupuestoMensual());
    return { ok: true, datos: { ...r, modo: ctx.config.modoFal } };
  } catch (e) {
    return fallo(e);
  }
}

export async function ejecutarAccion(
  proyectoId: string,
  a: AccionProduccion,
  confirmado: boolean,
): Promise<Resultado<{ creadas: number } | { presupuesto: EstadoPresupuesto; requiereConfirmacion: true }>> {
  try {
    const invalido = validar(a);
    if (invalido) return { ok: false, error: invalido };
    const ctx = await contextoUsuario();
    const r = await ejecutarProduccion(ctx, proyectoId, a, env.presupuestoMensual(), confirmado);
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    if (!r.ok) return { ok: true, datos: { presupuesto: r.presupuesto, requiereConfirmacion: true } };
    return { ok: true, datos: { creadas: r.creadas } };
  } catch (e) {
    return fallo(e);
  }
}

/** Crea (si faltan) una pieza por cara del tipo de pieza y pasa el proyecto a composición. */
export async function pasarAComposicion(proyectoId: string) {
  const ctx = await contextoUsuario();
  const { data: p } = await ctx.db
    .from("proyectos")
    .select("id, tipos_pieza(formato)")
    .eq("id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .single();
  const caras = carasDe((p?.tipos_pieza as unknown as { formato: FormatoPiezaBD } | null)?.formato);
  await ctx.db.from("piezas").upsert(
    caras.map((cara, orden) => ({ owner_id: ctx.ownerId, proyecto_id: proyectoId, cara, orden, composicion: COMPOSICION_VACIA })),
    { onConflict: "proyecto_id,cara", ignoreDuplicates: true },
  );
  await ctx.db.from("proyectos").update({ estado: "composicion" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).in("estado", ["rutas", "produccion"]);
  const { data: primera } = await ctx.db.from("piezas").select("id").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).order("orden").limit(1).single();
  revalidatePath(`/proyectos/${proyectoId}`, "layout");
  redirect(`/proyectos/${proyectoId}/composicion/${primera?.id}`);
}

/**
 * Reintenta generaciones fallidas (todas las del proyecto o las indicadas).
 * Muestra el estimado y pide confirmación si se supera el presupuesto.
 */
export async function reintentarFallidas(
  proyectoId: string,
  ids: string[] | null,
  confirmado: boolean,
): Promise<Resultado<{ reintentadas: number } | { presupuesto: EstadoPresupuesto; requiereConfirmacion: true }>> {
  try {
    const ctx = await contextoUsuario();
    let q = ctx.db.from("generaciones").select("id").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "fallida");
    if (ids?.length) q = q.in("id", ids);
    const { data } = await q;
    const lista = (data ?? []).map((g) => g.id as string);
    if (!lista.length) return { ok: true, datos: { reintentadas: 0 } };

    const solicitudes = (await Promise.all(lista.map((id) => solicitudDeFila(ctx, id)))).filter((s) => s !== null);
    const costos = await Promise.all(solicitudes.map((s) => estimarSolicitud(ctx, s)));
    const total = ctx.config.modoFal === "stub" ? 0 : costos.reduce((a, b) => a + b, 0);
    const presupuesto = await verificarPresupuesto(ctx, proyectoId, total, env.presupuestoMensual());
    if (presupuesto.requiere_confirmacion && !confirmado && ctx.config.modoFal === "real") {
      return { ok: true, datos: { presupuesto, requiereConfirmacion: true } };
    }
    await Promise.all(lista.map((id) => reintentarGeneracion(ctx, id)));
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    return { ok: true, datos: { reintentadas: lista.length } };
  } catch (e) {
    return fallo(e);
  }
}

export async function estimarReintento(proyectoId: string): Promise<Resultado<{ cantidad: number; usd: number; modo: string }>> {
  try {
    const ctx = await contextoUsuario();
    const { data } = await ctx.db.from("generaciones").select("id").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "fallida");
    const solicitudes = (await Promise.all((data ?? []).map((g) => solicitudDeFila(ctx, g.id)))).filter((s) => s !== null);
    const costos = await Promise.all(solicitudes.map((s) => estimarSolicitud(ctx, s)));
    return { ok: true, datos: { cantidad: solicitudes.length, usd: costos.reduce((a, b) => a + b, 0), modo: ctx.config.modoFal } };
  } catch (e) {
    return fallo(e);
  }
}
