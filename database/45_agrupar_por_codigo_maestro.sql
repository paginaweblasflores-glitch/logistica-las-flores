-- =============================================================================
--  45_agrupar_por_codigo_maestro.sql
--  Logística ve cada producto UNA vez aunque lo usen los dos negocios (cada negocio tiene su copia):
--    · Productos (vista de ambos negocios): solo el producto maestro, con los negocios de todas sus copias;
--    · Trazabilidad de precios: las compras de Las Flores y Umaru juntas, por código maestro Y unidad
--      (no se mezclan precios por saco con precios por kilo).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) ¿Es el producto maestro? (la copia de otro negocio no lo es)
alter table public.producto add column if not exists es_maestro boolean generated always as (maestro_id = id) stored;

-- 2) Estadística de precios por código maestro y unidad
create or replace view public.v_precio_estadistica with (security_invoker = true) as
select -- el producto que representa al grupo: el maestro si tiene esa unidad; si no, uno de sus copias
       (array_agg(h.producto_id order by p.es_maestro desc, p.codigo))[1] as producto_id,
       (array_agg(p.codigo order by p.es_maestro desc, p.codigo))[1]::varchar(20) as codigo,
       (array_agg(p.nombre order by p.es_maestro desc, p.codigo))[1] as producto,
       u.codigo as unidad,
       (array_agg(cat.nombre order by p.es_maestro desc, p.codigo))[1] as categoria,
       count(*) as compras, min(h.precio) as precio_min, max(h.precio) as precio_max,
       round(avg(h.precio), 4) as precio_promedio,
       (array_agg(h.precio order by h.fecha desc, h.created_at desc))[1] as precio_actual,
       (array_agg(h.precio order by h.fecha asc, h.created_at asc))[1] as precio_inicial,
       max(h.fecha) as ultima_compra,
       round(((array_agg(h.precio order by h.fecha desc, h.created_at desc))[1]
              - (array_agg(h.precio order by h.fecha asc, h.created_at asc))[1])
             / nullif((array_agg(h.precio order by h.fecha asc, h.created_at asc))[1], 0), 4) as variacion_pct,
       p.maestro_id, p.unidad_id
from public.precio_historial h
join public.producto p on p.id = h.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria cat on cat.id = p.categoria_id
where h.tipo = 'compra'
group by p.maestro_id, p.unidad_id, u.codigo;

-- 3) Trazabilidad: la variación se mide dentro del mismo grupo (código maestro + unidad)
create or replace view public.v_trazabilidad_precios with (security_invoker = true) as
select h.id, h.producto_id, p.codigo, p.nombre as producto, u.codigo as unidad, h.fecha, h.local_id,
       h.proveedor_id, pr.razon_social as proveedor, h.precio,
       lag(h.precio) over w as precio_anterior,
       lag(pr.razon_social) over w as proveedor_anterior,
       lag(h.fecha) over w as fecha_anterior,
       h.precio - lag(h.precio) over w as variacion,
       round((h.precio - lag(h.precio) over w) / nullif(lag(h.precio) over w, 0), 4) as variacion_pct,
       c.id as compra_id, c.numero as compra_numero,
       p.maestro_id, p.unidad_id
from public.precio_historial h
join public.producto p on p.id = h.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.proveedor pr on pr.id = h.proveedor_id
left join public.compra_detalle d on d.id = h.compra_detalle_id
left join public.compra c on c.id = d.compra_id
where h.tipo = 'compra'
window w as (partition by p.maestro_id, p.unidad_id order by h.fecha, h.created_at);

-- 4) Precio por mes: las compras de las copias del producto con la misma unidad
create or replace function public.fn_precio_mensual(p_producto uuid, p_local uuid default null)
returns table(anio int, mes int, promedio numeric, minimo numeric, maximo numeric, compras int, proveedor_mas_barato text)
language sql stable security invoker set search_path = public as $$
  with h as (
    select date_trunc('month', ph.fecha)::date as m, ph.fecha, ph.precio, pr.razon_social as proveedor
    from precio_historial ph left join proveedor pr on pr.id = ph.proveedor_id
    where ph.producto_id in (select x.id from producto x join producto p on p.id = p_producto
                              where x.maestro_id = p.maestro_id and x.unidad_id = p.unidad_id)
      and ph.tipo = 'compra' and ph.precio > 0
      and (p_local is null or ph.local_id = p_local)
  ), mes as (
    select m, round(avg(precio), 4) as promedio, min(precio) as minimo, max(precio) as maximo, count(*)::int as compras
    from h group by m
  )
  select extract(year from mes.m)::int, extract(month from mes.m)::int, mes.promedio, mes.minimo, mes.maximo, mes.compras,
         -- a quién se le compró más barato ese mes
         (select h2.proveedor from h h2 where h2.m = mes.m order by h2.precio, h2.fecha limit 1)
  from mes
  order by mes.m
$$;
grant execute on function public.fn_precio_mensual(uuid, uuid) to authenticated;

-- Verificación: productos maestros y grupos de precio
select (select count(*) from public.producto where es_maestro) maestros,
       (select count(*) from public.producto where not es_maestro) copias,
       (select count(*) from public.v_precio_estadistica) grupos_de_precio;
