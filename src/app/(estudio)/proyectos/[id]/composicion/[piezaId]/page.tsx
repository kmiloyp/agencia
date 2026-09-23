import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor, type FuenteSubida, type ImagenDisponible } from "@/components/composicion/editor";
import { archivosDe, cargarPiezas } from "@/lib/composicion/cargar";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Composición" };

const SEIS_HORAS = 6 * 3600;

async function firmar(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, bucket: string, rutas: string[]) {
  if (!rutas.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(rutas, SEIS_HORAS);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string])) as Record<string, string>;
}

export default async function PaginaEditor({ params }: { params: Promise<{ id: string; piezaId: string }> }) {
  const { id, piezaId } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: usuario }, { piezas }, { data: gens }, { data: refs }, { data: ruta }, { data: brief }] = await Promise.all([
    supabase.auth.getUser(),
    cargarPiezas(supabase, id),
    supabase.from("generaciones").select("id, archivo, caso_uso, created_at, rutas_creativas(nombre)").eq("proyecto_id", id).in("estado", ["lista", "rechazada_qc"]).neq("caso_uso", "escalado").not("archivo", "is", null).order("created_at", { ascending: false }),
    supabase.from("referencias").select("id, archivo, mime, nota, tipo").eq("proyecto_id", id).order("created_at", { ascending: false }),
    supabase.from("rutas_creativas").select("tipografias, paleta").eq("proyecto_id", id).eq("estado", "elegida").maybeSingle(),
    supabase.from("briefs").select("contenido").eq("proyecto_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!piezas.some((p) => p.id === piezaId)) notFound();
  const ownerId = usuario.user!.id;

  // Firmas: arte generado, archivos del cliente y archivos ya usados en las capas.
  const usados = archivosDe(piezas);
  const rutasGen = [...new Set([...(gens ?? []).map((g) => g.archivo as string), ...usados.filter((a) => a.startsWith("generaciones/")).map((a) => a.slice(13))])];
  const rutasRef = [...new Set([...(refs ?? []).map((r) => r.archivo as string), ...usados.filter((a) => a.startsWith("referencias/")).map((a) => a.slice(12))])];
  const [firmasGen, firmasRef, { data: listaFuentes }] = await Promise.all([
    firmar(supabase, "generaciones", rutasGen),
    firmar(supabase, "referencias", rutasRef),
    supabase.storage.from("fuentes").list(ownerId, { limit: 100 }),
  ]);
  const urls: Record<string, string> = {};
  for (const [r, u] of Object.entries(firmasGen)) urls[`generaciones/${r}`] = u;
  for (const [r, u] of Object.entries(firmasRef)) urls[`referencias/${r}`] = u;

  const mime = (a: string) => (a.endsWith(".svg") ? "image/svg+xml" : a.endsWith(".png") ? "image/png" : "image/jpeg");
  const arte: ImagenDisponible[] = (gens ?? []).map((g, i) => ({
    archivo: `generaciones/${g.archivo}`,
    url: urls[`generaciones/${g.archivo}`],
    etiqueta: `${(g.rutas_creativas as unknown as { nombre: string } | null)?.nombre ?? "Arte"} ${g.caso_uso === "edicion" ? "(edición)" : ""} #${(gens?.length ?? 0) - i}`,
    generacion_id: g.id,
    mime: mime(g.archivo as string),
  })).filter((a) => a.url);
  const activos: ImagenDisponible[] = (refs ?? []).map((r) => ({
    archivo: `referencias/${r.archivo}`,
    url: urls[`referencias/${r.archivo}`],
    etiqueta: r.nota || (r.tipo === "activo_del_cliente" ? "Archivo del cliente" : "Referencia"),
    referencia_id: r.id,
    mime: r.mime,
  })).filter((a) => a.url);

  const archivosFuentes = (listaFuentes ?? []).filter((f) => /\.(ttf|otf)$/i.test(f.name)).map((f) => `${ownerId}/${f.name}`);
  const firmasFuentes = await firmar(supabase, "fuentes", archivosFuentes);
  const fuentesSubidas: FuenteSubida[] = archivosFuentes.filter((a) => firmasFuentes[a]).map((a) => ({
    archivo: a,
    url: firmasFuentes[a],
    familia: a.split("/").pop()!.replace(/\.(ttf|otf)$/i, "").replace(/-/g, " "),
  }));

  const textos = ((brief?.contenido as { textos_obligatorios?: string[] } | null)?.textos_obligatorios ?? [])
    .map((t) => t.replace(/^[^:]{3,40}:\s*/, "").replace(/^[«"“]|[»"”]$/g, "").trim())
    .filter(Boolean);

  return (
    <Editor
      proyectoId={id}
      ownerId={ownerId}
      carasIniciales={piezas}
      piezaInicial={piezaId}
      urlsIniciales={urls}
      arte={arte}
      activosIniciales={activos}
      fuentesSubidas={fuentesSubidas}
      tipografiasRuta={ruta?.tipografias ?? []}
      paleta={ruta?.paleta ?? []}
      textosBrief={textos}
    />
  );
}
