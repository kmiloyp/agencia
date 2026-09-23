/**
 * Proveedor stub: produce imágenes de ejemplo locales, sin costo, para
 * desarrollar la UI sin tocar fal.ai (FAL_MODO=stub o sin FAL_KEY).
 */
import sharp from "sharp";

const ESPERA_MS = 2500;

export function esStub(requestId: string | null | undefined) {
  return !!requestId?.startsWith("stub_");
}

export function enviar(): string {
  return `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Simula la cola: lista tras unos segundos. */
export function listo(requestId: string): boolean {
  const t = Number(requestId.split("_")[1]);
  return Date.now() - t > ESPERA_MS;
}

function escapar(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function imagen(opciones: { ancho: number; alto: number; paleta?: string[]; titulo: string; subtitulo: string }) {
  const { ancho, alto } = opciones;
  const [c1, c2, c3] = [...(opciones.paleta ?? []), "#3a3a3a", "#8a8a8a", "#d8d2c8"].slice(0, 3);
  const f = Math.round(Math.min(ancho, alto) / 18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="0.6" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${ancho * 0.7}" cy="${alto * 0.35}" r="${Math.min(ancho, alto) * 0.22}" fill="${c3}" opacity="0.35"/>
    <rect x="${ancho * 0.08}" y="${alto * 0.6}" width="${ancho * 0.5}" height="${alto * 0.02}" fill="#fff" opacity="0.6"/>
    <text x="${ancho * 0.08}" y="${alto * 0.72}" font-family="Helvetica, Arial" font-size="${f}" fill="#fff" font-weight="700">${escapar(opciones.titulo)}</text>
    <text x="${ancho * 0.08}" y="${alto * 0.72 + f * 1.4}" font-family="Helvetica, Arial" font-size="${f * 0.55}" fill="#fff" opacity="0.8">${escapar(opciones.subtitulo)}</text>
    <text x="${ancho * 0.08}" y="${alto * 0.94}" font-family="Helvetica, Arial" font-size="${f * 0.45}" fill="#fff" opacity="0.7">IMAGEN DE EJEMPLO · MODO STUB · SIN COSTO</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
