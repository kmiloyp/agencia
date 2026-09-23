"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Cliente del navegador: solo lectura con RLS y Realtime. Nunca llama a fal ni a Anthropic. */
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
