"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { clave: "brief", texto: "Brief" },
  { clave: "investigacion", texto: "Investigación" },
  { clave: "rutas", texto: "Rutas" },
  { clave: "produccion", texto: "Producción" },
  { clave: "composicion", texto: "Composición" },
  { clave: "entrega", texto: "Entrega" },
];

export function Pestanas({ proyectoId }: { proyectoId: string }) {
  const ruta = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Etapas del proyecto">
      {PESTANAS.map((p) => {
        const activa = ruta.startsWith(`/proyectos/${proyectoId}/${p.clave}`);
        return (
          <Link
            key={p.clave}
            href={`/proyectos/${proyectoId}/${p.clave}`}
            aria-current={activa ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 pb-2.5 text-sm transition ${
              activa ? "border-acento font-medium text-texto" : "border-transparent text-texto-2 hover:text-texto"
            }`}
          >
            {p.texto}
          </Link>
        );
      })}
    </nav>
  );
}
