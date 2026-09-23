import Link from "next/link";
import { NuevoEncargo } from "@/components/proyecto/nuevo-encargo";
import { Estado, Panel } from "@/components/ui";
import { env } from "@/lib/env";
import { fecha, NOMBRES_ESTADO, usd } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const [{ data: proyectos }, { data: movimientos }] = await Promise.all([
    supabase.from("proyectos").select("id, titulo, estado, updated_at, costo_acumulado_usd, clientes(nombre)").order("updated_at", { ascending: false }).limit(6),
    supabase.from("movimientos_costo").select("monto_usd").gte("created_at", inicioMes.toISOString()),
  ]);
  const gastoMes = (movimientos ?? []).reduce((s, m) => s + Number(m.monto_usd), 0);
  const presupuesto = env.presupuestoMensual();
  const pct = Math.min(100, (gastoMes / presupuesto) * 100);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="grid content-start gap-6 pt-4 md:pt-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">¿Qué quieres diseñar hoy?</h1>
        <NuevoEncargo autoFocus />

        <div className="mt-6 grid gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-texto-2">Proyectos recientes</h2>
            <Link href="/proyectos" className="text-sm text-texto-2 hover:text-texto">Ver todos</Link>
          </div>
          {proyectos?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {proyectos.map((p) => (
                <li key={p.id}>
                  <Link href={`/proyectos/${p.id}`} className="grid gap-2 rounded-panel border border-borde bg-superficie px-4 py-3 transition hover:border-texto-3">
                    <span className="truncate font-medium">{p.titulo}</span>
                    <span className="flex items-center justify-between gap-2 text-xs text-texto-3">
                      <span className="truncate">{(p.clientes as unknown as { nombre: string } | null)?.nombre ?? "Sin cliente"} · {fecha(p.updated_at)}</span>
                      <Estado>{NOMBRES_ESTADO[p.estado]}</Estado>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-texto-3">Aún no hay proyectos. El primero empieza arriba.</p>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-4 lg:pt-10">
        <Panel className="p-4">
          <p className="text-sm text-texto-2">Gasto del mes</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{usd(gastoMes)}</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-superficie-2">
            <div className={`h-full ${pct > 90 ? "bg-error" : "bg-acento"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-texto-3">de {usd(presupuesto)} de presupuesto mensual</p>
          <Link href="/costos" className="mt-3 inline-block text-xs text-texto-2 hover:text-texto">Ver detalle</Link>
        </Panel>
        <Panel className="p-4 text-sm">
          <p className="text-texto-2">Motor de imágenes</p>
          <p className="mt-1 font-medium">{env.falModo() === "real" ? "fal.ai conectado" : "Modo de ejemplo (sin costo)"}</p>
          <p className="mt-1 text-xs text-texto-3">
            {env.falModo() === "real" ? "Las generaciones cuestan dinero y pasan por control de calidad." : "Pon FAL_KEY en .env.local para generar imágenes reales."}
          </p>
        </Panel>
      </aside>
    </div>
  );
}
