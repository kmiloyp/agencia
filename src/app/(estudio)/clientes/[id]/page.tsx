import Link from "next/link";
import { notFound } from "next/navigation";
import { FormCliente } from "@/components/catalogo/form-cliente";
import { Encabezado, Estado, Panel } from "@/components/ui";
import { fecha, NOMBRES_ESTADO } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: c }, { data: proyectos }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, empresa, notas, preferencias").eq("id", id).maybeSingle(),
    supabase.from("proyectos").select("id, titulo, estado, updated_at").eq("cliente_id", id).order("updated_at", { ascending: false }),
  ]);
  if (!c) notFound();
  return (
    <>
      <Encabezado titulo={c.nombre}>{c.empresa}</Encabezado>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="p-5"><FormCliente id={c.id} nombre={c.nombre} empresa={c.empresa} notas={c.notas} prefs={c.preferencias} /></Panel>
        <aside className="grid content-start gap-2">
          <h2 className="text-sm font-medium text-texto-2">Historial de proyectos</h2>
          {proyectos?.length ? proyectos.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.id}`} className="flex items-center justify-between gap-2 rounded-control px-2 py-2 text-sm hover:bg-superficie-2">
              <span className="truncate">{p.titulo}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-texto-3">{fecha(p.updated_at)}<Estado>{NOMBRES_ESTADO[p.estado]}</Estado></span>
            </Link>
          )) : <p className="text-sm text-texto-3">Sin proyectos todavía.</p>}
        </aside>
      </div>
    </>
  );
}
