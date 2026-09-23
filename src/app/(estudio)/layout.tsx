import { redirect } from "next/navigation";
import { BarraLateral } from "@/components/shell/barra-lateral";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export default async function LayoutEstudio({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <BarraLateral correo={data.user.email ?? ""} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
