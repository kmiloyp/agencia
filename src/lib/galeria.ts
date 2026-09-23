import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Generacion } from "@/components/proyecto/generacion";
import { tamanoGeneracion, type FormatoPieza } from "@/lib/agencia/datos";
import { firmarVarias } from "@/lib/urls";

export async function cargarGeneraciones(supabase: SupabaseClient, proyectoId: string, filtro?: { rutaId?: string }): Promise<Generacion[]> {
  let q = supabase
    .from("generaciones")
    .select("id, ruta_id, parent_id, caso_uso, created_at, estado, archivo, ancho, alto, prompt, costo_usd, intentos, qc, voto, aviso, error, uso_respaldo, modelos(nombre)")
    .eq("proyecto_id", proyectoId)
    .order("created_at", { ascending: true });
  if (filtro?.rutaId) q = q.eq("ruta_id", filtro.rutaId);
  const { data } = await q;
  const urls = await firmarVarias(supabase, "generaciones", (data ?? []).map((g) => g.archivo).filter(Boolean) as string[]);
  return (data ?? []).map((g) => ({
    ...g,
    costo_usd: Number(g.costo_usd),
    url: g.archivo ? urls[g.archivo] ?? null : null,
    modelo: (g.modelos as unknown as { nombre: string } | null)?.nombre ?? null,
  })) as Generacion[];
}

export async function proporcionProyecto(supabase: SupabaseClient, proyectoId: string) {
  const { data } = await supabase.from("proyectos").select("tipos_pieza(formato)").eq("id", proyectoId).maybeSingle();
  const formato = (data?.tipos_pieza as unknown as { formato: FormatoPieza } | null)?.formato;
  const t = tamanoGeneracion(formato);
  return t.ancho_px / t.alto_px;
}
