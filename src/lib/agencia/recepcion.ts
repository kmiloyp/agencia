import "server-only";
import { llamarEstructurado, type ContextoMotor } from "@/lib/motor-creativo";
import { briefVigente, cargarProyecto, resumenReferencias } from "./datos";
import { EsquemaTurnoRecepcion, type TurnoRecepcion } from "./esquemas";

const SISTEMA = `Eres el ejecutivo de cuenta de una agencia de diseño de primer nivel. Atiendes a Camilo, diseñador y dueño de la agencia, que llega con una necesidad de diseño para un cliente suyo.

Tu trabajo en la recepción:
1. Identificar el tipo de pieza. Si alguna plantilla existente sirve, usa su clave. Si ninguna sirve, propón una nueva con medidas reales en mm y preguntas.
2. Reunir lo necesario para un brief sólido haciendo las preguntas de la plantilla UNA A LA VEZ o en grupos cortos (máx. 2–3), en tono cálido, profesional y directo. Nada de interrogatorios: infiere lo obvio, resume lo entendido y pregunta solo lo que falta.
3. En el momento oportuno, pide referencias visuales (me gusta, no me gusta, inspiración, activos del cliente como logos). Si ya hay referencias analizadas, úsalas.
4. Si el cliente tiene historial (gustos y rechazos), tenlo en cuenta y menciónalo cuando sume.
5. Cuando tengas lo esencial (público, propósito, mensaje, textos obligatorios, restricciones y qué no gustó antes), devuelve el brief completo en el campo "brief" y en "respuesta" dile que lo revise y edite antes de aprobarlo. No inventes datos: si algo no se dijo, déjalo como lista vacía o null.

Cuando Camilo comparte un sitio web, la app lo lee por ti y te entrega su contenido junto al mensaje ("Contenido leído de …"). Usa esos datos (claim, descripción, contactos, redes) tal cual en el brief; no le pidas que los copie a mano. Si la lectura falló, dilo y entonces sí pídeselos.

Responde siempre en español. Mantén "respuesta" corta (2–6 líneas).`;

export async function turnoRecepcion(ctx: ContextoMotor, proyectoId: string, mensajeUsuario: string): Promise<TurnoRecepcion> {
  const [proyecto, brief, referencias, historial, tipos] = await Promise.all([
    cargarProyecto(ctx, proyectoId),
    briefVigente(ctx, proyectoId),
    resumenReferencias(ctx, proyectoId),
    ctx.db.from("mensajes").select("rol, contenido, meta").eq("proyecto_id", proyectoId).eq("owner_id", ctx.ownerId).order("created_at").limit(60),
    ctx.db.from("tipos_pieza").select("clave, nombre, descripcion, formato, preguntas_recepcion").eq("owner_id", ctx.ownerId),
  ]);

  const contexto = [
    `Plantillas de pieza disponibles:\n${JSON.stringify(tipos.data ?? [], null, 1)}`,
    proyecto.tipo_pieza && `Tipo de pieza ya elegido: ${proyecto.tipo_pieza.clave}`,
    proyecto.cliente && `Cliente: ${proyecto.cliente.nombre}${proyecto.cliente.empresa ? ` (${proyecto.cliente.empresa})` : ""}. Historial de preferencias: ${JSON.stringify(proyecto.cliente.preferencias)}`,
    referencias && `Referencias analizadas:\n${referencias}`,
    brief && `Brief actual (versión ${brief.version}${brief.aprobado ? ", aprobado" : ", borrador"}):\n${JSON.stringify(brief.contenido)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Historial alternado usuario/agencia; el contexto va en el primer turno del usuario.
  const previos = (historial.data ?? []).map((m) => {
    const lectura = (m.meta as { lectura_web?: { urls: string[]; contenido: string } } | null)?.lectura_web;
    return {
      role: m.rol === "usuario" ? ("user" as const) : ("assistant" as const),
      content: lectura ? `${m.contenido}\n\n[Contenido leído de ${lectura.urls.join(", ")}]\n${lectura.contenido}` : m.contenido,
    };
  });
  // La API exige empezar con "user" y alternar: fusiona mensajes consecutivos del mismo rol.
  const alternados: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of previos) {
    const ultimo = alternados[alternados.length - 1];
    if (ultimo?.role === m.role) ultimo.content += `\n\n${m.content}`;
    else alternados.push({ ...m });
  }
  if (alternados[0]?.role === "assistant") alternados.unshift({ role: "user", content: "(inicio)" });
  if (alternados[alternados.length - 1]?.role === "user") {
    const pendiente = alternados.pop()!;
    mensajeUsuario = mensajeUsuario ? `${pendiente.content}\n\n${mensajeUsuario}` : pendiente.content;
  }

  if (!mensajeUsuario) mensajeUsuario = "Hola, quiero empezar un proyecto nuevo.";
  return llamarEstructurado({
    ctx,
    proyectoId,
    concepto: "Recepción (ejecutivo de cuenta)",
    sistema: `${SISTEMA}\n\n## Contexto actual\n${contexto}`,
    historial: alternados,
    contenido: mensajeUsuario,
    esquema: EsquemaTurnoRecepcion,
    esfuerzo: "medium",
  });
}
