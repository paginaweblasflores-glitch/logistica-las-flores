-- =============================================================================
--  23_inventario_en_cero.sql
--  El sistema empieza limpio: SOLO el catálogo de productos (de Las Flores y de Umaru, con su
--  almacén). Stock, Kardex y movimientos en CERO. Cada responsable registra lo que tiene hoy en
--  su almacén.
--  Se conservan: catálogo (productos, unidades, categorías, fotos, códigos), en qué almacén va
--  cada producto, proveedores, usuarios, áreas, aprobadores y configuración.
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
    documento, tarea_registro, periodo_cierre, auditoria
  restart identity;
  -- numeración de documentos desde 1; se conserva la de productos (PROD y códigos locales COD-…)
  delete from correlativo where serie <> 'PROD' and serie not like 'COD-%';
end $$;

-- Verificación: todo en cero, catálogo intacto
select (select count(*) from public.producto) as productos,
       (select count(*) from public.producto_almacen) as productos_por_almacen,
       (select count(*) from public.stock) as filas_stock,
       (select count(*) from public.movimiento) as movimientos;
