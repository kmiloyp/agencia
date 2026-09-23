"use client";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { enviarVotosCliente } from "@/app/acciones/aprobacion";
import { AvisoError, Boton, claseCampo } from "@/components/ui";

type Voto = "me_gusta" | "no_me_gusta" | null;

export function FormularioAprobacion({ token, opciones }: { token: string; opciones: { id: string; titulo: string; url: string }[] }) {
  const [votos, setVotos] = useState<Record<string, { voto: Voto; comentario: string }>>({});
  const [nombre, setNombre] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<{ error: string; sugerencia?: string } | null>(null);
  const [cargando, iniciar] = useTransition();
  const de = (id: string) => votos[id] ?? { voto: null, comentario: "" };
  const poner = (id: string, cambio: Partial<{ voto: Voto; comentario: string }>) => setVotos((v) => ({ ...v, [id]: { ...de(id), ...cambio } }));

  if (enviado) {
    return (
      <div className="grid justify-items-start gap-2 rounded-panel border border-borde bg-superficie p-6">
        <p className="text-lg font-semibold">Gracias, recibimos tus comentarios.</p>
        <p className="text-texto-2">Tu diseñador ya puede verlos. Si quieres agregar algo más, puedes volver a enviar.</p>
        <Boton onClick={() => setEnviado(false)}>Enviar otra respuesta</Boton>
      </div>
    );
  }

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          setError(null);
          const r = await enviarVotosCliente(token, nombre, comentario, opciones.map((o) => ({ generacion_id: o.id, ...de(o.id) })));
          if (!r.ok) setError(r); else setEnviado(true);
        });
      }}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {opciones.map((o) => {
          const v = de(o.id);
          return (
            <article key={o.id} className="grid content-start gap-3">
              <div className="overflow-hidden rounded-panel bg-escenario">
                <img src={o.url} alt={o.titulo} className="max-h-[70dvh] w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{o.titulo}</h2>
                <div className="flex gap-1">
                  <button type="button" aria-pressed={v.voto === "me_gusta"} onClick={() => poner(o.id, { voto: v.voto === "me_gusta" ? null : "me_gusta" })} className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm ${v.voto === "me_gusta" ? "border-ok bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok" : "border-borde text-texto-2 hover:text-texto"}`}>
                    <ThumbsUp size={16} weight={v.voto === "me_gusta" ? "fill" : "regular"} />Me gusta
                  </button>
                  <button type="button" aria-pressed={v.voto === "no_me_gusta"} onClick={() => poner(o.id, { voto: v.voto === "no_me_gusta" ? null : "no_me_gusta" })} className={`inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm ${v.voto === "no_me_gusta" ? "border-error bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-error" : "border-borde text-texto-2 hover:text-texto"}`}>
                    <ThumbsDown size={16} weight={v.voto === "no_me_gusta" ? "fill" : "regular"} />No
                  </button>
                </div>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-texto-2">Comentario sobre esta opción</span>
                <textarea rows={2} value={v.comentario} onChange={(e) => poner(o.id, { comentario: e.target.value })} className={claseCampo} />
              </label>
            </article>
          );
        })}
      </div>
      <div className="grid max-w-2xl gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Comentario general</span>
          <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} className={claseCampo} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Tu nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" className={`${claseCampo} max-w-sm`} />
        </label>
        {error && <AvisoError {...error} />}
        <div><Boton variante="primario" disabled={cargando}>{cargando ? "Enviando…" : "Enviar mis comentarios"}</Boton></div>
      </div>
    </form>
  );
}
