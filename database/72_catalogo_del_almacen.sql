-- =============================================================================
--  72_catalogo_del_almacen.sql
--  El Excel del Catálogo descarga el catálogo del almacén elegido (antes: todos los productos con el código
--  general P-00123, sin categoría ni unidad). Una fila por producto y almacén, con su código en ese almacén,
--  y si ya tiene su stock inicial.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace view public.v_catalogo_almacen with (security_invoker = true) as
select pa.almacen_id, a.local_id, a.nombre as almacen,
       pa.codigo as codigo_almacen, p.id as producto_id, p.nombre, c.nombre as categoria, u.nombre as unidad,
       p.marca, p.costo_referencia, p.activo,
       case when exists (select 1 from public.stock s where s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id)
            then 'Listo' else 'Pendiente' end as stock_inicial
from public.producto_almacen pa
join public.producto p on p.id = pa.producto_id
join public.almacen a on a.id = pa.almacen_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id;

grant select on public.v_catalogo_almacen to authenticated;

-- Verificación: productos por almacén
select almacen, count(*) as productos, count(*) filter (where stock_inicial = 'Pendiente') as stock_inicial_pendiente
  from public.v_catalogo_almacen group by almacen order by almacen;
