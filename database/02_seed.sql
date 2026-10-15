-- =============================================================================
--  SISTEMA DE LOGÍSTICA — CORPORACIÓN LAS FLORES
--  02_seed.sql · Datos iniciales
--
--  PARTE A — Datos maestros REALES (tomados de la carpeta LOGISTICA 2026):
--            empresas, negocios, almacenes, áreas, unidades, categorías, roles,
--            parámetros/metas (MOF), reglas de viandas, stock par de bebidas,
--            agenda de funciones, personal y el usuario de Fernanda.
--  PARTE B — Datos transaccionales DE PRUEBA (enero–septiembre 2026) generados
--            para validar el sistema: compras, consumos, conteos, descuentos,
--            viandas, traslados, cotizaciones, roturas. Se reemplazarán por los
--            datos reales (stock inicial en la fecha de corte + registros del día a día).
--            Para cargar solo la Parte A, ejecute hasta el marcador "FIN PARTE A".
--            Con datos reales: después ejecute 04_limpiar_pruebas_y_preparar_reales.sql.
--
--  Requisito: haber ejecutado 01_schema.sql
--  Acceso:  Usuario "Logística Las Flores" · Contraseña: la que se ponga en CAMBIAR_CONTRASEÑA
--           (cámbiela desde Supabase → Authentication tras el primer ingreso)
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- A1. ORGANIZACIÓN
-- -----------------------------------------------------------------------------
insert into empresa (ruc, razon_social, nombre_comercial, direccion) values
  ('20494980801', 'CORPORACIÓN LAS FLORES S.A.C.', 'Restaurante Turístico Las Flores',
   'Jr. José Olaya N° 106, Conchopata — Andrés Avelino Cáceres, Huamanga, Ayacucho'),
  ('20609784254', 'CLUB LAS FLORES S.A.C.', 'Hotel Umaru', 'Huamanga, Ayacucho')
on conflict (ruc) do nothing;

insert into local (empresa_id, codigo, nombre, sufijo_doc, color, orden)
select e.id, v.codigo, v.nombre, v.sufijo, v.color, v.orden
from (values ('20494980801', 'LF', 'Restaurante Las Flores', 'LFS', '#C8102E', 1),
             ('20609784254', 'UM', 'Hotel Umaru',           'UMR', '#111827', 2)) v(ruc, codigo, nombre, sufijo, color, orden)
join empresa e on e.ruc = v.ruc
on conflict (codigo) do nothing;

insert into almacen (local_id, codigo, nombre, tipo, es_principal)
select l.id, v.codigo, v.nombre, v.tipo, v.principal
from (values
  ('LF', 'ALM-LF',  'Almacén 01 — Las Flores',          'almacen',  true),
  ('LF', 'OF-01',   'Oficina 01 (bebidas)',             'oficina',             false),
  ('LF', 'OF-02',   'Oficina 02 (bebidas)',             'oficina',             false),
  ('LF', 'COC-LF',  'Cocina Las Flores (carnes)',       'cocina',             false),
  ('LF', 'SAL-LF',  'Salón Las Flores',                 'area',             false),
  ('LF', 'REP-LF',  'Repostería / Pastelería',          'area',             false),
  ('LF', 'BAR-LF',  'Bar / Karaoke Las Flores',         'bar',             false),
  ('LF', 'AZA-LF',  'Azafate (emplatado)',              'area',             false),
  ('LF', 'ACT-LF',  'Almacén 03 — Activos y equipos',   'activos',             false),
  ('UM', 'ALM-UM',  'Almacén 02 — Club Las Flores',     'almacen', true),
  ('UM', 'COC-UM',  'Cocina Hotel Umaru (carnes)',      'cocina',             false),
  ('UM', 'BEB-UM',  'Bebidas Hotel Umaru',              'oficina',             false)
) v(loc, codigo, nombre, tipo, principal)
join local l on l.codigo = v.loc
on conflict (codigo) do nothing;

insert into area (local_id, nombre)
select l.id, a.nombre
from local l cross join (values ('Almacén'), ('Cocina producción'), ('Salón'), ('Repostería'), ('Bar'), ('Azafate'),
                                ('Karaoke'), ('Caja'), ('Administración'), ('Oficina 1'), ('Oficina 2'),
                                ('Mantenimiento'), ('Housekeeping'), ('Recepción')) a(nombre)
where not (l.codigo = 'LF' and a.nombre in ('Housekeeping','Recepción'))
on conflict do nothing;

insert into ciudad (nombre, orden) values ('Ayacucho', 1), ('Lima', 2), ('En línea', 3)
on conflict (nombre) do nothing;

-- -----------------------------------------------------------------------------
-- A2. SEGURIDAD: ROLES Y PERMISOS POR MÓDULO
--     módulos: maestros, inventario, conteos, compras, proveedores, requerimientos,
--              traslados, carnes, descuentos, documentos, tareas, configuracion, seguridad, reportes
-- -----------------------------------------------------------------------------
insert into rol (codigo, nombre, descripcion) values
  ('admin',     'Administrador',        'Acceso total, usuarios y cierre de periodos'),
  ('logistica', 'Jefe(a) de Logística', 'Gestión completa del área de logística'),
  ('almacen',   'Almacén',              'Movimientos, conteos, traslados y carnes'),
  ('compras',   'Compras',              'Compras, proveedores, cotizaciones y requerimientos'),
  ('cocina',    'Cocina',               'Registro de viandas/carnes y requerimientos'),
  ('mozo',      'Mozo / Salón',         'Requerimientos y registro de ventas de viandas'),
  ('consulta',  'Consulta / Gerencia',  'Solo lectura de reportes e indicadores')
on conflict (codigo) do nothing;

insert into rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('admin', '*', true, true, true),
  ('logistica', '*', true, true, true),
  ('almacen', '*', true, false, false),
  ('almacen', 'inventario', true, true, false), ('almacen', 'conteos', true, true, false),
  ('almacen', 'traslados', true, true, false),  ('almacen', 'carnes', true, true, false),
  ('almacen', 'requerimientos', true, true, false), ('almacen', 'tareas', true, true, false),
  ('compras', '*', true, false, false),
  ('compras', 'compras', true, true, false), ('compras', 'proveedores', true, true, false),
  ('compras', 'requerimientos', true, true, false), ('compras', 'maestros', true, true, false),
  ('compras', 'documentos', true, true, false),
  ('cocina', 'maestros', true, false, false), ('cocina', 'inventario', true, false, false),
  ('cocina', 'carnes', true, true, false), ('cocina', 'requerimientos', true, true, false),
  ('mozo', 'maestros', true, false, false), ('mozo', 'carnes', true, true, false),
  ('mozo', 'requerimientos', true, true, false),
  ('consulta', '*', true, false, false)
on conflict (rol, modulo) do nothing;

-- -----------------------------------------------------------------------------
-- A3. PARÁMETROS Y METAS (MOF Jefe de Logística LOG-JLG-001)
-- -----------------------------------------------------------------------------
insert into parametro (clave, valor, descripcion) values
  ('meta_otif',                    0.95, 'Meta OTIF (entregas a tiempo y completas) — MOF ≥ 95%'),
  ('meta_diferencia_inventario',   0.01, 'Meta de diferencia de inventario valorizada — MOF ≤ 1%'),
  ('meta_fifo',                    1.00, 'Meta de cumplimiento FIFO en perecibles — MOF 100%'),
  ('meta_ahorro',                  0.05, 'Meta de ahorro en compras — MOF ≥ 5%'),
  ('horas_objetivo_requerimiento', 24,   'Tiempo máximo de aprobación de requerimientos (horas) — MOF < 24 h'),
  ('otif_horas_objetivo',          24,   'Plazo de entrega por defecto desde la aprobación (horas) cuando la compra no tiene fecha comprometida'),
  ('tolerancia_viandas',           1,    'Diferencia máxima (unidades) entre venta de viandas y salida de Kardex antes de alertar'),
  ('pct_descuento_rotura',         0.50, 'Porcentaje de una rotura individual que asume el colaborador (el resto la empresa)'),
  ('umbral_alerta_precio',         0.10, 'Alerta cuando el precio de compra sube más de este porcentaje vs la compra anterior'),
  ('dias_alerta_vencimiento',      7,    'Días de anticipación para alertar lotes por vencer (FIFO)'),
  ('stock_minimo_defecto',         10,   'Stock mínimo con el que nace cada producto en el almacén principal de su negocio'),
  ('igv',                          0.18, 'Tasa de IGV')
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- A4. CATÁLOGOS BASE
-- -----------------------------------------------------------------------------
insert into unidad_medida (codigo, nombre) values
  ('UND', 'Unidad'), ('KG', 'Kilogramo'), ('G', 'Gramo'), ('MG', 'Miligramo'), ('L', 'Litro'), ('ML', 'Mililitro'),
  ('OZ', 'Onza'), ('CJ', 'Caja'), ('PAQ', 'Paquete'), ('MLL', 'Millar'), ('BOL', 'Bolsa'), ('ROL', 'Rollo'),
  ('GAL', 'Galón'), ('SAC', 'Saco'), ('POR', 'Porción / plato'), ('BAL', 'Balde')
on conflict (codigo) do nothing;

insert into categoria (nombre)
select v.nombre from (values
  ('Abarrotes'), ('Bebidas'), ('Carnes y viandas'), ('Descartables y empaques'), ('Limpieza'),
  ('Útiles de oficina'), ('Uniformes'), ('Utensilios'), ('Infusiones y café'), ('Botiquín y cuidado'),
  ('Vajilla y menaje'), ('Equipos y activos')) v(nombre)
where not exists (select 1 from categoria c where c.nombre = v.nombre and c.padre_id is null);

-- Fusiona categorías duplicadas que hayan quedado de ejecuciones anteriores del script
do $$
declare r record;
begin
  loop
    select c.nombre, c.padre_id, (array_agg(c.id order by c.id::text))[1] as queda, array_agg(c.id) as ids
      into r
    from categoria c group by c.nombre, c.padre_id having count(*) > 1 limit 1;
    exit when r is null or r.queda is null;
    update producto  set categoria_id = r.queda where categoria_id = any(r.ids) and categoria_id <> r.queda;
    update proveedor set categoria_id = r.queda where categoria_id = any(r.ids) and categoria_id <> r.queda;
    update categoria set padre_id = r.queda where padre_id = any(r.ids) and padre_id <> r.queda;
    delete from categoria where id = any(r.ids) and id <> r.queda;
  end loop;
end $$;

insert into categoria (nombre, padre_id)
select v.hijo, c.id from (values
  ('Abarrotes','Granos y harinas'), ('Abarrotes','Aceites'), ('Abarrotes','Condimentos y salsas'),
  ('Abarrotes','Lácteos'), ('Abarrotes','Repostería'),
  ('Bebidas','Gaseosas'), ('Bebidas','Aguas'), ('Bebidas','Cervezas'), ('Bebidas','Vinos y licores')) v(padre, hijo)
join categoria c on c.nombre = v.padre and c.padre_id is null
on conflict do nothing;

insert into tipo_movimiento (codigo, nombre, signo, manual) values
  ('stock_inicial',        'Stock inicial',              1,  true),
  ('entrada_compra',       'Entrada por compra',         1,  false),
  ('entrada_devolucion',   'Devolución de área',         1,  true),
  ('ajuste_positivo',      'Ajuste positivo (sobrante)', 1,  true),
  ('traslado_entrada',     'Traslado — ingreso',         1,  false),
  ('salida_consumo',       'Salida a consumo / área',   -1,  true),
  ('salida_venta',         'Salida por venta',          -1,  true),
  ('merma',                'Merma / pérdida',           -1,  true),
  ('ajuste_negativo',      'Ajuste negativo (faltante)',-1,  true),
  ('traslado_salida',      'Traslado — salida',         -1,  false),
  ('devolucion_proveedor', 'Devolución a proveedor',    -1,  true)
on conflict (codigo) do nothing;

-- Conceptos del Kardex de carnes (tal cual los usa Fernanda) y motivos generales
insert into motivo (codigo, nombre, aplica_a) values
  ('VENTA',        'Venta',                       'carnes'),
  ('PERDIDA',      'Pérdida',                     'carnes'),
  ('SANTA_ELENA',  'Santa Elena',                 'carnes'),
  ('CUMPLEANOS',   'Cumpleaños',                  'carnes'),
  ('MKT',          'Marketing (MKT)',             'carnes'),
  ('PRUEBAS',      'Pruebas de cocina',           'carnes'),
  ('ENSALADA',     'Ensalada',                    'carnes'),
  ('SOPA_DIETA',   'Sopa de dieta',               'carnes'),
  ('PERSONAL',     'Alimentación del personal',   'carnes'),
  ('CONSUMO_AREA', 'Consumo de área',             'salida'),
  ('ATENCION_REQ', 'Atención de requerimiento',   'salida'),
  ('EVENTO',       'Evento',                      'salida'),
  ('VENCIMIENTO',  'Producto vencido',            'salida'),
  ('ROTURA',       'Rotura / deterioro',          'rotura'),
  ('CONTEO',       'Diferencia de conteo físico', 'ajuste'),
  ('CORRECCION',   'Corrección de registro',      'ajuste')
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- A5. PERSONAL Y USUARIO PRINCIPAL
-- -----------------------------------------------------------------------------
insert into personal (local_id, area_id, nombres, cargo)
select l.id, (select id from area a where a.local_id = l.id and a.nombre = v.area), v.nombres, v.cargo
from (values
  ('LF', 'Administración', 'FERNANDEZ LAPA, FERNANDA',     'Jefa de Logística'),
  ('LF', 'Administración', 'RODRÍGUEZ CHUCHÓN, MIJAÍL',    'Administrador / Gerente'),
  ('LF', 'Almacén',        'ESCRIBA GÓMEZ, HERNÁN',        'Responsable de almacén'),
  ('UM', 'Almacén',        'ESPINOZA VILCAPOMA, ROBERT',   'Responsable de almacén'),
  ('UM', 'Almacén',        'ROMANÍ, MERILIN',              'Responsable de almacén'),
  ('LF', 'Caja',           'OCHOA FERNÁNDEZ, MELISA',      'Caja'),
  ('LF', 'Cocina producción', 'ROY (COCINA)',              'Registro de viandas'),
  ('LF', 'Salón', 'FERDINAND', 'Mozo'), ('LF', 'Salón', 'SANDRO', 'Mozo'), ('LF', 'Salón', 'ALDAHIR', 'Mozo'),
  ('LF', 'Salón', 'LUCERO', 'Moza'), ('LF', 'Salón', 'LUCÍA', 'Moza'), ('LF', 'Salón', 'SHUMARA', 'Moza'),
  ('LF', 'Salón', 'DINA', 'Moza'), ('LF', 'Salón', 'JERALDINE', 'Moza'), ('LF', 'Salón', 'ARTHUR', 'Mozo'),
  ('LF', 'Azafate', 'YERICK', 'Azafate'), ('LF', 'Azafate', 'DANIEL', 'Azafate'), ('LF', 'Azafate', 'YANDIRA', 'Azafate'),
  ('LF', 'Repostería', 'PAOLA', 'Panadería')
) v(loc, area, nombres, cargo)
join local l on l.codigo = v.loc
where not exists (select 1 from personal p where p.nombres = v.nombres);

-- Usuario: "Logística Las Flores" / CAMBIAR_CONTRASEÑA (Supabase Auth, contraseña con bcrypt)
do $$
declare v_uid uuid := 'a1f10000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from auth.users where id = v_uid) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
            'logistica@lasflores.local', extensions.crypt('CAMBIAR_CONTRASEÑA', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"nombre":"Fernanda Fernández"}', now(), now(),
            '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', 'logistica@lasflores.local', 'email_verified', true),
            'email', now(), now(), now());
  end if;
  insert into usuario (id, username, nombre, rol, personal_id, todos_locales)
  values (v_uid, 'Logística Las Flores', 'Fernanda Fernández Lapa', 'admin',
          (select id from personal where nombres = 'FERNANDEZ LAPA, FERNANDA'), true)
  on conflict (id) do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- A6. AGENDA DE FUNCIONES (hoja "DIAGRAMA - LOGÍSTICA")
-- -----------------------------------------------------------------------------
insert into tarea (nombre, frecuencia, orden)
select v.nombre, v.frec, v.ord from (values
  ('Presentación', 'diaria', 1), ('Recepción de insumos – horno', 'diaria', 2),
  ('Supervisión ingreso de verduras', 'diaria', 3), ('Control de calidad de verduras', 'diaria', 4),
  ('Verificación en punto de llegada', 'diaria', 5), ('Control por recibo de compras', 'diaria', 6),
  ('Solicitud y corroboración de facturas', 'diaria', 7), ('Verificación Kardex', 'diaria', 8),
  ('Control digital de Kardex', 'diaria', 9), ('Procesamiento de pedidos internos', 'diaria', 10),
  ('Revisión de requerimientos', 'diaria', 11), ('Base de datos de proveedores', 'diaria', 12),
  ('Búsqueda de nuevos proveedores', 'diaria', 13), ('Cotizaciones de productos', 'diaria', 14),
  ('Filtro y validación de proveedores', 'diaria', 15), ('Reporte contable diario', 'diaria', 16),
  ('Minimización de gastos', 'diaria', 17), ('Trazabilidad de precios', 'diaria', 18),
  ('Línea evolutiva de precios', 'diaria', 19),
  ('Reporte de nuevos proveedores', 'semanal', 20), ('Verificación Kardex carnes', 'semanal', 21),
  ('Mejora continua', 'semanal', 22), ('Participación en reuniones', 'semanal', 23),
  ('Conteo de stock – almacenes', 'mensual', 24), ('Lista de stock por área', 'mensual', 25)
) v(nombre, frec, ord)
where not exists (select 1 from tarea t where t.nombre = v.nombre);

-- -----------------------------------------------------------------------------
-- A7. CARNES DEL KARDEX Y REGLAS DE VIANDAS (hoja "CONTROL DE CARNES Y VIANDAS")
-- -----------------------------------------------------------------------------
insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, es_perecible, costo_referencia)
select v.codigo, v.nombre, 'carne', (select id from categoria where nombre = 'Carnes y viandas'),
       (select id from unidad_medida where codigo = v.und), true, v.costo
from (values
  ('CAR-001', 'CUY',        'UND', 32.00), ('CAR-002', 'CHICHARRÓN', 'POR', 9.50),
  ('CAR-003', 'ASADO (LECHÓN)', 'POR', 11.00), ('CAR-004', 'CHULETA', 'UND', 8.50),
  ('CAR-005', 'TRUCHA',     'UND', 9.00),  ('CAR-006', 'CEVICHE',    'POR', 7.50),
  ('CAR-007', 'FILETE',     'POR', 12.00), ('CAR-008', 'POLLO',      'POR', 6.80),
  ('CAR-009', 'MILANESA',   'POR', 7.20),  ('CAR-010', 'LOMO',       'POR', 14.50),
  ('CAR-011', 'PARRILLA',   'POR', 18.00)
) v(codigo, nombre, und, costo)
on conflict (codigo) do nothing;

insert into vianda_item (codigo, nombre, orden) values
  ('ENTERO', 'Cuy entero', 1), ('MEDIO', 'Medio cuy', 2), ('MIXTO', 'Mixto (½ cuy + chicharrón)', 3),
  ('CHICHARRON', 'Chicharrón', 4), ('PUCA', 'Puca picante', 5), ('LECHON', 'Lechón', 6),
  ('CHULETA_CERDO', 'Chuleta de cerdo', 7), ('TRUCHA', 'Trucha', 8), ('CEVICHE', 'Ceviche', 9),
  ('FILETE', 'Filete', 10), ('POLLO', 'Pollo', 11), ('MILANESA', 'Milanesa', 12), ('LOMO', 'Lomo', 13)
on conflict (codigo) do nothing;

-- CUY = ENTERO + MEDIO/2 + MIXTO/2 · CHICHARRÓN = CHICHARRÓN + MIXTO×⅔ + PUCA/3 (Excel usaba 0.6666)
insert into vianda_conversion (item_id, producto_id, factor)
select i.id, p.id, v.factor
from (values ('ENTERO','CAR-001',1), ('MEDIO','CAR-001',0.5), ('MIXTO','CAR-001',0.5),
             ('MIXTO','CAR-002',0.666667), ('CHICHARRON','CAR-002',1), ('PUCA','CAR-002',0.333333),
             ('LECHON','CAR-003',1), ('CHULETA_CERDO','CAR-004',1), ('TRUCHA','CAR-005',1),
             ('CEVICHE','CAR-006',1), ('FILETE','CAR-007',1), ('POLLO','CAR-008',1),
             ('MILANESA','CAR-009',1), ('LOMO','CAR-010',1)) v(item, prod, factor)
join vianda_item i on i.codigo = v.item
join producto p on p.codigo = v.prod
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- A8. BEBIDAS DE OFICINAS CON STOCK PAR (hoja "CAJAS" de CONTEO MENSUAL)
-- -----------------------------------------------------------------------------
insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, costo_referencia)
select v.codigo, v.nombre, 'bebida', (select id from categoria where nombre = v.sub),
       (select id from unidad_medida where codigo = 'UND'), v.costo
from (values
  ('BEB-001','CERVEZA PILSEN CALLAO','Cervezas',5.20,60,36), ('BEB-002','CERVEZA CRISTAL','Cervezas',5.00,24,24),
  ('BEB-003','CUSQUEÑA NEGRA','Cervezas',6.58,24,48),       ('BEB-004','CUSQUEÑA TRIGO','Cervezas',6.60,60,72),
  ('BEB-005','DORCHER','Cervezas',9.50,24,24),              ('BEB-006','GASEOSA INKA COLA 296 ML','Gaseosas',1.50,12,12),
  ('BEB-007','GASEOSA INKA COLA 1 LT','Gaseosas',3.40,12,18),('BEB-008','GASEOSA INKA COLA 2.5 LT','Gaseosas',6.80,10,12),
  ('BEB-009','GASEOSA GORDITA','Gaseosas',2.60,12,12),      ('BEB-010','GASEOSA COCA COLA 296 ML','Gaseosas',1.50,12,12),
  ('BEB-011','GASEOSA COCA COLA 1 LT','Gaseosas',3.40,12,18),('BEB-012','GASEOSA COCA COLA 2.5 LT','Gaseosas',6.80,10,12),
  ('BEB-013','AGUA CIELO ALCALINA','Aguas',1.00,24,24),     ('BEB-014','POWERADE','Aguas',2.80,6,6),
  ('BEB-015','T. BLANCO DE BLANCOS','Vinos y licores',24.00,2,2),
  ('BEB-016','TABERNERO GRAN TINTO','Vinos y licores',26.00,3,5),
  ('BEB-017','VITTORIA RESERVA 750 ML','Vinos y licores',38.00,2,2),
  ('BEB-018','VITTORIA RESERVA BLANCO 750 ML','Vinos y licores',38.00,2,2),
  ('BEB-019','VINO GRAN SELECCIÓN ROSÉ','Vinos y licores',29.00,2,2),
  ('BEB-020','VINO GRAN SELECCIÓN BORGOÑA','Vinos y licores',29.00,2,2),
  ('BEB-021','VINO FINO TINTO CABERNET','Vinos y licores',32.00,2,2),
  ('BEB-022','CONTRASTE MENDOZA (ARGENTINA)','Vinos y licores',45.00,2,2),
  ('BEB-023','CARDOS (ARGENTINA)','Vinos y licores',42.00,2,2),
  ('BEB-024','FINCA ROTONDO ISABEL','Vinos y licores',48.00,2,2),
  ('BEB-025','FINCA ROTONDO RESERVA','Vinos y licores',65.00,2,2),
  ('BEB-026','VINO FAUSTINO VII (ESPAÑA)','Vinos y licores',58.00,2,2),
  ('BEB-027','VINO FAUSTINO I (ESPAÑA)','Vinos y licores',120.00,2,2),
  ('BEB-028','SANGRE DE TORO (ESPAÑA)','Vinos y licores',55.00,2,2),
  ('BEB-029','CASILLERO DEL DIABLO (CHILE)','Vinos y licores',52.00,2,2),
  ('BEB-030','NAVARRO CORREAS','Vinos y licores',60.00,2,2),
  ('BEB-031','FOND DE CAVE','Vinos y licores',62.00,2,3)
) v(codigo, nombre, sub, costo, of1, of2)
on conflict (codigo) do nothing;

insert into producto_almacen (producto_id, almacen_id, stock_objetivo, stock_minimo)
select p.id, a.id, v.par, ceil(v.par * 0.25)
from (values
  ('BEB-001',60,36),('BEB-002',24,24),('BEB-003',24,48),('BEB-004',60,72),('BEB-005',24,24),('BEB-006',12,12),
  ('BEB-007',12,18),('BEB-008',10,12),('BEB-009',12,12),('BEB-010',12,12),('BEB-011',12,18),('BEB-012',10,12),
  ('BEB-013',24,24),('BEB-014',6,6),('BEB-015',2,2),('BEB-016',3,5),('BEB-017',2,2),('BEB-018',2,2),('BEB-019',2,2),
  ('BEB-020',2,2),('BEB-021',2,2),('BEB-022',2,2),('BEB-023',2,2),('BEB-024',2,2),('BEB-025',2,2),('BEB-026',2,2),
  ('BEB-027',2,2),('BEB-028',2,2),('BEB-029',2,2),('BEB-030',2,2),('BEB-031',2,3)
) x(codigo, of1, of2)
cross join lateral (values ('OF-01', x.of1), ('OF-02', x.of2)) v(alm, par)
join producto p on p.codigo = x.codigo
join almacen a on a.codigo = v.alm
on conflict do nothing;

-- Bebidas del hotel (modelo "MODELO HOTEL UMARU": control diario)
insert into producto_almacen (producto_id, almacen_id, stock_objetivo, stock_minimo)
select p.id, a.id, v.par, ceil(v.par * 0.25)
from (values ('BEB-010',12),('BEB-011',18),('BEB-012',4),('BEB-006',12),('BEB-007',18),('BEB-008',4),
             ('BEB-002',24),('BEB-004',24),('BEB-013',24)) v(codigo, par)
join producto p on p.codigo = v.codigo
join almacen a on a.codigo = 'BEB-UM'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- A9. BIENES PATRIMONIALES / UTENSILIOS POR ÁREA (UTENSILIOS LAS FLORES.xlsx)
-- -----------------------------------------------------------------------------
insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, costo_referencia, descripcion)
select v.codigo, v.nombre, 'activo', (select id from categoria where nombre = 'Vajilla y menaje'),
       (select id from unidad_medida where codigo = 'UND'), v.costo, v.espec
from (values
  ('UTL-001','VASO DE VIDRIO','Salón',3.00,null), ('UTL-002','CANCHICERO (PORCELANA)','Salón',18.00,null),
  ('UTL-003','CANCHICERO (ARCILLA)','Salón',32.00,null), ('UTL-004','SALERO','Salón',20.00,null),
  ('UTL-005','SERVILLETERO (LOZA)','Salón',10.00,null), ('UTL-006','VASO DE CAFÉ','Salón',6.00,null),
  ('UTL-007','COPA SONCOSUA','Bar',12.00,null), ('UTL-008','JARRA DE VIDRIO 1 L','Bar',18.00,'vidrio, 1L'),
  ('UTL-009','JARRA DE CERÁMICA 1 L','Bar',25.00,'marrón, 1 L'), ('UTL-010','COPA MARTINI','Bar',12.00,null),
  ('UTL-011','PLATO TENDIDO LOZA 9"','Azafate',16.00,'23.5 cm de diámetro — caldo, choclo con queso'),
  ('UTL-012','PLATO EXTENDIDO 26 CM','Azafate',22.00,'Ensaladas, cuy, chorizo'),
  ('UTL-013','PLATO MEDIO CUY REDONDO','Azafate',25.00,null), ('UTL-014','PIREX ENSALADA','Azafate',12.00,null),
  ('UTL-015','PLATO DE MATE','Salón',8.00,null), ('UTL-016','GRAMERA DIGITAL PEQUEÑA','Repostería',34.00,'color plateado'),
  ('UTL-017','SOPLETE DE BUTANO','Repostería',40.00,'THORCH OL/600'), ('UTL-018','PLATO SOMBRERO','Repostería',14.00,'blanco, Corona')
) v(codigo, nombre, area, costo, espec)
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- A10. PRODUCTOS (muestra real del catálogo del almacén, ago-2026). El catálogo
--      completo se registra y edita en el módulo Productos.
--      Nota: aquí se
--      usa un costo de PRUEBA hasta registrar compras reales.
-- -----------------------------------------------------------------------------
-- Una sola sentencia (sin tablas auxiliares): crea los productos y sus mínimos/máximos
-- por almacén principal (hoja "QUIEBRE" de EXPO MENSUAL). Reejecutable.
with s (codigo, nombre, cat, sub, tipo, und, costo, perecible, stock_lf, stock_um) as (
  values
  ('10000057', 'ACEITE 20 LT', 'Abarrotes', 'Aceites', 'insumo', 'UND', 109.18, false, 43.0, 24.0),
  ('10000058', 'ACEITE DE AJONJOLI X LT', 'Abarrotes', 'Aceites', 'insumo', 'UND', 74.19, false, 0.0, 1.0),
  ('10000059', 'ACEITE DE OLIVA X LT', 'Abarrotes', 'Aceites', 'insumo', 'UND', 112.3, false, 0.0, 1.0),
  ('10000060', 'AJÍ PANCA X KG', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 21.13, true, 0.0, 0.5),
  ('10000063', 'ALGARROBINA', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'UND', 22.32, true, 2.0, 1.0),
  ('10000071', 'CANELA ENTERA KL', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 16.46, true, 0.0, 1.2),
  ('10000077', 'CLAVO DE OLOR KL', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 17.0, true, 0.0, 2.05),
  ('10000078', 'COMINO GM', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 2.73, true, 0.0, 0.6),
  ('10000117', 'KETCHUP SACHET X 250', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'UND', 17.72, true, 110.0, 500.0),
  ('10000089', 'KETCHUP X 1 KG', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 25.82, true, 21.0, 3.0),
  ('10000118', 'MAYONESA SACHET X 250', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'UND', 22.17, true, 230.0, 500.0),
  ('10000100', 'MAYONESA X 1 KG', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 10.25, true, 0.0, 3.0),
  ('10000119', 'MOSTAZA SACHET X 250', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'UND', 15.9, true, 250.0, 750.0),
  ('10000102', 'MOSTAZA X 1 KG', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 2.9, true, 8.0, 0.0),
  ('10000107', 'PALIO KL', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 12.52, true, 0.0, 0.01),
  ('10000110', 'PIMIENTO BLANCO KL', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 12.5, true, 0.0, 2.0),
  ('10000111', 'PIMIENTO NEGRO Kl', 'Abarrotes', 'Condimentos y salsas', 'insumo', 'KG', 12.41, true, 0.0, 1.4),
  ('Ui4tn8dCp', 'ALVERJA X KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 6.21, false, 26.5, 0.0),
  ('10000066', 'ARROZ X KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 4.7, false, 100.0, 91.0),
  ('10000067', 'AZÚCAR BLANCA X 50 KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 7.15, false, 150.0, 94.9),
  ('frUmdTR4n', 'AZÚCAR IMPALPABLE GM', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 6.41, false, 16.0, 0.0),
  ('10000068', 'AZÚCAR RUBIA X 50 KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 3.03, false, 250.0, 167.0),
  ('10000085', 'FIDEO CABELLO DE ANGEL KL', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 7.62, false, 27.0, 10.55),
  ('10000084', 'FIDEOS FETUCCINI KL', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 3.71, false, 18.0, 7.0),
  ('10000083', 'FIDEOS SPAGHETTI KL', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 2.46, false, 75.0, 14.0),
  ('0pAKAJJTE', 'FRIJOL CANARIO X KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 7.69, false, 26.0, 0.0),
  ('10000087', 'HARINA DE PESCADO X KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 3.46, false, 25.0, 0.0),
  ('10000108', 'PAN RALLADO PANKO X 1 KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 2.8, false, 5.0, 8.0),
  ('10000105', 'QUINUA BLANCA X KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 8.56, false, 0.0, 2.35),
  ('10000115', 'QUINUA NEGRA KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 7.35, false, 0.0, 0.85),
  ('10000114', 'QUINUA ROJA KG', 'Abarrotes', 'Granos y harinas', 'insumo', 'KG', 7.57, false, 0.0, 1.65),
  ('10000081', 'CREMA DE LECHE 1 LT', 'Abarrotes', 'Lácteos', 'insumo', 'UND', 19.52, true, 13.0, 33.0),
  ('XcIJPxTFT', 'LECHE CONDENSADA', 'Abarrotes', 'Lácteos', 'insumo', 'UND', 8.91, true, 18.0, 0.0),
  ('10000090', 'LECHE TARRO GRANDE 400 GR', 'Abarrotes', 'Lácteos', 'insumo', 'UND', 8.6, true, 253.0, 0.0),
  ('10000091', 'LECHE TETRAPAK 1 LT', 'Abarrotes', 'Lácteos', 'insumo', 'UND', 11.38, true, 29.0, 20.0),
  ('10000095', 'MANTEQUILLA X KL', 'Abarrotes', 'Lácteos', 'insumo', 'KG', 21.91, true, 0.0, 6.0),
  ('10000113', 'QUESO PARMESANO', 'Abarrotes', 'Lácteos', 'insumo', 'UND', 5.75, true, 1.0, 3.0),
  ('I1OJNO1D5', 'CHOCOLATE EN TABLETA', 'Abarrotes', 'Repostería', 'insumo', 'UND', 8.07, true, 5.0, 0.0),
  ('z6AaANxpr', 'COBERTURA BLANCA', 'Abarrotes', 'Repostería', 'insumo', 'UND', 4.6, true, 3.0, 0.0),
  ('10000086', 'GALLETA SODA ¼', 'Abarrotes', 'Repostería', 'insumo', 'UND', 25.4, true, 52.0, 11.0),
  ('Evv3Zsj6X', 'GALLETA VAINILLA', 'Abarrotes', 'Repostería', 'insumo', 'UND', 4.63, true, 10.0, 0.0),
  ('FXXO9mGbf', 'MERMELADA DE FRESA BLISTER', 'Abarrotes', 'Repostería', 'insumo', 'UND', 10.5, true, 0.0, 40.0),
  ('JAerf5ZwT', 'OBLEAS DE COBERTURA SABOR A CHOCOLATE', 'Abarrotes', 'Repostería', 'insumo', 'UND', 20.39, true, 5.0, 0.0),
  ('Pwi60Vi4O', 'PUDIN CHOCOLATE', 'Abarrotes', 'Repostería', 'insumo', 'UND', 4.67, true, 12.0, 0.0),
  ('PGKuVXlSE', 'PUDIN VAINILLA', 'Abarrotes', 'Repostería', 'insumo', 'UND', 8.48, true, 12.0, 0.0),
  ('gaXIFo53A', 'AGUA CIELO ALCALINA 350 ML', 'Bebidas', 'Aguas', 'bebida', 'UND', 1.9, false, 50.0, 0.0),
  ('10000165', 'AGUA CIELO ALCALINA 650 ML', 'Bebidas', 'Aguas', 'bebida', 'UND', 2.89, false, 69.0, 25.0),
  ('uB3BIOCwM', 'AGUA CIELO CON GAS ALCALINA 650 ML', 'Bebidas', 'Aguas', 'bebida', 'UND', 3.39, false, 25.0, 0.0),
  ('10000145', 'AGUA SAN LUIS X 625 ML', 'Bebidas', 'Aguas', 'bebida', 'UND', 2.35, false, 0.0, 16.0),
  ('10000137', 'AGUA SAN MATEO CON GAS X 600 ML', 'Bebidas', 'Aguas', 'bebida', 'UND', 4.86, false, 0.0, 49.0),
  ('gXDnJCwTm', 'GALÓN DE AGUA ANGEL', 'Bebidas', 'Aguas', 'bebida', 'UND', 1.05, false, 0.0, 5.0),
  ('10000055', 'CERVEZA CORONA 330 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 6.16, false, 0.0, 6.0),
  ('10000047', 'CERVEZA CRISTAL X 650 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 6.26, false, 17.0, 0.0),
  ('10000048', 'CERVEZA CUSQUEÑA NEGRA X 630 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 6.24, false, 26.0, 13.0),
  ('HxrQRxuP0', 'CERVEZA CUSQUEÑA NEGRAX 330 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 4.55, false, 67.0, 0.0),
  ('fKEvJFpxU', 'CERVEZA CUSQUEÑA TRIGO LATA 355 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 6.0, false, 0.0, 13.0),
  ('10000054', 'CERVEZA CUSQUEÑA TRIGO X 620 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 3.58, false, 210.0, 62.0),
  ('z1UGFnmGZ', 'CERVEZA DORCHER', 'Bebidas', 'Cervezas', 'bebida', 'UND', 4.43, false, 63.0, 0.0),
  ('10000053', 'CERVEZA PILSEN 630 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 6.75, false, 70.0, 19.0),
  ('10000056', 'CERVEZA PILSEN LATA 355 ML', 'Bebidas', 'Cervezas', 'bebida', 'UND', 5.13, false, 0.0, 16.0),
  ('10000143', 'GASEOSA COCA COLA X 1 LT', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 5.74, false, 22.0, 16.0),
  ('FOtk7EDnY', 'GASEOSA COCA COLA X 2.5 LT', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 7.32, false, 24.0, 11.0),
  ('10000139', 'GASEOSA COCA COLA X 296 ML', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 6.51, false, 14.0, 15.0),
  ('10000142', 'GASEOSA FANTA X 3 LT', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 5.31, false, 8.0, 1.0),
  ('V0FJ97yHR', 'GASEOSA INCA KOLA GORDITA', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 5.94, false, 18.0, 0.0),
  ('cNzcET99l', 'GASEOSA INCA KOLA X 1 LT', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 5.48, false, 20.0, 24.0),
  ('UOScQSlIo', 'GASEOSA INCA KOLA X 2.5 LT', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 6.74, false, 16.0, 12.0),
  ('10000146', 'GASEOSA INCA KOLA X 296 ML', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 2.47, false, 23.0, 14.0),
  ('kDj0j1viv', 'MANDILES INCA KOLA', 'Bebidas', 'Gaseosas', 'bebida', 'UND', 1.97, false, 35.0, 0.0),
  ('10000148', 'LICOR AMARGO DE ANGOSTURA 75 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 60.06, false, 1.0, 0.0),
  ('10000149', 'LICOR ANÍS NAJAR 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 83.26, false, 0.0, 1.0),
  ('10000170', 'LICOR BOLS TRIPLE SEC', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 83.24, false, 1.0, 0.0),
  ('10000162', 'LICOR DE MENTA', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 77.26, false, 3.0, 0.0),
  ('10000156', 'LICOR JARABE GRANADILLA X 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 27.52, false, 1.0, 0.0),
  ('10000242', 'LICOR TEQUILA 1800', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 89.94, false, 4.0, 0.0),
  ('10000158', 'LICOR TEQUILA JOSE CUERVO 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 20.48, false, 9.0, 3.0),
  ('10000172', 'LICOR WHISKY BLACK LABEL', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 66.93, false, 2.0, 0.0),
  ('10000282', 'VINO CASILLERO DEL DIABLO 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 86.79, false, 6.0, 4.0),
  ('10000277', 'VINO COLECCIÓN PRIVADA X 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 58.23, false, 4.0, 0.0),
  ('10000279', 'VINO FAUSTINO I X 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 91.43, false, 7.0, 0.0),
  ('10000285', 'VINO SANTIAGO QUEIROLO BORGOÑA 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 34.87, false, 20.0, 5.0),
  ('10000281', 'VINO TABERNERO BORGOÑA 2 LT', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 82.12, false, 2.0, 4.0),
  ('10000280', 'VINO TABERNERO GRAN SELECCIÓN BORGOÑA 750 ML', 'Bebidas', 'Vinos y licores', 'bebida', 'UND', 39.5, false, 7.0, 2.0),
  ('10000210', 'AGUA OXIGENADA', 'Botiquín y cuidado', null, 'suministro', 'UND', 31.78, false, 0.0, 4.0),
  ('GOIWMf4PH', 'BLOQUEADOR SOLAR 100', 'Botiquín y cuidado', null, 'suministro', 'UND', 10.6, false, 0.0, 15.0),
  ('10000001', 'BLOQUEADOR SOLAR 45', 'Botiquín y cuidado', null, 'suministro', 'UND', 2.37, false, 0.0, 1.0),
  ('10000213', 'CURITAS', 'Botiquín y cuidado', null, 'suministro', 'UND', 30.8, false, 0.0, 100.0),
  ('10000214', 'ESPARADRAPO', 'Botiquín y cuidado', null, 'suministro', 'UND', 14.36, false, 0.0, 1.0),
  ('10000018', 'TOALLA HIGIÉNICA', 'Botiquín y cuidado', null, 'suministro', 'UND', 36.66, false, 0.0, 12.0),
  ('10000130', 'BOLSA DE DELIVERY GRANDE', 'Descartables y empaques', null, 'suministro', 'UND', 21.38, false, 1600.0, 25.0),
  ('10000131', 'BOLSA DE DELIVERY PEQUEÑA', 'Descartables y empaques', null, 'suministro', 'UND', 31.89, false, 0.0, 35.0),
  ('10000217', 'BOLSA NEGRA 20X30', 'Descartables y empaques', null, 'suministro', 'UND', 17.03, false, 730.0, 0.0),
  ('10000221', 'BOLSA NEGRA 26X40', 'Descartables y empaques', null, 'suministro', 'UND', 21.37, false, 1185.0, 94.0),
  ('10000002', 'CARAMELO EN BOLSA', 'Descartables y empaques', null, 'suministro', 'UND', 18.54, false, 781.0, 68.0),
  ('10000029', 'MASCARILLAS DESECHABLES', 'Descartables y empaques', null, 'suministro', 'UND', 22.62, false, 990.0, 50.0),
  ('10000033', 'PAPEL ALUMINIO', 'Descartables y empaques', null, 'suministro', 'UND', 18.64, false, 6.0, 6.0),
  ('10000203', 'PAPEL TOALLA X ROLLO', 'Descartables y empaques', null, 'suministro', 'UND', 31.31, false, 15.0, 12.0),
  ('10000134', 'REDECILLAS DESECHABLES', 'Descartables y empaques', null, 'suministro', 'UND', 6.61, false, 363.0, 200.0),
  ('10000133', 'REDECILLAS MOZO', 'Descartables y empaques', null, 'suministro', 'UND', 24.8, false, 0.0, 22.0),
  ('10000229', 'ROLLO 10X15', 'Descartables y empaques', null, 'suministro', 'UND', 26.49, false, 8.0, 15.0),
  ('10000230', 'ROLLO 3X8', 'Descartables y empaques', null, 'suministro', 'UND', 29.85, false, 21.0, 6.0),
  ('10000231', 'ROLLO 4X8', 'Descartables y empaques', null, 'suministro', 'UND', 5.23, false, 7.0, 5.0),
  ('10000042', 'SERVILLETA', 'Descartables y empaques', null, 'suministro', 'UND', 12.67, false, 192.0, 96.0),
  ('F1fSkBMzW', 'CAFE ARTESANAL', 'Infusiones y café', null, 'insumo', 'KG', 3.48, false, 6.0, 6.0),
  ('10000010', 'COLADORES PEQUEÑOS ACEITE', 'Infusiones y café', null, 'insumo', 'UND', 32.38, false, 4.0, 0.0),
  ('10000179', 'DETERGENTE EN BOLSA 140 GR', 'Infusiones y café', null, 'insumo', 'UND', 5.67, false, 27.0, 0.0),
  ('4joP2o94c', 'DETERGENTE X KL', 'Infusiones y café', null, 'insumo', 'KG', 2.36, false, 14.0, 26.0),
  ('gb9775rQE', 'FILETE DE ATÚN', 'Infusiones y café', null, 'insumo', 'UND', 25.11, false, 68.0, 0.0),
  ('10000099', 'MATES MANZANILLA', 'Infusiones y café', null, 'insumo', 'UND', 24.47, false, 0.0, 400.0),
  ('10000030', 'MONDADIENTES EN PAQUETE', 'Infusiones y café', null, 'insumo', 'UND', 8.84, false, 54.0, 23.0),
  ('10000271', 'PAQUETE DE MICAS', 'Infusiones y café', null, 'insumo', 'UND', 14.21, false, 25.0, 7.0),
  ('LZF2rl4qX', 'RECIPIENTE DE MONDADIENTE', 'Infusiones y café', null, 'insumo', 'UND', 33.98, false, 3.0, 0.0),
  ('10000040', 'REPELENTE', 'Infusiones y café', null, 'insumo', 'UND', 13.7, false, 0.0, 8.0),
  ('10000202', 'SECADOR ABSORBENTE AMARILLO', 'Infusiones y café', null, 'insumo', 'UND', 3.39, false, 0.0, 6.0),
  ('10000044', 'SORBETE PEQUEÑO X50', 'Infusiones y café', null, 'insumo', 'UND', 18.87, false, 5.0, 14.0),
  ('10000046', 'TOMACORRIENTE PARA CARGAR', 'Infusiones y café', null, 'insumo', 'UND', 11.91, false, 0.0, 24.0),
  ('10000244', 'TÉ MACHO', 'Infusiones y café', null, 'insumo', 'KG', 12.75, false, 0.0, 0.7),
  ('10000175', 'AYUDÍN LÍQUIDO 4 LT', 'Limpieza', null, 'limpieza', 'UND', 10.95, false, 20.0, 8.0),
  ('10000181', 'ESCOBA', 'Limpieza', null, 'limpieza', 'UND', 24.48, false, 7.0, 10.0),
  ('10000182', 'ESCOBILLAS ROPA', 'Limpieza', null, 'limpieza', 'UND', 0.94, false, 0.0, 5.0),
  ('10000184', 'ESPONJA METAL', 'Limpieza', null, 'limpieza', 'UND', 15.83, false, 1.0, 6.0),
  ('10000183', 'ESPONJA VASO', 'Limpieza', null, 'limpieza', 'UND', 23.39, false, 22.0, 27.0),
  ('10000026', 'GUANTES CORRUGADO T7', 'Limpieza', null, 'limpieza', 'UND', 1.56, false, 19.0, 15.0),
  ('10000027', 'GUANTES QUIRÚRGICOS T(M)', 'Limpieza', null, 'limpieza', 'UND', 7.42, false, 590.0, 9.0),
  ('10000185', 'HIPOCLORITO DE CALCIO AL 70%', 'Limpieza', null, 'limpieza', 'UND', 14.29, false, 0.0, 73.5),
  ('10000187', 'JABÓN EN BARRA', 'Limpieza', null, 'limpieza', 'UND', 19.66, false, 21.0, 6.0),
  ('10000188', 'JABÓN LIQUÍDO PEQUEÑO', 'Limpieza', null, 'limpieza', 'UND', 19.09, false, 8.0, 3.0),
  ('10000186', 'MATA MOSCA EN SOBRE', 'Limpieza', null, 'limpieza', 'UND', 12.66, false, 0.0, 12.0),
  ('10000035', 'PAPEL HIGIÉNICO INSTITUCIONAL', 'Limpieza', null, 'limpieza', 'UND', 8.65, false, 12.0, 12.0),
  ('10000034', 'PAPEL SECADOR PAÑO', 'Limpieza', null, 'limpieza', 'UND', 17.0, false, 1.0, 0.0),
  ('10000041', 'SECADOR COLORES', 'Limpieza', null, 'limpieza', 'UND', 15.28, false, 21.0, 20.0),
  ('UVpy6aOJo', 'BLUSA MUJER T.M', 'Uniformes', null, 'utensilio', 'UND', 59.7, false, 6.0, 3.0),
  ('EVkPOzlmz', 'BLUSA MUJER T.S', 'Uniformes', null, 'utensilio', 'UND', 30.06, false, 10.0, 2.0),
  ('HJPmponUE', 'BLUSA MUJER T.XL', 'Uniformes', null, 'utensilio', 'UND', 63.2, false, 6.0, 0.0),
  ('0ifGL4mi6', 'CAMISA VARÓN T.15', 'Uniformes', null, 'utensilio', 'UND', 29.27, false, 7.0, 0.0),
  ('DBMXsd5uc', 'CHAQUETA BLANCA COCINA T. S', 'Uniformes', null, 'utensilio', 'UND', 41.92, false, 0.0, 2.0),
  ('JLvFkDltT', 'CROCS DE COCINA', 'Uniformes', null, 'utensilio', 'UND', 19.3, false, 1.0, 0.0),
  ('VPLSxNou5', 'GUARDAPOLVOS', 'Uniformes', null, 'utensilio', 'UND', 20.9, false, 3.0, 0.0),
  ('10000028', 'MANDILES JEAN', 'Uniformes', null, 'utensilio', 'UND', 19.44, false, 0.0, 9.0),
  ('8SDeXMAc6', 'MANDILES PLASTIFICADOS', 'Uniformes', null, 'utensilio', 'UND', 21.36, false, 9.0, 2.0),
  ('uG34DWxmM', 'MANDILLES MOZO FLORES', 'Uniformes', null, 'utensilio', 'UND', 20.32, false, 10.0, 0.0),
  ('8xBPk5Udc', 'MANDILLES MOZO UMARU', 'Uniformes', null, 'utensilio', 'UND', 54.36, false, 0.0, 5.0),
  ('R98WTZ0Xi', 'PANTALÓN DE CHEF T. S', 'Uniformes', null, 'utensilio', 'UND', 38.42, false, 0.0, 2.0),
  ('CdqqcKEHC', 'PANTALÓN MUJER T.L', 'Uniformes', null, 'utensilio', 'UND', 56.03, false, 8.0, 0.0),
  ('kYlJvw0GG', 'PANTALÓN VARÓN T.28', 'Uniformes', null, 'utensilio', 'UND', 51.8, false, 13.0, 0.0),
  ('10000017', 'ABRIDOR', 'Utensilios', null, 'utensilio', 'UND', 5.93, false, 8.0, 0.0),
  ('Qa7ztTQtC', 'BANDEJA METAL', 'Utensilios', null, 'utensilio', 'UND', 11.83, false, 1.0, 0.0),
  ('10000011', 'COLADORES REFRESCO', 'Utensilios', null, 'utensilio', 'UND', 42.64, false, 2.0, 1.0),
  ('10000016', 'CUCHILLAS DE LICUADORA MEDIANA', 'Utensilios', null, 'utensilio', 'UND', 59.92, false, 3.0, 1.0),
  ('10000245', 'CUCHILLO COCINERO', 'Utensilios', null, 'utensilio', 'UND', 15.58, false, 0.0, 1.0),
  ('10000246', 'CUCHILLOS HOTELERO ACERO', 'Utensilios', null, 'utensilio', 'UND', 3.4, false, 0.0, 24.0),
  ('10000248', 'ESPUMADERAS TEFLÓN', 'Utensilios', null, 'utensilio', 'UND', 17.66, false, 2.0, 2.0),
  ('10000015', 'HIELERA DE CUBITOS', 'Utensilios', null, 'utensilio', 'UND', 48.79, false, 0.0, 8.0),
  ('10000223', 'JARRA DE PLASTICO 2 LT', 'Utensilios', null, 'utensilio', 'UND', 6.16, false, 0.0, 1.0),
  ('10000249', 'JARRAS PORCELANA BLANCO 1 LT', 'Utensilios', null, 'utensilio', 'UND', 53.76, false, 0.0, 9.0),
  ('10000037', 'PERCHEROS', 'Utensilios', null, 'utensilio', 'UND', 61.05, false, 12.0, 16.0),
  ('10000254', 'TENEDORES EN ACERO', 'Utensilios', null, 'utensilio', 'UND', 9.96, false, 0.0, 60.0),
  ('10000239', 'VASO ACRILICO 3 ONZAS', 'Utensilios', null, 'utensilio', 'UND', 21.93, false, 0.0, 15.0),
  ('10000240', 'VASO ACRILICOS DE 7 ONZAS', 'Utensilios', null, 'utensilio', 'UND', 18.49, false, 8.0, 12.0),
  ('10000257', 'ARCHIVADORES', 'Útiles de oficina', null, 'suministro', 'UND', 10.33, false, 1.0, 4.0),
  ('10000259', 'CAJA DE GRAPAS', 'Útiles de oficina', null, 'suministro', 'UND', 6.9, false, 13.0, 1.0),
  ('10000261', 'CINTA EMBALAJE', 'Útiles de oficina', null, 'suministro', 'UND', 0.39, false, 4.0, 5.0),
  ('10000007', 'CINTA MASSKING', 'Útiles de oficina', null, 'suministro', 'UND', 13.58, false, 12.0, 11.0),
  ('10000008', 'CINTA SCOTH', 'Útiles de oficina', null, 'suministro', 'UND', 9.24, false, 14.0, 4.0),
  ('10000262', 'COMANDAS DE MOZO', 'Útiles de oficina', null, 'suministro', 'UND', 5.1, false, 66.0, 296.0),
  ('10000265', 'CUADERNOS GRANDES', 'Útiles de oficina', null, 'suministro', 'UND', 12.82, false, 76.0, 10.0),
  ('10000264', 'CUADERNOS PEQUEÑOS', 'Útiles de oficina', null, 'suministro', 'UND', 11.63, false, 8.0, 17.0),
  ('10000020', 'ENGRAPADOR', 'Útiles de oficina', null, 'suministro', 'UND', 11.48, false, 2.0, 4.0),
  ('10000266', 'FOLDER MANILA', 'Útiles de oficina', null, 'suministro', 'UND', 5.42, false, 575.0, 27.0),
  ('10000258', 'LAPICEROS AZUL', 'Útiles de oficina', null, 'suministro', 'UND', 8.44, false, 25.0, 21.0),
  ('10000003', 'LIGAS', 'Útiles de oficina', null, 'suministro', 'UND', 7.86, false, 73.0, 5.0),
  ('10000038', 'PILA AA GRANDE', 'Útiles de oficina', null, 'suministro', 'UND', 3.21, false, 6.0, 30.0),
  ('10000039', 'PILA AAA PEQUEÑA', 'Útiles de oficina', null, 'suministro', 'UND', 3.45, false, 10.0, 0.0)
), ins as (
  insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, costo_referencia, es_perecible, controla_lote)
  select 'P-' || s.codigo, s.nombre, s.tipo,
         coalesce((select c.id from categoria c join categoria pa on pa.id = c.padre_id where c.nombre = s.sub and pa.nombre = s.cat),
                  (select id from categoria where nombre = s.cat and padre_id is null)),
         (select id from unidad_medida where codigo = s.und), s.costo, s.perecible, s.perecible
  from s
  on conflict (codigo) do nothing
  returning id, codigo
), prods as (
  select id, codigo from ins
  union
  select id, codigo from producto where codigo in (select 'P-' || codigo from s)
)
insert into producto_almacen (producto_id, almacen_id, stock_minimo, stock_maximo)
select p.id, a.id,
       ceil(greatest(case when a.codigo = 'ALM-LF' then s.stock_lf else s.stock_um end, 1) * 0.3),
       ceil(greatest(case when a.codigo = 'ALM-LF' then s.stock_lf else s.stock_um end, 1) * 3)
from s
join prods p on p.codigo = 'P-' || s.codigo
join almacen a on a.codigo in ('ALM-LF', 'ALM-UM')
where (a.codigo = 'ALM-LF' and s.stock_lf > 0) or (a.codigo = 'ALM-UM' and s.stock_um > 0)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- A11. PROVEEDORES (lista de proveedores del MOF y base de datos 2026)
--      Teléfonos y cuentas bancarias se completan con los datos reales.
-- -----------------------------------------------------------------------------
insert into proveedor (razon_social, subcategoria, ciudad_id, forma_pedido, dias_pedido, condiciones_pago, fecha_registro, es_transportista, ruc)
select v.nombre, v.rubro, (select id from ciudad where nombre = v.ciudad), v.forma, v.dias, v.pago, v.fecha::date, v.transp, v.ruc
from (values
  ('AVES DON VIDAL', 'POLLO', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-01-02', false, null),
  ('DISTRIBUIDORA ATIX SAC', 'INSUMOS COCINA', 'Ayacucho', 'Aplicativo', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-01-03', false, null),
  ('NEGOCIACIONES JHOMER EIRL', 'REPOSTERÍA', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-01-05', false, null),
  ('DIPSA SAC', 'ART. LIMPIEZA', 'Ayacucho', 'Efectivo', 'SEGÚN REQUERIMIENTO', 'Efectivo', '2026-01-08', false, null),
  ('BACKUS SAA', 'CERVEZAS', 'Lima', 'Aplicativo', 'LUNES, MARTES O JUEVES', 'Crédito 15 días', '2026-01-10', false, null),
  ('DEYGON E.I.R.L.', 'GAS', 'Ayacucho', 'Llamada', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-01-12', false, null),
  ('INDUSTRIAS DRYMEL', 'ART. LIMPIEZA', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-01-15', false, null),
  ('DISTRAROJ SAC', 'GASEOSAS', 'Ayacucho', 'WhatsApp', 'MIÉRCOLES', 'Contado', '2026-01-18', false, null),
  ('REDONDOS', 'EMBUTIDOS', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-01-20', false, null),
  ('INVERSIONES SANLE EIRL', 'INSUMOS COCINA', 'Ayacucho', 'WhatsApp', 'LUNES, JUEVES O SÁBADO', 'Transferencia', '2026-01-16', false, null),
  ('INVERSIONES GEMINIS', 'VINO / ART. LIMPIEZA', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-02-02', false, null),
  ('INVERSIONES MASCAYPACHA', 'PISCO', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-02-06', false, null),
  ('DISTRIBUCIONES G&G', 'HIELO Y TRAGOS', 'Ayacucho', 'Llamada', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-02-11', false, null),
  ('DISCORP GLOBAL EIRL', 'VERDURAS', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-02-15', false, null),
  ('MERCADO NERY', 'MERCADO / HIERBAS', 'Ayacucho', 'Presencial', 'DIARIO', 'Efectivo', '2026-02-20', false, null),
  ('DISTRIBUCIONES JEHU', 'ABARROTES', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-03-03', false, null),
  ('TODO BAR', 'BAR', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-03-09', false, null),
  ('MC DESCARTABLES', 'PLÁSTICOS', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-03-14', false, null),
  ('LA FIDELIA', 'INFUSIONES Y TÉ', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-03-21', false, null),
  ('INVERMAC', 'EMPAQUES', 'Lima', 'Correo', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-04-02', false, null),
  ('CONTINENTAL GROUP', 'EMPAQUES AL VACÍO', 'Lima', 'Correo', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-04-10', false, null),
  ('MONTEORO ALIMENTOS', 'INFUSIONES', 'Lima', 'Correo', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-04-18', false, null),
  ('TODO PARA HOTEL', 'HOTELERÍA', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-05-04', false, null),
  ('ICO', 'HOTELERÍA', 'Lima', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-05-12', false, null),
  ('GLORIA', 'LÁCTEOS', 'Lima', 'Aplicativo', 'SEGÚN REQUERIMIENTO', 'Crédito 15 días', '2026-05-20', false, null),
  ('TAI LOY', 'ÚTILES', 'En línea', 'Web', 'SEGÚN REQUERIMIENTO', 'Tarjeta', '2026-06-03', false, null),
  ('COOLBOX PERÚ', 'ARTEFACTOS', 'En línea', 'Web', 'SEGÚN REQUERIMIENTO', 'Tarjeta', '2026-06-15', false, null),
  ('MAESTRANZA DIESEL BERMUDO E.I.R.L.', 'FABRICACIÓN ACERO INOXIDABLE', 'Ayacucho', 'Contrato', 'SEGÚN REQUERIMIENTO', 'Adelanto 50%', '2026-07-08', false, '20612100757'),
  ('NUOVA GROUP', 'MOBILIARIO', 'Lima', 'Correo', 'SEGÚN REQUERIMIENTO', 'Transferencia', '2026-08-05', false, null),
  ('QUIMA', 'VOLANTES, TARJETAS', 'Ayacucho', 'WhatsApp', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-08-19', false, null),
  ('TRANSPORTES DE PRUEBA LIMA–AYACUCHO', 'TRANSPORTE DE CARGA', 'Lima', 'Llamada', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-01-04', true, null),
  ('ENCOMIENDAS DE PRUEBA EXPRESS', 'TRANSPORTE DE CARGA', 'Lima', 'Llamada', 'SEGÚN REQUERIMIENTO', 'Contado', '2026-02-09', true, null)
) v(nombre, rubro, ciudad, forma, dias, pago, fecha, transp, ruc)
where not exists (select 1 from proveedor p where p.razon_social = v.nombre);

-- ===================================== FIN PARTE A =====================================

-- =============================================================================
-- PARTE B — DATOS TRANSACCIONALES DE PRUEBA (ene–sep 2026)
-- =============================================================================
do $$
declare
  v_lf uuid; v_um uuid;
  a_lf uuid; a_um uuid; of1 uuid; of2 uuid; coc_lf uuid; coc_um uuid; beb_um uuid;
  c_aya uuid; c_lima uuid; c_web uuid;
  p_fer uuid; p_her uuid; p_rob uuid; p_mer uuid; p_mel uuid; p_roy uuid;
  v_loc uuid; v_alm uuid; v_resp uuid; v_codloc text;
  v_m int; v_k int; v_n int; v_fecha date; v_aprob timestamptz; v_entrega timestamptz; v_ciudad uuid; v_prov uuid;
  v_comp uuid; v_cnt uuid; v_req uuid; v_tr uuid; v_venta uuid; v_cot uuid; v_rot uuid;
  v_lines jsonb; r record; v_hoy date := date '2026-09-27';
  v_items uuid[]; v_ofertas uuid[]; v_dia int;
begin
  perform setseed(0.2026);
  select id into v_lf from local where codigo = 'LF';     select id into v_um from local where codigo = 'UM';
  select id into a_lf from almacen where codigo = 'ALM-LF'; select id into a_um from almacen where codigo = 'ALM-UM';
  select id into of1 from almacen where codigo = 'OF-01';  select id into of2 from almacen where codigo = 'OF-02';
  select id into coc_lf from almacen where codigo = 'COC-LF'; select id into coc_um from almacen where codigo = 'COC-UM';
  select id into beb_um from almacen where codigo = 'BEB-UM';
  select id into c_aya from ciudad where nombre = 'Ayacucho'; select id into c_lima from ciudad where nombre = 'Lima';
  select id into c_web from ciudad where nombre = 'En línea';
  select id into p_fer from personal where nombres like 'FERNANDEZ LAPA%';
  select id into p_her from personal where nombres like 'ESCRIBA%';
  select id into p_rob from personal where nombres like 'ESPINOZA%';
  select id into p_mer from personal where nombres like 'ROMANÍ%';
  select id into p_mel from personal where nombres like 'OCHOA%';
  select id into p_roy from personal where nombres like 'ROY%';

  if exists (select 1 from movimiento) then
    raise notice 'Ya existen movimientos: se omite la Parte B';
    return;
  end if;

  -- B1. Stock inicial al 01/01/2026 --------------------------------------------------------
  for v_alm, v_codloc in select id, codigo from almacen where codigo in ('ALM-LF','ALM-UM') loop
    select jsonb_agg(jsonb_build_object('producto_id', p.id,
             'cantidad', case when p.unidad_id = (select id from unidad_medida where codigo='KG')
                              then round((q * (1.2 + random()))::numeric, 2) else ceil(q * (1.2 + random())) end,
             'costo_unitario', p.costo_referencia))
      into v_lines
    from (select pa.producto_id, pa.stock_maximo / 3.0 q from producto_almacen pa where pa.almacen_id = v_alm) s
    join producto p on p.id = s.producto_id and p.codigo like 'P-%'
    where s.q > 0;
    perform fn_registrar_movimiento('stock_inicial', v_alm, v_lines, timestamptz '2026-01-01 07:00', null, 'INV-INICIAL', 'Inventario inicial 2026');
  end loop;

  for v_alm in select id from almacen where tipo = 'oficina' loop
    select jsonb_agg(jsonb_build_object('producto_id', pa.producto_id, 'cantidad', pa.stock_objetivo, 'costo_unitario', p.costo_referencia))
      into v_lines from producto_almacen pa join producto p on p.id = pa.producto_id
     where pa.almacen_id = v_alm and pa.stock_objetivo > 0;
    perform fn_registrar_movimiento('stock_inicial', v_alm, v_lines, timestamptz '2026-01-01 07:00', null, 'INV-INICIAL', 'Stock par de bebidas');
  end loop;

  foreach v_alm in array array[coc_lf, coc_um] loop
    select jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad',
             case codigo when 'CAR-001' then 180 when 'CAR-002' then 150 else 40 + floor(random() * 40) end,
             'costo_unitario', costo_referencia))
      into v_lines from producto where tipo = 'carne';
    perform fn_registrar_movimiento('stock_inicial', v_alm, v_lines, timestamptz '2026-01-01 07:00', null, 'INV-INICIAL', 'Kardex de carnes');
  end loop;

  select jsonb_agg(jsonb_build_object('producto_id', id, 'cantidad', 20 + floor(random() * 160), 'costo_unitario', costo_referencia))
    into v_lines from producto where codigo like 'UTL-%';
  perform fn_registrar_movimiento('stock_inicial', (select id from almacen where codigo = 'SAL-LF'), v_lines,
            timestamptz '2026-01-01 07:00', null, 'INV-PATRIMONIAL', 'Inventario patrimonial 13/03/26');

  -- B2. Ciclo mensual por negocio ---------------------------------------------------------
  for v_m in 1..9 loop
    foreach v_loc in array array[v_lf, v_um] loop
      v_alm  := case when v_loc = v_lf then a_lf else a_um end;
      v_resp := case when v_loc = v_lf then p_her when v_m between 3 and 4 or v_m = 6 then p_mer else p_rob end;

      -- Compras (10–16 por mes) → recepción → stock + historial de precios
      for v_k in 1..(10 + floor(random() * 7))::int loop
        v_fecha := make_date(2026, v_m, 1 + floor(random() * 27)::int);
        continue when v_fecha > v_hoy;
        v_ciudad := case when random() < 0.62 then c_aya when random() < 0.8 then c_lima else c_web end;
        select id into v_prov from proveedor
         where not es_transportista and (ciudad_id = v_ciudad or random() < 0.15) order by random() limit 1;
        v_aprob := v_fecha + time '09:00' + (floor(random() * 5) || ' hours')::interval;
        insert into compra (local_id, almacen_id, proveedor_id, ciudad_id, fecha, fecha_aprobacion, fecha_compromiso,
                            tipo_documento, numero_documento, forma_pago, estado)
        values (v_loc, v_alm, v_prov, v_ciudad, v_fecha, v_aprob,
                case when v_ciudad = c_lima then v_aprob + interval '72 hours' end,
                case when random() < 0.75 then 'factura' else 'boleta' end,
                'F001-' || lpad((1000 + floor(random() * 8999))::text, 6, '0'),
                (array['Transferencia','Efectivo','Crédito 15 días'])[1 + floor(random() * 3)::int], 'aprobada')
        returning id into v_comp;

        insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, fecha_vencimiento)
        select v_comp, p.id, q, case when random() < 0.03 then greatest(q - 1, 0.5) else q end,
               round((p0.costo * (1 + 0.011 * (v_m - 1) + (random() - 0.5) * 0.14))::numeric, 2),
               case when p.controla_lote then v_fecha + (30 + floor(random() * 150))::int end
        from (select pr.id, pr.costo_referencia costo from producto pr
               join producto_almacen pa on pa.producto_id = pr.id and pa.almacen_id = v_alm
               where pr.codigo like 'P-%'
               order by random() limit (2 + floor(random() * 4))::int) p0
        join producto p on p.id = p0.id
        cross join lateral (select case when p.unidad_id = (select id from unidad_medida where codigo='KG')
                                        then round((2 + random() * 18)::numeric, 1) else ceil(3 + random() * 30) end q) qq;

        continue when v_fecha > v_hoy - 4;   -- las últimas quedan pendientes de recepción
        v_entrega := case when v_ciudad = c_lima then v_aprob + ((30 + floor(random() * 55)) || ' hours')::interval
                          when random() < 0.82 then v_aprob + ((2 + floor(random() * 20)) || ' hours')::interval
                          else v_aprob + ((26 + floor(random() * 50)) || ' hours')::interval end;
        perform fn_recibir_compra(v_comp, v_entrega);
        if v_ciudad = c_lima then
          insert into transporte (fecha, local_id, compra_id, transportista_id, ciudad_origen_id, destino, costo, peso_kg, bultos, documento)
          values (v_entrega::date, v_loc, v_comp,
                  (select id from proveedor where es_transportista order by random() limit 1), c_lima,
                  (select nombre from local where id = v_loc), round((25 + random() * 160)::numeric, 2),
                  round((5 + random() * 80)::numeric, 1), 1 + floor(random() * 6)::int,
                  'GR-' || lpad(floor(random() * 99999)::text, 5, '0'));
        end if;
      end loop;

      -- Consumo semanal de áreas
      for v_k in 0..3 loop
        v_fecha := make_date(2026, v_m, 6 + v_k * 7);
        continue when v_fecha > v_hoy;
        select jsonb_agg(jsonb_build_object('producto_id', s.producto_id,
                 'cantidad', round(greatest(s.cantidad * (0.08 + random() * 0.2), 0.5)::numeric, case when u.codigo = 'KG' then 2 else 0 end)))
          into v_lines
        from (select * from stock where almacen_id = v_alm and cantidad > 2 order by random() limit 18) s
        join producto p on p.id = s.producto_id join unidad_medida u on u.id = p.unidad_id;
        if v_lines is not null then
          perform fn_registrar_movimiento('salida_consumo', v_alm, v_lines, v_fecha + time '15:00',
                    (select id from motivo where codigo = 'CONSUMO_AREA'), null, 'Despacho semanal a áreas', v_resp);
        end if;
      end loop;

      -- Conteos físicos (2 al mes) con cierre, ajuste y descuento
      foreach v_dia in array array[6, 22] loop
        v_fecha := make_date(2026, v_m, v_dia);
        continue when v_fecha > v_hoy;
        insert into conteo (local_id, almacen_id, tipo, fecha, hora, responsable_conteo_id, responsable_almacen_id)
        values (v_loc, v_alm, 'almacen', v_fecha, time '14:00', p_fer, v_resp) returning id into v_cnt;
        perform fn_iniciar_conteo(v_cnt, true);
        update conteo_detalle d set conteo_1 =
          case when random() < 0.07 then greatest(0, d.stock_sistema + (case when random() < 0.65 then -1 else 1 end) * ceil(random() * 3))
               else d.stock_sistema end
        where d.conteo_id = v_cnt;
        update conteo_detalle set aplica_descuento = false
         where conteo_id = v_cnt and diferencia < 0 and random() < 0.25;   -- excluidos ("no")
        if v_m = 9 and v_dia = 22 and v_loc = v_lf then
          update conteo set estado = 'verificacion' where id = v_cnt;       -- queda pendiente
        else
          perform fn_cerrar_conteo(v_cnt, true, true);
        end if;
      end loop;

      -- Requerimientos de áreas
      for v_k in 1..(4 + floor(random() * 4))::int loop
        v_fecha := make_date(2026, v_m, 1 + floor(random() * 27)::int);
        continue when v_fecha > v_hoy;
        v_entrega := v_fecha + time '08:30' + floor(random() * 8) * interval '1 hour';
        v_aprob := v_entrega + (case when random() < 0.85 then 2 + random() * 18 else 26 + random() * 40 end) * interval '1 hour';
        insert into requerimiento (local_id, area_id, solicitante, prioridad, fecha_requerida, estado, created_at,
                                   aprobado_por, aprobado_at, atendido_at)
        select v_loc, a.id, (array['Jefe de cocina','Bar','Salón','Recepción','Mantenimiento'])[1 + floor(random() * 5)::int],
               (array['normal','normal','alta','urgente','baja'])[1 + floor(random() * 5)::int], v_fecha + 3,
               case when v_fecha > v_hoy - 5 then 'solicitado' else 'atendido' end,
               v_entrega,
               case when v_fecha <= v_hoy - 5 then 'FERNANDEZ LAPA, FERNANDA' end,
               case when v_fecha <= v_hoy - 5 then v_aprob end,
               case when v_fecha <= v_hoy - 5 then v_fecha + 3 + time '12:00' end
        from area a where a.local_id = v_loc order by random() limit 1
        returning id into v_req;
        insert into requerimiento_detalle (requerimiento_id, producto_id, descripcion, stock_actual, cantidad_solicitada, cantidad_aprobada, precio_estimado, motivo)
        select v_req, p.id, p.nombre, coalesce(s.cantidad, 0), q, case when v_fecha <= v_hoy - 5 then q end, p.costo_referencia, 'Reposición de stock'
        from (select id, nombre, costo_referencia from producto where tipo in ('insumo','limpieza','suministro') order by random() limit (1 + floor(random() * 4))::int) p
        left join stock s on s.producto_id = p.id and s.almacen_id = v_alm
        cross join lateral (select ceil(2 + random() * 15) q) qq;
      end loop;
    end loop;

    -- Bebidas de oficinas: conteo mensual contra stock par, faltantes a caja
    v_fecha := least(make_date(2026, v_m, 28), v_hoy);
    foreach v_alm in array array[of1, of2] loop
      insert into conteo (local_id, almacen_id, tipo, fuente_stock, fecha, hora, responsable_conteo_id, responsable_almacen_id)
      values (v_lf, v_alm, 'bebidas', 'objetivo', v_fecha, time '09:00', p_fer, p_mel) returning id into v_cnt;
      perform fn_iniciar_conteo(v_cnt);
      update conteo_detalle set conteo_1 = case when random() < 0.08 then greatest(stock_sistema - ceil(random() * 3), 0)
                                                 when random() < 0.03 then stock_sistema + 1 else stock_sistema end
       where conteo_id = v_cnt;
      perform fn_cerrar_conteo(v_cnt, false, true);
    end loop;

    -- Traslado mensual Las Flores → Hotel Umaru
    v_fecha := make_date(2026, v_m, 12);
    if v_fecha <= v_hoy then
      insert into traslado (fecha, almacen_origen_id, almacen_destino_id, motivo, entrega_personal_id, recibe_personal_id)
      values (v_fecha + time '10:00', a_lf, a_um, 'Abastecimiento Hotel Umaru', p_her, p_rob) returning id into v_tr;
      insert into traslado_detalle (traslado_id, producto_id, cantidad)
      select v_tr, s.producto_id, ceil(least(s.cantidad * 0.1, 10))
      from stock s join producto p on p.id = s.producto_id
      where s.almacen_id = a_lf and s.cantidad > 10 and p.tipo in ('insumo','limpieza','suministro')
      order by random() limit 4;
      perform fn_enviar_traslado(v_tr);
      if v_m < 9 then perform fn_recibir_traslado(v_tr, v_fecha + time '16:00'); end if;
    end if;
  end loop;

  -- B3. Carnes septiembre: compras a cocina, viandas diarias, conteo sabatino ----------------
  foreach v_alm in array array[coc_lf, coc_um] loop
    v_loc := (select local_id from almacen where id = v_alm);
    for v_dia in 1..27 loop
      v_fecha := make_date(2026, 9, v_dia);
      if extract(isodow from v_fecha) in (1, 4) then
        insert into compra (local_id, almacen_id, proveedor_id, ciudad_id, fecha, fecha_aprobacion, tipo_documento, numero_documento, estado)
        values (v_loc, v_alm, (select id from proveedor where razon_social = 'AVES DON VIDAL'), c_aya, v_fecha,
                v_fecha + time '07:00', 'boleta', 'B001-' || lpad(v_dia::text, 6, '0'), 'aprobada') returning id into v_comp;
        insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario)
        select v_comp, id, case when v_alm = coc_um then case codigo when 'CAR-001' then 16 when 'CAR-002' then 14 else 4 + floor(random() * 5) end
                            else case codigo when 'CAR-001' then 38 when 'CAR-002' then 36 else 11 + floor(random() * 9) end end,
               round((costo_referencia * (1 + (random() - 0.5) * 0.08))::numeric, 2)
        from producto where tipo = 'carne' and codigo <> 'CAR-011';
        perform fn_recibir_compra(v_comp, v_fecha + time '08:30');
      end if;

      insert into venta_vianda (local_id, fecha, registrado_por) values (v_loc, v_fecha, 'ROY (COCINA)') returning id into v_venta;
      insert into venta_vianda_detalle (venta_id, item_id, cantidad_salon, cantidad_llevar)
      select v_venta, i.id,
             floor(random() * case i.codigo when 'ENTERO' then 8 when 'MEDIO' then 14 when 'MIXTO' then 10
                                            when 'CHICHARRON' then 12 when 'PUCA' then 6 else 5 end
                   * case when v_alm = coc_um then 0.4 else 1 end),
             floor(random() * 4 * case when v_alm = coc_um then 0.3 else 1 end)
      from vianda_item i;
      if v_dia not in (10, 18) then     -- días sin registrar en Kardex → alertas de conciliación
        perform fn_generar_salida_viandas(v_venta, v_alm);
      end if;
      if random() < 0.25 then
        v_codloc := (array['MKT','PRUEBAS','CUMPLEANOS','PERSONAL'])[1 + floor(random() * 4)::int];
        perform fn_registrar_movimiento('salida_consumo', v_alm,
                  jsonb_build_array(jsonb_build_object('producto_id', (select id from producto where codigo = 'CAR-002'), 'cantidad', 1 + floor(random() * 3))),
                  v_fecha + time '20:00', (select id from motivo where codigo = v_codloc),
                  null, 'Salida de carnes', p_roy);
      end if;

      if extract(isodow from v_fecha) = 6 then   -- conteo físico sabatino
        insert into conteo (local_id, almacen_id, tipo, fecha, hora, responsable_conteo_id, responsable_almacen_id)
        values (v_loc, v_alm, 'carnes', v_fecha, time '22:30', p_fer, p_roy) returning id into v_cnt;
        perform fn_iniciar_conteo(v_cnt);
        update conteo_detalle set conteo_1 = case when random() < 0.15 then greatest(stock_sistema - ceil(random() * 2), 0) else stock_sistema end
         where conteo_id = v_cnt;
        perform fn_cerrar_conteo(v_cnt, true, false);
      end if;
    end loop;
  end loop;

  -- Requerimientos recientes pendientes de atención
  foreach v_loc in array array[v_lf, v_um] loop
    for v_k in 1..3 loop
      insert into requerimiento (local_id, area_id, solicitante, prioridad, fecha_requerida, estado, created_at)
      select v_loc, a.id, 'Jefe de área', (array['alta','normal','urgente'])[v_k], v_hoy + 2,
             (array['solicitado','en_cotizacion','aprobado'])[v_k], v_hoy - v_k + time '09:15'
      from area a where a.local_id = v_loc and a.nombre = (array['Cocina producción','Bar','Salón'])[v_k]
      returning id into v_req;
      insert into requerimiento_detalle (requerimiento_id, producto_id, descripcion, stock_actual, cantidad_solicitada, precio_estimado, motivo)
      select v_req, p.id, p.nombre, 0, 5 * v_k, p.costo_referencia, 'Stock bajo'
      from producto p where p.tipo = 'insumo' order by p.codigo offset v_k * 7 limit 2;
    end loop;
  end loop;
  update requerimiento set aprobado_por = 'FERNANDEZ LAPA, FERNANDA', aprobado_at = created_at + interval '5 hours'
   where estado = 'aprobado' and aprobado_at is null;

  -- B4. Cotizaciones (casos reales de TRAZABILIDAD DE PRECIOS, totales corregidos) -----------
  insert into cotizacion (local_id, fecha, titulo, estado, proveedor_aprobado_id)
  values (v_lf, date '2026-06-10', 'Bolsas de papel kraft para delivery', 'adjudicada', (select id from proveedor where razon_social = 'INVERMAC'))
  returning id into v_cot;
  insert into cotizacion_item (cotizacion_id, descripcion, cantidad, unidad) values
    (v_cot, 'BOLSAS DE PAPEL 42X26X22 CM', 1, 'MILLAR'), (v_cot, 'BOLSAS DE PAPEL 32X26X22 CM', 1, 'MILLAR'),
    (v_cot, 'BOLSAS DE PAPEL 38X22X18 CM', 2, 'MILLAR'), (v_cot, 'BOLSAS DE PAPEL 30X22X18 CM', 3, 'MILLAR');
  for v_k in 1..4 loop
    insert into cotizacion_oferta (cotizacion_id, proveedor_id, ronda, fecha)
    values (v_cot, (select id from proveedor where razon_social = 'INVERMAC'), v_k, date '2026-06-10' + v_k * 3);
  end loop;
  insert into cotizacion_precio (oferta_id, item_id, precio_unitario)
  select o.id, i.id, (array[[1250,1080,950,850],[1120,980,920,830],[1100,950,890,800],[1090,940,880,790]])[o.ronda][
           case i.descripcion when 'BOLSAS DE PAPEL 42X26X22 CM' then 1 when 'BOLSAS DE PAPEL 32X26X22 CM' then 2
                              when 'BOLSAS DE PAPEL 38X22X18 CM' then 3 else 4 end]
  from cotizacion_oferta o join cotizacion_item i on i.cotizacion_id = o.cotizacion_id where o.cotizacion_id = v_cot;

  insert into cotizacion (local_id, fecha, titulo, estado, proveedor_aprobado_id)
  values (v_um, date '2026-08-18', 'Mermeladas y mantequilla — desayunos hotel', 'adjudicada', (select id from proveedor where razon_social = 'ICO'))
  returning id into v_cot;
  insert into cotizacion_item (cotizacion_id, descripcion, cantidad, unidad) values
    (v_cot, 'MERMELADA DE FRESA WALI (CAJA)', 4, 'CAJA'), (v_cot, 'MERMELADA DE PIÑA WALI (CAJA)', 4, 'CAJA'),
    (v_cot, 'MANTEQUILLA LAIVE (CAJA)', 5, 'CAJA');
  insert into cotizacion_oferta (cotizacion_id, proveedor_id, ronda)
  select v_cot, id, 1 from proveedor where razon_social in ('TODO PARA HOTEL', 'ICO', 'GLORIA');
  insert into cotizacion_precio (oferta_id, item_id, precio_unitario)
  select o.id, i.id,
         case p.razon_social when 'TODO PARA HOTEL' then case when i.descripcion like 'MANTEQUILLA%' then 77.22 else 68.34 end
                             when 'ICO' then case when i.descripcion like 'MANTEQUILLA%' then 52.90 else 56.19 end
                             else case when i.descripcion like 'MANTEQUILLA%' then 51.76 else 59.80 end end
  from cotizacion_oferta o join proveedor p on p.id = o.proveedor_id join cotizacion_item i on i.cotizacion_id = o.cotizacion_id
  where o.cotizacion_id = v_cot;

  insert into cotizacion (local_id, fecha, titulo, estado)
  values (null, date '2026-09-24', 'Aceite vegetal x 20 L (100 baldes, ambos negocios)', 'abierta');

  -- B5. Roturas (hoja "CONTROL DE PÉRDIDAS Y DESCUENTOS POR ROTURAS") ------------------------
  for r in select * from (values
      ('2026-08-03', 'Bar',     'UTL-007', 'COPA SONCOSUA', 1, 12.0, false, array['FERDINAND']),
      ('2026-08-05', 'Bar',     'UTL-007', 'COPA SONCOSUA', 2, 12.0, true,  array['FERDINAND','SANDRO','ALDAHIR','LUCERO','LUCÍA','SHUMARA','DINA']),
      ('2026-08-09', 'Bar',     'UTL-008', 'JARRA DE VIDRIO 1 L', 2, 18.0, true, array['FERDINAND','SANDRO','ALDAHIR','LUCERO','LUCÍA','SHUMARA','DINA']),
      ('2026-08-12', 'Salón',   'UTL-013', 'PLATO MEDIO CUY REDONDO', 1, 25.0, false, array['SANDRO']),
      ('2026-08-15', 'Salón',   'UTL-001', 'VASO DE VIDRIO', 5, 3.0, false, array['SANDRO']),
      ('2026-08-20', 'Salón',   'UTL-003', 'CANCHICERO (ARCILLA)', 1, 32.0, false, array['SHUMARA']),
      ('2026-08-26', 'Salón',   'UTL-004', 'SALERO', 8, 20.0, true, array['FERDINAND','SANDRO','ALDAHIR','LUCERO','LUCÍA','SHUMARA','DINA']),
      ('2026-09-04', 'Azafate', 'UTL-014', 'PIREX ENSALADA', 3, 12.0, true, array['YERICK','DANIEL','YANDIRA']),
      ('2026-09-11', 'Azafate', 'UTL-011', 'PLATO TENDIDO LOZA 9"', 1, 16.0, false, array['DANIEL']),
      ('2026-09-16', 'Salón',   'UTL-015', 'PLATO DE MATE', 7, 8.0, true, array['FERDINAND','SANDRO','ALDAHIR','LUCERO','LUCÍA'])
    ) x(fecha, area, codigo, descr, cant, precio, grupal, resp)
  loop
    insert into rotura (fecha, local_id, area_id, producto_id, descripcion, cantidad, precio_unitario, es_grupal, pct_colaborador)
    values (r.fecha::date, v_lf, (select id from area where local_id = v_lf and nombre = r.area),
            (select id from producto where codigo = r.codigo), r.descr, r.cant, r.precio, r.grupal,
            case when r.grupal then 1 else 0.5 end)
    returning id into v_rot;
    insert into rotura_responsable (rotura_id, personal_id)
    select v_rot, id from personal where nombres = any(r.resp);
  end loop;
  perform fn_generar_descuentos_roturas(v_lf, date '2026-08-01');

  -- B6. Agenda de funciones de septiembre ---------------------------------------------------
  insert into tarea_registro (tarea_id, fecha, estado)
  select t.id, d::date,
         case when random() < 0.9 then 'ok' when random() < 0.5 then 'proceso' else 'no_realizado' end
  from tarea t cross join generate_series(date '2026-09-01', v_hoy, interval '1 day') d
  where (t.frecuencia = 'diaria' and extract(isodow from d) <> 2)
     or (t.frecuencia = 'semanal' and extract(isodow from d) = 1)
     or (t.frecuencia = 'mensual' and extract(day from d) = 1);

  -- B7. Estados de descuentos y cierre de periodos antiguos ---------------------------------
  update descuento set estado = 'aplicado' where fecha < date '2026-08-01';
  update descuento set estado = 'aprobado' where fecha >= date '2026-08-01' and fecha < date '2026-09-01';
  insert into periodo_cierre (local_id, anio, mes)
  select l.id, 2026, m from local l cross join generate_series(1, 6) m
  on conflict do nothing;
end $$;

