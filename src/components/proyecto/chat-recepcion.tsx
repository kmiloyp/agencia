"use client";
import { Paperclip, PaperPlaneRight } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { crearTipoPieza, enviarMensaje, responderRecepcion } from "@/app/acciones/proyecto";
import { AvisoError, Boton } from "@/components/ui";
import type { TipoNuevo } from "@/lib/agencia/esquemas";
import { enviarAReferencias } from "./referencias";

export interface Mensaje {
  id: string;
  rol: "usuario" | "agencia";
  contenido: string;
  meta: { pedir_referencias?: boolean; propuesta_tipo_nuevo?: TipoNuevo | null; brief_listo?: boolean };
}

function PropuestaTipo({ proyectoId, tipo }: { proyectoId: string; tipo: TipoNuevo }) {
  const [pendiente, iniciar] = useTransition();
  const [hecho, setHecho] = useState(false);
  return (
    <div className="mt-2 grid gap-2 rounded-control border border-borde bg-fondo p-3 text-sm">
      <p className="font-medium">Plantilla nueva: {tipo.nombre}</p>
      <p className="text-texto-2">
        {tipo.ancho_mm} × {tipo.alto_mm} mm, sangrado {tipo.sangrado_mm} mm{tipo.lomo_mm ? `, lomo ${tipo.lomo_mm} mm` : ""}. Caras: {tipo.caras.join(", ")}.
      </p>
      <div>
        <Boton
          variante="secundario"
          disabled={pendiente || hecho}
          onClick={() => iniciar(async () => { const r = await crearTipoPieza(proyectoId, tipo); if (r.ok) setHecho(true); })}
        >
          {hecho ? "Plantilla creada" : pendiente ? "Creando…" : "Crear plantilla"}
        </Boton>
      </div>
    </div>
  );
}

export function ChatRecepcion({ proyectoId, iniciales, briefAprobado }: { proyectoId: string; iniciales: Mensaje[]; briefAprobado: boolean }) {
  const router = useRouter();
  // Mensaje del usuario mostrado antes de que el servidor lo confirme.
  const [optimista, setOptimista] = useState<Mensaje | null>(null);
  const confirmado = optimista && iniciales.some((m) => m.rol === "usuario" && m.contenido === optimista.contenido && iniciales.indexOf(m) >= iniciales.length - 2);
  const mensajes = optimista && !confirmado ? [...iniciales, optimista] : iniciales;
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<{ error: string; sugerencia?: string } | null>(null);
  const final = useRef<HTMLDivElement>(null);
  const autoRespondido = useRef(false);
  const adjunto = useRef<HTMLInputElement>(null);
  const [soltando, setSoltando] = useState(false);

  useEffect(() => {
    final.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length, pensando]);

  const ejecutar = async (accion: () => ReturnType<typeof responderRecepcion>) => {
    setPensando(true);
    setError(null);
    const r = await accion();
    setPensando(false);
    if (!r.ok) setError(r);
    router.refresh();
  };

  // Si el proyecto se creó con un primer mensaje, el ejecutivo responde solo.
  useEffect(() => {
    if (autoRespondido.current) return;
    if (iniciales.length && iniciales[iniciales.length - 1].rol === "usuario") {
      autoRespondido.current = true;
      void Promise.resolve().then(() => ejecutar(() => responderRecepcion(proyectoId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviar = () => {
    const limpio = texto.trim();
    if (!limpio || pensando) return;
    setOptimista({ id: `local-${Date.now()}`, rol: "usuario", contenido: limpio, meta: {} });
    setTexto("");
    ejecutar(() => enviarMensaje(proyectoId, limpio));
  };

  const ultimo = mensajes[mensajes.length - 1];
  const reintentar = error && ultimo?.rol === "usuario";

  return (
    <section
      className={`flex min-h-[420px] flex-col rounded-panel border bg-superficie ${soltando ? "border-acento" : "border-borde"}`}
      aria-label="Conversación con el ejecutivo de cuenta"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setSoltando(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSoltando(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setSoltando(false); enviarAReferencias(e.dataTransfer.files); } }}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-4 md:max-h-[62dvh]">
        {mensajes.length === 0 && (
          <p className="text-sm text-texto-2">Cuéntale a tu ejecutivo de cuenta qué necesitas. Te hará las preguntas justas y armará el brief contigo.</p>
        )}
        {mensajes.map((m) =>
          m.rol === "usuario" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-panel rounded-br-sm bg-superficie-2 px-3.5 py-2.5 text-sm">
              {m.contenido}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] text-sm leading-relaxed">
              <div className="prosa"><ReactMarkdown>{m.contenido}</ReactMarkdown></div>
              {m.meta?.propuesta_tipo_nuevo && <PropuestaTipo proyectoId={proyectoId} tipo={m.meta.propuesta_tipo_nuevo} />}
              {m.meta?.brief_listo && !briefAprobado && (
                <p className="mt-2 text-xs font-medium text-acento">El brief está listo debajo para que lo revises.</p>
              )}
            </div>
          ),
        )}
        {pensando && (
          <div className="flex items-center gap-2 text-sm text-texto-3" aria-live="polite">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-texto-3" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-texto-3 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-texto-3 [animation-delay:300ms]" />
            </span>
            Tu ejecutivo está pensando
          </div>
        )}
        {error && (
          <div className="grid gap-2">
            <AvisoError {...error} />
            {reintentar && <div><Boton onClick={() => ejecutar(() => responderRecepcion(proyectoId))}>Reintentar respuesta</Boton></div>}
          </div>
        )}
        <div ref={final} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-borde p-3"
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
      >
        <input ref={adjunto} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) enviarAReferencias(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => adjunto.current?.click()} aria-label="Adjuntar referencias" title="Adjuntar referencias (también puedes arrastrarlas o pegarlas)" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-borde text-texto-2 hover:bg-superficie-2 hover:text-texto">
          <Paperclip size={18} />
        </button>
        <label htmlFor="chat" className="sr-only">Tu respuesta</label>
        <textarea
          id="chat"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); enviarAReferencias(imgs); } }}
          rows={1}
          placeholder="Escribe tu respuesta. Enter envía, Shift+Enter hace salto de línea."
          className="max-h-40 min-h-10 flex-1 resize-y rounded-control border border-borde bg-fondo px-3 py-2 text-sm placeholder:text-texto-3 focus:border-acento focus:outline-none"
        />
        <Boton variante="primario" disabled={pensando || !texto.trim()} aria-label="Enviar" className="h-10 w-10 px-0">
          <PaperPlaneRight size={18} weight="fill" />
        </Boton>
      </form>
    </section>
  );
}
