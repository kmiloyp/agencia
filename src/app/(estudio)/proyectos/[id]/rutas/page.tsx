import type { Metadata } from "next";
import Link from "next/link";
import { TableroRutas, type Ruta } from "@/components/proyecto/tablero-rutas";
import { clasesBoton, Vacio } from "@/components/ui";
import { cargarGeneraciones, proporcionProyecto } from "@/lib/galeria";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Rutas" };
export const maxDuration = 300;

export default async function PaginaRutas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: brief }, { data: rutas }, { data: asignaciones }, generaciones, proporcion] = await Promise.all([
    supabase.from("briefs").select("aprobado").eq("proyecto_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rutas_creativas").select("id, nombre, concepto, paleta, tipografias, mood, caso_uso, por_que_encaja, estado, motivo_descarte").eq("proyecto_id", id).order("orden"),
    supabase.from("asignaciones").select("casos_uso(clave), modelos!asignaciones_modelo_id_fkey(nombre)").eq("vigente", true),
    cargarGeneraciones(supabase, id),
    proporcionProyecto(supabase, id),
  ]);

  if (!brief?.aprobado) {
    return (
      <Vacio titulo="Primero hay que aprobar el brief" accion={<Link href={`/proyectos/${id}/brief`} className={clasesBoton("primario")}>Ir al brief</Link>}>
        Las rutas creativas se construyen sobre el brief aprobado.
      </Vacio>
    );
  }

  const modeloPorCaso = new Map(
    (asignaciones ?? []).map((a) => [
      (a.casos_uso as unknown as { clave: string } | null)?.clave,
      (a.modelos as unknown as { nombre: string } | null)?.nombre ?? null,
    ]),
  );
  const lista: Ruta[] = (rutas ?? []).map((r) => ({ ...r, modelo: modeloPorCaso.get(r.caso_uso ?? "") ?? null })) as Ruta[];

  return <TableroRutas proyectoId={id} rutas={lista} generaciones={generaciones} proporcion={proporcion} />;
}
