-- =============================================================================
--  28_contexto_de_sesion.sql
--  Rendimiento: cada pantalla pedía la sesión en 4 consultas seguidas (usuario → negocios →
--  negocios del usuario → almacenes), ~0,15 s cada una desde Perú a la base en Brasil.
--  Ahora es UNA sola llamada que devuelve todo junto.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_contexto_sesion() returns jsonb
language sql stable security definer set search_path = public as $$
  -- solo los datos del usuario conectado (auth.uid()); null si no hay sesión o está inactivo
  select case when u.id is null then null else jsonb_build_object(
    'usuario', jsonb_build_object('id', u.id, 'username', u.username, 'nombre', u.nombre, 'rol', u.rol, 'todos_locales', u.todos_locales),
    -- todos los negocios activos (destinos de traspasos, listas generales)
    'locales', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nombre', l.nombre, 'color', l.color,
                                          'ruc', e.ruc, 'razon_social', e.razon_social) order by l.orden)
      from local l left join empresa e on e.id = l.empresa_id where l.activo), '[]'::jsonb),
    -- los negocios que puede ver
    'mis_locales', to_jsonb(coalesce(fn_mis_locales(), '{}'::uuid[])),
    -- sus almacenes (para el selector Todos · Almacén 01 · Almacén 02 — Cocina)
    'almacenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'local_id', a.local_id) order by a.codigo)
      from almacen a where a.activo and a.tipo = 'almacen' and a.local_id = any(fn_mis_locales())), '[]'::jsonb)
  ) end
  from (select 1) x left join usuario u on u.id = auth.uid() and u.activo
$$;
grant execute on function public.fn_contexto_sesion() to authenticated;

-- Verificación (en el SQL Editor no hay usuario conectado: devuelve null)
select public.fn_contexto_sesion() is null as sin_sesion;
