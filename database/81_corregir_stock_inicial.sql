-- =============================================================================
-- 81 · Stock inicial: se puede registrar en CERO y se puede CORREGIR
--
-- · Cantidad 0 («no hay stock de este producto»): el producto queda «Listo» con stock 0, sin movimiento.
-- · «Corregir stock inicial»: deshace el stock inicial de un producto en un almacén (lo anula con su motivo,
--   queda en el Kardex como anulado) y el producto vuelve a «Pendiente» para cargarlo bien, incluso con otra
--   unidad. Solo mientras ese producto no tenga otros movimientos en ese almacén (entradas, salidas, traspasos);
--   después se corrige con una entrada o salida de ajuste.
-- · La unidad del producto se puede cambiar si sus únicos movimientos quedaron anulados.
-- =============================================================================

-- ── Stock inicial: ahora acepta 0 ──────────────────────────────────────────────────────────
create or replace function public.fn_inventario_inicial(p_almacen uuid, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_local uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
        v_lineas jsonb := '[]'; n_reg int := 0; n_omit int := 0;
begin
  select local_id into v_local from almacen where id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén registra el stock inicial';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_prod := (l->>'producto_id')::uuid;
    v_cant := coalesce(nullif(l->>'cantidad', '')::numeric, 0);
    v_precio := nullif(l->>'precio', '')::numeric;
    if v_cant < 0 or coalesce(v_precio, 0) < 0 then raise exception 'La cantidad y el precio no pueden ser negativos'; end if;
    if not exists (select 1 from producto_almacen where producto_id = v_prod and almacen_id = p_almacen) then
      raise exception 'Un producto no pertenece a este almacén';
    end if;
    -- ya tiene inventario en este almacén: no se vuelve a poner (para corregirlo: fn_deshacer_stock_inicial)
    if exists (select 1 from stock where producto_id = v_prod and almacen_id = p_almacen) then
      n_omit := n_omit + 1; continue;
    end if;
    if coalesce(v_precio, 0) > 0 then
      update producto set costo_referencia = v_precio, updated_at = now() where id = v_prod;
    end if;
    if v_cant > 0 then
      v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_precio,
                                                 'fecha_vencimiento', nullif(l->>'fecha_vencimiento', ''));
    else
      -- en cero: queda registrado (stock 0) sin movimiento
      insert into stock (producto_id, almacen_id, cantidad, costo_promedio, ultimo_movimiento)
      values (v_prod, p_almacen, 0, coalesce(v_precio, 0), now());
    end if;
    n_reg := n_reg + 1;
  end loop;
  if jsonb_array_length(v_lineas) > 0 then
    perform fn_registrar_movimiento('stock_inicial', p_almacen, v_lineas, now(), null, 'STOCK INICIAL', 'Stock inicial');
  end if;
  return jsonb_build_object('registrados', n_reg, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_inventario_inicial(uuid, jsonb) to authenticated;

-- ── Corregir: deshacer el stock inicial de un producto en un almacén ──────────────────────
create or replace function public.fn_deshacer_stock_inicial(p_almacen uuid, p_producto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_mov record; v_lineas int;
begin
  select local_id into v_local from almacen where id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén corrige el stock inicial';
  end if;
  -- después de otros movimientos ya no: el stock inicial pudo usarse (se corrige con un ajuste)
  if exists (select 1 from movimiento_detalle d join movimiento m on m.id = d.movimiento_id
              where d.producto_id = p_producto and m.almacen_id = p_almacen and not m.anulado and m.tipo <> 'stock_inicial') then
    raise exception 'Este producto ya tiene entradas, salidas o traspasos en este almacén: corríjalo con una entrada o salida de ajuste.';
  end if;
  for v_mov in select distinct m.id from movimiento m join movimiento_detalle d on d.movimiento_id = m.id
                where d.producto_id = p_producto and m.almacen_id = p_almacen and m.tipo = 'stock_inicial' and not m.anulado loop
    select count(*) into v_lineas from movimiento_detalle where movimiento_id = v_mov.id;
    if v_lineas > 1 then
      raise exception 'Este stock inicial se registró junto con otros productos: corríjalo con una entrada o salida de ajuste.';
    end if;
    -- se anula (el disparador devuelve el stock y vacía su lote) y queda el motivo en el Kardex
    update movimiento set anulado = true, motivo_anulacion = 'Corrección del stock inicial' where id = v_mov.id;
    delete from lote where movimiento_id = v_mov.id and producto_id = p_producto and cantidad_disponible = 0;
  end loop;
  -- vuelve a «Pendiente»: sin fila de stock (también si se había registrado en cero)
  delete from stock where producto_id = p_producto and almacen_id = p_almacen and cantidad = 0;
  if exists (select 1 from stock where producto_id = p_producto and almacen_id = p_almacen) then
    raise exception 'No se pudo deshacer: el stock de este producto no quedó en cero.';
  end if;
end $$;
revoke execute on function public.fn_deshacer_stock_inicial(uuid, uuid) from public, anon;
grant execute on function public.fn_deshacer_stock_inicial(uuid, uuid) to authenticated;

-- ── La unidad se puede cambiar si los únicos movimientos del producto quedaron anulados ──
create or replace function public.fn_producto_unidad_fija() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unidad_id is distinct from old.unidad_id
     and (exists (select 1 from movimiento_detalle d join movimiento m on m.id = d.movimiento_id
                   where d.producto_id = new.id and not m.anulado)
          or exists (select 1 from stock where producto_id = new.id and cantidad <> 0)) then
    raise exception 'No se puede cambiar la unidad: el producto ya tiene movimientos. Si solo tiene su stock inicial, use «Corregir stock inicial» y luego cambie la unidad. Su presentación grande sí se puede cambiar.';
  end if;
  return new;
end $$;
