import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pasarAComposicion } from "@/app/acciones/produccion";
import { Boton, Vacio } from "@/components/ui";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Composición" };

export default async function PaginaComposicion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("piezas").select("id").eq("proyecto_id", id).order("orden").limit(1).maybeSingle();
  if (data) redirect(`/proyectos/${id}/composicion/${data.id}`);
  return (
    <Vacio
      titulo="Arma la pieza final"
      accion={<form action={pasarAComposicion.bind(null, id)}><Boton variante="primario">Preparar las caras</Boton></form>}
    >
      Se crea una mesa de trabajo por cada cara del tipo de pieza (en el cuaderno: portada y contraportada), con sus medidas reales, sangrado, zona segura y margen de anillado.
    </Vacio>
  );
}
