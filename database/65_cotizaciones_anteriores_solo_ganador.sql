-- =============================================================================
--  65_cotizaciones_anteriores_solo_ganador.sql
--  «Cotizaciones anteriores de estos productos»: por cada producto, solo el proveedor que GANÓ la última vez
--  (el adjudicado), con su precio. «Usar estos precios» carga solo los productos marcados para cotizar.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- El último ganador de cada producto (de la cotización adjudicada más reciente)
create or replace view public.v_cotizacion_ganador with (security_invoker = true) as
select distinct on (i.producto_id)
       i.producto_id, o.proveedor_id, pr.razon_social as proveedor, coalesce(o.canal, 'tienda') as canal,
       cp.precio_unitario as precio, o.fecha, q.id as cotizacion_id, q.numero as cotizacion_numero
from public.cotizacion_item i
join public.cotizacion_oferta o on o.id = i.oferta_ganadora_id
join public.cotizacion_precio cp on cp.oferta_id = o.id and cp.item_id = i.id
join public.cotizacion q on q.id = i.cotizacion_id and q.estado <> 'anulada'
join public.proveedor pr on pr.id = o.proveedor_id
where i.producto_id is not null
order by i.producto_id, o.fecha desc, o.ronda desc;

-- Para la pantalla de la cotización: el ganador anterior de cada uno de SUS productos
create or replace function public.fn_cotizaciones_anteriores(p_cotizacion uuid)
returns table(item_id uuid, proveedor_id uuid, proveedor text, canal text, precio numeric, fecha date, cotizacion_numero text)
language sql stable security invoker set search_path = public as $$
  select i.id, g.proveedor_id, g.proveedor, g.canal, g.precio, g.fecha, g.cotizacion_numero
  from cotizacion_item i
  join v_cotizacion_ganador g on g.producto_id = i.producto_id and g.cotizacion_id <> p_cotizacion
  where i.cotizacion_id = p_cotizacion
  order by g.proveedor, g.canal
$$;
grant execute on function public.fn_cotizaciones_anteriores(uuid) to authenticated;

-- «Usar estos precios»: oferta del proveedor con los productos que ganó antes (solo los marcados para cotizar)
drop function if exists public.fn_oferta_desde_anterior(uuid, uuid, text);
create or replace function public.fn_oferta_desde_anterior(p_cotizacion uuid, p_proveedor uuid, p_canal text default 'tienda',
                                                           p_items uuid[] default null)
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
  select v_oferta, i.id, g.precio
  from cotizacion_item i
  join v_cotizacion_ganador g on g.producto_id = i.producto_id and g.proveedor_id = p_proveedor and g.canal = coalesce(p_canal, 'tienda')
  where i.cotizacion_id = p_cotizacion and g.cotizacion_id <> p_cotizacion
    and (p_items is null or i.id = any(p_items));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ese proveedor no ganó antes ninguno de los productos marcados'; end if;
  return n;
end $$;
grant execute on function public.fn_oferta_desde_anterior(uuid, uuid, text, uuid[]) to authenticated;

-- Verificación: el último ganador de cada producto
select g.cotizacion_numero, p.nombre as producto, g.proveedor, g.precio from public.v_cotizacion_ganador g
join public.producto p on p.id = g.producto_id order by p.nombre;
