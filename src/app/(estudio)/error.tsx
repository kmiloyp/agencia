"use client";
import { AvisoError, Boton } from "@/components/ui";

export default function ErrorEstudio({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid max-w-xl gap-3 pt-10">
      <AvisoError error="Algo falló al cargar esta pantalla." sugerencia={error.message} />
      <div><Boton onClick={reset}>Reintentar</Boton></div>
      <p className="text-xs text-texto-3">Tu trabajo está guardado en la base de datos; recargar no lo pierde.</p>
    </div>
  );
}
