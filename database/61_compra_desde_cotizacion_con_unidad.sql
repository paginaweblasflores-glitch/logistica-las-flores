-- =============================================================================
--  61_compra_desde_cotizacion_con_unidad.sql
--  «Comprado» desde una cotización del almacén: cada compra guarda lo pedido en su unidad (3 Saco, 4 Paquete)
--  y el enlace al producto del requerimiento. Así el almacén, al registrar la llegada, ve «3 Saco» y el
--  precio adjudicado viene sugerido.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_comprar_desde_cotizacion(p_cotizacion uuid, p_fecha_compromiso timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_q cotizacion%rowtype; v_r requerimiento%rowtype; o record; v_c uuid; n int := 0;
begin
  select * into v_q from cotizacion where id = p_cotizacion;
  if v_q.id is null or v_q.estado <> 'adjudicada' then raise exception 'La cotización debe estar adjudicada'; end if;
  select * into v_r from requerimiento where id = v_q.requerimiento_id for update;
  if v_r.id is null or v_r.origen <> 'almacen' then raise exception 'No es un requerimiento del almacén'; end if;
  if not fn_puede('compras', 'escribir') or not fn_tiene_local(v_r.local_id) then raise exception 'No autorizado'; end if;
  for o in
    select distinct i.oferta_ganadora_id as oferta, x.proveedor_id
    from cotizacion_item i join cotizacion_oferta x on x.id = i.oferta_ganadora_id
    where i.cotizacion_id = p_cotizacion and i.oferta_ganadora_id is not null
      and not exists (select 1 from compra c where c.oferta_id = i.oferta_ganadora_id and c.estado <> 'anulada')
  loop
    insert into compra (local_id, almacen_id, proveedor_id, requerimiento_id, cotizacion_id, oferta_id, estado, fecha_aprobacion, fecha_compromiso)
    values (v_r.local_id, v_r.almacen_id, o.proveedor_id, v_r.id, p_cotizacion, o.oferta, 'aprobada', now(), p_fecha_compromiso)
    returning id into v_c;
    -- con la unidad en que se pidió (3 Saco) y el enlace al requerimiento: el almacén lo ve así al registrar la llegada
    insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario, requerimiento_detalle_id, cantidad_pedida, unidad_pedido_id)
    select v_c, i.producto_id, i.cantidad, 0, i.requerimiento_detalle_id,
           case when i.unidad_pedido is not null then i.cantidad_pedida end,
           case when i.unidad_pedido is not null then d.unidad_pedido_id end
    from cotizacion_item i left join requerimiento_detalle d on d.id = i.requerimiento_detalle_id
    where i.cotizacion_id = p_cotizacion and i.oferta_ganadora_id = o.oferta and i.producto_id is not null;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Ya se registraron las compras de esta cotización'; end if;
  update requerimiento set estado = 'comprado' where id = v_r.id and estado in ('aprobado', 'en_cotizacion');
  return n;
end $$;
grant execute on function public.fn_comprar_desde_cotizacion(uuid, timestamptz) to authenticated;
