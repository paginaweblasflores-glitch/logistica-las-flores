-- =============================================================================
--  30_cotizaciones_anteriores.sql
--  Pedido de Fernanda (2026-10-12): lo que cotiza cada proveedor queda guardado por producto.
--  Si vuelven a pedir el producto X, la cotización nueva le muestra las anteriores (empresa A, B…)
--  y puede cargarlas como oferta con un clic, sin volver a escribir los precios.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- Último precio cotizado de cada producto por proveedor y forma de compra (de la ronda más reciente)
create or replace view public.v_cotizacion_historial with (security_invoker = true) as
select distinct on (i.producto_id, o.proveedor_id, coalesce(o.canal, 'tienda'))
       i.producto_id, o.proveedor_id, pr.razon_social as proveedor, coalesce(o.canal, 'tienda') as canal,
       cp.precio_unitario as precio, o.fecha, o.cotizacion_id, q.numero as cotizacion_numero
from public.cotizacion_precio cp
join public.cotizacion_item i on i.id = cp.item_id
join public.cotizacion_oferta o on o.id = cp.oferta_id
join public.cotizacion q on q.id = o.cotizacion_id and q.estado <> 'anulada'
join public.proveedor pr on pr.id = o.proveedor_id
where i.producto_id is not null
order by i.producto_id, o.proveedor_id, coalesce(o.canal, 'tienda'), o.fecha desc, o.ronda desc;

-- Para la pantalla de la cotización: las anteriores de SUS productos (una sola consulta)
create or replace function public.fn_cotizaciones_anteriores(p_cotizacion uuid)
returns table(item_id uuid, proveedor_id uuid, proveedor text, canal text, precio numeric, fecha date, cotizacion_numero text)
language sql stable security invoker set search_path = public as $$
  select i.id, h.proveedor_id, h.proveedor, h.canal, h.precio, h.fecha, h.cotizacion_numero
  from cotizacion_item i
  join v_cotizacion_historial h on h.producto_id = i.producto_id and h.cotizacion_id <> p_cotizacion
  where i.cotizacion_id = p_cotizacion
  order by h.proveedor, h.canal
$$;
grant execute on function public.fn_cotizaciones_anteriores(uuid) to authenticated;

-- «Usar estos precios»: crea en la cotización una oferta del proveedor con sus precios anteriores
create or replace function public.fn_oferta_desde_anterior(p_cotizacion uuid, p_proveedor uuid, p_canal text default 'tienda')
returns int language plpgsql security invoker set search_path = public as $$
declare v_oferta uuid; v_ronda int; n int;
begin
  if not exists (select 1 from cotizacion where id = p_cotizacion and estado = 'abierta') then
    raise exception 'La cotización ya no está abierta';
  end if;
  select coalesce(max(ronda), 0) + 1 into v_ronda from cotizacion_oferta
   where cotizacion_id = p_cotizacion and proveedor_id = p_proveedor and coalesce(canal, 'tienda') = coalesce(p_canal, 'tienda');
  insert into cotizacion_oferta (cotizacion_id, proveedor_id, ronda, canal, fecha, observacion)
  values (p_cotizacion, p_proveedor, v_ronda, coalesce(p_canal, 'tienda'), current_date, 'Precios de una cotización anterior')
  returning id into v_oferta;
  insert into cotizacion_precio (oferta_id, item_id, precio_unitario)
  select v_oferta, i.id, h.precio
  from cotizacion_item i
  join v_cotizacion_historial h on h.producto_id = i.producto_id and h.proveedor_id = p_proveedor and h.canal = coalesce(p_canal, 'tienda')
  where i.cotizacion_id = p_cotizacion and h.cotizacion_id <> p_cotizacion;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ese proveedor no tiene precios anteriores de estos productos'; end if;
  return n;
end $$;
grant execute on function public.fn_oferta_desde_anterior(uuid, uuid, text) to authenticated;

-- Verificación
select count(*) as precios_guardados from public.v_cotizacion_historial;
