/**
 * Verificación de webhooks de fal.ai. fal firma cada entrega con ED25519; las
 * llaves públicas están en su JWKS. No hay secreto compartido.
 * https://fal.ai/docs/documentation/model-apis/inference/webhooks
 */
import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const TOLERANCIA_S = 300;
const CACHE_MS = 12 * 60 * 60 * 1000; // fal permite cachear hasta 24 h

let llaves: { cargadas: number; claves: KeyObject[] } | null = null;

async function obtenerLlaves(forzar = false): Promise<KeyObject[]> {
  if (!forzar && llaves && Date.now() - llaves.cargadas < CACHE_MS) return llaves.claves;
  const r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`JWKS de fal no disponible (HTTP ${r.status})`);
  const jwks = (await r.json()) as { keys: { kty: string; crv: string; x: string }[] };
  const claves = jwks.keys
    .filter((k) => k.kty === "OKP" && k.crv === "Ed25519")
    .map((k) => createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }));
  llaves = { cargadas: Date.now(), claves };
  return claves;
}

export interface CabecerasFal {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  firma: string | null;
}

export async function verificarWebhookFal(c: CabecerasFal, cuerpo: Buffer): Promise<boolean> {
  if (!c.requestId || !c.userId || !c.timestamp || !c.firma) return false;
  const ts = Number(c.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCIA_S) return false;

  const hashCuerpo = createHash("sha256").update(cuerpo).digest("hex");
  const mensaje = Buffer.from([c.requestId, c.userId, c.timestamp, hashCuerpo].join("\n"), "utf-8");
  let firma: Buffer;
  try {
    firma = Buffer.from(c.firma, "hex");
  } catch {
    return false;
  }
  const prueba = (claves: KeyObject[]) => claves.some((k) => {
    try {
      return verify(null, mensaje, k, firma);
    } catch {
      return false;
    }
  });
  if (prueba(await obtenerLlaves())) return true;
  // Rotación de llaves: reintenta una vez con el JWKS fresco.
  return prueba(await obtenerLlaves(true));
}
