/**
 * Supabase Storage. Las URLs de fal son temporales: todo resultado se descarga
 * y se guarda aquí de inmediato. Rutas: {owner_id}/{proyecto_id}/{archivo}.
 */
import sharp from "sharp";
import { ErrorMotor, type ContextoMotor } from "./tipos";

export type Bucket = "referencias" | "generaciones" | "entregas" | "personajes";

export async function descargar(url: string): Promise<{ buffer: Buffer; tipo: string }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new ErrorMotor(`No se pudo descargar la imagen generada (HTTP ${r.status}).`, "Reintenta la generación.");
  return { buffer: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get("content-type") ?? "image/png" };
}

export async function guardar(ctx: ContextoMotor, bucket: Bucket, ruta: string, buffer: Buffer, tipo: string) {
  const { error } = await ctx.db.storage.from(bucket).upload(ruta, buffer, { contentType: tipo, upsert: true });
  if (error) throw new ErrorMotor(`No se pudo guardar el archivo en Storage (${error.message}).`, "Revisa que existan los buckets (migración) y reintenta.");
}

export async function leer(ctx: ContextoMotor, bucket: Bucket, ruta: string): Promise<Buffer> {
  const { data, error } = await ctx.db.storage.from(bucket).download(ruta);
  if (error || !data) throw new ErrorMotor(`No se pudo leer ${ruta} de Storage.`, "El archivo pudo haberse borrado.");
  return Buffer.from(await data.arrayBuffer());
}

export async function urlFirmada(ctx: ContextoMotor, bucket: Bucket, ruta: string, segundos = 3600) {
  const { data, error } = await ctx.db.storage.from(bucket).createSignedUrl(ruta, segundos);
  if (error || !data) throw new ErrorMotor(`No se pudo firmar la URL de ${ruta}.`, "Reintenta en unos segundos.");
  return data.signedUrl;
}

/** Dimensiones de un raster o SVG. */
export async function dimensiones(buffer: Buffer) {
  const m = await sharp(buffer).metadata();
  return { ancho: m.width ?? 0, alto: m.height ?? 0 };
}

export function extension(tipo: string) {
  if (tipo.includes("svg")) return "svg";
  if (tipo.includes("jpeg") || tipo.includes("jpg")) return "jpg";
  if (tipo.includes("webp")) return "webp";
  return "png";
}
