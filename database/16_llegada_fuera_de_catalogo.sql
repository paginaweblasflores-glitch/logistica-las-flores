-- =============================================================================
--  16_llegada_fuera_de_catalogo.sql
--  Las compras que SOLO tienen bienes fuera de catálogo (van directo al área que los pidió,
--  no entran al almacén) las recibe Logística: ella registra la fecha y hora de llegada.
--  Las compras con productos del almacén las sigue recibiendo el almacén.
--  · v_compra_resumen.solo_fuera_catalogo
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
       case when c.estado = 'recibida' and c.fecha_aprobacion is not null
            then c.fecha_entrega <= coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) end as on_time,
       case when c.estado = 'recibida' then x.in_full end as in_full,
       case when c.estado = 'recibida' then x.fill_rate end as fill_rate,
       round(extract(epoch from (c.fecha_entrega - c.fecha_aprobacion)) / 3600.0, 1) as horas_entrega,
       -- todo lo comprado es fuera de catálogo (va directo al área): la llegada la registra Logística, no el almacén
       coalesce(x.solo_fuera_catalogo, false) as solo_fuera_catalogo
from public.compra c
join public.local l on l.id = c.local_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id
left join lateral (
  select count(*) as items,
         round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total,
         round(sum(d.cantidad_solicitada * d.precio_unitario), 2) as total_solicitado,
         round(sum(case when d.precio_anterior is not null
                        then (d.precio_anterior - d.precio_unitario) * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as ahorro,
         round(sum(case when d.precio_anterior is not null
                        then d.precio_anterior * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as base_comparable,
         bool_and(coalesce(d.cantidad_recibida, 0) >= d.cantidad_solicitada) as in_full,
         least(1, sum(least(coalesce(d.cantidad_recibida, 0), d.cantidad_solicitada)) / nullif(sum(d.cantidad_solicitada), 0)) as fill_rate,
         bool_and(d.producto_id is null) as solo_fuera_catalogo
  from public.compra_detalle d where d.compra_id = c.id) x on true
left join lateral (select sum(t.costo) costo from public.transporte t where t.compra_id = c.id) tr on true;

-- Verificación
select numero, estado, items, solo_fuera_catalogo from public.v_compra_resumen order by numero;
