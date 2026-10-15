-- =============================================================================
--  38_categorias_solo_principales.sql
--  Categorías: solo las principales (Abarrotes, Bebidas, Limpieza…). Se quitan las subcategorías
--  («Abarrotes › Aceites», «Bebidas › Cervezas»…) que venían de los datos de ejemplo y ningún producto usa.
--  Por seguridad, si algún producto o proveedor tuviera una subcategoría, pasa a su categoría principal.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.producto p set categoria_id = c.padre_id
from public.categoria c where c.id = p.categoria_id and c.padre_id is not null;

update public.proveedor v set categoria_id = c.padre_id
from public.categoria c where c.id = v.categoria_id and c.padre_id is not null;

delete from public.categoria where padre_id is not null;

-- Verificación: las categorías que quedan y cuántos productos tiene cada una
select c.nombre, (select count(*) from public.producto p where p.categoria_id = c.id) productos
from public.categoria c order by c.nombre;
