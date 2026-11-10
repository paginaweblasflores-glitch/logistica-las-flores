-- =============================================================================
--  63_restaurar_codigos_por_almacen.sql
--  Corrige la limpieza (62): reinició también el contador del código de producto de cada almacén
--  (serie ALM-…), y al pasar un producto de un almacén a otro («Separar productos») el código nuevo
--  chocaba con uno existente («Ya existe un registro con esos datos»).
--  Vuelve a poner cada contador en el código más alto que ya tiene ese almacén.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

insert into public.correlativo (serie, ultimo)
select 'ALM-' || a.codigo, coalesce(max(pa.codigo), 0)
  from public.almacen a left join public.producto_almacen pa on pa.almacen_id = a.id
 group by a.codigo
on conflict (serie) do update set ultimo = greatest(public.correlativo.ultimo, excluded.ultimo);

-- Verificación: el contador de cada almacén = su código más alto
select a.nombre, c.ultimo as contador, (select max(codigo) from public.producto_almacen where almacen_id = a.id) as codigo_mas_alto
  from public.almacen a join public.correlativo c on c.serie = 'ALM-' || a.codigo
 order by a.nombre;
