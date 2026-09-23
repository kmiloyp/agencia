/**
 * PDF de impresión (RGB). Una página por cara: tamaño final + sangrado, con
 * TrimBox/BleedBox, marcas de corte opcionales, imágenes a la resolución
 * objetivo y texto vectorial con la fuente incrustada.
 * La geometría replica a Konva: origen arriba-izquierda, rotación horaria
 * alrededor de la esquina superior izquierda de cada capa.
 */
import fontkit from "@pdf-lib/fontkit";
import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
  StandardFonts,
} from "pdf-lib";
import sharp from "sharp";
import { bytesFuente } from "./fuentes-servidor";
import {
  type CapaForma,
  type CapaImagen,
  type CapaTexto,
  type Composicion,
  dpiEfectivo,
  esVector,
  type FormatoCara,
  MM_POR_PT,
  partirLineas,
  tamanoPliego,
  textoVisible,
} from "./tipos";

const PT_POR_MM = 72 / 25.4;
const MARGEN_MARCAS_MM = 9;

export interface CaraExportable {
  cara: string;
  formato: FormatoCara;
  composicion: Composicion;
}

export interface DependenciasPDF {
  /** Lee "bucket/ruta" de Storage. */
  leer: (archivo: string) => Promise<Buffer>;
  /** Archivo escalado que reemplaza a otro (si existe). */
  reemplazo: (archivo: string) => string | undefined;
}

export interface ResultadoPDF {
  bytes: Uint8Array;
  avisos: string[];
  imagenes: { cara: string; capa: string; dpi: number }[];
}

function color(hex: string | null | undefined) {
  const h = (hex ?? "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Convierte coordenadas locales de una capa (mm, y hacia abajo) a puntos PDF. */
function transformador(page: PDFPage, margen: number, capa: { x: number; y: number; rotacion: number }) {
  const t = (capa.rotacion * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const alto = page.getHeight();
  return (lx: number, ly: number) => {
    const gx = capa.x + lx * cos - ly * sin;
    const gy = capa.y + lx * sin + ly * cos;
    return { x: (margen + gx) * PT_POR_MM, y: alto - (margen + gy) * PT_POR_MM };
  };
}

async function prepararImagen(buffer: Buffer, capa: CapaImagen, dpi: number) {
  const objetivoAncho = Math.max(1, Math.round((capa.ancho / 25.4) * dpi));
  const objetivoAlto = Math.max(1, Math.round((capa.alto / 25.4) * dpi));
  let img = sharp(buffer, esVector(capa) ? { density: 72 } : {});
  const meta = await img.metadata();
  if (esVector(capa) && meta.width) {
    // Rasteriza el SVG con la densidad justa para llegar a la resolución objetivo.
    const densidad = Math.min(2400, Math.ceil((72 * objetivoAncho) / meta.width));
    img = sharp(buffer, { density: densidad });
  }
  // Nunca se amplía aquí (eso lo hace el modelo de escalado): solo se reduce si sobra.
  img = img.rotate().resize({ width: objetivoAncho, height: objetivoAlto, fit: "fill", withoutEnlargement: true });
  const conAlfa = (await sharp(buffer).metadata()).hasAlpha || esVector(capa);
  return conAlfa
    ? { tipo: "png" as const, bytes: await img.png({ compressionLevel: 8 }).toBuffer() }
    : { tipo: "jpg" as const, bytes: await img.flatten({ background: "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer() };
}

interface FuenteLista {
  pdf: PDFFont;
  ascenso: number; // fracción del em
  descenso: number; // fracción positiva del em
}

export async function exportarPDF(caras: CaraExportable[], dep: DependenciasPDF, opciones: { marcas: boolean; titulo: string }): Promise<ResultadoPDF> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(opciones.titulo);
  doc.setProducer("Agencia");
  doc.setCreator("Agencia · pdf-lib");
  const avisos: string[] = [];
  const reporte: ResultadoPDF["imagenes"] = [];
  const fuentes = new Map<string, FuenteLista>();

  async function fuente(c: CapaTexto): Promise<FuenteLista> {
    const f = c.texto.fuente;
    const clave = `${f.archivo ?? f.familia}|${f.peso}|${f.cursiva}`;
    if (fuentes.has(clave)) return fuentes.get(clave)!;
    const { bytes, aviso } = await bytesFuente(f, async (ruta) => new Uint8Array(await dep.leer(`fuentes/${ruta}`)));
    if (aviso && !avisos.includes(aviso)) avisos.push(aviso);
    let lista: FuenteLista;
    if (bytes) {
      const meta = fontkit.create(bytes as unknown as Buffer) as unknown as { ascent: number; descent: number; unitsPerEm: number };
      lista = { pdf: await doc.embedFont(bytes, { subset: true }), ascenso: meta.ascent / meta.unitsPerEm, descenso: Math.abs(meta.descent) / meta.unitsPerEm };
    } else {
      lista = { pdf: await doc.embedFont(StandardFonts.Helvetica), ascenso: 0.77, descenso: 0.23 };
    }
    fuentes.set(clave, lista);
    return lista;
  }

  for (const { cara, formato, composicion } of caras) {
    const pliego = tamanoPliego(formato);
    const m = opciones.marcas ? MARGEN_MARCAS_MM : 0;
    const page = doc.addPage([(pliego.ancho + 2 * m) * PT_POR_MM, (pliego.alto + 2 * m) * PT_POR_MM]);
    const H = page.getHeight();
    const caja = (x: number, y: number, w: number, h: number) => ({ x: x * PT_POR_MM, y: H - (y + h) * PT_POR_MM, width: w * PT_POR_MM, height: h * PT_POR_MM });
    const bleed = caja(m, m, pliego.ancho, pliego.alto);
    const trim = caja(m + formato.sangrado_mm, m + formato.sangrado_mm, formato.ancho_mm, formato.alto_mm);
    page.setBleedBox(bleed.x, bleed.y, bleed.width, bleed.height);
    page.setTrimBox(trim.x, trim.y, trim.width, trim.height);

    // Todo el contenido queda recortado al pliego (no invade las marcas).
    page.pushOperators(pushGraphicsState(), rectangle(bleed.x, bleed.y, bleed.width, bleed.height), clip(), endPath());
    page.drawRectangle({ ...bleed, color: color(composicion.fondo) });

    for (const capa of composicion.capas) {
      if (!capa.visible) continue;
      const aPDF = transformador(page, m, capa);
      const rot = degrees(-capa.rotacion);

      if (capa.tipo === "imagen") {
        const archivo = dep.reemplazo(capa.imagen.archivo) ?? capa.imagen.archivo;
        try {
          const original = await dep.leer(archivo);
          const meta = await sharp(original).metadata();
          const efectiva: CapaImagen = { ...capa, imagen: { ...capa.imagen, archivo, ancho_px: meta.width ?? capa.imagen.ancho_px, alto_px: meta.height ?? capa.imagen.alto_px } };
          const dpi = esVector(efectiva) ? formato.dpi_objetivo : dpiEfectivo(efectiva);
          reporte.push({ cara, capa: capa.nombre, dpi });
          if (dpi < formato.dpi_objetivo * 0.95) avisos.push(`${cara}: "${capa.nombre}" queda a ${dpi} dpi (objetivo ${formato.dpi_objetivo}).`);
          const { tipo, bytes } = await prepararImagen(original, efectiva, formato.dpi_objetivo);
          const img = tipo === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const p = aPDF(0, capa.alto);
          page.drawImage(img, { x: p.x, y: p.y, width: capa.ancho * PT_POR_MM, height: capa.alto * PT_POR_MM, rotate: rot, opacity: capa.opacidad });
        } catch (e) {
          avisos.push(`${cara}: no se pudo incluir "${capa.nombre}" (${e instanceof Error ? e.message : String(e)}).`);
        }
      } else if (capa.tipo === "texto") {
        await dibujarTexto(page, capa, aPDF, rot, await fuente(capa));
      } else {
        dibujarForma(page, capa, aPDF, rot);
      }
    }
    page.pushOperators(popGraphicsState());

    if (opciones.marcas) dibujarMarcas(page, m, formato);
  }

  return { bytes: await doc.save(), avisos, imagenes: reporte };
}

async function dibujarTexto(page: PDFPage, c: CapaTexto, aPDF: ReturnType<typeof transformador>, rot: ReturnType<typeof degrees>, f: FuenteLista) {
  const t = c.texto;
  const tamanoMm = t.tamano_pt * MM_POR_PT;
  const lh = tamanoMm * t.interlineado;
  const texto = textoVisible(c);
  const seguro = (s: string) => {
    try {
      f.pdf.encodeText(s);
      return s;
    } catch {
      return s.replace(/[^\x20-\x7E -ÿ]/g, "?");
    }
  };
  const medir = (s: string) => (f.pdf.widthOfTextAtSize(seguro(s), t.tamano_pt) / PT_POR_MM) + t.espaciado_mm * s.length;
  const lineas = partirLineas(texto, c.ancho, medir);
  // Línea base igual que Konva 10: (ascenso − descenso)/2 + interlineado/2 desde arriba.
  const primeraBase = ((f.ascenso - f.descenso) / 2) * tamanoMm + lh / 2;
  const espaciadoPt = t.espaciado_mm * PT_POR_MM;
  if (espaciadoPt) page.pushOperators(setCharacterSpacing(espaciadoPt));
  lineas.forEach((linea, i) => {
    const ancho = medir(linea);
    const lx = t.alineacion === "center" ? (c.ancho - ancho) / 2 : t.alineacion === "right" ? c.ancho - ancho : 0;
    const p = aPDF(lx, primeraBase + i * lh);
    page.drawText(seguro(linea), { x: p.x, y: p.y, size: t.tamano_pt, font: f.pdf, color: color(t.color), rotate: rot, opacity: c.opacidad });
  });
  if (espaciadoPt) page.pushOperators(setCharacterSpacing(0));
}

function dibujarForma(page: PDFPage, c: CapaForma, aPDF: ReturnType<typeof transformador>, rot: ReturnType<typeof degrees>) {
  const f = c.forma;
  const estilo = {
    color: f.relleno ? color(f.relleno) : undefined,
    borderColor: f.borde ? color(f.borde) : undefined,
    borderWidth: f.borde ? f.grosor_mm * PT_POR_MM : 0,
    opacity: c.opacidad,
    borderOpacity: c.opacidad,
  };
  if (f.figura === "elipse") {
    const centro = aPDF(c.ancho / 2, c.alto / 2);
    page.drawEllipse({ x: centro.x, y: centro.y, xScale: (c.ancho / 2) * PT_POR_MM, yScale: (c.alto / 2) * PT_POR_MM, rotate: rot, ...estilo });
    return;
  }
  if (f.radio_mm > 0) {
    const k = PT_POR_MM;
    const w = c.ancho * k, h = c.alto * k, r = Math.min(f.radio_mm * k, w / 2, h / 2);
    const ruta = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    const origen = aPDF(0, 0);
    page.drawSvgPath(ruta, { x: origen.x, y: origen.y, rotate: rot, ...estilo });
    return;
  }
  const p = aPDF(0, c.alto);
  page.drawRectangle({ x: p.x, y: p.y, width: c.ancho * PT_POR_MM, height: c.alto * PT_POR_MM, rotate: rot, ...estilo });
}

/** Marcas de corte en las esquinas del corte final, por fuera del sangrado. */
function dibujarMarcas(page: PDFPage, m: number, f: FormatoCara) {
  const H = page.getHeight();
  const k = PT_POR_MM;
  const separacion = f.sangrado_mm + 2;
  const largo = 5;
  const x0 = m + f.sangrado_mm, y0 = m + f.sangrado_mm, x1 = x0 + f.ancho_mm, y1 = y0 + f.alto_mm;
  const linea = (ax: number, ay: number, bx: number, by: number) =>
    page.drawLine({ start: { x: ax * k, y: H - ay * k }, end: { x: bx * k, y: H - by * k }, thickness: 0.25, color: rgb(0, 0, 0) });
  for (const [x, dx] of [[x0, -1], [x1, 1]] as const) {
    for (const [y, dy] of [[y0, -1], [y1, 1]] as const) {
      linea(x + dx * separacion, y, x + dx * (separacion + largo), y);
      linea(x, y + dy * separacion, x, y + dy * (separacion + largo));
    }
  }
}
