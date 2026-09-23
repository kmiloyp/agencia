import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas que no exigen sesión. */
const PUBLICAS = ["/entrar", "/aprobar", "/api/webhooks", "/api/cron"];

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ruta = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(p + "/"));

  if (!url || !anon) {
    // Sin Supabase configurado: deja ver /entrar con el aviso de configuración.
    if (publica) return respuesta;
    return NextResponse.redirect(new URL("/entrar?falta=supabase", request.url));
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && !publica) {
    const destino = new URL("/entrar", request.url);
    destino.searchParams.set("volver", ruta);
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|stub/|.*\\.(?:svg|png|jpg|jpeg|webp|woff2?)$).*)"],
};
