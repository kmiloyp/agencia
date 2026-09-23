"use server";
import { revalidatePath } from "next/cache";
import { entregarSVG, escalar, estimarEscalado, generarPDF, revisarResolucion, type FilaResolucion } from "@/lib/agencia/entrega";
import { contextoUsuario } from "@/lib/contexto";
import { env } from "@/lib/env";
import type { EstadoPresupuesto } from "@/lib/motor-creativo";
import { fallo, type Resultado } from "@/lib/resultado";

export async function consultarResolucion(proyectoId: string): Promise<Resultado<{ filas: FilaResolucion[]; imagenes: number; presupuesto: EstadoPresupuesto; modo: string }>> {
  try {
    const ctx = await contextoUsuario();
    const [filas, est] = await Promise.all([revisarResolucion(ctx, proyectoId), estimarEscalado(ctx, proyectoId, env.presupuestoMensual())]);
    return { ok: true, datos: { filas, ...est, modo: ctx.config.modoFal } };
  } catch (e) {
    return fallo(e);
  }
}

export async function escalarImagenes(proyectoId: string, confirmado: boolean): Promise<Resultado<{ creadas: number } | { presupuesto: EstadoPresupuesto; requiereConfirmacion: true }>> {
  try {
    const ctx = await contextoUsuario();
    const r = await escalar(ctx, proyectoId, env.presupuestoMensual(), confirmado);
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    if (!r.ok) return { ok: true, datos: { presupuesto: r.presupuesto, requiereConfirmacion: true } };
    return { ok: true, datos: { creadas: r.creadas } };
  } catch (e) {
    return fallo(e);
  }
}

export async function exportarPDFImpresion(proyectoId: string, marcas: boolean): Promise<Resultado<{ url: string; avisos: string[] }>> {
  try {
    const ctx = await contextoUsuario();
    const { ruta, avisos } = await generarPDF(ctx, proyectoId, marcas);
    const { data } = await ctx.sesion.storage.from("entregas").createSignedUrl(ruta, 3600, { download: ruta.split("/").pop() });
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    return { ok: true, datos: { url: data?.signedUrl ?? "", avisos } };
  } catch (e) {
    return fallo(e);
  }
}

export async function exportarSVG(proyectoId: string): Promise<Resultado<{ cantidad: number }>> {
  try {
    const ctx = await contextoUsuario();
    const cantidad = await entregarSVG(ctx, proyectoId);
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    return { ok: true, datos: { cantidad } };
  } catch (e) {
    return fallo(e);
  }
}

/** Registra los PNG que el navegador ya subió a Storage (entregas). */
export async function registrarPNG(proyectoId: string, rutas: string[]): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    if (!rutas.length || rutas.some((r) => !r.startsWith(`${ctx.ownerId}/${proyectoId}/`))) return { ok: false, error: "Rutas de archivo no válidas." };
    await ctx.db.from("entregas").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, archivos: rutas, formato: "png_web", detalle: {} });
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
