"use client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
  Circle,
  Copy,
  Eye,
  EyeSlash,
  FrameCorners,
  ImageSquare,
  Lock,
  LockOpen,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Square,
  TextT,
  Trash,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firmarArchivos, guardarComposicion } from "@/app/acciones/composicion";
import { registrarReferencia } from "@/app/acciones/proyecto";
import { Boton, clasesBoton, claseCampo } from "@/components/ui";
import {
  type Capa,
  type CapaImagen,
  type CapaTexto,
  type Composicion,
  dpiEfectivo,
  esVector,
  type Fuente,
  nuevoId,
  tamanoPliego,
} from "@/lib/composicion/tipos";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { cargarFuente, FUENTES_SUGERIDAS } from "./fuentes-navegador";
import type { CaraEditor } from "./lienzo";

const Lienzo = dynamic(() => import("./lienzo").then((m) => m.Lienzo), {
  ssr: false,
  loading: () => <div className="h-[min(72dvh,820px)] animate-pulse rounded-panel bg-escenario" />,
});

export interface ImagenDisponible {
  archivo: string; // bucket/ruta
  url: string;
  etiqueta: string;
  generacion_id?: string;
  referencia_id?: string;
  mime?: string | null;
}

export interface FuenteSubida {
  familia: string;
  archivo: string; // ruta dentro del bucket fuentes
  url: string;
}

type EstadoGuardado = "guardado" | "guardando" | "pendiente" | "error";

const redondear = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
function SelectorImagen({
  arte,
  activos,
  alElegir,
  alCerrar,
  alSubir,
}: {
  arte: ImagenDisponible[];
  activos: ImagenDisponible[];
  alElegir: (img: ImagenDisponible, comoFondo: boolean) => void;
  alCerrar: () => void;
  alSubir: (f: File) => Promise<void>;
}) {
  const [pestana, setPestana] = useState<"arte" | "activos">(arte.length ? "arte" : "activos");
  const [subiendo, setSubiendo] = useState(false);
  const lista = pestana === "arte" ? arte : activos;
  return (
    <div role="dialog" aria-modal="true" aria-label="Elegir imagen" className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={alCerrar}>
      <div className="grid max-h-[85dvh] w-full max-w-3xl grid-rows-[auto_1fr_auto] gap-4 overflow-hidden rounded-panel border border-borde bg-superficie p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 border-b border-borde">
          {(["arte", "activos"] as const).map((p) => (
            <button key={p} onClick={() => setPestana(p)} className={`-mb-px border-b-2 px-3 pb-2 text-sm ${pestana === p ? "border-acento font-medium" : "border-transparent text-texto-2"}`}>
              {p === "arte" ? `Arte generado (${arte.length})` : `Logos y archivos del cliente (${activos.length})`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 content-start gap-3 overflow-y-auto sm:grid-cols-4">
          {lista.length === 0 && <p className="col-span-full text-sm text-texto-2">{pestana === "arte" ? "Aún no hay imágenes listas en Producción." : "Sube el logo u otros archivos del cliente."}</p>}
          {lista.map((img) => (
            <button key={img.archivo} onClick={() => alElegir(img, pestana === "arte")} className="grid gap-1 rounded-control p-1 text-left hover:bg-superficie-2">
              <span className="grid aspect-square place-items-center overflow-hidden rounded-control bg-[repeating-conic-gradient(#8882_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                <img src={img.url} alt={img.etiqueta} className="max-h-full max-w-full object-contain" />
              </span>
              <span className="truncate text-xs text-texto-2">{img.etiqueta}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className={clasesBoton("secundario", "cursor-pointer")}>
            <UploadSimple size={16} /> {subiendo ? "Subiendo…" : "Subir logo o imagen"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setSubiendo(true);
                await alSubir(f);
                setSubiendo(false);
                setPestana("activos");
                e.target.value = "";
              }}
            />
          </label>
          <Boton variante="fantasma" onClick={alCerrar}>Cerrar</Boton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Numero({ etiqueta, valor, alCambiar, paso = 0.5, sufijo = "mm" }: { etiqueta: string; valor: number; alCambiar: (n: number) => void; paso?: number; sufijo?: string }) {
  return (
    <label className="grid gap-1 text-xs text-texto-2">
      {etiqueta}
      <span className="flex items-center rounded-control border border-borde bg-superficie focus-within:border-acento">
        <input
          type="number"
          step={paso}
          value={redondear(valor)}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) alCambiar(n); }}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 font-mono text-sm text-texto focus:outline-none"
        />
        <span className="pr-2 text-texto-3">{sufijo}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
export function Editor({
  proyectoId,
  ownerId,
  carasIniciales,
  piezaInicial,
  urlsIniciales,
  arte,
  activosIniciales,
  fuentesSubidas: fuentesSubidasIniciales,
  tipografiasRuta,
  paleta,
  textosBrief,
}: {
  proyectoId: string;
  ownerId: string;
  carasIniciales: CaraEditor[];
  piezaInicial: string;
  urlsIniciales: Record<string, string>;
  arte: ImagenDisponible[];
  activosIniciales: ImagenDisponible[];
  fuentesSubidas: FuenteSubida[];
  tipografiasRuta: string[];
  paleta: string[];
  textosBrief: string[];
}) {
  const [caras, setCaras] = useState(carasIniciales);
  const [activa, setActiva] = useState(piezaInicial);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [urls, setUrls] = useState(urlsIniciales);
  const [activos, setActivos] = useState(activosIniciales);
  const [fuentesSubidas, setFuentesSubidas] = useState(fuentesSubidasIniciales);
  const [zoom, setZoom] = useState(1);
  const [guias, setGuias] = useState(true);
  const [selector, setSelector] = useState(false);
  const [versionFuentes, setVersionFuentes] = useState(0);
  const [guardado, setGuardado] = useState<EstadoGuardado>("guardado");
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const pendientes = useRef(new Set<string>());
  const historial = useRef<{ pasado: CaraEditor[][]; futuro: CaraEditor[][] }>({ pasado: [], futuro: [] });

  const cara = caras.find((c) => c.id === activa) ?? caras[0];
  const capa = cara.composicion.capas.find((c) => c.id === seleccion) ?? null;
  const pliego = tamanoPliego(cara.formato);
  const urlFuente = useCallback((f: Fuente) => fuentesSubidas.find((x) => x.archivo === f.archivo)?.url, [fuentesSubidas]);

  // --- Tipografías: cargar las usadas y redibujar cuando terminen ---------------
  useEffect(() => {
    const usadas = caras.flatMap((c) => c.composicion.capas).filter((c): c is CapaTexto => c.tipo === "texto").map((c) => c.texto.fuente);
    Promise.all(usadas.map((f) => cargarFuente(f, urlFuente(f)))).then(() => setVersionFuentes((v) => v + 1));
  }, [caras, urlFuente]);

  // --- Mutaciones con historial y autoguardado --------------------------------
  const mutar = useCallback((caraId: string, fn: (c: Composicion) => Composicion, registrar = true) => {
    setCaras((actuales) => {
      if (registrar) {
        historial.current.pasado = [...historial.current.pasado.slice(-60), actuales];
        historial.current.futuro = [];
      }
      return actuales.map((c) => (c.id === caraId ? { ...c, composicion: fn(c.composicion) } : c));
    });
    pendientes.current.add(caraId);
    setGuardado("pendiente");
  }, []);

  const cambiarCapa = useCallback(
    (caraId: string, capaId: string, parcial: Partial<Capa>) =>
      mutar(caraId, (c) => ({ ...c, capas: c.capas.map((k) => (k.id === capaId ? ({ ...k, ...parcial } as Capa) : k)) })),
    [mutar],
  );

  const deshacer = useCallback(() => {
    const h = historial.current;
    const previo = h.pasado.pop();
    if (!previo) return;
    setCaras((actuales) => {
      h.futuro.push(actuales);
      previo.forEach((c) => pendientes.current.add(c.id));
      return previo;
    });
    setGuardado("pendiente");
  }, []);
  const rehacer = useCallback(() => {
    const h = historial.current;
    const siguiente = h.futuro.pop();
    if (!siguiente) return;
    setCaras((actuales) => {
      h.pasado.push(actuales);
      siguiente.forEach((c) => pendientes.current.add(c.id));
      return siguiente;
    });
    setGuardado("pendiente");
  }, []);

  useEffect(() => {
    if (guardado !== "pendiente") return;
    const t = setTimeout(async () => {
      const ids = [...pendientes.current];
      pendientes.current.clear();
      setGuardado("guardando");
      const resultados = await Promise.all(ids.map((id) => guardarComposicion(id, caras.find((c) => c.id === id)!.composicion)));
      const fallo = resultados.find((r) => !r.ok);
      if (fallo && !fallo.ok) {
        ids.forEach((id) => pendientes.current.add(id));
        setErrorGuardado(fallo.error);
        setGuardado("error");
      } else {
        setErrorGuardado(null);
        setGuardado(pendientes.current.size ? "pendiente" : "guardado");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [guardado, caras]);

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => { if (guardado !== "guardado") e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [guardado]);

  // --- Acciones sobre capas ----------------------------------------------------
  const agregar = (nueva: Capa) => {
    mutar(cara.id, (c) => ({ ...c, capas: [...c.capas, nueva] }));
    setSeleccion(nueva.id);
  };
  const borrar = () => { if (capa) { mutar(cara.id, (c) => ({ ...c, capas: c.capas.filter((k) => k.id !== capa.id) })); setSeleccion(null); } };
  const duplicar = () => { if (capa) agregar({ ...capa, id: nuevoId(), nombre: `${capa.nombre} (copia)`, x: capa.x + 4, y: capa.y + 4 } as Capa); };
  const mover = (id: string, dir: 1 | -1) =>
    mutar(cara.id, (c) => {
      const i = c.capas.findIndex((k) => k.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.capas.length) return c;
      const capas = [...c.capas];
      [capas[i], capas[j]] = [capas[j], capas[i]];
      return { ...c, capas };
    });

  const base = { rotacion: 0, opacidad: 1, visible: true, bloqueada: false };
  const s = cara.formato.sangrado_mm;

  const agregarTexto = (contenido = "Texto") => {
    const familia = tipografiasRuta[0] ?? "Space Grotesk";
    const ancho = cara.formato.ancho_mm * 0.8;
    agregar({
      ...base,
      id: nuevoId(),
      nombre: contenido.slice(0, 24) || "Texto",
      tipo: "texto",
      x: s + (cara.formato.ancho_mm - ancho) / 2,
      y: s + cara.formato.alto_mm * 0.4,
      ancho,
      alto: 12,
      texto: { contenido, fuente: { familia, peso: 700, cursiva: false }, tamano_pt: 20, color: paleta.find((c) => c.toLowerCase() !== "#ffffff") ?? "#1b1b1d", alineacion: "center", interlineado: 1.15, espaciado_mm: 0, mayusculas: false },
    });
  };

  const agregarForma = (figura: "rect" | "elipse") =>
    agregar({
      ...base,
      id: nuevoId(),
      nombre: figura === "rect" ? "Rectángulo" : "Elipse",
      tipo: "forma",
      x: s + 20,
      y: s + 20,
      ancho: 40,
      alto: figura === "rect" ? 20 : 40,
      forma: { figura, relleno: paleta[2] ?? "#2E8FCB", borde: null, grosor_mm: 0.5, radio_mm: 0 },
    });

  const colocarImagen = (img: ImagenDisponible, comoFondo: boolean) => {
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => {
      const w = el.naturalWidth || 1024;
      const h = el.naturalHeight || 1024;
      let ancho: number, alto: number, x: number, y: number;
      if (comoFondo) {
        // Cubre el pliego completo (con sangrado), centrado.
        const k = Math.max(pliego.ancho / w, pliego.alto / h);
        ancho = w * k; alto = h * k;
        x = (pliego.ancho - ancho) / 2; y = (pliego.alto - alto) / 2;
      } else {
        ancho = cara.formato.ancho_mm * 0.35; alto = (ancho * h) / w;
        x = s + (cara.formato.ancho_mm - ancho) / 2; y = s + (cara.formato.alto_mm - alto) / 2;
      }
      const nueva: CapaImagen = {
        ...base,
        id: nuevoId(),
        nombre: img.etiqueta.slice(0, 30),
        tipo: "imagen",
        x, y, ancho, alto,
        imagen: { archivo: img.archivo, generacion_id: img.generacion_id ?? null, referencia_id: img.referencia_id ?? null, ancho_px: w, alto_px: h, mime: img.mime ?? null },
      };
      setUrls((u) => ({ ...u, [img.archivo]: img.url }));
      if (comoFondo) {
        mutar(cara.id, (c) => ({ ...c, capas: [nueva, ...c.capas] }));
        setSeleccion(nueva.id);
      } else agregar(nueva);
      setSelector(false);
    };
    el.src = img.url;
  };

  const subirActivo = async (f: File) => {
    const supabase = crearClienteNavegador();
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const ruta = `${ownerId}/${proyectoId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("referencias").upload(ruta, f, { contentType: f.type });
    if (error) return alert(`No se pudo subir: ${error.message}`);
    const r = await registrarReferencia(proyectoId, ruta, f.type, "activo_del_cliente", f.name, false);
    const { data } = await supabase.storage.from("referencias").createSignedUrl(ruta, 6 * 3600);
    if (data) setActivos((a) => [{ archivo: `referencias/${ruta}`, url: data.signedUrl, etiqueta: f.name, referencia_id: r.ok ? r.datos.id : undefined, mime: f.type }, ...a]);
  };

  const subirFuente = async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["ttf", "otf"].includes(ext ?? "")) return alert("Sube la tipografía en formato .ttf u .otf (el PDF las necesita así).");
    const familia = f.name.replace(/\.(ttf|otf)$/i, "").replace(/[-_]+/g, " ").trim();
    const ruta = `${ownerId}/${familia.replace(/[^a-z0-9 ]/gi, "").replace(/ +/g, "-")}.${ext}`;
    const supabase = crearClienteNavegador();
    const { error } = await supabase.storage.from("fuentes").upload(ruta, f, { contentType: ext === "otf" ? "font/otf" : "font/ttf", upsert: true });
    if (error) return alert(`No se pudo subir la fuente: ${error.message}`);
    const { data } = await supabase.storage.from("fuentes").createSignedUrl(ruta, 6 * 3600);
    if (data) {
      setFuentesSubidas((l) => [...l.filter((x) => x.archivo !== ruta), { familia, archivo: ruta, url: data.signedUrl }]);
      if (capa?.tipo === "texto") cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, fuente: { familia, peso: 400, cursiva: false, archivo: ruta } } } as Partial<Capa>);
    }
  };

  // Renueva URLs firmadas si una imagen deja de cargar (sesiones largas).
  useEffect(() => {
    const t = setInterval(async () => {
      const archivos = Object.keys(urls);
      if (!archivos.length) return;
      const r = await firmarArchivos(archivos);
      if (r.ok) setUrls(r.datos);
    }, 5 * 3600 * 1000);
    return () => clearInterval(t);
  }, [urls]);

  // --- Teclado -----------------------------------------------------------------
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const enCampo = (e.target as HTMLElement).closest("input, textarea, select");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); return; }
      if (enCampo || !capa) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); borrar(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicar(); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 0.5;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        cambiarCapa(cara.id, capa.id, { x: capa.x + dx, y: capa.y + dy });
      } else if (e.key === "Escape") setSeleccion(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const familias = useMemo(
    () => [...new Set([...tipografiasRuta, ...fuentesSubidas.map((f) => f.familia), ...FUENTES_SUGERIDAS])],
    [tipografiasRuta, fuentesSubidas],
  );

  const capasInvertidas = [...cara.composicion.capas].reverse();
  const etiquetaGuardado = { guardado: "Guardado", guardando: "Guardando…", pendiente: "Cambios sin guardar", error: "Error al guardar" }[guardado];

  return (
    <div className="grid gap-4">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <Boton onClick={() => setSelector(true)}><ImageSquare size={16} />Imagen o logo</Boton>
        <Boton onClick={() => agregarTexto()}><TextT size={16} />Texto</Boton>
        {textosBrief.length > 0 && (
          <select
            aria-label="Insertar texto del brief"
            value=""
            onChange={(e) => { if (e.target.value) agregarTexto(e.target.value); }}
            className="h-9 max-w-52 rounded-control border border-borde bg-superficie px-2 text-sm text-texto-2"
          >
            <option value="">Texto del brief…</option>
            {textosBrief.map((t) => <option key={t} value={t}>{t.slice(0, 70)}</option>)}
          </select>
        )}
        <Boton onClick={() => agregarForma("rect")} aria-label="Rectángulo"><Square size={16} /></Boton>
        <Boton onClick={() => agregarForma("elipse")} aria-label="Elipse"><Circle size={16} /></Boton>
        <span className="mx-1 h-6 w-px bg-borde" />
        <Boton variante="fantasma" onClick={deshacer} aria-label="Deshacer (⌘Z)"><ArrowUUpLeft size={16} /></Boton>
        <Boton variante="fantasma" onClick={rehacer} aria-label="Rehacer (⌘⇧Z)"><ArrowUUpRight size={16} /></Boton>
        <Boton variante="fantasma" onClick={() => setZoom((z) => Math.max(0.4, z / 1.25))} aria-label="Alejar"><MagnifyingGlassMinus size={16} /></Boton>
        <button onClick={() => setZoom(1)} className="w-12 text-center font-mono text-xs text-texto-2 hover:text-texto" title="Ajustar a la pantalla">{Math.round(zoom * 100)}%</button>
        <Boton variante="fantasma" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label="Acercar"><MagnifyingGlassPlus size={16} /></Boton>
        <Boton variante={guias ? "secundario" : "fantasma"} onClick={() => setGuias(!guias)}><FrameCorners size={16} />Guías</Boton>
        <span className={`ml-auto text-xs ${guardado === "error" ? "text-error" : "text-texto-3"}`} title={errorGuardado ?? ""} aria-live="polite">{etiquetaGuardado}</span>
        <Link href={`/proyectos/${proyectoId}/entrega`} className={clasesBoton("primario")}>Ir a entrega</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-2">
          <Lienzo
            caras={caras}
            activa={cara.id}
            seleccion={seleccion}
            urls={urls}
            zoom={zoom}
            guias={guias}
            versionFuentes={versionFuentes}
            onElegirCara={setActiva}
            onSeleccionar={(caraId, capaId) => { setActiva(caraId); setSeleccion(capaId); }}
            onCambiar={cambiarCapa}
          />
          {guias && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-3">
              <span><span className="mr-1 inline-block h-2 w-3 bg-[#38bdf8]" />Corte final {cara.formato.ancho_mm}×{cara.formato.alto_mm} mm</span>
              <span><span className="mr-1 inline-block h-2 w-3 bg-[rgba(255,80,80,0.5)]" />Sangrado {s} mm</span>
              <span><span className="mr-1 inline-block h-2 w-3 bg-[#f472b6]" />Zona segura {cara.formato.zona_segura_mm} mm</span>
              {cara.formato.margen_anillado_mm && <span><span className="mr-1 inline-block h-2 w-3 bg-[rgba(224,106,52,0.6)]" />Anillado {cara.formato.margen_anillado_mm} mm ({cara.formato.lado_anillado})</span>}
            </p>
          )}
        </div>

        <aside className="grid content-start gap-4">
          {/* Capas */}
          <section className="grid gap-2 rounded-panel border border-borde bg-superficie p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Capas · {cara.cara}</h2>
              <label className="flex items-center gap-2 text-xs text-texto-2">
                Fondo
                <input type="color" value={cara.composicion.fondo} onChange={(e) => mutar(cara.id, (c) => ({ ...c, fondo: e.target.value }))} className="h-6 w-8 cursor-pointer rounded border border-borde bg-transparent" />
              </label>
            </div>
            {capasInvertidas.length === 0 && <p className="py-2 text-xs text-texto-3">Añade el arte, los textos y el logo desde la barra de arriba.</p>}
            <ul className="grid gap-0.5">
              {capasInvertidas.map((k) => (
                <li key={k.id} className={`group flex items-center gap-1 rounded-control px-1.5 py-1 text-sm ${k.id === seleccion ? "bg-acento-suave" : "hover:bg-superficie-2"}`}>
                  <button onClick={() => setSeleccion(k.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {k.tipo === "imagen" ? <ImageSquare size={14} /> : k.tipo === "texto" ? <TextT size={14} /> : <Square size={14} />}
                    <span className={`truncate ${k.visible ? "" : "text-texto-3 line-through"}`}>{k.nombre}</span>
                    {k.tipo === "imagen" && !esVector(k) && dpiEfectivo(k) < cara.formato.dpi_objetivo * 0.95 && <Warning size={13} className="shrink-0 text-alerta" weight="fill" />}
                  </button>
                  <button aria-label="Subir" onClick={() => mover(k.id, 1)} className="p-0.5 text-texto-3 hover:text-texto"><ArrowUp size={13} /></button>
                  <button aria-label="Bajar" onClick={() => mover(k.id, -1)} className="p-0.5 text-texto-3 hover:text-texto"><ArrowDown size={13} /></button>
                  <button aria-label={k.visible ? "Ocultar" : "Mostrar"} onClick={() => cambiarCapa(cara.id, k.id, { visible: !k.visible })} className="p-0.5 text-texto-3 hover:text-texto">{k.visible ? <Eye size={13} /> : <EyeSlash size={13} />}</button>
                  <button aria-label={k.bloqueada ? "Desbloquear" : "Bloquear"} onClick={() => cambiarCapa(cara.id, k.id, { bloqueada: !k.bloqueada })} className="p-0.5 text-texto-3 hover:text-texto">{k.bloqueada ? <Lock size={13} /> : <LockOpen size={13} />}</button>
                </li>
              ))}
            </ul>
          </section>

          {/* Propiedades */}
          {capa && (
            <section className="grid gap-3 rounded-panel border border-borde bg-superficie p-3">
              <div className="flex items-center gap-2">
                <input aria-label="Nombre de la capa" value={capa.nombre} onChange={(e) => cambiarCapa(cara.id, capa.id, { nombre: e.target.value })} className={`${claseCampo} py-1`} />
                <button aria-label="Duplicar (⌘D)" onClick={duplicar} className="p-1 text-texto-2 hover:text-texto"><Copy size={16} /></button>
                <button aria-label="Borrar" onClick={borrar} className="p-1 text-texto-2 hover:text-error"><Trash size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Numero etiqueta="X" valor={capa.x} alCambiar={(x) => cambiarCapa(cara.id, capa.id, { x })} />
                <Numero etiqueta="Y" valor={capa.y} alCambiar={(y) => cambiarCapa(cara.id, capa.id, { y })} />
                <Numero etiqueta="Ancho" valor={capa.ancho} alCambiar={(ancho) => cambiarCapa(cara.id, capa.id, capa.tipo === "imagen" ? { ancho, alto: (ancho * capa.alto) / capa.ancho } : { ancho })} />
                {capa.tipo !== "texto" && <Numero etiqueta="Alto" valor={capa.alto} alCambiar={(alto) => cambiarCapa(cara.id, capa.id, capa.tipo === "imagen" ? { alto, ancho: (alto * capa.ancho) / capa.alto } : { alto })} />}
                <Numero etiqueta="Rotación" valor={capa.rotacion} paso={1} sufijo="°" alCambiar={(rotacion) => cambiarCapa(cara.id, capa.id, { rotacion })} />
                <Numero etiqueta="Opacidad" valor={capa.opacidad * 100} paso={5} sufijo="%" alCambiar={(o) => cambiarCapa(cara.id, capa.id, { opacidad: Math.min(1, Math.max(0, o / 100)) })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton className="h-8 text-xs" onClick={() => cambiarCapa(cara.id, capa.id, { x: s + (cara.formato.ancho_mm - capa.ancho) / 2 })}>Centrar horizontal</Boton>
                <Boton className="h-8 text-xs" onClick={() => cambiarCapa(cara.id, capa.id, { y: s + (cara.formato.alto_mm - capa.alto) / 2 })}>Centrar vertical</Boton>
                {capa.tipo === "imagen" && (
                  <Boton className="h-8 text-xs" onClick={() => {
                    const k = Math.max(pliego.ancho / capa.ancho, pliego.alto / capa.alto);
                    const ancho = capa.ancho * k, alto = capa.alto * k;
                    cambiarCapa(cara.id, capa.id, { ancho, alto, x: (pliego.ancho - ancho) / 2, y: (pliego.alto - alto) / 2, rotacion: 0 });
                  }}>Cubrir pliego</Boton>
                )}
              </div>

              {capa.tipo === "imagen" && (() => {
                const dpi = dpiEfectivo(capa);
                const bajo = !esVector(capa) && dpi < cara.formato.dpi_objetivo * 0.95;
                return (
                  <p className={`text-xs ${bajo ? "text-alerta" : "text-texto-3"}`}>
                    {esVector(capa) ? "Vectorial: se imprime nítida a cualquier tamaño." : `${dpi} dpi efectivos (objetivo ${cara.formato.dpi_objetivo}).${bajo ? " Se escalará en Entrega." : ""}`}
                  </p>
                );
              })()}

              {capa.tipo === "texto" && (
                <div className="grid gap-2 border-t border-borde pt-3">
                  <textarea
                    aria-label="Contenido"
                    rows={3}
                    value={capa.texto.contenido}
                    onChange={(e) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, contenido: e.target.value } } as Partial<Capa>)}
                    className={claseCampo}
                  />
                  <label className="grid gap-1 text-xs text-texto-2">
                    Tipografía
                    <input
                      list="familias"
                      value={capa.texto.fuente.familia}
                      onChange={(e) => {
                        const subida = fuentesSubidas.find((f) => f.familia === e.target.value);
                        cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, fuente: { ...capa.texto.fuente, familia: e.target.value, archivo: subida?.archivo ?? null } } } as Partial<Capa>);
                      }}
                      className={`${claseCampo} py-1.5`}
                    />
                    <datalist id="familias">{familias.map((f) => <option key={f} value={f} />)}</datalist>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-xs text-texto-2">
                      Peso
                      <select value={capa.texto.fuente.peso} onChange={(e) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, fuente: { ...capa.texto.fuente, peso: Number(e.target.value) } } } as Partial<Capa>)} className={`${claseCampo} py-1.5`}>
                        {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <Numero etiqueta="Tamaño" valor={capa.texto.tamano_pt} paso={0.5} sufijo="pt" alCambiar={(n) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, tamano_pt: Math.max(1, n) } } as Partial<Capa>)} />
                    <Numero etiqueta="Interlineado" valor={capa.texto.interlineado} paso={0.05} sufijo="×" alCambiar={(n) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, interlineado: Math.max(0.5, n) } } as Partial<Capa>)} />
                    <Numero etiqueta="Espaciado" valor={capa.texto.espaciado_mm} paso={0.1} alCambiar={(n) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, espaciado_mm: n } } as Partial<Capa>)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-texto-2">
                    <input type="color" aria-label="Color del texto" value={capa.texto.color} onChange={(e) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, color: e.target.value } } as Partial<Capa>)} className="h-7 w-9 cursor-pointer rounded border border-borde bg-transparent" />
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} onClick={() => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, alineacion: a } } as Partial<Capa>)} className={`rounded px-2 py-1 ${capa.texto.alineacion === a ? "bg-superficie-2 text-texto" : "hover:text-texto"}`}>
                        {{ left: "Izq.", center: "Centro", right: "Der." }[a]}
                      </button>
                    ))}
                    <label className="flex items-center gap-1"><input type="checkbox" checked={capa.texto.fuente.cursiva} onChange={(e) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, fuente: { ...capa.texto.fuente, cursiva: e.target.checked } } } as Partial<Capa>)} className="accent-[var(--acento)]" />Cursiva</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={capa.texto.mayusculas} onChange={(e) => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, mayusculas: e.target.checked } } as Partial<Capa>)} className="accent-[var(--acento)]" />Mayúsculas</label>
                  </div>
                  {paleta.length > 0 && (
                    <div className="flex gap-1">
                      {paleta.map((c) => <button key={c} aria-label={`Color ${c}`} onClick={() => cambiarCapa(cara.id, capa.id, { texto: { ...capa.texto, color: c } } as Partial<Capa>)} className="h-5 w-5 rounded-full border border-black/15" style={{ background: c }} />)}
                    </div>
                  )}
                  <label className="cursor-pointer text-xs text-texto-2 underline-offset-2 hover:text-texto hover:underline">
                    Subir tipografía propia (.ttf / .otf)
                    <input type="file" accept=".ttf,.otf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFuente(f); e.target.value = ""; }} />
                  </label>
                </div>
              )}

              {capa.tipo === "forma" && (
                <div className="grid gap-2 border-t border-borde pt-3 text-xs text-texto-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!capa.forma.relleno} onChange={(e) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, relleno: e.target.checked ? paleta[0] ?? "#2E8FCB" : null } } as Partial<Capa>)} className="accent-[var(--acento)]" />Relleno
                    </label>
                    {capa.forma.relleno && <input type="color" aria-label="Color de relleno" value={capa.forma.relleno} onChange={(e) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, relleno: e.target.value } } as Partial<Capa>)} className="h-7 w-9 cursor-pointer rounded border border-borde bg-transparent" />}
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!capa.forma.borde} onChange={(e) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, borde: e.target.checked ? "#1b1b1d" : null } } as Partial<Capa>)} className="accent-[var(--acento)]" />Borde
                    </label>
                    {capa.forma.borde && <input type="color" aria-label="Color de borde" value={capa.forma.borde} onChange={(e) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, borde: e.target.value } } as Partial<Capa>)} className="h-7 w-9 cursor-pointer rounded border border-borde bg-transparent" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {capa.forma.borde && <Numero etiqueta="Grosor" valor={capa.forma.grosor_mm} paso={0.1} alCambiar={(n) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, grosor_mm: Math.max(0.05, n) } } as Partial<Capa>)} />}
                    {capa.forma.figura === "rect" && <Numero etiqueta="Esquinas" valor={capa.forma.radio_mm} paso={0.5} alCambiar={(n) => cambiarCapa(cara.id, capa.id, { forma: { ...capa.forma, radio_mm: Math.max(0, n) } } as Partial<Capa>)} />}
                  </div>
                </div>
              )}
            </section>
          )}
          <p className="text-xs text-texto-3">Atajos: flechas mueven 0,5 mm (Shift: 5 mm), ⌘D duplica, Supr borra, ⌘Z deshace.</p>
        </aside>
      </div>

      {selector && <SelectorImagen arte={arte} activos={activos} alElegir={colocarImagen} alCerrar={() => setSelector(false)} alSubir={subirActivo} />}
    </div>
  );
}
