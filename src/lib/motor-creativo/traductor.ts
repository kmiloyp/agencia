/**
 * Traduce parámetros genéricos (tamaño, referencias, cantidad) al formato de
 * cada endpoint según modelos.esquema_parametros. Funciones puras: sin red ni DB.
 */
import {
  ErrorMotor,
  type EsquemaCosto,
  type EsquemaEndpoint,
  type EsquemaEscalado,
  type Modelo,
  type ParametrosGenericos,
  type Traduccion,
} from "./tipos";

/** Tamaños en píxeles de los presets estándar de fal. */
export const PRESETS_FAL: Record<string, [number, number]> = {
  square_hd: [1024, 1024],
  square: [512, 512],
  portrait_4_3: [768, 1024],
  portrait_16_9: [576, 1024],
  landscape_4_3: [1024, 768],
  landscape_16_9: [1024, 576],
};

const LADO_POR_RESOLUCION: Record<string, number> = { "0.5K": 512, "1K": 1024, "2K": 2048, "4K": 4096 };

function distanciaProporcion(a: number, b: number) {
  return Math.abs(Math.log(a) - Math.log(b));
}

function redondear(valor: number, multiplo: number) {
  return Math.max(multiplo, Math.round(valor / multiplo) * multiplo);
}

export function presetMasCercano(ancho: number, alto: number, presets: string[]) {
  const objetivo = ancho / alto;
  let mejor = presets[0];
  let mejorDist = Infinity;
  for (const p of presets) {
    const dims = PRESETS_FAL[p];
    if (!dims) continue;
    const d = distanciaProporcion(dims[0] / dims[1], objetivo);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = p;
    }
  }
  return mejor;
}

export function proporcionMasCercana(ancho: number, alto: number, valores: string[]) {
  const objetivo = ancho / alto;
  let mejor = valores[0];
  let mejorDist = Infinity;
  for (const v of valores) {
    const [a, b] = v.split(":").map(Number);
    if (!a || !b) continue; // ignora "auto"
    const d = distanciaProporcion(a / b, objetivo);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = v;
    }
  }
  return mejor;
}

function traducirTamano(esquema: EsquemaEndpoint, p: ParametrosGenericos) {
  const t = esquema.tamano;
  const entrada: Record<string, unknown> = {};
  let ancho = p.ancho_px;
  let alto = p.alto_px;

  if (t.modo === "image_size") {
    if (t.personalizado) {
      const max = t.max_lado ?? 2048;
      const escala = Math.min(1, max / Math.max(ancho, alto));
      const mult = t.multiplo ?? 16;
      ancho = redondear(ancho * escala, mult);
      alto = redondear(alto * escala, mult);
      entrada.image_size = { width: ancho, height: alto };
    } else {
      const preset = presetMasCercano(ancho, alto, t.presets);
      entrada.image_size = preset;
      [ancho, alto] = PRESETS_FAL[preset] ?? [ancho, alto];
    }
  } else if (t.modo === "aspect_ratio") {
    const ar = proporcionMasCercana(ancho, alto, t.valores);
    entrada.aspect_ratio = ar;
    const [a, b] = ar.split(":").map(Number);
    const lado = t.resolucion ? (LADO_POR_RESOLUCION[t.resolucion.valor] ?? 1024) : 1024;
    if (t.resolucion) entrada[t.resolucion.campo] = t.resolucion.valor;
    if (a >= b) {
      ancho = lado;
      alto = Math.round((lado * b) / a);
    } else {
      alto = lado;
      ancho = Math.round((lado * a) / b);
    }
  }
  return { entrada, ancho, alto };
}

/** Traducción para texto→imagen o edición/multi-referencia. */
export function traducirGeneracion(modelo: Modelo, prompt: string, p: ParametrosGenericos): Traduccion {
  const refs = p.imagenes_entrada ?? [];
  const usaEdicion = refs.length > 0;
  const esquema = usaEdicion ? modelo.esquema_parametros.edicion : modelo.esquema_parametros.t2i;
  const endpoint = usaEdicion ? modelo.endpoint_fal_edicion : modelo.endpoint_fal;

  if (!esquema || !endpoint) {
    throw new ErrorMotor(
      `El modelo ${modelo.nombre} no admite ${usaEdicion ? "imágenes de entrada (edición)" : "texto→imagen"}.`,
      "Cambia la asignación de este caso de uso en /modelos o usa otro modelo.",
    );
  }

  const { entrada: tam, ancho, alto } = traducirTamano(esquema, p);
  const entrada: Record<string, unknown> = { ...(esquema.fijos ?? {}), ...tam, prompt };

  if (usaEdicion && esquema.referencias) {
    const r = esquema.referencias;
    if (refs.length > r.max) {
      throw new ErrorMotor(
        `${modelo.nombre} acepta máximo ${r.max} imágenes de referencia y se enviaron ${refs.length}.`,
        "Quita algunas referencias o cambia de modelo.",
      );
    }
    entrada[r.campo] = r.tipo === "lista" ? refs : refs[0];
  }

  const n = p.num_imagenes ?? 1;
  if (n > 1) {
    if (!esquema.num_imagenes) {
      throw new ErrorMotor(`${modelo.nombre} genera una imagen por llamada.`, "El motor debe hacer una llamada por imagen.");
    }
    entrada[esquema.num_imagenes] = n;
  }

  return { endpoint, entrada, ancho_esperado: ancho, alto_esperado: alto, salida: esquema.salida };
}

/** Traducción para escalado. */
export function traducirEscalado(modelo: Modelo, urlImagen: string, p: ParametrosGenericos): Traduccion {
  const esquema: EsquemaEscalado | undefined = modelo.esquema_parametros.escalado;
  if (!esquema || !modelo.endpoint_fal) {
    throw new ErrorMotor(`El modelo ${modelo.nombre} no sirve para escalar.`, "Revisa la asignación de 'escalado' en /modelos.");
  }
  const factor = Math.min(esquema.factor.max, Math.max(1, p.factor_escalado ?? 2));
  const entrada: Record<string, unknown> = {
    ...(esquema.fijos ?? {}),
    [esquema.imagen]: urlImagen,
    [esquema.factor.campo]: factor,
  };
  if (esquema.variantes && p.tipo_contenido && esquema.variantes[p.tipo_contenido]) {
    entrada[esquema.variantes.campo] = esquema.variantes[p.tipo_contenido];
  }
  return {
    endpoint: modelo.endpoint_fal,
    entrada,
    ancho_esperado: Math.round(p.ancho_px * factor),
    alto_esperado: Math.round(p.alto_px * factor),
    salida: esquema.salida,
  };
}

/** Costo estimado en USD de UNA imagen de salida. */
export function estimarCostoImagen(
  costo: EsquemaCosto,
  ancho: number,
  alto: number,
  opciones: { resolucion?: string; referencias?: number } = {},
): number {
  const mp = (ancho * alto) / 1_000_000;
  switch (costo.modo) {
    case "por_imagen": {
      const mult = (opciones.resolucion && costo.multiplicador_resolucion?.[opciones.resolucion]) || 1;
      return costo.usd * mult;
    }
    case "por_imagen_tramos": {
      const px = ancho * alto;
      const tramo = costo.tramos.find((t) => px <= t.hasta_px) ?? costo.tramos[costo.tramos.length - 1];
      const extra = Math.max(0, (opciones.referencias ?? 0) - 1) * (costo.extra_por_referencia ?? 0);
      return tramo.usd + extra;
    }
    case "megapixel":
      return Math.max(1, Math.ceil(mp)) * costo.usd_por_mp;
    case "megapixel_escalonado":
      return costo.primer_mp + Math.max(0, Math.ceil(mp) - 1) * costo.mp_adicional;
    case "bloque_mp":
      return Math.max(1, Math.ceil(mp / costo.mp_por_bloque)) * costo.usd;
  }
}

/** Estimado del costo de una traducción concreta (n imágenes). */
export function estimarCostoTraduccion(modelo: Modelo, t: Traduccion, n = 1): number {
  const resolucion = typeof t.entrada.resolution === "string" ? t.entrada.resolution : undefined;
  const refs = Array.isArray(t.entrada.image_urls) ? t.entrada.image_urls.length : 0;
  return estimarCostoImagen(modelo.esquema_parametros.costo, t.ancho_esperado, t.alto_esperado, { resolucion, referencias: refs }) * n;
}
