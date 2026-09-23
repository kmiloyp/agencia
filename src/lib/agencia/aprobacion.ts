import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export interface OpcionAprobacion {
  generacion_id: string;
  archivo: string; // ruta en el bucket generaciones
  titulo: string;
}

export interface VotoOpcion {
  generacion_id: string;
  voto: "me_gusta" | "no_me_gusta" | null;
  comentario: string;
}

export interface EnvioCliente {
  nombre: string;
  fecha: string;
  comentario: string;
  opciones: VotoOpcion[];
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function nuevoToken() {
  return randomBytes(24).toString("base64url");
}

/** Busca una aprobación vigente por token (servidor, service_role). */
export async function aprobacionPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = crearClienteAdmin();
  const { data } = await db
    .from("aprobaciones")
    .select("id, owner_id, proyecto_id, titulo, opciones, votos, estado, expira_en, proyectos(titulo, cliente_id)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.estado !== "abierta" || new Date(data.expira_en) < new Date()) return null;
  const aprobacion = data as unknown as {
    id: string;
    owner_id: string;
    proyecto_id: string;
    titulo: string | null;
    opciones: OpcionAprobacion[];
    votos: EnvioCliente[];
    proyectos: { titulo: string; cliente_id: string | null } | null;
  };
  return { db, aprobacion };
}
