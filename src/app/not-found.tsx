import Link from "next/link";
import { clasesBoton } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="grid justify-items-start gap-3">
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="text-sm text-texto-2">Puede que el proyecto se haya borrado o que el enlace esté mal.</p>
        <Link href="/" className={clasesBoton("primario")}>Volver al inicio</Link>
      </div>
    </main>
  );
}
