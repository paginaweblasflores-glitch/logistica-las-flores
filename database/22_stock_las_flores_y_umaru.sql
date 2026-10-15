-- =============================================================================
--  22_stock_las_flores_y_umaru.sql
--  Aclaración de Fernanda (reunión 05/10/2026) sobre los Excel de Tumisoft:
--    · "ALMACEN 01" = RESTAURANTE LAS FLORES (trae mezclados su Almacén 1 y 2): todo su stock
--      va al Almacén 01; el Almacén 02 — Cocina queda en 0 y el responsable separa con traspasos.
--    · "ALMACEN 02" = HOTEL UMARU: su stock va al Almacén Hotel Umaru.
--  · El CATÁLOGO se conserva (nombres, unidades, categorías, fotos y cambios ya hechos).
--    Los mismos productos pasan a usarse también en Umaru (catálogo principal compartido;
--    Umaru recibe su propia numeración 1, 2, 3…).
--  · Se reinician los movimientos (stock inicial mal repartido y cualquier prueba).
--  · Productos que usan los dos negocios: los puede editar cualquiera de los dos responsables;
--    dar de baja / eliminar solo lo quita de SU negocio, sin afectar al otro.
--  Ejecutar UNA vez en Supabase → SQL Editor (proyecto de logística). Todo o nada.
-- =============================================================================
set search_path = public, extensions;

-- 1) Reglas de edición del catálogo compartido ----------------------------------------------------
-- El producto lo usa alguno de mis negocios → lo puedo editar (los datos son del catálogo principal)
create or replace function public.fn_producto_es_mio(p_producto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from producto_local pl
                 where pl.producto_id = p_producto and array[pl.local_id] <@ fn_mis_locales())
      or not exists (select 1 from producto_local pl where pl.producto_id = p_producto)   -- recién creado
$$;

-- ¿Lo usa también otro negocio?
create or replace function public.fn_producto_compartido(p_producto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from producto_local pl
                 where pl.producto_id = p_producto and not (array[pl.local_id] <@ fn_mis_locales()))
$$;

-- Eliminar: solo si nadie más lo usa y nunca tuvo movimientos
create or replace function public.fn_eliminar_producto(p_producto uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('catalogo', 'escribir') or not fn_producto_es_mio(p_producto) then
    raise exception 'No autorizado: el producto lo administra el almacén de su negocio';
  end if;
  if fn_producto_compartido(p_producto) then
    raise exception 'Este producto también lo usa el otro negocio: use «Quitar de mi catálogo»';
  end if;
  if fn_producto_tiene_historial(p_producto) then
    raise exception 'El producto ya tiene movimientos: no se elimina, se da de baja (así se conserva su kardex)';
  end if;
  delete from producto_almacen where producto_id = p_producto;
  delete from stock where producto_id = p_producto;
  delete from producto_local where producto_id = p_producto;
  delete from producto where id = p_producto;
end $$;

-- Dar de baja: si lo usa también el otro negocio, solo se quita de MI negocio; si no, queda inactivo
create or replace function public.fn_baja_producto(p_producto uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('catalogo', 'escribir') or not fn_producto_es_mio(p_producto) then
    raise exception 'No autorizado: el producto lo administra el almacén de su negocio';
  end if;
  if not p_activo and exists (select 1 from stock s join almacen a on a.id = s.almacen_id
                              where s.producto_id = p_producto and s.cantidad <> 0 and array[a.local_id] <@ fn_mis_locales()) then
    raise exception 'Todavía tiene stock en su almacén: primero regístrelo como salida, ajuste o traspaso hasta dejarlo en 0';
  end if;
  if not p_activo and fn_producto_compartido(p_producto) then
    delete from producto_almacen pa using almacen a
     where pa.producto_id = p_producto and a.id = pa.almacen_id and array[a.local_id] <@ fn_mis_locales();
    delete from producto_local where producto_id = p_producto and array[local_id] <@ fn_mis_locales();
    return;
  end if;
  update producto set activo = p_activo, updated_at = now() where id = p_producto;
end $$;

-- 2) Stock real de cada negocio ------------------------------------------------------------------------
do $$
declare
  v_lf uuid; v_um uuid; v_a1 uuid; v_a2 uuid; v_aum uuid;
  v_l1 jsonb; v_lum jsonb;
  v_fecha timestamptz := timestamptz '2026-10-05 07:00:00-05';
begin
  select id into v_lf from local where codigo = 'LF';
  select id into v_um from local where codigo = 'UM';
  select id into v_a1 from almacen where codigo = 'ALM-LF';
  select id into v_a2 from almacen where codigo = 'ALM2-LF';
  select id into v_aum from almacen where codigo = 'ALM-UM';

  -- movimientos y documentos (el catálogo NO se toca)
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

  create temporary table _st (codigo text primary key, lf numeric, um numeric) on commit drop;
  insert into _st values
    ('P-00001', 25, 19),
    ('P-00002', 0, 9),
    ('P-00003', 679, 54),
    ('P-00004', 71, 5),
    ('P-00005', 0, 2),
    ('P-00006', 6, 2),
    ('P-00007', 16, 9),
    ('P-00008', 12, 3),
    ('P-00009', 0, 3),
    ('P-00010', 2, 0),
    ('P-00011', 2, 1),
    ('P-00012', 43, 4),
    ('P-00013', 0, 8),
    ('P-00014', 3, 1),
    ('P-00015', 0, 1),
    ('P-00016', 0, 9),
    ('P-00017', 1, 4),
    ('P-00018', 0, 2),
    ('P-00019', 200, 385),
    ('P-00020', 18, 12),
    ('P-00021', 1260, 100),
    ('P-00022', 990, 29),
    ('P-00023', 51, 19),
    ('P-00024', 0, 12),
    ('P-00025', 30, 2),
    ('P-00026', 5, 2),
    ('P-00027', 34, 11),
    ('P-00028', 0, 10),
    ('P-00029', 2, 10),
    ('P-00030', 2, 30),
    ('P-00031', 6, 19),
    ('P-00032', 0, 5),
    ('P-00033', 11, 11),
    ('P-00034', 144, 47),
    ('P-00035', 1, 8),
    ('P-00036', 0, 1),
    ('P-00037', 0, 21),
    ('P-00038', 41, 12),
    ('P-00039', 89, 25),
    ('P-00040', 82, 19),
    ('P-00041', 208, 29),
    ('P-00042', 0, 14),
    ('P-00043', 0, 15),
    ('P-00044', 93, 16),
    ('P-00045', 0, 1),
    ('P-00046', 0, 0),
    ('P-00047', 0, 0.45),
    ('P-00048', 0, 0.2),
    ('P-00049', 0, 0.25),
    ('P-00050', 2, 0),
    ('P-00051', 0, 2),
    ('P-00052', 0, 100),
    ('P-00053', 150, 45),
    ('P-00054', 300, 85),
    ('P-00055', 250, 134),
    ('P-00056', 0, 0.2),
    ('P-00057', 0, 22),
    ('P-00058', 0, 2),
    ('P-00059', 0, 0.25),
    ('P-00060', 14, 32),
    ('P-00061', 33, 24),
    ('P-00062', 8, 10),
    ('P-00063', 19, 10),
    ('P-00064', 27, 7),
    ('P-00065', 25, 0),
    ('P-00066', 0, 0.85),
    ('P-00067', 17, 4),
    ('P-00068', 71, 0),
    ('P-00069', 10, 0),
    ('P-00070', 3, 0),
    ('P-00071', 0, 2),
    ('P-00072', 0, 2),
    ('P-00073', 0, 0),
    ('P-00074', 0, 100),
    ('P-00075', 0, 0),
    ('P-00076', 0, 400),
    ('P-00077', 0, 2),
    ('P-00078', 9, 0),
    ('P-00079', 0, 0),
    ('P-00080', 0, 1.8),
    ('P-00081', 9, 8),
    ('P-00082', 0, 4),
    ('P-00083', 0, 2),
    ('P-00084', 0, 0.9),
    ('P-00085', 5, 8),
    ('P-00086', 0, 0),
    ('P-00087', 0, 0),
    ('P-00088', 200, 0),
    ('P-00089', 150, 0),
    ('P-00090', 200, 500),
    ('P-00091', 300, 15),
    ('P-00092', 3, 0),
    ('P-00093', 3, 17),
    ('P-00094', 0, 0),
    ('P-00095', 20, 0),
    ('P-00096', 5, 20),
    ('P-00097', 2000, 0),
    ('P-00098', 2600, 1010),
    ('P-00099', 61, 13),
    ('P-00100', 85, 200),
    ('P-00101', 0, 0),
    ('P-00102', 22, 17),
    ('P-00103', 4, 4),
    ('P-00104', 29, 8),
    ('P-00105', 0, 21),
    ('P-00106', 22, 7),
    ('P-00107', 1, 1),
    ('P-00108', 0, 1),
    ('P-00109', 3, 0),
    ('P-00110', 3, 0),
    ('P-00111', 1, 0),
    ('P-00112', 9, 3),
    ('P-00113', 3, 0),
    ('P-00114', 15, 0),
    ('P-00115', 3, 0),
    ('P-00116', 3, 0),
    ('P-00117', 4, 0),
    ('P-00118', 0, 0),
    ('P-00119', 2, 0),
    ('P-00120', 4, 16),
    ('P-00121', 5, 1),
    ('P-00122', 50, 0),
    ('P-00123', 72, 0),
    ('P-00124', 5, 7),
    ('P-00125', 9, 3),
    ('P-00126', 15, 23),
    ('P-00127', 31, 2),
    ('P-00128', 0, 65.3),
    ('P-00129', 0, 0),
    ('P-00130', 51, 5),
    ('P-00131', 4, 2),
    ('P-00132', 30, 35),
    ('P-00133', 3, 1),
    ('P-00134', 70, 1),
    ('P-00135', 4, 4),
    ('P-00136', 12, 31),
    ('P-00137', 3, 5),
    ('P-00138', 43, 0),
    ('P-00139', 5, 0),
    ('P-00140', 13, 7),
    ('P-00141', 3, 1),
    ('P-00142', 6, 3),
    ('P-00143', 12, 1),
    ('P-00144', 0, 4),
    ('P-00145', 0, 2),
    ('P-00146', 0, 100),
    ('P-00147', 0, 1),
    ('P-00148', 0, 5),
    ('P-00149', 0, 5),
    ('P-00150', 530, 0),
    ('P-00151', 1410, 11),
    ('P-00152', 300, 0),
    ('P-00153', 0, 1),
    ('P-00154', 0, 0),
    ('P-00155', 2, 3),
    ('P-00156', 4, 12),
    ('P-00157', 19, 6),
    ('P-00158', 7, 5),
    ('P-00159', 2, 6),
    ('P-00160', 0, 4),
    ('P-00161', 44, 0),
    ('P-00162', 8, 200),
    ('P-00163', 3, 0),
    ('P-00164', 0, 15),
    ('P-00165', 8, 12),
    ('P-00166', 10, 0),
    ('P-00167', 4, 0),
    ('P-00168', 0, 80),
    ('P-00169', 0, 0.65),
    ('P-00170', 2, 1),
    ('P-00171', 0, 24),
    ('P-00172', 0, 0),
    ('P-00173', 2, 2),
    ('P-00174', 0, 9),
    ('P-00175', 0, 6),
    ('P-00176', 0, 60),
    ('P-00177', 12, 2),
    ('P-00178', 52, 7),
    ('P-00179', 11, 1),
    ('P-00180', 12, 2),
    ('P-00181', 40, 291),
    ('P-00182', 4, 16),
    ('P-00183', 76, 10),
    ('P-00184', 542, 27),
    ('P-00185', 7, 1),
    ('P-00186', 8, 2),
    ('P-00187', 51, 3),
    ('P-00188', 4, 12),
    ('P-00189', 18, 7),
    ('P-00190', 11, 7),
    ('P-00191', 0, 2),
    ('P-00192', 3, 0),
    ('P-00193', 7, 5),
    ('P-00194', 3, 2),
    ('P-00195', 0, 4),
    ('P-00196', 6, 4),
    ('P-00197', 20, 5),
    ('P-00198', 12, 2),
    ('P-00199', 10, 0),
    ('P-00200', 0, 5),
    ('P-00201', 12, 6),
    ('P-00202', 0, 6),
    ('P-00203', 30, 0),
    ('P-00204', 3, 0),
    ('P-00205', 50, 12),
    ('P-00206', 0, 0),
    ('P-00207', 8, 2),
    ('P-00208', 0, 0),
    ('P-00209', 400, 0),
    ('P-00210', 12, 0),
    ('P-00211', 4, 0),
    ('P-00212', 10, 0),
    ('P-00213', 2, 3),
    ('P-00214', 9, 1),
    ('P-00215', 1, 0),
    ('P-00216', 2, 0),
    ('P-00217', 2, 0),
    ('P-00218', 1, 0),
    ('P-00219', 16, 0),
    ('P-00220', 2, 2),
    ('P-00221', 4, 16),
    ('P-00222', 7, 7),
    ('P-00223', 23, 0),
    ('P-00224', 12, 0),
    ('P-00225', 1, 0),
    ('P-00226', 6, 0),
    ('P-00227', 7, 0),
    ('P-00228', 4, 0),
    ('P-00229', 18, 0),
    ('P-00230', 3, 3),
    ('P-00231', 11, 5),
    ('P-00232', 30, 3),
    ('P-00233', 13.5, 0),
    ('P-00234', 20, 0),
    ('P-00235', 3, 0),
    ('P-00236', 8.5, 0),
    ('P-00237', 10, 0),
    ('P-00238', 0, 0),
    ('P-00239', 16, 23),
    ('P-00240', 4500, 2115),
    ('P-00241', 0, 0),
    ('P-00242', 1, 0),
    ('P-00243', 1, 0),
    ('P-00244', 3, 1),
    ('P-00245', 3, 0),
    ('P-00246', 12, 0),
    ('P-00247', 6, 0),
    ('P-00248', 2, 0),
    ('P-00249', 3, 1),
    ('P-00250', 23, 11),
    ('P-00251', 0, 0),
    ('P-00252', 22, 9),
    ('P-00253', 7, 0),
    ('P-00254', 63, 0),
    ('P-00255', 17, 0),
    ('P-00256', 7, 6),
    ('P-00257', 5, 0),
    ('P-00258', 2, 0),
    ('P-00259', 4, 5),
    ('P-00260', 0, 6),
    ('P-00261', 2, 0),
    ('P-00262', 37, 0),
    ('P-00263', 10, 0),
    ('P-00264', 11, 2),
    ('P-00265', 0, 2),
    ('P-00266', 14, 0),
    ('P-00267', 4, 6),
    ('P-00268', 11, 2),
    ('P-00269', 1, 4),
    ('P-00270', 16, 4),
    ('P-00271', 21, 0),
    ('P-00272', 8, 0),
    ('P-00273', 100, 0),
    ('P-00274', 18, 0),
    ('P-00275', 68, 0),
    ('P-00276', 14, 0),
    ('P-00277', 10, 0),
    ('P-00278', 10, 8),
    ('P-00279', 5, 6),
    ('P-00280', 6, 6),
    ('P-00281', 9, 0),
    ('P-00282', 3, 4),
    ('P-00283', 7, 0),
    ('P-00284', 38, 0),
    ('P-00285', 14, 3),
    ('P-00286', 5, 5),
    ('P-00287', 31, 10),
    ('P-00288', 198, 394),
    ('P-00289', 400, 161),
    ('P-00290', 21, 0),
    ('P-00291', 0, 0),
    ('P-00292', 0, 13),
    ('P-00293', 10, 4),
    ('P-00294', 17, 7),
    ('P-00295', 0, 0),
    ('P-00296', 1, 0),
    ('P-00297', 3, 3),
    ('P-00298', 7, 1),
    ('P-00299', 4, 0),
    ('P-00300', 1, 0),
    ('P-00301', 8, 0),
    ('P-00302', 1, 0),
    ('P-00303', 8, 0),
    ('P-00304', 0, 0),
    ('P-00305', 4, 1),
    ('P-00306', 2, 0),
    ('P-00307', 1, 0),
    ('P-00308', 4, 0),
    ('P-00309', 5, 0),
    ('P-00310', 8, 3),
    ('P-00311', 0, 5),
    ('P-00312', 1, 0),
    ('P-00313', 2, 0),
    ('P-00314', 8, 0),
    ('P-00315', 2, 0),
    ('P-00316', 11, 0),
    ('P-00317', 0, 0),
    ('P-00318', 18, 1),
    ('P-00319', 1, 0),
    ('P-00320', 92, 37),
    ('P-00321', 8, 2),
    ('P-00322', 1800, 1000),
    ('P-00323', 3, 0),
    ('P-00324', 33, 6),
    ('P-00325', 2, 0),
    ('P-00326', 3, 1),
    ('P-00327', 0, 9),
    ('P-00328', 36, 4),
    ('P-00329', 4, 33),
    ('P-00330', 25, 10),
    ('P-00331', 15, 0),
    ('P-00332', 25, 0),
    ('P-00333', 6, 0),
    ('P-00334', 800, 0),
    ('P-00335', 20, 12),
    ('P-00336', 0, 2),
    ('P-00337', 700, 0),
    ('P-00338', 0, 3),
    ('P-00339', 0, 1),
    ('P-00340', 0, 4),
    ('P-00341', 11, 0),
    ('P-00342', 44, 0),
    ('P-00343', 10, 0),
    ('P-00344', 30, 0),
    ('P-00345', 60, 0),
    ('P-00346', 15, 0),
    ('P-00347', 2, 0),
    ('P-00348', 8, 0),
    ('P-00349', 3, 0),
    ('P-00350', 12, 5),
    ('P-00351', 22, 0),
    ('P-00352', 8, 0),
    ('P-00353', 5, 0),
    ('P-00354', 7, 0),
    ('P-00355', 2, 0),
    ('P-00356', 14, 0),
    ('P-00357', 0, 0),
    ('P-00358', 1, 0),
    ('P-00359', 8, 0),
    ('P-00360', 7, 2),
    ('P-00361', 2, 10),
    ('P-00362', 0, 1),
    ('P-00363', 0, 0),
    ('P-00364', 6, 1),
    ('P-00365', 3, 0),
    ('P-00366', 0, 1),
    ('P-00367', 8, 11),
    ('P-00368', 2, 0),
    ('P-00369', 30, 0),
    ('P-00370', 19, 0),
    ('P-00371', 27, 0),
    ('P-00372', 10, 0),
    ('P-00373', 1, 3),
    ('P-00374', 1, 0),
    ('P-00375', 12, 2),
    ('P-00376', 0, 2),
    ('P-00377', 0, 0),
    ('P-00378', 0, 0),
    ('P-00379', 8, 0),
    ('P-00380', 13, 0),
    ('P-00381', 2, 0),
    ('P-00382', 1, 0),
    ('P-00383', 4, 0),
    ('P-00384', 0, 0),
    ('P-00385', 0, 14),
    ('P-00386', 0, 9),
    ('P-00387', 980, 0),
    ('P-00388', 36, 0),
    ('P-00389', 0, 0.4),
    ('P-00390', 0, 2),
    ('P-00391', 8, 1),
    ('P-00392', 28, 0),
    ('P-00393', 0, 2),
    ('P-00394', 0, 0),
    ('P-00395', 3, 0),
    ('P-00396', 0, 0),
    ('P-00397', 0, 11),
    ('P-00398', 10, 0),
    ('P-00399', 1, 0),
    ('P-00400', 2, 3),
    ('P-00401', 0, 2),
    ('P-00402', 1, 1),
    ('P-00403', 0, 0),
    ('P-00404', 0, 0),
    ('P-00405', 5, 0),
    ('P-00406', 0, 4),
    ('P-00407', 0, 0),
    ('P-00408', 0, 1),
    ('P-00409', 8, 1),
    ('P-00410', 5, 1),
    ('P-00411', 39, 2),
    ('P-00412', 5, 0),
    ('P-00413', 6, 1),
    ('P-00414', 22, 0),
    ('P-00415', 0, 0),
    ('P-00416', 0, 340),
    ('P-00417', 0, 340),
    ('P-00418', 0, 300),
    ('P-00419', 0, 300),
    ('P-00420', 0, 686),
    ('P-00421', 8, 2),
    ('P-00422', 28, 0),
    ('P-00423', 25, 0),
    ('P-00424', 27, 0),
    ('P-00425', 17, 0),
    ('P-00426', 31, 0),
    ('P-00427', 18, 1375),
    ('P-00428', 11, 0),
    ('P-00429', 0, 0),
    ('P-00430', 219, 0),
    ('P-00431', 2, 0),
    ('P-00432', 40, 0),
    ('P-00433', 55, 0),
    ('P-00434', 7, 0),
    ('P-00435', 16, 0),
    ('P-00436', 0, 0),
    ('P-00437', 0, 0),
    ('P-00438', 4, 1),
    ('P-00439', 0, 900),
    ('P-00440', 9, 0),
    ('P-00441', 1, 0),
    ('P-00442', 0, 0),
    ('P-00443', 0, 1),
    ('P-00444', 0, 995),
    ('P-00445', 0, 4),
    ('P-00446', 0, 1050),
    ('P-00447', 18, 0),
    ('P-00448', 7, 1),
    ('P-00449', 4, 3),
    ('P-00450', 2, 0),
    ('P-00451', 0, 275),
    ('P-00452', 9, 0),
    ('P-00453', 1035, 600),
    ('P-00454', 0, 5),
    ('P-00455', 6, 0),
    ('P-00456', 9, 0),
    ('P-00457', 11, 0),
    ('P-00458', 13, 0),
    ('P-00459', 2, 1),
    ('P-00460', 3, 2),
    ('P-00461', 2, 3),
    ('P-00462', 1, 0),
    ('P-00463', 4, 1),
    ('P-00464', 1, 0),
    ('P-00465', 1, 0),
    ('P-00466', 10, 0),
    ('P-00467', 0, 0),
    ('P-00468', 0, 0),
    ('P-00469', 0, 0),
    ('P-00470', 0, 0),
    ('P-00471', 0, 0),
    ('P-00472', 0, 0),
    ('P-00473', 0, 0),
    ('P-00474', 30, 0),
    ('P-00475', 20, 0),
    ('P-00476', 31, 0),
    ('P-00477', 34, 0),
    ('P-00478', 3, 1),
    ('P-00479', 0, 0),
    ('P-00480', 0, 4),
    ('P-00481', 4, 0),
    ('P-00482', 4, 0),
    ('P-00483', 0, 22);

  -- Las Flores: todos sus productos en el Almacén 01; el Almacén 02 — Cocina empieza vacío
  delete from producto_almacen pa where pa.almacen_id = v_a2
     and coalesce(pa.stock_minimo, 0) = 0 and pa.stock_maximo is null and pa.stock_objetivo is null and pa.ubicacion is null;
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select pl.producto_id, v_a1, 0 from producto_local pl where pl.local_id = v_lf
  on conflict (producto_id, almacen_id) do nothing;

  -- Umaru: los mismos productos del catálogo principal (numeración propia 1, 2, 3… en el orden del Excel)
  insert into producto_local (producto_id, local_id)
  select p.id, v_um from producto p join _st s on s.codigo = p.codigo
  where p.activo order by p.codigo
  on conflict (producto_id, local_id) do nothing;
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select pl.producto_id, v_aum, 0 from producto_local pl where pl.local_id = v_um
  on conflict (producto_id, almacen_id) do nothing;

  -- Stock inicial (sin costo: se valoriza con las compras que lleguen)
  select jsonb_agg(jsonb_build_object('producto_id', p.id, 'cantidad', s.lf) order by p.codigo) into v_l1
  from _st s join producto p on p.codigo = s.codigo where s.lf > 0;
  select jsonb_agg(jsonb_build_object('producto_id', p.id, 'cantidad', s.um) order by p.codigo) into v_lum
  from _st s join producto p on p.codigo = s.codigo where s.um > 0;
  if v_l1 is not null then
    perform fn_registrar_movimiento('stock_inicial', v_a1, v_l1, v_fecha, null, 'TUMISOFT', 'Stock inicial Las Flores (Excel ALMACEN 01: incluye lo del Almacén 02 — Cocina, por separar)');
  end if;
  if v_lum is not null then
    perform fn_registrar_movimiento('stock_inicial', v_aum, v_lum, v_fecha, null, 'TUMISOFT', 'Stock inicial Hotel Umaru (Excel ALMACEN 02)');
  end if;
end $$;

-- Verificación: Almacén 01 ≈ 348 con stock · Almacén 02 — Cocina 0 · Hotel Umaru ≈ 265
select a.nombre as almacen,
       (select count(*) from public.producto_almacen pa where pa.almacen_id = a.id) as productos,
       (select count(*) from public.stock s where s.almacen_id = a.id and s.cantidad > 0) as con_stock
from public.almacen a where a.codigo in ('ALM-LF', 'ALM2-LF', 'ALM-UM') order by a.codigo;
