import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, webhookDisponible } from "@/lib/env";
import type { ConfigMotor, ContextoMotor } from "@/lib/motor-creativo";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { usuarioActual } from "@/lib/supabase/servidor";

export function configMotor(): ConfigMotor {
  return {
    falKey: env.falKey(),
    modoFal: env.falModo(),
    webhookUrl: webhookDisponible() ? `${env.appBaseUrl()}/api/webhooks/fal` : null,
    anthropicModel: env.anthropicModel(),
    anthropicFallbacks: env.anthropicFallbacks(),
  };
}

/**
 * Contexto para acciones del usuario. El motor escribe con el cliente admin
 * (necesario para Storage y procesos en segundo plano) pero SIEMPRE acotado
 * al owner_id de la sesión verificada.
 */
export async function contextoUsuario(): Promise<ContextoMotor & { sesion: SupabaseClient }> {
  const { supabase, usuario } = await usuarioActual();
  return { db: crearClienteAdmin(), ownerId: usuario.id, config: configMotor(), sesion: supabase };
}

/** Contexto para procesos sin sesión (webhook, cron): el dueño viene de la fila. */
export function contextoSistema(ownerId: string): ContextoMotor {
  return { db: crearClienteAdmin(), ownerId, config: configMotor() };
}
