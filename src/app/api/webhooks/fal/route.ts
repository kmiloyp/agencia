import { after, NextResponse, type NextRequest } from "next/server";
import { contextoSistema } from "@/lib/contexto";
import { recibirWebhook, verificarWebhookFal } from "@/lib/motor-creativo";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cuerpo = Buffer.from(await request.arrayBuffer());
  const valido = await verificarWebhookFal(
    {
      requestId: request.headers.get("x-fal-webhook-request-id"),
      userId: request.headers.get("x-fal-webhook-user-id"),
      timestamp: request.headers.get("x-fal-webhook-timestamp"),
      firma: request.headers.get("x-fal-webhook-signature"),
    },
    cuerpo,
  ).catch(() => false);
  if (!valido) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  let datos: { request_id?: string; status?: string; payload?: unknown; error?: string; payload_error?: string };
  try {
    datos = JSON.parse(cuerpo.toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!datos.request_id) return NextResponse.json({ ok: true });

  const { data: gen } = await crearClienteAdmin()
    .from("generaciones")
    .select("id, owner_id")
    .eq("fal_request_id", datos.request_id)
    .maybeSingle();
  // Peticiones antiguas (p. ej. reemplazadas por una regeneración de QC) se ignoran.
  if (!gen) return NextResponse.json({ ok: true });

  // Responder 2xx rápido; descarga, Storage y QC corren después.
  after(async () => {
    await recibirWebhook(contextoSistema(gen.owner_id), gen.id, datos).catch((e) => console.error("[webhook fal]", e));
  });
  return NextResponse.json({ ok: true });
}
