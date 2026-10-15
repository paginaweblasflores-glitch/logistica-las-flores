-- =============================================================================
--  SISTEMA DE LOGÍSTICA — CORPORACIÓN LAS FLORES
--  04_limpiar_pruebas_y_preparar_reales.sql
--
--  1) BORRA todos los datos de PRUEBA (Parte B de 02_seed.sql): movimientos, stock,
--     lotes, compras, requerimientos, cotizaciones, traslados, conteos, descuentos,
--     roturas, viandas, documentos, auditoría y correlativos
--     (la numeración vuelve a empezar en 001).
--  2) Quita los valores INVENTADOS de los maestros: costos de referencia y
--     mínimos/máximos de los almacenes principales (se definirán con datos reales).
--  3) CONSERVA los maestros reales: empresas, negocios, almacenes, áreas, ciudades,
--     personal, usuario, roles, metas del MOF, unidades, categorías, productos,
--     reglas de viandas, stock par de bebidas, proveedores y agenda de funciones.
--  4) Agrega la foto de producto (campo + bucket "productos").
--
--  Ejecutar UNA vez en Supabase → SQL Editor. Es reejecutable.
-- =============================================================================

set search_path = public, extensions;

-- 1) Datos transaccionales de prueba -----------------------------------------------------
-- TRUNCATE no dispara los triggers de fila (inmutabilidad del Kardex, periodo cerrado,
-- auditoría), por eso se puede vaciar el ledger completo en una sola sentencia.
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
  documento, tarea_registro,
  periodo_cierre, correlativo, auditoria
restart identity;

-- 2) Valores inventados en maestros ------------------------------------------------------
update producto set costo_referencia = 0 where costo_referencia <> 0;

update producto_almacen pa set stock_minimo = 0, stock_maximo = null   -- sin máximo (0 marcaría todo como exceso)
from almacen a
where a.id = pa.almacen_id and a.codigo in ('ALM-LF', 'ALM-UM')
  and (pa.stock_minimo <> 0 or pa.stock_maximo is not null);

-- 3) Foto del producto ---------------------------------------------------------------------
alter table producto add column if not exists imagen_url text;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    -- Bucket público de solo lectura (las fotos son imágenes referenciales, sin datos sensibles)
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('productos', 'productos', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists "productos_leer" on storage.objects';
    execute $p$create policy "productos_leer" on storage.objects for select to authenticated
               using (bucket_id = 'productos')$p$;
    execute 'drop policy if exists "productos_escribir" on storage.objects';
    execute $p$create policy "productos_escribir" on storage.objects for insert to authenticated
               with check (bucket_id = 'productos' and (select public.fn_puede('maestros', 'escribir')))$p$;
    execute 'drop policy if exists "productos_actualizar" on storage.objects';
    execute $p$create policy "productos_actualizar" on storage.objects for update to authenticated
               using (bucket_id = 'productos' and (select public.fn_puede('maestros', 'escribir')))$p$;
    execute 'drop policy if exists "productos_eliminar" on storage.objects';
    execute $p$create policy "productos_eliminar" on storage.objects for delete to authenticated
               using (bucket_id = 'productos' and (select public.fn_puede('maestros', 'escribir')))$p$;
  end if;
end $$;

-- Vista de stock con la foto (columna agregada al final)
drop view if exists v_stock;
create view v_stock with (security_invoker = true) as
select s.producto_id, s.almacen_id, a.local_id, l.codigo as local_codigo, l.nombre as local_nombre,
       a.nombre as almacen_nombre, a.tipo as almacen_tipo,
       p.codigo, p.nombre, p.tipo as producto_tipo, c.nombre as categoria, u.codigo as unidad,
       s.cantidad, s.costo_promedio, s.valor, s.ultimo_movimiento,
       pa.stock_minimo, pa.stock_maximo, pa.stock_objetivo,
       case when s.cantidad <= 0 then 'agotado'
            when pa.stock_minimo > 0 and s.cantidad <= pa.stock_minimo then 'critico'
            when pa.stock_maximo is not null and s.cantidad > pa.stock_maximo then 'exceso'
            else 'normal' end as estado,
       p.imagen_url
from stock s
join producto p on p.id = s.producto_id
join almacen a on a.id = s.almacen_id
join local l on l.id = a.local_id
join unidad_medida u on u.id = p.unidad_id
left join categoria c on c.id = p.categoria_id
left join producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
where p.activo;

-- Verificación: todo lo transaccional en 0 y los maestros intactos
select 'movimientos' tabla, count(*) from movimiento union all
select 'stock', count(*) from stock union all
select 'compras', count(*) from compra union all
select 'conteos', count(*) from conteo union all
select 'productos (se conservan)', count(*) from producto union all
select 'proveedores (se conservan)', count(*) from proveedor union all
select 'personal (se conserva)', count(*) from personal union all
select 'almacenes (se conservan)', count(*) from almacen;
