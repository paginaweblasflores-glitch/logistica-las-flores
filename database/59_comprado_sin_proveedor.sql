-- =============================================================================
--  59_comprado_sin_proveedor.sql
--  Requerimiento del almacén: Logística lo marca «Comprado» sin elegir proveedor (solo «Debe llegar», opcional).
--  El proveedor lo pone el almacén al registrar la llegada, copiándolo de la boleta.
--  Además, la compra guarda lo aprobado en la unidad en que se pidió (3 paquetes, no 18 unidades sueltas).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_comprar_requerimiento_almacen(
  p_requerimiento uuid, p_proveedor uuid, p_fecha_compromiso timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r requerimiento%rowtype; v_c uuid;
begin
  select * into v_r from requerimiento where id = p_requerimiento for update;
  if v_r.id is null or v_r.origen <> 'almacen' then raise exception 'No es un requerimiento del almacén'; end if;
  if not fn_puede('compras', 'escribir') or not fn_tiene_local(v_r.local_id) then raise exception 'No autorizado'; end if;
  if v_r.estado <> 'aprobado' then raise exception 'El requerimiento % debe estar aprobado (y sin compra)', v_r.numero; end if;
  insert into compra (local_id, almacen_id, proveedor_id, requerimiento_id, estado, fecha_aprobacion, fecha_compromiso)
  values (v_r.local_id, v_r.almacen_id, p_proveedor, v_r.id, 'aprobada', now(), p_fecha_compromiso)
  returning id into v_c;
  insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario, requerimiento_detalle_id, cantidad_pedida, unidad_pedido_id)
  select v_c, d.producto_id, coalesce(d.cantidad_aprobada, d.cantidad_solicitada), 0, d.id,
         -- lo aprobado, en la unidad en que se pidió (3 de 4 paquetes → 3 paquetes)
         case when coalesce(d.cantidad_pedida, 0) > 0 and d.cantidad_solicitada > 0
              then round(coalesce(d.cantidad_aprobada, d.cantidad_solicitada) * d.cantidad_pedida / d.cantidad_solicitada, 4) end,
         d.unidad_pedido_id
  from requerimiento_detalle d
  where d.requerimiento_id = v_r.id and d.producto_id is not null and coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0;
  update requerimiento set estado = 'comprado' where id = v_r.id;
  return v_c;
end $$;
grant execute on function public.fn_comprar_requerimiento_almacen(uuid, uuid, timestamptz) to authenticated;

-- El almacén pone el proveedor de la boleta al registrar la llegada (solo en una compra que aún no llegó)
create or replace function public.fn_compra_poner_proveedor(p_compra uuid, p_proveedor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if v_c.estado <> 'aprobada' then raise exception 'La compra % no está pendiente de llegada', v_c.numero; end if;
  if not fn_tiene_local(v_c.local_id) or not (fn_puede('inventario', 'escribir') or fn_puede('compras', 'escribir')) then
    raise exception 'No autorizado para recibir esta compra';
  end if;
  if p_proveedor is null then raise exception 'Elija el proveedor de la boleta'; end if;
  update compra set proveedor_id = p_proveedor where id = p_compra;
end $$;
grant execute on function public.fn_compra_poner_proveedor(uuid, uuid) to authenticated;
