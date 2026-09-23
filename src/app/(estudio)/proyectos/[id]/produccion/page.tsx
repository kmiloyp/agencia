import type { Metadata } from "next";
import Link from "next/link";
import { MesaProduccion } from "@/components/proyecto/mesa-produccion";
import { clasesBoton, Muestras, Vacio } from "@/components/ui";
import { cargarGeneraciones, proporcionProyecto } from "@/lib/galeria";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Producción" };
export const maxDuration = 300;

export default async function PaginaProduccion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: ruta } = await supabase.from("rutas_creativas").select("id, nombre, concepto, paleta, tipografias, caso_uso").eq("proyecto_id", id).eq("estado", "elegida").maybeSingle();
  if (!ruta) {
    return (
      <Vacio titulo="Aún no hay ruta elegida" accion={<Link href={`/proyectos/${id}/rutas`} className={clasesBoton("primario")}>Ir a rutas</Link>}>
        La producción trabaja sobre la ruta que elijas.
      </Vacio>
    );
  }
  const [generaciones, proporcion, { data: modelos }] = await Promise.all([
    cargarGeneraciones(supabase, id, { rutaId: ruta.id }),
    proporcionProyecto(supabase, id),
    supabase.from("modelos").select("id, nombre, estado").in("estado", ["activo", "candidato"]).contains("capacidades", ["texto_a_imagen"]).order("nombre"),
  ]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{ruta.nombre}</h2>
          <p className="max-w-[75ch] text-sm text-texto-2">{ruta.concepto}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-texto-2"><Muestras colores={ruta.paleta} tamano="md" />{ruta.tipografias.join(" + ")}</div>
      </div>
      <MesaProduccion proyectoId={id} generaciones={generaciones} modelos={modelos ?? []} proporcion={proporcion} />
    </div>
  );
}
