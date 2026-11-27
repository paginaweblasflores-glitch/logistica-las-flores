-- =============================================================================
-- 94 · Informe al Directorio: las compras del mes de una empresa (negocio), con todos sus almacenes
--
-- Una compra cuenta el día en que llegó al almacén (hora de Lima). El mes se va llenando día a día y se cierra
-- solo al terminar el último día. Devuelve, en un solo viaje, lo del resumen ejecutivo (PDF):
--   · total comprado, total del mes anterior, número de compras y de proveedores
--   · compras por almacén, por categoría, los 10 productos y los 5 proveedores con más gasto
--   · los últimos 6 meses (tendencia) y el valor del inventario de hoy
-- El detalle (anexo en Excel) se lee de v_ingreso_almacen.
-- =============================================================================

create or replace function public.fn_informe_directorio(p_local uuid, p_mes date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with lin as (
    select i.*, (i.fecha_ingreso at time zone 'America/Lima')::date as dia,
           coalesce(cp.nombre, ca.nombre, 'Sin categoría') as categoria
    from v_ingreso_almacen i
    left join producto p on p.id = i.producto_id
    left join categoria ca on ca.id = p.categoria_id
    left join categoria cp on cp.id = ca.padre_id
    where i.local_id = p_local
      and (i.fecha_ingreso at time zone 'America/Lima')::date >= (date_trunc('month', p_mes) - interval '5 months')::date
      and (i.fecha_ingreso at time zone 'America/Lima')::date < (date_trunc('month', p_mes) + interval '1 month')::date
  ),
  mes as (select * from lin where dia >= date_trunc('month', p_mes)::date)
  select jsonb_build_object(
    'total', coalesce((select sum(total) from mes), 0),
    'total_anterior', coalesce((select sum(total) from lin where dia >= (date_trunc('month', p_mes) - interval '1 month')::date
                                                       and dia < date_trunc('month', p_mes)::date), 0),
    'compras', (select count(distinct compra_id) from mes),
    'proveedores', (select count(distinct proveedor_id) from mes),
    'productos', (select count(distinct coalesce(producto_id::text, producto)) from mes),
    'por_almacen', coalesce((select jsonb_agg(x order by x.total desc) from (
        select almacen, sum(total) as total, count(distinct compra_id) as compras from mes group by almacen) x), '[]'),
    'por_categoria', coalesce((select jsonb_agg(x order by x.total desc) from (
        select categoria, sum(total) as total from mes group by categoria) x), '[]'),
    'top_productos', coalesce((select jsonb_agg(x order by x.total desc) from (
        select producto, unidad, sum(cantidad) as cantidad, sum(total) as total, count(*) as veces
        from mes group by producto, unidad order by sum(total) desc limit 10) x), '[]'),
    'top_proveedores', coalesce((select jsonb_agg(x order by x.total desc) from (
        select coalesce(proveedor, 'Sin proveedor') as proveedor, sum(total) as total, count(distinct compra_id) as compras
        from mes group by 1 order by sum(total) desc limit 5) x), '[]'),
    'meses', (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
                'total', coalesce((select sum(total) from lin where dia >= m::date and dia < (m + interval '1 month')::date), 0)) order by m)
              from generate_series(date_trunc('month', p_mes) - interval '5 months', date_trunc('month', p_mes), interval '1 month') m),
    'inventario_hoy', coalesce((select sum(valor) from v_stock where local_id = p_local), 0)
  )
$$;
grant execute on function public.fn_informe_directorio(uuid, date) to authenticated;

-- Verificación: el informe del mes actual de cada negocio
select l.codigo, (public.fn_informe_directorio(l.id, current_date) - 'meses' - 'por_categoria' - 'top_productos' - 'top_proveedores' - 'por_almacen') as resumen
from public.local l order by l.orden;
