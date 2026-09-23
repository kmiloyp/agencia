import type { Metadata } from "next";
import Link from "next/link";
import { crearCliente } from "@/app/acciones/catalogo";
import { Boton, claseCampo, Encabezado, Panel, Vacio } from "@/components/ui";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes() {
  const supabase = await crearClienteServidor();
  const { data: clientes } = await supabase.from("clientes").select("id, nombre, empresa, preferencias, proyectos(count)").order("nombre");
  return (
    <>
      <Encabezado titulo="Clientes">La memoria de cada cliente: gustos, rechazos, paletas y tipografías aprobadas. Se alimenta sola cuando descartas rutas.</Encabezado>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {clientes?.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {clientes.map((c) => {
              const prefs = c.preferencias as { rechazos?: string[]; gustos?: string[] };
              const total = (c.proyectos as unknown as { count: number }[])?.[0]?.count ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`/clientes/${c.id}`} className="grid gap-1 rounded-panel border border-borde bg-superficie px-4 py-3 hover:border-texto-3">
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-xs text-texto-3">{c.empresa ?? "Sin empresa"} · {total} {total === 1 ? "proyecto" : "proyectos"} · {prefs.gustos?.length ?? 0} gustos, {prefs.rechazos?.length ?? 0} rechazos</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio titulo="Sin clientes todavía">Se crean solos cuando el ejecutivo de cuenta identifica el cliente, o puedes añadirlos aquí.</Vacio>
        )}
        <Panel className="h-fit p-4">
          <form action={crearCliente} className="grid gap-3">
            <p className="font-medium">Nuevo cliente</p>
            <label className="grid gap-1 text-sm">Nombre<input name="nombre" required className={claseCampo} /></label>
            <label className="grid gap-1 text-sm">Empresa<input name="empresa" className={claseCampo} /></label>
            <Boton variante="primario">Crear</Boton>
          </form>
        </Panel>
      </div>
    </>
  );
}
