/**
 * Control de costos: ledger (movimientos_costo) y verificación de presupuesto.
 */
import type { ContextoMotor } from "./tipos";

export interface Movimiento {
  proyecto_id: string | null;
  generacion_id?: string | null;
  proveedor: "fal" | "anthropic";
  modelo: string;
  concepto: string;
  monto_usd: number;
  estimado: boolean;
  detalle?: Record<string, unknown>;
}

export async function registrarMovimiento(ctx: ContextoMotor, m: Movimiento) {
  const { error } = await ctx.db.from("movimientos_costo").insert({
    ...m,
    monto_usd: Math.round(m.monto_usd * 1_000_000) / 1_000_000,
    owner_id: ctx.ownerId,
    detalle: m.detalle ?? {},
  });
  // Un fallo del ledger no debe tumbar la generación, pero sí dejar rastro.
  if (error) console.error("[costos] no se pudo registrar el movimiento:", error.message);
}

export async function gastoDelMes(ctx: ContextoMotor, soloExplorador = false): Promise<number> {
  const inicio = new Date();
  inicio.setUTCDate(1);
  inicio.setUTCHours(0, 0, 0, 0);
  let q = ctx.db
    .from("movimientos_costo")
    .select("monto_usd")
    .eq("owner_id", ctx.ownerId)
    .gte("created_at", inicio.toISOString());
  if (soloExplorador) q = q.is("proyecto_id", null);
  const { data } = await q;
  return (data ?? []).reduce((s, r) => s + Number(r.monto_usd), 0);
}

export interface EstadoPresupuesto {
  estimado_usd: number;
  proyecto: { gastado: number; presupuesto: number; tras_lote: number };
  mes: { gastado: number; presupuesto: number; tras_lote: number };
  excede_proyecto: boolean;
  excede_mes: boolean;
  requiere_confirmacion: boolean;
}

export async function verificarPresupuesto(
  ctx: ContextoMotor,
  proyectoId: string,
  estimadoUsd: number,
  presupuestoMensual: number,
): Promise<EstadoPresupuesto> {
  const { data: proyecto } = await ctx.db
    .from("proyectos")
    .select("costo_acumulado_usd, presupuesto_usd")
    .eq("id", proyectoId)
    .eq("owner_id", ctx.ownerId)
    .single();
  const gastadoProyecto = Number(proyecto?.costo_acumulado_usd ?? 0);
  const presupuestoProyecto = Number(proyecto?.presupuesto_usd ?? 0);
  const gastadoMes = await gastoDelMes(ctx);
  const excedeProyecto = gastadoProyecto + estimadoUsd > presupuestoProyecto;
  const excedeMes = gastadoMes + estimadoUsd > presupuestoMensual;
  return {
    estimado_usd: estimadoUsd,
    proyecto: { gastado: gastadoProyecto, presupuesto: presupuestoProyecto, tras_lote: gastadoProyecto + estimadoUsd },
    mes: { gastado: gastadoMes, presupuesto: presupuestoMensual, tras_lote: gastadoMes + estimadoUsd },
    excede_proyecto: excedeProyecto,
    excede_mes: excedeMes,
    requiere_confirmacion: excedeProyecto || excedeMes,
  };
}
