import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

function autorizado(request: NextRequest) {
  const cabecera = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${env.cronSecret()}`;
  const a = Buffer.from(cabecera);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Explorador semanal de modelos (Vercel Cron o n8n con Authorization: Bearer $CRON_SECRET).
 * Fase 3: consultará GET https://api.fal.ai/v1/models (endpoint oficial verificado),
 * revisará rankings con Claude + búsqueda web y correrá el banco de pruebas.
 */
export async function GET(request: NextRequest) {
  try {
    if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, estado: "pendiente_fase_3", mensaje: "El explorador de modelos se implementa en la Fase 3." });
}
