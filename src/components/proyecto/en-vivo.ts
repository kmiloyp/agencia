"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { sincronizarProyecto } from "@/app/acciones/proyecto";
import { crearClienteNavegador } from "@/lib/supabase/navegador";

/**
 * Mantiene la galería al día: Realtime sobre `generaciones` y, mientras haya
 * pendientes, sondeo cada 4 s (en local fal no puede llamar al webhook).
 */
export function useGeneracionesEnVivo(proyectoId: string, hayPendientes: boolean) {
  const router = useRouter();
  const sondeando = useRef(false);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`generaciones-${proyectoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "generaciones", filter: `proyecto_id=eq.${proyectoId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [proyectoId, router]);

  useEffect(() => {
    if (!hayPendientes) return;
    let activo = true;
    const ciclo = async () => {
      while (activo) {
        await new Promise((r) => setTimeout(r, 4000));
        if (!activo || sondeando.current) continue;
        sondeando.current = true;
        await sincronizarProyecto(proyectoId).catch(() => null);
        sondeando.current = false;
        router.refresh();
      }
    };
    ciclo();
    return () => {
      activo = false;
    };
  }, [hayPendientes, proyectoId, router]);
}
