import { Plus } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { clasesBoton, Encabezado, Estado, Vacio } from "@/components/ui";
import { fecha, NOMBRES_ESTADO, usd } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Proyectos() {
  const supabase = await crearClienteServidor();
  const { data: proyectos } = await supabase
    .from("proyectos")
    .select("id, titulo, estado, updated_at, costo_acumulado_usd, presupuesto_usd, clientes(nombre), tipos_pieza(nombre)")
    .order("updated_at", { ascending: false });

  return (
    <>
      <Encabezado
        titulo="Proyectos"
        acciones={<Link href="/proyectos/nuevo" className={clasesBoton("primario")}><Plus size={16} weight="bold" />Nuevo proyecto</Link>}
      />
      {proyectos?.length ? (
        <div className="overflow-x-auto rounded-panel border border-borde bg-superficie">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-texto-3">
              <tr className="border-b border-borde">
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Pieza</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Costo</th>
                <th className="px-4 py-3 text-right font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => (
                <tr key={p.id} className="border-b border-borde last:border-0 hover:bg-superficie-2">
                  <td className="px-4 py-3"><Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">{p.titulo}</Link></td>
                  <td className="px-4 py-3 text-texto-2">{(p.clientes as unknown as { nombre: string } | null)?.nombre ?? "Sin cliente"}</td>
                  <td className="px-4 py-3 text-texto-2">{(p.tipos_pieza as unknown as { nombre: string } | null)?.nombre ?? "Por definir"}</td>
                  <td className="px-4 py-3"><Estado>{NOMBRES_ESTADO[p.estado]}</Estado></td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{usd(p.costo_acumulado_usd)} <span className="text-texto-3">/ {usd(p.presupuesto_usd)}</span></td>
                  <td className="px-4 py-3 text-right text-texto-3">{fecha(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vacio titulo="Todavía no hay proyectos" accion={<Link href="/proyectos/nuevo" className={clasesBoton("primario")}>Empezar el primero</Link>}>
          Cada proyecto empieza con una conversación con tu ejecutivo de cuenta.
        </Vacio>
      )}
    </>
  );
}
