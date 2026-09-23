/**
 * Motor creativo — API pública.
 * Reutilizable por otras apps (p. ej. empaques): no depende de React ni de Next.
 */
export * from "./tipos";
export { planificar, planificarCon, resolverAsignacion, obtenerModelo } from "./router";
export { traducirGeneracion, traducirEscalado, estimarCostoImagen, presetMasCercano, proporcionMasCercana } from "./traductor";
export { crearGeneracion, estimarSolicitud, procesarCompletada, manejarFallo, sincronizar, sincronizarPendientes, recibirWebhook } from "./generacion";
export type { SolicitudGeneracion, FilaGeneracion, ArchivoRef } from "./generacion";
export { escribirPrompt, escribirEdicion, evaluarImagen, guiaAntiIA } from "./director-arte";
export { llamarEstructurado, llamarTexto, bloqueImagen } from "./claude";
export { registrarMovimiento, verificarPresupuesto, gastoDelMes } from "./costos";
export type { EstadoPresupuesto } from "./costos";
export { guardar, leer, urlFirmada, descargar, dimensiones } from "./almacenamiento";
export type { Bucket } from "./almacenamiento";
export { verificarWebhookFal } from "./webhook-fal";
