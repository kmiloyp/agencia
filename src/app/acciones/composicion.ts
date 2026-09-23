"use server";
import { z } from "zod";
import { contextoUsuario } from "@/lib/contexto";
import { fallo, type Resultado } from "@/lib/resultado";

const EsquemaComposicion = z.object({
  version: z.literal(1),
  fondo: z.string().max(20),
  capas: z.array(z.object({ id: z.string(), tipo: z.enum(["imagen", "texto", "forma"]) }).passthrough()).max(300),
});

/** Autoguardado de una cara. */
export async function guardarComposicion(piezaId: string, composicion: unknown): Promise<Resultado> {
  try {
    const valida = EsquemaComposicion.safeParse(composicion);
    if (!valida.success) return { ok: false, error: "La composición tiene un formato inválido.", sugerencia: "Recarga el editor; lo último guardado sigue a salvo." };
    const ctx = await contextoUsuario();
    const { error } = await ctx.db.from("piezas").update({ composicion: valida.data }).eq("id", piezaId).eq("owner_id", ctx.ownerId);
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Renueva URLs firmadas ("bucket/ruta") cuando caducan en una sesión larga. */
export async function firmarArchivos(archivos: string[]): Promise<Resultado<Record<string, string>>> {
  try {
    const { sesion } = await contextoUsuario();
    const mapa: Record<string, string> = {};
    await Promise.all(
      archivos.slice(0, 100).map(async (a) => {
        const i = a.indexOf("/");
        const { data } = await sesion.storage.from(a.slice(0, i)).createSignedUrl(a.slice(i + 1), 6 * 3600);
        if (data) mapa[a] = data.signedUrl;
      }),
    );
    return { ok: true, datos: mapa };
  } catch (e) {
    return fallo(e);
  }
}
