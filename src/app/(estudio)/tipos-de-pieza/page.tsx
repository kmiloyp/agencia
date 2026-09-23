import type { Metadata } from "next";
import { FormTipo, type TipoPieza } from "@/components/catalogo/form-tipo";
import { Encabezado, Panel, Vacio } from "@/components/ui";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Tipos de pieza" };

export default async function TiposDePieza() {
  const supabase = await crearClienteServidor();
  const { data: tipos } = await supabase.from("tipos_pieza").select("id, nombre, descripcion, preguntas_recepcion, formato, formatos_entrega").order("nombre");
  return (
    <>
      <Encabezado titulo="Tipos de pieza">Plantillas con medidas de impresión, preguntas de recepción y formatos de entrega. El ejecutivo de cuenta propone plantillas nuevas cuando ninguna sirve.</Encabezado>
      {tipos?.length ? (
        <div className="grid gap-4">
          {(tipos as TipoPieza[]).map((t) => (
            <Panel key={t.id} className="p-5">
              <h2 className="mb-4 font-semibold">{t.nombre}</h2>
              <FormTipo t={t} />
            </Panel>
          ))}
        </div>
      ) : (
        <Vacio titulo="No hay plantillas">La semilla crea &quot;Portada de cuaderno&quot; al registrar tu usuario. Revisa que las migraciones estén aplicadas (ver AGENTS.md).</Vacio>
      )}
    </>
  );
}
