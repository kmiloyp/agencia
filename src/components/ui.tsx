import type { ComponentProps, ReactNode } from "react";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-acento text-sobre-acento hover:brightness-110",
  secundario: "bg-superficie text-texto border border-borde hover:bg-superficie-2",
  fantasma: "text-texto-2 hover:text-texto hover:bg-superficie-2",
  peligro: "text-error border border-borde hover:bg-superficie-2",
};

export function clasesBoton(variante: Variante = "secundario", extra = "") {
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control px-3.5 h-9 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${VARIANTES[variante]} ${extra}`;
}

export function Boton({ variante = "secundario", className = "", ...props }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={clasesBoton(variante, className)} {...props} />;
}

export function Panel({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-panel border border-borde bg-superficie ${className}`} {...props} />;
}

export function Etiqueta({ htmlFor, children, ayuda }: { htmlFor?: string; children: ReactNode; ayuda?: string }) {
  return (
    <div className="grid gap-0.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-texto">{children}</label>
      {ayuda && <p className="text-xs text-texto-3">{ayuda}</p>}
    </div>
  );
}

export const claseCampo =
  "w-full rounded-control border border-borde bg-superficie px-3 py-2 text-sm text-texto placeholder:text-texto-3 focus:border-acento focus:outline-none";

export function Estado({ tono = "neutro", children }: { tono?: "neutro" | "acento" | "ok" | "alerta" | "error"; children: ReactNode }) {
  const tonos = {
    neutro: "bg-superficie-2 text-texto-2",
    acento: "bg-acento-suave text-acento",
    ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok",
    alerta: "bg-[color-mix(in_srgb,var(--alerta)_14%,transparent)] text-alerta",
    error: "bg-[color-mix(in_srgb,var(--error)_14%,transparent)] text-error",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tonos[tono]}`}>{children}</span>;
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-panel border border-dashed border-borde px-6 py-10">
      <p className="font-medium">{titulo}</p>
      {children && <div className="max-w-[60ch] text-sm text-texto-2">{children}</div>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function AvisoError({ error, sugerencia }: { error: string; sugerencia?: string }) {
  return (
    <div role="alert" className="rounded-control border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] px-3 py-2 text-sm">
      <p className="text-error font-medium">{error}</p>
      {sugerencia && <p className="text-texto-2">{sugerencia}</p>}
    </div>
  );
}

export function Encabezado({ titulo, children, acciones }: { titulo: string; children?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {children && <div className="max-w-[70ch] text-sm text-texto-2">{children}</div>}
      </div>
      {acciones}
    </header>
  );
}

export function Muestras({ colores, tamano = "sm" }: { colores: string[]; tamano?: "sm" | "md" }) {
  const t = tamano === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex items-center gap-1">
      {colores.map((c) => (
        <span key={c} title={c} className={`${t} rounded-full border border-black/10`} style={{ background: c }} />
      ))}
    </div>
  );
}
