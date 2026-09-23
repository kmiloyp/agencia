import type { FormatoCara } from "./tipos";

export interface FormatoPiezaBD {
  ancho_mm?: number;
  alto_mm?: number;
  sangrado_mm?: number;
  zona_segura_mm?: number;
  lomo_mm?: number;
  caras?: string[];
  dpi_objetivo?: number;
  encuadernacion?: string;
  margen_anillado_mm?: number;
  lado_anillado?: string;
}

/** Formato de una cara concreta. En la contraportada el anillado queda en espejo. */
export function formatoDeCara(f: FormatoPiezaBD | null | undefined, cara: string): FormatoCara {
  const base: FormatoCara = {
    ancho_mm: f?.ancho_mm ?? 148,
    alto_mm: f?.alto_mm ?? 210,
    sangrado_mm: f?.sangrado_mm ?? 3,
    zona_segura_mm: f?.zona_segura_mm ?? 5,
    dpi_objetivo: f?.dpi_objetivo ?? 300,
  };
  if (f?.encuadernacion === "anillado" && f.margen_anillado_mm) {
    const lado = f.lado_anillado === "derecho" ? "derecho" : "izquierdo";
    const espejo = /contra|trasera|posterior/i.test(cara);
    base.margen_anillado_mm = f.margen_anillado_mm;
    base.lado_anillado = espejo ? (lado === "izquierdo" ? "derecho" : "izquierdo") : lado;
  }
  return base;
}

export function carasDe(f: FormatoPiezaBD | null | undefined): string[] {
  return f?.caras?.length ? f.caras : ["única"];
}
