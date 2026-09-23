/**
 * Descarga de tipografías para incrustarlas en el PDF.
 * Google Fonts entrega TTF completos cuando el agente de usuario es simple (p. ej. Wget).
 */
import type { Fuente } from "./tipos";

const cache = new Map<string, Uint8Array>();

async function googleTTF(familia: string, peso: number, cursiva: boolean): Promise<Uint8Array | null> {
  const eje = cursiva ? `ital,wght@1,${peso}` : `wght@${peso}`;
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia).replace(/%20/g, "+")}:${eje}`, {
    headers: { "User-Agent": "Wget/1.21" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!css.ok) return null;
  const url = (await css.text()).match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

/**
 * Bytes TTF/OTF de una fuente. Intenta el peso pedido, luego 400 sin cursiva.
 * `leerSubida` lee una fuente subida por el usuario desde Storage.
 */
export async function bytesFuente(f: Fuente, leerSubida: (ruta: string) => Promise<Uint8Array>): Promise<{ bytes: Uint8Array | null; aviso?: string }> {
  const clave = `${f.archivo ?? f.familia}|${f.peso}|${f.cursiva}`;
  if (cache.has(clave)) return { bytes: cache.get(clave)! };
  if (f.archivo) {
    const bytes = await leerSubida(f.archivo);
    cache.set(clave, bytes);
    return { bytes };
  }
  const intentos: [number, boolean][] = [[f.peso, f.cursiva], [f.peso, false], [400, false]];
  for (const [peso, cursiva] of intentos) {
    const bytes = await googleTTF(f.familia, peso, cursiva).catch(() => null);
    if (bytes) {
      cache.set(clave, bytes);
      const aviso = peso !== f.peso || cursiva !== f.cursiva ? `${f.familia} ${f.peso}${f.cursiva ? " cursiva" : ""} no existe; se usó ${peso}${cursiva ? " cursiva" : ""}.` : undefined;
      return { bytes, aviso };
    }
  }
  return { bytes: null, aviso: `No se encontró la fuente "${f.familia}" en Google Fonts; se usó Helvetica.` };
}
