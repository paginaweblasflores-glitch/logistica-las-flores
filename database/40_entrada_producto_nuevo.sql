-- =============================================================================
--  40_entrada_producto_nuevo.sql
--  La cantidad con la que se registra un producto nuevo es una ENTRADA más (E-00001…) y se llama
--  «Producto nuevo» (ya no «Inventario inicial»). También se renombran las que ya se registraron.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.tipo_movimiento set nombre = 'Producto nuevo' where codigo = 'stock_inicial';
update public.movimiento set documento = 'PRODUCTO NUEVO', observacion = 'Producto nuevo'
 where tipo = 'stock_inicial' and documento = 'INV-INICIAL';

create or replace function public.fn_inventario_inicial(p_almacen uuid, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_local uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
        v_lineas jsonb := '[]'; n_reg int := 0; n_omit int := 0;
begin
  select local_id into v_local from almacen where id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén registra la cantidad de un producto nuevo';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_prod := (l->>'producto_id')::uuid;
    v_cant := coalesce(nullif(l->>'cantidad', '')::numeric, 0);
    v_precio := nullif(l->>'precio', '')::numeric;
    if v_cant < 0 or coalesce(v_precio, 0) < 0 then raise exception 'La cantidad y el precio no pueden ser negativos'; end if;
    if not exists (select 1 from producto_almacen where producto_id = v_prod and almacen_id = p_almacen) then
      raise exception 'Un producto no pertenece a este almacén';
    end if;
    -- ya tiene inventario en este almacén (cualquier movimiento): se bloquea, no se vuelve a poner
    if exists (select 1 from stock where producto_id = v_prod and almacen_id = p_almacen) then
      n_omit := n_omit + 1; continue;
    end if;
    if coalesce(v_precio, 0) > 0 then
      update producto set costo_referencia = v_precio, updated_at = now() where id = v_prod;
    end if;
    if v_cant > 0 then
      v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_precio,
                                                 'fecha_vencimiento', nullif(l->>'fecha_vencimiento', ''));
      n_reg := n_reg + 1;
    end if;
  end loop;
  if jsonb_array_length(v_lineas) > 0 then
    perform fn_registrar_movimiento('stock_inicial', p_almacen, v_lineas, now(), null, 'PRODUCTO NUEVO', 'Producto nuevo');
  end if;
  return jsonb_build_object('registrados', n_reg, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_inventario_inicial(uuid, jsonb) to authenticated;
