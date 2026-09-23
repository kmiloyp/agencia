"use client";
import { Check, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { descartarRuta, elegirRuta, estimarLote, generarLote, pedirRutas } from "@/app/acciones/proyecto";
import Link from "next/link";
import { AvisoError, Boton, clasesBoton, Muestras, claseCampo } from "@/components/ui";
import type { EstadoPresupuesto } from "@/lib/motor-creativo/costos";
import { usd } from "@/lib/formato";
import { useGeneracionesEnVivo } from "./en-vivo";
import { pendiente, TarjetaGeneracion, type Generacion } from "./generacion";

export interface Ruta {
  id: string;
  nombre: string;
  concepto: string;
  paleta: string[];
  tipografias: string[];
  mood: string | null;
  caso_uso: string | null;
  por_que_encaja: string | null;
  estado: "propuesta" | "elegida" | "descartada";
  motivo_descarte: string | null;
  modelo: string | null;
}

type Err = { error: string; sugerencia?: string } | null;

function Descartar({ proyectoId, rutaId }: { proyectoId: string; rutaId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, iniciar] = useTransition();
  if (!abierto) return <button onClick={() => setAbierto(true)} className="h-9 rounded-control px-3 text-sm text-neutral-400 hover:bg-white/5 hover:text-white">Descartar</button>;
  return (
    <form
      className="grid w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => { const r = await descartarRuta(proyectoId, rutaId, motivo); if (!r.ok) setError(r.error); });
      }}
    >
      <label htmlFor={`motivo-${rutaId}`} className="text-xs text-neutral-400">¿Por qué no funciona? Queda en la memoria del cliente.</label>
      <input id={`motivo-${rutaId}`} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${claseCampo} border-escenario-borde bg-escenario text-neutral-100`} placeholder="Ej.: demasiado infantil, colores muy saturados" />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button disabled={cargando} className="h-8 rounded-control bg-white/10 px-3 text-sm text-white hover:bg-white/15">{cargando ? "Guardando…" : "Descartar ruta"}</button>
        <button type="button" onClick={() => setAbierto(false)} className="h-8 px-2 text-sm text-neutral-400 hover:text-white">Cancelar</button>
      </div>
    </form>
  );
}

function PanelLote({ proyectoId, hayMuestras }: { proyectoId: string; hayMuestras: boolean }) {
  const [estimado, setEstimado] = useState<{ imagenes: number; presupuesto: EstadoPresupuesto; modo: string } | null>(null);
  const [error, setError] = useState<Err>(null);
  const [cargando, iniciar] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    estimarLote(proyectoId).then((r) => { if (vivo) { if (r.ok) setEstimado(r.datos); else setError(r); } });
    return () => { vivo = false; };
  }, [proyectoId, hayMuestras]);

  const generar = (confirmado: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await generarLote(proyectoId, confirmado);
      if (!r.ok) return setError(r);
      const datos = r.datos;
      if ("requiereConfirmacion" in datos) setEstimado((e) => (e ? { ...e, presupuesto: datos.presupuesto } : e));
      router.refresh();
    });

  if (!estimado) return error ? <AvisoError {...error} /> : <div className="h-16 animate-pulse rounded-panel bg-superficie-2" />;
  const p = estimado.presupuesto;
  const stub = estimado.modo !== "real";
  return (
    <div className="grid gap-3 rounded-panel border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">{hayMuestras ? "Generar otra tanda de muestras" : "Generar muestras"}</p>
          <p className="text-texto-2">
            {estimado.imagenes} imágenes · estimado <span className="font-mono">{stub ? "$0.00 (modo de ejemplo)" : usd(p.estimado_usd)}</span>
            {!stub && <> · proyecto quedaría en <span className="font-mono">{usd(p.proyecto.tras_lote)}</span> de {usd(p.proyecto.presupuesto)}</>}
          </p>
        </div>
        {!(p.requiere_confirmacion && !stub) && (
          <Boton variante={hayMuestras ? "secundario" : "primario"} disabled={cargando} onClick={() => generar(false)}>
            <Sparkle size={16} /> {cargando ? "Enviando a la cola…" : "Generar"}
          </Boton>
        )}
      </div>
      {p.requiere_confirmacion && !stub && (
        <div className="grid gap-2 rounded-control border border-[color-mix(in_srgb,var(--alerta)_40%,transparent)] bg-[color-mix(in_srgb,var(--alerta)_8%,transparent)] p-3 text-sm">
          <p className="font-medium text-alerta">Este lote supera el presupuesto{p.excede_proyecto && p.excede_mes ? " del proyecto y del mes" : p.excede_proyecto ? " del proyecto" : " mensual"}.</p>
          <p className="text-texto-2">
            {p.excede_proyecto && <>Proyecto: {usd(p.proyecto.tras_lote)} de {usd(p.proyecto.presupuesto)}. </>}
            {p.excede_mes && <>Mes: {usd(p.mes.tras_lote)} de {usd(p.mes.presupuesto)}. </>}
            Puedes subir el presupuesto del proyecto arriba o generar igual.
          </p>
          <div><Boton variante="primario" disabled={cargando} onClick={() => generar(true)}>{cargando ? "Enviando…" : `Generar igual (${usd(p.estimado_usd)})`}</Boton></div>
        </div>
      )}
      {error && <AvisoError {...error} />}
    </div>
  );
}

export function TableroRutas({ proyectoId, rutas, generaciones, proporcion }: { proyectoId: string; rutas: Ruta[]; generaciones: Generacion[]; proporcion: number }) {
  const router = useRouter();
  const [pidiendo, iniciarPedido] = useTransition();
  const [accion, iniciarAccion] = useTransition();
  const [error, setError] = useState<Err>(null);
  const hayPendientes = generaciones.some(pendiente);

  useGeneracionesEnVivo(proyectoId, hayPendientes);

  const vivas = rutas.filter((r) => r.estado !== "descartada");
  const descartadas = rutas.filter((r) => r.estado === "descartada");
  const elegida = rutas.find((r) => r.estado === "elegida");

  const pedir = () => iniciarPedido(async () => { setError(null); const r = await pedirRutas(proyectoId); if (!r.ok) setError(r); });

  if (!vivas.length) {
    return (
      <div className="grid gap-4">
        {pidiendo ? (
          <div className="grid gap-4 md:grid-cols-3" aria-live="polite">
            {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-panel bg-escenario" />)}
            <p className="text-sm text-texto-2 md:col-span-3">El director creativo está pensando tres caminos distintos. Tarda entre uno y dos minutos.</p>
          </div>
        ) : (
          <div className="grid justify-items-start gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Tres rutas creativas</h2>
            <p className="max-w-[65ch] text-sm text-texto-2">Tres caminos realmente distintos, cada uno con concepto, paleta, tipografías y dos muestras. Antes de generar imágenes verás el costo estimado.</p>
            <Boton variante="primario" onClick={pedir}><Sparkle size={16} />{descartadas.length ? "Proponer rutas nuevas" : "Proponer rutas"}</Boton>
          </div>
        )}
        {error && <AvisoError {...error} />}
      </div>
    );
  }

  const muestrasDe = (rutaId: string) => generaciones.filter((g) => g.ruta_id === rutaId);
  const hayMuestras = generaciones.length > 0;

  return (
    <div className="grid gap-6">
      {!elegida && <PanelLote proyectoId={proyectoId} hayMuestras={hayMuestras} />}

      <div className={`grid gap-4 ${vivas.length > 1 ? "xl:grid-cols-3" : ""}`}>
        {vivas.map((r, i) => (
          <article key={r.id} className={`grid content-start gap-4 rounded-panel bg-escenario p-4 text-neutral-200 ring-1 ${r.estado === "elegida" ? "ring-acento" : "ring-escenario-borde"}`}>
            <header className="grid gap-1">
              <p className="text-xs text-neutral-500">Ruta {String.fromCharCode(65 + i)}{r.estado === "elegida" ? " · elegida" : ""}</p>
              <h3 className="text-lg font-semibold tracking-tight text-white">{r.nombre}</h3>
              <p className="text-sm leading-relaxed text-neutral-300">{r.concepto}</p>
            </header>
            <div className="grid grid-cols-2 gap-3">
              {muestrasDe(r.id).length ? (
                muestrasDe(r.id).map((g) => <TarjetaGeneracion key={g.id} g={g} proporcion={proporcion} />)
              ) : (
                [0, 1].map((k) => <div key={k} className="grid place-items-center rounded-control border border-dashed border-escenario-borde text-xs text-neutral-500" style={{ aspectRatio: String(proporcion) }}>Sin muestra</div>)
              )}
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-2"><dt className="text-neutral-500">Paleta</dt><dd><Muestras colores={r.paleta} tamano="md" /></dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-neutral-500">Tipografías</dt><dd className="text-right">{r.tipografias.join(" + ")}</dd></div>
              {r.mood && <div className="flex items-center justify-between gap-2"><dt className="text-neutral-500">Mood</dt><dd className="text-right">{r.mood}</dd></div>}
              <div className="flex items-center justify-between gap-2"><dt className="text-neutral-500">Motor</dt><dd className="text-right">{r.caso_uso}{r.modelo ? ` con ${r.modelo}` : ""}</dd></div>
            </dl>
            {r.por_que_encaja && <p className="border-t border-escenario-borde pt-3 text-sm text-neutral-400">{r.por_que_encaja}</p>}
            {r.estado === "propuesta" && !elegida && (
              <footer className="flex flex-wrap items-center gap-2">
                <button
                  disabled={accion}
                  onClick={() => iniciarAccion(async () => { const x = await elegirRuta(proyectoId, r.id); if (!x.ok) setError(x); })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-200 active:scale-[0.98]"
                >
                  <Check size={16} weight="bold" /> Elegir
                </button>
                <Descartar proyectoId={proyectoId} rutaId={r.id} />
              </footer>
            )}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {!elegida && <Boton variante="fantasma" disabled={pidiendo} onClick={pedir}>{pidiendo ? "Pensando rutas nuevas…" : "Proponer otras rutas"}</Boton>}
        </div>
        <Link href={`/proyectos/${proyectoId}/entrega#aprobacion`} className={clasesBoton("secundario")}>
          <PaperPlaneRight size={16} /> Enviar opciones al cliente
        </Link>
      </div>
      {error && <AvisoError {...error} />}

      {descartadas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-texto-2 hover:text-texto">{descartadas.length} {descartadas.length === 1 ? "ruta descartada" : "rutas descartadas"}</summary>
          <ul className="mt-3 grid gap-2">
            {descartadas.map((r) => (
              <li key={r.id} className="text-texto-2"><span className="font-medium text-texto">{r.nombre}:</span> {r.motivo_descarte}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
