-- =============================================================================
-- 88 · «Órdenes de compra»: el total de arriba suma solo las órdenes de la lista
--
-- La lista no muestra las compras directas del almacén (Compra con boleta, sin orden: se ven en «Ingresos de
-- almacén» y en Carpetas), pero el total sí las sumaba: se veía «Total S/ 40.00» con la lista vacía.
-- Nuevo parámetro p_solo_ordenes (por defecto false: Transporte sigue sumando todas las compras).
-- =============================================================================

-- se borra la versión anterior para que no queden dos funciones con el mismo nombre
drop function if exists public.fn_compras_resumen(uuid, date, date);

create or replace function public.fn_compras_resumen(p_local uuid default null, p_desde date default null, p_hasta date default null,
                                                     p_solo_ordenes boolean default false)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'total', coalesce(sum(total), 0), 'cantidad', count(*), 'transporte', coalesce(sum(costo_transporte), 0),
    'ahorro', coalesce(sum(ahorro) filter (where ahorro > 0), 0), 'sobrecosto', coalesce(-sum(ahorro) filter (where ahorro < 0), 0))
  from v_compra_resumen
  where estado <> 'anulada' and (p_local is null or local_id = p_local)
    and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)
    and (not p_solo_ordenes or not sin_orden)
$$;
grant execute on function public.fn_compras_resumen(uuid, date, date, boolean) to authenticated;

notify pgrst, 'reload schema';
