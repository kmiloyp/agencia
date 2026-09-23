/**
 * Envoltorio de Claude para el motor y la agencia.
 * - Respuestas estructuradas validadas con Zod (1 reintento si el parseo falla).
 * - Respaldo del servidor ("fallbacks: default") si Claude declina una petición.
 * - Cada llamada registra su costo en movimientos_costo.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import sharp from "sharp";
import type { z } from "zod";
import { registrarMovimiento } from "./costos";
import { ErrorMotor, type ContextoMotor } from "./tipos";

const BETA_FALLBACK = "server-side-fallback-2026-07-01";

let clienteCache: Anthropic | null = null;
function cliente() {
  // Lee ANTHROPIC_API_KEY del entorno del servidor.
  clienteCache ??= new Anthropic();
  return clienteCache;
}

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

interface OpcionesLlamada {
  ctx: ContextoMotor;
  proyectoId?: string | null;
  generacionId?: string | null;
  /** Descripción para el ledger de costos, p. ej. "QC de imagen". */
  concepto: string;
  sistema: string;
  contenido: string | BetaContentBlockParam[];
  /** Historial previo (conversaciones). */
  historial?: { role: "user" | "assistant"; content: string }[];
  esfuerzo?: Esfuerzo;
  maxTokens?: number;
  busquedaWeb?: { maxUsos: number };
  /** Permite leer las URLs que aparecen en la conversación (web fetch). */
  lecturaWeb?: { maxUsos: number };
}

interface PreciosClaude {
  entrada_mtok: number;
  salida_mtok: number;
  busqueda_web_por_1000: number;
}

async function precios(ctx: ContextoMotor): Promise<PreciosClaude> {
  const { data } = await ctx.db.from("ajustes").select("valores").eq("owner_id", ctx.ownerId).maybeSingle();
  const p = (data?.valores as { precios_anthropic?: Partial<PreciosClaude> } | undefined)?.precios_anthropic;
  return {
    entrada_mtok: p?.entrada_mtok ?? 5,
    salida_mtok: p?.salida_mtok ?? 25,
    busqueda_web_por_1000: p?.busqueda_web_por_1000 ?? 10,
  };
}

async function registrarUso(o: OpcionesLlamada, respuesta: BetaMessage) {
  const u = respuesta.usage;
  const p = await precios(o.ctx);
  const entrada = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const busquedas = u.server_tool_use?.web_search_requests ?? 0;
  const monto =
    (entrada / 1_000_000) * p.entrada_mtok +
    ((u.output_tokens ?? 0) / 1_000_000) * p.salida_mtok +
    (busquedas / 1000) * p.busqueda_web_por_1000;
  await registrarMovimiento(o.ctx, {
    proyecto_id: o.proyectoId ?? null,
    generacion_id: o.generacionId ?? null,
    proveedor: "anthropic",
    modelo: respuesta.model,
    concepto: o.concepto,
    monto_usd: monto,
    estimado: false,
    detalle: { input_tokens: u.input_tokens, output_tokens: u.output_tokens, busquedas },
  });
}

function mensajes(o: OpcionesLlamada) {
  return [
    ...(o.historial ?? []),
    { role: "user" as const, content: o.contenido },
  ];
}

function herramientas(o: OpcionesLlamada): BetaToolUnion[] | undefined {
  const lista: BetaToolUnion[] = [];
  if (o.busquedaWeb) lista.push({ type: "web_search_20260209", name: "web_search", max_uses: o.busquedaWeb.maxUsos });
  if (o.lecturaWeb) lista.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: o.lecturaWeb.maxUsos, max_content_tokens: 30000 });
  return lista.length ? lista : undefined;
}

function base(o: OpcionesLlamada) {
  const fallbacks = o.ctx.config.anthropicFallbacks;
  return {
    model: o.ctx.config.anthropicModel,
    max_tokens: o.maxTokens ?? 16000,
    system: o.sistema,
    messages: mensajes(o),
    thinking: { type: "adaptive" as const },
    ...(fallbacks ? { betas: [BETA_FALLBACK], fallbacks: "default" as const } : {}),
    ...(herramientas(o) ? { tools: herramientas(o) } : {}),
  };
}

function revisarParada(r: BetaMessage) {
  if (r.stop_reason === "refusal") {
    throw new ErrorMotor(
      "Claude declinó esta petición por sus políticas de seguridad.",
      "Reformula el pedido (evita marcas, personas reales o contenido sensible) e inténtalo de nuevo.",
    );
  }
  if (r.stop_reason === "max_tokens") {
    throw new ErrorMotor("La respuesta de Claude quedó incompleta (demasiado larga).", "Inténtalo de nuevo con un pedido más acotado.");
  }
}

function traducirError(e: unknown): never {
  if (e instanceof ErrorMotor) throw e;
  if (e instanceof Anthropic.AuthenticationError) {
    throw new ErrorMotor("La llave de Anthropic no es válida.", "Revisa ANTHROPIC_API_KEY en .env.local.");
  }
  if (e instanceof Anthropic.NotFoundError) {
    throw new ErrorMotor("El modelo de Claude configurado no existe.", "Revisa ANTHROPIC_MODEL en .env.local.");
  }
  if (e instanceof Anthropic.RateLimitError) {
    throw new ErrorMotor("Claude está saturado en este momento (límite de uso).", "Espera un minuto y vuelve a intentarlo.");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    throw new ErrorMotor("No se pudo conectar con Claude.", "Revisa tu conexión a internet e inténtalo de nuevo.");
  }
  if (e instanceof Anthropic.APIError) {
    throw new ErrorMotor(`Claude devolvió un error (${e.status}).`, "Inténtalo de nuevo en unos segundos.");
  }
  throw e;
}

/** Llamada con respuesta JSON validada por un esquema Zod. */
export async function llamarEstructurado<T extends z.ZodType>(o: OpcionesLlamada & { esquema: T }): Promise<z.infer<T>> {
  const api = cliente();
  for (let intento = 1; intento <= 2; intento++) {
    let r;
    try {
      r = await api.beta.messages.parse({
        ...base(o),
        output_config: { format: betaZodOutputFormat(o.esquema), effort: o.esfuerzo ?? "high" },
      });
    } catch (e) {
      traducirError(e);
    }
    await registrarUso(o, r);
    revisarParada(r);
    if (r.parsed_output != null) return r.parsed_output as z.infer<T>;
  }
  throw new ErrorMotor(
    "Claude respondió en un formato inesperado dos veces seguidas.",
    "Inténtalo de nuevo; si persiste, revisa que ANTHROPIC_MODEL soporte salidas estructuradas.",
  );
}

/** Llamada con respuesta de texto libre (p. ej. informe con búsqueda web). */
export async function llamarTexto(o: OpcionesLlamada): Promise<{ texto: string; fuentes: { titulo: string; url: string }[] }> {
  // Con herramientas del servidor (búsqueda/lectura web) la API puede pausar el turno: se continúa.
  const bloques: BetaMessage["content"] = [];
  const conversacion = mensajes(o) as Parameters<Anthropic["beta"]["messages"]["create"]>[0]["messages"];
  let r: BetaMessage;
  for (let vuelta = 0; ; vuelta++) {
    try {
      r = await cliente().beta.messages.create({ ...base(o), messages: conversacion, output_config: { effort: o.esfuerzo ?? "high" } });
    } catch (e) {
      traducirError(e);
    }
    await registrarUso(o, r);
    bloques.push(...r.content);
    if (r.stop_reason !== "pause_turn" || vuelta >= 3) break;
    conversacion.push({ role: "assistant", content: r.content as never });
  }
  revisarParada(r);
  r = { ...r, content: bloques };
  const texto = r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const fuentes: { titulo: string; url: string }[] = [];
  for (const b of r.content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const res of b.content) {
        if (res.type === "web_search_result" && !fuentes.some((f) => f.url === res.url)) {
          fuentes.push({ titulo: res.title, url: res.url });
        }
      }
    }
  }
  return { texto, fuentes };
}

/** Reduce y convierte una imagen para enviarla a Claude visión (≤1568 px, JPEG). */
export async function bloqueImagen(buffer: Buffer): Promise<BetaContentBlockParam> {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
}
