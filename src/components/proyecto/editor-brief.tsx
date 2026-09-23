"use client";
import { Check } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { aprobarBrief, guardarBrief } from "@/app/acciones/proyecto";
import { AvisoError, Boton, Estado, Etiqueta, claseCampo } from "@/components/ui";
import type { Brief } from "@/lib/agencia/esquemas";

type Lista = "textos_obligatorios" | "caras" | "le_gusta" | "no_le_gusta" | "restricciones";
type Texto = "tipo_pieza" | "cliente" | "publico" | "proposito" | "mensaje";

const TEXTOS: { clave: Texto; etiqueta: string; largo?: boolean }[] = [
  { clave: "cliente", etiqueta: "Cliente" },
  { clave: "tipo_pieza", etiqueta: "Tipo de pieza" },
  { clave: "publico", etiqueta: "Público", largo: true },
  { clave: "proposito", etiqueta: "Propósito", largo: true },
  { clave: "mensaje", etiqueta: "Mensaje clave", largo: true },
];

const LISTAS: { clave: Lista; etiqueta: string }[] = [
  { clave: "textos_obligatorios", etiqueta: "Textos obligatorios" },
  { clave: "le_gusta", etiqueta: "Le gusta" },
  { clave: "no_le_gusta", etiqueta: "No le gusta" },
  { clave: "restricciones", etiqueta: "Restricciones" },
  { clave: "caras", etiqueta: "Caras" },
];

type EstadoGuardado = "guardado" | "guardando" | "sin_guardar" | "error";

export function EditorBrief({ proyectoId, inicial, version, aprobado }: { proyectoId: string; inicial: Brief; version: number; aprobado: boolean }) {
  const [brief, setBrief] = useState<Brief>(inicial);
  const [guardado, setGuardado] = useState<EstadoGuardado>("guardado");
  const [error, setError] = useState<{ error: string; sugerencia?: string } | null>(null);
  const [aprobando, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primera = useRef(true);

  // El ejecutivo puede reescribir el brief: si llega uno nuevo del servidor y no hay cambios locales, se adopta.
  const firmaInicial = JSON.stringify(inicial);
  const [firmaPrevia, setFirmaPrevia] = useState(firmaInicial);
  if (firmaInicial !== firmaPrevia) {
    setFirmaPrevia(firmaInicial);
    if (guardado === "guardado") setBrief(inicial);
  }

  // Autoguardado con espera de 1,2 s.
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (guardado !== "sin_guardar") return;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      setGuardado("guardando");
      const r = await guardarBrief(proyectoId, brief);
      if (r.ok) { setGuardado("guardado"); setError(null); } else { setGuardado("error"); setError(r); }
    }, 1200);
    return () => { if (temporizador.current) clearTimeout(temporizador.current); };
  }, [brief, guardado, proyectoId]);

  const cambiar = (cambio: Partial<Brief>) => {
    setBrief((b) => ({ ...b, ...cambio }));
    setGuardado("sin_guardar");
  };

  const etiquetaGuardado = { guardado: "Guardado", guardando: "Guardando…", sin_guardar: "Cambios sin guardar", error: "No se pudo guardar" }[guardado];

  return (
    <section className="grid gap-5 rounded-panel border border-borde bg-superficie p-4 md:p-6" aria-label="Brief">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Brief</h2>
          <span className="text-xs text-texto-3">versión {version}</span>
          {aprobado && <Estado tono="ok"><Check size={12} weight="bold" />Aprobado</Estado>}
        </div>
        <span className={`text-xs ${guardado === "error" ? "text-error" : "text-texto-3"}`} aria-live="polite">{etiquetaGuardado}</span>
      </div>
      {aprobado && <p className="text-sm text-texto-2">Si editas un brief aprobado se crea una versión nueva; la anterior queda guardada.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {TEXTOS.map(({ clave, etiqueta, largo }) => (
          <div key={clave} className={`grid gap-2 ${largo ? "md:col-span-2" : ""}`}>
            <Etiqueta htmlFor={`b-${clave}`}>{etiqueta}</Etiqueta>
            {largo ? (
              <textarea id={`b-${clave}`} rows={2} value={brief[clave]} onChange={(e) => cambiar({ [clave]: e.target.value } as Partial<Brief>)} className={claseCampo} />
            ) : (
              <input id={`b-${clave}`} value={brief[clave]} onChange={(e) => cambiar({ [clave]: e.target.value } as Partial<Brief>)} className={claseCampo} />
            )}
          </div>
        ))}
        {LISTAS.map(({ clave, etiqueta }) => (
          <div key={clave} className="grid gap-2">
            <Etiqueta htmlFor={`b-${clave}`} ayuda="Uno por línea">{etiqueta}</Etiqueta>
            <textarea
              id={`b-${clave}`}
              rows={3}
              value={brief[clave].join("\n")}
              onChange={(e) => cambiar({ [clave]: e.target.value.split("\n") } as Partial<Brief>)}
              onBlur={(e) => cambiar({ [clave]: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } as Partial<Brief>)}
              className={claseCampo}
            />
          </div>
        ))}
        <fieldset className="grid gap-2 md:col-span-2">
          <legend className="mb-2 text-sm font-medium">Formato (mm)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["ancho_mm", "alto_mm", "sangrado_mm", "lomo_mm"] as const).map((k) => (
              <label key={k} className="grid gap-1 text-xs text-texto-2">
                {{ ancho_mm: "Ancho", alto_mm: "Alto", sangrado_mm: "Sangrado", lomo_mm: "Lomo" }[k]}
                <input
                  inputMode="decimal"
                  value={brief.formato[k]}
                  onChange={(e) => cambiar({ formato: { ...brief.formato, [k]: Number(e.target.value.replace(",", ".")) || 0 } })}
                  className={`${claseCampo} font-mono`}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2">
          <Etiqueta htmlFor="b-fecha">Fecha de entrega</Etiqueta>
          <input id="b-fecha" value={brief.fecha ?? ""} onChange={(e) => cambiar({ fecha: e.target.value || null })} className={claseCampo} />
        </div>
        <div className="grid gap-2">
          <Etiqueta htmlFor="b-notas">Notas</Etiqueta>
          <input id="b-notas" value={brief.notas ?? ""} onChange={(e) => cambiar({ notas: e.target.value || null })} className={claseCampo} />
        </div>
      </div>

      {error && <AvisoError {...error} />}

      {!aprobado && (
        <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
          <Boton
            variante="primario"
            disabled={aprobando}
            onClick={() => iniciar(async () => {
              const r = await aprobarBrief(proyectoId, brief);
              if (r && !r.ok) setError(r);
            })}
          >
            {aprobando ? "Aprobando…" : "Aprobar brief"}
          </Boton>
          <p className="text-sm text-texto-2">Al aprobarlo pasamos a la investigación.</p>
        </div>
      )}
    </section>
  );
}
