-- =============================================================================
--  62_inventario_en_cero_para_hernan.sql
--  Deja el sistema LIMPIO para empezar con datos reales: el Sr. Hernán moverá los productos del
--  Almacén 01 al Almacén 02 y cada almacén registrará lo que tiene.
--
--  SE BORRA (no se puede deshacer):
--   · Stock en CERO, lotes / vencimientos, Kardex y todas las entradas, salidas y traspasos.
--   · Requerimientos, cotizaciones, compras, transporte e historial de precios de las pruebas.
--   · Conteos físicos, descuentos, roturas, viandas, reportes de stock del día y auditoría.
--   · Los tipos de entrada/salida escritos en las pruebas («Prueba verificación»…).
--   · La numeración vuelve a empezar: E-00001, S-00001, TR-2026-0001, RA-…-0001, OC-…, SC-…
--
--  SE CONSERVA: productos (con su código, unidad, categoría, foto y «cuánto trae»), en qué almacén va
--  cada producto (con su código y stock mínimo/máximo), proveedores, usuarios, áreas, personal,
--  unidades, categorías, aprobadores y configuración.
--
--  Ejecutar UNA vez en Supabase → SQL Editor (proyecto de logística).
-- =============================================================================
set search_path = public, extensions;

do $$
begin
  truncate table
    lote_consumo, lote, movimiento_detalle, movimiento, stock,
    compra_detalle, compra, transporte, precio_historial,
    cotizacion_precio, cotizacion_oferta, cotizacion_item, cotizacion,
    requerimiento_detalle, requerimiento,
    traslado_detalle, traslado,
    conteo_detalle, conteo,
    descuento_detalle, descuento,
    rotura_responsable, rotura,
    venta_vianda_detalle, venta_vianda,
    reporte_stock_detalle, reporte_stock,
    documento, tarea_registro, periodo_cierre, auditoria
  restart identity;
  -- tipos de entrada/salida escritos a mano en las pruebas (ya no los usa ningún movimiento)
  delete from motivo where codigo like 'TIPO-%';
  -- numeración de documentos desde 1; se conserva la de productos (PROD y códigos por almacén COD-…)
  delete from correlativo where serie <> 'PROD' and serie not like 'COD-%';
end $$;

-- Verificación: todo en cero, catálogo intacto
select (select count(*) from public.producto)          as productos,
       (select count(*) from public.producto_almacen)  as productos_por_almacen,
       (select count(*) from public.stock)             as filas_stock,
       (select count(*) from public.movimiento)        as movimientos,
       (select count(*) from public.traslado)          as traspasos,
       (select count(*) from public.requerimiento)     as requerimientos,
       (select count(*) from public.compra)            as compras;
