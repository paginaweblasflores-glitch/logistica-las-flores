-- =============================================================================
--  limpiar_base_para_recarga.sql   (2026-11-18)
--  DEJA LA BASE LIMPIA para volver a cargar los productos, ya separados por almacén.
--  ⚠ BORRA DE VERDAD y NO SE PUEDE DESHACER. Ejecutar una sola vez en Supabase → SQL Editor.
--     (si quiere un respaldo, primero: Supabase → Database → Backups, o exporte las tablas)
--
--  SE BORRA TODO:
--    · Productos del almacén: catálogo, códigos por almacén y por negocio, fotos enlazadas, stock y lotes.
--    · Movimientos: entradas, salidas, traspasos, kardex, ajustes y stock del día.
--    · Compras: requerimientos, cotizaciones, órdenes de compra, transporte y trazabilidad de precios.
--    · Controles: conteos, descuentos, roturas, viandas (módulo antiguo), documentos y registro de tareas.
--    · Producción: sus ingresos, salidas, ventas del día, conteos, marcas del diagrama, reportes enviados
--      y sus proveedores (incluidos los datos de prueba «PRUEBA CLAUDE»).
--    · Proveedores, sus contactos, categorías, ciudades/orígenes, personal y cierres de periodo.
--    · La numeración vuelve a empezar desde 1 (documentos y códigos de productos).
--
--  SE CONSERVA (sin esto no se puede entrar ni trabajar):
--    · Usuarios y contraseñas, roles y permisos.
--    · Empresa, negocios (Las Flores / Umaru), almacenes, oficinas y áreas.
--    · Unidades de medida, tipos de entrada/salida, metas y parámetros, aprobadores de requerimientos, tareas del MOF.
--    · Producción: su catálogo (carnes, papas…), los platos de la hojita y las funciones del diagrama.
--
--  Usa TRUNCATE: es rápido y no dispara las reglas de «no borrar» (las de la migración 67).
-- =============================================================================

do $$
begin
  -- 1) Todo lo operativo, los productos y los maestros que se vuelven a cargar (un solo TRUNCATE:
  --    así las tablas que se apuntan entre sí se vacían juntas)
  truncate table
    -- inventario
    lote_consumo, lote, movimiento_detalle, movimiento, stock,
    reporte_stock_detalle, reporte_stock,
    traslado_detalle, traslado,
    -- compras
    transporte, precio_historial,
    compra_detalle, compra,
    cotizacion_precio, cotizacion_oferta, cotizacion_item, cotizacion,
    requerimiento_detalle, requerimiento,
    -- controles
    conteo_detalle, conteo,
    descuento_detalle, descuento,
    rotura_responsable, rotura,
    venta_vianda_detalle, venta_vianda, vianda_conversion, vianda_item,
    documento, tarea_registro, periodo_cierre, auditoria,
    -- productos del almacén
    producto_almacen, producto_local, producto,
    -- maestros que se vuelven a cargar
    proveedor_contacto, proveedor, categoria, ciudad,
    -- Producción: solo lo registrado (su catálogo y configuración se conservan)
    prod_movimiento, prod_conteo, prod_venta_detalle, prod_venta, prod_funcion_marca, prod_reporte, prod_proveedor
  restart identity;

  -- 2) Personal: los usuarios lo pueden tener enlazado; se suelta el enlace y luego se borra
  update usuario set personal_id = null where personal_id is not null;
  delete from personal;

  -- 3) Tipos de entrada/salida escritos a mano en las pruebas
  delete from motivo where codigo like 'TIPO-%';

  -- 4) Numeración desde 1: documentos (E-, S-, OC-, RA-…) y códigos de productos (PROD, COD-…, ALM-…)
  delete from correlativo;
end $$;

-- Verificación: todo en 0, y lo que se conserva con sus filas
select 'SE BORRÓ' as grupo, 'productos' as tabla, count(*) as filas from producto
union all select 'SE BORRÓ', 'stock', count(*) from stock
union all select 'SE BORRÓ', 'movimientos', count(*) from movimiento
union all select 'SE BORRÓ', 'compras', count(*) from compra
union all select 'SE BORRÓ', 'requerimientos', count(*) from requerimiento
union all select 'SE BORRÓ', 'cotizaciones', count(*) from cotizacion
union all select 'SE BORRÓ', 'conteos', count(*) from conteo
union all select 'SE BORRÓ', 'proveedores', count(*) from proveedor
union all select 'SE BORRÓ', 'categorías', count(*) from categoria
union all select 'SE BORRÓ', 'personal', count(*) from personal
union all select 'SE BORRÓ', 'movimientos de Producción', count(*) from prod_movimiento
union all select 'SE BORRÓ', 'numeración', count(*) from correlativo
union all select 'SE CONSERVA', 'usuarios', count(*) from usuario
union all select 'SE CONSERVA', 'negocios', count(*) from local
union all select 'SE CONSERVA', 'almacenes', count(*) from almacen
union all select 'SE CONSERVA', 'áreas', count(*) from area
union all select 'SE CONSERVA', 'unidades', count(*) from unidad_medida
union all select 'SE CONSERVA', 'catálogo de Producción', count(*) from prod_producto;
