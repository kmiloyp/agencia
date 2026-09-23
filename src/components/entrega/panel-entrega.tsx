"use client";
import { ArrowsOut, DownloadSimple, FilePdf, FileSvg, ImageSquare, Info, Warning } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { consultarResolucion, escalarImagenes, exportarPDFImpresion, exportarSVG, registrarPNG } from "@/app/acciones/entrega";
import { cargarFuente } from "@/components/composicion/fuentes-navegador";
import type { CaraEditor, ControlLienzo } from "@/components/composicion/lienzo";
import { useGeneracionesEnVivo } from "@/components/proyecto/en-vivo";
import { AvisoError, Boton, Estado, Panel } from "@/components/ui";
import type { FilaResolucion } from "@/lib/agencia/entrega";
import type { CapaTexto } from "@/lib/composicion/tipos";
import { usd } from "@/lib/formato";
import type { EstadoPresupuesto } from "@/lib/motor-creativo/costos";
import { crearClienteNavegador } from "@/lib/supabase/navegador";

const Lienzo = dynamic(() => import("@/components/composicion/lienzo").then((m) => m.Lienzo), { ssr: false });

type Err = { error: string; sugerencia?: string } | null;

const TEXTO_ESTADO: Record<FilaResolucion["estado"], { t: string; tono: "ok" | "alerta" | "acento" | "error" | "neutro" }> = {
  ok: { t: "Lista", tono: "ok" },
  bajo: { t: "Baja resolución", tono: "alerta" },
  escalando: { t: "Escalando…", tono: "acento" },
  escalado: { t: "Escalada", tono: "ok" },
  fallo_escalado: { t: "Falló el escalado", tono: "error" },
};

function Resolucion({ proyectoId }: { proyectoId: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<{ filas: FilaResolucion[]; imagenes: number; presupuesto: EstadoPresupuesto; modo: string } | null>(null);
  const [error, setError] = useState<Err>(null);
  const [confirmar, setConfirmar] = useState<EstadoPresupuesto | null>(null);
  const [cargando, iniciar] = useTransition();

  const cargar = useCallback(() => consultarResolucion(proyectoId).then((r) => (r.ok ? setDatos(r.datos) : setError(r))), [proyectoId]);
  useEffect(() => { void cargar(); }, [cargar]);
  const escalando = !!datos?.filas.some((f) => f.estado === "escalando");
  useGeneracionesEnVivo(proyectoId, escalando);
  useEffect(() => {
    if (!escalando) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [escalando, cargar]);

  const escalar = (confirmado: boolean) =>
    iniciar(async () => {
      setError(null);
      const r = await escalarImagenes(proyectoId, confirmado);
      if (!r.ok) return setError(r);
      if ("requiereConfirmacion" in r.datos) return setConfirmar(r.datos.presupuesto);
      setConfirmar(null);
      await cargar();
      router.refresh();
    });

  if (!datos) return error ? <AvisoError {...error} /> : <div className="h-24 animate-pulse rounded-panel bg-superficie-2" />;
  const faltan = datos.imagenes;
  return (
    <Panel className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Resolución para impresión</h2>
          <p className="text-sm text-texto-2">Cada imagen se compara con el objetivo de {datos.filas[0]?.dpiObjetivo ?? 300} dpi a su tamaño en la pieza.</p>
        </div>
        {faltan > 0 && (
          <Boton variante="primario" disabled={cargando} onClick={() => escalar(false)}>
            <ArrowsOut size={16} />{cargando ? "Enviando…" : `Escalar ${faltan} ${faltan === 1 ? "imagen" : "imágenes"}`}
            <span className="font-mono text-xs opacity-80">{datos.modo === "real" ? usd(datos.presupuesto.estimado_usd) : "sin costo"}</span>
          </Boton>
        )}
      </div>
      {datos.filas.length === 0 ? (
        <p className="text-sm text-texto-3">La composición no tiene imágenes.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {datos.filas.map((f, i) => (
            <li key={`${f.archivo}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-control px-2 py-1.5 odd:bg-superficie-2">
              <span className="min-w-0 truncate"><span className="text-texto-3">{f.cara} · </span>{f.capa}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-texto-2">{f.vector ? "vector" : f.estado === "escalado" ? `${f.dpi} → ${f.dpiFinal} dpi` : `${f.dpi} dpi`}</span>
                <Estado tono={TEXTO_ESTADO[f.estado].tono}>{TEXTO_ESTADO[f.estado].t}</Estado>
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmar && (
        <div className="grid gap-2 rounded-control border border-[color-mix(in_srgb,var(--alerta)_40%,transparent)] bg-[color-mix(in_srgb,var(--alerta)_8%,transparent)] p-3 text-sm">
          <p className="font-medium text-alerta">El escalado supera el presupuesto ({usd(confirmar.proyecto.tras_lote)} de {usd(confirmar.proyecto.presupuesto)}).</p>
          <div className="flex gap-2"><Boton variante="primario" onClick={() => escalar(true)}>Escalar igual ({usd(confirmar.estimado_usd)})</Boton><Boton variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Boton></div>
        </div>
      )}
      {error && <AvisoError {...error} />}
    </Panel>
  );
}

function Exportar({ proyectoId, ownerId, caras, urls, urlsFuentes, titulo, hayVector }: {
  proyectoId: string;
  ownerId: string;
  caras: CaraEditor[];
  urls: Record<string, string>;
  urlsFuentes: Record<string, string>;
  titulo: string;
  hayVector: boolean;
}) {
  const router = useRouter();
  const [marcas, setMarcas] = useState(true);
  const [error, setError] = useState<Err>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [trabajo, setTrabajo] = useState<string | null>(null);
  const [versionFuentes, setVersionFuentes] = useState(0);
  const [lienzoListo, setLienzoListo] = useState(false);
  const control = useRef<ControlLienzo | null>(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    const fuentes = caras.flatMap((c) => c.composicion.capas).filter((c): c is CapaTexto => c.tipo === "texto").map((c) => c.texto.fuente);
    Promise.all(fuentes.map((f) => cargarFuente(f, f.archivo ? urlsFuentes[f.archivo] : undefined))).then(() => setVersionFuentes((v) => v + 1));
  }, [caras, urlsFuentes]);

  const alControl = useCallback((c: ControlLienzo | null, listo: boolean) => { control.current = c; setLienzoListo(listo); }, []);

  const pdf = () =>
    iniciar(async () => {
      setTrabajo("pdf"); setError(null); setAvisos([]);
      const r = await exportarPDFImpresion(proyectoId, marcas);
      setTrabajo(null);
      if (!r.ok) return setError(r);
      setAvisos(r.datos.avisos);
      if (r.datos.url) window.location.href = r.datos.url;
      router.refresh();
    });

  const png = async () => {
    if (!control.current) return;
    setTrabajo("png"); setError(null);
    try {
      const supabase = crearClienteNavegador();
      const base = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const rutas: string[] = [];
      for (const c of caras) {
        const url = control.current.exportarCara(c.id, 2400);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        const ruta = `${ownerId}/${proyectoId}/${base}-${c.cara}-web-${Date.now()}.png`;
        const { error: e } = await supabase.storage.from("entregas").upload(ruta, blob, { contentType: "image/png" });
        if (e) throw new Error(e.message);
        rutas.push(ruta);
      }
      const r = await registrarPNG(proyectoId, rutas);
      if (!r.ok) setError(r);
      router.refresh();
    } catch (e) {
      setError({ error: "No se pudieron generar los PNG.", sugerencia: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabajo(null);
    }
  };

  const svg = () =>
    iniciar(async () => {
      setTrabajo("svg"); setError(null);
      const r = await exportarSVG(proyectoId);
      setTrabajo(null);
      if (!r.ok) setError(r);
      router.refresh();
    });

  return (
    <Panel className="grid gap-4 p-4">
      <h2 className="font-medium">Exportar</h2>
      <div className="flex gap-2 rounded-control border border-borde bg-superficie-2 p-3 text-sm">
        <Info size={18} className="mt-0.5 shrink-0 text-texto-2" />
        <p className="text-texto-2"><span className="font-medium text-texto">El PDF sale en RGB.</span> La conversión a CMYK, el perfil de impresión y la separación se hacen en preprensa. Los textos van como texto vectorial con la fuente incrustada.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid content-start gap-2 rounded-control border border-borde p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><FilePdf size={18} />PDF de impresión</p>
          <p className="text-xs text-texto-2">Tamaño final + sangrado, una página por cara, imágenes a 300 dpi.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marcas} onChange={(e) => setMarcas(e.target.checked)} className="accent-[var(--acento)]" />Marcas de corte</label>
          <Boton variante="primario" disabled={!!trabajo || !caras.length} onClick={pdf}>{trabajo === "pdf" ? "Generando PDF…" : "Exportar PDF"}</Boton>
        </div>
        <div className="grid content-start gap-2 rounded-control border border-borde p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><ImageSquare size={18} />PNG web y redes</p>
          <p className="text-xs text-texto-2">Solo el área de corte, 2400 px en el lado largo.</p>
          <Boton disabled={!!trabajo || !lienzoListo || !caras.length} onClick={png}>{trabajo === "png" ? "Generando PNG…" : lienzoListo ? "Exportar PNG" : "Preparando…"}</Boton>
        </div>
        <div className="grid content-start gap-2 rounded-control border border-borde p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><FileSvg size={18} />SVG de logos</p>
          <p className="text-xs text-texto-2">Archivos vectoriales aprobados o usados en la pieza.</p>
          <Boton disabled={!!trabajo || !hayVector} onClick={svg}>{trabajo === "svg" ? "Copiando…" : hayVector ? "Exportar SVG" : "Sin vectores"}</Boton>
        </div>
      </div>
      {avisos.length > 0 && (
        <div className="grid gap-1 rounded-control border border-[color-mix(in_srgb,var(--alerta)_40%,transparent)] p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-alerta"><Warning size={16} weight="fill" />Revisa antes de imprimir</p>
          <ul className="list-disc pl-5 text-texto-2">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {error && <AvisoError {...error} />}
      {/* Render fuera de pantalla para los PNG (mismo motor que el editor). */}
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[20000px] h-[900px] w-[1400px]">
        <Lienzo caras={caras} urls={urls} zoom={1} guias={false} modo="exportar" versionFuentes={versionFuentes} alto="900px" onControl={alControl} />
      </div>
    </Panel>
  );
}

export interface EntregaHecha {
  id: string;
  formato: string;
  fecha: string;
  archivos: { nombre: string; url: string }[];
  avisos: string[];
}

const NOMBRE_FORMATO: Record<string, string> = { pdf_impresion: "PDF de impresión", png_web: "PNG web", svg: "SVG" };

export function PanelEntrega(props: {
  proyectoId: string;
  ownerId: string;
  caras: CaraEditor[];
  urls: Record<string, string>;
  urlsFuentes: Record<string, string>;
  titulo: string;
  hayVector: boolean;
  entregas: EntregaHecha[];
}) {
  return (
    <div className="grid gap-4">
      <Resolucion proyectoId={props.proyectoId} />
      <Exportar {...props} />
      {props.entregas.length > 0 && (
        <Panel className="grid gap-2 p-4">
          <h2 className="font-medium">Archivos entregados</h2>
          <ul className="grid gap-2 text-sm">
            {props.entregas.map((e) => (
              <li key={e.id} className="grid gap-1 rounded-control px-2 py-2 odd:bg-superficie-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{NOMBRE_FORMATO[e.formato] ?? e.formato}</span>
                  <span className="text-xs text-texto-3">{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.fecha))}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {e.archivos.map((a) => (
                    <a key={a.url} href={a.url} className="inline-flex items-center gap-1 text-texto-2 hover:text-acento"><DownloadSimple size={14} />{a.nombre}</a>
                  ))}
                </div>
                {e.avisos.length > 0 && <p className="text-xs text-alerta">{e.avisos.length} {e.avisos.length === 1 ? "aviso" : "avisos"}: {e.avisos.join(" ")}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
