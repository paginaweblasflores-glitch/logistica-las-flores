-- =============================================================================
-- 78 · Resumen de almacenes (Logística) calculado en la base
-- Antes la pantalla traía hasta 20 000 filas de stock y movimientos y sumaba en la app: con meses de datos
-- se volvía lenta y, pasado ese tope, los totales salían incompletos sin avisar. Ahora la base entrega
-- los totales ya sumados. Las fechas son días de Lima.
-- =============================================================================
create or replace function public.fn_resumen_almacenes(p_almacenes uuid[], p_desde date, p_hasta date)
returns jsonb
language sql stable security invoker set search_path = public as $$
with
  rango as (
    select (p_desde::timestamp at time zone 'America/Lima') as ini,
           ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ),
  st as (
    select * from v_stock where almacen_id = any(p_almacenes)
  ),
  -- cada línea de los movimientos del periodo que interesan, con su valor
  lin as (
    select m.tipo, m.almacen_id, ar.nombre as area, d.producto_id, p.nombre as producto, d.fifo_cumplido,
           d.cantidad * coalesce(d.costo_unitario, 0) as valor
    from movimiento m
    join movimiento_detalle d on d.movimiento_id = m.id
    join producto p on p.id = d.producto_id
    left join area ar on ar.id = m.area_id
    cross join rango r
    where m.almacen_id = any(p_almacenes) and not m.anulado
      and m.tipo in ('salida_consumo', 'merma', 'ajuste_negativo', 'devolucion_proveedor', 'entrada_compra')
      and m.fecha >= r.ini and m.fecha < r.fin
  ),
  bajo as (
    select producto_id, almacen_id, almacen_nombre, nombre, unidad, cantidad, stock_minimo, categoria, zona
    from st where stock_minimo > 0 and cantidad <= stock_minimo
  )
select jsonb_build_object(
  'por_almacen', coalesce((
    select jsonb_agg(jsonb_build_object(
             'almacen_id', a.id,
             'productos', (select count(*) from st where st.almacen_id = a.id and st.cantidad > 0),
             'valor', (select coalesce(sum(greatest(st.valor, 0)), 0) from st where st.almacen_id = a.id),
             'bajo', (select count(*) from bajo where bajo.almacen_id = a.id),
             'compras', (select coalesce(sum(valor), 0) from lin where lin.almacen_id = a.id and tipo = 'entrada_compra'),
             'consumo', (select coalesce(sum(valor), 0) from lin where lin.almacen_id = a.id and tipo = 'salida_consumo'),
             'mermas', (select coalesce(sum(valor), 0) from lin where lin.almacen_id = a.id and tipo in ('merma', 'ajuste_negativo'))))
    from unnest(p_almacenes) as a(id)), '[]'::jsonb),
  'por_area', coalesce((
    select jsonb_agg(x order by x.valor desc) from (
      select coalesce(area, 'Sin área') as area, sum(valor) as valor from lin where tipo = 'salida_consumo'
      group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
  'top_productos', coalesce((
    select jsonb_agg(x order by x.valor desc) from (
      select producto_id, producto, sum(valor) as valor from lin where tipo = 'salida_consumo'
      group by 1, 2 order by 3 desc limit 10) x), '[]'::jsonb),
  'fifo_total', (select count(*) from lin where fifo_cumplido is not null),
  'fifo_cumplidas', (select count(*) from lin where fifo_cumplido),
  'bajo_minimo', coalesce((select jsonb_agg(to_jsonb(b) order by b.cantidad / b.stock_minimo) from bajo b), '[]'::jsonb)
)
$$;
grant execute on function public.fn_resumen_almacenes(uuid[], date, date) to authenticated;
revoke execute on function public.fn_resumen_almacenes(uuid[], date, date) from anon;
