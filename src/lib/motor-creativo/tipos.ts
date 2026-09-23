/**
 * Tipos del motor creativo. Módulo independiente de la UI: lo reutilizará la
 * futura app de empaques. Nada aquí importa React ni Next.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CASOS_USO = [
  "fotorrealismo",
  "texto_en_imagen",
  "ilustracion",
  "personaje_consistente",
  "vector_logo",
  "edicion",
  "escalado",
  "borrador_rapido",
  "mockup",
] as const;
export type ClaveCasoUso = (typeof CASOS_USO)[number];

// ---------------------------------------------------------------------------
// Esquema de parámetros por modelo (vive en modelos.esquema_parametros)
// ---------------------------------------------------------------------------
export type EsquemaTamano =
  | {
      modo: "image_size";
      /** true si el endpoint acepta {width,height}; si no, se elige el preset más cercano. */
      personalizado: boolean;
      multiplo?: number;
      max_lado?: number;
      presets: string[];
    }
  | {
      modo: "aspect_ratio";
      valores: string[];
      resolucion?: { campo: string; valor: string };
    }
  | { modo: "ninguno" };

export interface EsquemaEndpoint {
  tamano: EsquemaTamano;
  referencias?: { campo: string; tipo: "lista" | "unica"; max: number };
  num_imagenes?: string | null;
  fijos?: Record<string, unknown>;
  salida: "images" | "image";
}

export interface EsquemaEscalado {
  imagen: string;
  factor: { campo: string; max: number };
  fijos?: Record<string, unknown>;
  variantes?: { campo: string } & Record<string, string>;
  salida: "images" | "image";
}

export type EsquemaCosto =
  | { modo: "por_imagen"; usd: number; multiplicador_resolucion?: Record<string, number>; estimado?: boolean }
  | { modo: "por_imagen_tramos"; tramos: { hasta_px: number; usd: number }[]; extra_por_referencia?: number }
  | { modo: "megapixel"; usd_por_mp: number }
  | { modo: "megapixel_escalonado"; primer_mp: number; mp_adicional: number }
  | { modo: "bloque_mp"; usd: number; mp_por_bloque: number };

export interface EsquemaParametros {
  t2i?: EsquemaEndpoint;
  edicion?: EsquemaEndpoint;
  escalado?: EsquemaEscalado;
  costo: EsquemaCosto;
}

export interface Modelo {
  id: string;
  proveedor: string;
  nombre: string;
  endpoint_fal: string | null;
  endpoint_fal_edicion: string | null;
  capacidades: string[];
  esquema_parametros: EsquemaParametros;
  estado: "activo" | "candidato" | "retirado";
}

// ---------------------------------------------------------------------------
// Solicitudes genéricas (independientes del modelo)
// ---------------------------------------------------------------------------
export interface ParametrosGenericos {
  /** Tamaño deseado en píxeles (el traductor lo ajusta a lo que el modelo acepte). */
  ancho_px: number;
  alto_px: number;
  /** URLs accesibles por fal (p. ej. URLs firmadas de Supabase). */
  imagenes_entrada?: string[];
  num_imagenes?: number;
  /** Solo escalado. */
  factor_escalado?: number;
  /** Solo escalado: "foto" | "ilustracion" | "texto". */
  tipo_contenido?: string;
}

export interface Traduccion {
  endpoint: string;
  entrada: Record<string, unknown>;
  /** Dimensiones esperadas de la salida (para estimar costo). */
  ancho_esperado: number;
  alto_esperado: number;
  salida: "images" | "image";
}

// ---------------------------------------------------------------------------
// QC
// ---------------------------------------------------------------------------
export interface ResultadoQC {
  puntaje_calidad: number; // 1–10
  apariencia_ia: number; // 1 = humano/real, 10 = obviamente IA
  anatomia_ok: boolean;
  texto_ok: boolean;
  coherencia_brief: number; // 1–10
  hallazgos: string[];
  prompt_corregido: string | null;
  pasa: boolean;
  simulado?: boolean;
  intento: number;
}

// ---------------------------------------------------------------------------
// Contexto de ejecución
// ---------------------------------------------------------------------------
export interface ConfigMotor {
  falKey: string;
  modoFal: "real" | "stub";
  /** URL completa del webhook, o null para usar sondeo. */
  webhookUrl: string | null;
  anthropicModel: string;
  anthropicFallbacks: boolean;
}

export interface ContextoMotor {
  /** Cliente de Supabase con permisos para las filas del dueño (admin o sesión). */
  db: SupabaseClient;
  ownerId: string;
  config: ConfigMotor;
}

export class ErrorMotor extends Error {
  constructor(
    mensaje: string,
    /** Qué puede hacer el usuario. */
    public readonly sugerencia?: string,
  ) {
    super(mensaje);
    this.name = "ErrorMotor";
  }
}
