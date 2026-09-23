/**
 * Proveedor fal.ai: cola con webhook (o sondeo en local).
 * Documentación: https://fal.ai/docs/documentation/model-apis/inference/queue
 */
import { ApiError, ValidationError, createFalClient, type FalClient } from "@fal-ai/client";
import { ErrorMotor, type ConfigMotor } from "../tipos";

let cache: { key: string; cliente: FalClient } | null = null;
function cliente(config: ConfigMotor) {
  if (!config.falKey) throw new ErrorMotor("Falta la llave de fal.ai.", "Pon FAL_KEY en .env.local o usa FAL_MODO=stub.");
  if (cache?.key !== config.falKey) cache = { key: config.falKey, cliente: createFalClient({ credentials: config.falKey }) };
  return cache.cliente;
}

function traducirError(e: unknown, endpoint: string): never {
  if (e instanceof ValidationError) {
    const detalle = e.fieldErrors?.map((f) => `${f.loc?.join(".")}: ${f.msg}`).join("; ");
    throw new ErrorMotor(
      `fal.ai rechazó los parámetros enviados a ${endpoint}${detalle ? ` (${detalle})` : ""}.`,
      "Revisa el esquema_parametros de este modelo en /modelos.",
    );
  }
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) throw new ErrorMotor("La llave de fal.ai no es válida o no tiene saldo.", "Revisa FAL_KEY y tu saldo en fal.ai.");
    if (e.status === 404) throw new ErrorMotor(`El endpoint ${endpoint} ya no existe en fal.ai.`, "Actualiza el modelo en /modelos.");
    if (e.status === 429) throw new ErrorMotor("fal.ai está limitando las peticiones.", "Espera un momento y reintenta.");
    throw new ErrorMotor(`fal.ai devolvió un error (${e.status}) en ${endpoint}.`, "Se intentará con el modelo de respaldo si existe.");
  }
  throw new ErrorMotor(`No se pudo contactar a fal.ai (${(e as Error)?.message ?? "error desconocido"}).`, "Revisa tu conexión y reintenta.");
}

export async function enviar(config: ConfigMotor, endpoint: string, entrada: Record<string, unknown>): Promise<string> {
  try {
    const r = await cliente(config).queue.submit(endpoint, {
      input: entrada,
      ...(config.webhookUrl ? { webhookUrl: config.webhookUrl } : {}),
    });
    return r.request_id;
  } catch (e) {
    traducirError(e, endpoint);
  }
}

export type EstadoCola = "en_cola" | "generando" | "completada";

export async function estado(config: ConfigMotor, endpoint: string, requestId: string): Promise<EstadoCola> {
  try {
    const s = await cliente(config).queue.status(endpoint, { requestId, logs: false });
    if (s.status === "IN_QUEUE") return "en_cola";
    if (s.status === "IN_PROGRESS") return "generando";
    return "completada";
  } catch (e) {
    traducirError(e, endpoint);
  }
}

/** Resultado de una petición completada (lanza ErrorMotor si falló en fal). */
export async function resultado(config: ConfigMotor, endpoint: string, requestId: string): Promise<unknown> {
  try {
    const r = await cliente(config).queue.result(endpoint, { requestId });
    return r.data;
  } catch (e) {
    traducirError(e, endpoint);
  }
}

/** Extrae las URLs de imagen de la salida de un endpoint. */
export function urlsSalida(datos: unknown, salida: "images" | "image"): string[] {
  const d = datos as { images?: { url: string }[]; image?: { url: string } } | null;
  if (!d) return [];
  if (salida === "image") return d.image?.url ? [d.image.url] : [];
  return (d.images ?? []).map((i) => i.url).filter(Boolean);
}
