/**
 * Modelo de la composición de una cara (piezas.composicion). Todo en milímetros.
 * Origen (0,0) = esquina superior izquierda del pliego CON sangrado.
 * Compartido por el editor (react-konva) y el exportador (pdf-lib): funciones puras.
 */

export interface FormatoCara {
  ancho_mm: number;
  alto_mm: number;
  sangrado_mm: number;
  zona_segura_mm: number;
  dpi_objetivo: number;
  /** Zona reservada para el anillado (mm) y su lado en ESTA cara. */
  margen_anillado_mm?: number;
  lado_anillado?: "izquierdo" | "derecho" | null;
}

interface CapaBase {
  id: string;
  nombre: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  rotacion: number;
  opacidad: number;
  visible: boolean;
  bloqueada: boolean;
}

export interface OrigenImagen {
  /** "generaciones/…", "referencias/…" (bucket/ruta en Storage). */
  archivo: string;
  generacion_id?: string | null;
  referencia_id?: string | null;
  ancho_px: number;
  alto_px: number;
  /** image/png, image/svg+xml… */
  mime?: string | null;
}

export interface CapaImagen extends CapaBase {
  tipo: "imagen";
  imagen: OrigenImagen;
}

export interface Fuente {
  familia: string;
  peso: number;
  cursiva: boolean;
  /** Subida por el usuario: ruta en el bucket fuentes. */
  archivo?: string | null;
}

export interface CapaTexto extends CapaBase {
  tipo: "texto";
  texto: {
    contenido: string;
    fuente: Fuente;
    /** Tamaño en puntos tipográficos. */
    tamano_pt: number;
    color: string;
    alineacion: "left" | "center" | "right";
    interlineado: number;
    espaciado_mm: number;
    mayusculas: boolean;
  };
}

export interface CapaForma extends CapaBase {
  tipo: "forma";
  forma: { figura: "rect" | "elipse"; relleno: string | null; borde: string | null; grosor_mm: number; radio_mm: number };
}

export type Capa = CapaImagen | CapaTexto | CapaForma;

export interface Composicion {
  version: 1;
  fondo: string;
  capas: Capa[];
}

export const COMPOSICION_VACIA: Composicion = { version: 1, fondo: "#FFFFFF", capas: [] };

export const MM_POR_PT = 25.4 / 72;

export function tamanoPliego(f: FormatoCara) {
  return { ancho: f.ancho_mm + 2 * f.sangrado_mm, alto: f.alto_mm + 2 * f.sangrado_mm };
}

/** Resolución efectiva (dpi) de una imagen colocada. */
export function dpiEfectivo(c: CapaImagen) {
  if (!c.ancho || !c.imagen.ancho_px) return 0;
  const porAncho = c.imagen.ancho_px / (c.ancho / 25.4);
  const porAlto = c.imagen.alto_px / (c.alto / 25.4);
  return Math.floor(Math.min(porAncho, porAlto));
}

export function esVector(c: CapaImagen) {
  return (c.imagen.mime ?? "").includes("svg") || c.imagen.archivo.endsWith(".svg");
}

export function nuevoId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Texto con mayúsculas aplicadas. */
export function textoVisible(c: CapaTexto) {
  return c.texto.mayusculas ? c.texto.contenido.toUpperCase() : c.texto.contenido;
}

/**
 * Parte el texto en líneas igual que Konva (ajuste por palabras dentro del ancho).
 * `medir` devuelve el ancho en mm de una cadena.
 */
export function partirLineas(texto: string, anchoMax: number, medir: (s: string) => number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    if (medir(parrafo) <= anchoMax) {
      lineas.push(parrafo);
      continue;
    }
    let actual = "";
    for (const palabra of parrafo.split(" ")) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (medir(prueba) <= anchoMax || !actual) actual = prueba;
      else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}
