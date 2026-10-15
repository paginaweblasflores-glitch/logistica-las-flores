-- =============================================================================
--  43_unidad_por_defecto.sql
--  Los productos que tenían la unidad «Por definir» pasan a «Unidad» y se quita «Por definir».
--  (Si alguno no es por unidad, el almacén lo cambia en la ficha del producto.)
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.producto set unidad_id = (select id from public.unidad_medida where codigo = 'UND'), updated_at = now()
where unidad_id = (select id from public.unidad_medida where codigo = 'SD');

delete from public.unidad_medida u
where u.codigo = 'SD' and not exists (select 1 from public.producto p where p.unidad_id = u.id);

-- Verificación: debe salir 0
select count(*) productos_por_definir from public.producto p join public.unidad_medida u on u.id = p.unidad_id where u.codigo = 'SD';
