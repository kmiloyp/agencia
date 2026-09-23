"use client";
import { ArrowRight } from "@phosphor-icons/react";
import { useFormStatus } from "react-dom";
import { crearProyecto } from "@/app/acciones/proyecto";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-control bg-acento px-4 text-sm font-medium text-sobre-acento transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
      {pending ? "Abriendo proyecto…" : "Empezar"}
      <ArrowRight size={16} weight="bold" />
    </button>
  );
}

const EJEMPLOS = [
  "Portada y contraportada de un cuaderno A5 para un cliente que rechazó lo anterior",
  "Póster para una feria de café de especialidad",
  "Mejorar el logo de una panadería de barrio",
];

export function NuevoEncargo({ autoFocus = false }: { autoFocus?: boolean }) {
  return (
    <form action={crearProyecto} className="grid gap-3">
      <label htmlFor="mensaje" className="sr-only">Describe lo que necesitas</label>
      <textarea
        id="mensaje"
        name="mensaje"
        required
        rows={3}
        autoFocus={autoFocus}
        placeholder="Cuéntame qué necesitas: la pieza, para quién es y qué no funcionó antes."
        className="w-full resize-none rounded-panel border border-borde bg-superficie px-4 py-3 text-base text-texto placeholder:text-texto-3 focus:border-acento focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={(ev) => {
                const area = ev.currentTarget.form?.elements.namedItem("mensaje") as HTMLTextAreaElement | null;
                if (area) { area.value = e; area.focus(); }
              }}
              className="rounded-full border border-borde px-3 py-1 text-xs text-texto-2 hover:border-texto-3 hover:text-texto"
            >
              {e}
            </button>
          ))}
        </div>
        <Enviar />
      </div>
    </form>
  );
}
