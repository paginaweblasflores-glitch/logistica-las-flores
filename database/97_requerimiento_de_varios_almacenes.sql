-- =============================================================================
-- 97 · Requerimiento del almacén con productos de VARIOS almacenes del negocio (un solo formulario)
--
-- Con «Todos» elegido arriba, el almacenero busca en todos sus almacenes y elige para cuál es cada producto.
-- El sistema crea UN requerimiento por almacén (RA-…, con la misma validación de siempre), todos o ninguno.
-- Logística ya los ve juntos en el RL del día.
-- =============================================================================

-- p_lineas: [{almacen_id, producto_id, cantidad, unidad_id?, equivale?, observacion?}]
create or replace function public.fn_crear_requerimientos_almacenes(
  p_lineas jsonb, p_fecha_requerida date default null, p_observacion text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_alm uuid; v_id uuid; v_res jsonb := '[]'::jsonb;
begin
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  if (select count(distinct a.local_id) from almacen a
       where a.id in (select (l->>'almacen_id')::uuid from jsonb_array_elements(p_lineas) l)) <> 1 then
    raise exception 'Los productos deben ser de almacenes del mismo negocio';
  end if;
  for v_alm in select distinct (l->>'almacen_id')::uuid from jsonb_array_elements(p_lineas) l order by 1 loop
    v_id := fn_crear_requerimiento_almacen(v_alm,
              (select jsonb_agg(l - 'almacen_id') from jsonb_array_elements(p_lineas) l where (l->>'almacen_id')::uuid = v_alm),
              p_fecha_requerida, p_observacion);
    v_res := v_res || jsonb_build_array(v_id);
  end loop;
  return v_res;
end $$;
grant execute on function public.fn_crear_requerimientos_almacenes(jsonb, date, text) to authenticated;

notify pgrst, 'reload schema';
