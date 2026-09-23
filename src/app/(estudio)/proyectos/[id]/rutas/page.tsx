import type { Metadata } from "next";
import Link from "next/link";
import { TableroRutas, type Archivo, type Ruta } from "@/components/proyecto/tablero-rutas";
import { clasesBoton, Vacio } from "@/components/ui";
import { cargarGeneraciones } from "@/lib/galeria";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Rutas" };
export const maxDuration = 300;

export default async function PaginaRutas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: usuario }, { data: brief }, { data: rutas }, generaciones, { data: refs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("briefs").select("aprobado").eq("proyecto_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rutas_creativas").select("id, nombre, concepto, palanca, metafora, evita, paleta, tipografias, mood, por_que_encaja, estado, motivo_descarte, prompts").eq("proyecto_id", id).order("orden"),
    cargarGeneraciones(supabase, id),
    supabase.from("referencias").select("id, archivo, tipo, nota").eq("proyecto_id", id).in("tipo", ["ya_visto", "activo_del_cliente"]).order("created_at"),
  ]);

  if (!brief?.aprobado) {
    return (
      <Vacio titulo="Primero hay que aprobar el brief" accion={<Link href={`/proyectos/${id}/brief`} className={clasesBoton("primario")}>Ir al brief</Link>}>
        Las rutas creativas se construyen sobre el brief aprobado.
      </Vacio>
    );
  }

  const lista = refs ?? [];
  const firmas: Record<string, string> = {};
  if (lista.length) {
    const { data } = await supabase.storage.from("referencias").createSignedUrls(lista.map((r) => r.archivo), 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) firmas[d.path] = d.signedUrl;
  }
  const archivo = (r: (typeof lista)[number]): Archivo => ({ id: r.id, url: firmas[r.archivo], nota: r.nota });
  const yaVisto = lista.filter((r) => r.tipo === "ya_visto" && firmas[r.archivo]).map(archivo);
  const logos = lista.filter((r) => r.tipo === "activo_del_cliente" && firmas[r.archivo]).map(archivo);

  const listaRutas: Ruta[] = (rutas ?? []).map((r) => ({
    ...r,
    prompt_mockup: (r.prompts as { mockup?: string } | null)?.mockup ?? null,
  })) as Ruta[];

  return <TableroRutas proyectoId={id} ownerId={usuario.user!.id} rutas={listaRutas} generaciones={generaciones} yaVisto={yaVisto} logos={logos} />;
}
