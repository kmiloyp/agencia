import type { Metadata } from "next";
import Link from "next/link";
import { Encabezado, Panel, Vacio } from "@/components/ui";
import { env } from "@/lib/env";
import { usd } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Costos" };

function agrupar<T>(filas: T[], clave: (f: T) => string, monto: (f: T) => number) {
  const m = new Map<string, number>();
  for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + monto(f));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Tabla({ titulo, filas, total }: { titulo: string; filas: [string, number][]; total: number }) {
  return (
    <Panel className="p-4">
      <h2 className="mb-3 text-sm font-medium text-texto-2">{titulo}</h2>
      <ul className="grid gap-2 text-sm">
        {filas.slice(0, 12).map(([k, v]) => (
          <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <span className="truncate" title={k}>{k}</span>
            <span className="font-mono tabular-nums">{usd(v, 3)}</span>
            <span className="col-span-2 h-1 rounded-full bg-acento/70" style={{ width: `${Math.max(2, (v / (total || 1)) * 100)}%` }} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default async function Costos() {
  const supabase = await crearClienteServidor();
  const hace6Meses = new Date();
  hace6Meses.setUTCMonth(hace6Meses.getUTCMonth() - 5, 1);
  const { data } = await supabase
    .from("movimientos_costo")
    .select("monto_usd, modelo, proveedor, concepto, estimado, created_at, proyectos(id, titulo)")
    .gte("created_at", hace6Meses.toISOString())
    .order("created_at", { ascending: false });
  const filas = data ?? [];
  const mesActual = new Date().toISOString().slice(0, 7);
  const delMes = filas.filter((f) => f.created_at.startsWith(mesActual));
  const totalMes = delMes.reduce((s, f) => s + Number(f.monto_usd), 0);
  const nombreMes = (k: string) => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date(`${k}-15`));

  return (
    <>
      <Encabezado titulo="Costos">
        Cada llamada a fal.ai y a Claude queda registrada. Los costos de imagen son estimados con la tabla de precios de cada modelo; los de Claude se calculan con los tokens reales.
      </Encabezado>
      {filas.length === 0 ? (
        <Vacio titulo="Sin gastos registrados">Aparecerán aquí en cuanto empieces un proyecto.</Vacio>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Panel className="p-4"><p className="text-sm text-texto-2">Este mes</p><p className="mt-1 font-mono text-2xl tabular-nums">{usd(totalMes)}</p><p className="text-xs text-texto-3">de {usd(env.presupuestoMensual())}</p></Panel>
            <Panel className="p-4"><p className="text-sm text-texto-2">Imágenes (fal.ai)</p><p className="mt-1 font-mono text-2xl tabular-nums">{usd(delMes.filter((f) => f.proveedor === "fal").reduce((s, f) => s + Number(f.monto_usd), 0))}</p></Panel>
            <Panel className="p-4"><p className="text-sm text-texto-2">Claude</p><p className="mt-1 font-mono text-2xl tabular-nums">{usd(delMes.filter((f) => f.proveedor === "anthropic").reduce((s, f) => s + Number(f.monto_usd), 0))}</p></Panel>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Tabla titulo="Por proyecto (este mes)" total={totalMes} filas={agrupar(delMes, (f) => (f.proyectos as unknown as { titulo: string } | null)?.titulo ?? "Explorador de modelos", (f) => Number(f.monto_usd))} />
            <Tabla titulo="Por modelo (este mes)" total={totalMes} filas={agrupar(delMes, (f) => f.modelo, (f) => Number(f.monto_usd))} />
            <Tabla titulo="Por concepto (este mes)" total={totalMes} filas={agrupar(delMes, (f) => f.concepto, (f) => Number(f.monto_usd))} />
          </div>
          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-medium text-texto-2">Por mes</h2>
            <ul className="grid gap-1 text-sm">
              {agrupar(filas, (f) => f.created_at.slice(0, 7), (f) => Number(f.monto_usd)).sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span className="capitalize">{nombreMes(k)}</span><span className="font-mono tabular-nums">{usd(v)}</span></li>
              ))}
            </ul>
          </Panel>
          <p className="text-xs text-texto-3">¿Un proyecto se pasó? Ajusta su presupuesto desde el encabezado del <Link href="/proyectos" className="underline">proyecto</Link>.</p>
        </div>
      )}
    </>
  );
}
