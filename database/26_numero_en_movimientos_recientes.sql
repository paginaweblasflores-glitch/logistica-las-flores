-- =============================================================================
--  26_numero_en_movimientos_recientes.sql
--  El Kardex sin producto elegido («Movimientos recientes») y los reportes del almacén leen de
--  v_movimiento_linea: se le agrega el número propio de cada movimiento (E-00001 / S-00001),
--  igual que a v_kardex en la migración 25.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace view public.v_movimiento_linea with (security_invoker = true) as
select m.id as movimiento_id, m.numero, m.fecha, m.tipo, t.nombre as tipo_nombre, t.signo, m.almacen_id, a.nombre as almacen_nombre,
       m.local_id, mo.nombre as motivo_nombre, m.referencia_tipo, m.referencia_id, m.documento, m.observacion,
       d.id as detalle_id, d.producto_id, p.nombre as producto_nombre, u.codigo as unidad,
       case when t.signo > 0 then d.cantidad end as entrada, case when t.signo < 0 then d.cantidad end as salida,
       d.costo_unitario, round(d.cantidad * coalesce(d.costo_unitario, 0), 2) as importe, d.fifo_cumplido,
       m.nro
from public.movimiento m
join public.movimiento_detalle d on d.movimiento_id = m.id
join public.tipo_movimiento t on t.codigo = m.tipo
join public.almacen a on a.id = m.almacen_id
join public.producto p on p.id = d.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.motivo mo on mo.id = m.motivo_id
where not m.anulado;

-- Verificación: debe listar la columna nro
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'v_movimiento_linea' and column_name = 'nro';
