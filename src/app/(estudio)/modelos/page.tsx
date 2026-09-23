import type { Metadata } from "next";
import { Encabezado, Estado, Panel } from "@/components/ui";
import { usd } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Modelos" };

const UNIDADES: Record<string, string> = { imagen: "imagen", megapixel: "MP", bloque_mp: "bloque", tokens: "tokens" };

export default async function Modelos() {
  const supabase = await crearClienteServidor();
  const [{ data: asignaciones }, { data: modelos }, { data: votos }] = await Promise.all([
    supabase
      .from("asignaciones")
      .select("id, motivo, updated_at, casos_uso(clave, descripcion), campeon:modelos!asignaciones_modelo_id_fkey(nombre, endpoint_fal), respaldo:modelos!asignaciones_respaldo_modelo_id_fkey(nombre)")
      .eq("vigente", true),
    supabase.from("modelos").select("id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, estado, verificado_en, notas").order("estado").order("nombre"),
    supabase.from("generaciones").select("modelo_id, caso_uso, voto").not("voto", "is", null),
  ]);

  // Ranking propio: tasa de aprobación real por modelo.
  const tasa = new Map<string, { a: number; t: number }>();
  for (const v of votos ?? []) {
    const k = v.modelo_id as string;
    const x = tasa.get(k) ?? { a: 0, t: 0 };
    x.t++;
    if (v.voto === "aprobada") x.a++;
    tasa.set(k, x);
  }

  const orden = ["fotorrealismo", "ilustracion", "texto_en_imagen", "personaje_consistente", "vector_logo", "edicion", "escalado", "borrador_rapido"];
  const filas = [...(asignaciones ?? [])].sort(
    (a, b) => orden.indexOf((a.casos_uso as unknown as { clave: string }).clave) - orden.indexOf((b.casos_uso as unknown as { clave: string }).clave),
  );

  return (
    <>
      <Encabezado titulo="Modelos">Qué modelo usa cada tarea. Cambiar un modelo es cambiar datos, nunca código. El explorador semanal, el banco de pruebas y la arena ciega llegan en la Fase 3.</Encabezado>
      <div className="grid gap-8">
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-texto-3">
              <tr className="border-b border-borde">
                <th className="px-4 py-3 font-medium">Caso de uso</th>
                <th className="px-4 py-3 font-medium">Campeón</th>
                <th className="px-4 py-3 font-medium">Respaldo</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => {
                const caso = a.casos_uso as unknown as { clave: string; descripcion: string };
                const campeon = a.campeon as unknown as { nombre: string; endpoint_fal: string };
                const respaldo = a.respaldo as unknown as { nombre: string } | null;
                return (
                  <tr key={a.id} className="border-b border-borde last:border-0 align-top">
                    <td className="px-4 py-3"><p className="font-medium">{caso.clave.replaceAll("_", " ")}</p><p className="text-xs text-texto-3">{caso.descripcion}</p></td>
                    <td className="px-4 py-3"><p>{campeon.nombre}</p><p className="font-mono text-xs text-texto-3">{campeon.endpoint_fal}</p></td>
                    <td className="px-4 py-3 text-texto-2">{respaldo?.nombre ?? "Sin respaldo"}</td>
                    <td className="px-4 py-3 text-xs text-texto-2">{a.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <section className="grid gap-3">
          <h2 className="font-semibold">Registro de modelos</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(modelos ?? []).map((m) => {
              const t = tasa.get(m.id);
              return (
                <Panel key={m.id} className="grid content-start gap-2 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium">{m.nombre}</p><p className="text-xs text-texto-3">{m.proveedor}</p></div>
                    <Estado tono={m.estado === "activo" ? "ok" : m.estado === "candidato" ? "acento" : "neutro"}>{m.estado}</Estado>
                  </div>
                  <p className="font-mono text-xs break-all text-texto-2">{m.endpoint_fal}{m.endpoint_fal_edicion ? ` · ${m.endpoint_fal_edicion}` : ""}</p>
                  <p className="text-xs text-texto-2">{usd(m.precio_unitario, 3)} por {UNIDADES[m.unidad_precio ?? ""] ?? m.unidad_precio} · {m.capacidades.join(", ").replaceAll("_", " ")}</p>
                  {t && <p className="text-xs">Aprobación real: <span className="font-mono">{Math.round((t.a / t.t) * 100)}%</span> <span className="text-texto-3">({t.a} de {t.t})</span></p>}
                  {m.notas && <p className="text-xs text-texto-3">{m.notas}</p>}
                  {m.verificado_en && <p className="text-xs text-texto-3">Verificado en fal.ai el {m.verificado_en}</p>}
                </Panel>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
