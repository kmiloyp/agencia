"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { investigar } from "@/lib/agencia/investigacion";
import { extraerUrls, leerSitios } from "@/lib/agencia/lectura-web";
import { turnoRecepcion } from "@/lib/agencia/recepcion";
import { analizarReferencia } from "@/lib/agencia/referencias";
import { estimarMuestras, generarMuestras, proponerRutas } from "@/lib/agencia/rutas";
import { EsquemaBrief, type Brief, type TipoNuevo, type TurnoRecepcion } from "@/lib/agencia/esquemas";
import { briefVigente } from "@/lib/agencia/datos";
import { contextoSistema, contextoUsuario } from "@/lib/contexto";
import { env } from "@/lib/env";
import { sincronizarPendientes, type EstadoPresupuesto } from "@/lib/motor-creativo";
import { fallo, type Resultado } from "@/lib/resultado";

const TIPOS_REFERENCIA = ["me_gusta", "no_me_gusta", "inspiracion", "activo_del_cliente"] as const;

function rutaProyecto(id: string) {
  revalidatePath(`/proyectos/${id}`, "layout");
}

// ---------------------------------------------------------------------------
// Proyecto
// ---------------------------------------------------------------------------
export async function crearProyecto(datos: FormData) {
  const texto = String(datos.get("mensaje") ?? "").trim();
  const ctx = await contextoUsuario();
  const { data, error } = await ctx.db
    .from("proyectos")
    .insert({ owner_id: ctx.ownerId, presupuesto_usd: env.presupuestoProyecto(), titulo: texto ? texto.slice(0, 60) : "Proyecto sin título" })
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo crear el proyecto. Revisa la conexión con Supabase.");
  if (texto) {
    await ctx.db.from("mensajes").insert({ owner_id: ctx.ownerId, proyecto_id: data.id, rol: "usuario", contenido: texto });
  }
  redirect(`/proyectos/${data.id}/brief`);
}

export async function actualizarPresupuesto(proyectoId: string, presupuesto: number): Promise<Resultado> {
  try {
    if (!(presupuesto > 0)) return { ok: false, error: "El presupuesto debe ser mayor que cero." };
    const ctx = await contextoUsuario();
    await ctx.db.from("proyectos").update({ presupuesto_usd: presupuesto }).eq("id", proyectoId).eq("owner_id", ctx.ownerId);
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Recepción
// ---------------------------------------------------------------------------
async function aplicarTurno(ctx: Awaited<ReturnType<typeof contextoUsuario>>, proyectoId: string, t: TurnoRecepcion) {
  const { data: p } = await ctx.db.from("proyectos").select("titulo, tipo_pieza_id, cliente_id").eq("id", proyectoId).eq("owner_id", ctx.ownerId).single();
  const cambios: Record<string, unknown> = {};

  if (t.tipo_pieza_clave && !p?.tipo_pieza_id) {
    const { data: tipo } = await ctx.db.from("tipos_pieza").select("id").eq("owner_id", ctx.ownerId).eq("clave", t.tipo_pieza_clave).maybeSingle();
    if (tipo) cambios.tipo_pieza_id = tipo.id;
  }
  if (t.titulo_proyecto) cambios.titulo = t.titulo_proyecto.slice(0, 80);
  if (t.cliente_nombre && !p?.cliente_id) {
    const nombre = t.cliente_nombre.trim();
    const { data: existente } = await ctx.db.from("clientes").select("id").eq("owner_id", ctx.ownerId).ilike("nombre", nombre).maybeSingle();
    if (existente) cambios.cliente_id = existente.id;
    else {
      const { data: nuevo } = await ctx.db.from("clientes").insert({ owner_id: ctx.ownerId, nombre }).select("id").single();
      if (nuevo) cambios.cliente_id = nuevo.id;
    }
  }
  if (Object.keys(cambios).length) await ctx.db.from("proyectos").update(cambios).eq("id", proyectoId).eq("owner_id", ctx.ownerId);

  if (t.brief) await guardarBriefInterno(ctx, proyectoId, t.brief);
}

/** Responde al último mensaje del usuario si aún no tiene respuesta. */
export async function responderRecepcion(proyectoId: string): Promise<Resultado<{ id: string }>> {
  try {
    const ctx = await contextoUsuario();
    const { data: ultimos } = await ctx.db
      .from("mensajes")
      .select("id, rol, contenido, meta")
      .eq("proyecto_id", proyectoId)
      .eq("owner_id", ctx.ownerId)
      .order("created_at", { ascending: false })
      .limit(1);
    const ultimo = ultimos?.[0];
    if (!ultimo || ultimo.rol !== "usuario") return { ok: true, datos: { id: "" } };

    // Si el mensaje trae enlaces, se leen antes de responder y quedan guardados con él.
    const urls = extraerUrls(ultimo.contenido);
    if (urls.length && !(ultimo.meta as { lectura_web?: unknown } | null)?.lectura_web) {
      const contenido = await leerSitios(ctx, proyectoId, urls).catch(
        (e) => `No se pudo leer el sitio (${e instanceof Error ? e.message : String(e)}).`,
      );
      await ctx.db
        .from("mensajes")
        .update({ meta: { ...(ultimo.meta ?? {}), lectura_web: { urls, contenido } } })
        .eq("id", ultimo.id)
        .eq("owner_id", ctx.ownerId);
    }

    // El mensaje pendiente ya está en el historial; turnoRecepcion lo toma de ahí.
    const turno = await turnoRecepcion(ctx, proyectoId, "");
    await aplicarTurno(ctx, proyectoId, turno);
    const { data } = await ctx.db
      .from("mensajes")
      .insert({
        owner_id: ctx.ownerId,
        proyecto_id: proyectoId,
        rol: "agencia",
        contenido: turno.respuesta,
        meta: {
          pedir_referencias: turno.pedir_referencias,
          propuesta_tipo_nuevo: turno.propuesta_tipo_nuevo,
          brief_listo: !!turno.brief,
        },
      })
      .select("id")
      .single();
    rutaProyecto(proyectoId);
    return { ok: true, datos: { id: data?.id ?? "" } };
  } catch (e) {
    return fallo(e);
  }
}

export async function enviarMensaje(proyectoId: string, texto: string): Promise<Resultado<{ id: string }>> {
  try {
    const limpio = texto.trim();
    if (!limpio) return { ok: false, error: "Escribe un mensaje." };
    const ctx = await contextoUsuario();
    const { error } = await ctx.db.from("mensajes").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, rol: "usuario", contenido: limpio });
    if (error) throw new Error("No se pudo guardar tu mensaje.");
  } catch (e) {
    return fallo(e);
  }
  return responderRecepcion(proyectoId);
}

export async function crearTipoPieza(proyectoId: string, t: TipoNuevo): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { data, error } = await ctx.db
      .from("tipos_pieza")
      .upsert(
        {
          owner_id: ctx.ownerId,
          clave: t.clave,
          nombre: t.nombre,
          descripcion: t.descripcion,
          preguntas_recepcion: t.preguntas.map((pregunta, i) => ({ clave: `p${i + 1}`, pregunta, obligatoria: true })),
          formato: {
            ancho_mm: t.ancho_mm,
            alto_mm: t.alto_mm,
            sangrado_mm: t.sangrado_mm,
            zona_segura_mm: 5,
            lomo_mm: t.lomo_mm,
            caras: t.caras,
            dpi_objetivo: 300,
          },
        },
        { onConflict: "owner_id,clave" },
      )
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo crear la plantilla: ${error?.message}`);
    await ctx.db.from("proyectos").update({ tipo_pieza_id: data.id }).eq("id", proyectoId).eq("owner_id", ctx.ownerId);
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Referencias (el archivo ya se subió a Storage desde el navegador con RLS)
// ---------------------------------------------------------------------------
export async function registrarReferencia(
  proyectoId: string,
  archivo: string,
  mime: string,
  tipo: (typeof TIPOS_REFERENCIA)[number],
  nota: string,
  analizar = true,
): Promise<Resultado<{ id: string }>> {
  try {
    const ctx = await contextoUsuario();
    if (!archivo.startsWith(`${ctx.ownerId}/${proyectoId}/`)) return { ok: false, error: "Ruta de archivo no válida." };
    if (!TIPOS_REFERENCIA.includes(tipo)) return { ok: false, error: "Tipo de referencia no válido." };
    const { data, error } = await ctx.db
      .from("referencias")
      .insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, archivo, mime, tipo, nota: nota || null })
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo registrar la referencia: ${error?.message}`);
    const ownerId = ctx.ownerId;
    // El análisis con Claude visión corre después de responder; la UI se entera por Realtime.
    if (analizar) {
      after(async () => {
        await analizarReferencia(contextoSistema(ownerId), data.id).catch((e) => console.error("[referencias]", e));
      });
    } else {
      await ctx.db.from("referencias").update({ analisis_estado: "listo" }).eq("id", data.id);
    }
    rutaProyecto(proyectoId);
    return { ok: true, datos: { id: data.id } };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarReferencia(id: string, cambios: { tipo?: (typeof TIPOS_REFERENCIA)[number]; nota?: string }): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { data } = await ctx.db.from("referencias").update(cambios).eq("id", id).eq("owner_id", ctx.ownerId).select("proyecto_id").single();
    if (data) rutaProyecto(data.proyecto_id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function reanalizarReferencia(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    await analizarReferencia(ctx, id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function borrarReferencia(id: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { data } = await ctx.db.from("referencias").delete().eq("id", id).eq("owner_id", ctx.ownerId).select("proyecto_id, archivo").single();
    if (data) {
      await ctx.db.storage.from("referencias").remove([data.archivo]);
      rutaProyecto(data.proyecto_id);
    }
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------
async function guardarBriefInterno(ctx: Awaited<ReturnType<typeof contextoUsuario>>, proyectoId: string, contenido: Brief) {
  const actual = await briefVigente(ctx, proyectoId);
  if (actual && !actual.aprobado) {
    await ctx.db.from("briefs").update({ contenido }).eq("id", actual.id).eq("owner_id", ctx.ownerId);
  } else {
    // Editar un brief aprobado crea una versión nueva: nunca se pierde el anterior.
    await ctx.db.from("briefs").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, contenido, version: (actual?.version ?? 0) + 1 });
  }
}

export async function guardarBrief(proyectoId: string, contenido: Brief): Promise<Resultado> {
  try {
    const valido = EsquemaBrief.safeParse(contenido);
    if (!valido.success) return { ok: false, error: "El brief tiene campos con formato inválido.", sugerencia: "Revisa que las medidas sean números." };
    const ctx = await contextoUsuario();
    await guardarBriefInterno(ctx, proyectoId, valido.data);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function aprobarBrief(proyectoId: string, contenido: Brief): Promise<Resultado> {
  try {
    const guardado = await guardarBrief(proyectoId, contenido);
    if (!guardado.ok) return guardado;
    const ctx = await contextoUsuario();
    const actual = await briefVigente(ctx, proyectoId);
    if (!actual) return { ok: false, error: "No hay brief para aprobar." };
    await ctx.db.from("briefs").update({ aprobado: true, aprobado_en: new Date().toISOString() }).eq("id", actual.id).eq("owner_id", ctx.ownerId);
    await ctx.db.from("proyectos").update({ estado: "investigacion" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).eq("estado", "recepcion");
    rutaProyecto(proyectoId);
  } catch (e) {
    return fallo(e);
  }
  redirect(`/proyectos/${proyectoId}/investigacion`);
}

// ---------------------------------------------------------------------------
// Investigación
// ---------------------------------------------------------------------------
export async function hacerInvestigacion(proyectoId: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    const { informe, fuentes } = await investigar(ctx, proyectoId);
    await ctx.db.from("investigaciones").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, informe, fuentes });
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function omitirInvestigacion(proyectoId: string) {
  const ctx = await contextoUsuario();
  await ctx.db.from("investigaciones").insert({ owner_id: ctx.ownerId, proyecto_id: proyectoId, omitida: true });
  await ctx.db.from("proyectos").update({ estado: "rutas" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).in("estado", ["recepcion", "investigacion"]);
  rutaProyecto(proyectoId);
  redirect(`/proyectos/${proyectoId}/rutas`);
}

// ---------------------------------------------------------------------------
// Rutas creativas
// ---------------------------------------------------------------------------
export async function pedirRutas(proyectoId: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    await proponerRutas(ctx, proyectoId);
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function estimarLote(proyectoId: string): Promise<Resultado<{ imagenes: number; presupuesto: EstadoPresupuesto; modo: string }>> {
  try {
    const ctx = await contextoUsuario();
    return { ok: true, datos: await estimarMuestras(ctx, proyectoId, env.presupuestoMensual()) };
  } catch (e) {
    return fallo(e);
  }
}

export async function generarLote(
  proyectoId: string,
  confirmado: boolean,
): Promise<Resultado<{ creadas: number } | { presupuesto: EstadoPresupuesto; requiereConfirmacion: true }>> {
  try {
    const ctx = await contextoUsuario();
    const r = await generarMuestras(ctx, proyectoId, env.presupuestoMensual(), confirmado);
    rutaProyecto(proyectoId);
    if (!r.ok) return { ok: true, datos: { presupuesto: r.presupuesto, requiereConfirmacion: true } };
    return { ok: true, datos: { creadas: r.creadas } };
  } catch (e) {
    return fallo(e);
  }
}

export async function elegirRuta(proyectoId: string, rutaId: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    await ctx.db.from("rutas_creativas").update({ estado: "elegida" }).eq("id", rutaId).eq("owner_id", ctx.ownerId);
    await ctx.db.from("proyectos").update({ estado: "produccion" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId);
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function descartarRuta(proyectoId: string, rutaId: string, motivo: string): Promise<Resultado> {
  try {
    if (!motivo.trim()) return { ok: false, error: "Cuéntanos por qué la descartas: alimenta la memoria del cliente." };
    const ctx = await contextoUsuario();
    const { data: ruta } = await ctx.db
      .from("rutas_creativas")
      .update({ estado: "descartada", motivo_descarte: motivo.trim() })
      .eq("id", rutaId)
      .eq("owner_id", ctx.ownerId)
      .select("nombre, concepto")
      .single();
    // Memoria del cliente: el rechazo queda en sus preferencias.
    const { data: p } = await ctx.db.from("proyectos").select("cliente_id, clientes(preferencias)").eq("id", proyectoId).eq("owner_id", ctx.ownerId).single();
    const cliente = p?.clientes as unknown as { preferencias: { rechazos?: string[] } } | null;
    if (p?.cliente_id && cliente && ruta) {
      const prefs = cliente.preferencias ?? {};
      const rechazos = [...(prefs.rechazos ?? []), `Ruta "${ruta.nombre}" (${ruta.concepto}): ${motivo.trim()}`].slice(-40);
      await ctx.db.from("clientes").update({ preferencias: { ...prefs, rechazos } }).eq("id", p.cliente_id).eq("owner_id", ctx.ownerId);
    }
    rutaProyecto(proyectoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------------------------------------------------------------------------
// Generaciones
// ---------------------------------------------------------------------------
export async function votarGeneracion(generacionId: string, voto: "aprobada" | "rechazada" | null, motivo?: string): Promise<Resultado> {
  try {
    const ctx = await contextoUsuario();
    await ctx.db.from("generaciones").update({ voto, voto_motivo: motivo ?? null }).eq("id", generacionId).eq("owner_id", ctx.ownerId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function sincronizarProyecto(proyectoId: string): Promise<Resultado<{ pendientes: number }>> {
  try {
    const ctx = await contextoUsuario();
    return { ok: true, datos: { pendientes: await sincronizarPendientes(ctx, proyectoId) } };
  } catch (e) {
    return fallo(e);
  }
}

export async function continuarARutas(proyectoId: string) {
  const ctx = await contextoUsuario();
  await ctx.db.from("proyectos").update({ estado: "rutas" }).eq("id", proyectoId).eq("owner_id", ctx.ownerId).in("estado", ["recepcion", "investigacion"]);
  rutaProyecto(proyectoId);
  redirect(`/proyectos/${proyectoId}/rutas`);
}
