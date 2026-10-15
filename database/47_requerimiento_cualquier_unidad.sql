-- =============================================================================
--  47_requerimiento_cualquier_unidad.sql
--  Requerimiento del almacén: se puede pedir en CUALQUIER unidad (el aceite también se compra por cajas).
--  Si el sistema no sabe convertirla, el almacén escribe la equivalencia en la misma línea («1 Caja = 12 UND»).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

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
    -- unidad que el sistema convierte solo (kilos, docenas…) o, si no, la equivalencia que escribió el almacén
    -- (p. ej. «1 Caja = 12 UND»)
    v_f := case when nullif(ln->>'unidad_id', '') is null then 1
                else coalesce(fn_factor_unidad((ln->>'producto_id')::uuid, (ln->>'unidad_id')::uuid),
                              nullif(ln->>'equivale', '')::numeric) end;
    if v_f is null or v_f <= 0 then
      raise exception 'Indique cuánto trae cada % de "%"',
        lower((select nombre from unidad_medida where id = (ln->>'unidad_id')::uuid)),
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
