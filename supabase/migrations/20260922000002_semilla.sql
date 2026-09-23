-- ============================================================================
-- Semilla por usuario. Se ejecuta automáticamente al crear un usuario en Auth
-- (y una vez para los usuarios que ya existan al aplicar esta migración).
-- Endpoints, parámetros y precios verificados en el catálogo de fal.ai el
-- 2026-09-22 (GET https://api.fal.ai/v1/models?expand=openapi-3.0).
-- Para cambiar un modelo: cambia DATOS (tablas modelos/asignaciones), no código.
-- ============================================================================

create or replace function public.sembrar_datos(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  -- casos de uso
  c_foto uuid; c_texto uuid; c_ilus uuid; c_pers uuid; c_vector uuid; c_edic uuid; c_esc uuid; c_borr uuid;
  -- modelos
  m_flux_pro uuid; m_flux_flash uuid; m_seedream5 uuid; m_gpt25_sun uuid; m_gpt25_flare uuid; m_gpt2 uuid;
  m_nano_pro uuid; m_nano2 uuid; m_recraft uuid; m_recraft_pro uuid; m_ideogram uuid; m_topaz uuid; m_seedvr uuid;

  presets_base constant jsonb := '["square_hd","square","portrait_4_3","portrait_16_9","landscape_4_3","landscape_16_9"]';
  ar_nano_pro constant jsonb := '["21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16"]';
  ar_nano2 constant jsonb := '["21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16","4:1","1:4","8:1","1:8"]';
begin
  if exists (select 1 from public.casos_uso where owner_id = p_owner) then
    return; -- ya sembrado
  end if;

  -- -------------------------------------------------------------------------
  -- Ajustes
  -- -------------------------------------------------------------------------
  insert into public.ajustes (owner_id, valores) values (p_owner, jsonb_build_object(
    'qc_umbral_apariencia_ia', 4,        -- 1 = parece foto/ilustración humana, 10 = obviamente IA. Pasa si <= umbral.
    'qc_umbral_calidad', 7,              -- puntaje global mínimo (1–10)
    'qc_max_reintentos', 2,
    'muestras_por_ruta', 2,
    'explorador_tope_mensual_usd', 5,
    'precios_anthropic', jsonb_build_object(
      'nota', 'USD por millón de tokens; ajusta si cambias ANTHROPIC_MODEL',
      'entrada_mtok', 5, 'salida_mtok', 25, 'busqueda_web_por_1000', 10)
  ));

  -- -------------------------------------------------------------------------
  -- Casos de uso
  -- -------------------------------------------------------------------------
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'fotorrealismo', 'Fotografía creíble: producto, retrato, escena, textura real.',
      array['piel y materiales con textura real','luz físicamente coherente','anatomía y manos correctas','sin brillo plástico ni bokeh genérico']) returning id into c_foto;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'texto_en_imagen', 'Imágenes donde el texto dentro de la imagen debe ser legible y exacto (bocetos, mockups).',
      array['ortografía exacta','tipografía coherente','jerarquía legible']) returning id into c_texto;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'ilustracion', 'Ilustración con oficio: técnica concreta, trazo humano, textura.',
      array['técnica reconocible y consistente','trazo con variación humana','paleta controlada','composición intencional']) returning id into c_ilus;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'personaje_consistente', 'Personaje propio idéntico entre imágenes, a partir de referencias.',
      array['rasgos idénticos a la ficha','proporciones constantes','vestuario base respetado']) returning id into c_pers;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'vector_logo', 'Logos, íconos y piezas vectoriales (SVG).',
      array['formas limpias y escalables','legible en tamaño pequeño','pocos colores planos']) returning id into c_vector;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'edicion', 'Editar una imagen existente por instrucción en lenguaje natural.',
      array['cambia solo lo pedido','conserva identidad y estilo','sin costuras visibles']) returning id into c_edic;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'escalado', 'Aumentar resolución para impresión sin inventar detalle.',
      array['fidelidad al original','sin halos ni sobre-enfoque','texto y bordes nítidos']) returning id into c_esc;
  insert into public.casos_uso (owner_id, clave, descripcion, criterios_evaluacion) values
    (p_owner, 'borrador_rapido', 'Exploración barata y rápida de ideas.',
      array['velocidad','costo','idea legible']) returning id into c_borr;

  -- -------------------------------------------------------------------------
  -- Modelos (esquema_parametros: cómo traducir parámetros genéricos a cada endpoint)
  -- -------------------------------------------------------------------------
  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'Black Forest Labs', 'FLUX.2 Pro', 'fal-ai/flux-2-pro', 'fal-ai/flux-2-pro/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.03, 'megapixel',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',14142,'presets',presets_base),
                                'fijos', '{"output_format":"png","safety_tolerance":"2"}'::jsonb, 'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',14142,'presets',presets_base),
                                'referencias', '{"campo":"image_urls","tipo":"lista","max":9}'::jsonb,
                                'fijos', '{"output_format":"png","safety_tolerance":"2"}'::jsonb, 'salida','images'),
      'costo', '{"modo":"megapixel_escalonado","primer_mp":0.03,"mp_adicional":0.015}'::jsonb),
    'activo', '2026-09-22', 'Sin num_images: una llamada por imagen.')
  returning id into m_flux_pro;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'Black Forest Labs', 'FLUX.2 Flash', 'fal-ai/flux-2/flash', 'fal-ai/flux-2/flash/edit',
    array['texto_a_imagen','edicion'], 0.005, 'megapixel',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',14142,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',14142,'presets',presets_base),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":4}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'costo', '{"modo":"megapixel","usd_por_mp":0.005}'::jsonb),
    'activo', '2026-09-22')
  returning id into m_flux_flash;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'ByteDance', 'Seedream 5.0 Pro', 'bytedance/seedream/v5/pro/text-to-image', 'bytedance/seedream/v5/pro/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.0675, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',2048,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',2048,'presets',presets_base),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":10}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen_tramos","tramos":[{"hasta_px":2359296,"usd":0.0675},{"hasta_px":4194304,"usd":0.135}],"extra_por_referencia":0.0045}'::jsonb),
    'activo', '2026-09-22', 'Precio marcado como "tentative" por fal en sep-2026.')
  returning id into m_seedream5;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'OpenAI', 'GPT Image 2.5 Sunburst', 'openai/gpt-image-2.5/sunburst/text-to-image', 'openai/gpt-image-2.5/sunburst/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.25, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":16}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.25,"estimado":true,"nota":"Cobro real por tokens: imagen $8/$30 por 1M (entrada/salida)."}'::jsonb),
    'activo', '2026-09-22', 'Precio por tokens; el costo por imagen es un estimado.')
  returning id into m_gpt25_sun;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'OpenAI', 'GPT Image 2', 'openai/gpt-image-2', 'openai/gpt-image-2/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.20, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":16}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.20,"estimado":true}'::jsonb),
    'activo', '2026-09-22', 'Precio por tokens; el costo por imagen es un estimado.')
  returning id into m_gpt2;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'Google', 'Nano Banana Pro', 'fal-ai/nano-banana-pro', 'fal-ai/nano-banana-pro/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.15, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','aspect_ratio','valores',ar_nano_pro,'resolucion','{"campo":"resolution","valor":"2K"}'::jsonb),
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','aspect_ratio','valores',ar_nano_pro,'resolucion','{"campo":"resolution","valor":"2K"}'::jsonb),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":14}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.15,"multiplicador_resolucion":{"4K":2}}'::jsonb),
    'activo', '2026-09-22')
  returning id into m_nano_pro;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'Google', 'Nano Banana 2', 'fal-ai/nano-banana-2', 'fal-ai/nano-banana-2/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.08, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','aspect_ratio','valores',ar_nano2,'resolucion','{"campo":"resolution","valor":"1K"}'::jsonb),
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','aspect_ratio','valores',ar_nano2,'resolucion','{"campo":"resolution","valor":"1K"}'::jsonb),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":14}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.08,"multiplicador_resolucion":{"0.5K":0.75,"2K":1.5,"4K":2}}'::jsonb),
    'activo', '2026-09-22')
  returning id into m_nano2;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'Recraft', 'Recraft V4.1 Vector', 'fal-ai/recraft/v4.1/text-to-vector',
    array['texto_a_imagen','vector'], 0.08, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',2048,'presets',presets_base),
                                'fijos','{}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.08}'::jsonb),
    'activo', '2026-09-22')
  returning id into m_recraft;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'Recraft', 'Recraft V4.1 Pro Vector', 'fal-ai/recraft/v4.1/pro/text-to-vector',
    array['texto_a_imagen','vector'], 0.30, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',2048,'presets',presets_base),
                                'fijos','{}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.30}'::jsonb),
    'candidato', '2026-09-22')
  returning id into m_recraft_pro;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'Ideogram', 'Ideogram V4', 'ideogram/v4',
    array['texto_a_imagen'], 0.025, 'megapixel',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',true,'multiplo',16,'max_lado',2048,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png","rendering_speed":"QUALITY"}'::jsonb,'salida','images'),
      'costo', '{"modo":"megapixel","usd_por_mp":0.025}'::jsonb),
    'activo', '2026-09-22', 'Sin edición con máscara en V4 (usar V3 si hiciera falta).')
  returning id into m_ideogram;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'Topaz', 'Topaz Upscale Precision', 'topaz/upscale/image/precision',
    array['escalado'], 0.08, 'bloque_mp',
    jsonb_build_object(
      'escalado', jsonb_build_object('imagen','image_url','factor','{"campo":"upscale_factor","max":4}'::jsonb,
                                     'fijos','{"output_format":"png"}'::jsonb,
                                     'variantes', '{"campo":"model","foto":"High Fidelity V3","ilustracion":"CGI","texto":"Text Refine"}'::jsonb,
                                     'salida','image'),
      'costo', '{"modo":"bloque_mp","usd":0.08,"mp_por_bloque":24}'::jsonb),
    'activo', '2026-09-22', 'Fiel al original: no alucina detalle. Ideal para impresión.')
  returning id into m_topaz;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en, notas)
  values (p_owner, 'ByteDance', 'SeedVR2 Upscale', 'fal-ai/seedvr/upscale/image',
    array['escalado'], 0.001, 'megapixel',
    jsonb_build_object(
      'escalado', jsonb_build_object('imagen','image_url','factor','{"campo":"upscale_factor","max":10}'::jsonb,
                                     'fijos','{"upscale_mode":"factor","output_format":"png"}'::jsonb,'salida','image'),
      'costo', '{"modo":"megapixel","usd_por_mp":0.001}'::jsonb),
    'candidato', '2026-09-22', 'Alternativa muy barata para lotes.')
  returning id into m_seedvr;

  insert into public.modelos (owner_id, proveedor, nombre, endpoint_fal, endpoint_fal_edicion, capacidades, precio_unitario, unidad_precio, esquema_parametros, estado, verificado_en)
  values (p_owner, 'OpenAI', 'GPT Image 2.5 Flare', 'openai/gpt-image-2.5/flare/text-to-image', 'openai/gpt-image-2.5/flare/edit',
    array['texto_a_imagen','edicion','multi_referencia'], 0.20, 'imagen',
    jsonb_build_object(
      't2i', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'edicion', jsonb_build_object('tamano', jsonb_build_object('modo','image_size','personalizado',false,'presets',presets_base),
                                'referencias','{"campo":"image_urls","tipo":"lista","max":16}'::jsonb,
                                'num_imagenes','num_images','fijos','{"output_format":"png","quality":"high"}'::jsonb,'salida','images'),
      'costo', '{"modo":"por_imagen","usd":0.20,"estimado":true}'::jsonb),
    'candidato', '2026-09-22')
  returning id into m_gpt25_flare;

  -- -------------------------------------------------------------------------
  -- Asignaciones vigentes (campeón + respaldo)
  -- -------------------------------------------------------------------------
  insert into public.asignaciones (owner_id, caso_uso_id, modelo_id, respaldo_modelo_id, motivo) values
    (p_owner, c_foto,   m_flux_pro,  m_seedream5, 'Semilla inicial sep-2026'),
    (p_owner, c_texto,  m_gpt25_sun, m_gpt2,      'Semilla: GPT Image 2.5 Sunburst (lanzado 08-09-2026) por decisión de Camilo'),
    (p_owner, c_ilus,   m_nano_pro,  m_seedream5, 'Semilla inicial sep-2026'),
    (p_owner, c_pers,   m_nano_pro,  m_gpt2,      'Semilla inicial sep-2026'),
    (p_owner, c_vector, m_recraft,   m_ideogram,  'Semilla: Recraft V4.1 vector + Ideogram V4'),
    (p_owner, c_edic,   m_nano_pro,  m_gpt2,      'Semilla inicial sep-2026'),
    (p_owner, c_esc,    m_topaz,     null,        'Semilla: Topaz Precision (fiel, no inventa detalle)'),
    (p_owner, c_borr,   m_nano2,     m_flux_flash,'Semilla inicial sep-2026');

  -- -------------------------------------------------------------------------
  -- Tipo de pieza piloto: portada de cuaderno A5 anillado
  -- -------------------------------------------------------------------------
  insert into public.tipos_pieza (owner_id, clave, nombre, descripcion, preguntas_recepcion, formato, formatos_entrega, casos_uso_sugeridos)
  values (p_owner, 'portada_cuaderno', 'Portada de cuaderno',
    'Portada y contraportada de cuaderno A5 anillado (piezas separadas, sin lomo).',
    '[
      {"clave":"cliente","pregunta":"¿Para qué cliente o marca es el cuaderno?","obligatoria":true},
      {"clave":"proposito","pregunta":"¿Para qué es la línea: venta en papelerías, regalo corporativo, colección escolar…?","obligatoria":true},
      {"clave":"publico","pregunta":"¿Quién lo va a comprar y usar? (edad, estilo de vida)","obligatoria":true},
      {"clave":"mensaje","pregunta":"¿Qué debe transmitir la portada en una idea?","obligatoria":true},
      {"clave":"textos_obligatorios","pregunta":"¿Qué textos deben ir sí o sí? (marca, número de hojas, tipo de rayado…)","obligatoria":true},
      {"clave":"restricciones","pregunta":"¿Hay restricciones? (logo en contraportada, código de barras, colores de marca)","obligatoria":false},
      {"clave":"rechazos_previos","pregunta":"¿Qué no le gustó al cliente de las propuestas anteriores?","obligatoria":true},
      {"clave":"fecha","pregunta":"¿Para cuándo lo necesitas?","obligatoria":false}
    ]'::jsonb,
    '{"ancho_mm":148,"alto_mm":210,"sangrado_mm":3,"zona_segura_mm":5,"lomo_mm":0,"encuadernacion":"anillado","margen_anillado_mm":12,"lado_anillado":"izquierdo","caras":["portada","contraportada"],"dpi_objetivo":300}'::jsonb,
    array['pdf_impresion','png_web'],
    array['ilustracion','fotorrealismo','texto_en_imagen']);
end $$;

-- Sembrar al crear usuario
create or replace function public.al_crear_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sembrar_datos(new.id);
  return new;
end $$;

drop trigger if exists tr_sembrar_usuario on auth.users;
create trigger tr_sembrar_usuario after insert on auth.users
  for each row execute function public.al_crear_usuario();

-- Usuarios existentes
select public.sembrar_datos(id) from auth.users;
