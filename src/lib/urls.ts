import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Firma varias rutas de un bucket en una sola llamada (1 h). */
export async function firmarVarias(supabase: SupabaseClient, bucket: string, rutas: string[]): Promise<Record<string, string>> {
  const limpias = rutas.filter(Boolean);
  if (!limpias.length) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(limpias, 3600);
  const mapa: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
  return mapa;
}
