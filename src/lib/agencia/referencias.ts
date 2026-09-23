import "server-only";
import { bloqueImagen, leer, llamarEstructurado, type ContextoMotor } from "@/lib/motor-creativo";
import { EsquemaAnalisisReferencia } from "./esquemas";

const ETIQUETAS: Record<string, string> = {
  me_gusta: "al cliente LE GUSTA esta referencia",
  no_me_gusta: "al cliente NO le gusta esta referencia (sirve para saber qué evitar)",
  inspiracion: "es una referencia de inspiración",
  activo_del_cliente: "es un activo del cliente (p. ej. su logo) que debe respetarse",
  ya_visto: "es una propuesta que el cliente YA VIO: identifica con precisión su metáfora, paleta, composición y recursos para que no se repitan",
};

export async function analizarReferencia(ctx: ContextoMotor, referenciaId: string) {
  const { data: ref } = await ctx.db
    .from("referencias")
    .select("id, proyecto_id, archivo, tipo, nota")
    .eq("id", referenciaId)
    .eq("owner_id", ctx.ownerId)
    .single();
  if (!ref) throw new Error("Referencia no encontrada.");
  await ctx.db.from("referencias").update({ analisis_estado: "analizando", analisis_error: null }).eq("id", ref.id);
  try {
    const buffer = await leer(ctx, "referencias", ref.archivo);
    const analisis = await llamarEstructurado({
      ctx,
      proyectoId: ref.proyecto_id,
      concepto: "Análisis de referencia (visión)",
      sistema:
        "Eres director de arte. Analizas referencias visuales para un brief de diseño con ojo profesional: paleta exacta en hex, estilo, composición, técnica (ilustración, foto, tipografía…), tipografía si la hay, qué tomar y qué evitar. Responde en español, concreto y útil para producir.",
      contenido: [
        await bloqueImagen(buffer),
        { type: "text", text: `Contexto: ${ETIQUETAS[ref.tipo] ?? ref.tipo}.${ref.nota ? ` Nota de Camilo: ${ref.nota}` : ""}` },
      ],
      esquema: EsquemaAnalisisReferencia,
      esfuerzo: "medium",
      maxTokens: 6000,
    });
    await ctx.db.from("referencias").update({ analisis, analisis_estado: "listo" }).eq("id", ref.id);
    return analisis;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await ctx.db.from("referencias").update({ analisis_estado: "error", analisis_error: mensaje }).eq("id", ref.id);
    throw e;
  }
}
