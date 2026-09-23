export function usd(n: number | string | null | undefined, decimales = 2) {
  const v = Number(n ?? 0);
  return `$${v.toFixed(v > 0 && v < 0.01 ? 4 : decimales)}`;
}

export function fecha(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(iso));
}

export function fechaHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const NOMBRES_ESTADO: Record<string, string> = {
  recepcion: "Recepción",
  investigacion: "Investigación",
  rutas: "Rutas",
  produccion: "Producción",
  composicion: "Composición",
  entregado: "Entregado",
};
