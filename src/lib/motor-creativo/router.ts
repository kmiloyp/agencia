/**
 * Router de modelos: decide qué modelo usa cada caso de uso leyendo la tabla
 * `asignaciones`. Cero nombres de modelo en el código.
 */
import { estimarCostoTraduccion, traducirEscalado, traducirGeneracion } from "./traductor";
import { ErrorMotor, type ClaveCasoUso, type ContextoMotor, type Modelo, type ParametrosGenericos, type Traduccion } from "./tipos";

const COLUMNAS_MODELO = "id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, esquema_parametros, estado";

export interface Asignacion {
  campeon: Modelo;
  respaldo: Modelo | null;
}

export async function resolverAsignacion(ctx: ContextoMotor, casoUso: ClaveCasoUso): Promise<Asignacion> {
  const { data: caso } = await ctx.db
    .from("casos_uso")
    .select("id")
    .eq("owner_id", ctx.ownerId)
    .eq("clave", casoUso)
    .maybeSingle();
  if (!caso) {
    throw new ErrorMotor(`No existe el caso de uso "${casoUso}".`, "Revisa que la semilla de datos se haya aplicado (ver AGENTS.md).");
  }
  const { data: asig } = await ctx.db
    .from("asignaciones")
    .select(`campeon:modelos!asignaciones_modelo_id_fkey(${COLUMNAS_MODELO}), respaldo:modelos!asignaciones_respaldo_modelo_id_fkey(${COLUMNAS_MODELO})`)
    .eq("caso_uso_id", caso.id)
    .eq("vigente", true)
    .maybeSingle();
  if (!asig?.campeon) {
    throw new ErrorMotor(`El caso de uso "${casoUso}" no tiene modelo asignado.`, "Asigna un campeón en /modelos.");
  }
  return {
    campeon: asig.campeon as unknown as Modelo,
    respaldo: (asig.respaldo as unknown as Modelo | null) ?? null,
  };
}

export async function obtenerModelo(ctx: ContextoMotor, modeloId: string): Promise<Modelo> {
  const { data } = await ctx.db.from("modelos").select(COLUMNAS_MODELO).eq("id", modeloId).eq("owner_id", ctx.ownerId).maybeSingle();
  if (!data) throw new ErrorMotor("El modelo pedido ya no existe.", "Elige otro modelo en /modelos.");
  return data as unknown as Modelo;
}

export interface Plan {
  modelo: Modelo;
  traduccion: Traduccion;
  costo_estimado_usd: number;
}

/** Traduce una petición genérica al modelo indicado y estima su costo. */
export function planificarCon(modelo: Modelo, casoUso: ClaveCasoUso, prompt: string, p: ParametrosGenericos, urlEscalado?: string): Plan {
  const traduccion =
    casoUso === "escalado"
      ? traducirEscalado(modelo, urlEscalado ?? p.imagenes_entrada?.[0] ?? "", p)
      : traducirGeneracion(modelo, prompt, p);
  return { modelo, traduccion, costo_estimado_usd: estimarCostoTraduccion(modelo, traduccion) };
}

/** Plan con el campeón del caso de uso (o un modelo elegido a mano). */
export async function planificar(
  ctx: ContextoMotor,
  casoUso: ClaveCasoUso,
  prompt: string,
  p: ParametrosGenericos,
  opciones: { modeloId?: string; usarRespaldo?: boolean } = {},
): Promise<Plan & { respaldo: Modelo | null }> {
  if (opciones.modeloId) {
    const modelo = await obtenerModelo(ctx, opciones.modeloId);
    return { ...planificarCon(modelo, casoUso, prompt, p), respaldo: null };
  }
  const { campeon, respaldo } = await resolverAsignacion(ctx, casoUso);
  const modelo = opciones.usarRespaldo && respaldo ? respaldo : campeon;
  return { ...planificarCon(modelo, casoUso, prompt, p), respaldo: opciones.usarRespaldo ? null : respaldo };
}
