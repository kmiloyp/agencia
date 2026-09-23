"use client";
import { useActionState } from "react";
import { guardarCliente } from "@/app/acciones/catalogo";
import { AvisoError, Boton, Etiqueta, claseCampo } from "@/components/ui";

interface Prefs { gustos: string[]; rechazos: string[]; paletas: string[]; tipografias_aprobadas: string[] }

export function FormCliente({ id, nombre, empresa, notas, prefs }: { id: string; nombre: string; empresa: string | null; notas: string | null; prefs: Prefs }) {
  const [estado, accion, pendiente] = useActionState(guardarCliente.bind(null, id), null);
  const lista = (k: keyof Prefs, etiqueta: string) => (
    <div className="grid gap-2">
      <Etiqueta htmlFor={k} ayuda="Uno por línea">{etiqueta}</Etiqueta>
      <textarea id={k} name={k} rows={5} defaultValue={(prefs[k] ?? []).join("\n")} className={claseCampo} />
    </div>
  );
  return (
    <form action={accion} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2"><Etiqueta htmlFor="nombre">Nombre</Etiqueta><input id="nombre" name="nombre" defaultValue={nombre} required className={claseCampo} /></div>
        <div className="grid gap-2"><Etiqueta htmlFor="empresa">Empresa</Etiqueta><input id="empresa" name="empresa" defaultValue={empresa ?? ""} className={claseCampo} /></div>
        {lista("gustos", "Gustos")}
        {lista("rechazos", "Rechazos")}
        {lista("paletas", "Paletas aprobadas")}
        {lista("tipografias_aprobadas", "Tipografías aprobadas")}
        <div className="grid gap-2 md:col-span-2"><Etiqueta htmlFor="notas">Notas</Etiqueta><textarea id="notas" name="notas" rows={3} defaultValue={notas ?? ""} className={claseCampo} /></div>
      </div>
      {estado && !estado.ok && <AvisoError error={estado.error} sugerencia={estado.sugerencia} />}
      <div className="flex items-center gap-3">
        <Boton variante="primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Boton>
        {estado?.ok && <span className="text-sm text-ok">Guardado</span>}
      </div>
    </form>
  );
}
