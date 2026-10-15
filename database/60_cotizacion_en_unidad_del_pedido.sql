-- =============================================================================
--  60_cotizacion_en_unidad_del_pedido.sql
--  La cotización de un requerimiento del almacén se hace en la unidad en que se pidió (3 Saco, 4 Paquete):
--   · cotizacion_item: lo pedido tal cual (cantidad_pedida + unidad_pedido) y cuántas unidades del producto
--     trae cada una (factor). «cantidad» sigue en la unidad del producto (lo que usa la compra).
--   · cotizacion_precio: precio_unitario sigue por unidad del producto (los totales y el historial no cambian);
--     precio_unidad = el precio por unidad suelta que dio el proveedor (opcional, solo informativo).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

alter table public.cotizacion_item add column if not exists cantidad_pedida numeric(14,4);
alter table public.cotizacion_item add column if not exists unidad_pedido text;
alter table public.cotizacion_item add column if not exists factor numeric(14,6) not null default 1 check (factor > 0);
alter table public.cotizacion_precio add column if not exists precio_unidad numeric(14,4) check (precio_unidad >= 0);

-- Cotizaciones ya abiertas de un requerimiento del almacén: toman la unidad del pedido
update public.cotizacion_item i
   set cantidad_pedida = round(i.cantidad * d.cantidad_pedida / d.cantidad_solicitada, 4),
       unidad_pedido = u.nombre,
       factor = d.cantidad_solicitada / d.cantidad_pedida
  from public.requerimiento_detalle d join public.unidad_medida u on u.id = d.unidad_pedido_id
 where d.id = i.requerimiento_detalle_id and i.unidad_pedido is null
   and coalesce(d.cantidad_pedida, 0) > 0 and d.cantidad_solicitada > 0 and d.cantidad_pedida <> d.cantidad_solicitada;

-- Verificación
select c.numero, i.descripcion, i.cantidad, i.cantidad_pedida, i.unidad_pedido, i.factor
  from public.cotizacion_item i join public.cotizacion c on c.id = i.cotizacion_id
 where i.unidad_pedido is not null order by c.numero;
