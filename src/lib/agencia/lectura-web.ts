import "server-only";
import { llamarTexto, type ContextoMotor } from "@/lib/motor-creativo";

// Enlaces completos o dominios sueltos como "kpempaques.com.co/nosotros".
const PATRON = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s)]*)?/gi;
const NO_SITIO = /@|\.(?:png|jpe?g|gif|webp|pdf)$/i;

export function extraerUrls(texto: string): string[] {
  const encontrados = new Set<string>();
  for (const m of texto.matchAll(PATRON)) {
    const inicio = m.index ?? 0;
    // Ignora correos (usuario@dominio.com) y archivos.
    if (texto[inicio - 1] === "@" || NO_SITIO.test(m[0])) continue;
    const limpio = m[0].replace(/[.,;:!?]+$/, "");
    encontrados.add(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`);
  }
  return [...encontrados].slice(0, 5);
}

const SISTEMA = `Eres el asistente de investigación de una agencia de diseño. Lee los sitios web indicados con la herramienta web_fetch (puedes abrir también sus páginas internas de "nosotros", "contacto" o similares) y, si hace falta, usa web_search para encontrar las redes sociales oficiales de la marca.

Devuelve en español, en Markdown breve, SOLO lo que encontraste (no inventes nada):
- **Empresa:** nombre y a qué se dedica
- **Claim / eslogan:** textual, entre comillas
- **Descripción:** 2–3 frases con sus palabras
- **Contacto:** dirección, teléfonos, correo, web (textuales)
- **Redes:** URLs o usuarios oficiales
- **Identidad visual observada:** colores, tipografía y estilo del sitio, si se puede inferir
Si un dato no aparece, escribe "no encontrado". Si el sitio no carga, dilo claramente.`;

export async function leerSitios(ctx: ContextoMotor, proyectoId: string, urls: string[]): Promise<string> {
  const { texto } = await llamarTexto({
    ctx,
    proyectoId,
    concepto: "Lectura de sitio web (recepción)",
    sistema: SISTEMA,
    contenido: `Lee estos sitios:\n${urls.join("\n")}`,
    lecturaWeb: { maxUsos: 6 },
    busquedaWeb: { maxUsos: 3 },
    esfuerzo: "medium",
  });
  return texto.trim();
}
