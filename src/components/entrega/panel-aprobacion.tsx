"use client";
import { Check, Copy, LinkSimple, ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cerrarAprobacion, crearAprobacion } from "@/app/acciones/aprobacion";
import { AvisoError, Boton, Estado, Panel, claseCampo } from "@/components/ui";
import type { EnvioCliente, OpcionAprobacion } from "@/lib/agencia/aprobacion";
import { crearClienteNavegador } from "@/lib/supabase/navegador";

export interface OpcionElegible {
  id: string;
  url: string;
  etiqueta: string;
}

export interface AprobacionHecha {
  id: string;
  titulo: string | null;
  estado: string;
  expira_en: string;
  created_at: string;
  opciones: OpcionAprobacion[];
  votos: EnvioCliente[];
}

export function PanelAprobacion({ proyectoId, elegibles, aprobaciones }: { proyectoId: string; elegibles: OpcionElegible[]; aprobaciones: AprobacionHecha[] }) {
  const router = useRouter();
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [dias, setDias] = useState(7);
  const [titulo, setTitulo] = useState("");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<{ error: string; sugerencia?: string } | null>(null);
  const [cargando, iniciar] = useTransition();

  // Los votos del cliente aparecen solos.
  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`aprobaciones-${proyectoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "aprobaciones", filter: `proyecto_id=eq.${proyectoId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [proyectoId, router]);

  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const crear = () =>
    iniciar(async () => {
      setError(null);
      const r = await crearAprobacion(proyectoId, marcadas, dias, titulo);
      if (!r.ok) return setError(r);
      setEnlace(r.datos.url);
      setMarcadas([]);
      router.refresh();
    });

  const tituloOpcion = (a: AprobacionHecha, id: string) => a.opciones.find((o) => o.generacion_id === id)?.titulo ?? "Opción";

  return (
    <Panel id="aprobacion" className="grid scroll-mt-6 gap-4 p-4">
      <div>
        <h2 className="font-medium">Aprobación del cliente</h2>
        <p className="text-sm text-texto-2">Elige qué opciones mostrar y comparte el enlace. El cliente vota y comenta sin crear cuenta; todo queda en el proyecto y en su memoria.</p>
      </div>

      {elegibles.length === 0 ? (
        <p className="text-sm text-texto-3">Aún no hay imágenes listas para mostrar.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {elegibles.map((o) => {
            const activa = marcadas.includes(o.id);
            return (
              <button key={o.id} onClick={() => alternar(o.id)} aria-pressed={activa} className={`relative overflow-hidden rounded-control bg-escenario ring-2 ${activa ? "ring-acento" : "ring-transparent hover:ring-borde"}`}>
                <img src={o.url} alt={o.etiqueta} className="aspect-[3/4] w-full object-cover" />
                {activa && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-acento text-sobre-acento"><Check size={12} weight="bold" /></span>}
                <span className="block truncate px-1 py-1 text-left text-[11px] text-neutral-300">{o.etiqueta}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-texto-2">
          Mensaje para el cliente (opcional)
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Propuestas de portada, segunda ronda" className={`${claseCampo} w-72`} />
        </label>
        <label className="grid gap-1 text-xs text-texto-2">
          Vence en
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={`${claseCampo} w-32`}>
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>
        <Boton variante="primario" disabled={cargando || marcadas.length === 0} onClick={crear}>
          <LinkSimple size={16} />{cargando ? "Creando…" : `Crear enlace (${marcadas.length})`}
        </Boton>
      </div>

      {enlace && (
        <div className="grid gap-2 rounded-control border border-acento bg-acento-suave p-3 text-sm">
          <p className="font-medium">Enlace listo. Cópialo ahora: por seguridad no se vuelve a mostrar.</p>
          <div className="flex gap-2">
            <input readOnly value={enlace} className={`${claseCampo} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <Boton onClick={async () => { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
              {copiado ? <Check size={16} /> : <Copy size={16} />}{copiado ? "Copiado" : "Copiar"}
            </Boton>
          </div>
          {enlace.includes("localhost") && <p className="text-xs text-texto-2">Este enlace usa localhost: solo funciona en tu computador. En producción (Vercel) saldrá con tu dominio.</p>}
        </div>
      )}
      {error && <AvisoError {...error} />}

      {aprobaciones.length > 0 && (
        <ul className="grid gap-3 border-t border-borde pt-4">
          {aprobaciones.map((a) => {
            const vencida = new Date(a.expira_en) < new Date();
            return (
              <li key={a.id} className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.titulo ?? `${a.opciones.length} opciones`}</span>
                  <span className="flex items-center gap-2">
                    <Estado tono={a.estado === "abierta" && !vencida ? "ok" : "neutro"}>{a.estado === "abierta" ? (vencida ? "Vencida" : "Abierta") : "Cerrada"}</Estado>
                    {a.estado === "abierta" && !vencida && <button onClick={() => iniciar(async () => { await cerrarAprobacion(a.id, proyectoId); router.refresh(); })} className="text-xs text-texto-2 hover:text-texto">Cerrar</button>}
                  </span>
                </div>
                {a.votos.length === 0 ? (
                  <p className="text-xs text-texto-3">Sin respuestas todavía.</p>
                ) : (
                  a.votos.map((v, i) => (
                    <div key={i} className="grid gap-1 rounded-control bg-superficie-2 p-2 text-xs">
                      <p><span className="font-medium">{v.nombre}</span> <span className="text-texto-3">{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v.fecha))}</span></p>
                      {v.opciones.filter((o) => o.voto || o.comentario).map((o) => (
                        <p key={o.generacion_id} className="flex items-start gap-1.5">
                          {o.voto === "me_gusta" ? <ThumbsUp size={13} className="mt-0.5 text-ok" weight="fill" /> : o.voto === "no_me_gusta" ? <ThumbsDown size={13} className="mt-0.5 text-error" weight="fill" /> : <span className="w-[13px]" />}
                          <span><span className="text-texto-2">{tituloOpcion(a, o.generacion_id)}</span>{o.comentario ? `: ${o.comentario}` : ""}</span>
                        </p>
                      ))}
                      {v.comentario && <p className="text-texto-2">&ldquo;{v.comentario}&rdquo;</p>}
                    </div>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
