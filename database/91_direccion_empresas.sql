-- =============================================================================
-- 91 · Dirección fiscal de cada empresa (va en la imagen y el PDF del pedido al proveedor)
--
-- · Se llena empresa.direccion por RUC.
-- · fn_contexto_sesion entrega también la dirección junto con el RUC y la razón social.
-- =============================================================================

update empresa set direccion = 'JR. JOSE OLAYA NRO. 106 CONCHOPATA (POR LA PLAZOLETA DE CONCHOPATA) AYACUCHO - HUAMANGA - ANDRES AVELINO CACERES'
where ruc = '20494980801';   -- CORPORACIÓN LAS FLORES S.A.C. (Restaurante Las Flores)

update empresa set direccion = 'JR. PARINACOCHAS MZA. N LOTE. 12 (EX ULTIMO PARADERO RUTA 5) AYACUCHO - HUAMANGA - ANDRES AVELINO CACERES'
where ruc = '20609784254';   -- CLUB LAS FLORES S.A.C. (Hotel Umaru)

create or replace function public.fn_contexto_sesion() returns jsonb
language sql stable security definer set search_path = public as $$
  -- solo los datos del usuario conectado (auth.uid()); null si no hay sesión o está inactivo
  select case when u.id is null then null else jsonb_build_object(
    'usuario', jsonb_build_object('id', u.id, 'username', u.username, 'nombre', u.nombre, 'rol', u.rol, 'todos_locales', u.todos_locales),
    -- todos los negocios activos (destinos de traspasos, listas generales), con su empresa (RUC, razón social, dirección)
    'locales', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nombre', l.nombre, 'color', l.color,
                                          'ruc', e.ruc, 'razon_social', e.razon_social, 'direccion', e.direccion) order by l.orden)
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

-- Verificación: las dos empresas con su dirección
select ruc, razon_social, direccion from empresa order by ruc;
