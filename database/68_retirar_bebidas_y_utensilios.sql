-- =============================================================================
--  68_retirar_bebidas_y_utensilios.sql   (2026-11-18)
--  Se retiran los módulos «Bebidas oficinas» y «Utensilios y roturas» (pedido del usuario: por ahora
--  sobran; si los piden, se vuelven a implementar). Controles queda solo con Carnes (Producción).
--    · Las oficinas de bebidas (OF-01, OF-02 y Bebidas Hotel Umaru) se desactivan: dejan de aparecer
--      en selectores, stock y fichas. No se borran (si se reactiva el módulo, basta con activarlas).
--    · Se quita el parámetro «% de rotura que asume el colaborador».
--  Los datos de roturas y bebidas ya quedan en cero con limpiar_base_para_recarga.sql.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.almacen set activo = false where tipo = 'oficina' and activo;

delete from public.parametro where clave = 'pct_descuento_rotura';

-- Verificación: oficinas activas = 0; parámetro de roturas = 0
select (select count(*) from public.almacen where tipo = 'oficina' and activo) as oficinas_activas,
       (select count(*) from public.parametro where clave = 'pct_descuento_rotura') as parametro_rotura;
