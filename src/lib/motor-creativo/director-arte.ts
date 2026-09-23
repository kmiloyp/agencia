/**
 * Director de arte: escribe prompts profesionales con la guía anti-IA y hace
 * el control de calidad (QC) de cada imagen con Claude visión.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { bloqueImagen, llamarEstructurado } from "./claude";
import type { ClaveCasoUso, ContextoMotor, ResultadoQC } from "./tipos";

const RUTA_GUIAS = path.join(process.cwd(), "src/lib/motor-creativo/guias");

export async function guiaAntiIA(): Promise<string> {
  try {
    return await readFile(path.join(RUTA_GUIAS, "anti-ia.md"), "utf-8");
  } catch {
    return "Escribe prompts profesionales, concretos y en inglés. Evita los clichés visuales de la IA.";
  }
}

export interface EncargoPrompt {
  casoUso: ClaveCasoUso;
  /** Qué debe mostrar la imagen, en español o inglés. */
  encargo: string;
  ruta?: { nombre: string; concepto: string; paleta: string[]; mood?: string | null; tipografias?: string[] };
  brief?: unknown;
  /** Ej.: "portada de cuaderno A5 vertical, proporción 148:210". */
  formato?: string;
  /** Resumen de referencias (gustos / rechazos). */
  referencias?: string;
  variacion?: string;
}

const EsquemaPrompt = z.object({
  prompt: z.string().describe("Prompt final en inglés, prosa concreta, 90–220 palabras."),
  notas: z.string().describe("Una frase en español explicando la decisión creativa."),
});

export async function escribirPrompt(ctx: ContextoMotor, e: EncargoPrompt, proyectoId?: string | null) {
  const guia = await guiaAntiIA();
  const sistema = `Eres el director de arte de una agencia de diseño de primer nivel. Escribes prompts para modelos de generación de imagen como lo haría un profesional del medio correspondiente (fotógrafo, ilustrador, diseñador).

${guia}`;
  const contenido = [
    `Caso de uso: ${e.casoUso}`,
    e.formato && `Formato: ${e.formato}`,
    `Encargo: ${e.encargo}`,
    e.ruta && `Ruta creativa: ${JSON.stringify(e.ruta)}`,
    e.brief ? `Brief: ${JSON.stringify(e.brief)}` : null,
    e.referencias && `Referencias del cliente: ${e.referencias}`,
    e.variacion && `Esta muestra debe explorar esta variación: ${e.variacion}`,
    e.casoUso === "texto_en_imagen" || e.casoUso === "mockup"
      ? "Aquí el texto dentro de la imagen sí se permite: conserva los textos reales entre comillas exactas y pide reproducir el logo adjunto sin redibujarlo."
      : "La imagen NO debe contener texto, letras, números, logos ni marcas de agua: los textos van después como capas reales. Deja espacio negativo intencional para título y marca.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return llamarEstructurado({ ctx, proyectoId, concepto: "Escritura de prompt", sistema, contenido, esquema: EsquemaPrompt, esfuerzo: "medium", maxTokens: 8000 });
}

const EsquemaQC = z.object({
  puntaje_calidad: z.number().describe("1–10"),
  apariencia_ia: z.number().describe("1 = indistinguible de trabajo humano, 10 = obviamente IA"),
  anatomia_ok: z.boolean(),
  texto_ok: z.boolean().describe("false si hay texto no pedido o mal escrito"),
  coherencia_brief: z.number().describe("1–10"),
  hallazgos: z.array(z.string()).describe("Problemas concretos, en español, máximo 6"),
  prompt_corregido: z.string().nullable().describe("Prompt en inglés que corrige los hallazgos, o null si la imagen está bien"),
});

export interface Umbrales {
  calidad: number;
  apariencia_ia: number;
}

export async function evaluarImagen(
  ctx: ContextoMotor,
  a: {
    imagen: Buffer;
    prompt: string;
    casoUso: ClaveCasoUso;
    criterios: string[];
    contexto?: string;
    umbrales: Umbrales;
    intento: number;
    proyectoId?: string | null;
    generacionId?: string | null;
  },
): Promise<ResultadoQC> {
  const guia = await guiaAntiIA();
  const sistema = `Eres el director de arte y control de calidad de una agencia exigente. Revisas imágenes generadas antes de que lleguen al cliente. Eres severo pero justo: detectas lo que delata a la IA.

Juzga la imagen por su propósito real, descrito en el contexto del encargo (por ejemplo, arte de fondo de una portada donde después se colocarán textos y logo reales). Los criterios del caso de uso son orientativos: no penalices que un arte de fondo no funcione como logotipo, ni que un vector plano no tenga textura de papel si no se pidió.

${guia}`;
  const texto = [
    `Caso de uso: ${a.casoUso}. Criterios: ${a.criterios.join("; ") || "calidad profesional"}.`,
    a.casoUso === "texto_en_imagen" || a.casoUso === "mockup" ? "En este caso el texto dentro de la imagen está permitido; revisa que esté bien escrito." : "La imagen NO debía llevar texto: cualquier texto o pseudo-letra es un hallazgo.",
    a.contexto && `Contexto del encargo: ${a.contexto}`,
    `Prompt usado:\n${a.prompt}`,
    "Evalúa la imagen adjunta.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await llamarEstructurado({
    ctx,
    proyectoId: a.proyectoId,
    generacionId: a.generacionId,
    concepto: "Control de calidad",
    sistema,
    contenido: [await bloqueImagen(a.imagen), { type: "text", text: texto }],
    esquema: EsquemaQC,
    esfuerzo: "medium",
    maxTokens: 8000,
  });
  const pasa =
    r.puntaje_calidad >= a.umbrales.calidad &&
    r.apariencia_ia <= a.umbrales.apariencia_ia &&
    r.anatomia_ok &&
    r.texto_ok;
  return { ...r, pasa, intento: a.intento };
}

const EsquemaEdicion = z.object({
  prompt: z.string().describe("Instrucción de edición en inglés, precisa, que diga qué cambiar y qué conservar idéntico"),
});

/** Traduce una instrucción en lenguaje natural ("fondo más cálido") a un prompt de edición. */
export async function escribirEdicion(ctx: ContextoMotor, instruccion: string, contexto: string, proyectoId?: string | null) {
  const guia = await guiaAntiIA();
  const r = await llamarEstructurado({
    ctx,
    proyectoId,
    concepto: "Instrucción de edición",
    sistema: `Eres director de arte. Conviertes pedidos de edición en instrucciones claras para un modelo de edición de imagen. Siempre pide conservar idénticos composición, estilo, paleta y todo lo no mencionado. No añadas texto a la imagen.\n\n${guia}`,
    contenido: `Contexto de la pieza: ${contexto}\n\nPedido de Camilo: ${instruccion}`,
    esquema: EsquemaEdicion,
    esfuerzo: "low",
    maxTokens: 4000,
  });
  return r.prompt;
}
