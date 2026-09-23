-- ============================================================================
-- Propuestas rápidas y divergentes
-- - Referencias "ya_visto": territorio agotado que el director no debe repetir.
-- - Rutas con palanca creativa, metáfora del oficio y qué cliché evitan.
-- - Caso de uso "mockup": portada + contraportada completas, con logo y textos,
--   como borrador rápido (sin QC automático).
-- ============================================================================

alter type public.tipo_referencia add value if not exists 'ya_visto';

alter table public.rutas_creativas
  add column if not exists palanca text,
  add column if not exists metafora text,
  add column if not exists evita text;

create or replace function public.sembrar_propuestas(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c_mockup uuid;
  m_campeon uuid;
  m_respaldo uuid;
begin
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion)
  values (p_owner, 'mockup', 'Mockup completo de la propuesta (todas las caras, logo y textos) para explorar rutas rápido.',
          array['idea clara y distinta','logo reproducido sin alterar','textos legibles y bien escritos','presentación realista de la pieza'])
  on conflict (owner_id, clave) do nothing;
  select id into c_mockup from public.casos_uso where owner_id = p_owner and clave = 'mockup';

  if exists (select 1 from public.asignaciones where caso_uso_id = c_mockup and vigente) then
    return;
  end if;
  -- Nano Banana 2: rápido, barato, bueno con texto y con el logo como referencia.
  select id into m_campeon from public.modelos where owner_id = p_owner and endpoint_fal = 'fal-ai/nano-banana-2';
  select id into m_respaldo from public.modelos where owner_id = p_owner and endpoint_fal = 'fal-ai/nano-banana-pro';
  if m_campeon is not null then
    insert into public.asignaciones (owner_id, caso_uso_id, modelo_id, respaldo_modelo_id, motivo)
    values (p_owner, c_mockup, m_campeon, m_respaldo, 'Propuestas rápidas (sep-2026): Nano Banana 2 con logo de referencia; respaldo Nano Banana Pro');
  end if;
end $$;

create or replace function public.al_crear_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sembrar_datos(new.id);
  perform public.sembrar_propuestas(new.id);
  return new;
end $$;

select public.sembrar_propuestas(id) from auth.users;
