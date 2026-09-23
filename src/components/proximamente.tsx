import { Vacio } from "@/components/ui";

export function Proximamente({ fase, titulo, children }: { fase: number; titulo: string; children: React.ReactNode }) {
  return (
    <Vacio titulo={titulo}>
      <p>{children}</p>
      <p className="mt-2 text-texto-3">Llega en la Fase {fase}. La base de datos ya tiene su estructura lista.</p>
    </Vacio>
  );
}
