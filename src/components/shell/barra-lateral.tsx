"use client";
import {
  Coins,
  Cpu,
  Folders,
  House,
  MoonStars,
  Ruler,
  SignOut,
  Sun,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cerrarSesion } from "@/app/acciones/sesion";

const ENLACES = [
  { href: "/", texto: "Inicio", icono: House },
  { href: "/proyectos", texto: "Proyectos", icono: Folders },
  { href: "/clientes", texto: "Clientes", icono: UsersThree },
  { href: "/personajes", texto: "Personajes", icono: UserCircle },
  { href: "/tipos-de-pieza", texto: "Tipos de pieza", icono: Ruler },
  { href: "/modelos", texto: "Modelos", icono: Cpu },
  { href: "/costos", texto: "Costos", icono: Coins },
];

function leerTema(): "light" | "dark" {
  const forzado = document.documentElement.dataset.theme;
  if (forzado === "light" || forzado === "dark") return forzado;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function suscribirTema(aviso: () => void) {
  const observador = new MutationObserver(aviso);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", aviso);
  return () => { observador.disconnect(); media.removeEventListener("change", aviso); };
}

function SelectorTema() {
  const tema = useSyncExternalStore(suscribirTema, leerTema, () => null);
  const alternar = () => {
    const siguiente = leerTema() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = siguiente;
    try {
      localStorage.setItem("tema", siguiente);
    } catch {}
  };
  return (
    <button onClick={alternar} className="flex h-9 w-9 items-center justify-center rounded-control text-texto-2 hover:bg-superficie-2 hover:text-texto" aria-label="Cambiar tema">
      {tema === "dark" ? <Sun size={18} /> : <MoonStars size={18} />}
    </button>
  );
}

export function BarraLateral({ correo }: { correo: string }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  return (
    <aside className="flex shrink-0 flex-col border-borde bg-superficie md:sticky md:top-0 md:h-[100dvh] md:w-56 md:border-r max-md:border-b">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">Agencia</Link>
        <div className="md:hidden"><SelectorTema /></div>
      </div>
      <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible">
        {ENLACES.map(({ href, texto, icono: Icono }) => (
          <Link
            key={href}
            href={href}
            className={`flex h-9 shrink-0 items-center gap-2.5 rounded-control px-2.5 text-sm transition ${
              activo(href) ? "bg-superficie-2 font-medium text-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto"
            }`}
          >
            <Icono size={18} weight={activo(href) ? "fill" : "regular"} />
            {texto}
          </Link>
        ))}
      </nav>
      <div className="hidden items-center justify-between gap-2 border-t border-borde px-3 py-3 md:flex">
        <span className="truncate text-xs text-texto-3" title={correo}>{correo}</span>
        <div className="flex">
          <SelectorTema />
          <form action={cerrarSesion}>
            <button className="flex h-9 w-9 items-center justify-center rounded-control text-texto-2 hover:bg-superficie-2 hover:text-texto" aria-label="Cerrar sesión">
              <SignOut size={18} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
