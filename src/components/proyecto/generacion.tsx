"use client";
import { ArrowClockwise, ThumbsDown, ThumbsUp, Warning, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { votarGeneracion } from "@/app/acciones/proyecto";
import { reintentar } from "./reintento";
import { usd } from "@/lib/formato";

export interface Generacion {
  id: string;
  ruta_id: string | null;
  parent_id: string | null;
  caso_uso: string;
  created_at: string;
  archivo: string | null;
  estado: "en_cola" | "generando" | "qc" | "lista" | "fallida" | "rechazada_qc";
  url: string | null;
  ancho: number | null;
  alto: number | null;
  prompt: string;
  modelo: string | null;
  costo_usd: number;
  intentos: number;
  qc: { puntaje_calidad: number; apariencia_ia: number; hallazgos: string[]; simulado?: boolean } | null;
  voto: "aprobada" | "rechazada" | null;
  aviso: string | null;
  error: string | null;
  uso_respaldo: boolean;
}

const TEXTO_ESTADO: Record<Generacion["estado"], string> = {
  en_cola: "En cola",
  generando: "Generando",
  qc: "Control de calidad",
  lista: "Lista",
  fallida: "Falló",
  rechazada_qc: "No pasó QC",
};

export function pendiente(g: Generacion) {
  return g.estado === "en_cola" || g.estado === "generando" || g.estado === "qc";
}

function Detalle({ g, cerrar }: { g: Generacion; cerrar: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Detalle de la imagen" className="fixed inset-0 z-40 grid bg-escenario/95 p-4 md:grid-cols-[minmax(0,1fr)_340px] md:gap-6 md:p-8" onClick={cerrar}>
      <div className="grid min-h-0 place-items-center" onClick={(e) => e.stopPropagation()}>
        {g.url && <img src={g.url} alt="Imagen generada" className="max-h-[80dvh] max-w-full object-contain" />}
      </div>
      <aside className="grid content-start gap-4 overflow-y-auto text-sm text-neutral-300" onClick={(e) => e.stopPropagation()}>
        <button onClick={cerrar} aria-label="Cerrar" className="justify-self-end text-neutral-400 hover:text-white"><X size={20} /></button>
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-neutral-500">Modelo</dt><dd>{g.modelo ?? "?"}{g.uso_respaldo ? " (respaldo)" : ""}</dd>
          <dt className="text-neutral-500">Tamaño</dt><dd className="font-mono">{g.ancho}×{g.alto}px</dd>
          <dt className="text-neutral-500">Costo</dt><dd className="font-mono">{usd(g.costo_usd, 3)}</dd>
          <dt className="text-neutral-500">Intentos</dt><dd>{g.intentos + 1}</dd>
          {g.qc && (<>
            <dt className="text-neutral-500">Calidad</dt><dd>{g.qc.puntaje_calidad}/10</dd>
            <dt className="text-neutral-500">Apariencia IA</dt><dd>{g.qc.apariencia_ia}/10 <span className="text-neutral-500">(menos es mejor)</span></dd>
          </>)}
        </dl>
        {g.qc?.hallazgos?.length ? (
          <div className="grid gap-1">
            <p className="font-medium text-white">Hallazgos del control de calidad</p>
            <ul className="list-disc space-y-1 pl-4">{g.qc.hallazgos.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
        ) : null}
        {g.aviso && <p className="text-amber-300">{g.aviso}</p>}
        <details>
          <summary className="cursor-pointer text-neutral-400 hover:text-white">Prompt usado</summary>
          <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-400">{g.prompt}</p>
        </details>
      </aside>
    </div>
  );
}

export function TarjetaGeneracion({ g, proporcion, alElegir, proyectoId }: { g: Generacion; proporcion: number; alElegir?: () => void; proyectoId?: string }) {
  const router = useRouter();
  const [reintentando, iniciarReintento] = useTransition();
  const [errorReintento, setErrorReintento] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [voto, setVoto] = useState(g.voto);
  const [, iniciar] = useTransition();
  const votar = (v: "aprobada" | "rechazada") => {
    const nuevo = voto === v ? null : v;
    setVoto(nuevo);
    iniciar(async () => { await votarGeneracion(g.id, nuevo); });
  };

  return (
    <figure className="group grid gap-2">
      <div className="relative overflow-hidden rounded-control bg-escenario-2" style={{ aspectRatio: String(proporcion) }}>
        {g.url && (g.estado === "lista" || g.estado === "rechazada_qc") ? (
          <button onClick={() => (alElegir ? alElegir() : setAbierta(true))} className="block h-full w-full" aria-label={alElegir ? "Elegir esta imagen" : "Ver detalle"}>
            <img src={g.url} alt="Muestra generada" className="h-full w-full object-cover" />
          </button>
        ) : g.estado === "fallida" ? (
          <div className="grid h-full content-center justify-items-center gap-3 p-4 text-center text-xs text-red-300">
            <span className="line-clamp-6">{errorReintento ?? g.error ?? "La generación falló."}</span>
            {proyectoId && (
              <button
                disabled={reintentando}
                onClick={() => iniciarReintento(async () => {
                  const e = await reintentar(proyectoId, [g.id]);
                  setErrorReintento(e ? e.error : null);
                  router.refresh();
                })}
                className="inline-flex h-8 items-center gap-1.5 rounded-control bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50"
              >
                <ArrowClockwise size={14} />{reintentando ? "Reintentando…" : "Reintentar"}
              </button>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-escenario-2 to-escenario-borde" />
        )}
        {g.estado === "rechazada_qc" && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-amber-300">
            <Warning size={12} weight="fill" /> No pasó QC
          </span>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span aria-live="polite">
          {pendiente(g) ? `${TEXTO_ESTADO[g.estado]}${g.intentos ? ` · reintento ${g.intentos}` : ""}` : g.estado === "lista" ? (g.qc && !g.qc.simulado ? `QC ${g.qc.puntaje_calidad}/10 · IA ${g.qc.apariencia_ia}/10` : g.modelo ?? "") : TEXTO_ESTADO[g.estado]}
        </span>
        {(g.estado === "lista" || g.estado === "rechazada_qc") && (
          <span className="flex gap-1">
            <button aria-label="Aprobar" aria-pressed={voto === "aprobada"} onClick={() => votar("aprobada")} className={`rounded p-1 ${voto === "aprobada" ? "text-emerald-400" : "hover:text-white"}`}><ThumbsUp size={15} weight={voto === "aprobada" ? "fill" : "regular"} /></button>
            <button aria-label="Rechazar" aria-pressed={voto === "rechazada"} onClick={() => votar("rechazada")} className={`rounded p-1 ${voto === "rechazada" ? "text-red-400" : "hover:text-white"}`}><ThumbsDown size={15} weight={voto === "rechazada" ? "fill" : "regular"} /></button>
          </span>
        )}
      </figcaption>
      {g.aviso && g.estado === "lista" && <p className="text-[11px] text-amber-300/90">{g.aviso}</p>}
      {abierta && <Detalle g={g} cerrar={() => setAbierta(false)} />}
    </figure>
  );
}
