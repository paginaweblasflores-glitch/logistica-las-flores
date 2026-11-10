-- =============================================================================
--  64_ahorro_sin_compras_sin_precio.sql
--  Una compra marcada «Comprado» todavía no tiene precio (S/ 0: lo pone el almacén con la boleta).
--  Se contaba como si el producto hubiera costado S/ 0 → «ahorro» del 100 % (p. ej. OC-2026-00003: S/ 620).
--  Ahora el ahorro, la base de comparación y la variación de precio solo cuentan líneas con precio.
--  Corrige la ficha de la compra, el Panel principal (Ahorro en compras), reportes y comparativo entre negocios.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace view public.v_compra_resumen with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, l.nombre as local_nombre, l.codigo as local_codigo,
       c.almacen_id, c.proveedor_id, pr.razon_social as proveedor, c.ciudad_id, ci.nombre as ciudad,
       c.estado, c.tipo_documento, c.numero_documento, c.forma_pago, c.requerimiento_id,
       c.fecha_aprobacion, c.fecha_entrega,
       coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) as fecha_objetivo,
       x.items, x.total, x.total_solicitado, x.ahorro, x.base_comparable,
       coalesce(tr.costo, 0) as costo_transporte,
       x.total + coalesce(tr.costo, 0) as costo_total,
       -- OTIF (definición estándar: pedido a tiempo Y completo)
       case when c.estado = 'recibida' and not c.sin_orden and c.fecha_aprobacion is not null
            then c.fecha_entrega <= coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) end as on_time,
       case when c.estado = 'recibida' and not c.sin_orden then x.in_full end as in_full,
       case when c.estado = 'recibida' and not c.sin_orden then x.fill_rate end as fill_rate,
       round(extract(epoch from (c.fecha_entrega - c.fecha_aprobacion)) / 3600.0, 1) as horas_entrega,
       -- todo lo comprado es fuera de catálogo (va directo al área): la llegada la registra Logística, no el almacén
       coalesce(x.solo_fuera_catalogo, false) as solo_fuera_catalogo,
       c.sin_orden, c.total_documento,
       coalesce(x.diferencias_precio, 0) as diferencias_precio
from public.compra c
join public.local l on l.id = c.local_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id
left join lateral (
  select count(*) as items,
         round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total,
         round(sum(d.cantidad_solicitada * d.precio_unitario), 2) as total_solicitado,
         -- solo líneas con precio: una compra marcada «Comprado» aún no tiene precio (S/ 0) y no es un ahorro
         round(sum(case when d.precio_anterior is not null and d.precio_unitario > 0
                        then (d.precio_anterior - d.precio_unitario) * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as ahorro,
         round(sum(case when d.precio_anterior is not null and d.precio_unitario > 0
                        then d.precio_anterior * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as base_comparable,
         bool_and(coalesce(d.cantidad_recibida, 0) >= d.cantidad_solicitada) as in_full,
         least(1, sum(least(coalesce(d.cantidad_recibida, 0), d.cantidad_solicitada)) / nullif(sum(d.cantidad_solicitada), 0)) as fill_rate,
         bool_and(d.producto_id is null) as solo_fuera_catalogo,
         count(*) filter (where d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencias_precio
  from public.compra_detalle d where d.compra_id = c.id) x on true
left join lateral (select sum(t.costo) costo from public.transporte t where t.compra_id = c.id) tr on true;

drop view if exists public.v_compra_detalle;
create view public.v_compra_detalle with (security_invoker = true) as
select d.*, c.numero, c.fecha, c.local_id, c.estado, c.proveedor_id, pr.razon_social as proveedor,
       c.ciudad_id, ci.nombre as ciudad,
       coalesce(p.nombre, d.descripcion) as producto, p.codigo as producto_codigo, cat.nombre as categoria,
       coalesce(u.codigo, d.unidad_texto, 'UND') as unidad,
       (d.producto_id is null) as fuera_de_catalogo,
       round(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario, 2) as importe,
       -- sin precio todavía (compra marcada «Comprado»): no hay variación que mostrar
       case when d.precio_unitario > 0 then d.precio_unitario - d.precio_anterior end as variacion,
       case when d.precio_unitario > 0 then round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) end as variacion_pct
from public.compra_detalle d
join public.compra c on c.id = d.compra_id
left join public.producto p on p.id = d.producto_id
left join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria cat on cat.id = p.categoria_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id;

-- Verificación: compras sin precio ya no muestran ahorro
select numero, estado, total, ahorro, base_comparable from public.v_compra_resumen order by fecha desc limit 10;
