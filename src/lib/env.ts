/**
 * Acceso centralizado a variables de entorno (solo servidor salvo NEXT_PUBLIC_*).
 * Los errores explican qué falta y dónde conseguirlo.
 */
function requerida(nombre: string, ayuda: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. ${ayuda} Revisa .env.local (ver .env.example).`);
  }
  return valor;
}

export const env = {
  supabaseUrl: () => requerida("NEXT_PUBLIC_SUPABASE_URL", "Está en Supabase → Project Settings → API."),
  supabaseAnon: () => requerida("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Está en Supabase → Project Settings → API."),
  supabaseServiceRole: () => requerida("SUPABASE_SERVICE_ROLE_KEY", "Está en Supabase → Project Settings → API (service_role)."),
  anthropicModel: () => requerida("ANTHROPIC_MODEL", "Ejemplo: claude-opus-5."),
  anthropicFallbacks: () => (process.env.ANTHROPIC_FALLBACKS ?? "default") !== "off",
  falKey: () => process.env.FAL_KEY ?? "",
  /** "real" si hay FAL_KEY y FAL_MODO no fuerza stub. */
  falModo: (): "real" | "stub" => {
    if (process.env.FAL_MODO === "stub") return "stub";
    return process.env.FAL_KEY ? "real" : "stub";
  },
  cronSecret: () => requerida("CRON_SECRET", "Genera uno con: openssl rand -hex 32."),
  appBaseUrl: () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  presupuestoMensual: () => Number(process.env.PRESUPUESTO_MENSUAL_USD ?? 50),
  presupuestoProyecto: () => Number(process.env.PRESUPUESTO_POR_PROYECTO_USD ?? 5),
};

/** fal no entrega webhooks a localhost ni a IPs privadas: en local usamos sondeo. */
export function webhookDisponible(): boolean {
  const url = env.appBaseUrl();
  return url.startsWith("https://") && !/localhost|127\.0\.0\.1|\.local\b/.test(url);
}
