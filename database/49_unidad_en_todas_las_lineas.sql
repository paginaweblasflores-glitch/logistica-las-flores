-- =============================================================================
--  49_unidad_en_todas_las_lineas.sql
--  Unidad en cada línea (estándar de todo el sistema): se escribe la cantidad en la unidad que se quiera.
--    · Traspasos: también en unidades que el sistema no convierte solo, con lo que escribe el almacén («1 caja = 6 BOT»).
--    · Compra con boleta (Entradas): cada producto deja anotado cómo se escribió («4 Caja (1 = 6 BOT)»);
--      la cantidad y el precio ya llegan en la unidad del producto.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Enviar traspaso
create or replace function public.fn_traspaso_enviar(p_origen uuid, p_destino uuid, p_lineas jsonb,
                                                    p_motivo text default null, p_personal uuid default null,
                                                    p_fecha timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num text; v_loc uuid; r record; v_lineas jsonb; ln jsonb; v_f numeric; v_lin jsonb := '[]';
        v_loc_dest uuid; v_dest uuid; v_factor numeric;
begin
  select local_id into v_loc from almacen where id = p_origen;
  if v_loc is null or not exists (select 1 from almacen where id = p_destino) then raise exception 'Almacén no válido'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos'; end if;
  if not fn_puede('traslados', 'escribir') or not fn_tiene_local(v_loc) then
    raise exception 'No autorizado: solo el almacén de origen puede enviar este traspaso';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'El traspaso no tiene productos'; end if;

  -- cada línea puede venir en otra unidad del producto (p. ej. kilos de un producto que se maneja en sacos):
  -- se pasa a la unidad del producto
  for ln in select * from jsonb_array_elements(p_lineas) loop
    -- la unidad elegida: la convierte el sistema o, si no sabe, con lo que escribió el almacén («1 caja = 6 BOT»)
    v_f := case when nullif(ln->>'unidad_id', '') is null then 1
                else coalesce(fn_factor_unidad((ln->>'producto_id')::uuid, (ln->>'unidad_id')::uuid), nullif(ln->>'equivale', '')::numeric) end;
    if v_f is null or v_f <= 0 then
      raise exception 'No se puede enviar "%" en esa unidad: indique en la ficha del producto cuánto trae cada unidad',
        (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    v_lin := v_lin || (ln || jsonb_build_object('cantidad_envio', (ln->>'cantidad')::numeric,
                                                'cantidad', round((ln->>'cantidad')::numeric * v_f, 3)));
  end loop;
  p_lineas := v_lin;

  -- stock acumulado: dos líneas del mismo producto se validan juntas
  for r in
    select (x->>'producto_id')::uuid producto_id, sum((x->>'cantidad')::numeric) cant
    from jsonb_array_elements(p_lineas) x group by 1
  loop
    if r.cant is null or r.cant <= 0 then raise exception 'Las cantidades deben ser mayores a cero'; end if;
    if coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0) < r.cant then
      raise exception 'Stock insuficiente de "%" (disponible %, a enviar %)',
        (select nombre from producto where id = r.producto_id),
        coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0), r.cant;
    end if;
  end loop;

  insert into traslado (fecha, almacen_origen_id, almacen_destino_id, motivo, entrega_personal_id, estado)
  values (p_fecha, p_origen, p_destino, p_motivo, p_personal, 'pendiente')
  returning id, numero into v_id, v_num;

  -- el producto del negocio de destino (el mismo si es el mismo negocio; si no lo tiene, se crea en su lista)
  select local_id into v_loc_dest from almacen where id = p_destino;
  for ln in select * from jsonb_array_elements(p_lineas) loop
    v_dest := fn_producto_en_local((ln->>'producto_id')::uuid, v_loc_dest);
    v_factor := fn_factor_productos((ln->>'producto_id')::uuid, v_dest);
    if v_factor is null then
      raise exception 'No se puede pasar "%" a la unidad del almacén de destino: indique en la ficha del producto cuánto trae cada unidad',
        (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    insert into traslado_detalle (traslado_id, producto_id, cantidad, precio, fecha_vencimiento, observacion,
                                  producto_destino_id, factor, unidad_envio_id, cantidad_envio)
    values (v_id, (ln->>'producto_id')::uuid, (ln->>'cantidad')::numeric,
            coalesce((select costo_promedio from stock s where s.producto_id = (ln->>'producto_id')::uuid and s.almacen_id = p_origen), 0),
            nullif(ln->>'fecha_vencimiento','')::date, ln->>'observacion',
            v_dest, v_factor, coalesce(nullif(ln->>'unidad_id', '')::uuid, (select unidad_id from producto where id = (ln->>'producto_id')::uuid)),
            (ln->>'cantidad_envio')::numeric);
  end loop;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad, 'observacion', observacion))
    into v_lineas from traslado_detalle where traslado_id = v_id;
  perform fn_registrar_movimiento('traslado_salida', p_origen, v_lineas, p_fecha, null, v_num,
            coalesce(p_motivo, 'Traspaso'), p_personal, 'traslado', v_id);

  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

-- 2) Compra con boleta
create or replace function public.fn_ingreso_directo(
  p_almacen uuid, p_proveedor uuid, p_fecha timestamptz, p_tipo_doc text, p_num_doc text, p_total_doc numeric,
  p_lineas jsonb, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_cod text; v_anio text := to_char(p_fecha, 'YYYY'); v_id uuid; l jsonb; n int := 0;
begin
  select a.local_id, lo.codigo into v_local, v_cod from almacen a join local lo on lo.id = a.local_id where a.id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_tiene_local(v_local) or not fn_puede('inventario', 'escribir') then
    raise exception 'No autorizado para registrar ingresos en este almacén';
  end if;
  insert into compra (numero, local_id, almacen_id, proveedor_id, fecha, fecha_aprobacion, tipo_documento, numero_documento,
                      total_documento, estado, sin_orden, recibido_por, observacion)
  values ('IN-' || v_cod || '-' || v_anio || '-' || lpad(fn_siguiente_numero('IN-' || v_cod || '-' || v_anio)::text, 4, '0'),
          v_local, p_almacen, p_proveedor, p_fecha::date, p_fecha, nullif(p_tipo_doc, ''), nullif(trim(p_num_doc), ''),
          p_total_doc, 'aprobada', true, auth.uid(), nullif(trim(p_observacion), ''))
  returning id into v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    if (l->>'producto_id') is null or coalesce((l->>'cantidad')::numeric, 0) <= 0 then continue; end if;
    insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, fecha_vencimiento, observacion)
    values (v_id, (l->>'producto_id')::uuid, (l->>'cantidad')::numeric, (l->>'cantidad')::numeric,
            coalesce((l->>'precio')::numeric, 0), nullif(l->>'fecha_vencimiento', '')::date,
            nullif(l->>'observacion', ''));   -- cómo se escribió («4 Caja (1 = 6 BOT)»)
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  perform fn_recibir_compra(v_id, p_fecha);
  return v_id;
end $$;
