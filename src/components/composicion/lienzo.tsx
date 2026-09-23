"use client";
import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipse, Group, Image as KImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import { type Capa, type Composicion, type FormatoCara, MM_POR_PT, tamanoPliego, textoVisible } from "@/lib/composicion/tipos";
import { estiloKonva } from "./fuentes-navegador";

export interface CaraEditor {
  id: string;
  cara: string;
  formato: FormatoCara;
  composicion: Composicion;
}

export interface ControlLienzo {
  /** PNG de una cara (solo el área de corte), con el lado largo indicado en px. */
  exportarCara: (caraId: string, ladoLargoPx: number) => string | null;
}

const SEPARACION_MM = 18;
const ETIQUETA_MM = 9;

// ---------------------------------------------------------------------------
// Carga de imágenes (caché global, CORS anónimo para poder exportar)
// ---------------------------------------------------------------------------
const cacheImagenes = new Map<string, HTMLImageElement>();

function useImagenes(urls: string[]) {
  const [, setVersion] = useState(0);
  const clave = urls.join("|");
  useEffect(() => {
    let vivo = true;
    for (const url of urls) {
      if (cacheImagenes.has(url)) continue;
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => vivo && setVersion((v) => v + 1);
      img.onerror = () => vivo && setVersion((v) => v + 1);
      img.src = url;
      cacheImagenes.set(url, img);
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const listas = urls.filter((u) => cacheImagenes.get(u)?.complete);
  return { obtener: (u: string) => cacheImagenes.get(u), todas: listas.length === urls.length };
}

// ---------------------------------------------------------------------------
function Guias({ f }: { f: FormatoCara }) {
  const p = tamanoPliego(f);
  const s = f.sangrado_mm;
  const z = f.zona_segura_mm;
  const tinte = "rgba(255,80,80,0.12)";
  const anillado = f.margen_anillado_mm && f.lado_anillado;
  const xAnillo = f.lado_anillado === "derecho" ? p.ancho - s - f.margen_anillado_mm! : 0;
  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={p.ancho} height={s} fill={tinte} />
      <Rect x={0} y={p.alto - s} width={p.ancho} height={s} fill={tinte} />
      <Rect x={0} y={s} width={s} height={p.alto - 2 * s} fill={tinte} />
      <Rect x={p.ancho - s} y={s} width={s} height={p.alto - 2 * s} fill={tinte} />
      {anillado && (
        <Rect x={xAnillo} y={0} width={s + f.margen_anillado_mm!} height={p.alto} fill="rgba(224,106,52,0.16)" />
      )}
      <Rect x={s} y={s} width={f.ancho_mm} height={f.alto_mm} stroke="#38bdf8" strokeWidth={1} strokeScaleEnabled={false} />
      <Rect x={s + z} y={s + z} width={f.ancho_mm - 2 * z} height={f.alto_mm - 2 * z} stroke="#f472b6" strokeWidth={1} strokeScaleEnabled={false} dash={[2, 1.5]} />
    </Group>
  );
}

function NodoCapa({
  capa,
  url,
  imagen,
  editable,
  versionFuentes,
  alSeleccionar,
  alCambiar,
}: {
  capa: Capa;
  url?: string;
  imagen?: HTMLImageElement;
  editable: boolean;
  versionFuentes: number;
  alSeleccionar: () => void;
  alCambiar: (parcial: Partial<Capa>) => void;
}) {
  if (!capa.visible) return null;
  const comun = {
    id: capa.id,
    x: capa.x,
    y: capa.y,
    rotation: capa.rotacion,
    opacity: capa.opacidad,
    draggable: editable && !capa.bloqueada,
    onMouseDown: editable ? alSeleccionar : undefined,
    onTap: editable ? alSeleccionar : undefined,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => alCambiar({ x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const cambios: Partial<Capa> = { x: n.x(), y: n.y(), rotacion: Math.round(n.rotation() * 10) / 10, ancho: Math.max(1, capa.ancho * n.scaleX()) };
      if (capa.tipo === "texto") {
        const texto = (n as Konva.Group).findOne("Text") as Konva.Text | undefined;
        n.scaleX(1); n.scaleY(1);
        if (texto) { texto.width(cambios.ancho!); cambios.alto = texto.height(); }
      } else {
        cambios.alto = Math.max(1, capa.alto * n.scaleY());
        n.scaleX(1); n.scaleY(1);
      }
      alCambiar(cambios);
    },
  };

  if (capa.tipo === "imagen") {
    return (
      <Group {...comun}>
        {imagen?.complete && imagen.naturalWidth ? (
          <KImage image={imagen} width={capa.ancho} height={capa.alto} />
        ) : (
          <Rect width={capa.ancho} height={capa.alto} fill="rgba(128,128,128,0.25)" />
        )}
        {!url && <Rect width={capa.ancho} height={capa.alto} stroke="#f87171" strokeWidth={1} strokeScaleEnabled={false} />}
      </Group>
    );
  }
  if (capa.tipo === "texto") {
    const t = capa.texto;
    return (
      <Group {...comun}>
        <Text
          key={versionFuentes}
          text={textoVisible(capa)}
          width={capa.ancho}
          fontFamily={`"${t.fuente.familia}"`}
          fontStyle={estiloKonva(t.fuente)}
          fontSize={t.tamano_pt * MM_POR_PT}
          lineHeight={t.interlineado}
          letterSpacing={t.espaciado_mm}
          align={t.alineacion}
          fill={t.color}
        />
      </Group>
    );
  }
  const f = capa.forma;
  return (
    <Group {...comun}>
      {f.figura === "elipse" ? (
        <Ellipse x={capa.ancho / 2} y={capa.alto / 2} radiusX={capa.ancho / 2} radiusY={capa.alto / 2} fill={f.relleno ?? undefined} stroke={f.borde ?? undefined} strokeWidth={f.borde ? f.grosor_mm : 0} />
      ) : (
        <Rect width={capa.ancho} height={capa.alto} cornerRadius={f.radio_mm} fill={f.relleno ?? undefined} stroke={f.borde ?? undefined} strokeWidth={f.borde ? f.grosor_mm : 0} />
      )}
    </Group>
  );
}

export function Lienzo({
  caras,
  activa,
  seleccion,
  urls,
  zoom,
  guias,
  modo = "editar",
  versionFuentes,
  alto = "min(72dvh, 820px)",
  onElegirCara,
  onSeleccionar,
  onCambiar,
  onControl,
}: {
  caras: CaraEditor[];
  activa?: string;
  seleccion?: string | null;
  urls: Record<string, string>;
  zoom: number;
  guias: boolean;
  modo?: "editar" | "exportar";
  versionFuentes: number;
  alto?: string;
  onElegirCara?: (id: string) => void;
  onSeleccionar?: (caraId: string, capaId: string | null) => void;
  onCambiar?: (caraId: string, capaId: string, parcial: Partial<Capa>) => void;
  onControl?: (c: ControlLienzo | null, listo: boolean) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const transformador = useRef<Konva.Transformer>(null);
  const [tam, setTam] = useState({ w: 900, h: 600 });
  const editable = modo === "editar";

  useEffect(() => {
    if (!contenedor.current) return;
    const obs = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(contenedor.current);
    return () => obs.disconnect();
  }, []);

  // Posición de cada mesa de trabajo en mm.
  const mesas = useMemo(
    () =>
      caras.map((c, i) => ({
        ...c,
        pliego: tamanoPliego(c.formato),
        x: caras.slice(0, i).reduce((s, prev) => s + tamanoPliego(prev.formato).ancho + SEPARACION_MM, 0),
      })),
    [caras],
  );
  const anchoTotal = mesas.reduce((s, m) => s + m.pliego.ancho, 0) + SEPARACION_MM * Math.max(0, mesas.length - 1);
  const altoTotal = Math.max(...mesas.map((m) => m.pliego.alto)) + ETIQUETA_MM;
  const ajuste = modo === "exportar" ? 1 : Math.min((tam.w - 48) / anchoTotal, (tam.h - 48) / altoTotal);
  const escala = ajuste * (modo === "exportar" ? 1 : zoom);
  const origen = { x: (tam.w - anchoTotal * escala) / 2, y: (tam.h - altoTotal * escala) / 2 + ETIQUETA_MM * escala };

  const todasUrls = useMemo(
    () => caras.flatMap((c) => c.composicion.capas.filter((k) => k.tipo === "imagen").map((k) => (k.tipo === "imagen" ? urls[k.imagen.archivo] : ""))).filter(Boolean),
    [caras, urls],
  );
  const { obtener, todas } = useImagenes(todasUrls);

  // Transformer sobre la capa seleccionada.
  useEffect(() => {
    const tr = transformador.current;
    if (!tr || !stage.current) return;
    const nodo = seleccion ? stage.current.findOne(`#${seleccion}`) : null;
    const capa = caras.flatMap((c) => c.composicion.capas).find((k) => k.id === seleccion);
    tr.nodes(nodo && capa && !capa.bloqueada ? [nodo] : []);
    tr.keepRatio(capa?.tipo === "imagen");
    tr.enabledAnchors(capa?.tipo === "texto" ? ["middle-left", "middle-right"] : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]);
    tr.getLayer()?.batchDraw();
  }, [seleccion, caras, versionFuentes]);

  // Control de exportación (Entrega): PNG del área de corte de cada cara.
  useEffect(() => {
    if (!onControl) return;
    const control: ControlLienzo = {
      exportarCara: (caraId, ladoLargoPx) => {
        const m = mesas.find((x) => x.id === caraId);
        if (!m || !stage.current) return null;
        const s = m.formato.sangrado_mm;
        const r = { x: origen.x + (m.x + s) * escala, y: origen.y + s * escala, width: m.formato.ancho_mm * escala, height: m.formato.alto_mm * escala };
        return stage.current.toDataURL({ ...r, pixelRatio: ladoLargoPx / Math.max(r.width, r.height), mimeType: "image/png" });
      },
    };
    onControl(control, todas);
  }, [onControl, mesas, origen.x, origen.y, escala, todas]);

  return (
    <div ref={contenedor} className="relative w-full overflow-hidden rounded-panel bg-escenario" style={{ height: alto }}>
      <Stage
        ref={stage}
        width={tam.w}
        height={tam.h}
        onMouseDown={(e) => { if (editable && e.target === e.target.getStage()) onSeleccionar?.(activa ?? "", null); }}
      >
        <Layer>
          <Group x={origen.x} y={origen.y} scaleX={escala} scaleY={escala}>
            {mesas.map((m) => (
              <Group key={m.id} x={m.x}>
                {modo === "editar" && (
                  <Text
                    y={-ETIQUETA_MM + 1.5}
                    text={m.cara.toUpperCase()}
                    fontSize={3.4}
                    letterSpacing={0.4}
                    fontFamily="system-ui, sans-serif"
                    fill={m.id === activa ? "#e06a34" : "#8b8b93"}
                    onMouseDown={() => onElegirCara?.(m.id)}
                  />
                )}
                <Group clipX={0} clipY={0} clipWidth={m.pliego.ancho} clipHeight={m.pliego.alto}>
                  <Rect
                    width={m.pliego.ancho}
                    height={m.pliego.alto}
                    fill={m.composicion.fondo}
                    onMouseDown={() => { if (editable) { onElegirCara?.(m.id); onSeleccionar?.(m.id, null); } }}
                  />
                  {m.composicion.capas.map((capa) => (
                    <NodoCapa
                      key={capa.id}
                      capa={capa}
                      url={capa.tipo === "imagen" ? urls[capa.imagen.archivo] : undefined}
                      imagen={capa.tipo === "imagen" && urls[capa.imagen.archivo] ? obtener(urls[capa.imagen.archivo]) : undefined}
                      editable={editable}
                      versionFuentes={versionFuentes}
                      alSeleccionar={() => { onElegirCara?.(m.id); onSeleccionar?.(m.id, capa.id); }}
                      alCambiar={(parcial) => onCambiar?.(m.id, capa.id, parcial)}
                    />
                  ))}
                </Group>
                {guias && modo === "editar" && <Guias f={m.formato} />}
                {modo === "editar" && m.id === activa && (
                  <Rect width={m.pliego.ancho} height={m.pliego.alto} stroke="#e06a34" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} opacity={0.6} />
                )}
              </Group>
            ))}
          </Group>
          {editable && (
            <Transformer
              ref={transformador}
              rotationSnaps={[0, 90, 180, 270]}
              anchorSize={8}
              borderStroke="#e06a34"
              anchorStroke="#e06a34"
              anchorFill="#ffffff"
              ignoreStroke
              boundBoxFunc={(viejo, nuevo) => (nuevo.width < 3 || nuevo.height < 3 ? viejo : nuevo)}
            />
          )}
        </Layer>
      </Stage>
      {modo === "editar" && !todas && todasUrls.length > 0 && (
        <p className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-neutral-300">Cargando imágenes…</p>
      )}
    </div>
  );
}
