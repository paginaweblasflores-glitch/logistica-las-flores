-- =============================================================================
--  70_quitar_separar_productos.sql
--  «Separar productos entre Almacén 01 y 02» ya no se usa: desde la carga 69 cada producto nació en su
--  almacén (2026-11-18). Se quita la pantalla del sistema y su función en la base.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

drop function if exists public.fn_mover_productos_almacen(uuid[], uuid, uuid);

-- Verificación: debe salir 0
select count(*) as funcion_separar from pg_proc where proname = 'fn_mover_productos_almacen';
