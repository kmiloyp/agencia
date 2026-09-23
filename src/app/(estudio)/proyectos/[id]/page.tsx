import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const PESTANA_POR_ESTADO: Record<string, string> = {
  recepcion: "brief",
  investigacion: "investigacion",
  rutas: "rutas",
  produccion: "produccion",
  composicion: "composicion",
  entregado: "entrega",
};

export default async function Proyecto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("proyectos").select("estado").eq("id", id).maybeSingle();
  redirect(`/proyectos/${id}/${PESTANA_POR_ESTADO[data?.estado ?? "recepcion"] ?? "brief"}`);
}
