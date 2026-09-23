import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente con service_role: ignora RLS. Úsalo SOLO en el servidor para procesos
 * sin sesión (webhooks de fal, cron, página pública de aprobación con token).
 * Siempre filtra por owner_id explícitamente.
 */
export function crearClienteAdmin() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
