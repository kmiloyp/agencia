import "server-only";
import type { ContextoMotor } from "@/lib/motor-creativo";
import { formatoDeCara, type FormatoPiezaBD } from "./formato";
import type { Composicion } from "./tipos";

/** Igual que cargarPiezas, pero con el contexto del motor (filtra por owner_id). */
export async function cargarPiezasCtx(ctx: ContextoMotor, proyectoId: string) {
  const [{ data: piezas }, { data: p }] = await Promise.all([
    ctx.db.from("piezas").select("id, cara, orden, composicion").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).order("orden"),
    ctx.db.from("proyectos").select("titulo, tipos_pieza(formato)").eq("id", proyectoId).eq("owner_id", ctx.ownerId).single(),
  ]);
  const formato = (p?.tipos_pieza as unknown as { formato: FormatoPiezaBD } | null)?.formato;
  return {
    titulo: (p?.titulo as string) ?? "Pieza",
    piezas: (piezas ?? []).map((x) => ({ id: x.id as string, cara: x.cara as string, formato: formatoDeCara(formato, x.cara), composicion: x.composicion as Composicion })),
  };
}
