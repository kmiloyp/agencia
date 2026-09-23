import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Cliente con la sesión del usuario (respeta RLS). Para Server Components, Actions y Route Handlers. */
export async function crearClienteServidor() {
  const almacen = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Devuelve el usuario autenticado o lanza un error claro. */
export async function usuarioActual() {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  return { supabase, usuario: data.user };
}
