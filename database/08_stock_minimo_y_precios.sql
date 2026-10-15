-- =============================================================================
--  08_stock_minimo_y_precios.sql
--
--  1) STOCK MÍNIMO = 10 por defecto en todos los productos, en el almacén principal de
--     cada negocio donde se usan (Almacén 01 Las Flores / Almacén 02 Umaru). Fernanda lo
--     cambia en la ficha de cada producto. Los productos nuevos también nacen con 10.
--     Cuando el stock llega al mínimo, aparece en la campanita y en el Panel principal.
--     (Solo se ponen los que hoy están en 0: no pisa mínimos que ya se hayan definido.)
--  2) PRECIOS REALES de 133 productos, tomados del último precio de compra del cuaderno
--     "ALMACEN F1 Y H2.xlsx" (ene–sep 2026), solo donde el producto se identificó con
--     seguridad (mismo nombre y mismo tamaño). Se actualiza el costo de referencia y se
--     valoriza el stock inicial con ese precio. Los demás los completa Fernanda.
--
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Stock mínimo por defecto ---------------------------------------------------------------
insert into public.parametro (clave, valor, descripcion)
values ('stock_minimo_defecto', 10, 'Stock mínimo con el que nace cada producto en el almacén principal de su negocio')
on conflict (clave) do nothing;

insert into public.producto_almacen (producto_id, almacen_id, stock_minimo)
select pl.producto_id, a.id, public.fn_param('stock_minimo_defecto', 10)
from public.producto_local pl
join public.almacen a on a.local_id = pl.local_id and a.es_principal
join public.producto p on p.id = pl.producto_id and p.activo and p.tipo not in ('carne')
on conflict (producto_id, almacen_id) do update
  set stock_minimo = excluded.stock_minimo
  where public.producto_almacen.stock_minimo = 0;

-- Productos que se marcan en un negocio nuevo: nacen con el mínimo por defecto
create or replace function public.fn_producto_local_minimo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select new.producto_id, a.id, fn_param('stock_minimo_defecto', 10)
  from almacen a join producto p on p.id = new.producto_id
  where a.local_id = new.local_id and a.es_principal and p.tipo <> 'carne'
  on conflict (producto_id, almacen_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_producto_local_minimo on public.producto_local;
create trigger trg_producto_local_minimo after insert on public.producto_local
  for each row execute function public.fn_producto_local_minimo();

-- 2) Precios reales del cuaderno de entradas ---------------------------------------------------
-- Todo en UN solo bloque: se aplica completo o nada (y la protección del Kardex nunca queda apagada)
do $$
begin
  create temporary table _precio (codigo text primary key, costo numeric, fecha date, origen text) on commit drop;
  insert into _precio values
  ('BEB-002', 6.07, date '2026-08-30', 'C CRISTAL'),
  ('BEB-003', 6.27, date '2026-07-20', 'CUSQUEÑA NEGRA'),
  ('BEB-004', 6.23, date '2026-07-20', 'CUSQUEÑA TRIGO'),
  ('BEB-005', 8.54, date '2026-09-17', 'DORCHER'),
  ('BEB-006', 1.2504, date '2026-09-05', 'INCA COLA'),
  ('BEB-007', 3.4, date '2026-09-19', 'INKA KOLA'),
  ('BEB-008', 5.243, date '2026-07-22', 'INCA COLA'),
  ('BEB-010', 1.2504, date '2026-09-05', 'COCA COLA'),
  ('BEB-011', 3.4, date '2026-09-24', 'COCA COLA'),
  ('BEB-012', 5.243, date '2026-07-22', 'COCA COLA'),
  ('BEB-014', 1.75, date '2026-07-05', 'POWERADE'),
  ('BEB-024', 63.65, date '2026-08-11', 'VINO FINCA ROTONDO ISABEL'),
  ('P-00002', 7.5, date '2026-08-20', 'ABRIDOR'),
  ('P-00003', 182.58, date '2026-08-18', 'ACEITE'),
  ('P-00004', 24.0, date '2026-01-08', 'ACEITE DE AJONJOLI'),
  ('P-00005', 58.0, date '2026-09-07', 'ACEITE DE OLIVA'),
  ('P-00019', 30.0, date '2026-01-06', 'ALCOHOL PURO UN GALON DE 5 L'),
  ('P-00028', 4.32, date '2026-05-21', 'ARROZ'),
  ('P-00029', 10.221, date '2026-09-07', 'AYUDIN LIQUIDO'),
  ('P-00033', 20.0, date '2026-06-20', 'BALDE CON REJILLA'),
  ('P-00046', 3.0, date '2026-08-17', 'BOLSA 12X16'),
  ('P-00047', 4.4, date '2026-09-22', 'BOLSA ASA'),
  ('P-00048', 7.92, date '2026-09-22', 'BOLSA CON ASA'),
  ('P-00051', 3.9, date '2026-07-13', 'BOLSA POLIPROPILENO'),
  ('P-00065', 0.17, date '2026-07-30', 'BOTELLA DE PERSONAL'),
  ('P-00070', 86.0, date '2026-05-20', 'CAFE RISO'),
  ('P-00071', 3.5, date '2026-04-13', 'GRAPAS'),
  ('P-00083', 4.1667, date '2026-08-31', 'CERVEZA CORONA'),
  ('P-00084', 5.5, date '2026-05-05', 'C CRISTAL'),
  ('P-00086', 3.61, date '2026-02-08', 'CERVEZA CUSQUEÑA NEGRA 630 ML'),
  ('P-00091', 8.54, date '2026-06-03', 'C DORCHER'),
  ('P-00093', 6.07, date '2026-08-31', 'CERVEZA PILSEN'),
  ('P-00100', 3.3333, date '2026-07-22', 'CHAMPIÑONES'),
  ('P-00109', 2.5, date '2026-09-13', 'CINTA EMBALAJE'),
  ('P-00110', 2.5, date '2026-01-06', 'CINTA MASSKING'),
  ('P-00117', 15.0, date '2026-01-05', 'COLADOR GUSANILLO'),
  ('P-00129', 3.333, date '2026-07-13', 'CORRECTOR CINTA'),
  ('P-00133', 16.5, date '2026-09-19', 'CREMA DE LECHE'),
  ('P-00154', 8.8435, date '2026-07-09', 'DETERGENTE LIQUIDO'),
  ('P-00155', 4.66, date '2026-06-17', 'DETERGENTE'),
  ('P-00157', 8.0, date '2026-01-05', 'DOSIFICADOR'),
  ('P-00162', 12.0, date '2026-06-26', 'ESCOBA'),
  ('P-00170', 0.583, date '2026-08-18', 'ESPONJA CON BRILLO'),
  ('P-00171', 0.58, date '2026-09-13', 'ESPONJA DE METAL'),
  ('P-00172', 0.5833, date '2026-08-03', 'ESPONJA DE VASO'),
  ('P-00175', 2.5, date '2026-02-12', 'FASTER'),
  ('P-00204', 2.3333, date '2026-08-14', 'GALLETA SODA'),
  ('P-00205', 1.35, date '2026-09-17', 'GALLETA VAINILLA'),
  ('P-00206', 13.0, date '2026-07-10', 'GALON DE AGUA ANGEL'),
  ('P-00210', 3.4, date '2026-09-24', 'COCA COLA'),
  ('P-00211', 5.243, date '2026-07-22', 'COCA COLA'),
  ('P-00212', 1.2504, date '2026-09-05', 'COCA COLA'),
  ('P-00213', 7.5, date '2026-09-19', 'FANTA'),
  ('P-00214', 2.5, date '2026-06-20', 'INKA KOLA GORDITA'),
  ('P-00215', 3.4, date '2026-09-19', 'INKA KOLA'),
  ('P-00216', 5.243, date '2026-07-22', 'INCA COLA'),
  ('P-00217', 1.2504, date '2026-09-05', 'INCA COLA'),
  ('P-00219', 4.2, date '2026-08-30', 'GELATINA SIN SABOR'),
  ('P-00227', 3.6, date '2026-06-17', 'HARINA DE PESCADO'),
  ('P-00230', 6.67, date '2026-08-09', 'HARINA PREPARADA'),
  ('P-00234', 11.6, date '2026-07-08', 'HOJA BOND'),
  ('P-00238', 8.88, date '2026-09-17', 'JABON LIQUIDO'),
  ('P-00241', 17.9, date '2026-03-19', 'JALADOR DE AGUA'),
  ('P-00244', 18.3, date '2026-06-13', 'KETCHUP SACHET'),
  ('P-00247', 0.26, date '2026-01-10', 'LAPICEROS AZUL'),
  ('P-00248', 0.23, date '2026-02-12', 'LAPICEROS ROJOS'),
  ('P-00249', 0.41, date '2026-04-26', 'LAPIZ'),
  ('P-00259', 4.75, date '2026-09-06', 'LECHE CONDENSADA'),
  ('P-00262', 2.01, date '2026-09-17', 'LEJIA'),
  ('P-00263', 3.577, date '2026-06-08', 'LENTEJA'),
  ('P-00274', 99.0, date '2026-04-15', 'LICOR DON SANTIAGO'),
  ('P-00303', 0.65, date '2026-01-11', 'MANTEQUILLA CON SAL BLISTER'),
  ('P-00305', 10.9, date '2026-06-15', 'Margarina Danesa'),
  ('P-00308', 5.0, date '2026-02-13', 'MATE ANIS'),
  ('P-00314', 44.86, date '2026-06-13', 'MAYONESA SACHET'),
  ('P-00317', 0.33, date '2026-01-11', 'MERMELADA DE FRESA BLISTER'),
  ('P-00318', 0.33, date '2026-01-11', 'MERMELADA DE NARANJA BLISTER'),
  ('P-00319', 0.33, date '2026-01-11', 'MERMELADA DE PIÑA BLISTER'),
  ('P-00320', 0.4, date '2026-01-11', 'MERMELADA DE SAUCO BLISTER'),
  ('P-00321', 25.0, date '2026-02-03', 'MOLINILLO'),
  ('P-00323', 18.3, date '2026-06-13', 'MOSTAZA SACHET'),
  ('P-00324', 5.14, date '2026-09-01', 'MOSTAZA'),
  ('P-00326', 40.0, date '2026-08-13', 'NUEZ MOSCADA'),
  ('P-00335', 4.0, date '2026-09-13', 'PALO DE ESCOBA'),
  ('P-00349', 5.0, date '2026-08-24', 'PAPEL DE ALUMINIO'),
  ('P-00356', 41.97, date '2026-05-20', 'PAPEL TOALLA ROLLO'),
  ('P-00362', 3.0, date '2026-01-05', 'PELADORA DE PAPA'),
  ('P-00364', 0.29, date '2026-05-09', 'PERCHEROS'),
  ('P-00368', 2.5, date '2026-06-16', 'PILA PEQUEÑA'),
  ('P-00372', 8.7, date '2026-01-05', 'PINZAS DE HIELO'),
  ('P-00375', 2.5, date '2026-09-09', 'PLATO DE CHAUFA'),
  ('P-00382', 3.1, date '2026-09-10', 'PUDIN DE CHOCOLATE'),
  ('P-00383', 2.9, date '2026-09-10', 'PUDIN VAINILLA'),
  ('P-00384', 68.833, date '2026-09-03', 'QUESO PARMESANO'),
  ('P-00390', 9.0, date '2026-06-20', 'RECOGEDOR'),
  ('P-00394', 5.0, date '2026-01-09', 'REJILLA DE FILTRO DRENAJE'),
  ('P-00396', 0.68, date '2026-01-14', 'REPELENTE'),
  ('P-00399', 11.5, date '2026-09-17', 'BOLSA ROLLO'),
  ('P-00400', 8.5, date '2026-04-02', 'BOLSA ROLLO'),
  ('P-00401', 8.5, date '2026-04-02', 'BOLSA ROLLO'),
  ('P-00403', 10.0, date '2026-01-14', 'ROLLO 5X10'),
  ('P-00404', 12.0, date '2026-05-03', 'BOLSA  ROLLO'),
  ('P-00407', 1.36, date '2026-03-26', 'SAL DE COCINA'),
  ('P-00411', 8.83, date '2026-09-08', 'SALSA DE OSTION'),
  ('P-00412', 9.166, date '2026-09-17', 'SALSA DE SOYA'),
  ('P-00416', 2.8, date '2026-05-09', 'SECADOR DE COLORES'),
  ('P-00420', 7.781, date '2026-09-19', 'SERVILLETA'),
  ('P-00421', 7.438, date '2026-05-09', 'SERVILLETA ECONOMICA'),
  ('P-00425', 5.15, date '2026-05-09', 'SILLAO'),
  ('P-00426', 8.0, date '2026-02-02', 'SOBRE FILTRANTE'),
  ('P-00432', 8.0, date '2026-02-07', 'MATA CUCARACHA SPRAY'),
  ('P-00433', 8.71, date '2026-04-27', 'MATA ACAROS SPRAY'),
  ('P-00434', 7.41, date '2026-05-20', 'SPRAY MATA MOSCA'),
  ('P-00440', 3.0, date '2026-07-24', 'TAJADOR'),
  ('P-00443', 14.5, date '2026-07-30', 'TAPER DE PUCA'),
  ('P-00444', 11.5, date '2026-07-30', 'TAPER DE ENSALADA'),
  ('P-00446', 18.0, date '2026-01-06', 'TAPER PARA CONSERVAR'),
  ('P-00447', 8.0, date '2026-08-01', 'TAPER DE QAPCHI'),
  ('P-00449', 4.5, date '2026-07-28', 'FILTRO TE PURO'),
  ('P-00461', 8.0, date '2026-07-08', 'MOPA DE TRAPEADOR'),
  ('P-00463', 25.0, date '2026-01-06', 'TRINCHE METAL'),
  ('P-00465', 4.3, date '2026-08-17', 'VASO ACRILICO 3 OZ'),
  ('P-00470', 1.6, date '2026-05-14', 'VASO DESECHABLE'),
  ('P-00472', 2.75, date '2026-09-09', 'VASO DESECHABLE'),
  ('P-00483', 8.166, date '2026-08-24', 'VINAGRE DE MANZANA'),
  ('P-00484', 3.99, date '2026-07-20', 'VINAGRE TINTO'),
  ('P-00485', 5.0, date '2026-02-12', 'VINIFAN'),
  ('P-00488', 29.91, date '2026-08-01', 'VINO CARDOS ARGENTINO'),
  ('P-00495', 48.0, date '2026-07-03', 'VINO SANGRE  TORO'),
  ('P-00499', 29.3, date '2026-02-02', 'VINO TABERNERO BORGOÑA 2 LT'),
  ('P-00507', 26.3, date '2026-08-04', 'VINO VITTORIA MALBEC'),
  ('P-00508', 26.3, date '2026-06-17', 'VINO VITTORIA RESERVA'),
  ('UTL-006', 19.0, date '2026-01-09', 'VASO DE CAFÉ');

  -- 2a. Costo de referencia (solo donde aún no hay costo)
  update public.producto p set costo_referencia = x.costo
  from _precio x where x.codigo = p.codigo and p.costo_referencia = 0;

  -- 2b. Valorizar el stock inicial con ese costo (se corrige solo el costo del stock inicial,
  --     que se cargó sin precio; el resto del Kardex sigue inmutable)
  alter table public.movimiento_detalle disable trigger trg_movdet_inmutable;
  update public.movimiento_detalle d set costo_unitario = p.costo_referencia
  from public.movimiento m, public.producto p, _precio x
  where m.id = d.movimiento_id and m.tipo = 'stock_inicial' and not m.anulado
    and p.id = d.producto_id and x.codigo = p.codigo and coalesce(d.costo_unitario, 0) = 0;
  alter table public.movimiento_detalle enable trigger trg_movdet_inmutable;

  update public.lote l set costo_unitario = p.costo_referencia
  from public.producto p, _precio x, public.movimiento m
  where p.id = l.producto_id and x.codigo = p.codigo and l.costo_unitario = 0
    and m.id = l.movimiento_id and m.tipo = 'stock_inicial';

  update public.stock s set costo_promedio = p.costo_referencia
  from public.producto p, _precio x
  where p.id = s.producto_id and x.codigo = p.codigo and s.costo_promedio = 0;

  drop table _precio;
end $$;

-- Verificación
select (select count(*) from public.producto where costo_referencia > 0) as productos_con_precio,
       (select count(*) from public.producto_almacen where stock_minimo > 0) as productos_con_minimo,
       (select round(sum(valor), 2) from public.stock) as valor_stock_soles,
       (select count(*) from public.v_stock where estado in ('critico','agotado') and stock_minimo > 0) as alertas;
