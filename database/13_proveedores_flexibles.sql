-- =============================================================================
--  13_proveedores_flexibles.sql
--  Logística no solo compra a proveedores formales: también en tiendas en línea
--  (AliExpress, Temu, Saga Falabella…), cadenas grandes (Dollarcity, Plaza Vea,
--  Sodimac…) y negocios locales. Se agrega:
--   · tipo de proveedor: proveedor formal / tienda en línea / negocio local
--   · una lista inicial con las tiendas y empresas más conocidas del Perú
--  Los poco conocidos se registran al momento desde la cotización o la compra
--  (solo nombre y tipo) y quedan en la lista para la próxima vez.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
alter table public.proveedor add column if not exists tipo text not null default 'proveedor';
alter table public.proveedor drop constraint if exists proveedor_tipo_check;
alter table public.proveedor add constraint proveedor_tipo_check check (tipo in ('proveedor', 'tienda_en_linea', 'negocio_local'));

-- Los que ya estaban registrados como compra "En línea" (Tai Loy, Coolbox…) pasan a tienda en línea
update public.proveedor set tipo = 'tienda_en_linea'
where tipo = 'proveedor' and ciudad_id = (select id from public.ciudad where nombre = 'En línea' limit 1);

-- Lista inicial. "clave" evita duplicar uno que ya exista con otro nombre (p. ej. COOLBOX PERÚ).
-- ciudad: 'En línea' para las que solo venden por internet; las cadenas con tienda física quedan sin ciudad.
insert into public.proveedor (razon_social, nombre_comercial, tipo, subcategoria, ciudad_id, forma_pedido, condiciones_pago, es_transportista)
select v.nombre, v.nombre, v.tipo, v.rubro,
       (select id from public.ciudad where nombre = v.ciudad limit 1),
       case when v.tipo = 'tienda_en_linea' then 'Compra en línea / tienda' else null end,
       case when v.tipo = 'tienda_en_linea' then 'Tarjeta / en línea' else null end,
       v.transp
from (values
  -- Tiendas y marketplaces por internet
  ('ALIEXPRESS',          'ALIEXPRESS',    'tienda_en_linea', 'MARKETPLACE',              'En línea', false),
  ('TEMU',                'TEMU',          'tienda_en_linea', 'MARKETPLACE',              'En línea', false),
  ('SHEIN',               'SHEIN',         'tienda_en_linea', 'MARKETPLACE / ROPA',       'En línea', false),
  ('AMAZON',              'AMAZON',        'tienda_en_linea', 'MARKETPLACE',              'En línea', false),
  ('MERCADO LIBRE',       'MERCADO LIBRE', 'tienda_en_linea', 'MARKETPLACE',              'En línea', false),
  -- Tiendas por departamento
  ('SAGA FALABELLA',      'FALABELLA',     'tienda_en_linea', 'TIENDA POR DEPARTAMENTO',  null, false),
  ('RIPLEY',              'RIPLEY',        'tienda_en_linea', 'TIENDA POR DEPARTAMENTO',  null, false),
  ('OECHSLE',             'OECHSLE',       'tienda_en_linea', 'TIENDA POR DEPARTAMENTO',  null, false),
  -- Supermercados y mayoristas
  ('PLAZA VEA',           'PLAZA VEA',     'tienda_en_linea', 'SUPERMERCADO',             null, false),
  ('TOTTUS',              'TOTTUS',        'tienda_en_linea', 'SUPERMERCADO',             null, false),
  ('WONG',                'WONG',          'tienda_en_linea', 'SUPERMERCADO',             null, false),
  ('METRO',               'METRO',         'tienda_en_linea', 'SUPERMERCADO',             null, false),
  ('VIVANDA',             'VIVANDA',       'tienda_en_linea', 'SUPERMERCADO',             null, false),
  ('MAKRO',               'MAKRO',         'tienda_en_linea', 'MAYORISTA',                null, false),
  ('MASS',                'MASS',          'negocio_local',   'TIENDA DE DESCUENTO',      null, false),
  ('TAMBO',               'TAMBO',         'negocio_local',   'TIENDA DE CONVENIENCIA',   null, false),
  ('OXXO',                'OXXO',          'negocio_local',   'TIENDA DE CONVENIENCIA',   null, false),
  -- Hogar, ferretería y bazar
  ('SODIMAC',             'SODIMAC',       'tienda_en_linea', 'FERRETERÍA / HOGAR',       null, false),
  ('PROMART',             'PROMART',       'tienda_en_linea', 'FERRETERÍA / HOGAR',       null, false),
  ('DOLLARCITY',          'DOLLARCITY',    'negocio_local',   'BAZAR / HOGAR',            null, false),
  ('CASAIDEAS',           'CASAIDEAS',     'tienda_en_linea', 'HOGAR / ORGANIZACIÓN',     null, false),
  ('MINISO',              'MINISO',        'negocio_local',   'BAZAR / HOGAR',            null, false),
  ('TAI LOY',             'TAI LOY',       'tienda_en_linea', 'ÚTILES / OFICINA',         null, false),
  -- Tecnología y electrodomésticos
  ('COOLBOX',             'COOLBOX',       'tienda_en_linea', 'TECNOLOGÍA',               null, false),
  ('HIRAOKA',             'HIRAOKA',       'tienda_en_linea', 'TECNOLOGÍA / ELECTRO',     null, false),
  ('EFE',                 'EFE',           'tienda_en_linea', 'ELECTRODOMÉSTICOS',        null, false),
  ('LA CURACAO',          'CURACAO',       'tienda_en_linea', 'ELECTRODOMÉSTICOS',        null, false),
  ('IMPACTO',             'IMPACTO',       'tienda_en_linea', 'TECNOLOGÍA / CÓMPUTO',     null, false),
  ('DELTRON',             'DELTRON',       'proveedor',       'TECNOLOGÍA / CÓMPUTO',     'Lima', false),
  ('STEREN',              'STEREN',        'tienda_en_linea', 'ELECTRÓNICA',              null, false),
  -- Farmacias
  ('INKAFARMA',           'INKAFARMA',     'tienda_en_linea', 'FARMACIA / BOTIQUÍN',      null, false),
  ('MIFARMA',             'MIFARMA',       'tienda_en_linea', 'FARMACIA / BOTIQUÍN',      null, false),
  ('BOTICAS HOGAR Y SALUD','HOGAR Y SALUD','tienda_en_linea', 'FARMACIA / BOTIQUÍN',      null, false),
  -- Fabricantes y distribuidores de alimentos y bebidas
  ('ALICORP',             'ALICORP',       'proveedor',       'ABARROTES / LIMPIEZA',     'Lima', false),
  ('GLORIA',              'GLORIA',        'proveedor',       'LÁCTEOS',                  'Lima', false),
  ('LAIVE',               'LAIVE',         'proveedor',       'LÁCTEOS / EMBUTIDOS',      'Lima', false),
  ('NESTLÉ PERÚ',         'NESTLÉ',        'proveedor',       'ALIMENTOS / CAFÉ',         'Lima', false),
  ('BACKUS',              'BACKUS',        'proveedor',       'CERVEZAS',                 'Lima', false),
  ('ARCA CONTINENTAL LINDLEY','LINDLEY',   'proveedor',       'GASEOSAS / AGUA',          'Lima', false),
  ('AJE',                 'AJE',           'proveedor',       'GASEOSAS / AGUA',          'Lima', false),
  ('CBC PERUANA (PEPSI)', 'CBC',           'proveedor',       'GASEOSAS / AGUA',          'Lima', false),
  ('SAN FERNANDO',        'SAN FERNANDO',  'proveedor',       'POLLO / CERDO / EMBUTIDOS','Lima', false),
  ('REDONDOS',            'REDONDOS',      'proveedor',       'POLLO / EMBUTIDOS',        'Lima', false),
  ('OTTO KUNZ',           'OTTO KUNZ',     'proveedor',       'EMBUTIDOS',                'Lima', false),
  ('MOLITALIA',           'MOLITALIA',     'proveedor',       'PASTAS / ABARROTES',       'Lima', false),
  ('COSTEÑO ALIMENTOS',   'COSTEÑO',       'proveedor',       'ARROZ / MENESTRAS',        'Lima', false),
  ('AJINOMOTO DEL PERÚ',  'AJINOMOTO',     'proveedor',       'CONDIMENTOS',              'Lima', false),
  ('SANTIAGO QUEIROLO',   'QUEIROLO',      'proveedor',       'VINOS / PISCO',            'Lima', false),
  ('TABERNERO',           'TABERNERO',     'proveedor',       'VINOS / PISCO',            'Lima', false),
  ('VIÑA TACAMA',         'TACAMA',        'proveedor',       'VINOS / PISCO',            'Lima', false),
  -- Limpieza, papeles y descartables
  ('SOFTYS (ELITE)',      'SOFTYS',        'proveedor',       'PAPEL HIGIÉNICO / TOALLAS','Lima', false),
  ('KIMBERLY-CLARK PERÚ', 'KIMBERLY',      'proveedor',       'PAPEL HIGIÉNICO / TOALLAS','Lima', false),
  ('INTRADEVCO (SAPOLIO)','INTRADEVCO',    'proveedor',       'ART. LIMPIEZA',            'Lima', false),
  ('CLOROX PERÚ',         'CLOROX',        'proveedor',       'ART. LIMPIEZA',            'Lima', false),
  ('PROCTER & GAMBLE PERÚ','PROCTER',      'proveedor',       'ART. LIMPIEZA / ASEO',     'Lima', false),
  ('UNILEVER PERÚ',       'UNILEVER',      'proveedor',       'ART. LIMPIEZA / ASEO',     'Lima', false),
  -- Transporte y encomiendas
  ('SHALOM',              'SHALOM',        'proveedor',       'ENCOMIENDAS',              null, true),
  ('OLVA COURIER',        'OLVA',          'proveedor',       'ENCOMIENDAS',              null, true),
  ('MARVISUR',            'MARVISUR',      'proveedor',       'ENCOMIENDAS',              null, true),
  ('CRUZ DEL SUR CARGO',  'CRUZ DEL SUR',  'proveedor',       'ENCOMIENDAS',              null, true)
) v(nombre, clave, tipo, rubro, ciudad, transp)
where not exists (
  select 1 from public.proveedor p
  where upper(p.razon_social) ~ ('\m' || v.clave || '\M')
     or upper(coalesce(p.nombre_comercial, '')) ~ ('\m' || v.clave || '\M')
);

-- Verificación: cuántos hay de cada tipo
select tipo, count(*) from public.proveedor group by tipo order by 1;
