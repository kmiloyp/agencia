import type { Metadata } from "next";
import { ChatRecepcion, type Mensaje } from "@/components/proyecto/chat-recepcion";
import { EditorBrief } from "@/components/proyecto/editor-brief";
import { Referencias, type Referencia } from "@/components/proyecto/referencias";
import type { Brief } from "@/lib/agencia/esquemas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { firmarVarias } from "@/lib/urls";

export const metadata: Metadata = { title: "Brief" };
export const maxDuration = 300;

export default async function PaginaBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: usuario }, { data: mensajes }, { data: refs }, { data: brief }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("mensajes").select("id, rol, contenido, meta").eq("proyecto_id", id).order("created_at"),
    supabase.from("referencias").select("id, archivo, tipo, nota, analisis, analisis_estado, analisis_error").eq("proyecto_id", id).order("created_at"),
    supabase.from("briefs").select("contenido, version, aprobado").eq("proyecto_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const urls = await firmarVarias(supabase, "referencias", (refs ?? []).map((r) => r.archivo));
  const referencias: Referencia[] = (refs ?? []).map((r) => ({ ...r, url: urls[r.archivo] ?? null }));
  const listaMensajes = (mensajes ?? []) as Mensaje[];
  const pideRefs = !!listaMensajes.findLast((m) => m.rol === "agencia")?.meta?.pedir_referencias;

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ChatRecepcion proyectoId={id} iniciales={listaMensajes} briefAprobado={!!brief?.aprobado} />
        <Referencias proyectoId={id} ownerId={usuario.user!.id} iniciales={referencias} destacar={pideRefs && referencias.length === 0} />
      </div>
      {brief ? (
        <EditorBrief proyectoId={id} inicial={brief.contenido as Brief} version={brief.version} aprobado={brief.aprobado} />
      ) : (
        <p className="text-sm text-texto-3">El brief aparecerá aquí cuando tu ejecutivo tenga lo esencial. Podrás editarlo antes de aprobarlo.</p>
      )}
    </div>
  );
}
