import type { Metadata } from "next";
import { FormularioEntrar } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ volver?: string; falta?: string }> }) {
  const { volver, falta } = await searchParams;
  const sinSupabase = falta === "supabase" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Agencia</h1>
        <p className="mt-1 mb-8 text-sm text-texto-2">Entra para seguir con tus proyectos.</p>
        {sinSupabase ? (
          <div className="rounded-panel border border-borde bg-superficie p-4 text-sm text-texto-2">
            <p className="font-medium text-texto">Falta conectar Supabase.</p>
            <p className="mt-1">Pon NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local y reinicia el servidor. Los pasos están en AGENTS.md.</p>
          </div>
        ) : (
          <FormularioEntrar volver={volver ?? "/"} />
        )}
      </div>
    </main>
  );
}
