-- =============================================================================
--  17_proveedores_precios_transporte.sql
--  Ajustes de los módulos de apoyo tras los cambios de compras:
--  · Proveedores: "nuevos proveedores" = los que tuvieron su PRIMERA COMPRA en el mes
--    (antes contaba la fecha de registro, y la lista de tiendas cargada de una vez
--    aparecía como si fueran 58 proveedores nuevos en octubre).
--  · Trazabilidad de precios: cada precio enlaza a la compra de la que salió.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_proveedores_mensual(p_anio int default extract(year from current_date)::int)
returns table(mes int, nuevos bigint, acumulado numeric)
language sql stable security invoker as $$
  with primera as (                                   -- primera compra válida de cada proveedor
    select c.proveedor_id, min(c.fecha) as fecha
    from public.compra c
    where c.proveedor_id is not null and c.estado <> 'anulada'
    group by c.proveedor_id
  )
  select g.m, count(p.proveedor_id), sum(count(p.proveedor_id)) over (order by g.m)
  from generate_series(1, 12) g(m)
  left join primera p on extract(year from p.fecha) = p_anio and extract(month from p.fecha) = g.m
  group by g.m
  order by g.m
$$;

create or replace view public.v_trazabilidad_precios with (security_invoker = true) as
select h.id, h.producto_id, p.codigo, p.nombre as producto, u.codigo as unidad, h.fecha, h.local_id,
       h.proveedor_id, pr.razon_social as proveedor, h.precio,
       lag(h.precio) over w as precio_anterior,
       lag(pr.razon_social) over w as proveedor_anterior,
       lag(h.fecha) over w as fecha_anterior,
       h.precio - lag(h.precio) over w as variacion,
       round((h.precio - lag(h.precio) over w) / nullif(lag(h.precio) over w, 0), 4) as variacion_pct,
       c.id as compra_id, c.numero as compra_numero
from public.precio_historial h
join public.producto p on p.id = h.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.proveedor pr on pr.id = h.proveedor_id
left join public.compra_detalle d on d.id = h.compra_detalle_id
left join public.compra c on c.id = d.compra_id
where h.tipo = 'compra'
window w as (partition by h.producto_id order by h.fecha, h.created_at);

-- Verificación
select * from public.fn_proveedores_mensual(2026) where nuevos > 0;
