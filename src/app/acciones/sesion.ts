"use server";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export async function entrar(_: unknown, datos: FormData): Promise<{ error?: string }> {
  const correo = String(datos.get("correo") ?? "").trim();
  const clave = String(datos.get("clave") ?? "");
  const volver = String(datos.get("volver") ?? "/");
  if (!correo || !clave) return { error: "Escribe tu correo y tu contraseña." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect(volver.startsWith("/") && !volver.startsWith("//") ? volver : "/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
