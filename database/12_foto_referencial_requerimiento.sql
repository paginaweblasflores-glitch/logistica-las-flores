-- =============================================================================
--  12_foto_referencial_requerimiento.sql
--  Foto referencial opcional en cada producto del requerimiento (como la columna
--  "IMAGEN REFERENCIAL" del formato de Logística). Se guarda reducida (máx. 480 px)
--  y se imprime en la solicitud.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
alter table public.requerimiento_detalle add column if not exists imagen text;   -- data URL JPEG

-- Verificación
select count(*) as productos_con_foto from public.requerimiento_detalle where imagen is not null;
