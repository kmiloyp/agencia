"use client";
import { ArrowClockwise, ImageSquare, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { actualizarReferencia, borrarReferencia, reanalizarReferencia, registrarReferencia } from "@/app/acciones/proyecto";
import { AvisoError, Boton, Muestras, claseCampo } from "@/components/ui";
import type { AnalisisReferencia } from "@/lib/agencia/esquemas";
import { crearClienteNavegador } from "@/lib/supabase/navegador";

type TipoRef = "me_gusta" | "no_me_gusta" | "inspiracion" | "activo_del_cliente" | "ya_visto";
const TIPOS: { valor: TipoRef; texto: string }[] = [
  { valor: "me_gusta", texto: "Me gusta" },
  { valor: "no_me_gusta", texto: "No me gusta" },
  { valor: "inspiracion", texto: "Inspiración" },
  { valor: "activo_del_cliente", texto: "Activo del cliente" },
  { valor: "ya_visto", texto: "Ya visto (no repetir)" },
];

export interface Referencia {
  id: string;
  url: string | null;
  tipo: TipoRef;
  nota: string | null;
  analisis: AnalisisReferencia | null;
  analisis_estado: "pendiente" | "analizando" | "listo" | "error";
  analisis_error: string | null;
}

interface PorSubir {
  archivo: File;
  vista: string;
  tipo: TipoRef;
  nota: string;
}

const MAX_MB = 20;
const EVENTO = "agencia:adjuntar";

/** Otros componentes (el chat) mandan imágenes al panel de referencias para clasificarlas. */
export function enviarAReferencias(archivos: FileList | File[]) {
  window.dispatchEvent(new CustomEvent<File[]>(EVENTO, { detail: Array.from(archivos) }));
}

function Tarjeta({ r }: { r: Referencia }) {
  const [pendiente, iniciar] = useTransition();
  const [abierta, setAbierta] = useState(false);
  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-3">
      <div className="h-[72px] w-[72px] overflow-hidden rounded-control bg-escenario">
        {r.url ? <img src={r.url} alt={r.nota ?? "Referencia"} className="h-full w-full object-cover" /> : <ImageSquare className="m-auto mt-6 text-texto-3" size={24} />}
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-center gap-2">
          <select
            aria-label="Tipo de referencia"
            defaultValue={r.tipo}
            onChange={(e) => iniciar(async () => { await actualizarReferencia(r.id, { tipo: e.target.value as TipoRef }); })}
            className="h-7 rounded-control border border-borde bg-superficie px-1.5 text-xs"
          >
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
          </select>
          <button aria-label="Borrar referencia" disabled={pendiente} onClick={() => iniciar(async () => { await borrarReferencia(r.id); })} className="ml-auto text-texto-3 hover:text-error">
            <Trash size={16} />
          </button>
        </div>
        {r.analisis_estado === "listo" && r.analisis ? (
          <button onClick={() => setAbierta(!abierta)} className="grid gap-1 text-left">
            <Muestras colores={r.analisis.paleta.slice(0, 6)} />
            <p className={`text-xs text-texto-2 ${abierta ? "" : "line-clamp-2"}`}>{r.analisis.resumen}</p>
            {abierta && (
              <div className="grid gap-1 text-xs text-texto-2">
                <p><span className="text-texto">Estilo:</span> {r.analisis.estilo}</p>
                <p><span className="text-texto">Técnica:</span> {r.analisis.tecnica}</p>
                <p><span className="text-texto">Tomar:</span> {r.analisis.que_tomar.join("; ")}</p>
                <p><span className="text-texto">Evitar:</span> {r.analisis.que_evitar.join("; ")}</p>
              </div>
            )}
          </button>
        ) : r.analisis_estado === "error" ? (
          <div className="flex items-center gap-2 text-xs text-error">
            <span className="truncate" title={r.analisis_error ?? ""}>No se pudo analizar.</span>
            <button className="inline-flex items-center gap-1 text-texto-2 hover:text-texto" onClick={() => iniciar(async () => { await reanalizarReferencia(r.id); })}>
              <ArrowClockwise size={14} /> Reintentar
            </button>
          </div>
        ) : (
          <p className="text-xs text-texto-3">Analizando con visión…</p>
        )}
      </div>
    </li>
  );
}

export function Referencias({ proyectoId, ownerId, iniciales, destacar }: { proyectoId: string; ownerId: string; iniciales: Referencia[]; destacar: boolean }) {
  const router = useRouter();
  const [porSubir, setPorSubir] = useState<PorSubir[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Realtime: el análisis termina en segundo plano; refresca al cambiar.
  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`referencias-${proyectoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "referencias", filter: `proyecto_id=eq.${proyectoId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [proyectoId, router]);

  const agregar = (archivos: FileList | File[]) => {
    const validos = Array.from(archivos).filter((a) => a.type.startsWith("image/") && a.size <= MAX_MB * 1024 * 1024);
    if (validos.length < Array.from(archivos).length) setError(`Solo se aceptan imágenes de hasta ${MAX_MB} MB.`);
    setPorSubir((p) => [...p, ...validos.map((archivo) => ({ archivo, vista: URL.createObjectURL(archivo), tipo: "inspiracion" as TipoRef, nota: "" }))]);
  };

  // Imágenes adjuntadas desde el chat.
  useEffect(() => {
    const recibir = (e: Event) => {
      agregar((e as CustomEvent<File[]>).detail);
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    window.addEventListener(EVENTO, recibir);
    return () => window.removeEventListener(EVENTO, recibir);
  });

  const subir = async () => {
    setSubiendo(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const pendientes = [...porSubir];
    for (const item of pendientes) {
      const ext = item.archivo.name.split(".").pop()?.toLowerCase() || "png";
      const ruta = `${ownerId}/${proyectoId}/${crypto.randomUUID()}.${ext}`;
      const { error: e1 } = await supabase.storage.from("referencias").upload(ruta, item.archivo, { contentType: item.archivo.type });
      if (e1) { console.error("[referencias] Storage", e1); setError(`No se pudo subir ${item.archivo.name}: ${e1.message}`); continue; }
      const r = await registrarReferencia(proyectoId, ruta, item.archivo.type, item.tipo, item.nota);
      if (!r.ok) { setError(r.error); continue; }
      URL.revokeObjectURL(item.vista);
      setPorSubir((p) => p.filter((x) => x !== item));
    }
    setSubiendo(false);
    router.refresh();
  };

  return (
    <section ref={panel} className={`grid content-start gap-3 rounded-panel border bg-superficie p-4 ${destacar || porSubir.length ? "border-acento" : "border-borde"}`} aria-label="Referencias">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Referencias</h2>
        <span className="text-xs text-texto-3">{iniciales.length} guardadas</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
        onClick={() => entrada.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") entrada.current?.click(); }}
        className={`grid cursor-pointer place-items-center gap-1 rounded-control border border-dashed px-4 py-6 text-center text-sm transition ${arrastrando ? "border-acento bg-acento-suave" : "border-borde hover:border-texto-3"}`}
      >
        <UploadSimple size={20} className="text-texto-2" />
        <span className="text-texto-2">Arrastra varias imágenes o haz clic</span>
        <span className="text-xs text-texto-3">Lo que te gusta, lo que no, lo ya visto e inspiración, más los logos del cliente</span>
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }} />
      </div>

      {porSubir.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm text-texto-2">Clasifica cada imagen y súbelas.</p>
          <ul className="grid gap-2">
            {porSubir.map((item, i) => (
              <li key={item.vista} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-2">
                <img src={item.vista} alt="" className="h-14 w-14 rounded-control object-cover" />
                <div className="grid gap-1.5">
                  <select
                    aria-label="Clasificación"
                    value={item.tipo}
                    onChange={(e) => setPorSubir((p) => p.map((x, j) => (j === i ? { ...x, tipo: e.target.value as TipoRef } : x)))}
                    className="h-8 rounded-control border border-borde bg-superficie px-2 text-sm"
                  >
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
                  </select>
                  <input
                    aria-label="Nota"
                    placeholder="Nota opcional: qué te gusta o qué evitar"
                    value={item.nota}
                    onChange={(e) => setPorSubir((p) => p.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)))}
                    className={`${claseCampo} h-8 py-1`}
                  />
                </div>
                <button aria-label="Quitar" onClick={() => setPorSubir((p) => p.filter((_, j) => j !== i))} className="text-texto-3 hover:text-texto"><X size={16} /></button>
              </li>
            ))}
          </ul>
          <Boton variante="primario" disabled={subiendo} onClick={subir}>
            {subiendo ? "Subiendo…" : `Subir ${porSubir.length} ${porSubir.length === 1 ? "referencia" : "referencias"}`}
          </Boton>
        </div>
      )}

      {error && <AvisoError error={error} />}

      {iniciales.length > 0 && <ul className="divide-y divide-borde">{iniciales.map((r) => <Tarjeta key={r.id} r={r} />)}</ul>}
    </section>
  );
}
