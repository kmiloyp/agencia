import { notFound } from "next/navigation";
import { Pestanas } from "@/components/proyecto/pestanas";
import { Presupuesto } from "@/components/proyecto/presupuesto";
import { Estado } from "@/components/ui";
import { NOMBRES_ESTADO } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export default async function LayoutProyecto({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: p } = await supabase
    .from("proyectos")
    .select("id, titulo, estado, costo_acumulado_usd, presupuesto_usd, clientes(id, nombre), tipos_pieza(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const cliente = p.clientes as unknown as { id: string; nombre: string } | null;
  const tipo = p.tipos_pieza as unknown as { nombre: string } | null;
  return (
    <div className="grid gap-6">
      <header className="grid gap-4 border-b border-borde">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{p.titulo}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
              <span>{cliente?.nombre ?? "Cliente por definir"}</span>
              <span className="text-texto-3">/</span>
              <span>{tipo?.nombre ?? "Pieza por definir"}</span>
              <Estado tono="acento">{NOMBRES_ESTADO[p.estado]}</Estado>
            </p>
          </div>
          <Presupuesto proyectoId={p.id} gastado={Number(p.costo_acumulado_usd)} presupuesto={Number(p.presupuesto_usd)} />
        </div>
        <Pestanas proyectoId={p.id} />
      </header>
      {children}
    </div>
  );
}
