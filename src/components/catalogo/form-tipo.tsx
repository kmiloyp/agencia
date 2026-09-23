"use client";
import { useActionState } from "react";
import { guardarTipoPieza } from "@/app/acciones/catalogo";
import { AvisoError, Boton, Etiqueta, claseCampo } from "@/components/ui";

export interface TipoPieza {
  id: string;
  nombre: string;
  descripcion: string | null;
  preguntas_recepcion: { pregunta: string; obligatoria: boolean }[];
  formato: Record<string, number | string | string[]>;
  formatos_entrega: string[];
}

const ENTREGAS = [
  { valor: "pdf_impresion", texto: "PDF de impresión" },
  { valor: "png_web", texto: "PNG web y redes" },
  { valor: "svg", texto: "SVG" },
];

export function FormTipo({ t }: { t: TipoPieza }) {
  const [estado, accion, pendiente] = useActionState(guardarTipoPieza.bind(null, t.id), null);
  const f = t.formato;
  const medida = (k: string, etiqueta: string) => (
    <label className="grid gap-1 text-xs text-texto-2">
      {etiqueta}
      <input name={k} inputMode="decimal" defaultValue={String(f[k] ?? 0)} className={`${claseCampo} font-mono`} />
    </label>
  );
  return (
    <form action={accion} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2"><Etiqueta htmlFor={`n-${t.id}`}>Nombre</Etiqueta><input id={`n-${t.id}`} name="nombre" defaultValue={t.nombre} className={claseCampo} /></div>
        <div className="grid gap-2"><Etiqueta htmlFor={`d-${t.id}`}>Descripción</Etiqueta><input id={`d-${t.id}`} name="descripcion" defaultValue={t.descripcion ?? ""} className={claseCampo} /></div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Medidas</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {medida("ancho_mm", "Ancho (mm)")}
          {medida("alto_mm", "Alto (mm)")}
          {medida("sangrado_mm", "Sangrado (mm)")}
          {medida("zona_segura_mm", "Zona segura (mm)")}
          {medida("lomo_mm", "Lomo (mm)")}
          {medida("dpi_objetivo", "DPI objetivo")}
        </div>
        {f.encuadernacion && <p className="text-xs text-texto-3">Encuadernación: {String(f.encuadernacion)}{f.margen_anillado_mm ? `, margen de anillado ${f.margen_anillado_mm} mm (${f.lado_anillado})` : ""}.</p>}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="grid gap-2">
          <Etiqueta htmlFor={`c-${t.id}`} ayuda="Una por línea">Caras</Etiqueta>
          <textarea id={`c-${t.id}`} name="caras" rows={3} defaultValue={((f.caras as string[]) ?? []).join("\n")} className={claseCampo} />
        </div>
        <div className="grid gap-2">
          <Etiqueta htmlFor={`p-${t.id}`} ayuda="Una por línea. Empieza con * las opcionales.">Preguntas de recepción</Etiqueta>
          <textarea id={`p-${t.id}`} name="preguntas" rows={6} defaultValue={t.preguntas_recepcion.map((p) => `${p.obligatoria ? "" : "* "}${p.pregunta}`).join("\n")} className={claseCampo} />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-2 text-sm font-medium">Formatos de entrega</legend>
        {ENTREGAS.map((e) => (
          <label key={e.valor} className="flex items-center gap-2">
            <input type="checkbox" name="formatos_entrega" value={e.valor} defaultChecked={t.formatos_entrega.includes(e.valor)} className="accent-[var(--acento)]" />
            {e.texto}
          </label>
        ))}
      </fieldset>
      {estado && !estado.ok && <AvisoError error={estado.error} sugerencia={estado.sugerencia} />}
      <div className="flex items-center gap-3">
        <Boton variante="primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar plantilla"}</Boton>
        {estado?.ok && <span className="text-sm text-ok">Guardada</span>}
      </div>
    </form>
  );
}
