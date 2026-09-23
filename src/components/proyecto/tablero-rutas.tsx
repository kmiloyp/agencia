"use client";
import { Check, ClipboardText, DownloadSimple, PaperPlaneRight, Prohibit, Sparkle, UploadSimple, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { descartarRuta, elegirRuta, estimarLote, generarLote, pedirRutas, reabrirRutas, registrarReferencia, subirMockupExterno } from "@/app/acciones/proyecto";
import { AvisoError, Boton, clasesBoton, claseCampo, Estado, Muestras } from "@/components/ui";
import { PALANCAS, type Palanca } from "@/lib/agencia/esquemas";
import { usd } from "@/lib/formato";
import type { EstadoPresupuesto } from "@/lib/motor-creativo/costos";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { useGeneracionesEnVivo } from "./en-vivo";
import { pendiente, TarjetaGeneracion, type Generacion } from "./generacion";
import { AvisoFallidas, reintentar } from "./reintento";

export interface Ruta {
  id: string;
  nombre: string;
  concepto: string;
  palanca: Palanca | null;
  metafora: string | null;
  evita: string | null;
  paleta: string[];
  tipografias: string[];
  mood: string | null;
  por_que_encaja: string | null;
  estado: "propuesta" | "elegida" | "descartada";
  motivo_descarte: string | null;
  prompt_mockup: string | null;
}

export interface Archivo {
  id: string;
  url: string;
  nota: string | null;
}

type Err = { error: string; sugerencia?: string } | null;

const NOMBRE_PALANCA: Record<Palanca, string> = {
  oficio_del_cliente: "Oficio del cliente",
  tipografica: "Tipográfica",
  sistema_grafico: "Sistema gráfico",
  fotografia_de_material: "Fotografía de material",
  dibujo_tecnico: "Dibujo técnico",
  bloque_de_color: "Bloque de color",
  ilustracion_de_autor: "Ilustración de autor",
  acabado_tactil: "Acabado táctil",
  prestamo_de_otra_industria: "Préstamo de otra industria",
  narrativa: "Narrativa",
};

async function dimensiones(archivo: File) {
  const url = URL.createObjectURL(archivo);
  const img = new window.Image();
  await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
  URL.revokeObjectURL(url);
  return { ancho: img.naturalWidth, alto: img.naturalHeight };
}

// ---------------------------------------------------------------------------
function TerritorioAgotado({ proyectoId, ownerId, yaVisto }: { proyectoId: string; ownerId: string; yaVisto: Archivo[] }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const subir = async (archivos: FileList) => {
    setSubiendo(true); setError(null);
    const supabase = crearClienteNavegador();
    for (const f of Array.from(archivos).filter((a) => a.type.startsWith("image/"))) {
      const ruta = `${ownerId}/${proyectoId}/${crypto.randomUUID()}.${f.name.split(".").pop()?.toLowerCase() || "png"}`;
      const { error: e } = await supabase.storage.from("referencias").upload(ruta, f, { contentType: f.type });
      if (e) { setError(e.message); continue; }
      const r = await registrarReferencia(proyectoId, ruta, f.type, "ya_visto", "Propuesta ya vista");
      if (!r.ok) setError(r.error);
    }
    setSubiendo(false);
    router.refresh();
  };

  return (
    <section
      className="grid gap-3 rounded-panel border border-borde bg-superficie p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) subir(e.dataTransfer.files); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="flex items-center gap-2 font-medium"><Prohibit size={18} className="text-error" />Territorio agotado</h2>
          <p className="text-sm text-texto-2">Sube lo que el cliente ya vio (tuyo o de otras agencias). El director creativo lo analiza y prohíbe repetir su metáfora, su paleta y su composición.</p>
        </div>
        <Boton disabled={subiendo} onClick={() => entrada.current?.click()}>
          <UploadSimple size={16} />{subiendo ? "Subiendo…" : "Subir lo ya visto"}
        </Boton>
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = ""; }} />
      </div>
      {yaVisto.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {yaVisto.map((a) => (
            <img key={a.id} src={a.url} alt={a.nota ?? "Ya visto"} className="h-20 w-auto shrink-0 rounded-control border border-borde object-cover opacity-80" />
          ))}
        </div>
      )}
      {error && <AvisoError error={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
function PanelLote({ proyectoId, hayMockups }: { proyectoId: string; hayMockups: boolean }) {
  const router = useRouter();
  const [estimado, setEstimado] = useState<{ imagenes: number; presupuesto: EstadoPresupuesto; modo: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<Err>(null);
  const [cargando, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    estimarLote(proyectoId).then((r) => { if (vivo) { if (r.ok) setEstimado(r.datos); else setError(r); } });
    return () => { vivo = false; };
  }, [proyectoId, hayMockups]);

  if (!estimado || estimado.imagenes === 0) return error ? <AvisoError {...error} /> : null;
  const p = estimado.presupuesto;
  const real = estimado.modo === "real";
  const generar = (confirmado: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await generarLote(proyectoId, confirmado);
      if (!r.ok) return setError(r);
      if ("requiereConfirmacion" in r.datos) return setConfirmar(true);
      setConfirmar(false);
      router.refresh();
    });
  return (
    <div className="grid gap-2 rounded-panel border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          <span className="font-medium">{estimado.imagenes} {estimado.imagenes === 1 ? "ruta sin mockup" : "rutas sin mockup"}.</span>{" "}
          <span className="text-texto-2">Genéralas aquí, o copia cada prompt a ChatGPT y sube el resultado.</span>
        </p>
        <Boton variante="primario" disabled={cargando} onClick={() => generar(false)}>
          <Sparkle size={16} />{cargando ? "Enviando…" : "Generar todos aquí"}
          <span className="font-mono text-xs opacity-80">{real ? usd(p.estimado_usd) : "sin costo"}</span>
        </Boton>
      </div>
      {confirmar && real && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-[color-mix(in_srgb,var(--alerta)_40%,transparent)] p-3 text-sm">
          <Warning size={16} weight="fill" className="text-alerta" />
          <span className="text-texto-2">Supera el presupuesto: el proyecto quedaría en {usd(p.proyecto.tras_lote)} de {usd(p.proyecto.presupuesto)}.</span>
          <Boton variante="primario" onClick={() => generar(true)}>Generar igual</Boton>
          <Boton variante="fantasma" onClick={() => setConfirmar(false)}>Cancelar</Boton>
        </div>
      )}
      {error && <AvisoError {...error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TarjetaRuta({
  proyectoId,
  ownerId,
  ruta,
  letra,
  mockups,
  costoUnidad,
  hayElegida,
}: {
  proyectoId: string;
  ownerId: string;
  ruta: Ruta;
  letra: string;
  mockups: Generacion[];
  costoUnidad: string;
  hayElegida: boolean;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<Err>(null);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [cargando, iniciar] = useTransition();
  const [vista, setVista] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const actual = mockups[Math.min(vista, mockups.length - 1)];

  const copiar = async () => {
    if (!ruta.prompt_mockup) return;
    await navigator.clipboard.writeText(ruta.prompt_mockup);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 4000);
  };

  const generarAqui = () =>
    iniciar(async () => {
      setError(null);
      const r = await generarLote(proyectoId, false, [ruta.id]);
      if (!r.ok) return setError(r);
      if ("requiereConfirmacion" in r.datos) {
        if (!window.confirm(`Supera el presupuesto del proyecto (${usd(r.datos.presupuesto.proyecto.tras_lote)} de ${usd(r.datos.presupuesto.proyecto.presupuesto)}). ¿Generar igual?`)) return;
        const r2 = await generarLote(proyectoId, true, [ruta.id]);
        if (!r2.ok) return setError(r2);
      }
      setVista(0);
      router.refresh();
    });

  const subirExterno = (f: File) =>
    iniciar(async () => {
      setError(null);
      try {
        const { ancho, alto } = await dimensiones(f);
        const destino = `${ownerId}/${proyectoId}/externo-${crypto.randomUUID()}.${f.name.split(".").pop()?.toLowerCase() || "png"}`;
        const { error: e } = await crearClienteNavegador().storage.from("generaciones").upload(destino, f, { contentType: f.type });
        if (e) throw new Error(e.message);
        const r = await subirMockupExterno(proyectoId, ruta.id, destino, ancho, alto);
        if (!r.ok) setError(r);
        setVista(0);
        router.refresh();
      } catch (e) {
        setError({ error: "No se pudo subir la imagen.", sugerencia: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <article className={`grid content-start gap-3 rounded-panel bg-escenario p-4 text-neutral-200 ring-1 ${ruta.estado === "elegida" ? "ring-2 ring-acento" : "ring-escenario-borde"}`}>
      <div>
        {actual ? (
          actual.estado === "fallida" ? (
            <div className="grid aspect-[4/3] content-center justify-items-center gap-2 rounded-control bg-escenario-2 p-4 text-center text-xs text-red-300">
              {actual.error}
              <button onClick={() => iniciar(async () => { setError(await reintentar(proyectoId, [actual.id])); router.refresh(); })} className="rounded-control bg-white/10 px-3 py-1.5 text-white hover:bg-white/15">Reintentar</button>
            </div>
          ) : (
            <TarjetaGeneracion g={actual} proporcion={actual.ancho && actual.alto ? actual.ancho / actual.alto : 4 / 3} proyectoId={proyectoId} />
          )
        ) : (
          <div className="grid aspect-[4/3] place-items-center rounded-control border border-dashed border-escenario-borde p-4 text-center text-xs text-neutral-500">
            Sin mockup todavía
          </div>
        )}
        {mockups.length > 1 && (
          <div className="mt-2 flex gap-1.5">
            {mockups.map((m, i) => (
              <button key={m.id} onClick={() => setVista(i)} aria-label={`Ver mockup ${i + 1}`} className={`h-9 w-12 overflow-hidden rounded bg-escenario-2 ring-1 ${i === vista ? "ring-acento" : "ring-escenario-borde"}`}>
                {m.url && <img src={m.url} alt="" className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>Ruta {letra}</span>
          {ruta.palanca && <span className="rounded-full bg-white/10 px-2 py-0.5 text-neutral-300" title={PALANCAS[ruta.palanca]}>{NOMBRE_PALANCA[ruta.palanca]}</span>}
          {ruta.estado === "elegida" && <span className="rounded-full bg-acento px-2 py-0.5 text-sobre-acento">Elegida</span>}
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-white">{ruta.nombre}</h3>
        <p className="text-sm leading-relaxed text-neutral-300">{ruta.concepto}</p>
      </header>

      <dl className="grid gap-1.5 text-sm">
        {ruta.metafora && <div><dt className="inline text-neutral-500">Del oficio: </dt><dd className="inline text-neutral-300">{ruta.metafora}</dd></div>}
        {ruta.evita && <div><dt className="inline text-neutral-500">Evita: </dt><dd className="inline text-neutral-300">{ruta.evita}</dd></div>}
        <div className="flex items-center justify-between gap-2 pt-1"><Muestras colores={ruta.paleta} tamano="md" /><span className="text-xs text-neutral-400">{ruta.tipografias.join(" + ")}</span></div>
      </dl>

      {ruta.estado !== "descartada" && (
        <div className="grid gap-2 border-t border-escenario-borde pt-3">
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={copiar} disabled={!ruta.prompt_mockup} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-white/10 px-2 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40" title="Copia el prompt para pegarlo en ChatGPT con el logo adjunto">
              {copiado ? <Check size={14} /> : <ClipboardText size={14} />}{copiado ? "Copiado" : "Copiar prompt"}
            </button>
            <button onClick={generarAqui} disabled={cargando || mockups.some(pendiente)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-white/10 px-2 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50">
              <Sparkle size={14} />{mockups.some(pendiente) ? "Generando…" : `Generar ${costoUnidad}`}
            </button>
            <button onClick={() => entrada.current?.click()} disabled={cargando} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-white/10 px-2 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50" title="Sube la imagen que obtuviste en ChatGPT">
              <UploadSimple size={14} />Subir resultado
            </button>
            <input ref={entrada} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) subirExterno(f); e.target.value = ""; }} />
          </div>
          {copiado && <p className="text-xs text-neutral-400">Pégalo en ChatGPT y adjunta el logo del cliente. Luego sube aquí la imagen que te dé.</p>}
          {ruta.estado === "propuesta" && !hayElegida && (
            descartando ? (
              <form
                className="grid gap-2"
                onSubmit={(e) => { e.preventDefault(); iniciar(async () => { const r = await descartarRuta(proyectoId, ruta.id, motivo); if (!r.ok) setError(r); router.refresh(); }); }}
              >
                <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué no funciona? Queda en la memoria del cliente" className={`${claseCampo} border-escenario-borde bg-escenario-2 text-neutral-100`} />
                <div className="flex gap-2">
                  <button className="h-8 rounded-control bg-white/10 px-3 text-sm text-white hover:bg-white/15">Descartar</button>
                  <button type="button" onClick={() => setDescartando(false)} className="h-8 px-2 text-sm text-neutral-400 hover:text-white">Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="flex gap-2">
                <button
                  disabled={cargando}
                  onClick={() => iniciar(async () => { const r = await elegirRuta(proyectoId, ruta.id); if (!r.ok) setError(r); router.refresh(); })}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control bg-white text-sm font-medium text-neutral-900 hover:bg-neutral-200"
                >
                  <Check size={16} weight="bold" />Elegir esta ruta
                </button>
                <button onClick={() => setDescartando(true)} className="h-9 rounded-control px-3 text-sm text-neutral-400 hover:bg-white/5 hover:text-white">Descartar</button>
              </div>
            )
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error.error}{error.sugerencia ? ` ${error.sugerencia}` : ""}</p>}
    </article>
  );
}

// ---------------------------------------------------------------------------
export function TableroRutas({
  proyectoId,
  ownerId,
  rutas,
  generaciones,
  yaVisto,
  logos,
}: {
  proyectoId: string;
  ownerId: string;
  rutas: Ruta[];
  generaciones: Generacion[];
  yaVisto: Archivo[];
  logos: Archivo[];
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState(6);
  const [pidiendo, iniciarPedido] = useTransition();
  const [error, setError] = useState<Err>(null);
  const [costoUnidad, setCostoUnidad] = useState("");
  useGeneracionesEnVivo(proyectoId, generaciones.some(pendiente));

  const vivas = rutas.filter((r) => r.estado !== "descartada");
  const descartadas = rutas.filter((r) => r.estado === "descartada");
  const elegida = rutas.find((r) => r.estado === "elegida");
  const mockupsDe = (id: string) => generaciones.filter((g) => g.ruta_id === id && g.caso_uso === "mockup").reverse();
  const primera = vivas[0]?.id;

  useEffect(() => {
    if (!primera) return;
    let vivo = true;
    estimarLote(proyectoId, [primera]).then((r) => {
      if (vivo && r.ok) setCostoUnidad(r.datos.modo === "real" ? `≈${usd(r.datos.presupuesto.estimado_usd)}` : "gratis");
    });
    return () => { vivo = false; };
  }, [proyectoId, primera]);

  const pedir = () => iniciarPedido(async () => { setError(null); const r = await pedirRutas(proyectoId, cantidad); if (!r.ok) setError(r); router.refresh(); });

  return (
    <div className="grid gap-6">
      <TerritorioAgotado proyectoId={proyectoId} ownerId={ownerId} yaVisto={yaVisto} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Rutas creativas</h2>
          <p className="max-w-[70ch] text-sm text-texto-2">Cada ruta usa una palanca distinta y una metáfora del oficio del cliente. Un segundo director revisa todo y descarta los clichés antes de mostrártelas.</p>
        </div>
        {!elegida && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-texto-2">
              Rutas
              <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="h-9 rounded-control border border-borde bg-superficie px-2 text-sm">
                {[4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <Boton variante={vivas.length ? "secundario" : "primario"} disabled={pidiendo} onClick={pedir}>
              <Sparkle size={16} />{pidiendo ? "Pensando…" : vivas.length ? "Proponer rutas nuevas" : "Proponer rutas"}
            </Boton>
          </div>
        )}
      </div>

      {pidiendo && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          <p className="text-sm text-texto-2 md:col-span-2 xl:col-span-3">El equipo propone {cantidad + 3} ideas y el director creativo se queda con las {cantidad} mejores. Tarda de dos a cuatro minutos.</p>
          {Array.from({ length: cantidad }, (_, i) => <div key={i} className="h-80 animate-pulse rounded-panel bg-escenario" />)}
        </div>
      )}
      {error && <AvisoError {...error} />}

      {!pidiendo && vivas.length > 0 && (
        <>
          <AvisoFallidas proyectoId={proyectoId} fallidas={generaciones.filter((g) => g.estado === "fallida" && g.caso_uso !== "mockup").length} />
          {!elegida && <PanelLote proyectoId={proyectoId} hayMockups={generaciones.some((g) => g.caso_uso === "mockup")} />}
          {logos.length > 0 && (
            <p className="flex flex-wrap items-center gap-3 text-sm text-texto-2">
              Logo para adjuntar en ChatGPT:
              {logos.map((l) => (
                <a key={l.id} href={l.url} download className="inline-flex items-center gap-1 text-texto hover:text-acento"><DownloadSimple size={14} />{l.nota ?? "logo"}</a>
              ))}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vivas.map((r, i) => (
              <TarjetaRuta
                key={r.id}
                proyectoId={proyectoId}
                ownerId={ownerId}
                ruta={r}
                letra={String.fromCharCode(65 + i)}
                mockups={mockupsDe(r.id)}
                costoUnidad={costoUnidad}
                hayElegida={!!elegida}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {elegida ? (
              <span className="flex flex-wrap items-center gap-3">
                <Estado tono="acento">Ruta elegida: {elegida.nombre}. Sigue en Producción.</Estado>
                <button onClick={() => iniciarPedido(async () => { const r = await reabrirRutas(proyectoId); if (!r.ok) setError(r); router.refresh(); })} className="text-sm text-texto-2 underline-offset-2 hover:text-texto hover:underline">
                  Volver a explorar
                </button>
              </span>
            ) : <span />}
            <Link href={`/proyectos/${proyectoId}/entrega#aprobacion`} className={clasesBoton("secundario")}>
              <PaperPlaneRight size={16} /> Enviar opciones al cliente
            </Link>
          </div>
        </>
      )}

      {descartadas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-texto-2 hover:text-texto">{descartadas.length} {descartadas.length === 1 ? "ruta descartada" : "rutas descartadas"} (el director no las repite)</summary>
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
