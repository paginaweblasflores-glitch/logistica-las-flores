-- =============================================================================
--  46_requerimiento_almacen_con_unidad.sql
--  Requerimiento del ALMACÉN (no el de los jefes de área): cada producto se pide en la unidad que se elija
--  (la del producto o la de su contenido: sacos o kilos). Se guarda lo pedido tal cual («45 KG») y su
--  equivalente en la unidad del producto (0,9 SACO), que es con lo que se compra y se recibe.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

alter table public.requerimiento_detalle add column if not exists cantidad_pedida numeric(14,3);
alter table public.requerimiento_detalle add column if not exists unidad_pedido_id uuid references public.unidad_medida(id);
alter table public.compra_detalle add column if not exists cantidad_pedida numeric(14,3);
alter table public.compra_detalle add column if not exists unidad_pedido_id uuid references public.unidad_medida(id);

-- 1) Crear el requerimiento del almacén (con la unidad de cada línea)
create or replace function public.fn_crear_requerimiento_almacen(
  p_almacen uuid, p_lineas jsonb, p_fecha_requerida date default null, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_id uuid; v_nombre text; ln jsonb; v_f numeric;
begin
  select local_id into v_local from almacen where id = p_almacen and activo;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén hace su requerimiento';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l
             where coalesce(nullif(l->>'cantidad', '')::numeric, 0) <= 0
                or not exists (select 1 from producto_almacen pa where pa.producto_id = (l->>'producto_id')::uuid and pa.almacen_id = p_almacen)) then
    raise exception 'Cada producto debe ser de su almacén y tener cantidad mayor a cero';
  end if;
  select nombre into v_nombre from usuario where id = auth.uid();
  insert into requerimiento (local_id, origen, almacen_id, solicitante, fecha_requerida, observacion)
  values (v_local, 'almacen', p_almacen, coalesce(v_nombre, 'Almacén'), p_fecha_requerida, nullif(btrim(coalesce(p_observacion, '')), ''))
  returning id into v_id;
  -- cada línea se pide en la unidad elegida (p. ej. kilos de un producto en sacos): se guarda lo pedido tal cual
  -- y su equivalente en la unidad del producto (con eso se compra y se recibe)
  for ln in select * from jsonb_array_elements(p_lineas) loop
    v_f := case when nullif(ln->>'unidad_id', '') is null then 1
                else fn_factor_unidad((ln->>'producto_id')::uuid, (ln->>'unidad_id')::uuid) end;
    if v_f is null then
      raise exception 'No se puede pedir "%" en esa unidad: indique en la ficha del producto cuánto trae cada unidad',
        (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    if round((ln->>'cantidad')::numeric * v_f, 3) <= 0 then
      raise exception 'La cantidad de "%" es muy pequeña para esa unidad', (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    insert into requerimiento_detalle (requerimiento_id, producto_id, descripcion, stock_actual, cantidad_solicitada, motivo,
                                       cantidad_pedida, unidad_pedido_id)
    select v_id, p.id, p.nombre, coalesce((select s.cantidad from stock s where s.producto_id = p.id and s.almacen_id = p_almacen), 0),
           round((ln->>'cantidad')::numeric * v_f, 3), nullif(btrim(coalesce(ln->>'observacion', '')), ''),
           (ln->>'cantidad')::numeric, coalesce(nullif(ln->>'unidad_id', '')::uuid, p.unidad_id)
    from producto p where p.id = (ln->>'producto_id')::uuid;
  end loop;
  return v_id;
end $$;
grant execute on function public.fn_crear_requerimiento_almacen(uuid, jsonb, date, text) to authenticated;

-- 2) «Comprado»: la compra lleva también lo pedido tal cual (para mostrarlo)
create or replace function public.fn_comprar_requerimiento_almacen(
  p_requerimiento uuid, p_proveedor uuid, p_fecha_compromiso timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r requerimiento%rowtype; v_c uuid;
begin
  select * into v_r from requerimiento where id = p_requerimiento for update;
  if v_r.id is null or v_r.origen <> 'almacen' then raise exception 'No es un requerimiento del almacén'; end if;
  if not fn_puede('compras', 'escribir') or not fn_tiene_local(v_r.local_id) then raise exception 'No autorizado'; end if;
  if v_r.estado <> 'aprobado' then raise exception 'El requerimiento % debe estar aprobado (y sin compra)', v_r.numero; end if;
  if p_proveedor is null then raise exception 'Elija el proveedor'; end if;
  insert into compra (local_id, almacen_id, proveedor_id, requerimiento_id, estado, fecha_aprobacion, fecha_compromiso)
  values (v_r.local_id, v_r.almacen_id, p_proveedor, v_r.id, 'aprobada', now(), p_fecha_compromiso)
  returning id into v_c;
  insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario, requerimiento_detalle_id, cantidad_pedida, unidad_pedido_id)
  select v_c, d.producto_id, coalesce(d.cantidad_aprobada, d.cantidad_solicitada), 0, d.id,
         case when d.cantidad_aprobada is null then d.cantidad_pedida end, d.unidad_pedido_id
  from requerimiento_detalle d
  where d.requerimiento_id = v_r.id and d.producto_id is not null and coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0;
  update requerimiento set estado = 'comprado' where id = v_r.id;
  return v_c;
end $$;
grant execute on function public.fn_comprar_requerimiento_almacen(uuid, uuid, timestamptz) to authenticated;
