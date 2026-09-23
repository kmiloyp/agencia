import type { Metadata } from "next";
import { FormularioAprobacion } from "@/components/entrega/formulario-aprobacion";
import { aprobacionPorToken } from "@/lib/agencia/aprobacion";

export const metadata: Metadata = { title: "Aprobación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function NoDisponible() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Enlace no disponible</h1>
        <p className="mt-2 text-sm text-texto-2">Este enlace de aprobación no es válido, ya se cerró o expiró. Pide uno nuevo a tu diseñador.</p>
      </div>
    </main>
  );
}

// El token se valida en el servidor (hash + expiración); la base nunca se abre al público.
export default async function Aprobar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const encontrada = await aprobacionPorToken(token);
  if (!encontrada) return <NoDisponible />;
  const { db, aprobacion } = encontrada;
  const { data } = await db.storage.from("generaciones").createSignedUrls(aprobacion.opciones.map((o) => o.archivo), 3600);
  const opciones = aprobacion.opciones.map((o, i) => ({ id: o.generacion_id, titulo: o.titulo, url: data?.[i]?.signedUrl ?? "" })).filter((o) => o.url);
  return (
    <main className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:px-8">
      <header className="grid gap-2">
        <p className="text-sm text-texto-2">{aprobacion.proyectos?.titulo}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{aprobacion.titulo ?? "Opciones para tu revisión"}</h1>
        <p className="max-w-[65ch] text-texto-2">Marca lo que te gusta y lo que no, y deja tus comentarios en cada opción. No necesitas crear una cuenta.</p>
      </header>
      <FormularioAprobacion token={token} opciones={opciones} />
    </main>
  );
}
