import { ErrorMotor } from "@/lib/motor-creativo/tipos";

/** Resultado serializable de una Server Action: errores en español con sugerencia. */
export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { datos: T }))
  | { ok: false; error: string; sugerencia?: string };

export function fallo(e: unknown): { ok: false; error: string; sugerencia?: string } {
  if (e instanceof ErrorMotor) return { ok: false, error: e.message, sugerencia: e.sugerencia };
  const mensaje = e instanceof Error ? e.message : String(e);
  console.error("[accion]", e);
  return { ok: false, error: mensaje || "Algo salió mal.", sugerencia: "Inténtalo de nuevo. Tu trabajo está guardado." };
}
