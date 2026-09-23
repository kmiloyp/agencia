<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agencia: agencia de diseño con IA

App web personal de Camilo que funciona como una agencia de diseño completa: recepción conversacional → brief → investigación → 3 rutas creativas → producción → composición con texto real → entrega y aprobación del cliente. Caso piloto: portada y contraportada de un cuaderno A5 anillado.

Principios: **(1)** nada debe "verse hecho con IA" (guía anti-IA + QC automático; los textos finales van como capas reales, nunca pintados por la IA); **(2)** siempre el mejor modelo del mercado (cero modelos en el código; la tabla `asignaciones` decide).

## Stack

| Capa | Elección |
|---|---|
| Front | Next.js 16.3 (App Router, Turbopack), React 19.2, TypeScript, Tailwind v4 |
| Backend | Server Actions + Route Handlers. Toda llamada a fal/Anthropic es del servidor |
| Datos | Supabase: Postgres + Auth + Storage privado + Realtime + RLS |
| Cerebro | Anthropic SDK (`@anthropic-ai/sdk`), modelo en `ANTHROPIC_MODEL` (por defecto `claude-opus-5`), pensamiento adaptativo, salidas estructuradas con Zod, `web_search_20260209` |
| Imágenes | fal.ai con `@fal-ai/client` (cola + webhook firmado, o sondeo en local) |
| Canvas | react-konva (Fase 2) |
| Exportación | pdf-lib (PDF) + sharp (PNG, redimensionado, stub) |
| Íconos / fuentes | Phosphor Icons; Geist + Geist Mono vía `next/font` |
| Cron | Vercel Cron (`vercel.json`, lunes 09:00 UTC) → `/api/cron/explorador` con `CRON_SECRET` |

## Estructura

```
supabase/migrations/
  20260922000001_esquema.sql   tablas, enums, RLS por dueño, buckets, Realtime
  20260922000002_semilla.sql   sembrar_datos(owner): casos de uso, modelos, asignaciones, plantilla del cuaderno
src/
  proxy.ts                     (antes "middleware") sesión Supabase; rutas públicas: /entrar /aprobar /api/webhooks /api/cron
  lib/
    motor-creativo/            ★ módulo independiente, SIN React/Next (reutilizable por la futura app de empaques)
      tipos.ts                 tipos + ErrorMotor (mensaje + sugerencia en español)
      traductor.ts             parámetros genéricos → formato de cada endpoint (puro, sin red)
      router.ts                lee asignaciones y planifica (campeón / respaldo / manual)
      generacion.ts            ciclo de vida: cola → Storage → QC → regenerar (máx. N) → respaldo si falla
      director-arte.ts         escribe prompts y hace QC con Claude visión
      claude.ts                envoltorio de Claude: Zod + 1 reintento, fallbacks, costo en ledger
      costos.ts                ledger y verificación de presupuesto (proyecto y mes)
      almacenamiento.ts        Supabase Storage (descargar de fal y guardar al instante)
      webhook-fal.ts           verificación ED25519 contra el JWKS de fal
      proveedores/fal.ts|stub.ts
      guias/anti-ia.md         ★ guía editable del director de arte (se lee en cada prompt y cada QC)
    agencia/                   roles de Claude propios de esta app (recepción, referencias, investigación, rutas)
    supabase/                  clientes servidor / navegador / admin(service_role)
    contexto.ts                arma el ContextoMotor (sesión → owner_id; webhook/cron → owner de la fila)
  app/
    (estudio)/…                páginas con sesión y barra lateral
    (publico)/entrar, aprobar  sin sesión
    acciones/                  Server Actions (proyecto.ts, catalogo.ts, sesion.ts)
    api/webhooks/fal, api/cron/explorador
  components/                  ui.tsx (primitivas), proyecto/*, catalogo/*, shell/*
```

## Convenciones

- Código, UI y errores **en español**. Los prompts de imagen se escriben en inglés (mejor rendimiento de los modelos).
- Errores al usuario: qué pasó + qué hacer (`ErrorMotor(mensaje, sugerencia)` → `Resultado` de las Server Actions).
- **Cero nombres/endpoints de modelos en el código.** Todo vive en `modelos` + `asignaciones`. `esquema_parametros` describe cómo traducir tamaño, referencias y cantidad para cada endpoint (ver `tipos.ts`).
- `lib/motor-creativo` no importa nada de `app/`, `components/` ni `next/*`.
- El cliente admin (service_role) ignora RLS: **toda consulta con él filtra por `owner_id`**.
- Rutas de Storage: `{owner_id}/{proyecto_id}/{archivo}` (las políticas de Storage exigen esa primera carpeta).
- Una fila de `generaciones` = una imagen = una petición a fal (linaje limpio vía `parent_id`).
- Tokens de diseño en `globals.css` (claro/oscuro automático + selector). "Escenario" = superficie oscura de galería en ambos temas. Un solo acento. Radios: controles 8px, paneles 12px.
- Server Actions de páginas con llamadas largas a Claude declaran `export const maxDuration = 300`.

## Decisiones tomadas

- **Modelo de Claude:** `claude-opus-5` (vigente, verificado 2026-09-22) vía env. Con `ANTHROPIC_FALLBACKS=default` se activa el respaldo del servidor (`server-side-fallback-2026-07-01`) si Claude declina; `off` lo desactiva.
- **Webhooks de fal:** fal no usa secreto compartido; firma con ED25519 (`X-Fal-Webhook-*`) verificable con `https://rest.fal.ai/.well-known/jwks.json`. `FAL_WEBHOOK_SECRET` se conserva en `.env.example` solo por compatibilidad y se ignora.
- **Local sin webhook:** fal no entrega a localhost. Si `APP_BASE_URL` no es https público, el motor no envía webhook y la UI sondea `sincronizarProyecto` cada 4 s mientras haya pendientes. En producción el sondeo queda como red de seguridad; el reclamo atómico (`estado in (en_cola, generando) → qc`) evita procesar dos veces.
- **Costos de imagen = estimados** con la tabla de precios de cada modelo (fal no devuelve el costo por petición; la API de uso real exige llave Admin). Costos de Claude = tokens reales × precios en `ajustes.valores.precios_anthropic`.
- **QC:** pasa si calidad ≥ 7, apariencia IA ≤ 4, anatomía y texto correctos (configurable en `ajustes`). Máx. 2 regeneraciones con el prompt corregido; si sigue fallando queda `rechazada_qc` y se muestra con advertencia.
- **Canvas: react-konva** (no Fabric): API declarativa que encaja con React 19 y con la composición guardada como JSON de capas en mm; capas nativas (fondo/guías/texto), buen rendimiento con imágenes grandes y exportación a dataURL por capa. Fabric es imperativo y su integración con React requiere sincronización manual del estado.
- **Color:** el PDF de impresión sale en **RGB**. La conversión a CMYK y la separación las hace Camilo en preprensa. Decisión consciente; punto a revisar en una fase futura (perfiles ICC / conversión en servidor).
- **Semilla de modelos (verificada en el catálogo de fal el 2026-09-22):**

| Caso de uso | Campeón | Respaldo |
|---|---|---|
| fotorrealismo | FLUX.2 Pro `fal-ai/flux-2-pro` | Seedream 5.0 Pro `bytedance/seedream/v5/pro/*` |
| texto_en_imagen | GPT Image 2.5 Sunburst `openai/gpt-image-2.5/sunburst/*` | GPT Image 2 `openai/gpt-image-2` |
| ilustracion | Nano Banana Pro `fal-ai/nano-banana-pro` | Seedream 5.0 Pro |
| personaje_consistente | Nano Banana Pro | GPT Image 2 |
| vector_logo | Recraft V4.1 Vector `fal-ai/recraft/v4.1/text-to-vector` | Ideogram V4 `ideogram/v4` |
| edicion | Nano Banana Pro (edit) | GPT Image 2 (edit) |
| escalado | Topaz Precision `topaz/upscale/image/precision` | (ninguno) |
| borrador_rapido | Nano Banana 2 `fal-ai/nano-banana-2` | FLUX.2 Flash `fal-ai/flux-2/flash` |

  Candidatos registrados para el explorador: GPT Image 2.5 Flare, Recraft V4.1 Pro Vector, SeedVR2. Cambios frente a la especificación original, aprobados por Camilo: Seedream pasó a v5, GPT Image 2.5 Sunburst es campeón de texto, Recraft v4.1 e Ideogram V4, Topaz para escalado.
- **Catálogo de fal:** existe endpoint oficial `GET https://api.fal.ai/v1/models` (con `expand=openapi-3.0` da el esquema de entrada) y `GET /v1/models/pricing`. El explorador (Fase 3) usará esos, sin scraping.
- **Plantilla piloto:** Portada de cuaderno A5 148×210 mm, anillado (lomo 0), sangrado 3 mm, zona segura 5 mm, margen de anillado 12 mm a la izquierda, caras portada + contraportada, 300 dpi.
- **Recepción:** conversación guardada en `mensajes` (tabla añadida a la especificación). El ejecutivo puede proponer plantillas nuevas; se crean solo con confirmación.
- **Aprobación pública:** `aprobaciones.token_hash` guarda solo el hash del token; la página validará en servidor con service_role (nunca RLS público).

## Enfoque: propuestas rápidas y divergentes (desde 2026-09-23)

Decisión de Camilo tras comparar con ChatGPT: explorar con **mockups completos baratos** (todas las caras, logo y textos reales) y dejar composición/PDF solo para la ganadora. El valor de la app está en **inyectar creatividad**, no en vectorizar.

- **Territorio agotado**: referencias tipo `ya_visto` (y `no_me_gusta`) → el director prohíbe repetir su metáfora, paleta y composición.
- **Rutas** (`lib/agencia/rutas.ts`): dos pasadas. (1) Divergencia: `cantidad + 3` candidatas, cada una con una **palanca** distinta (`PALANCAS` en `esquemas.ts`) y una **metáfora del oficio del cliente** (no de los adjetivos del brief). (2) **Director crítico**: descarta clichés (ola = flexible, hoja = sostenible…) y lo parecido a lo ya visto, corrige prompts. Cada ruta guarda `palanca`, `metafora`, `evita` y `prompts.{mockup, arte}`.
- **Mockup por ruta**, tres caminos: copiar el prompt para ChatGPT (gratis), generarlo aquí (caso de uso `mockup` → Nano Banana 2 con los logos del cliente como `image_urls`, ≈$0.08, sin QC) o subir la imagen externa (`registrarMockupExterno`, costo 0).
- Producción puede variar/editar mockups (conservan texto y logo). `reabrirRutas` suelta la ruta elegida para volver a explorar.
- Migración: `20260923000004_propuestas.sql`.

## Fase 2: cómo funciona

- **Composición** (`lib/composicion/tipos.ts`): JSON por cara en `piezas.composicion`, todo en mm, origen = esquina superior izquierda del pliego con sangrado. Capas `imagen | texto | forma` con rotación horaria alrededor de su esquina superior izquierda (igual que Konva). `formatoDeCara` pone el margen de anillado en espejo en la contraportada.
- **Editor** (`components/composicion/editor.tsx` + `lienzo.tsx`): mesas de trabajo lado a lado, guías (corte, sangrado, zona segura, anillado), autoguardado (900 ms), deshacer/rehacer, atajos, Google Fonts o fuentes subidas (bucket `fuentes`, solo .ttf/.otf porque el PDF las incrusta).
- **PDF** (`lib/composicion/pdf.ts`, servidor): pdf-lib + @pdf-lib/fontkit. Texto vectorial con la fuente incrustada **como subconjunto** (la incrustación completa falla con algunas TTF de Google, p. ej. Space Grotesk y Jost). Las TTF se piden a Google Fonts con el agente `Wget/1.21`, que devuelve TTF en vez de WOFF. La primera línea base replica Konva 10: `(ascenso − descenso)/2 + interlineado/2`. Imágenes redimensionadas a la resolución objetivo (nunca se amplían aquí), SVG rasterizados a esa resolución, TrimBox/BleedBox y marcas de corte opcionales. Validado rasterizando con `qlmanage`.
- **Escalado**: si una capa queda bajo el objetivo, se crea una generación `escalado` (factor en pasos de 0,5, máx. 4×) con el campeón del caso de uso; el PDF usa automáticamente la versión escalada (se enlaza por `imagenes_entrada[0]` = archivo original). El escalado no pasa por QC de Claude: solo se verifica que la resolución aumentó.
- **PNG web**: se renderizan en el navegador con el mismo `Lienzo` (modo exportar, fuera de pantalla) para que las fuentes web coincidan con el editor; se suben a `entregas`.
- **Aprobación**: el token (24 bytes aleatorios) solo se muestra al crearlo; en la base queda `sha256`. La página pública y su Server Action validan token, estado y expiración con service_role. Los votos van a `aprobaciones.votos` y a `clientes.preferencias` (gustos/rechazos).

## Puesta en marcha

1. Crea un proyecto en supabase.com. En **SQL Editor** ejecuta, en orden, los archivos de `supabase/migrations/` (o `supabase db push` con la CLI).
2. **Authentication → Users → Add user** (correo + contraseña). Al crearlo, el trigger siembra casos de uso, modelos, asignaciones y la plantilla del cuaderno. Desactiva los registros públicos (Authentication → Sign In / Providers → "Allow new users to sign up").
3. Rellena `.env.local` (plantilla en `.env.example`) y ejecuta `npm run dev`.
4. Sin `FAL_KEY` (o con `FAL_MODO=stub`) las imágenes son de ejemplo y no cuestan nada.
5. En Vercel: mismas variables, `APP_BASE_URL=https://tu-dominio` (activa el webhook), `CRON_SECRET`.

## Estado por fases

- **Fase 1 (núcleo): hecha.** Auth, proyectos, tipos de pieza, recepción conversacional, referencias con análisis por visión, brief editable con autoguardado y versiones, investigación con búsqueda web (opcional), 3 rutas con 2 muestras cada una, router + motor + QC + respaldo, galería en tiempo real, control de costos (estimado previo y confirmación), páginas Clientes, Tipos de pieza, Modelos (registro + ranking de aprobación real) y Costos.
- **Fase 2 (pieza final): hecha.** Producción (muestras de la ruta elegida, variaciones redactadas por el director, edición por instrucción, cambio manual de modelo, linaje navegable), editor react-konva (`/composicion/[piezaId]`), revisión de dpi + escalado, exportación PDF/PNG/SVG, aprobación del cliente (`/aprobar/[token]`). Requiere la migración `20260923000003_fase2.sql`.
- **Fase 3 (siempre lo mejor):** explorador semanal, banco de pruebas (`prompts_banco`, 5 por caso), arena ciega, propuestas de cambio con aprobación explícita, tope de gasto del explorador (`ajustes.explorador_tope_mensual_usd`).
- **Fase 4 (memoria):** aprendizaje de rechazos (ya se guardan al descartar rutas), personajes consistentes, investigación completa.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint src` (4 avisos esperados por `<img>`: las imágenes son URLs firmadas de Storage, no pasan por `next/image`).
- Las migraciones se validaron con PGlite (Postgres embebido) simulando los esquemas `auth`/`storage` de Supabase.
