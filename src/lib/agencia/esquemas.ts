/**
 * Esquemas Zod de las respuestas estructuradas de Claude en la agencia.
 */
import { z } from "zod";

export const EsquemaBrief = z.object({
  tipo_pieza: z.string(),
  cliente: z.string(),
  publico: z.string(),
  proposito: z.string(),
  mensaje: z.string(),
  textos_obligatorios: z.array(z.string()),
  caras: z.array(z.string()),
  formato: z.object({
    ancho_mm: z.number(),
    alto_mm: z.number(),
    sangrado_mm: z.number(),
    lomo_mm: z.number(),
  }),
  le_gusta: z.array(z.string()),
  no_le_gusta: z.array(z.string()),
  restricciones: z.array(z.string()),
  fecha: z.string().nullable(),
  notas: z.string().nullable(),
});
export type Brief = z.infer<typeof EsquemaBrief>;

export const EsquemaTipoNuevo = z.object({
  clave: z.string().describe("snake_case, sin tildes"),
  nombre: z.string(),
  descripcion: z.string(),
  ancho_mm: z.number(),
  alto_mm: z.number(),
  sangrado_mm: z.number(),
  lomo_mm: z.number(),
  caras: z.array(z.string()),
  preguntas: z.array(z.string()),
});
export type TipoNuevo = z.infer<typeof EsquemaTipoNuevo>;

export const EsquemaTurnoRecepcion = z.object({
  respuesta: z.string().describe("Lo que dice el ejecutivo de cuenta, en español, breve y cálido. Una pregunta o un grupo corto de preguntas."),
  tipo_pieza_clave: z.string().nullable().describe("Clave de una plantilla existente si ya se identificó."),
  propuesta_tipo_nuevo: EsquemaTipoNuevo.nullable().describe("Solo si ninguna plantilla sirve."),
  titulo_proyecto: z.string().nullable().describe("Título corto del proyecto cuando se pueda inferir."),
  cliente_nombre: z.string().nullable(),
  pedir_referencias: z.boolean().describe("true cuando sea buen momento para pedir referencias visuales."),
  brief: EsquemaBrief.nullable().describe("Brief completo SOLO cuando ya hay información suficiente; si no, null."),
});
export type TurnoRecepcion = z.infer<typeof EsquemaTurnoRecepcion>;

export const EsquemaAnalisisReferencia = z.object({
  resumen: z.string().describe("Una o dos frases."),
  paleta: z.array(z.string()).describe("3–6 colores hex dominantes, p. ej. #2F3E2E"),
  estilo: z.string(),
  composicion: z.string(),
  tecnica: z.string(),
  tipografia: z.string().nullable(),
  que_tomar: z.array(z.string()),
  que_evitar: z.array(z.string()),
});
export type AnalisisReferencia = z.infer<typeof EsquemaAnalisisReferencia>;

export const CASOS_USO_RUTA = ["ilustracion", "fotorrealismo", "texto_en_imagen", "vector_logo", "borrador_rapido"] as const;

export const EsquemaRutas = z.object({
  rutas: z
    .array(
      z.object({
        nombre: z.string(),
        concepto: z.string().describe("Dos frases."),
        paleta: z.array(z.string()).describe("4–5 colores hex"),
        tipografias: z.array(z.string()).describe("2 familias de Google Fonts: titular y texto"),
        mood: z.string(),
        caso_uso: z.enum(CASOS_USO_RUTA),
        por_que_encaja: z.string(),
        prompts: z.array(z.string()).describe("Exactamente 2 prompts en inglés, uno por muestra, explorando dos ejecuciones de la misma ruta"),
      }),
    )
    .describe("Exactamente 3 rutas realmente distintas entre sí"),
});
export type RutasPropuestas = z.infer<typeof EsquemaRutas>;
