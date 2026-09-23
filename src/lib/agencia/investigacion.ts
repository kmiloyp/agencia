import "server-only";
import { llamarTexto, type ContextoMotor } from "@/lib/motor-creativo";
import { briefVigente, cargarProyecto } from "./datos";

const SISTEMA = `Eres el estratega de una agencia de diseño. Con búsqueda web, produces un mini informe para orientar la creatividad de una pieza. Máximo una pantalla de lectura (≈ 350 palabras), en español, en Markdown con exactamente estas secciones:

## Tendencias
## Qué hace la competencia
## Clichés a evitar
## Oportunidades de diferenciación

Viñetas cortas y concretas. Cita solo lo que encontraste; no inventes datos. No incluyas una sección de fuentes (se listan aparte).`;

export async function investigar(ctx: ContextoMotor, proyectoId: string) {
  const [proyecto, brief] = await Promise.all([cargarProyecto(ctx, proyectoId), briefVigente(ctx, proyectoId)]);
  if (!brief) throw new Error("Primero hace falta un brief.");
  const { texto, fuentes } = await llamarTexto({
    ctx,
    proyectoId,
    concepto: "Investigación con búsqueda web",
    sistema: SISTEMA,
    contenido: `Pieza: ${proyecto.tipo_pieza?.nombre ?? brief.contenido.tipo_pieza}\nBrief: ${JSON.stringify(brief.contenido)}`,
    busquedaWeb: { maxUsos: 6 },
    esfuerzo: "medium",
  });
  return { informe: texto.trim(), fuentes };
}
