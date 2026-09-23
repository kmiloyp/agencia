"use server";
import { revalidatePath } from "next/cache";
import { aprobacionPorToken, hashToken, nuevoToken, type EnvioCliente, type OpcionAprobacion, type VotoOpcion } from "@/lib/agencia/aprobacion";
import { contextoUsuario } from "@/lib/contexto";
import { env } from "@/lib/env";
import { fallo, type Resultado } from "@/lib/resultado";

// ---------------------------------------------------------------------------
// Lado del diseñador (con sesión)
// ---------------------------------------------------------------------------
export async function crearAprobacion(proyectoId: string, generacionIds: string[], dias: number, titulo: string): Promise<Resultado<{ url: string }>> {
  try {
    if (!generacionIds.length) return { ok: false, error: "Elige al menos una opción para mostrar." };
    if (generacionIds.length > 12) return { ok: false, error: "Máximo 12 opciones por enlace." };
    const ctx = await contextoUsuario();
    const { data: gens } = await ctx.db
      .from("generaciones")
      .select("id, archivo, rutas_creativas(nombre)")
      .in("id", generacionIds)
      .eq("owner_id", ctx.ownerId)
      .eq("proyecto_id", proyectoId)
      .not("archivo", "is", null);
    const opciones: OpcionAprobacion[] = generacionIds
      .map((id) => gens?.find((g) => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g, i) => ({ generacion_id: g.id, archivo: g.archivo as string, titulo: `Opción ${String.fromCharCode(65 + i)}${(g.rutas_creativas as unknown as { nombre: string } | null)?.nombre ? `: ${(g.rutas_creativas as unknown as { nombre: string }).nombre}` : ""}` }));
    const token = nuevoToken();
    const expira = new Date(Date.now() + Math.min(30, Math.max(1, dias)) * 86_400_000);
    const { error } = await ctx.db.from("aprobaciones").insert({
      owner_id: ctx.ownerId,
      proyecto_id: proyectoId,
      token_hash: hashToken(token),
      expira_en: expira.toISOString(),
      opciones,
      titulo: titulo.trim() || null,
    });
    if (error) throw new Error(`No se pudo crear el enlace: ${error.message}`);
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    // El token solo se muestra ahora: en la base queda su hash.
    return { ok: true, datos: { url: `${env.appBaseUrl()}/aprobar/${token}` } };
  } catch (e) {
    return fallo(e);
  }
}

export async function cerrarAprobacion(id: string, proyectoId: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    await ctx.db.from("aprobaciones").update({ estado: "cerrada" }).eq("id", id).eq("owner_id", ctx.ownerId);
    revalidatePath(`/proyectos/${proyectoId}`, "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Lado del cliente (sin sesión; valida el token en cada llamada)
// ---------------------------------------------------------------------------
export async function enviarVotosCliente(token: string, nombre: string, comentario: string, opciones: VotoOpcion[]): Promise<Resultado> {
  try {
    const encontrada = await aprobacionPorToken(token);
    if (!encontrada) return { ok: false, error: "Este enlace ya no está disponible.", sugerencia: "Pide uno nuevo a tu diseñador." };
    const { db, aprobacion } = encontrada;
    const validas = new Set(aprobacion.opciones.map((o) => o.generacion_id));
    const limpio: EnvioCliente = {
      nombre: nombre.trim().slice(0, 80) || "Cliente",
      fecha: new Date().toISOString(),
      comentario: comentario.trim().slice(0, 2000),
      opciones: opciones
        .filter((o) => validas.has(o.generacion_id))
        .map((o) => ({ generacion_id: o.generacion_id, voto: o.voto === "me_gusta" || o.voto === "no_me_gusta" ? o.voto : null, comentario: (o.comentario ?? "").trim().slice(0, 1000) })),
    };
    if (!limpio.comentario && !limpio.opciones.some((o) => o.voto || o.comentario)) return { ok: false, error: "Marca al menos una opción o deja un comentario." };
    await db.from("aprobaciones").update({ votos: [...(aprobacion.votos ?? []), limpio].slice(-50) }).eq("id", aprobacion.id);

    // Memoria del cliente: lo que aprobó y lo que rechazó, con sus palabras.
    const proyecto = aprobacion.proyectos as unknown as { titulo: string; cliente_id: string | null } | null;
    if (proyecto?.cliente_id) {
      const { data: cliente } = await db.from("clientes").select("preferencias").eq("id", proyecto.cliente_id).eq("owner_id", aprobacion.owner_id).single();
      const prefs = (cliente?.preferencias ?? {}) as { gustos?: string[]; rechazos?: string[] };
      const titulo = (id: string) => aprobacion.opciones.find((o) => o.generacion_id === id)?.titulo ?? "opción";
      const gustos = limpio.opciones.filter((o) => o.voto === "me_gusta").map((o) => `Aprobó ${titulo(o.generacion_id)} en "${proyecto.titulo}"${o.comentario ? `: ${o.comentario}` : ""}`);
      const rechazos = limpio.opciones.filter((o) => o.voto === "no_me_gusta").map((o) => `Rechazó ${titulo(o.generacion_id)} en "${proyecto.titulo}"${o.comentario ? `: ${o.comentario}` : ""}`);
      if (limpio.comentario) (gustos.length ? gustos : rechazos).push(`Comentario general en "${proyecto.titulo}": ${limpio.comentario}`);
      await db
        .from("clientes")
        .update({ preferencias: { ...prefs, gustos: [...(prefs.gustos ?? []), ...gustos].slice(-40), rechazos: [...(prefs.rechazos ?? []), ...rechazos].slice(-40) } })
        .eq("id", proyecto.cliente_id)
        .eq("owner_id", aprobacion.owner_id);
    }
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
