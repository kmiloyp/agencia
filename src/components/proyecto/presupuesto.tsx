"use client";
import { useState, useTransition } from "react";
import { actualizarPresupuesto } from "@/app/acciones/proyecto";

export function Presupuesto({ proyectoId, gastado, presupuesto }: { proyectoId: string; gastado: number; presupuesto: number }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(presupuesto));
  const [pendiente, iniciar] = useTransition();
  const excede = gastado > presupuesto;
  if (editando) {
    return (
      <form
        className="flex items-center gap-1 font-mono text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            await actualizarPresupuesto(proyectoId, Number(valor));
            setEditando(false);
          });
        }}
      >
        <span className="text-texto-2">${gastado.toFixed(2)} / $</span>
        <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" aria-label="Presupuesto del proyecto en USD" className="w-16 rounded border border-borde bg-superficie px-1.5 py-0.5" />
        <button disabled={pendiente} className="text-xs text-acento">Guardar</button>
      </form>
    );
  }
  return (
    <button onClick={() => setEditando(true)} title="Editar presupuesto" className={`font-mono text-sm tabular-nums ${excede ? "text-error" : "text-texto-2"} hover:text-texto`}>
      Costo ${gastado.toFixed(2)} / ${presupuesto.toFixed(2)}
    </button>
  );
}
