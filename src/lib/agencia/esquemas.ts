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

/** Palancas creativas: cada ruta debe apoyarse en una distinta. */
export const PALANCAS = {
  oficio_del_cliente: "Metáfora tomada del proceso, la maquinaria o los materiales del negocio del cliente",
  tipografica: "La tipografía es la imagen: letra monumental, recortada o compuesta como forma",
  sistema_grafico: "Un patrón, retícula o módulo repetido que se vuelve identidad",
  fotografia_de_material: "Fotografía real (macro, bodegón, textura) de un material u objeto",
  dibujo_tecnico: "Lenguaje de plano, diagrama, ficha técnica o infografía",
  bloque_de_color: "Composición de planos de color plano, contraste fuerte, sin efectos",
  ilustracion_de_autor: "Ilustración con técnica humana concreta (grabado, gouache, risografía, collage)",
  acabado_tactil: "La idea vive en el acabado: troquel, ventana, relieve, barniz, hot stamping",
  prestamo_de_otra_industria: "Toma el código visual de otra disciplina (mapas, partituras, etiquetas de laboratorio, boletos)",
  narrativa: "Cuenta una pequeña historia o escena en la que el cliente aparece de forma indirecta",
} as const;
export type Palanca = keyof typeof PALANCAS;
const CLAVES_PALANCA = Object.keys(PALANCAS) as [Palanca, ...Palanca[]];

const EsquemaRuta = z.object({
  nombre: z.string().describe("Nombre corto y evocador, en español"),
  palanca: z.enum(CLAVES_PALANCA),
  metafora: z.string().describe("De qué parte del oficio del cliente sale la idea, en una frase"),
  concepto: z.string().describe("Dos frases en español"),
  evita: z.string().describe("Qué cliché o qué elemento de lo ya visto evita esta ruta, en una frase"),
  paleta: z.array(z.string()).describe("3–5 colores hex"),
  tipografias: z.array(z.string()).describe("2 familias de Google Fonts: titular y texto"),
  mood: z.string(),
  por_que_encaja: z.string(),
  caso_uso: z.enum(CASOS_USO_RUTA).describe("Cómo se produciría el arte final sin texto"),
  prompt_mockup: z.string().describe("Prompt en inglés, 120–220 palabras, para generar la propuesta completa (todas las caras) con logo adjunto y textos reales"),
  prompt_arte: z.string().describe("Prompt en inglés para el arte de fondo SIN textos ni logo, para producción"),
});

export const EsquemaRutas = z.object({
  rutas: z.array(EsquemaRuta).describe("Rutas realmente distintas entre sí, cada una con una palanca diferente"),
});
export type RutasPropuestas = z.infer<typeof EsquemaRutas>;
export type RutaPropuesta = z.infer<typeof EsquemaRuta>;
