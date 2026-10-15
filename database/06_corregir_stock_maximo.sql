-- =============================================================================
--  06_corregir_stock_maximo.sql
--  La limpieza (04) dejó el stock MÁXIMO en 0 en los almacenes principales; como
--  "máximo 0" significa "cualquier cantidad es exceso", casi todo aparecía en
--  estado "Exceso". Sin máximo definido, el campo debe quedar vacío (NULL).
--  Solo toca los parámetros de stock; no cambia cantidades ni movimientos.
--  Ejecutar una vez en Supabase → SQL Editor. Es reejecutable.
-- =============================================================================
update producto_almacen pa set stock_maximo = null
from almacen a
where a.id = pa.almacen_id and a.codigo in ('ALM-LF', 'ALM-UM') and pa.stock_maximo = 0;

-- Verificación: debe dar 0 productos en "exceso"
select estado, count(*) from v_stock group by estado order by 1;
