-- =============================================================================
--  66_panel_produccion.sql
--  PANEL DE PRODUCCIÓN (antes «carnes»): el Área de Producción (Sr. Roly Nuñez Conde) registra todo;
--  Logística (Fernanda) solo revisa sus reportes. Reemplaza sus Excel y su cuaderno:
--    · KARDEX DE CARNES        → prod_movimiento (ingresos y salidas por concepto) + prod_conteo
--    · CONTROL DE CARNES Y VIANDAS → prod_venta (platos vendidos del día; descuenta solo del Kardex)
--    · cuaderno de papa y carnes → prod_movimiento tipo ingreso (sacos y/o kilos × precio, por proveedor)
--    · DIAGRAMA PRODUCCIÓN       → prod_funcion + prod_funcion_marca (OK / en proceso / no se realizó)
--  Sus productos y proveedores son PROPIOS: no se mezclan con el catálogo ni el stock de los almacenes.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
--  ANTES de ejecutar: reemplace CAMBIAR_CONTRASEÑA (sección 9) por la contraseña del usuario. No la guarde en el repositorio.
-- =============================================================================

-- 1) ROL Y PERMISOS -------------------------------------------------------------------------------
insert into public.rol (codigo, nombre, descripcion)
values ('produccion', 'Producción', 'Panel del Área de Producción: kardex de carnes, venta del día, ingresos de proveedores y diagrama')
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

insert into public.rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('produccion', 'produccion', true, true,  false),
  ('admin',      'produccion', true, false, false),   -- Logística: solo revisa los reportes
  ('logistica',  'produccion', true, false, false),
  ('consulta',   'produccion', true, false, false)
on conflict (rol, modulo) do update set leer = excluded.leer, escribir = excluded.escribir, aprobar = excluded.aprobar;

-- negocio de Producción (por ahora solo Restaurante Las Flores)
create or replace function public.fn_prod_local() returns uuid
language sql stable security definer set search_path = public as $$ select id from local where codigo = 'LF' $$;

-- 2) CATÁLOGO PROPIO ------------------------------------------------------------------------------
-- tipo: 'kardex' = carnes con saldo (cuy, chicharrón…); 'compra' = solo se registra lo que llega (papa, carne pulpa…)
create table if not exists public.prod_producto (
  id               uuid primary key default gen_random_uuid(),
  local_id         uuid not null default public.fn_prod_local() references public.local(id),
  nombre           text not null,
  tipo             text not null default 'compra' check (tipo in ('kardex', 'compra')),
  unidad           text not null default 'KG' check (unidad in ('KG', 'UND')),   -- en qué se paga / pesa
  porcion          text,                      -- kardex: qué se cuenta (platos, presas, filetes, unidades)
  gramos_porcion   numeric(10,2),             -- referencia: peso de cada presa / filete
  usa_sacos        boolean not null default false,   -- papa: llega en sacos y kilos
  hueso_grasa      boolean not null default false,   -- chicharrón, lechón
  merma            boolean not null default false,   -- ceviche, filete, lomo
  orden            int not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index if not exists ux_prod_producto_nombre on public.prod_producto (local_id, upper(nombre));

create table if not exists public.prod_proveedor (
  id         uuid primary key default gen_random_uuid(),
  local_id   uuid not null default public.fn_prod_local() references public.local(id),
  nombre     text not null,
  telefono   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_prod_proveedor_nombre on public.prod_proveedor (local_id, upper(nombre));

-- conceptos de salida del Kardex (los de su Excel)
create table if not exists public.prod_concepto (
  codigo text primary key,
  nombre text not null,
  orden  int not null default 0
);
insert into public.prod_concepto (codigo, nombre, orden) values
  ('venta', 'Venta', 1), ('puca', 'Puca (aderezo)', 2), ('perdida', 'Pérdida', 3), ('mkt', 'Marketing', 4),
  ('santa_elena', 'Santa Elena', 5), ('cumpleanos', 'Cumpleaños', 6), ('desayuno', 'Desayuno', 7),
  ('ensalada', 'Ensalada', 8), ('sopa_dieta', 'Sopa dieta', 9), ('pruebas', 'Pruebas', 10)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden;

-- 3) MOVIMIENTOS (ingresos y salidas) --------------------------------------------------------------
-- ingreso: de un proveedor (carnes del kardex y compras). Para el kardex, «cantidad» son las porciones que salen.
-- salida: solo carnes del kardex, por concepto; las de «venta» las genera la venta del día.
create table if not exists public.prod_movimiento (
  id           uuid primary key default gen_random_uuid(),
  local_id     uuid not null default public.fn_prod_local() references public.local(id),
  fecha        timestamptz not null default now(),
  tipo         text not null check (tipo in ('ingreso', 'salida')),
  producto_id  uuid not null references public.prod_producto(id),
  concepto     text references public.prod_concepto(codigo),
  proveedor_id uuid references public.prod_proveedor(id),
  guia         text,
  sacos        numeric(12,2),
  kilos        numeric(12,3),
  cantidad     numeric(12,3),          -- porciones (kardex) o unidades (compras en UND)
  precio       numeric(12,4),          -- por kilo o por unidad
  total        numeric(14,2),
  hueso        numeric(12,3),
  grasa        numeric(12,3),
  merma        numeric(12,3),
  venta_id     uuid,                   -- generada por la venta del día
  observacion  text,
  anulado      boolean not null default false,
  usuario_id   uuid default auth.uid() references public.usuario(id),
  created_at   timestamptz not null default now(),
  constraint prod_mov_salida_con_concepto check (tipo = 'ingreso' or concepto is not null)
);
create index if not exists ix_prod_mov_producto on public.prod_movimiento (producto_id, fecha);
create index if not exists ix_prod_mov_fecha on public.prod_movimiento (local_id, fecha);
create index if not exists ix_prod_mov_venta on public.prod_movimiento (venta_id);

-- conteo físico (columna CONTEO de su kardex): se compara con el saldo del sistema
create table if not exists public.prod_conteo (
  id           uuid primary key default gen_random_uuid(),
  local_id     uuid not null default public.fn_prod_local() references public.local(id),
  fecha        timestamptz not null default now(),
  producto_id  uuid not null references public.prod_producto(id),
  contado      numeric(12,3) not null,
  saldo        numeric(12,3) not null,    -- saldo del sistema en ese momento
  observacion  text,
  usuario_id   uuid default auth.uid() references public.usuario(id),
  created_at   timestamptz not null default now()
);

-- 4) VENTA DEL DÍA (platos de la hojita → carne) ----------------------------------------------------
create table if not exists public.prod_plato (
  id      uuid primary key default gen_random_uuid(),
  local_id uuid not null default public.fn_prod_local() references public.local(id),
  nombre  text not null,
  orden   int not null default 0,
  activo  boolean not null default true
);
create unique index if not exists ux_prod_plato_nombre on public.prod_plato (local_id, upper(nombre));
-- cuánta carne descuenta cada plato y con qué concepto (cuy medio = 0.5 cuy; mixto = 0.5 cuy + 0.6666 chicharrón)
create table if not exists public.prod_plato_carne (
  plato_id    uuid not null references public.prod_plato(id) on delete cascade,
  producto_id uuid not null references public.prod_producto(id),
  factor      numeric(10,4) not null,
  concepto    text not null default 'venta' references public.prod_concepto(codigo),
  primary key (plato_id, producto_id)
);
create table if not exists public.prod_venta (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null default public.fn_prod_local() references public.local(id),
  fecha       date not null,
  observacion text,
  usuario_id  uuid default auth.uid() references public.usuario(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (local_id, fecha)
);
create table if not exists public.prod_venta_detalle (
  venta_id uuid not null references public.prod_venta(id) on delete cascade,
  plato_id uuid not null references public.prod_plato(id),
  hoja1    numeric(12,2) not null default 0,
  hoja2    numeric(12,2) not null default 0,
  primary key (venta_id, plato_id)
);
alter table public.prod_movimiento drop constraint if exists prod_movimiento_venta_fk;
alter table public.prod_movimiento add constraint prod_movimiento_venta_fk foreign key (venta_id) references public.prod_venta(id) on delete cascade;

-- 5) DIAGRAMA DE PRODUCCIÓN -------------------------------------------------------------------------
create table if not exists public.prod_funcion (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null default public.fn_prod_local() references public.local(id),
  nombre      text not null,
  frecuencia  text not null check (frecuencia in ('diaria', 'semanal', 'mensual')),
  orden       int not null default 0,
  activo      boolean not null default true
);
create unique index if not exists ux_prod_funcion_nombre on public.prod_funcion (local_id, upper(nombre));
create table if not exists public.prod_funcion_marca (
  funcion_id uuid not null references public.prod_funcion(id) on delete cascade,
  fecha      date not null,
  estado     text not null check (estado in ('ok', 'proceso', 'no')),
  primary key (funcion_id, fecha)
);

-- 6) REPORTE SEMANAL ENVIADO A LOGÍSTICA -------------------------------------------------------------
create table if not exists public.prod_reporte (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null default public.fn_prod_local() references public.local(id),
  desde       date not null,
  hasta       date not null,
  observacion text,
  enviado_at  timestamptz not null default now(),
  usuario_id  uuid default auth.uid() references public.usuario(id)
);

-- 7) SEGURIDAD: Producción escribe; Logística solo lee ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['prod_producto','prod_proveedor','prod_concepto','prod_movimiento','prod_conteo','prod_plato',
                           'prod_plato_carne','prod_venta','prod_venta_detalle','prod_funcion','prod_funcion_marca','prod_reporte'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_leer on public.%I', t);
    execute format('drop policy if exists p_escribir on public.%I', t);
    execute format('create policy p_leer on public.%I for select to authenticated using ((select public.fn_puede(''produccion'', ''leer'')))', t);
    execute format('create policy p_escribir on public.%I for all to authenticated using ((select public.fn_puede(''produccion'', ''escribir''))) with check ((select public.fn_puede(''produccion'', ''escribir'')))', t);
  end loop;
end $$;

-- 8) VISTAS Y FUNCIONES ------------------------------------------------------------------------------
-- Kardex: cada movimiento con su signo y el saldo acumulado por producto
create or replace view public.v_prod_kardex with (security_invoker = true) as
select m.id, m.local_id, m.fecha, m.tipo, m.producto_id, p.nombre as producto, p.porcion, p.unidad,
       m.concepto, c.nombre as concepto_nombre, m.proveedor_id, pv.nombre as proveedor, m.guia,
       m.sacos, m.kilos, m.cantidad, m.precio, m.total, m.hueso, m.grasa, m.merma, m.venta_id, m.observacion,
       case when m.tipo = 'ingreso' then m.cantidad else -m.cantidad end as movimiento,
       sum(case when m.tipo = 'ingreso' then m.cantidad else -m.cantidad end)
         over (partition by m.producto_id order by m.fecha, m.created_at rows unbounded preceding) as saldo
from public.prod_movimiento m
join public.prod_producto p on p.id = m.producto_id
left join public.prod_concepto c on c.codigo = m.concepto
left join public.prod_proveedor pv on pv.id = m.proveedor_id
where not m.anulado and p.tipo = 'kardex';

-- Saldo actual de cada carne
create or replace view public.v_prod_saldo with (security_invoker = true) as
select p.id as producto_id, p.local_id, p.nombre, p.porcion, p.unidad, p.orden, p.gramos_porcion,
       coalesce(sum(case when m.tipo = 'ingreso' then m.cantidad else -m.cantidad end) filter (where not m.anulado), 0) as saldo,
       max(m.fecha) filter (where not m.anulado and m.tipo = 'ingreso') as ultimo_ingreso
from public.prod_producto p
left join public.prod_movimiento m on m.producto_id = p.id
where p.tipo = 'kardex' and p.activo
group by p.id;

-- Ingresos (de todos los productos) con proveedor: para el reporte de proveedores y su historial
create or replace view public.v_prod_ingreso with (security_invoker = true) as
select m.id, m.local_id, m.fecha, (m.fecha at time zone 'America/Lima')::date as dia, m.producto_id, p.nombre as producto, p.tipo as producto_tipo,
       p.unidad, p.porcion, m.proveedor_id, pv.nombre as proveedor, m.guia, m.sacos, m.kilos, m.cantidad, m.precio, m.total,
       m.hueso, m.grasa, m.merma, m.observacion, m.anulado, m.created_at, p.usa_sacos
from public.prod_movimiento m
join public.prod_producto p on p.id = m.producto_id
left join public.prod_proveedor pv on pv.id = m.proveedor_id
where m.tipo = 'ingreso';

-- Totalizado por carne y concepto en un periodo (reportes): ya sumado en la base
create or replace function public.fn_prod_totalizado(p_desde date, p_hasta date)
returns table(producto_id uuid, producto text, orden int, porcion text, concepto text, cantidad numeric, kilos numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.nombre, p.orden, p.porcion, case when m.tipo = 'ingreso' then 'ingreso' else m.concepto end,
         sum(m.cantidad), sum(m.kilos)
  from prod_movimiento m join prod_producto p on p.id = m.producto_id
  where not m.anulado and p.tipo = 'kardex'
    and (m.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  group by 1, 2, 3, 4, 5
$$;
grant execute on function public.fn_prod_totalizado(date, date) to authenticated;

-- Por mes (comparar julio, agosto, septiembre…)
create or replace view public.v_prod_mes with (security_invoker = true) as
select date_trunc('month', m.fecha at time zone 'America/Lima')::date as mes, p.id as producto_id, p.nombre as producto, p.orden,
       p.tipo as producto_tipo, m.tipo, m.concepto, sum(m.cantidad) as cantidad, sum(m.kilos) as kilos, sum(m.sacos) as sacos, sum(m.total) as total
from public.prod_movimiento m join public.prod_producto p on p.id = m.producto_id
where not m.anulado
group by 1, 2, 3, 4, 5, 6, 7;

-- Guardar la venta del día: guarda los platos y rehace las salidas que esa venta descuenta del Kardex
create or replace function public.fn_prod_guardar_venta(p_fecha date, p_lineas jsonb, p_observacion text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare v_venta uuid; n int;
begin
  if not public.fn_puede('produccion', 'escribir') then raise exception 'Solo Producción registra la venta del día'; end if;
  insert into prod_venta (fecha, observacion) values (p_fecha, nullif(trim(p_observacion), ''))
  on conflict (local_id, fecha) do update set observacion = excluded.observacion, updated_at = now()
  returning id into v_venta;
  delete from prod_venta_detalle where venta_id = v_venta;
  insert into prod_venta_detalle (venta_id, plato_id, hoja1, hoja2)
  select v_venta, (x->>'plato_id')::uuid, coalesce((x->>'hoja1')::numeric, 0), coalesce((x->>'hoja2')::numeric, 0)
  from jsonb_array_elements(p_lineas) x
  where coalesce((x->>'hoja1')::numeric, 0) <> 0 or coalesce((x->>'hoja2')::numeric, 0) <> 0;
  -- las salidas de esta venta se rehacen (si se corrige la hojita, el Kardex queda igual a lo nuevo)
  delete from prod_movimiento where venta_id = v_venta;
  insert into prod_movimiento (fecha, tipo, producto_id, concepto, cantidad, venta_id, observacion)
  select (p_fecha + time '23:00') at time zone 'America/Lima', 'salida', pc.producto_id, pc.concepto,
         round(sum((d.hoja1 + d.hoja2) * pc.factor), 2), v_venta, 'Venta del día'
  from prod_venta_detalle d join prod_plato_carne pc on pc.plato_id = d.plato_id
  where d.venta_id = v_venta
  group by pc.producto_id, pc.concepto
  having round(sum((d.hoja1 + d.hoja2) * pc.factor), 2) <> 0;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.fn_prod_guardar_venta(date, jsonb, text) to authenticated;

-- 9) USUARIO «Producción Las Flores» ----------------------------------------------------------------
do $$
declare v_uid uuid := 'a1f10000-0000-4000-8000-000000000005';
begin
  if not exists (select 1 from auth.users where id = v_uid) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
            'produccion.lasflores@lasflores.local', extensions.crypt('CAMBIAR_CONTRASEÑA', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"nombre":"Producción Las Flores"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', 'produccion.lasflores@lasflores.local', 'email_verified', true),
            'email', now(), now(), now());
  end if;
  insert into public.usuario (id, username, nombre, rol, todos_locales)
  values (v_uid, 'Producción Las Flores', 'Roly Nuñez Conde', 'produccion', false)
  on conflict (id) do update set rol = 'produccion', activo = true;
  insert into public.usuario_local (usuario_id, local_id) values (v_uid, public.fn_prod_local()) on conflict do nothing;
end $$;

-- 10) DATOS INICIALES (de sus Excel y su cuaderno) ----------------------------------------------------
insert into public.prod_producto (nombre, tipo, unidad, porcion, gramos_porcion, hueso_grasa, merma, orden) values
  ('CUY',        'kardex', 'UND', 'cuyes',   null, false, false, 1),
  ('CHICHARRÓN', 'kardex', 'KG',  'platos',  null, true,  false, 2),
  ('LECHÓN',     'kardex', 'KG',  'presas',  400,  true,  false, 3),
  ('CHULETA',    'kardex', 'KG',  'filetes', 375,  false, false, 4),
  ('TRUCHA',     'kardex', 'KG',  'truchas', 250,  false, false, 5),
  ('CEVICHE',    'kardex', 'KG',  'presas',  200,  false, true,  6),
  ('FILETE',     'kardex', 'KG',  'filetes', 200,  false, true,  7),
  ('POLLO',      'kardex', 'KG',  'platos',  250,  false, false, 8),
  ('MILANESA',   'kardex', 'KG',  'platos',  200,  false, false, 9),
  ('LOMO',       'kardex', 'KG',  'filetes', 300,  false, true,  10)
on conflict (local_id, upper(nombre)) do nothing;

insert into public.prod_producto (nombre, tipo, unidad, usa_sacos, orden) values
  ('PAPA BLANCA 1RA',    'compra', 'KG', true, 101), ('PAPA BLANCA 2DA',  'compra', 'KG', true, 102),
  ('PAPA CANCHÁN',       'compra', 'KG', true, 103), ('PAPA HUAYRO MACHO','compra', 'KG', true, 104),
  ('PAPA PERUANITA',     'compra', 'KG', true, 105), ('PAPA YUNGAY',      'compra', 'KG', true, 106),
  ('CARNE PULPA',        'compra', 'KG', false, 201), ('CARNE PULPA MOLIDA', 'compra', 'KG', false, 202),
  ('CARNE DE CHANCHO MOLIDA', 'compra', 'KG', false, 203), ('PANZA DE RES', 'compra', 'KG', false, 204),
  ('HUESO DE RES',       'compra', 'KG', false, 205)
on conflict (local_id, upper(nombre)) do nothing;
insert into public.prod_producto (nombre, tipo, unidad, orden) values ('PATA DE RES', 'compra', 'UND', 206)
on conflict (local_id, upper(nombre)) do nothing;

-- platos de la hojita (CONTROL DE CARNES Y VIANDAS) y la carne que descuenta cada uno
insert into public.prod_plato (nombre, orden) values
  ('CUY ENTERO', 1), ('CUY MEDIO', 2), ('MIXTO', 3), ('CHICHARRÓN', 4), ('PUCA', 5), ('LECHÓN', 6),
  ('CHULETA DE CERDO', 7), ('TRUCHA', 8), ('CEVICHE', 9), ('FILETE', 10), ('POLLO', 11), ('MILANESA', 12), ('LOMO', 13)
on conflict (local_id, upper(nombre)) do nothing;

insert into public.prod_plato_carne (plato_id, producto_id, factor, concepto)
select pl.id, pr.id, x.factor, x.concepto
from (values
  ('CUY ENTERO', 'CUY', 1, 'venta'), ('CUY MEDIO', 'CUY', 0.5, 'venta'),
  ('MIXTO', 'CUY', 0.5, 'venta'), ('MIXTO', 'CHICHARRÓN', 0.6666, 'venta'),
  ('CHICHARRÓN', 'CHICHARRÓN', 1, 'venta'), ('PUCA', 'CHICHARRÓN', 0.3333, 'puca'),
  ('LECHÓN', 'LECHÓN', 1, 'venta'), ('CHULETA DE CERDO', 'CHULETA', 1, 'venta'), ('TRUCHA', 'TRUCHA', 1, 'venta'),
  ('CEVICHE', 'CEVICHE', 1, 'venta'), ('FILETE', 'FILETE', 1, 'venta'), ('POLLO', 'POLLO', 1, 'venta'),
  ('MILANESA', 'MILANESA', 1, 'venta'), ('LOMO', 'LOMO', 1, 'venta')
) as x(plato, carne, factor, concepto)
join public.prod_plato pl on upper(pl.nombre) = x.plato and pl.local_id = public.fn_prod_local()
join public.prod_producto pr on upper(pr.nombre) = x.carne and pr.local_id = public.fn_prod_local()
on conflict (plato_id, producto_id) do nothing;

-- funciones del DIAGRAMA PRODUCCIÓN
insert into public.prod_funcion (nombre, frecuencia, orden) values
  ('Puntualidad y vestuario adecuado (uniforme de chef)', 'diaria', 1),
  ('Verificar los productos junto al área de Logística', 'diaria', 2),
  ('Recepción de los cuyes, verificando la calidad', 'diaria', 3),
  ('Cuadrar el kardex de las carnes', 'diaria', 4),
  ('Verificar la correcta ejecución de los procesos de cocina', 'diaria', 5),
  ('Mandar las comandas de cocina, buscando la correcta productividad', 'diaria', 6),
  ('Controlar que los ambientes queden completamente limpios al final del día', 'diaria', 7),
  ('Verificar si tienen reservaciones o festividades importantes con el área de ventas', 'diaria', 8),
  ('Realizar las llamadas a los proveedores de cuyes', 'diaria', 9),
  ('Verificar los menús del día (área de producción)', 'diaria', 10),
  ('Presentar los requerimientos diarios a Hernán y Liz Barrios', 'diaria', 11),
  ('Participar en la reunión semanal propuesta por la administración', 'semanal', 21),
  ('Reporte semanal del kardex de carnes', 'semanal', 22),
  ('Verificar las áreas de cada área (cocina, azafate, karaoke y llevadores)', 'semanal', 23),
  ('Verificar el requerimiento de productos indispensables (leña, carnes, especias, etc.)', 'semanal', 24),
  ('Realizar una reunión semanal con los jefes de áreas de producción (Gregoria, Mayte)', 'semanal', 25),
  ('Capacitación semanal con el administrador (Mijail Rodríguez)', 'semanal', 26),
  ('Entregar los ingresos por venta de mermas al área contable (lunes)', 'semanal', 27),
  ('Entregar el cuaderno de los requerimientos de Club Las Flores al área contable (viernes)', 'semanal', 28),
  ('Entregar los ingresos por venta de comida de chancho', 'mensual', 41),
  ('Presentar el kardex final del mes', 'mensual', 42),
  ('Plan de mejora continua, mediante propuestas en un plan de acción', 'mensual', 43),
  ('Realizar el inventario mensual de los artículos de las áreas (cocina, azafate, karaoke y llevadores)', 'mensual', 44),
  ('Búsqueda de proveedores nuevos', 'mensual', 45),
  ('Limpieza general de las distintas áreas', 'mensual', 46),
  ('Presentar el reporte de proveedores al área contable (pago de proveedores)', 'mensual', 47)
on conflict (local_id, upper(nombre)) do nothing;

-- Verificación
select (select count(*) from public.prod_producto) as productos, (select count(*) from public.prod_plato) as platos,
       (select count(*) from public.prod_plato_carne) as plato_carne, (select count(*) from public.prod_funcion) as funciones,
       (select username || ' · ' || rol from public.usuario where id = 'a1f10000-0000-4000-8000-000000000005') as usuario;
