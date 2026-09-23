import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatoDeCara, type FormatoPiezaBD } from "./formato";
import type { Composicion } from "./tipos";

export async function cargarPiezas(supabase: SupabaseClient, proyectoId: string) {
  const [{ data: piezas }, { data: p }] = await Promise.all([
    supabase.from("piezas").select("id, cara, orden, composicion").eq("proyecto_id", proyectoId).order("orden"),
    supabase.from("proyectos").select("titulo, tipos_pieza(formato, nombre)").eq("id", proyectoId).single(),
  ]);
  const tipo = p?.tipos_pieza as unknown as { formato: FormatoPiezaBD; nombre: string } | null;
  return {
    titulo: p?.titulo ?? "Pieza",
    formatoBD: tipo?.formato ?? null,
    piezas: (piezas ?? []).map((x) => ({
      id: x.id as string,
      cara: x.cara as string,
      formato: formatoDeCara(tipo?.formato, x.cara),
      composicion: x.composicion as Composicion,
    })),
  };
}

/** Archivos ("bucket/ruta") de todas las capas de imagen. */
export function archivosDe(piezas: { composicion: Composicion }[]) {
  return [...new Set(piezas.flatMap((p) => p.composicion.capas.flatMap((c) => (c.tipo === "imagen" ? [c.imagen.archivo] : []))))];
}
