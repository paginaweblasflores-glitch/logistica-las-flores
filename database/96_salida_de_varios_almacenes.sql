-- =============================================================================
-- 96 · Salida a un área con productos de VARIOS almacenes del negocio (un solo formulario, un solo ticket)
--
-- Con «Todos» elegido arriba, el almacenero busca en todos sus almacenes (Las Flores 01/02/03, Umaru 01/02),
-- elige de qué almacén sale cada producto y registra una vez. El sistema crea UNA salida en cada almacén
-- (con su propio número S-…), todas juntas o ninguna (si falta stock de algo, no se registra nada).
-- movimiento.grupo_id une esas salidas: el ticket para firmar es uno solo con todos los productos.
-- =============================================================================

alter table public.movimiento add column if not exists grupo_id uuid;
create index if not exists ix_movimiento_grupo on public.movimiento(grupo_id) where grupo_id is not null;

-- 1) el buscador en varios almacenes: una fila por producto Y almacén (con su código y su stock en ese almacén)
create or replace function public.fn_buscar_productos_almacenes(p_texto text, p_almacenes uuid[], p_limite int default 40)
returns table(id uuid, codigo text, nombre text, tipo text, costo_referencia numeric, controla_lote boolean,
              unidad text, stock numeric, unidad_id uuid, contenido numeric, contenido_unidad_id uuid, contenido_unidad text,
              imagen_url text, presentacion_id uuid, presentacion_cantidad numeric, presentacion text,
              almacen_id uuid, almacen text)
language sql stable security invoker set search_path = public as $$
  with q as (select fn_normalizar(coalesce(p_texto, '')) as t, array_remove(string_to_array(fn_normalizar(coalesce(p_texto, '')), ' '), '') as palabras)
  select p.id, pa.codigo::text, p.nombre, p.tipo, p.costo_referencia, p.controla_lote, u.codigo,
         coalesce(s.cantidad, 0), p.unidad_id, p.contenido, p.contenido_unidad_id,
         (select cu.codigo from unidad_medida cu where cu.id = p.contenido_unidad_id),
         p.imagen_url, p.presentacion_id, p.presentacion_cantidad, (select pu.nombre from unidad_medida pu where pu.id = p.presentacion_id),
         a.id, regexp_replace(a.nombre, '\s*—.*$', '')
  from producto_almacen pa
  join producto p on p.id = pa.producto_id and p.activo
  join almacen a on a.id = pa.almacen_id
  join unidad_medida u on u.id = p.unidad_id
  left join stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id
  cross join q
  where pa.almacen_id = any(p_almacenes)
    and (q.t = '' or (q.t ~ '^\d+$' and pa.codigo = q.t::bigint)
         or not exists (select 1 from unnest(q.palabras) w where position(w in p.nombre_busqueda) = 0))
  -- primero lo que empieza igual; de un mismo producto, primero el almacén con más stock
  order by (left(p.nombre_busqueda, length(q.t)) = q.t) desc, p.nombre, coalesce(s.cantidad, 0) desc
  limit p_limite
$$;
grant execute on function public.fn_buscar_productos_almacenes(text, uuid[], int) to authenticated;

-- 2) registrar: una salida por almacén (todas o ninguna) y el grupo que las une
-- p_lineas: [{almacen_id, producto_id, cantidad, observacion?}]
create or replace function public.fn_salida_varios_almacenes(
  p_lineas jsonb, p_fecha timestamptz default now(), p_area text default null, p_recibe text default null, p_observacion text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_grupo uuid := gen_random_uuid(); v_alm uuid; r jsonb; v_res jsonb := '[]'::jsonb; v_local uuid;
begin
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'Agregue al menos un producto con cantidad mayor a cero'; end if;
  -- todos los almacenes deben ser del mismo negocio
  if (select count(distinct a.local_id) from almacen a
       where a.id in (select (l->>'almacen_id')::uuid from jsonb_array_elements(p_lineas) l)) <> 1 then
    raise exception 'Los productos deben ser de almacenes del mismo negocio';
  end if;
  for v_alm in select distinct (l->>'almacen_id')::uuid from jsonb_array_elements(p_lineas) l order by 1 loop
    -- la misma salida de siempre (valida permisos, stock y FEFO en cada almacén)
    r := fn_registrar_entrada_salida('salida_consumo', v_alm,
           (select jsonb_agg(l - 'almacen_id') from jsonb_array_elements(p_lineas) l where (l->>'almacen_id')::uuid = v_alm),
           p_fecha, p_area, p_recibe, p_observacion, null, null);
    update movimiento set grupo_id = v_grupo where id = (r->>'id')::uuid;
    v_res := v_res || jsonb_build_array(r || jsonb_build_object('almacen_id', v_alm));
  end loop;
  return jsonb_build_object('grupo', v_grupo, 'salidas', v_res);
end $$;
grant execute on function public.fn_salida_varios_almacenes(jsonb, timestamptz, text, text, text) to authenticated;

notify pgrst, 'reload schema';
