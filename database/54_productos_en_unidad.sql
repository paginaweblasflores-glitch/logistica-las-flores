-- =============================================================================
--  54_productos_en_unidad.sql
--  «Unidad» es la unidad estándar: por ahora TODOS los productos pasan a Unidad (Botella, Lata, Galón, Rollo
--  y también Kilo). Las cantidades, lotes y precios no cambian (5 kilos pasan a ser 5 unidades).
--  Luego el almacén puede cambiar la unidad de cada producto en su ficha.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.producto p set unidad_id = (select id from public.unidad_medida where codigo = 'UND')
  from public.unidad_medida u
 where u.id = p.unidad_id and u.codigo <> 'UND';

-- Verificación: cuántos productos quedan en cada unidad
select u.nombre unidad, count(*) productos
  from public.producto p join public.unidad_medida u on u.id = p.unidad_id
 group by u.nombre order by 2 desc;
