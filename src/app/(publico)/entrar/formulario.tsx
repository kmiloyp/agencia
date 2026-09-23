"use client";
import { useActionState } from "react";
import { entrar } from "@/app/acciones/sesion";
import { Boton, Etiqueta, claseCampo } from "@/components/ui";

export function FormularioEntrar({ volver }: { volver: string }) {
  const [estado, accion, pendiente] = useActionState(entrar, {});
  return (
    <form action={accion} className="grid gap-4">
      <input type="hidden" name="volver" value={volver} />
      <div className="grid gap-2">
        <Etiqueta htmlFor="correo">Correo</Etiqueta>
        <input id="correo" name="correo" type="email" autoComplete="email" required className={claseCampo} />
      </div>
      <div className="grid gap-2">
        <Etiqueta htmlFor="clave">Contraseña</Etiqueta>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required className={claseCampo} />
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      </div>
      <Boton variante="primario" disabled={pendiente} className="mt-2">{pendiente ? "Entrando…" : "Entrar"}</Boton>
    </form>
  );
}
