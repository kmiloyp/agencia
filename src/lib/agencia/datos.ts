import "server-only";
import type { ContextoMotor } from "@/lib/motor-creativo";
import type { Brief } from "./esquemas";

/** Formato de impresión de un tipo de pieza (mm). */
export interface FormatoPieza {
  ancho_mm: number;
  alto_mm: number;
  sangrado_mm: number;
  zona_segura_mm: number;
  lomo_mm?: number;
  caras: string[];
  dpi_objetivo: number;
  encuadernacion?: string;
  margen_anillado_mm?: number;
  lado_anillado?: string;
}

export interface ProyectoCompleto {
  id: string;
  titulo: string;
  estado: string;
  presupuesto_usd: number;
  costo_acumulado_usd: number;
  cliente: { id: string; nombre: string; empresa: string | null; preferencias: Record<string, unknown> } | null;
  tipo_pieza: { id: string; clave: string; nombre: string; formato: FormatoPieza; preguntas_recepcion: { clave: string; pregunta: string; obligatoria: boolean }[] } | null;
}

export async function cargarProyecto(ctx: ContextoMotor, proyectoId: string): Promise<ProyectoCompleto> {
  const { data, error } = await ctx.db
    .from("proyectos")
    .select("id, titulo, estado, presupuesto_usd, costo_acumulado_usd, cliente:clientes(id, nombre, empresa, preferencias), tipo_pieza:tipos_pieza(id, clave, nombre, formato, preguntas_recepcion)")
    .eq("id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .single();
  if (error || !data) throw new Error("No se encontró el proyecto.");
  return data as unknown as ProyectoCompleto;
}

export async function briefVigente(ctx: ContextoMotor, proyectoId: string): Promise<{ id: string; contenido: Brief; version: number; aprobado: boolean } | null> {
  const { data } = await ctx.db
    .from("briefs")
    .select("id, contenido, version, aprobado")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; contenido: Brief; version: number; aprobado: boolean } | null;
}

export async function resumenReferencias(ctx: ContextoMotor, proyectoId: string): Promise<string> {
  const { data } = await ctx.db
    .from("referencias")
    .select("tipo, nota, analisis")
    .eq("proyecto_id", proyectoId)
    .eq("owner_id", ctx.ownerId);
  if (!data?.length) return "";
  return data
    .map((r) => {
      const a = r.analisis as { resumen?: string; paleta?: string[]; que_evitar?: string[]; que_tomar?: string[] } | null;
      return `- [${r.tipo}] ${r.nota ?? ""} ${a ? `→ ${a.resumen} Paleta: ${(a.paleta ?? []).join(" ")}. Tomar: ${(a.que_tomar ?? []).join("; ")}. Evitar: ${(a.que_evitar ?? []).join("; ")}` : "(sin analizar)"}`;
    })
    .join("\n");
}

/** Proporción y tamaño en píxeles para generar una cara con sangrado. */
export function tamanoGeneracion(formato: FormatoPieza | undefined, ladoLargo = 2048) {
  const ancho = (formato?.ancho_mm ?? 148) + 2 * (formato?.sangrado_mm ?? 3);
  const alto = (formato?.alto_mm ?? 210) + 2 * (formato?.sangrado_mm ?? 3);
  const escala = ladoLargo / Math.max(ancho, alto);
  return {
    ancho_px: Math.round(ancho * escala),
    alto_px: Math.round(alto * escala),
    descripcion: `${ancho}×${alto} mm con sangrado (${ancho >= alto ? "horizontal" : "vertical"})`,
  };
}
