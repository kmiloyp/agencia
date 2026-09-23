import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { AccionesInvestigacion } from "@/components/proyecto/investigacion";
import { clasesBoton, Panel, Vacio } from "@/components/ui";
import { fechaHora } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Investigación" };
export const maxDuration = 300;

export default async function PaginaInvestigacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: brief }, { data: inv }] = await Promise.all([
    supabase.from("briefs").select("aprobado").eq("proyecto_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("investigaciones").select("informe, fuentes, omitida, created_at").eq("proyecto_id", id).eq("omitida", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!brief?.aprobado) {
    return (
      <Vacio titulo="Primero hay que aprobar el brief" accion={<Link href={`/proyectos/${id}/brief`} className={clasesBoton("primario")}>Ir al brief</Link>}>
        La investigación parte del brief aprobado.
      </Vacio>
    );
  }

  const fuentes = (inv?.fuentes ?? []) as { titulo: string; url: string }[];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid content-start gap-4">
        {inv ? (
          <Panel className="p-5 md:p-6">
            <div className="prosa max-w-[70ch] text-sm leading-relaxed"><ReactMarkdown>{inv.informe}</ReactMarkdown></div>
            <p className="mt-4 text-xs text-texto-3">Generado el {fechaHora(inv.created_at)}</p>
          </Panel>
        ) : (
          <div className="grid gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Mini informe del sector</h2>
            <p className="max-w-[65ch] text-sm text-texto-2">Tendencias, qué hace la competencia, clichés a evitar y oportunidades para diferenciarse. Siempre con fuentes y en una pantalla de lectura. Es opcional.</p>
          </div>
        )}
        <AccionesInvestigacion proyectoId={id} hay={!!inv} />
      </div>
      {fuentes.length > 0 && (
        <aside className="grid content-start gap-2">
          <h3 className="text-sm font-medium text-texto-2">Fuentes</h3>
          <ol className="grid gap-2 text-sm">
            {fuentes.slice(0, 12).map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-texto-2 hover:text-texto hover:underline">{f.titulo || f.url}</a>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </div>
  );
}
