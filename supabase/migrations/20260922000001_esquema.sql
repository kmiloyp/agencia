-- ============================================================================
-- Agencia — esquema inicial (Fase 1)
-- Todas las tablas: id uuid, owner_id, created_at, updated_at + RLS por dueño.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Crea columnas comunes, trigger de updated_at y política RLS de dueño.
create or replace function public._preparar_tabla(t text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop trigger if exists %I on public.%I', 'tr_' || t || '_updated', t);
  execute format(
    'create trigger %I before update on public.%I for each row execute function public.tocar_updated_at()',
    'tr_' || t || '_updated', t);
  execute format('drop policy if exists "dueño" on public.%I', t);
  execute format(
    'create policy "dueño" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
    t);
  execute format('create index if not exists %I on public.%I (owner_id)', 'ix_' || t || '_owner', t);
end $$;

-- ---------------------------------------------------------------------------
-- Ajustes por usuario (umbral QC, topes, precios de Claude)
-- ---------------------------------------------------------------------------
create table public.ajustes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  valores jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Clientes y tipos de pieza
-- ---------------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nombre text not null,
  empresa text,
  notas text,
  preferencias jsonb not null default '{"gustos":[],"rechazos":[],"paletas":[],"tipografias_aprobadas":[]}'::jsonb
);

create table public.tipos_pieza (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  clave text not null,
  nombre text not null,
  descripcion text,
  preguntas_recepcion jsonb not null default '[]'::jsonb,
  formato jsonb not null default '{}'::jsonb,
  formatos_entrega text[] not null default '{pdf_impresion,png_web}',
  casos_uso_sugeridos text[] not null default '{}',
  unique (owner_id, clave)
);

-- ---------------------------------------------------------------------------
-- Proyectos y su contenido
-- ---------------------------------------------------------------------------
create type public.estado_proyecto as enum
  ('recepcion', 'investigacion', 'rutas', 'produccion', 'composicion', 'entregado');

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo_pieza_id uuid references public.tipos_pieza(id) on delete set null,
  titulo text not null default 'Proyecto sin título',
  estado public.estado_proyecto not null default 'recepcion',
  presupuesto_usd numeric(10,2) not null default 5,
  costo_acumulado_usd numeric(12,4) not null default 0
);

-- Conversación de recepción (ejecutivo de cuenta)
create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  rol text not null check (rol in ('usuario', 'agencia')),
  contenido text not null,
  meta jsonb not null default '{}'::jsonb
);
create index ix_mensajes_proyecto on public.mensajes (proyecto_id, created_at);

create type public.tipo_referencia as enum ('me_gusta', 'no_me_gusta', 'inspiracion', 'activo_del_cliente');

create table public.referencias (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  archivo text not null,             -- ruta en Storage (bucket referencias)
  mime text,
  tipo public.tipo_referencia not null default 'inspiracion',
  nota text,
  analisis jsonb,
  analisis_estado text not null default 'pendiente' check (analisis_estado in ('pendiente','analizando','listo','error')),
  analisis_error text
);
create index ix_referencias_proyecto on public.referencias (proyecto_id);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  contenido jsonb not null default '{}'::jsonb,
  version int not null default 1,
  aprobado boolean not null default false,
  aprobado_en timestamptz,
  unique (proyecto_id, version)
);

create table public.investigaciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  informe text not null default '',
  fuentes jsonb not null default '[]'::jsonb,
  omitida boolean not null default false
);

create type public.estado_ruta as enum ('propuesta', 'elegida', 'descartada');

create table public.rutas_creativas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  orden int not null default 0,
  nombre text not null,
  concepto text not null,
  paleta text[] not null default '{}',
  tipografias text[] not null default '{}',
  mood text,
  caso_uso text,
  por_que_encaja text,
  prompts jsonb not null default '{}'::jsonb,
  estado public.estado_ruta not null default 'propuesta',
  motivo_descarte text
);
create index ix_rutas_proyecto on public.rutas_creativas (proyecto_id);

-- ---------------------------------------------------------------------------
-- Motor creativo: casos de uso, modelos, asignaciones
-- ---------------------------------------------------------------------------
create table public.casos_uso (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  clave text not null,
  descripcion text not null,
  criterios_evaluacion text[] not null default '{}',
  unique (owner_id, clave)
);

create type public.estado_modelo as enum ('activo', 'candidato', 'retirado');

create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proveedor text not null,
  nombre text not null,
  endpoint_fal text,                  -- texto→imagen (o escalado)
  endpoint_fal_edicion text,          -- edición / multi-referencia
  capacidades text[] not null default '{}',   -- texto_a_imagen, edicion, multi_referencia, vector, escalado
  precio_unitario numeric(10,5),
  unidad_precio text,                 -- imagen | megapixel | tokens | bloque_mp
  esquema_parametros jsonb not null default '{}'::jsonb,
  estado public.estado_modelo not null default 'activo',
  notas text,
  verificado_en date,
  unique (owner_id, endpoint_fal)
);

create table public.asignaciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  caso_uso_id uuid not null references public.casos_uso(id) on delete cascade,
  modelo_id uuid not null references public.modelos(id),
  respaldo_modelo_id uuid references public.modelos(id),
  vigente boolean not null default true,
  motivo text
);
-- Solo una asignación vigente por caso de uso; las anteriores quedan como historial.
create unique index ux_asignacion_vigente on public.asignaciones (caso_uso_id) where vigente;

-- ---------------------------------------------------------------------------
-- Generaciones
-- ---------------------------------------------------------------------------
create type public.estado_generacion as enum
  ('en_cola', 'generando', 'qc', 'lista', 'fallida', 'rechazada_qc');

create table public.generaciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  ruta_id uuid references public.rutas_creativas(id) on delete set null,
  parent_id uuid references public.generaciones(id) on delete set null,
  caso_uso text not null,
  modelo_id uuid references public.modelos(id),
  endpoint text,
  uso_respaldo boolean not null default false,
  prompt text not null,
  parametros jsonb not null default '{}'::jsonb,       -- parámetros genéricos pedidos
  entrada_fal jsonb not null default '{}'::jsonb,      -- payload traducido enviado a fal
  imagenes_entrada text[] not null default '{}',
  fal_request_id text,
  estado public.estado_generacion not null default 'en_cola',
  archivo text,                        -- ruta en Storage (bucket generaciones)
  ancho int,
  alto int,
  costo_usd numeric(10,4) not null default 0,
  qc jsonb,
  intentos int not null default 0,
  voto text check (voto in ('aprobada', 'rechazada')),
  voto_motivo text,
  aviso text,
  error text
);
create index ix_generaciones_proyecto on public.generaciones (proyecto_id, created_at desc);
create index ix_generaciones_ruta on public.generaciones (ruta_id);
create index ix_generaciones_fal on public.generaciones (fal_request_id);

-- ---------------------------------------------------------------------------
-- Piezas, entregas, aprobaciones (estructura lista para Fase 2)
-- ---------------------------------------------------------------------------
create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cara text not null default 'única',
  composicion jsonb not null default '{"capas":[]}'::jsonb,
  estado text not null default 'borrador'
);

create table public.entregas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  archivos text[] not null default '{}',
  formato text not null,
  fecha timestamptz not null default now()
);

create table public.aprobaciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  token_hash text not null unique,     -- se guarda solo el hash del token
  expira_en timestamptz not null,
  opciones jsonb not null default '[]'::jsonb,
  votos jsonb not null default '[]'::jsonb,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'expirada'))
);

-- ---------------------------------------------------------------------------
-- Personajes (Fase 4)
-- ---------------------------------------------------------------------------
create table public.personajes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nombre text not null,
  ficha jsonb not null default '{}'::jsonb,
  imagenes_referencia text[] not null default '{}',
  imagen_ancla text
);

-- ---------------------------------------------------------------------------
-- Explorador de modelos (Fase 3)
-- ---------------------------------------------------------------------------
create table public.exploraciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fecha timestamptz not null default now(),
  hallazgos jsonb not null default '[]'::jsonb,
  candidatos jsonb not null default '[]'::jsonb,
  estado text not null default 'completada'
);

create table public.prompts_banco (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  caso_uso_id uuid not null references public.casos_uso(id) on delete cascade,
  prompt text not null,
  imagenes_entrada text[] not null default '{}'
);

create table public.pruebas_banco (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  exploracion_id uuid references public.exploraciones(id) on delete cascade,
  caso_uso_id uuid not null references public.casos_uso(id) on delete cascade,
  candidato_id uuid not null references public.modelos(id),
  campeon_id uuid not null references public.modelos(id),
  generaciones jsonb not null default '[]'::jsonb,
  puntajes jsonb not null default '{}'::jsonb,
  votos_ciegos jsonb not null default '[]'::jsonb,
  resultado text
);

-- ---------------------------------------------------------------------------
-- Costos
-- ---------------------------------------------------------------------------
create table public.movimientos_costo (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proyecto_id uuid references public.proyectos(id) on delete set null,
  generacion_id uuid references public.generaciones(id) on delete set null,
  proveedor text not null check (proveedor in ('fal', 'anthropic')),
  modelo text not null,
  concepto text not null,
  monto_usd numeric(12,6) not null,
  estimado boolean not null default true,
  detalle jsonb not null default '{}'::jsonb
);
create index ix_costos_fecha on public.movimientos_costo (owner_id, created_at);
create index ix_costos_proyecto on public.movimientos_costo (proyecto_id);

-- Mantiene proyectos.costo_acumulado_usd al día.
create or replace function public.acumular_costo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.proyecto_id is not null then
    update public.proyectos
      set costo_acumulado_usd = costo_acumulado_usd + new.monto_usd
      where id = new.proyecto_id;
  end if;
  return new;
end $$;

create trigger tr_acumular_costo after insert on public.movimientos_costo
  for each row execute function public.acumular_costo();

-- ---------------------------------------------------------------------------
-- Columnas comunes + RLS en todas las tablas
-- ---------------------------------------------------------------------------
select public._preparar_tabla(t) from unnest(array[
  'ajustes','clientes','tipos_pieza','proyectos','mensajes','referencias','briefs',
  'investigaciones','rutas_creativas','casos_uso','modelos','asignaciones','generaciones',
  'piezas','entregas','aprobaciones','personajes','exploraciones','prompts_banco',
  'pruebas_banco','movimientos_costo'
]) as t;

-- ---------------------------------------------------------------------------
-- Realtime sobre generaciones
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.generaciones;
alter publication supabase_realtime add table public.referencias;

-- ---------------------------------------------------------------------------
-- Storage: buckets privados; cada usuario solo accede a su carpeta {owner_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('referencias', 'referencias', false),
       ('generaciones', 'generaciones', false),
       ('entregas', 'entregas', false),
       ('personajes', 'personajes', false)
on conflict (id) do nothing;

create policy "dueño lee sus archivos" on storage.objects for select to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dueño sube sus archivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('referencias','generaciones','entregas','personajes')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dueño actualiza sus archivos" on storage.objects for update to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dueño borra sus archivos" on storage.objects for delete to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes')
         and (storage.foldername(name))[1] = auth.uid()::text);
