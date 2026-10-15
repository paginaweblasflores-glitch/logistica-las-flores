-- =============================================================================
--  58_area_almacen_3.sql
--  Área destino de las salidas: «Almacén» de Restaurante Las Flores pasa a llamarse «Almacén 3».
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.area set nombre = 'Almacén 3'
 where nombre = 'Almacén'
   and local_id = (select id from public.local where nombre = 'Restaurante Las Flores');

-- Verificación
select a.nombre, l.nombre negocio from public.area a left join public.local l on l.id = a.local_id
 where a.nombre ilike 'almac%' order by 2, 1;
