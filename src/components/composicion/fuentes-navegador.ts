"use client";
import type { Fuente } from "@/lib/composicion/tipos";

const cargadas = new Set<string>();

export function claveFuente(f: Fuente) {
  return `${f.archivo ?? f.familia}|${f.peso}|${f.cursiva}`;
}

/** Declaración CSS para Konva: "italic 700" + familia entre comillas. */
export function estiloKonva(f: Fuente) {
  return `${f.cursiva ? "italic " : ""}${f.peso}`;
}

/**
 * Carga una tipografía en el navegador. Google Fonts: un <link> por combinación
 * (si una combinación no existe, no rompe las demás). Subidas: FontFace con URL firmada.
 */
export async function cargarFuente(f: Fuente, urlSubida?: string): Promise<boolean> {
  const clave = claveFuente(f);
  if (cargadas.has(clave)) return true;
  try {
    if (f.archivo) {
      if (!urlSubida) return false;
      const cara = new FontFace(f.familia, `url(${urlSubida})`);
      document.fonts.add(await cara.load());
    } else {
      const eje = f.cursiva ? `ital,wght@1,${f.peso}` : `wght@${f.peso}`;
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.familia).replace(/%20/g, "+")}:${eje}&display=block`;
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
        await new Promise((ok) => { link.onload = ok; link.onerror = ok; });
      }
      await document.fonts.load(`${f.cursiva ? "italic " : ""}${f.peso} 24px "${f.familia}"`);
    }
    cargadas.add(clave);
    return document.fonts.check(`${f.cursiva ? "italic " : ""}${f.peso} 24px "${f.familia}"`);
  } catch {
    return false;
  }
}

export const FUENTES_SUGERIDAS = [
  "Space Grotesk", "IBM Plex Sans", "Inter", "Geist", "Jost", "Outfit", "Work Sans", "DM Sans", "Manrope",
  "Archivo", "Montserrat", "Poppins", "Plus Jakarta Sans", "Sora", "Fraunces", "Playfair Display", "Lora",
  "Libre Baskerville", "Cormorant Garamond", "EB Garamond", "Bebas Neue", "Oswald", "Anton",
];
