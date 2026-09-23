"use client";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { continuarARutas, hacerInvestigacion, omitirInvestigacion } from "@/app/acciones/proyecto";
import { AvisoError, Boton } from "@/components/ui";

export function AccionesInvestigacion({ proyectoId, hay }: { proyectoId: string; hay: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<{ error: string; sugerencia?: string } | null>(null);
  return (
    <div className="grid gap-3">
      {pendiente && (
        <div className="grid gap-2 rounded-panel border border-borde bg-superficie p-4" aria-live="polite">
          <p className="text-sm text-texto-2">Buscando tendencias, competencia y clichés del sector. Suele tardar uno o dos minutos.</p>
          <div className="grid gap-2">
            {[80, 65, 72, 50].map((w) => <div key={w} className="h-3 animate-pulse rounded bg-superficie-2" style={{ width: `${w}%` }} />)}
          </div>
        </div>
      )}
      {error && <AvisoError {...error} />}
      <div className="flex flex-wrap gap-2">
        <Boton
          variante={hay ? "secundario" : "primario"}
          disabled={pendiente}
          onClick={() => iniciar(async () => { setError(null); const r = await hacerInvestigacion(proyectoId); if (!r.ok) setError(r); })}
        >
          <MagnifyingGlass size={16} />
          {hay ? "Rehacer investigación" : "Investigar"}
        </Boton>
        {hay ? (
          <Boton variante="primario" disabled={pendiente} onClick={() => iniciar(() => continuarARutas(proyectoId))}>Continuar a rutas</Boton>
        ) : (
          <Boton variante="fantasma" disabled={pendiente} onClick={() => iniciar(() => omitirInvestigacion(proyectoId))}>Saltar este paso</Boton>
        )}
      </div>
    </div>
  );
}
