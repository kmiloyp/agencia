"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ejecutarProduccion, estimarProduccion, type AccionProduccion } from "@/lib/agencia/produccion";
import { carasDe, type FormatoPiezaBD } from "@/lib/composicion/formato";
import { COMPOSICION_VACIA } from "@/lib/composicion/tipos";
import { contextoUsuario } from "@/lib/contexto";
import { env } from "@/lib/env";
import type { EstadoPresupuesto } from "@/lib/motor-creativo";
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
