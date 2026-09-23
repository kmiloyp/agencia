"use client";
import { ArrowRight, ArrowsClockwise, Cpu, MagicWand, Sparkle, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ejecutarAccion, estimarAccion, pasarAComposicion } from "@/app/acciones/produccion";
import { AvisoError, Boton, claseCampo } from "@/components/ui";
import type { AccionProduccion } from "@/lib/agencia/produccion";
import { usd } from "@/lib/formato";
import type { EstadoPresupuesto } from "@/lib/motor-creativo/costos";
import { useGeneracionesEnVivo } from "./en-vivo";
import { pendiente, TarjetaGeneracion, type Generacion } from "./generacion";
import { AvisoFallidas } from "./reintento";

export interface ModeloOpcion {
  id: string;
  nombre: string;
  estado: string;
}

type Err = { error: string; sugerencia?: string } | null;

/** Botón que muestra el costo estimado y pide confirmación si se supera el presupuesto. */
function AccionConCosto({
  proyectoId,
  accion,
  etiqueta,
  icono,
  alTerminar,
  deshabilitado,
}: {
  proyectoId: string;
  accion: AccionProduccion | null;
  etiqueta: string;
  icono: React.ReactNode;
  alTerminar?: () => void;
  deshabilitado?: boolean;
}) {
  const router = useRouter();
  const [estimado, setEstimado] = useState<{ imagenes: number; presupuesto: EstadoPresupuesto; modo: string } | null>(null);
  const [confirmar, setConfirmar] = useState<EstadoPresupuesto | null>(null);
  const [error, setError] = useState<Err>(null);
  const [cargando, iniciar] = useTransition();
  const clave = JSON.stringify(accion);

  useEffect(() => {
    if (!accion) return;
    let vivo = true;
    const t = setTimeout(() => {
      estimarAccion(proyectoId, accion).then((r) => {
        if (!vivo) return;
        if (r.ok) { setEstimado(r.datos); setError(null); } else setEstimado(null);
      });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, proyectoId]);

  const ejecutar = (confirmado: boolean) =>
    iniciar(async () => {
      if (!accion) return;
      setError(null);
      const r = await ejecutarAccion(proyectoId, accion, confirmado);
      if (!r.ok) return setError(r);
      const datos = r.datos;
      if ("requiereConfirmacion" in datos) return setConfirmar(datos.presupuesto);
      setConfirmar(null);
      alTerminar?.();
      router.refresh();
    });

  const costo = estimado ? (estimado.modo === "real" ? usd(estimado.presupuesto.estimado_usd) : "sin costo") : "…";
  return (
    <div className="grid gap-2">
      <Boton variante="secundario" disabled={cargando || deshabilitado || !accion} onClick={() => ejecutar(false)} className="justify-between">
        <span className="inline-flex items-center gap-2">{icono}{cargando ? "Enviando…" : etiqueta}</span>
        <span className="font-mono text-xs text-texto-3">{costo}</span>
      </Boton>
      {confirmar && (
        <div className="grid gap-2 rounded-control border border-[color-mix(in_srgb,var(--alerta)_40%,transparent)] bg-[color-mix(in_srgb,var(--alerta)_8%,transparent)] p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-alerta"><Warning size={16} weight="fill" />Supera el presupuesto</p>
          <p className="text-texto-2">
            Proyecto: {usd(confirmar.proyecto.tras_lote)} de {usd(confirmar.proyecto.presupuesto)} · Mes: {usd(confirmar.mes.tras_lote)} de {usd(confirmar.mes.presupuesto)}
          </p>
          <div className="flex gap-2">
            <Boton variante="primario" disabled={cargando} onClick={() => ejecutar(true)}>Generar igual ({usd(confirmar.estimado_usd)})</Boton>
            <Boton variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Boton>
          </div>
        </div>
      )}
      {error && <AvisoError {...error} />}
    </div>
  );
}

function Linaje({ g, porId, seleccionar }: { g: Generacion; porId: Map<string, Generacion>; seleccionar: (id: string) => void }) {
  const cadena: Generacion[] = [];
  let actual: Generacion | undefined = g;
  while (actual) {
    cadena.unshift(actual);
    actual = actual.parent_id ? porId.get(actual.parent_id) : undefined;
  }
  const hijos = [...porId.values()].filter((x) => x.parent_id === g.id);
  const nombre = (x: Generacion) => (x.caso_uso === "edicion" ? "Edición" : x.parent_id ? "Variación" : "Original");
  return (
    <div className="grid gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1 text-neutral-400">
        {cadena.map((x, i) => (
          <span key={x.id} className="inline-flex items-center gap-1">
            {i > 0 && <ArrowRight size={11} />}
            <button onClick={() => seleccionar(x.id)} className={`rounded px-1.5 py-0.5 ${x.id === g.id ? "bg-white/10 text-white" : "hover:text-white"}`}>{nombre(x)}</button>
          </span>
        ))}
      </div>
      {hijos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-neutral-500">
          Derivadas:
          {hijos.map((h) => (
            <button key={h.id} onClick={() => seleccionar(h.id)} className="h-10 w-8 overflow-hidden rounded bg-escenario-2 ring-1 ring-escenario-borde hover:ring-white/40" aria-label={`Ver ${nombre(h).toLowerCase()}`}>
              {h.url && <img src={h.url} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MesaProduccion({
  proyectoId,
  generaciones,
  modelos,
  proporcion,
}: {
  proyectoId: string;
  generaciones: Generacion[];
  modelos: ModeloOpcion[];
  proporcion: number;
}) {
  const porId = useMemo(() => new Map(generaciones.map((g) => [g.id, g])), [generaciones]);
  const listas = generaciones.filter((g) => g.estado === "lista" || g.estado === "rechazada_qc");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [indicacion, setIndicacion] = useState("");
  const [instruccion, setInstruccion] = useState("");
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? "");
  const [pasando, iniciarPaso] = useTransition();
  useGeneracionesEnVivo(proyectoId, generaciones.some(pendiente));

  const elegida = (seleccion && porId.get(seleccion)) || listas[listas.length - 1] || null;
  const ordenadas = [...generaciones].reverse();

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      {generaciones.some((g) => g.estado === "fallida") && (
        <div className="xl:col-span-2"><AvisoFallidas proyectoId={proyectoId} fallidas={generaciones.filter((g) => g.estado === "fallida").length} /></div>
      )}
      <section className="grid content-start gap-4 rounded-panel bg-escenario p-4 text-neutral-200 md:p-5">
        {generaciones.length === 0 ? (
          <div className="grid justify-items-start gap-3 py-6">
            <p className="text-lg font-semibold text-white">Aún no hay imágenes de esta ruta</p>
            <p className="max-w-[60ch] text-sm text-neutral-400">Genera las primeras muestras con los prompts de la ruta elegida. Después podrás variarlas, editarlas o probar otro modelo.</p>
            <div className="w-full max-w-xs">
              <AccionConCosto proyectoId={proyectoId} accion={{ tipo: "muestras", cantidad: 2 }} etiqueta="Generar 2 muestras" icono={<Sparkle size={16} />} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-4">
            {ordenadas.map((g) => (
              <div key={g.id} className={`rounded-control p-1 ${elegida?.id === g.id ? "ring-2 ring-acento" : ""}`}>
                <TarjetaGeneracion g={g} proporcion={proporcion} alElegir={() => setSeleccion(g.id)} proyectoId={proyectoId} />
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="grid content-start gap-4">
        {elegida ? (
          <>
            <div className="grid gap-3 rounded-panel bg-escenario p-4 text-neutral-200">
              <div className="overflow-hidden rounded-control bg-escenario-2" style={{ aspectRatio: String(proporcion) }}>
                {elegida.url && <img src={elegida.url} alt="Imagen seleccionada" className="h-full w-full object-contain" />}
              </div>
              <Linaje g={elegida} porId={porId} seleccionar={setSeleccion} />
              <p className="text-xs text-neutral-500">{elegida.modelo} · {elegida.ancho}×{elegida.alto}px</p>
            </div>

            <div className="grid gap-4 rounded-panel border border-borde bg-superficie p-4">
              <div className="grid gap-2">
                <label htmlFor="indicacion" className="text-sm font-medium">Variar</label>
                <input id="indicacion" value={indicacion} onChange={(e) => setIndicacion(e.target.value)} placeholder="Opcional: hacia dónde llevar la variación" className={claseCampo} />
                <AccionConCosto proyectoId={proyectoId} accion={{ tipo: "variar", base: elegida.id, cantidad: 2, indicacion }} etiqueta="2 variaciones" icono={<ArrowsClockwise size={16} />} />
              </div>
              <div className="grid gap-2 border-t border-borde pt-4">
                <label htmlFor="instruccion" className="text-sm font-medium">Editar con una instrucción</label>
                <textarea id="instruccion" rows={2} value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="Ej.: fondo más cálido, quita el objeto de la izquierda" className={claseCampo} />
                <AccionConCosto
                  proyectoId={proyectoId}
                  accion={instruccion.trim() ? { tipo: "editar", base: elegida.id, instruccion } : null}
                  etiqueta="Editar"
                  icono={<MagicWand size={16} />}
                  alTerminar={() => setInstruccion("")}
                />
              </div>
              <div className="grid gap-2 border-t border-borde pt-4">
                <label htmlFor="modelo" className="text-sm font-medium">Probar con otro modelo</label>
                <select id="modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)} className={claseCampo}>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.estado === "candidato" ? " (candidato)" : ""}</option>)}
                </select>
                <AccionConCosto proyectoId={proyectoId} accion={modeloId ? { tipo: "modelo", base: elegida.id, modeloId } : null} etiqueta="Regenerar con este modelo" icono={<Cpu size={16} />} />
              </div>
            </div>
          </>
        ) : generaciones.length > 0 ? (
          <p className="text-sm text-texto-2">Elige una imagen lista para variarla o editarla.</p>
        ) : null}

        <div className="grid gap-2 rounded-panel border border-borde bg-superficie p-4">
          <p className="text-sm text-texto-2">Cuando tengas el arte, arma la pieza con texto real y medidas de impresión.</p>
          <Boton variante="primario" disabled={pasando} onClick={() => iniciarPaso(() => pasarAComposicion(proyectoId))}>
            {pasando ? "Preparando…" : "Pasar a composición"} <ArrowRight size={16} />
          </Boton>
        </div>
      </aside>
    </div>
  );
}
