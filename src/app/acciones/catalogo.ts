"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contextoUsuario } from "@/lib/contexto";
import { fallo, type Resultado } from "@/lib/resultado";

const lineas = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

export async function crearCliente(datos: FormData) {
  const nombre = String(datos.get("nombre") ?? "").trim();
  if (!nombre) return;
  const ctx = await contextoUsuario();
  const { data } = await ctx.db
    .from("clientes")
    .insert({ owner_id: ctx.ownerId, nombre, empresa: String(datos.get("empresa") ?? "").trim() || null })
    .select("id")
    .single();
  revalidatePath("/clientes");
  if (data) redirect(`/clientes/${data.id}`);
}

export async function guardarCliente(id: string, _: unknown, datos: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { error } = await ctx.db
      .from("clientes")
      .update({
        nombre: String(datos.get("nombre") ?? "").trim(),
        empresa: String(datos.get("empresa") ?? "").trim() || null,
        notas: String(datos.get("notas") ?? "").trim() || null,
        preferencias: {
          gustos: lineas(datos.get("gustos")),
          rechazos: lineas(datos.get("rechazos")),
          paletas: lineas(datos.get("paletas")),
          tipografias_aprobadas: lineas(datos.get("tipografias_aprobadas")),
        },
      })
      .eq("id", id)
      .eq("owner_id", ctx.ownerId);
    if (error) throw new Error(error.message);
    revalidatePath(`/clientes/${id}`);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

const EsquemaFormato = z.object({
  ancho_mm: z.number().positive(),
  alto_mm: z.number().positive(),
  sangrado_mm: z.number().min(0),
  zona_segura_mm: z.number().min(0),
  lomo_mm: z.number().min(0),
  dpi_objetivo: z.number().int().positive(),
});

export async function guardarTipoPieza(id: string, _: unknown, datos: FormData): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { data: actual } = await ctx.db.from("tipos_pieza").select("formato").eq("id", id).eq("owner_id", ctx.ownerId).single();
    const num = (k: string) => Number(String(datos.get(k) ?? "").replace(",", "."));
    const formato = EsquemaFormato.safeParse({
      ancho_mm: num("ancho_mm"),
      alto_mm: num("alto_mm"),
      sangrado_mm: num("sangrado_mm"),
      zona_segura_mm: num("zona_segura_mm"),
      lomo_mm: num("lomo_mm"),
      dpi_objetivo: num("dpi_objetivo"),
    });
    if (!formato.success) return { ok: false, error: "Revisa las medidas: deben ser números positivos." };
    const preguntas = lineas(datos.get("preguntas")).map((p, i) => ({ clave: `p${i + 1}`, pregunta: p.replace(/^\*\s*/, ""), obligatoria: !p.startsWith("*") }));
    const { error } = await ctx.db
      .from("tipos_pieza")
      .update({
        nombre: String(datos.get("nombre") ?? "").trim(),
        descripcion: String(datos.get("descripcion") ?? "").trim() || null,
        formato: { ...(actual?.formato ?? {}), ...formato.data, caras: lineas(datos.get("caras")) },
        preguntas_recepcion: preguntas,
        formatos_entrega: datos.getAll("formatos_entrega").map(String),
      })
      .eq("id", id)
      .eq("owner_id", ctx.ownerId);
    if (error) throw new Error(error.message);
    revalidatePath("/tipos-de-pieza");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
