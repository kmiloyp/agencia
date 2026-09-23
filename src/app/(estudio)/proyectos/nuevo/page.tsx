import type { Metadata } from "next";
import { NuevoEncargo } from "@/components/proyecto/nuevo-encargo";

export const metadata: Metadata = { title: "Nuevo proyecto" };

export default function NuevoProyecto() {
  return (
    <div className="grid max-w-3xl gap-6 pt-4 md:pt-10">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo proyecto</h1>
        <p className="text-texto-2">Tu ejecutivo de cuenta te hará las preguntas necesarias, una a la vez, y cerrará con un brief que puedes editar.</p>
      </div>
      <NuevoEncargo autoFocus />
    </div>
  );
}
