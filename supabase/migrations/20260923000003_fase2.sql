-- ============================================================================
-- Fase 2: composición, entrega y aprobación
-- ============================================================================

-- Una pieza por cara de cada proyecto
alter table public.piezas add constraint piezas_proyecto_cara_unica unique (proyecto_id, cara);
alter table public.piezas add column if not exists orden int not null default 0;

-- Entregas: detalle (dpi, marcas de corte, avisos)
alter table public.entregas add column if not exists detalle jsonb not null default '{}'::jsonb;

-- Aprobaciones: comentario general y búsqueda por proyecto
alter table public.aprobaciones add column if not exists titulo text;
create index if not exists ix_aprobaciones_proyecto on public.aprobaciones (proyecto_id);

-- Bucket privado para tipografías subidas por el usuario ({owner_id}/archivo.ttf)
insert into storage.buckets (id, name, public) values ('fuentes', 'fuentes', false) on conflict (id) do nothing;

drop policy if exists "dueño lee sus archivos" on storage.objects;
drop policy if exists "dueño sube sus archivos" on storage.objects;
drop policy if exists "dueño actualiza sus archivos" on storage.objects;
drop policy if exists "dueño borra sus archivos" on storage.objects;

create policy "dueño lee sus archivos" on storage.objects for select to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes','fuentes')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dueño sube sus archivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('referencias','generaciones','entregas','personajes','fuentes')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dueño actualiza sus archivos" on storage.objects for update to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes','fuentes')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dueño borra sus archivos" on storage.objects for delete to authenticated
  using (bucket_id in ('referencias','generaciones','entregas','personajes','fuentes')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime para ver aparecer los votos del cliente
alter publication supabase_realtime add table public.aprobaciones;
