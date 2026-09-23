"use client";
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { estimarReintento, reintentarFallidas } from "@/app/acciones/produccion";
import { AvisoError, Boton } from "@/components/ui";
import { usd } from "@/lib/formato";

type Err = { error: string; sugerencia?: string } | null;

/** Ejecuta un reintento; si supera el presupuesto, pide confirmación con el costo. */
export async function reintentar(proyectoId: string, ids: string[] | null): Promise<Err> {
  const r = await reintentarFallidas(proyectoId, ids, false);
  if (!r.ok) return r;
  if ("requiereConfirmacion" in r.datos) {
    const p = r.datos.presupuesto;
    const ok = window.confirm(`El reintento (${usd(p.estimado_usd)}) supera el presupuesto: el proyecto quedaría en ${usd(p.proyecto.tras_lote)} de ${usd(p.proyecto.presupuesto)}. ¿Reintentar igual?`);
    if (!ok) return null;
    const r2 = await reintentarFallidas(proyectoId, ids, true);
    if (!r2.ok) return r2;
  }
  return null;
}

/** Aviso con "Reintentar todas" cuando hay generaciones fallidas. */
export function AvisoFallidas({ proyectoId, fallidas }: { proyectoId: string; fallidas: number }) {
  const router = useRouter();
  const [estimado, setEstimado] = useState<{ usd: number; modo: string } | null>(null);
  const [error, setError] = useState<Err>(null);
  const [cargando, iniciar] = useTransition();

  useEffect(() => {
    if (!fallidas) return;
    let vivo = true;
    estimarReintento(proyectoId).then((r) => { if (vivo && r.ok) setEstimado(r.datos); });
    return () => { vivo = false; };
  }, [proyectoId, fallidas]);

  if (!fallidas) return null;
  return (
    <div className="grid gap-2 rounded-panel border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_6%,transparent)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="flex items-center gap-2">
          <Warning size={16} weight="fill" className="text-error" />
          {fallidas === 1 ? "1 generación falló." : `${fallidas} generaciones fallaron.`}
          <span className="text-texto-2">Si ya resolviste la causa (p. ej. saldo en fal.ai), reintenta con el mismo prompt.</span>
        </p>
        <Boton
          variante="primario"
          disabled={cargando}
          onClick={() => iniciar(async () => { setError(await reintentar(proyectoId, null)); router.refresh(); })}
        >
          <ArrowClockwise size={16} />
          {cargando ? "Reintentando…" : "Reintentar todas"}
          {estimado && <span className="font-mono text-xs opacity-80">{estimado.modo === "real" ? usd(estimado.usd) : "sin costo"}</span>}
        </Boton>
      </div>
      {error && <AvisoError {...error} />}
    </div>
  );
}
