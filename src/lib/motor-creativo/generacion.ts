/**
 * Ciclo de vida de una generación (una fila = una imagen):
 *   en_cola → generando → qc → lista | rechazada_qc | fallida
 * - Si el campeón falla, se reintenta con el respaldo del caso de uso.
 * - El resultado de fal se descarga y guarda en Storage de inmediato.
 * - QC con Claude visión; si no pasa, se regenera con el prompt corregido
 *   (máximo `qc_max_reintentos`).
 * Idempotente: el webhook y el sondeo pueden llegar a la vez sin duplicar trabajo.
 */
import { descargar, dimensiones, extension, guardar, urlFirmada, type Bucket } from "./almacenamiento";
import { registrarMovimiento } from "./costos";
import { evaluarImagen } from "./director-arte";
import * as fal from "./proveedores/fal";
import * as stub from "./proveedores/stub";
import { obtenerModelo, planificar, planificarCon, resolverAsignacion, type Plan } from "./router";
import { ErrorMotor, type ClaveCasoUso, type ContextoMotor, type ParametrosGenericos, type ResultadoQC } from "./tipos";

export interface ArchivoRef {
  bucket: Bucket;
  ruta: string;
}

export interface SolicitudGeneracion {
  proyectoId: string | null;
  rutaId?: string | null;
  parentId?: string | null;
  casoUso: ClaveCasoUso;
  prompt: string;
  parametros: Omit<ParametrosGenericos, "imagenes_entrada">;
  imagenesEntrada?: ArchivoRef[];
  /** Modelo elegido a mano (sin respaldo automático). */
  modeloId?: string;
  /** Solo para el stub y el QC. */
  paleta?: string[];
  contextoQC?: string;
}

export interface FilaGeneracion {
  id: string;
  owner_id: string;
  proyecto_id: string | null;
  ruta_id: string | null;
  caso_uso: ClaveCasoUso;
  modelo_id: string;
  endpoint: string;
  uso_respaldo: boolean;
  prompt: string;
  parametros: ParametrosGenericos & { paleta?: string[]; contexto_qc?: string; modelo_manual?: boolean; salida?: "images" | "image" };
  imagenes_entrada: string[];
  fal_request_id: string | null;
  estado: string;
  costo_usd: number;
  qc: (ResultadoQC & { historial?: unknown[] }) | null;
  intentos: number;
  archivo: string | null;
  aviso: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function refATexto(r: ArchivoRef) {
  return `${r.bucket}/${r.ruta}`;
}
function textoARef(s: string): ArchivoRef {
  const i = s.indexOf("/");
  return { bucket: s.slice(0, i) as Bucket, ruta: s.slice(i + 1) };
}

async function firmarEntradas(ctx: ContextoMotor, refs: string[]) {
  return Promise.all(refs.map((r) => {
    const { bucket, ruta } = textoARef(r);
    return urlFirmada(ctx, bucket, ruta, 3 * 3600);
  }));
}

async function ajustes(ctx: ContextoMotor) {
  const { data } = await ctx.db.from("ajustes").select("valores").eq("owner_id", ctx.ownerId).maybeSingle();
  const v = (data?.valores ?? {}) as Record<string, number>;
  return {
    calidad: v.qc_umbral_calidad ?? 7,
    apariencia_ia: v.qc_umbral_apariencia_ia ?? 4,
    maxReintentos: v.qc_max_reintentos ?? 2,
  };
}

async function actualizar(ctx: ContextoMotor, id: string, cambios: Record<string, unknown>) {
  const { error } = await ctx.db.from("generaciones").update(cambios).eq("id", id).eq("owner_id", ctx.ownerId);
  if (error) console.error("[motor] no se pudo actualizar la generación", id, error.message);
}

async function obtenerFila(ctx: ContextoMotor, id: string): Promise<FilaGeneracion | null> {
  const { data } = await ctx.db.from("generaciones").select("*").eq("id", id).eq("owner_id", ctx.ownerId).maybeSingle();
  return data as FilaGeneracion | null;
}

async function enviarPlan(ctx: ContextoMotor, plan: Plan): Promise<string> {
  if (ctx.config.modoFal === "stub") return stub.enviar();
  return fal.enviar(ctx.config, plan.traduccion.endpoint, plan.traduccion.entrada);
}

// ---------------------------------------------------------------------------
// Estimación (para mostrar antes de un lote)
// ---------------------------------------------------------------------------
export async function estimarSolicitud(ctx: ContextoMotor, s: SolicitudGeneracion): Promise<number> {
  const falsas = (s.imagenesEntrada ?? []).map(() => "https://ejemplo.invalid/ref.png");
  const plan = await planificar(ctx, s.casoUso, s.prompt, { ...s.parametros, imagenes_entrada: falsas }, { modeloId: s.modeloId });
  return plan.costo_estimado_usd;
}

// ---------------------------------------------------------------------------
// Crear y enviar
// ---------------------------------------------------------------------------
export async function crearGeneracion(ctx: ContextoMotor, s: SolicitudGeneracion): Promise<FilaGeneracion> {
  const refs = (s.imagenesEntrada ?? []).map(refATexto);
  const urls = await firmarEntradas(ctx, refs);
  const parametros: ParametrosGenericos = { ...s.parametros, imagenes_entrada: urls };
  const plan = await planificar(ctx, s.casoUso, s.prompt, parametros, { modeloId: s.modeloId });

  const { data, error } = await ctx.db
    .from("generaciones")
    .insert({
      owner_id: ctx.ownerId,
      proyecto_id: s.proyectoId,
      ruta_id: s.rutaId ?? null,
      parent_id: s.parentId ?? null,
      caso_uso: s.casoUso,
      modelo_id: plan.modelo.id,
      endpoint: plan.traduccion.endpoint,
      prompt: s.prompt,
      parametros: {
        ...s.parametros,
        paleta: s.paleta,
        contexto_qc: s.contextoQC,
        modelo_manual: !!s.modeloId,
        salida: plan.traduccion.salida,
      },
      entrada_fal: { ...plan.traduccion.entrada, ...(urls.length ? { _nota: "URLs de entrada firmadas por 3 h" } : {}) },
      imagenes_entrada: refs,
      estado: "en_cola",
      costo_usd: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new ErrorMotor(`No se pudo registrar la generación (${error?.message}).`, "Reintenta.");
  const fila = data as FilaGeneracion;

  try {
    const requestId = await enviarPlan(ctx, plan);
    await actualizar(ctx, fila.id, { fal_request_id: requestId });
    return { ...fila, fal_request_id: requestId };
  } catch (e) {
    await manejarFallo(ctx, fila.id, e instanceof Error ? e.message : String(e));
    return (await obtenerFila(ctx, fila.id)) ?? fila;
  }
}

// ---------------------------------------------------------------------------
// Fallo → respaldo
// ---------------------------------------------------------------------------
export async function manejarFallo(ctx: ContextoMotor, generacionId: string, mensaje: string) {
  const fila = await obtenerFila(ctx, generacionId);
  if (!fila || ["lista", "rechazada_qc", "fallida"].includes(fila.estado)) return;

  if (!fila.uso_respaldo && !fila.parametros.modelo_manual) {
    const { campeon, respaldo } = await resolverAsignacion(ctx, fila.caso_uso).catch(() => ({ campeon: null, respaldo: null }));
    if (respaldo && respaldo.id !== fila.modelo_id) {
      try {
        const urls = await firmarEntradas(ctx, fila.imagenes_entrada);
        const plan = planificarCon(respaldo, fila.caso_uso, fila.prompt, { ...fila.parametros, imagenes_entrada: urls });
        const requestId = await enviarPlan(ctx, plan);
        await actualizar(ctx, fila.id, {
          modelo_id: respaldo.id,
          endpoint: plan.traduccion.endpoint,
          entrada_fal: plan.traduccion.entrada,
          fal_request_id: requestId,
          uso_respaldo: true,
          estado: "en_cola",
          aviso: `${campeon?.nombre ?? "El modelo campeón"} falló (${mensaje}). Se usó el respaldo ${respaldo.nombre}.`,
        });
        return;
      } catch (e2) {
        mensaje = `${mensaje} · El respaldo también falló: ${e2 instanceof Error ? e2.message : String(e2)}`;
      }
    }
  }
  await actualizar(ctx, fila.id, { estado: "fallida", error: mensaje });
}

// ---------------------------------------------------------------------------
// Completada → Storage → QC → lista / regenerar
// ---------------------------------------------------------------------------
export async function procesarCompletada(ctx: ContextoMotor, generacionId: string, datosFal?: unknown) {
  // Reclamo atómico: solo un proceso avanza de en_cola/generando a qc.
  const { data: reclamada } = await ctx.db
    .from("generaciones")
    .update({ estado: "qc" })
    .eq("id", generacionId)
    .eq("owner_id", ctx.ownerId)
    .in("estado", ["en_cola", "generando"])
    .select("*")
    .maybeSingle();
  if (!reclamada) return;
  const fila = reclamada as FilaGeneracion;
  const modelo = await obtenerModelo(ctx, fila.modelo_id);

  // 1. Obtener la imagen y guardarla
  let buffer: Buffer;
  let tipo = "image/png";
  try {
    if (stub.esStub(fila.fal_request_id)) {
      const factor = fila.caso_uso === "escalado" ? (fila.parametros.factor_escalado ?? 2) : 1;
      buffer = await stub.imagen({
        ancho: Math.round(fila.parametros.ancho_px * factor),
        alto: Math.round(fila.parametros.alto_px * factor),
        paleta: fila.parametros.paleta,
        titulo: modelo.nombre,
        subtitulo: `${fila.caso_uso} · intento ${fila.intentos + 1}`,
      });
    } else {
      const datos = datosFal ?? (await fal.resultado(ctx.config, fila.endpoint, fila.fal_request_id!));
      const url = fal.urlsSalida(datos, fila.parametros.salida ?? "images")[0];
      if (!url) throw new ErrorMotor("fal.ai no devolvió ninguna imagen.", "Reintenta o cambia de modelo.");
      ({ buffer, tipo } = await descargar(url));
    }
  } catch (e) {
    await actualizar(ctx, fila.id, { estado: "generando" });
    await manejarFallo(ctx, fila.id, e instanceof Error ? e.message : String(e));
    return;
  }

  const carpeta = fila.proyecto_id ?? "explorador";
  const ruta = `${ctx.ownerId}/${carpeta}/${fila.id}-${fila.intentos}.${extension(tipo)}`;
  await guardar(ctx, "generaciones", ruta, buffer, tipo);
  const { ancho, alto } = await dimensiones(buffer);

  // 2. Costo del intento (estimado con la tabla de precios del modelo)
  const esStub = stub.esStub(fila.fal_request_id);
  const plan = planificarCon(modelo, fila.caso_uso, fila.prompt, { ...fila.parametros, imagenes_entrada: fila.imagenes_entrada });
  const costo = esStub ? 0 : plan.costo_estimado_usd;
  if (!esStub) {
    await registrarMovimiento(ctx, {
      proyecto_id: fila.proyecto_id,
      generacion_id: fila.id,
      proveedor: "fal",
      modelo: fila.endpoint,
      concepto: fila.intentos > 0 ? `Regeneración por QC (${fila.caso_uso})` : `Generación (${fila.caso_uso})`,
      monto_usd: costo,
      estimado: true,
    });
  }
  const costoTotal = Number(fila.costo_usd) + costo;
  await actualizar(ctx, fila.id, { archivo: ruta, ancho, alto, costo_usd: costoTotal });

  // 3. QC
  const umbrales = await ajustes(ctx);
  let qc: ResultadoQC;
  if (fila.caso_uso === "escalado") {
    // El escalado no cambia el contenido: se verifica solo que la resolución aumentó.
    const creció = ancho > fila.parametros.ancho_px;
    qc = { puntaje_calidad: creció ? 10 : 0, apariencia_ia: 1, anatomia_ok: true, texto_ok: true, coherencia_brief: 10, hallazgos: creció ? [] : ["La imagen no aumentó de tamaño."], prompt_corregido: null, pasa: creció, simulado: true, intento: fila.intentos };
    await actualizar(ctx, fila.id, { estado: creció ? "lista" : "rechazada_qc", qc });
    return;
  } else if (esStub) {
    qc = { puntaje_calidad: 8, apariencia_ia: 2, anatomia_ok: true, texto_ok: true, coherencia_brief: 8, hallazgos: ["QC simulado en modo stub."], prompt_corregido: null, pasa: true, simulado: true, intento: fila.intentos };
  } else {
    try {
      const { data: caso } = await ctx.db.from("casos_uso").select("criterios_evaluacion").eq("owner_id", ctx.ownerId).eq("clave", fila.caso_uso).maybeSingle();
      qc = await evaluarImagen(ctx, {
        imagen: buffer,
        prompt: fila.prompt,
        casoUso: fila.caso_uso,
        criterios: caso?.criterios_evaluacion ?? [],
        contexto: fila.parametros.contexto_qc,
        umbrales,
        intento: fila.intentos,
        proyectoId: fila.proyecto_id,
        generacionId: fila.id,
      });
    } catch (e) {
      await actualizar(ctx, fila.id, {
        estado: "lista",
        aviso: [fila.aviso, `No se pudo hacer el control de calidad: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join(" · "),
      });
      return;
    }
  }

  const historial = [...(fila.qc?.historial ?? []), ...(fila.qc ? [{ ...fila.qc, historial: undefined, archivo: fila.archivo }] : [])];
  if (qc.pasa) {
    await actualizar(ctx, fila.id, { estado: "lista", qc: { ...qc, historial } });
    return;
  }

  // 4. No pasó: regenerar con el prompt corregido (máx. N veces)
  if (fila.intentos < umbrales.maxReintentos) {
    const nuevoPrompt = qc.prompt_corregido?.trim() || fila.prompt;
    try {
      const urls = await firmarEntradas(ctx, fila.imagenes_entrada);
      const nuevoPlan = planificarCon(modelo, fila.caso_uso, nuevoPrompt, { ...fila.parametros, imagenes_entrada: urls });
      const requestId = await enviarPlan(ctx, nuevoPlan);
      await actualizar(ctx, fila.id, {
        estado: "en_cola",
        prompt: nuevoPrompt,
        entrada_fal: nuevoPlan.traduccion.entrada,
        fal_request_id: requestId,
        intentos: fila.intentos + 1,
        qc: { ...qc, historial: [...historial, { ...qc, archivo: ruta, prompt: fila.prompt }] },
      });
      return;
    } catch (e) {
      await actualizar(ctx, fila.id, {
        estado: "rechazada_qc",
        qc: { ...qc, historial },
        aviso: `No pasó el control de calidad y no se pudo regenerar: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }
  }

  await actualizar(ctx, fila.id, {
    estado: "rechazada_qc",
    qc: { ...qc, historial },
    aviso: `No pasó el control de calidad tras ${fila.intentos + 1} intentos. Se muestra con advertencia.`,
  });
}

// ---------------------------------------------------------------------------
// Sondeo (local o como red de seguridad del webhook)
// ---------------------------------------------------------------------------
export async function sincronizar(ctx: ContextoMotor, generacionId: string) {
  const fila = await obtenerFila(ctx, generacionId);
  if (!fila || !["en_cola", "generando"].includes(fila.estado) || !fila.fal_request_id) return;

  if (stub.esStub(fila.fal_request_id)) {
    if (stub.listo(fila.fal_request_id)) await procesarCompletada(ctx, fila.id);
    else if (fila.estado === "en_cola") await actualizar(ctx, fila.id, { estado: "generando" });
    return;
  }

  try {
    const estado = await fal.estado(ctx.config, fila.endpoint, fila.fal_request_id);
    if (estado === "completada") {
      let datos: unknown;
      try {
        datos = await fal.resultado(ctx.config, fila.endpoint, fila.fal_request_id);
      } catch (e) {
        await manejarFallo(ctx, fila.id, e instanceof Error ? e.message : String(e));
        return;
      }
      await procesarCompletada(ctx, fila.id, datos);
    } else if (estado === "generando" && fila.estado === "en_cola") {
      await actualizar(ctx, fila.id, { estado: "generando" });
    }
  } catch (e) {
    console.error("[motor] sondeo falló", fila.id, e);
  }
}

/** Sincroniza todas las generaciones pendientes de un proyecto. */
export async function sincronizarPendientes(ctx: ContextoMotor, proyectoId: string) {
  const { data } = await ctx.db
    .from("generaciones")
    .select("id")
    .eq("owner_id", ctx.ownerId)
    .eq("proyecto_id", proyectoId)
    .in("estado", ["en_cola", "generando"]);
  await Promise.all((data ?? []).map((g) => sincronizar(ctx, g.id)));
  return (data ?? []).length;
}

/** Punto de entrada del webhook de fal (ya verificado). */
export async function recibirWebhook(
  ctx: ContextoMotor,
  generacionId: string,
  cuerpo: { status?: string; payload?: unknown; error?: string; payload_error?: string },
) {
  if (cuerpo.status === "OK") {
    // Si el payload vino vacío (muy grande), procesarCompletada lo pide a la cola.
    const datos = cuerpo.payload && !cuerpo.payload_error ? cuerpo.payload : undefined;
    await procesarCompletada(ctx, generacionId, datos);
  } else {
    await manejarFallo(ctx, generacionId, cuerpo.error ?? "fal.ai reportó un error en la generación.");
  }
}
