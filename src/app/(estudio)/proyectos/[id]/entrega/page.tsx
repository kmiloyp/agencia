import type { Metadata } from "next";
import Link from "next/link";
import { PanelAprobacion, type AprobacionHecha, type OpcionElegible } from "@/components/entrega/panel-aprobacion";
import { PanelEntrega, type EntregaHecha } from "@/components/entrega/panel-entrega";
import { clasesBoton, Vacio } from "@/components/ui";
import { archivosDe, cargarPiezas } from "@/lib/composicion/cargar";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Entrega" };
export const maxDuration = 300;

type Supa = Awaited<ReturnType<typeof crearClienteServidor>>;

async function firmar(supabase: Supa, bucket: string, rutas: string[], opciones?: { download?: boolean }) {
  if (!rutas.length) return {} as Record<string, string>;
  const mapa: Record<string, string> = {};
  if (opciones?.download) {
    await Promise.all(rutas.map(async (r) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(r, 3600, { download: r.split("/").pop() });
      if (data) mapa[r] = data.signedUrl;
    }));
    return mapa;
  }
  const { data } = await supabase.storage.from(bucket).createSignedUrls(rutas, 6 * 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
  return mapa;
}

export default async function PaginaEntrega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const [{ data: usuario }, { titulo, piezas }, { data: entregas }, { data: aprobaciones }, { data: gens }] = await Promise.all([
    supabase.auth.getUser(),
    cargarPiezas(supabase, id),
    supabase.from("entregas").select("id, formato, fecha, archivos, detalle").eq("proyecto_id", id).order("fecha", { ascending: false }),
    supabase.from("aprobaciones").select("id, titulo, estado, expira_en, created_at, opciones, votos").eq("proyecto_id", id).order("created_at", { ascending: false }),
    supabase.from("generaciones").select("id, archivo, caso_uso, rutas_creativas(nombre)").eq("proyecto_id", id).in("estado", ["lista", "rechazada_qc"]).neq("caso_uso", "escalado").not("archivo", "is", null).order("created_at", { ascending: false }).limit(40),
  ]);
  const ownerId = usuario.user!.id;

  // Imágenes de la composición (para los PNG) y opciones elegibles para el cliente.
  const usados = archivosDe(piezas);
  const porBucket = (b: string) => usados.filter((a) => a.startsWith(`${b}/`)).map((a) => a.slice(b.length + 1));
  const [fGen, fRef, fElegibles] = await Promise.all([
    firmar(supabase, "generaciones", porBucket("generaciones")),
    firmar(supabase, "referencias", porBucket("referencias")),
    firmar(supabase, "generaciones", (gens ?? []).map((g) => g.archivo as string)),
  ]);
  const urls: Record<string, string> = {};
  for (const [r, u] of Object.entries(fGen)) urls[`generaciones/${r}`] = u;
  for (const [r, u] of Object.entries(fRef)) urls[`referencias/${r}`] = u;

  const fuentesSubidas = [...new Set(piezas.flatMap((p) => p.composicion.capas.flatMap((c) => (c.tipo === "texto" && c.texto.fuente.archivo ? [c.texto.fuente.archivo] : []))))];
  const urlsFuentes = await firmar(supabase, "fuentes", fuentesSubidas);

  const todasEntregas = (entregas ?? []).flatMap((e) => e.archivos as string[]);
  const descargas = await firmar(supabase, "entregas", todasEntregas, { download: true });
  const hechas: EntregaHecha[] = (entregas ?? []).map((e) => ({
    id: e.id,
    formato: e.formato,
    fecha: e.fecha,
    archivos: (e.archivos as string[]).filter((a) => descargas[a]).map((a) => ({ nombre: a.split("/").pop()!, url: descargas[a] })),
    avisos: ((e.detalle as { avisos?: string[] })?.avisos ?? []),
  }));

  const elegibles: OpcionElegible[] = (gens ?? [])
    .filter((g) => fElegibles[g.archivo as string])
    .map((g, i) => ({ id: g.id, url: fElegibles[g.archivo as string], etiqueta: `${(g.rutas_creativas as unknown as { nombre: string } | null)?.nombre ?? "Arte"} #${(gens?.length ?? 0) - i}` }));
  const hayVector = (gens ?? []).some((g) => (g.archivo as string).endsWith(".svg"));

  return (
    <div className="grid gap-6">
      {piezas.length === 0 ? (
        <Vacio titulo="Aún no hay pieza compuesta" accion={<Link href={`/proyectos/${id}/composicion`} className={clasesBoton("primario")}>Ir a composición</Link>}>
          Arma la portada y la contraportada con texto real antes de exportar. Mientras tanto, ya puedes pedir la aprobación del cliente más abajo.
        </Vacio>
      ) : (
        <PanelEntrega proyectoId={id} ownerId={ownerId} caras={piezas} urls={urls} urlsFuentes={urlsFuentes} titulo={titulo} hayVector={hayVector} entregas={hechas} />
      )}
      <PanelAprobacion proyectoId={id} elegibles={elegibles} aprobaciones={(aprobaciones ?? []) as AprobacionHecha[]} />
    </div>
  );
}
