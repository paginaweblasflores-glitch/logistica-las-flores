-- =============================================================================
--  SISTEMA DE LOGÍSTICA — CORPORACIÓN LAS FLORES
--  Restaurante Las Flores (Corporación Las Flores S.A.C.) + Hotel Umaru (Club Las Flores S.A.C.)
--
--  01_schema.sql  ·  Estructura completa: tablas, índices, triggers, vistas,
--                    funciones de negocio (RPC), KPIs, seguridad (RLS) y auditoría.
--
--  Ejecutar en Supabase → SQL Editor (o `psql -f`). Es idempotente para una base
--  vacía; para reinstalar ejecute primero el bloque "RESET" comentado al final.
--
--  Principios de diseño
--  • Libro de movimientos (ledger) inmutable: todo cambio de stock nace de un
--    movimiento. La tabla `stock` es un saldo materializado mantenido por trigger
--    → consultas de stock O(1) aun con millones de movimientos.
--  • Multi-negocio: todo documento cuelga de un `local` (negocio). Los reportes
--    reciben p_local = NULL para la vista GLOBAL (ambos negocios).
--  • KPIs calculados en la base (una sola fuente de verdad) y valorizados en S/,
--    corrigiendo los errores detectados en los Excel (ver docs/ANALISIS_EXCEL.md).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

set search_path = public, extensions;

-- Zona horaria del negocio: todas las conversiones fecha/hora (current_date, ::date) en hora de Lima
do $$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Lima');
end $$;
set timezone = 'America/Lima';

-- -----------------------------------------------------------------------------
-- 0. UTILIDADES GENERALES
-- -----------------------------------------------------------------------------

-- Normaliza texto para búsquedas (sin tildes, minúsculas, espacios simples)
create or replace function fn_normalizar(p text) returns text
language sql immutable parallel safe as $$
  select lower(regexp_replace(trim(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p,''))), '\s+', ' ', 'g'))
$$;

create or replace function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Correlativos de documentos (con bloqueo de fila → sin duplicados concurrentes)
create table if not exists correlativo (
  serie   text primary key,
  ultimo  integer not null default 0
);

create or replace function fn_siguiente_numero(p_serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into correlativo(serie, ultimo) values (p_serie, 1)
  on conflict (serie) do update set ultimo = correlativo.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- 1. ORGANIZACIÓN: EMPRESAS, NEGOCIOS (LOCALES), ALMACENES, ÁREAS
-- -----------------------------------------------------------------------------

create table if not exists empresa (
  id               uuid primary key default gen_random_uuid(),
  ruc              varchar(11) not null unique,
  razon_social     text not null,
  nombre_comercial text,
  direccion        text,
  created_at       timestamptz not null default now()
);

-- "local" = unidad de negocio (Restaurante Las Flores, Hotel Umaru, …)
create table if not exists local (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresa(id),
  codigo       varchar(10) not null unique,          -- LF, UM
  nombre       text not null,
  sufijo_doc   varchar(10) not null,                 -- LFS / UMR  (N° requerimiento)
  color        varchar(9)  not null default '#C8102E',
  activo       boolean not null default true,
  orden        smallint not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists almacen (
  id               uuid primary key default gen_random_uuid(),
  local_id         uuid not null references local(id),
  codigo           varchar(20) not null unique,
  nombre           text not null,
  tipo             text not null default 'almacen'
                   check (tipo in ('almacen','oficina','cocina','area','bar','activos')),
  es_principal     boolean not null default false,
  permite_negativo boolean not null default true,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists ix_almacen_local on almacen(local_id);

create table if not exists area (
  id         uuid primary key default gen_random_uuid(),
  local_id   uuid references local(id),              -- NULL = área compartida
  nombre     text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (local_id, nombre)
);

create table if not exists ciudad (               -- origen de compra: Lima, Ayacucho, En línea…
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden  smallint not null default 0
);

-- -----------------------------------------------------------------------------
-- 2. PERSONAL, USUARIOS, ROLES Y PERMISOS
-- -----------------------------------------------------------------------------

create table if not exists personal (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid references local(id),
  area_id     uuid references area(id),
  nombres     text not null,
  cargo       text,
  dni         varchar(12),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists ix_personal_local on personal(local_id);

create table if not exists rol (
  codigo      text primary key,                      -- admin, logistica, almacen, compras, cocina, mozo, consulta
  nombre      text not null,
  descripcion text
);

create table if not exists rol_permiso (
  rol      text not null references rol(codigo) on delete cascade,
  modulo   text not null,                            -- '*' = todos
  leer     boolean not null default true,
  escribir boolean not null default false,
  aprobar  boolean not null default false,
  primary key (rol, modulo)
);

-- Perfil de aplicación enlazado a auth.users
create table if not exists usuario (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique,
  nombre         text not null,
  rol            text not null references rol(codigo),
  personal_id    uuid references personal(id),
  todos_locales  boolean not null default false,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists ux_usuario_username_norm on usuario (fn_normalizar(username));

create table if not exists usuario_local (
  usuario_id uuid not null references usuario(id) on delete cascade,
  local_id   uuid not null references local(id) on delete cascade,
  primary key (usuario_id, local_id)
);

-- Helpers de seguridad (SECURITY DEFINER para evitar recursión de RLS)
create or replace function fn_puede(p_modulo text, p_accion text default 'leer') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from usuario u
    join rol_permiso rp on rp.rol = u.rol
    where u.id = auth.uid() and u.activo
      and (rp.modulo = p_modulo or rp.modulo = '*')
      and case p_accion when 'leer' then rp.leer
                        when 'escribir' then rp.escribir
                        when 'aprobar' then rp.aprobar
                        else false end
  )
$$;

create or replace function fn_tiene_local(p_local uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_local is null or exists (
    select 1 from usuario u
    where u.id = auth.uid() and u.activo
      and (u.todos_locales
           or exists (select 1 from usuario_local ul where ul.usuario_id = u.id and ul.local_id = p_local))
  )
$$;

-- Negocios visibles por el usuario actual (se evalúa una vez por consulta en RLS)
create or replace function fn_mis_locales() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when u.todos_locales then (select coalesce(array_agg(l.id), '{}') from local l)
              else (select coalesce(array_agg(ul.local_id), '{}') from usuario_local ul where ul.usuario_id = u.id) end
  from usuario u where u.id = auth.uid() and u.activo
$$;

-- Login por nombre de usuario ("Logística Las Flores"): devuelve el email interno
-- de Supabase Auth. Solo coincidencia exacta normalizada, sin listar usuarios.
create or replace function fn_email_por_usuario(p_username text) returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email
  from usuario u join auth.users au on au.id = u.id
  where fn_normalizar(u.username) = fn_normalizar(p_username) and u.activo
  limit 1
$$;
revoke all on function fn_email_por_usuario(text) from public;
grant execute on function fn_email_por_usuario(text) to anon, authenticated;

-- Lista para el desplegable del login: solo nombres de usuario activos (sin datos sensibles)
create or replace function fn_usuarios_login() returns table(username text)
language sql stable security definer set search_path = public as $$
  select u.username from usuario u where u.activo order by u.username
$$;
revoke all on function fn_usuarios_login() from public;
grant execute on function fn_usuarios_login() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. PARÁMETROS, CIERRE DE PERIODOS, AUDITORÍA
-- -----------------------------------------------------------------------------

create table if not exists parametro (
  clave       text primary key,
  valor       numeric,
  valor_texto text,
  descripcion text not null,
  updated_at  timestamptz not null default now()
);

create or replace function fn_param(p_clave text, p_default numeric default null) returns numeric
language sql stable as $$
  select coalesce((select valor from parametro where clave = p_clave), p_default)
$$;

create table if not exists periodo_cierre (
  local_id    uuid not null references local(id),
  anio        smallint not null,
  mes         smallint not null check (mes between 1 and 12),
  cerrado     boolean not null default true,
  cerrado_por uuid references auth.users(id),
  cerrado_at  timestamptz not null default now(),
  primary key (local_id, anio, mes)
);

create or replace function fn_periodo_cerrado(p_local uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from periodo_cierre
                 where local_id = p_local and cerrado
                   and anio = extract(year from p_fecha) and mes = extract(month from p_fecha))
$$;

create or replace function fn_validar_periodo(p_local uuid, p_fecha date) returns void
language plpgsql stable as $$
begin
  if fn_periodo_cerrado(p_local, p_fecha) then
    raise exception 'El periodo %/% está cerrado para este negocio. Solicite la reapertura a un administrador.',
      extract(month from p_fecha), extract(year from p_fecha) using errcode = 'P0001';
  end if;
end $$;

create table if not exists auditoria (
  id            bigint generated always as identity primary key,
  tabla         text not null,
  registro_id   text,
  accion        text not null,          -- INSERT / UPDATE / DELETE
  datos_antes   jsonb,
  datos_despues jsonb,
  usuario_id    uuid default auth.uid(),
  fecha         timestamptz not null default now()
);
create index if not exists ix_auditoria_tabla on auditoria(tabla, registro_id);
create index if not exists ix_auditoria_fecha on auditoria using brin(fecha);

create or replace function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  insert into auditoria(tabla, registro_id, accion, datos_antes, datos_despues)
  values (tg_table_name, v_id, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- -----------------------------------------------------------------------------
-- 4. CATÁLOGO DE PRODUCTOS
-- -----------------------------------------------------------------------------

create table if not exists unidad_medida (
  id          uuid primary key default gen_random_uuid(),
  codigo      varchar(10) not null unique,     -- UND, KG, L, ML…
  nombre      text not null
);

create table if not exists categoria (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  padre_id  uuid references categoria(id),
  unique (padre_id, nombre)
);

create table if not exists producto (
  id               uuid primary key default gen_random_uuid(),
  codigo           varchar(20) not null unique,          -- código interno del sistema
  codigo_barras    varchar(40),
  nombre           text not null,
  descripcion      text,
  tipo             text not null default 'insumo'
                   check (tipo in ('insumo','bebida','carne','utensilio','activo','suministro','limpieza')),
  categoria_id     uuid references categoria(id),
  unidad_id        uuid not null references unidad_medida(id),
  marca            text,
  presentacion     text,
  es_perecible     boolean not null default false,
  controla_lote    boolean not null default false,       -- FIFO por lotes/vencimiento
  costo_referencia numeric(14,4) not null default 0,
  precio_venta     numeric(14,4),
  imagen_url       text,                                 -- foto referencial (bucket "productos")
  activo           boolean not null default true,
  nombre_norm      text generated always as (lower(nombre)) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table producto add column if not exists imagen_url text;   -- bases creadas antes de este campo
create index if not exists ix_producto_nombre_trgm on producto using gin (nombre_norm extensions.gin_trgm_ops);
create index if not exists ix_producto_tipo on producto(tipo) where activo;
create index if not exists ix_producto_categoria on producto(categoria_id);

-- Parámetros por producto y almacén: mínimos, máximos, stock par (bebidas oficinas)
create table if not exists producto_almacen (
  producto_id    uuid not null references producto(id) on delete cascade,
  almacen_id     uuid not null references almacen(id) on delete cascade,
  stock_minimo   numeric(14,3) not null default 0,
  stock_maximo   numeric(14,3),
  stock_objetivo numeric(14,3),        -- stock fijo/par (p.ej. bebidas por oficina)
  ubicacion      text,
  primary key (producto_id, almacen_id)
);
create index if not exists ix_prod_alm_almacen on producto_almacen(almacen_id);

-- Catálogo único; cada producto se marca en el negocio donde se usa (Las Flores, Umaru o ambos).
-- El stock de cada negocio es independiente (tabla stock por almacén).
create table if not exists producto_local (
  producto_id uuid not null references producto(id) on delete cascade,
  local_id    uuid not null references local(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (producto_id, local_id)
);
create index if not exists ix_producto_local_local on producto_local(local_id);

-- Al marcar un producto en un negocio, nace con el stock mínimo por defecto en el almacén principal
create or replace function fn_producto_local_minimo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select new.producto_id, a.id, fn_param('stock_minimo_defecto', 10)
  from almacen a join producto p on p.id = new.producto_id
  where a.local_id = new.local_id and a.es_principal and p.tipo <> 'carne'
  on conflict (producto_id, almacen_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_producto_local_minimo on producto_local;
create trigger trg_producto_local_minimo after insert on producto_local
  for each row execute function fn_producto_local_minimo();

-- -----------------------------------------------------------------------------
-- 5. INVENTARIO: LEDGER DE MOVIMIENTOS, STOCK MATERIALIZADO Y LOTES (FIFO)
-- -----------------------------------------------------------------------------

create table if not exists tipo_movimiento (
  codigo      text primary key,
  nombre      text not null,
  signo       smallint not null check (signo in (-1, 1)),
  manual      boolean not null default true           -- se puede registrar a mano
);

create table if not exists motivo (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  nombre    text not null,
  aplica_a  text not null default 'salida' check (aplica_a in ('salida','ajuste','carnes','rotura','entrada')),
  activo    boolean not null default true
);

create table if not exists stock (
  producto_id    uuid not null references producto(id),
  almacen_id     uuid not null references almacen(id),
  cantidad       numeric(16,4) not null default 0,
  costo_promedio numeric(14,4) not null default 0,
  valor          numeric(18,4) generated always as (cantidad * costo_promedio) stored,
  ultimo_movimiento timestamptz,
  primary key (producto_id, almacen_id)
);
create index if not exists ix_stock_almacen on stock(almacen_id);

create table if not exists movimiento (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity,
  fecha          timestamptz not null default now(),
  tipo           text not null references tipo_movimiento(codigo),
  almacen_id     uuid not null references almacen(id),
  local_id       uuid references local(id),            -- derivado del almacén (trigger)
  motivo_id      uuid references motivo(id),
  referencia_tipo text check (referencia_tipo in ('compra','traslado','conteo','vianda','manual','requerimiento')),
  referencia_id  uuid,
  documento      text,
  personal_id    uuid references personal(id),
  observacion    text,
  anulado        boolean not null default false,
  anulado_at     timestamptz,
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists ix_mov_almacen_fecha on movimiento(almacen_id, fecha);
create index if not exists ix_mov_local_fecha on movimiento(local_id, fecha);
create index if not exists ix_mov_ref on movimiento(referencia_tipo, referencia_id);
create index if not exists ix_mov_fecha_brin on movimiento using brin(fecha);

create table if not exists movimiento_detalle (
  id              uuid primary key default gen_random_uuid(),
  movimiento_id   uuid not null references movimiento(id) on delete cascade,
  producto_id     uuid not null references producto(id),
  cantidad        numeric(16,4) not null check (cantidad > 0),
  costo_unitario  numeric(14,4),            -- entradas: costo de compra; salidas: costo promedio (auto)
  lote_id         uuid,                     -- lote elegido manualmente (salidas)
  fecha_vencimiento date,                   -- entradas con lote
  peso_kg         numeric(12,3),
  fifo_cumplido   boolean,                  -- salidas de productos con lote
  observacion     text
);
create index if not exists ix_movdet_mov on movimiento_detalle(movimiento_id);
create index if not exists ix_movdet_producto on movimiento_detalle(producto_id);
create index if not exists ix_movdet_fifo on movimiento_detalle(movimiento_id) where fifo_cumplido is not null;
create index if not exists ix_mov_motivo on movimiento(motivo_id, fecha) where motivo_id is not null;

create table if not exists lote (
  id                   uuid primary key default gen_random_uuid(),
  producto_id          uuid not null references producto(id),
  almacen_id           uuid not null references almacen(id),
  movimiento_id        uuid references movimiento(id),
  fecha_ingreso        timestamptz not null,
  fecha_vencimiento    date,
  cantidad_inicial     numeric(16,4) not null,
  cantidad_disponible  numeric(16,4) not null,
  costo_unitario       numeric(14,4) not null default 0
);
create index if not exists ix_lote_fifo on lote(producto_id, almacen_id, fecha_ingreso) where cantidad_disponible > 0;

create table if not exists lote_consumo (
  detalle_id uuid not null references movimiento_detalle(id) on delete cascade,
  lote_id    uuid not null references lote(id),
  cantidad   numeric(16,4) not null,
  primary key (detalle_id, lote_id)
);

-- Deriva local y valida periodo cerrado
create or replace function fn_movimiento_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select local_id into new.local_id from almacen where id = new.almacen_id;
  if tg_op = 'INSERT' then
    perform fn_validar_periodo(new.local_id, new.fecha::date);
  elsif tg_op = 'UPDATE' then
    if new.anulado is distinct from old.anulado then
      perform fn_validar_periodo(old.local_id, old.fecha::date);
      if old.anulado and not new.anulado then
        raise exception 'Un movimiento anulado no puede reactivarse';
      end if;
      new.anulado_at := case when new.anulado then now() end;
    elsif (new.fecha, new.almacen_id, new.tipo) is distinct from (old.fecha, old.almacen_id, old.tipo) then
      raise exception 'Los movimientos no se editan: anule y registre uno nuevo';
    end if;
  end if;
  return new;
end $$;

-- Aplica cada línea al stock: costo promedio ponderado, lotes y FIFO
create or replace function fn_movimiento_detalle_aplicar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov      movimiento%rowtype;
  v_signo    smallint;
  v_prod     producto%rowtype;
  v_stock    stock%rowtype;
  v_rest     numeric;
  v_toma     numeric;
  v_oldest   uuid;
  r          record;
begin
  select * into v_mov from movimiento where id = new.movimiento_id;
  if v_mov.anulado then raise exception 'No se puede agregar líneas a un movimiento anulado'; end if;
  select signo into v_signo from tipo_movimiento where codigo = v_mov.tipo;
  select * into v_prod from producto where id = new.producto_id;

  insert into stock(producto_id, almacen_id, cantidad, costo_promedio)
  values (new.producto_id, v_mov.almacen_id, 0, coalesce(new.costo_unitario, v_prod.costo_referencia, 0))
  on conflict do nothing;
  select * into v_stock from stock
   where producto_id = new.producto_id and almacen_id = v_mov.almacen_id for update;

  if v_signo > 0 then
    new.costo_unitario := coalesce(new.costo_unitario, v_stock.costo_promedio, v_prod.costo_referencia, 0);
    update stock set
      costo_promedio = case
        when greatest(v_stock.cantidad, 0) + new.cantidad > 0
        then round((greatest(v_stock.cantidad, 0) * v_stock.costo_promedio + new.cantidad * new.costo_unitario)
                   / (greatest(v_stock.cantidad, 0) + new.cantidad), 4)
        else costo_promedio end,
      cantidad = cantidad + new.cantidad,
      ultimo_movimiento = v_mov.fecha
    where producto_id = new.producto_id and almacen_id = v_mov.almacen_id;

    if v_prod.controla_lote then
      insert into lote(producto_id, almacen_id, movimiento_id, fecha_ingreso, fecha_vencimiento,
                       cantidad_inicial, cantidad_disponible, costo_unitario)
      values (new.producto_id, v_mov.almacen_id, v_mov.id, v_mov.fecha, new.fecha_vencimiento,
              new.cantidad, new.cantidad, new.costo_unitario);
    end if;
  else
    -- Salida: valoriza al costo promedio vigente (si no se indicó)
    new.costo_unitario := coalesce(new.costo_unitario, v_stock.costo_promedio);
    if v_stock.cantidad - new.cantidad < 0 and not (select permite_negativo from almacen where id = v_mov.almacen_id) then
      raise exception 'Stock insuficiente de "%" (disponible %, solicitado %)', v_prod.nombre, v_stock.cantidad, new.cantidad;
    end if;
    update stock set cantidad = cantidad - new.cantidad, ultimo_movimiento = v_mov.fecha
    where producto_id = new.producto_id and almacen_id = v_mov.almacen_id;
  end if;
  return new;
end $$;

-- Consumo FIFO de lotes (AFTER, cuando la línea ya existe para lote_consumo)
create or replace function fn_movimiento_detalle_fifo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov    movimiento%rowtype;
  v_signo  smallint;
  v_rest   numeric := new.cantidad;
  v_toma   numeric;
  v_oldest uuid;
  v_ok     boolean;
  r        record;
begin
  if not (select controla_lote from producto where id = new.producto_id) then return null; end if;
  select * into v_mov from movimiento where id = new.movimiento_id;
  select signo into v_signo from tipo_movimiento where codigo = v_mov.tipo;
  if v_signo > 0 then return null; end if;

  select id into v_oldest from lote
   where producto_id = new.producto_id and almacen_id = v_mov.almacen_id and cantidad_disponible > 0
   order by fecha_ingreso, fecha_vencimiento nulls last limit 1;
  v_ok := new.lote_id is null or new.lote_id = v_oldest or v_oldest is null;

  -- 1) lote elegido manualmente (si lo hay), 2) resto en orden FIFO
  for r in
    select id, cantidad_disponible from lote
     where producto_id = new.producto_id and almacen_id = v_mov.almacen_id and cantidad_disponible > 0
     order by (id = new.lote_id) desc, fecha_ingreso, fecha_vencimiento nulls last
     for update
  loop
    exit when v_rest <= 0;
    v_toma := least(v_rest, r.cantidad_disponible);
    update lote set cantidad_disponible = cantidad_disponible - v_toma where id = r.id;
    insert into lote_consumo(detalle_id, lote_id, cantidad) values (new.id, r.id, v_toma);
    v_rest := v_rest - v_toma;
  end loop;

  update movimiento_detalle set fifo_cumplido = v_ok where id = new.id;
  return null;
end $$;

-- Anulación: revierte stock y lotes
create or replace function fn_movimiento_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_signo smallint; d record; c record;
begin
  if not (new.anulado and not old.anulado) then return null; end if;
  select signo into v_signo from tipo_movimiento where codigo = new.tipo;
  for d in select * from movimiento_detalle where movimiento_id = new.id loop
    update stock set cantidad = cantidad - v_signo * d.cantidad
     where producto_id = d.producto_id and almacen_id = new.almacen_id;
    if v_signo > 0 then
      update lote set cantidad_disponible = greatest(cantidad_disponible - d.cantidad, 0)
       where movimiento_id = new.id and producto_id = d.producto_id;
    else
      for c in select * from lote_consumo where detalle_id = d.id loop
        update lote set cantidad_disponible = cantidad_disponible + c.cantidad where id = c.lote_id;
      end loop;
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists trg_movimiento_before on movimiento;
create trigger trg_movimiento_before before insert or update on movimiento
  for each row execute function fn_movimiento_before();
drop trigger if exists trg_movimiento_anular on movimiento;
create trigger trg_movimiento_anular after update of anulado on movimiento
  for each row execute function fn_movimiento_anular();
drop trigger if exists trg_movdet_aplicar on movimiento_detalle;
create trigger trg_movdet_aplicar before insert on movimiento_detalle
  for each row execute function fn_movimiento_detalle_aplicar();
drop trigger if exists trg_movdet_fifo on movimiento_detalle;
create trigger trg_movdet_fifo after insert on movimiento_detalle
  for each row execute function fn_movimiento_detalle_fifo();

-- Las líneas de movimiento son inmutables (se anula el movimiento completo)
create or replace function fn_bloquear_edicion() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'movimiento_detalle'
     and (new.producto_id, new.cantidad, new.costo_unitario, new.movimiento_id)
         is not distinct from (old.producto_id, old.cantidad, old.costo_unitario, old.movimiento_id) then
    return new;   -- permite actualizar fifo_cumplido / observación
  end if;
  raise exception 'Registro inmutable: anule el movimiento y registre uno nuevo';
end $$;
drop trigger if exists trg_movdet_inmutable on movimiento_detalle;
create trigger trg_movdet_inmutable before update or delete on movimiento_detalle
  for each row execute function fn_bloquear_edicion();

-- Registrar un movimiento completo en una sola llamada (RPC desde la app)
-- p_lineas: [{producto_id, cantidad, costo_unitario?, lote_id?, fecha_vencimiento?, peso_kg?, observacion?}]
create or replace function fn_registrar_movimiento(
  p_tipo text, p_almacen uuid, p_lineas jsonb, p_fecha timestamptz default now(),
  p_motivo uuid default null, p_documento text default null, p_observacion text default null,
  p_personal uuid default null, p_ref_tipo text default 'manual', p_ref_id uuid default null
) returns uuid
language plpgsql as $$
declare v_id uuid; l jsonb;
begin
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then
    raise exception 'El movimiento no tiene líneas';
  end if;
  insert into movimiento(fecha, tipo, almacen_id, motivo_id, documento, observacion, personal_id, referencia_tipo, referencia_id)
  values (p_fecha, p_tipo, p_almacen, p_motivo, p_documento, p_observacion, p_personal, p_ref_tipo, p_ref_id)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into movimiento_detalle(movimiento_id, producto_id, cantidad, costo_unitario, lote_id,
                                   fecha_vencimiento, peso_kg, observacion)
    values (v_id, (l->>'producto_id')::uuid, (l->>'cantidad')::numeric,
            nullif(l->>'costo_unitario','')::numeric, nullif(l->>'lote_id','')::uuid,
            nullif(l->>'fecha_vencimiento','')::date, nullif(l->>'peso_kg','')::numeric, l->>'observacion');
  end loop;
  return v_id;
end $$;

-- Recalcula cantidades de stock desde el ledger (mantenimiento / verificación)
create or replace function fn_recalcular_stock() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with saldo as (
    select d.producto_id, m.almacen_id, sum(t.signo * d.cantidad) as cant
    from movimiento_detalle d
    join movimiento m on m.id = d.movimiento_id and not m.anulado
    join tipo_movimiento t on t.codigo = m.tipo
    group by 1, 2)
  update stock s set cantidad = saldo.cant
  from saldo
  where s.producto_id = saldo.producto_id and s.almacen_id = saldo.almacen_id
    and s.cantidad <> saldo.cant;
  get diagnostics n = row_count;
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- 6. PROVEEDORES
-- -----------------------------------------------------------------------------

create table if not exists proveedor (
  id                uuid primary key default gen_random_uuid(),
  ruc               varchar(11),
  razon_social      text not null,
  nombre_comercial  text,
  subcategoria      text,                        -- rubro: POLLO, CERVEZAS, LIMPIEZA…
  categoria_id      uuid references categoria(id),
  ciudad_id         uuid references ciudad(id),
  direccion         text,
  telefono          text,
  email             text,
  contacto          text,
  condiciones_pago  text,                        -- contado, crédito 15 días…
  forma_pedido      text,                        -- WhatsApp, aplicativo, llamada…
  dias_pedido       text,                        -- "LUNES, MARTES O JUEVES", "SEGÚN REQUERIMIENTO"
  banco             text,
  titular_cuenta    text,
  numero_cuenta     text,
  es_transportista  boolean not null default false,
  activo            boolean not null default true,
  fecha_registro    date not null default current_date,
  observacion       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists ux_proveedor_ruc on proveedor(ruc) where ruc is not null and ruc <> '';
create index if not exists ix_proveedor_nombre_trgm on proveedor using gin (lower(razon_social) extensions.gin_trgm_ops);

create table if not exists proveedor_contacto (      -- contacto distinto por negocio
  id           uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedor(id) on delete cascade,
  local_id     uuid references local(id),
  nombre       text,
  telefono     text,
  email        text
);

-- -----------------------------------------------------------------------------
-- 7. REQUERIMIENTOS → COTIZACIONES → COMPRAS → TRANSPORTE → PRECIOS
-- -----------------------------------------------------------------------------

create table if not exists requerimiento (
  id              uuid primary key default gen_random_uuid(),
  numero          text unique,                          -- 001-2026-LOG-LFS
  local_id        uuid not null references local(id),
  area_id         uuid references area(id),
  solicitante     text not null,
  solicitante_personal_id uuid references personal(id),
  prioridad       text not null default 'normal' check (prioridad in ('baja','normal','alta','urgente')),
  fecha_requerida date,
  estado          text not null default 'solicitado'
                  check (estado in ('solicitado','en_cotizacion','aprobado','comprado','atendido','cerrado','rechazado')),
  aprobado_por    text,
  aprobado_at     timestamptz,
  atendido_at     timestamptz,
  observacion     text,
  created_by      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_req_local_estado on requerimiento(local_id, estado);
create index if not exists ix_req_fecha on requerimiento(created_at);

create table if not exists requerimiento_detalle (
  id                  uuid primary key default gen_random_uuid(),
  requerimiento_id    uuid not null references requerimiento(id) on delete cascade,
  producto_id         uuid references producto(id),
  descripcion         text not null,
  stock_actual        numeric(14,3),
  cantidad_solicitada numeric(14,3) not null check (cantidad_solicitada > 0),
  cantidad_aprobada   numeric(14,3),
  precio_estimado     numeric(14,4),
  motivo              text
);
create index if not exists ix_reqdet_req on requerimiento_detalle(requerimiento_id);

create table if not exists cotizacion (
  id               uuid primary key default gen_random_uuid(),
  numero           text unique,                          -- SC-2026-001
  requerimiento_id uuid references requerimiento(id),
  local_id         uuid references local(id),            -- NULL = para ambos negocios
  fecha            date not null default current_date,
  titulo           text not null,
  estado           text not null default 'abierta' check (estado in ('abierta','adjudicada','anulada')),
  proveedor_aprobado_id uuid references proveedor(id),
  observacion      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists cotizacion_item (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizacion(id) on delete cascade,
  producto_id   uuid references producto(id),
  descripcion   text not null,
  cantidad      numeric(14,3) not null check (cantidad > 0),
  unidad        text
);

-- Una oferta = un proveedor en una ronda de negociación (1ª, 2ª, … cotización)
create table if not exists cotizacion_oferta (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizacion(id) on delete cascade,
  proveedor_id  uuid not null references proveedor(id),
  ronda         smallint not null default 1,
  fecha         date not null default current_date,
  observacion   text,
  unique (cotizacion_id, proveedor_id, ronda)
);

create table if not exists cotizacion_precio (
  oferta_id       uuid not null references cotizacion_oferta(id) on delete cascade,
  item_id         uuid not null references cotizacion_item(id) on delete cascade,
  precio_unitario numeric(14,4) not null check (precio_unitario >= 0),
  primary key (oferta_id, item_id)
);

create table if not exists compra (
  id                uuid primary key default gen_random_uuid(),
  numero            text unique,                          -- OC-2026-00001
  local_id          uuid not null references local(id),
  almacen_id        uuid not null references almacen(id),
  proveedor_id      uuid references proveedor(id),
  ciudad_id         uuid references ciudad(id),           -- origen: Lima / Ayacucho / En línea
  fecha             date not null default current_date,   -- fecha de la compra/documento
  fecha_aprobacion  timestamptz,
  fecha_compromiso  timestamptz,                          -- entrega pactada (si no: aprobación + parámetro)
  fecha_entrega     timestamptz,                          -- recepción real
  tipo_documento    text check (tipo_documento in ('factura','boleta','guia','ticket','recibo','sin_documento')),
  numero_documento  text,
  forma_pago        text,
  estado            text not null default 'borrador'
                    check (estado in ('borrador','aprobada','recibida','anulada')),
  requerimiento_id  uuid references requerimiento(id),
  cotizacion_id     uuid references cotizacion(id),
  incluye_igv       boolean not null default true,
  observacion       text,
  created_by        uuid default auth.uid() references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ix_compra_local_fecha on compra(local_id, fecha);
create index if not exists ix_compra_proveedor on compra(proveedor_id);
create index if not exists ix_compra_estado on compra(estado);

create table if not exists compra_detalle (
  id                  uuid primary key default gen_random_uuid(),
  compra_id           uuid not null references compra(id) on delete cascade,
  producto_id         uuid not null references producto(id),
  cantidad_solicitada numeric(14,3) not null check (cantidad_solicitada > 0),
  cantidad_recibida   numeric(14,3),
  precio_unitario     numeric(14,4) not null check (precio_unitario >= 0),
  precio_anterior     numeric(14,4),          -- se completa solo desde el historial
  fecha_vencimiento   date,
  observacion         text
);
create index if not exists ix_compradet_compra on compra_detalle(compra_id);
create index if not exists ix_compradet_producto on compra_detalle(producto_id);

create table if not exists transporte (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  local_id        uuid references local(id),
  compra_id       uuid references compra(id) on delete set null,
  transportista_id uuid references proveedor(id),
  transportista   text,
  ciudad_origen_id uuid references ciudad(id),
  destino         text,
  costo           numeric(14,2) not null check (costo >= 0),
  peso_kg         numeric(12,2),
  bultos          integer,
  documento       text,
  observacion     text,
  created_at      timestamptz not null default now()
);
create index if not exists ix_transporte_fecha on transporte(fecha);
create index if not exists ix_transporte_compra on transporte(compra_id);

create table if not exists precio_historial (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references producto(id),
  proveedor_id  uuid references proveedor(id),
  local_id      uuid references local(id),
  fecha         date not null,
  precio        numeric(14,4) not null,
  tipo          text not null default 'compra' check (tipo in ('compra','referencia','cotizacion')),
  compra_detalle_id uuid references compra_detalle(id) on delete cascade,
  observacion   text,
  created_at    timestamptz not null default now()
);
create index if not exists ix_precio_prod_fecha on precio_historial(producto_id, tipo, fecha desc);
create index if not exists ix_precio_prov on precio_historial(proveedor_id);

-- Precio anterior automático al registrar la línea de compra
create or replace function fn_compra_detalle_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fecha date; v_local uuid;
begin
  select fecha, local_id into v_fecha, v_local from compra where id = new.compra_id;
  if new.precio_anterior is null then
    select precio into new.precio_anterior
    from precio_historial
    where producto_id = new.producto_id and tipo = 'compra' and fecha <= v_fecha
      and compra_detalle_id is distinct from new.id
    order by fecha desc, created_at desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_compra_detalle_before on compra_detalle;
create trigger trg_compra_detalle_before before insert on compra_detalle
  for each row execute function fn_compra_detalle_before();

-- Recepción de compra: entrada a almacén + historial de precios + costo de referencia
create or replace function fn_recibir_compra(p_compra uuid, p_fecha_entrega timestamptz default now()) returns uuid
language plpgsql as $$
declare v_c compra%rowtype; v_mov uuid; v_lineas jsonb;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.estado = 'recibida' then raise exception 'La compra % ya fue recibida', v_c.numero; end if;
  if v_c.estado = 'anulada' then raise exception 'La compra % está anulada', v_c.numero; end if;

  update compra_detalle set cantidad_recibida = coalesce(cantidad_recibida, cantidad_solicitada)
   where compra_id = p_compra;

  select jsonb_agg(jsonb_build_object(
           'producto_id', producto_id, 'cantidad', cantidad_recibida,
           'costo_unitario', precio_unitario, 'fecha_vencimiento', fecha_vencimiento))
    into v_lineas
  from compra_detalle where compra_id = p_compra and cantidad_recibida > 0;

  if v_lineas is not null then
    v_mov := fn_registrar_movimiento('entrada_compra', v_c.almacen_id, v_lineas, p_fecha_entrega, null,
               concat_ws(' ', v_c.tipo_documento, v_c.numero_documento), 'Recepción ' || v_c.numero,
               null, 'compra', p_compra);
  end if;

  insert into precio_historial(producto_id, proveedor_id, local_id, fecha, precio, tipo, compra_detalle_id)
  select d.producto_id, v_c.proveedor_id, v_c.local_id, v_c.fecha, d.precio_unitario, 'compra', d.id
  from compra_detalle d where d.compra_id = p_compra;

  update producto p set costo_referencia = d.precio_unitario, updated_at = now()
  from compra_detalle d where d.compra_id = p_compra and d.producto_id = p.id;

  update compra set estado = 'recibida',
                    fecha_entrega = p_fecha_entrega,
                    fecha_aprobacion = coalesce(fecha_aprobacion, p_fecha_entrega)
   where id = p_compra;
  return v_mov;
end $$;

create or replace function fn_anular_compra(p_compra uuid) returns void
language plpgsql as $$
begin
  update movimiento set anulado = true where referencia_tipo = 'compra' and referencia_id = p_compra and not anulado;
  delete from precio_historial where compra_detalle_id in (select id from compra_detalle where compra_id = p_compra);
  update compra set estado = 'anulada' where id = p_compra;
end $$;

-- -----------------------------------------------------------------------------
-- 8. TRASLADOS ENTRE ALMACENES / NEGOCIOS
-- -----------------------------------------------------------------------------

create table if not exists traslado (
  id                 uuid primary key default gen_random_uuid(),
  numero             text unique,                         -- TR-2026-0001
  fecha              timestamptz not null default now(),
  almacen_origen_id  uuid not null references almacen(id),
  almacen_destino_id uuid not null references almacen(id),
  motivo             text,
  entrega_personal_id uuid references personal(id),
  recibe_personal_id  uuid references personal(id),
  estado             text not null default 'enviado' check (estado in ('enviado','recibido','anulado')),
  recibido_at        timestamptz,
  observacion        text,
  created_by         uuid default auth.uid() references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (almacen_origen_id <> almacen_destino_id)
);

create table if not exists traslado_detalle (
  id                uuid primary key default gen_random_uuid(),
  traslado_id       uuid not null references traslado(id) on delete cascade,
  producto_id       uuid not null references producto(id),
  cantidad          numeric(14,3) not null check (cantidad > 0),
  peso_kg           numeric(12,3),
  precio            numeric(14,4),
  fecha_vencimiento date,
  observacion       text
);

-- Envío: descuenta el origen. Recepción: suma en destino (acta automática)
create or replace function fn_enviar_traslado(p_traslado uuid) returns uuid
language plpgsql as $$
declare v_t traslado%rowtype; v_lineas jsonb;
begin
  select * into v_t from traslado where id = p_traslado;
  if exists (select 1 from movimiento where referencia_tipo = 'traslado' and referencia_id = p_traslado
             and tipo = 'traslado_salida' and not anulado) then
    raise exception 'El traslado % ya fue despachado', v_t.numero;
  end if;
  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad,
                   'peso_kg', peso_kg, 'observacion', observacion))
    into v_lineas from traslado_detalle where traslado_id = p_traslado;
  return fn_registrar_movimiento('traslado_salida', v_t.almacen_origen_id, v_lineas, v_t.fecha, null,
           v_t.numero, coalesce(v_t.motivo, 'Traslado'), v_t.entrega_personal_id, 'traslado', p_traslado);
end $$;

create or replace function fn_recibir_traslado(p_traslado uuid, p_fecha timestamptz default now()) returns uuid
language plpgsql as $$
declare v_t traslado%rowtype; v_lineas jsonb; v_mov uuid;
begin
  select * into v_t from traslado where id = p_traslado for update;
  if v_t.estado <> 'enviado' then raise exception 'El traslado % no está pendiente de recepción', v_t.numero; end if;
  -- costo de destino = costo con el que salió del origen
  select jsonb_agg(jsonb_build_object('producto_id', td.producto_id, 'cantidad', td.cantidad,
                   'costo_unitario', coalesce(md.costo_unitario, td.precio),
                   'fecha_vencimiento', td.fecha_vencimiento, 'peso_kg', td.peso_kg))
    into v_lineas
  from traslado_detalle td
  left join lateral (
    select d.costo_unitario from movimiento m join movimiento_detalle d on d.movimiento_id = m.id
    where m.referencia_tipo = 'traslado' and m.referencia_id = p_traslado and m.tipo = 'traslado_salida'
      and not m.anulado and d.producto_id = td.producto_id limit 1) md on true
  where td.traslado_id = p_traslado;
  v_mov := fn_registrar_movimiento('traslado_entrada', v_t.almacen_destino_id, v_lineas, p_fecha, null,
             v_t.numero, coalesce(v_t.motivo, 'Traslado'), v_t.recibe_personal_id, 'traslado', p_traslado);
  update traslado set estado = 'recibido', recibido_at = p_fecha where id = p_traslado;
  return v_mov;
end $$;

-- -----------------------------------------------------------------------------
-- 9. CONTEOS FÍSICOS (almacén, bebidas, carnes, utensilios)
--    Flujo: Reporte inicial → Conteo (hasta 3 reconteos) → Verificación →
--           Resultado → Descuento → Reporte final (cierre, ajuste opcional)
-- -----------------------------------------------------------------------------

create table if not exists conteo (
  id                    uuid primary key default gen_random_uuid(),
  numero                text unique,                      -- CNT-LF-2026-001
  local_id              uuid not null references local(id),
  almacen_id            uuid not null references almacen(id),
  tipo                  text not null default 'almacen' check (tipo in ('almacen','bebidas','carnes','utensilios')),
  fuente_stock          text not null default 'sistema' check (fuente_stock in ('sistema','objetivo')),
  fecha                 date not null default current_date,
  hora                  time,
  responsable_conteo_id  uuid references personal(id),
  responsable_almacen_id uuid references personal(id),
  estado                text not null default 'abierto' check (estado in ('abierto','verificacion','cerrado','anulado')),
  ajuste_movimiento_id  uuid references movimiento(id),
  cerrado_at            timestamptz,
  observacion           text,
  created_by            uuid default auth.uid() references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ix_conteo_local_fecha on conteo(local_id, fecha);

create table if not exists conteo_detalle (
  id                uuid primary key default gen_random_uuid(),
  conteo_id         uuid not null references conteo(id) on delete cascade,
  producto_id       uuid not null references producto(id),
  stock_sistema     numeric(16,4) not null default 0,     -- snapshot "Reporte inicial"
  costo_unitario    numeric(14,4) not null default 0,
  conteo_1          numeric(16,4),
  conteo_2          numeric(16,4),
  conteo_3          numeric(16,4),
  cantidad_fisica   numeric(16,4),                         -- conteo final validado
  diferencia        numeric(16,4) generated always as (cantidad_fisica - stock_sistema) stored,
  valor_diferencia  numeric(16,4) generated always as ((cantidad_fisica - stock_sistema) * costo_unitario) stored,
  aplica_descuento  boolean not null default true,
  precio_descuento  numeric(14,4),                         -- si difiere del costo
  observacion       text,
  unique (conteo_id, producto_id)
);
create index if not exists ix_conteodet_conteo on conteo_detalle(conteo_id);

-- Cantidad final = último reconteo informado (si no se fijó manualmente)
create or replace function fn_conteo_detalle_before() returns trigger
language plpgsql as $$
begin
  if (select estado from conteo where id = new.conteo_id) in ('cerrado','anulado') then
    raise exception 'El conteo está cerrado';
  end if;
  if tg_op = 'INSERT' then
    new.cantidad_fisica := coalesce(new.conteo_3, new.conteo_2, new.conteo_1, new.cantidad_fisica);
  elsif (new.conteo_1, new.conteo_2, new.conteo_3) is distinct from (old.conteo_1, old.conteo_2, old.conteo_3)
        and new.cantidad_fisica is not distinct from old.cantidad_fisica then
    new.cantidad_fisica := coalesce(new.conteo_3, new.conteo_2, new.conteo_1);
  end if;
  return new;
end $$;

-- Guardado masivo desde la hoja de conteo/verificación (una sola llamada)
-- p_items: [{id, conteo_1?, conteo_2?, conteo_3?, cantidad_fisica?, aplica_descuento?, precio_descuento?, observacion?}]
create or replace function fn_guardar_conteo(p_conteo uuid, p_items jsonb) returns integer
language plpgsql as $$
declare n integer;
begin
  update conteo_detalle d set
    conteo_1 = case when i ? 'conteo_1' then nullif(i->>'conteo_1', '')::numeric else d.conteo_1 end,
    conteo_2 = case when i ? 'conteo_2' then nullif(i->>'conteo_2', '')::numeric else d.conteo_2 end,
    conteo_3 = case when i ? 'conteo_3' then nullif(i->>'conteo_3', '')::numeric else d.conteo_3 end,
    cantidad_fisica  = case when i ? 'cantidad_fisica' then nullif(i->>'cantidad_fisica', '')::numeric else d.cantidad_fisica end,
    aplica_descuento = case when i ? 'aplica_descuento' then (i->>'aplica_descuento')::boolean else d.aplica_descuento end,
    precio_descuento = case when i ? 'precio_descuento' then nullif(i->>'precio_descuento', '')::numeric else d.precio_descuento end,
    observacion      = case when i ? 'observacion' then nullif(i->>'observacion', '') else d.observacion end
  from jsonb_array_elements(p_items) i
  where d.conteo_id = p_conteo and d.id = (i->>'id')::uuid;
  get diagnostics n = row_count;
  return n;
end $$;

-- Agrega al conteo un producto encontrado físicamente que no estaba en el reporte inicial
create or replace function fn_agregar_producto_conteo(p_conteo uuid, p_producto uuid) returns uuid
language plpgsql as $$
declare v_c conteo%rowtype; v_id uuid;
begin
  select * into v_c from conteo where id = p_conteo;
  insert into conteo_detalle(conteo_id, producto_id, stock_sistema, costo_unitario)
  select p_conteo, p.id, coalesce(s.cantidad, 0), coalesce(nullif(s.costo_promedio, 0), p.costo_referencia, 0)
  from producto p left join stock s on s.producto_id = p.id and s.almacen_id = v_c.almacen_id
  where p.id = p_producto
  on conflict (conteo_id, producto_id) do nothing
  returning id into v_id;
  return v_id;
end $$;
drop trigger if exists trg_conteo_detalle_before on conteo_detalle;
create trigger trg_conteo_detalle_before before insert or update on conteo_detalle
  for each row execute function fn_conteo_detalle_before();

-- Genera el "Reporte inicial" (snapshot de stock) del almacén
create or replace function fn_iniciar_conteo(p_conteo uuid, p_solo_con_stock boolean default false) returns integer
language plpgsql as $$
declare v_c conteo%rowtype; n integer;
begin
  select * into v_c from conteo where id = p_conteo;
  if v_c.estado <> 'abierto' then raise exception 'Solo se inicializa un conteo abierto'; end if;
  delete from conteo_detalle where conteo_id = p_conteo and conteo_1 is null and cantidad_fisica is null;

  insert into conteo_detalle(conteo_id, producto_id, stock_sistema, costo_unitario)
  select p_conteo, p.id,
         case v_c.fuente_stock when 'objetivo' then coalesce(pa.stock_objetivo, 0) else coalesce(s.cantidad, 0) end,
         coalesce(nullif(s.costo_promedio, 0), p.costo_referencia, 0)
  from producto p
  left join stock s on s.producto_id = p.id and s.almacen_id = v_c.almacen_id
  left join producto_almacen pa on pa.producto_id = p.id and pa.almacen_id = v_c.almacen_id
  where p.activo
    and (s.producto_id is not null or pa.producto_id is not null)
    and (case v_c.tipo when 'bebidas' then p.tipo = 'bebida'
                       when 'carnes' then p.tipo = 'carne'
                       when 'utensilios' then p.tipo in ('utensilio','activo')
                       else true end)
    and (not p_solo_con_stock or coalesce(s.cantidad, pa.stock_objetivo, 0) <> 0)
  on conflict (conteo_id, producto_id) do update
    set stock_sistema = excluded.stock_sistema, costo_unitario = excluded.costo_unitario;
  get diagnostics n = row_count;
  return n;
end $$;

-- Cierre: ajuste de inventario (opcional) + descuento al responsable (opcional)
create or replace function fn_cerrar_conteo(p_conteo uuid, p_generar_ajuste boolean default true,
                                            p_generar_descuento boolean default true) returns jsonb
language plpgsql as $$
declare
  v_c conteo%rowtype; v_pos jsonb; v_neg jsonb; v_mov_pos uuid; v_mov_neg uuid; v_desc uuid;
  v_sin_contar integer;
begin
  select * into v_c from conteo where id = p_conteo for update;
  if v_c.estado in ('cerrado','anulado') then raise exception 'El conteo ya está cerrado'; end if;
  select count(*) into v_sin_contar from conteo_detalle where conteo_id = p_conteo and cantidad_fisica is null;
  if v_sin_contar > 0 then
    raise exception 'Hay % productos sin cantidad física. Complete el conteo o elimínelos.', v_sin_contar;
  end if;

  if p_generar_ajuste and v_c.fuente_stock = 'sistema' then
    select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', diferencia, 'costo_unitario', costo_unitario))
      into v_pos from conteo_detalle where conteo_id = p_conteo and diferencia > 0;
    select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', -diferencia))
      into v_neg from conteo_detalle where conteo_id = p_conteo and diferencia < 0;
    if v_pos is not null then
      v_mov_pos := fn_registrar_movimiento('ajuste_positivo', v_c.almacen_id, v_pos, (v_c.fecha + coalesce(v_c.hora, '23:59'))::timestamptz,
                     null, v_c.numero, 'Ajuste por conteo físico (sobrantes)', v_c.responsable_almacen_id, 'conteo', p_conteo);
    end if;
    if v_neg is not null then
      v_mov_neg := fn_registrar_movimiento('ajuste_negativo', v_c.almacen_id, v_neg, (v_c.fecha + coalesce(v_c.hora, '23:59'))::timestamptz,
                     null, v_c.numero, 'Ajuste por conteo físico (faltantes)', v_c.responsable_almacen_id, 'conteo', p_conteo);
    end if;
  end if;

  if p_generar_descuento and v_c.responsable_almacen_id is not null
     and exists (select 1 from conteo_detalle where conteo_id = p_conteo and diferencia < 0 and aplica_descuento) then
    insert into descuento(local_id, personal_id, origen, conteo_id, fecha, observacion)
    values (v_c.local_id, v_c.responsable_almacen_id, 'conteo', p_conteo, v_c.fecha,
            'Faltante determinado en conteo ' || v_c.numero)
    returning id into v_desc;
    insert into descuento_detalle(descuento_id, producto_id, descripcion, cantidad, precio_unitario)
    select v_desc, d.producto_id, p.nombre, -d.diferencia, coalesce(d.precio_descuento, d.costo_unitario)
    from conteo_detalle d join producto p on p.id = d.producto_id
    where d.conteo_id = p_conteo and d.diferencia < 0 and d.aplica_descuento;
  end if;

  update conteo set estado = 'cerrado', cerrado_at = now(), ajuste_movimiento_id = coalesce(v_mov_neg, v_mov_pos)
   where id = p_conteo;
  return jsonb_build_object('ajuste_sobrantes', v_mov_pos, 'ajuste_faltantes', v_mov_neg, 'descuento', v_desc);
end $$;

-- -----------------------------------------------------------------------------
-- 10. DESCUENTOS AL PERSONAL Y ROTURAS DE UTENSILIOS
-- -----------------------------------------------------------------------------

create table if not exists descuento (
  id          uuid primary key default gen_random_uuid(),
  numero      text unique,                         -- DSC-2026-0001
  local_id    uuid not null references local(id),
  personal_id uuid not null references personal(id),
  origen      text not null check (origen in ('conteo','rotura','bebidas','caja','manual')),
  conteo_id   uuid references conteo(id),
  fecha       date not null default current_date,
  periodo     date generated always as (date_trunc('month', fecha::timestamp)::date) stored,
  monto       numeric(14,2) not null default 0,     -- mantenido por trigger
  estado      text not null default 'propuesto' check (estado in ('propuesto','aprobado','aplicado','anulado')),
  observacion text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ix_descuento_local_periodo on descuento(local_id, periodo);
create index if not exists ix_descuento_personal on descuento(personal_id);

create table if not exists descuento_detalle (
  id              uuid primary key default gen_random_uuid(),
  descuento_id    uuid not null references descuento(id) on delete cascade,
  producto_id     uuid references producto(id),
  descripcion     text not null,
  cantidad        numeric(14,3) not null,
  precio_unitario numeric(14,4) not null,
  importe         numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  rotura_id       uuid
);

create or replace function fn_descuento_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.descuento_id, old.descuento_id);
begin
  update descuento set monto = coalesce((select sum(importe) from descuento_detalle where descuento_id = v_id), 0)
   where id = v_id;
  return null;
end $$;
drop trigger if exists trg_descuento_total on descuento_detalle;
create trigger trg_descuento_total after insert or update or delete on descuento_detalle
  for each row execute function fn_descuento_total();

create table if not exists rotura (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  local_id        uuid not null references local(id),
  area_id         uuid references area(id),
  producto_id     uuid references producto(id),
  descripcion     text not null,
  cantidad        numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  total           numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  pct_colaborador numeric(5,4) not null default 0.5 check (pct_colaborador between 0 and 1),
  es_grupal       boolean not null default false,        -- "TODOS": se reparte entre el personal
  tipo            text not null default 'rotura' check (tipo in ('rotura','perdida','mal_estado')),
  descontado      boolean not null default false,
  observacion     text,
  created_at      timestamptz not null default now()
);
create index if not exists ix_rotura_local_fecha on rotura(local_id, fecha);

create table if not exists rotura_responsable (
  rotura_id   uuid not null references rotura(id) on delete cascade,
  personal_id uuid not null references personal(id),
  primary key (rotura_id, personal_id)
);

-- Genera los descuentos del mes por roturas:
-- cargo de cada responsable = total × % colaborador ÷ N° responsables
create or replace function fn_generar_descuentos_roturas(p_local uuid, p_periodo date) returns integer
language plpgsql as $$
declare r record; v_desc uuid; n integer := 0;
begin
  for r in
    select rr.personal_id
    from rotura ro join rotura_responsable rr on rr.rotura_id = ro.id
    where ro.local_id = p_local and not ro.descontado
      and ro.fecha >= date_trunc('month', p_periodo) and ro.fecha < date_trunc('month', p_periodo) + interval '1 month'
    group by rr.personal_id
  loop
    insert into descuento(local_id, personal_id, origen, fecha, observacion)
    values (p_local, r.personal_id, 'rotura', (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date,
            'Roturas/pérdidas de ' || to_char(p_periodo, 'MM/YYYY'))
    returning id into v_desc;
    insert into descuento_detalle(descuento_id, producto_id, descripcion, cantidad, precio_unitario, rotura_id)
    select v_desc, ro.producto_id,
           ro.descripcion || case when ro.es_grupal then ' (grupal ÷' || cnt.n || ')' else '' end,
           ro.cantidad, round(ro.precio_unitario * ro.pct_colaborador / cnt.n, 4), ro.id
    from rotura ro
    join rotura_responsable rr on rr.rotura_id = ro.id and rr.personal_id = r.personal_id
    join lateral (select count(*)::numeric n from rotura_responsable x where x.rotura_id = ro.id) cnt on true
    where ro.local_id = p_local and not ro.descontado
      and ro.fecha >= date_trunc('month', p_periodo) and ro.fecha < date_trunc('month', p_periodo) + interval '1 month';
    n := n + 1;
  end loop;
  update rotura set descontado = true
   where local_id = p_local and not descontado
     and fecha >= date_trunc('month', p_periodo) and fecha < date_trunc('month', p_periodo) + interval '1 month'
     and exists (select 1 from rotura_responsable where rotura_id = rotura.id);
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- 11. CARNES: VENTA DE VIANDAS Y CONCILIACIÓN CON KARDEX
-- -----------------------------------------------------------------------------

-- Ítems que registra caja/cocina (ENTERO, MEDIO, MIXTO, PUCA, …)
create table if not exists vianda_item (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  orden  smallint not null default 0,
  activo boolean not null default true
);

-- Receta: cuánto de cada carne del Kardex consume un ítem vendido
-- (Excel: CUY = ENTERO + MEDIO/2 + MIXTO/2 ; CHICHARRÓN = CHICHARRÓN + MIXTO×⅔ + PUCA/3)
create table if not exists vianda_conversion (
  item_id     uuid not null references vianda_item(id) on delete cascade,
  producto_id uuid not null references producto(id),
  factor      numeric(10,6) not null check (factor > 0),
  primary key (item_id, producto_id)
);

create table if not exists venta_vianda (
  id             uuid primary key default gen_random_uuid(),
  local_id       uuid not null references local(id),
  fecha          date not null,
  registrado_por text,
  movimiento_id  uuid references movimiento(id),       -- salida generada al Kardex
  observacion    text,
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (local_id, fecha)
);

create table if not exists venta_vianda_detalle (
  venta_id          uuid not null references venta_vianda(id) on delete cascade,
  item_id           uuid not null references vianda_item(id),
  cantidad_salon    numeric(10,2) not null default 0,
  cantidad_llevar   numeric(10,2) not null default 0,
  cantidad          numeric(10,2) generated always as (cantidad_salon + cantidad_llevar) stored,
  primary key (venta_id, item_id)
);

-- Genera la salida "VENTA" en el Kardex de carnes a partir de la venta (evita doble digitación)
create or replace function fn_generar_salida_viandas(p_venta uuid, p_almacen uuid) returns uuid
language plpgsql as $$
declare v_v venta_vianda%rowtype; v_lineas jsonb; v_mov uuid;
begin
  select * into v_v from venta_vianda where id = p_venta for update;
  if v_v.movimiento_id is not null then
    update movimiento set anulado = true where id = v_v.movimiento_id and not anulado;
  end if;
  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', round(consumo, 4)))
    into v_lineas
  from (select c.producto_id, sum(d.cantidad * c.factor) consumo
        from venta_vianda_detalle d join vianda_conversion c on c.item_id = d.item_id
        where d.venta_id = p_venta group by c.producto_id having sum(d.cantidad * c.factor) > 0) x;
  if v_lineas is null then return null; end if;
  v_mov := fn_registrar_movimiento('salida_venta', p_almacen, v_lineas, (v_v.fecha + time '23:00')::timestamptz,
             (select id from motivo where codigo = 'VENTA'), null, 'Venta de viandas ' || to_char(v_v.fecha, 'DD/MM/YYYY'),
             null, 'vianda', p_venta);
  update venta_vianda set movimiento_id = v_mov where id = p_venta;
  return v_mov;
end $$;

-- -----------------------------------------------------------------------------
-- 12. DOCUMENTOS Y TAREAS (AGENDA DE FUNCIONES)
-- -----------------------------------------------------------------------------

create table if not exists documento (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,     -- acta, traslado, informe, cotizacion, requerimiento, contrato, fifo, diagrama, otro
  titulo       text not null,
  descripcion  text,
  storage_path text,              -- bucket "documentos"
  mime_type    text,
  tamano_bytes bigint,
  fecha        date not null default current_date,
  local_id     uuid references local(id),
  area_id      uuid references area(id),
  proveedor_id uuid references proveedor(id),
  compra_id    uuid references compra(id),
  traslado_id  uuid references traslado(id),
  producto_id  uuid references producto(id),
  responsable_id uuid references personal(id),
  created_by   uuid default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists ix_documento_tipo_fecha on documento(tipo, fecha desc);

create table if not exists tarea (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  frecuencia text not null check (frecuencia in ('diaria','semanal','mensual')),
  orden      smallint not null default 0,
  activo     boolean not null default true
);

create table if not exists tarea_registro (
  tarea_id    uuid not null references tarea(id) on delete cascade,
  fecha       date not null,
  estado      text not null check (estado in ('ok','proceso','no_realizado')),
  observacion text,
  usuario_id  uuid default auth.uid(),
  primary key (tarea_id, fecha)
);

-- -----------------------------------------------------------------------------
-- 13. NUMERACIÓN AUTOMÁTICA DE DOCUMENTOS
-- -----------------------------------------------------------------------------

create or replace function fn_numerar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_anio text := to_char(coalesce((to_jsonb(new)->>'fecha')::timestamptz, now()), 'YYYY');
        v_loc text;
begin
  if new.numero is not null then return new; end if;
  case tg_table_name
    when 'requerimiento' then
      select sufijo_doc into v_loc from local where id = new.local_id;
      new.numero := lpad(fn_siguiente_numero('REQ-' || v_anio || '-' || v_loc)::text, 3, '0') || '-' || v_anio || '-LOG-' || v_loc;
    when 'compra' then
      new.numero := 'OC-' || v_anio || '-' || lpad(fn_siguiente_numero('OC-' || v_anio)::text, 5, '0');
    when 'cotizacion' then
      new.numero := 'SC-' || v_anio || '-' || lpad(fn_siguiente_numero('SC-' || v_anio)::text, 3, '0');
    when 'traslado' then
      new.numero := 'TR-' || v_anio || '-' || lpad(fn_siguiente_numero('TR-' || v_anio)::text, 4, '0');
    when 'conteo' then
      select codigo into v_loc from local where id = new.local_id;
      new.numero := 'CNT-' || v_loc || '-' || v_anio || '-' || lpad(fn_siguiente_numero('CNT-' || v_loc || v_anio)::text, 3, '0');
    when 'descuento' then
      new.numero := 'DSC-' || v_anio || '-' || lpad(fn_siguiente_numero('DSC-' || v_anio)::text, 4, '0');
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['requerimiento','compra','cotizacion','traslado','conteo','descuento'] loop
    execute format('drop trigger if exists trg_numerar on %I', t);
    execute format('create trigger trg_numerar before insert on %I for each row execute function fn_numerar()', t);
  end loop;
end $$;

-- Validación de periodo cerrado en documentos con fecha
create or replace function fn_validar_periodo_doc() returns trigger
language plpgsql as $$
declare v_local uuid; v_fecha date;
begin
  v_local := coalesce((to_jsonb(new)->>'local_id')::uuid, (to_jsonb(old)->>'local_id')::uuid);
  v_fecha := coalesce((to_jsonb(new)->>'fecha')::date, (to_jsonb(old)->>'fecha')::date);
  if v_local is not null and v_fecha is not null then
    perform fn_validar_periodo(v_local, v_fecha);
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['compra','conteo','descuento','rotura','venta_vianda','transporte'] loop
    execute format('drop trigger if exists trg_periodo on %I', t);
    execute format('create trigger trg_periodo before insert or update or delete on %I for each row execute function fn_validar_periodo_doc()', t);
  end loop;
  -- updated_at
  foreach t in array array['usuario','producto','proveedor','requerimiento','cotizacion','compra','traslado',
                           'conteo','descuento','venta_vianda'] loop
    execute format('drop trigger if exists trg_updated_at on %I', t);
    execute format('create trigger trg_updated_at before update on %I for each row execute function fn_set_updated_at()', t);
  end loop;
  -- auditoría
  foreach t in array array['producto','producto_almacen','proveedor','compra','compra_detalle','movimiento','conteo',
                           'conteo_detalle','descuento','descuento_detalle','rotura','requerimiento','traslado',
                           'venta_vianda','venta_vianda_detalle','parametro','periodo_cierre','usuario',
                           'precio_historial','transporte','cotizacion'] loop
    execute format('drop trigger if exists trg_auditoria on %I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function fn_auditar()', t);
  end loop;
end $$;

-- =============================================================================
-- 14. VISTAS DE CONSULTA (security_invoker → respetan RLS)
-- =============================================================================

create or replace view v_stock with (security_invoker = true) as
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

-- Todo producto que entra a un almacén queda marcado en el negocio de ese almacén
create or replace function fn_stock_producto_local() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into producto_local (producto_id, local_id)
  select new.producto_id, a.local_id from almacen a where a.id = new.almacen_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_stock_producto_local on stock;
create trigger trg_stock_producto_local after insert on stock
  for each row execute function fn_stock_producto_local();

-- Cantidad de productos activos por negocio (y sin negocio asignado)
create or replace function fn_resumen_productos()
returns table(local_codigo text, local_nombre text, productos bigint)
language sql stable security invoker as $$
  select l.codigo::text, l.nombre, count(p.id)
  from local l
  left join producto_local pl on pl.local_id = l.id
  left join producto p on p.id = pl.producto_id and p.activo
  group by l.codigo, l.nombre
  union all
  select 'SIN'::text, 'Sin negocio asignado', count(*)
  from producto p
  where p.activo and not exists (select 1 from producto_local pl where pl.producto_id = p.id)
  order by 1
$$;

-- Kardex con saldo acumulado por producto/almacén
create or replace view v_kardex with (security_invoker = true) as
select m.id as movimiento_id, m.numero, m.fecha, m.tipo, t.nombre as tipo_nombre, t.signo,
       m.almacen_id, a.nombre as almacen_nombre, m.local_id, mo.codigo as motivo, mo.nombre as motivo_nombre,
       m.referencia_tipo, m.referencia_id, m.documento, m.observacion,
       d.id as detalle_id, d.producto_id, p.nombre as producto_nombre, u.codigo as unidad,
       case when t.signo > 0 then d.cantidad end as entrada,
       case when t.signo < 0 then d.cantidad end as salida,
       d.costo_unitario, round(d.cantidad * coalesce(d.costo_unitario, 0), 2) as importe,
       sum(t.signo * d.cantidad) over (partition by d.producto_id, m.almacen_id
                                       order by m.fecha, m.numero, d.id) as saldo,
       d.fifo_cumplido
from movimiento m
join movimiento_detalle d on d.movimiento_id = m.id
join tipo_movimiento t on t.codigo = m.tipo
join almacen a on a.id = m.almacen_id
join producto p on p.id = d.producto_id
join unidad_medida u on u.id = p.unidad_id
left join motivo mo on mo.id = m.motivo_id
where not m.anulado;

create or replace view v_compra_resumen with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, l.nombre as local_nombre, l.codigo as local_codigo,
       c.almacen_id, c.proveedor_id, pr.razon_social as proveedor, c.ciudad_id, ci.nombre as ciudad,
       c.estado, c.tipo_documento, c.numero_documento, c.forma_pago, c.requerimiento_id,
       c.fecha_aprobacion, c.fecha_entrega,
       coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => fn_param('otif_horas_objetivo', 24)::int)) as fecha_objetivo,
       x.items, x.total, x.total_solicitado, x.ahorro, x.base_comparable,
       coalesce(tr.costo, 0) as costo_transporte,
       x.total + coalesce(tr.costo, 0) as costo_total,
       -- OTIF (definición estándar: pedido a tiempo Y completo)
       case when c.estado = 'recibida' and c.fecha_aprobacion is not null
            then c.fecha_entrega <= coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => fn_param('otif_horas_objetivo', 24)::int)) end as on_time,
       case when c.estado = 'recibida' then x.in_full end as in_full,
       case when c.estado = 'recibida' then x.fill_rate end as fill_rate,
       round(extract(epoch from (c.fecha_entrega - c.fecha_aprobacion)) / 3600.0, 1) as horas_entrega
from compra c
join local l on l.id = c.local_id
left join proveedor pr on pr.id = c.proveedor_id
left join ciudad ci on ci.id = c.ciudad_id
left join lateral (
  select count(*) as items,
         round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total,
         round(sum(d.cantidad_solicitada * d.precio_unitario), 2) as total_solicitado,
         round(sum(case when d.precio_anterior is not null
                        then (d.precio_anterior - d.precio_unitario) * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as ahorro,
         round(sum(case when d.precio_anterior is not null
                        then d.precio_anterior * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as base_comparable,
         bool_and(coalesce(d.cantidad_recibida, 0) >= d.cantidad_solicitada) as in_full,
         least(1, sum(least(coalesce(d.cantidad_recibida, 0), d.cantidad_solicitada)) / nullif(sum(d.cantidad_solicitada), 0)) as fill_rate
  from compra_detalle d where d.compra_id = c.id) x on true
left join lateral (select sum(t.costo) costo from transporte t where t.compra_id = c.id) tr on true;

create or replace view v_compra_detalle with (security_invoker = true) as
select d.*, c.numero, c.fecha, c.local_id, c.estado, c.proveedor_id, pr.razon_social as proveedor,
       c.ciudad_id, ci.nombre as ciudad, p.nombre as producto, p.codigo as producto_codigo, cat.nombre as categoria,
       u.codigo as unidad,
       round(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario, 2) as importe,
       d.precio_unitario - d.precio_anterior as variacion,
       round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) as variacion_pct
from compra_detalle d
join compra c on c.id = d.compra_id
join producto p on p.id = d.producto_id
join unidad_medida u on u.id = p.unidad_id
left join categoria cat on cat.id = p.categoria_id
left join proveedor pr on pr.id = c.proveedor_id
left join ciudad ci on ci.id = c.ciudad_id;

-- Trazabilidad: precio anterior vs actual, proveedor anterior vs actual
create or replace view v_trazabilidad_precios with (security_invoker = true) as
select h.id, h.producto_id, p.codigo, p.nombre as producto, u.codigo as unidad, h.fecha, h.local_id,
       h.proveedor_id, pr.razon_social as proveedor, h.precio,
       lag(h.precio) over w as precio_anterior,
       lag(pr.razon_social) over w as proveedor_anterior,
       lag(h.fecha) over w as fecha_anterior,
       h.precio - lag(h.precio) over w as variacion,
       round((h.precio - lag(h.precio) over w) / nullif(lag(h.precio) over w, 0), 4) as variacion_pct
from precio_historial h
join producto p on p.id = h.producto_id
join unidad_medida u on u.id = p.unidad_id
left join proveedor pr on pr.id = h.proveedor_id
where h.tipo = 'compra'
window w as (partition by h.producto_id order by h.fecha, h.created_at);

create or replace view v_precio_estadistica with (security_invoker = true) as
select h.producto_id, p.codigo, p.nombre as producto, u.codigo as unidad, cat.nombre as categoria,
       count(*) as compras, min(h.precio) as precio_min, max(h.precio) as precio_max,
       round(avg(h.precio), 4) as precio_promedio,
       (array_agg(h.precio order by h.fecha desc, h.created_at desc))[1] as precio_actual,
       (array_agg(h.precio order by h.fecha asc, h.created_at asc))[1] as precio_inicial,
       max(h.fecha) as ultima_compra,
       round(((array_agg(h.precio order by h.fecha desc, h.created_at desc))[1]
              - (array_agg(h.precio order by h.fecha asc, h.created_at asc))[1])
             / nullif((array_agg(h.precio order by h.fecha asc, h.created_at asc))[1], 0), 4) as variacion_pct
from precio_historial h
join producto p on p.id = h.producto_id
join unidad_medida u on u.id = p.unidad_id
left join categoria cat on cat.id = p.categoria_id
where h.tipo = 'compra'
group by h.producto_id, p.codigo, p.nombre, u.codigo, cat.nombre;

-- Resultado de cada conteo (RESULTADO + REPORTE MENSUAL del Excel, corregido)
create or replace view v_conteo_resumen with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.hora, c.tipo, c.estado, c.local_id, l.nombre as local_nombre, l.codigo as local_codigo,
       c.almacen_id, a.nombre as almacen_nombre,
       rc.nombres as responsable_conteo, ra.nombres as responsable_almacen,
       count(d.id) as items,
       count(d.cantidad_fisica) as items_contados,
       count(*) filter (where d.diferencia <> 0) as items_con_diferencia,
       coalesce(sum(d.stock_sistema), 0) as unidades_sistema,
       coalesce(sum(d.diferencia) filter (where d.diferencia > 0), 0) as sobrante_unidades,
       coalesce(sum(d.diferencia) filter (where d.diferencia < 0), 0) as faltante_unidades,
       round(coalesce(sum(d.stock_sistema * d.costo_unitario), 0), 2) as valor_sistema,
       round(coalesce(sum(d.valor_diferencia) filter (where d.diferencia > 0), 0), 2) as sobrante_valor,
       round(coalesce(sum(d.valor_diferencia) filter (where d.diferencia < 0), 0), 2) as faltante_valor,
       round(coalesce(sum(abs(d.valor_diferencia)), 0), 2) as diferencia_bruta_valor,
       round(coalesce(sum(d.valor_diferencia), 0), 2) as diferencia_neta_valor,
       round(coalesce(sum(abs(d.valor_diferencia)), 0) / nullif(sum(d.stock_sistema * d.costo_unitario), 0), 4) as pct_diferencia,
       round(coalesce(sum(d.valor_diferencia) filter (where d.diferencia < 0 and d.aplica_descuento), 0), 2) as faltante_descontable,
       fn_param('meta_diferencia_inventario', 0.01) as meta
from conteo c
join local l on l.id = c.local_id
join almacen a on a.id = c.almacen_id
left join personal rc on rc.id = c.responsable_conteo_id
left join personal ra on ra.id = c.responsable_almacen_id
left join conteo_detalle d on d.conteo_id = c.id
where c.estado <> 'anulado'
group by c.id, l.nombre, l.codigo, a.nombre, rc.nombres, ra.nombres;

drop view if exists v_descuento_resumen;
create or replace view v_descuento_resumen with (security_invoker = true) as
select d.id, d.numero, d.fecha, d.periodo, d.local_id, l.nombre as local_nombre, l.codigo as local_codigo, d.personal_id, p.nombres as personal,
       p.cargo, d.origen, d.monto, d.estado, d.conteo_id, d.observacion,
       (select count(*) from descuento_detalle x where x.descuento_id = d.id) as items
from descuento d join local l on l.id = d.local_id join personal p on p.id = d.personal_id;

-- Conciliación viandas vs Kardex (consumo teórico vs salidas registradas)
create or replace view v_conciliacion_viandas with (security_invoker = true) as
with teorico as (
  select v.local_id, v.fecha, c.producto_id, sum(d.cantidad * c.factor) as consumo_teorico
  from venta_vianda v
  join venta_vianda_detalle d on d.venta_id = v.id
  join vianda_conversion c on c.item_id = d.item_id
  group by 1, 2, 3
), kardex as (
  select m.local_id, m.fecha::date as fecha, d.producto_id, sum(d.cantidad) as salida_kardex
  from movimiento m
  join movimiento_detalle d on d.movimiento_id = m.id
  join motivo mo on mo.id = m.motivo_id and mo.codigo = 'VENTA'
  join producto p on p.id = d.producto_id and p.tipo = 'carne'
  where not m.anulado and m.tipo in ('salida_venta','salida_consumo')
  group by 1, 2, 3
)
select coalesce(t.local_id, k.local_id) as local_id, coalesce(t.fecha, k.fecha) as fecha,
       coalesce(t.producto_id, k.producto_id) as producto_id, p.nombre as producto,
       round(coalesce(t.consumo_teorico, 0), 3) as consumo_teorico,
       round(coalesce(k.salida_kardex, 0), 3) as salida_kardex,
       round(coalesce(k.salida_kardex, 0) - coalesce(t.consumo_teorico, 0), 3) as diferencia,
       abs(coalesce(k.salida_kardex, 0) - coalesce(t.consumo_teorico, 0)) > fn_param('tolerancia_viandas', 1) as alerta
from teorico t
full join kardex k on k.local_id = t.local_id and k.fecha = t.fecha and k.producto_id = t.producto_id
join producto p on p.id = coalesce(t.producto_id, k.producto_id);

create or replace view v_lote_fifo with (security_invoker = true) as
select lo.id, lo.producto_id, p.nombre as producto, lo.almacen_id, a.nombre as almacen, a.local_id,
       lo.fecha_ingreso, lo.fecha_vencimiento, lo.cantidad_inicial, lo.cantidad_disponible, lo.costo_unitario,
       (current_date - lo.fecha_ingreso::date) as dias_en_almacen,
       (lo.fecha_vencimiento - current_date) as dias_para_vencer,
       row_number() over (partition by lo.producto_id, lo.almacen_id order by lo.fecha_ingreso) as orden_salida,
       case when lo.fecha_vencimiento < current_date then 'vencido'
            when lo.fecha_vencimiento <= current_date + fn_param('dias_alerta_vencimiento', 7)::int then 'por_vencer'
            else 'vigente' end as estado
from lote lo
join producto p on p.id = lo.producto_id
join almacen a on a.id = lo.almacen_id
where lo.cantidad_disponible > 0;

create or replace view v_requerimiento_resumen with (security_invoker = true) as
select r.*, l.nombre as local_nombre, l.codigo as local_codigo, ar.nombre as area_nombre,
       (select count(*) from requerimiento_detalle d where d.requerimiento_id = r.id) as items,
       (select round(sum(coalesce(d.cantidad_aprobada, d.cantidad_solicitada) * coalesce(d.precio_estimado, 0)), 2)
          from requerimiento_detalle d where d.requerimiento_id = r.id) as monto_estimado,
       round(extract(epoch from (r.aprobado_at - r.created_at)) / 3600.0, 1) as horas_aprobacion,
       (r.aprobado_at - r.created_at) <= make_interval(hours => fn_param('horas_objetivo_requerimiento', 24)::int) as dentro_objetivo
from requerimiento r join local l on l.id = r.local_id left join area ar on ar.id = r.area_id;

-- Oferta total por proveedor/ronda en cada cotización (cuadro comparativo)
create or replace view v_cotizacion_oferta with (security_invoker = true) as
select o.id, o.cotizacion_id, o.proveedor_id, pr.razon_social as proveedor, o.ronda, o.fecha,
       round(sum(cp.precio_unitario * i.cantidad), 2) as total,
       count(cp.item_id) as items_cotizados,
       (select count(*) from cotizacion_item x where x.cotizacion_id = o.cotizacion_id) as items_total
from cotizacion_oferta o
join proveedor pr on pr.id = o.proveedor_id
left join cotizacion_precio cp on cp.oferta_id = o.id
left join cotizacion_item i on i.id = cp.item_id
group by o.id, pr.razon_social;

-- Ahorro por negociación: mejor oferta 1ª ronda vs oferta adjudicada (última ronda del ganador)
create or replace view v_cotizacion_ahorro with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, c.titulo, c.estado, c.proveedor_aprobado_id,
       pr.razon_social as proveedor_aprobado,
       (select min(total) from v_cotizacion_oferta o where o.cotizacion_id = c.id and o.ronda = 1) as total_primera_ronda,
       (select o.total from v_cotizacion_oferta o where o.cotizacion_id = c.id and o.proveedor_id = c.proveedor_aprobado_id
         order by o.ronda desc limit 1) as total_adjudicado,
       (select min(total) from v_cotizacion_oferta o where o.cotizacion_id = c.id and o.ronda = 1)
       - (select o.total from v_cotizacion_oferta o where o.cotizacion_id = c.id and o.proveedor_id = c.proveedor_aprobado_id
           order by o.ronda desc limit 1) as ahorro
from cotizacion c left join proveedor pr on pr.id = c.proveedor_aprobado_id;

-- =============================================================================
-- 15. KPIs Y REPORTES (RPC)  ·  p_local NULL = GLOBAL (ambos negocios)
-- =============================================================================

-- Líneas de movimiento sin saldo (listados recientes: no recorre todo el historial)
create or replace view v_movimiento_linea with (security_invoker = true) as
select m.id as movimiento_id, m.numero, m.fecha, m.tipo, t.nombre as tipo_nombre, t.signo, m.almacen_id, a.nombre as almacen_nombre,
       m.local_id, mo.nombre as motivo_nombre, m.referencia_tipo, m.referencia_id, m.documento, m.observacion,
       d.id as detalle_id, d.producto_id, p.nombre as producto_nombre, u.codigo as unidad,
       case when t.signo > 0 then d.cantidad end as entrada, case when t.signo < 0 then d.cantidad end as salida,
       d.costo_unitario, round(d.cantidad * coalesce(d.costo_unitario, 0), 2) as importe, d.fifo_cumplido
from movimiento m
join movimiento_detalle d on d.movimiento_id = m.id
join tipo_movimiento t on t.codigo = m.tipo
join almacen a on a.id = m.almacen_id
join producto p on p.id = d.producto_id
join unidad_medida u on u.id = p.unidad_id
left join motivo mo on mo.id = m.motivo_id
where not m.anulado;

-- Conciliación viandas / Kardex con filtros aplicados antes de agrupar
create or replace function fn_conciliacion_viandas(p_local uuid default null, p_desde date default null, p_hasta date default null)
returns table(local_id uuid, fecha date, producto_id uuid, producto text, consumo_teorico numeric, salida_kardex numeric, diferencia numeric, alerta boolean)
language sql stable security invoker as $$
  with teorico as (
    select v.local_id, v.fecha, c.producto_id, sum(d.cantidad * c.factor) as q
    from venta_vianda v
    join venta_vianda_detalle d on d.venta_id = v.id
    join vianda_conversion c on c.item_id = d.item_id
    where (p_local is null or v.local_id = p_local) and (p_desde is null or v.fecha >= p_desde) and (p_hasta is null or v.fecha <= p_hasta)
    group by 1, 2, 3
  ), kardex as (
    select m.local_id, m.fecha::date as fecha, d.producto_id, sum(d.cantidad) as q
    from movimiento m
    join movimiento_detalle d on d.movimiento_id = m.id
    where not m.anulado and m.tipo in ('salida_venta','salida_consumo')
      and m.motivo_id = (select id from motivo where codigo = 'VENTA')
      and (p_local is null or m.local_id = p_local)
      and (p_desde is null or m.fecha >= p_desde::timestamptz) and (p_hasta is null or m.fecha < (p_hasta + 1)::timestamptz)
      and d.producto_id in (select id from producto where tipo = 'carne')
    group by 1, 2, 3
  )
  select coalesce(t.local_id, k.local_id), coalesce(t.fecha, k.fecha), coalesce(t.producto_id, k.producto_id), p.nombre,
         round(coalesce(t.q, 0), 3), round(coalesce(k.q, 0), 3), round(coalesce(k.q, 0) - coalesce(t.q, 0), 3),
         abs(coalesce(k.q, 0) - coalesce(t.q, 0)) > fn_param('tolerancia_viandas', 1)
  from teorico t
  full join kardex k on k.local_id = t.local_id and k.fecha = t.fecha and k.producto_id = t.producto_id
  join producto p on p.id = coalesce(t.producto_id, k.producto_id)
$$;

-- Resumen ligero de compras del periodo (listado de compras y transporte)
create or replace function fn_compras_resumen(p_local uuid default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'total', coalesce(sum(total), 0), 'cantidad', count(*), 'transporte', coalesce(sum(costo_transporte), 0),
    'ahorro', coalesce(sum(ahorro) filter (where ahorro > 0), 0), 'sobrecosto', coalesce(-sum(ahorro) filter (where ahorro < 0), 0))
  from v_compra_resumen
  where estado <> 'anulada' and (p_local is null or local_id = p_local)
    and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)
$$;

-- Cumplimiento FIFO
create or replace function fn_fifo_resumen(p_local uuid default null, p_desde date default null, p_hasta date default null)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'cumplimiento', round(count(*) filter (where d.fifo_cumplido)::numeric / nullif(count(d.fifo_cumplido), 0), 4),
    'salidas', count(d.fifo_cumplido))
  from movimiento m join movimiento_detalle d on d.movimiento_id = m.id
  where not m.anulado and d.fifo_cumplido is not null and (p_local is null or m.local_id = p_local)
    and (p_desde is null or m.fecha >= p_desde::timestamptz) and (p_hasta is null or m.fecha < (p_hasta + 1)::timestamptz)
$$;

-- Panel principal
create or replace function fn_dashboard(p_local uuid default null, p_desde date default date_trunc('month', current_date)::date,
                                        p_hasta date default current_date)
returns jsonb
language sql stable security invoker as $$
with
cr as (select * from v_compra_resumen where estado <> 'anulada' and fecha between p_desde and p_hasta
         and (p_local is null or local_id = p_local)),
st as (select * from v_stock where (p_local is null or local_id = p_local)),
co as (select * from v_conteo_resumen where estado = 'cerrado' and fecha between p_desde and p_hasta
         and (p_local is null or local_id = p_local)),
rq as (select * from v_requerimiento_resumen where (p_local is null or local_id = p_local)),
fifo as (select count(*) filter (where d.fifo_cumplido) ok, count(d.fifo_cumplido) total
         from movimiento_detalle d join movimiento m on m.id = d.movimiento_id
         where not m.anulado and d.fifo_cumplido is not null
           and m.fecha >= p_desde::timestamptz and m.fecha < (p_hasta + 1)::timestamptz and (p_local is null or m.local_id = p_local))
select jsonb_build_object(
  'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
  'stock', jsonb_build_object(
      'valor_total', coalesce((select round(sum(valor), 2) from st where cantidad > 0), 0),
      'productos',   (select count(*) from st where cantidad > 0),
      'criticos',    (select count(*) from st where estado = 'critico'),
      'agotados',    (select count(*) from st where estado = 'agotado' and stock_minimo > 0)),
  'compras', jsonb_build_object(
      'total',        coalesce((select sum(total) from cr), 0),
      'cantidad',     (select count(*) from cr),
      'transporte',   coalesce((select sum(costo_transporte) from cr), 0),
      'ahorro',       coalesce((select sum(ahorro) from cr where ahorro > 0), 0),
      'sobrecosto',   coalesce((select -sum(ahorro) from cr where ahorro < 0), 0),
      'ahorro_neto_pct', (select round(sum(ahorro) / nullif(sum(base_comparable), 0), 4) from cr),
      'pendientes',   (select count(*) from compra where estado in ('borrador','aprobada') and (p_local is null or local_id = p_local)),
      'por_local',  coalesce((select jsonb_agg(jsonb_build_object('local', local_nombre, 'codigo', local_codigo, 'total', t) order by t desc)
                              from (select local_nombre, local_codigo, sum(total) t from cr group by 1, 2) x), '[]'),
      'por_ciudad', coalesce((select jsonb_agg(jsonb_build_object('ciudad', coalesce(ciudad, 'Sin origen'), 'total', t) order by t desc)
                              from (select ciudad, sum(total) t from cr group by 1) x), '[]')),
  'otif', jsonb_build_object(
      'pedidos',  (select count(*) from cr where on_time is not null),
      'on_time',  (select round(avg(case when on_time then 1 else 0 end), 4) from cr where on_time is not null),
      'in_full',  (select round(avg(case when in_full then 1 else 0 end), 4) from cr where in_full is not null),
      'otif',     (select round(avg(case when on_time and in_full then 1 else 0 end), 4) from cr where on_time is not null),
      'meta',     fn_param('meta_otif', 0.95)),
  'inventario', jsonb_build_object(
      'conteos',          (select count(*) from co),
      'valor_sistema',    coalesce((select sum(valor_sistema) from co), 0),
      'sobrante',         coalesce((select sum(sobrante_valor) from co), 0),
      'faltante',         coalesce((select sum(faltante_valor) from co), 0),
      'pct_diferencia',   (select round(sum(diferencia_bruta_valor) / nullif(sum(valor_sistema), 0), 4) from co),
      'meta',             fn_param('meta_diferencia_inventario', 0.01),
      'pendientes',       (select count(*) from conteo where estado in ('abierto','verificacion') and (p_local is null or local_id = p_local))),
  'requerimientos', jsonb_build_object(
      'pendientes',    (select count(*) from rq where estado in ('solicitado','en_cotizacion','aprobado')),
      'periodo',       (select count(*) from rq where created_at::date between p_desde and p_hasta),
      'pct_24h',       (select round(avg(case when dentro_objetivo then 1 else 0 end), 4) from rq
                         where aprobado_at is not null and created_at::date between p_desde and p_hasta)),
  'fifo', jsonb_build_object(
      'cumplimiento', (select round(ok::numeric / nullif(total, 0), 4) from fifo),
      'salidas', (select total from fifo),
      'por_vencer', (select count(*) from v_lote_fifo where estado in ('por_vencer','vencido') and (p_local is null or local_id = p_local))),
  'descuentos', jsonb_build_object(
      'total', coalesce((select sum(monto) from descuento where estado <> 'anulado' and fecha between p_desde and p_hasta
                           and (p_local is null or local_id = p_local)), 0),
      'roturas', coalesce((select sum(total) from rotura where fecha between p_desde and p_hasta
                           and (p_local is null or local_id = p_local)), 0)),
  'carnes', jsonb_build_object(
      'alertas', (select count(*) from fn_conciliacion_viandas(p_local, p_desde, p_hasta) x where x.alerta))
)
$$;

-- Totales de stock para filtros de la pantalla de inventario
create or replace function fn_stock_totales(p_local uuid default null, p_almacen uuid default null, p_tipo text default null)
returns table(valor numeric, productos bigint, criticos bigint, agotados bigint)
language sql stable security invoker as $$
  select round(coalesce(sum(valor) filter (where cantidad > 0), 0), 2),
         count(*) filter (where cantidad > 0),
         count(*) filter (where estado = 'critico'),
         count(*) filter (where estado = 'agotado' and stock_minimo > 0)
  from v_stock
  where (p_local is null or local_id = p_local)
    and (p_almacen is null or almacen_id = p_almacen)
    and (p_tipo is null or producto_tipo = p_tipo)
$$;

-- Serie mensual de compras (para gráficos y comparativo)
create or replace function fn_compras_mensual(p_local uuid default null, p_anio int default extract(year from current_date)::int)
returns table(mes int, local_codigo text, local_nombre text, ciudad text, total numeric, ahorro numeric,
              transporte numeric, pedidos bigint, otif numeric)
language sql stable security invoker as $$
  select extract(month from fecha)::int, local_codigo::text, local_nombre, coalesce(ciudad, 'Sin origen'),
         round(sum(total), 2), round(sum(coalesce(ahorro, 0)), 2), round(sum(costo_transporte), 2), count(*),
         round(avg(case when on_time and in_full then 1 when on_time is not null then 0 end), 4)
  from v_compra_resumen
  where estado <> 'anulada' and extract(year from fecha) = p_anio and (p_local is null or local_id = p_local)
  group by 1, 2, 3, 4 order by 1, 2, 4
$$;

-- Indicador de compras por mes y origen (reemplaza "MEJ INDICADOR DE COMPRAS" / hoja OTIF de EXPO MENSUAL)
-- OT = % pedidos entregados a tiempo · IF = % pedidos completos · OTIF = % pedidos a tiempo Y completos
-- Consolidado = promedio PONDERADO por pedidos (el Excel sumaba los % de Lima y Ayacucho → 200%)
create or replace function fn_kpi_compras_mensual(p_local uuid default null, p_anio int default extract(year from current_date)::int)
returns table(mes int, ciudad text, pedidos bigint, evaluados bigint, ot numeric, in_full numeric, otif numeric,
              total numeric, ahorro numeric, ahorro_pct numeric, transporte numeric)
language sql stable security invoker as $$
  select extract(month from fecha)::int, coalesce(ciudad, 'Sin origen'), count(*), count(on_time),
         round(avg(case when on_time then 1 when on_time is not null then 0 end), 4),
         round(avg(case when in_full then 1 when in_full is not null then 0 end), 4),
         round(avg(case when on_time and in_full then 1 when on_time is not null then 0 end), 4),
         round(sum(total), 2), round(sum(coalesce(ahorro, 0)), 2),
         round(sum(ahorro) / nullif(sum(base_comparable), 0), 4), round(sum(costo_transporte), 2)
  from v_compra_resumen
  where estado <> 'anulada' and extract(year from fecha) = p_anio and (p_local is null or local_id = p_local)
  group by grouping sets ((1, 2), (1))
  order by 1, 2 nulls last
$$;

-- KPI de exactitud de inventario por mes y responsable (hoja ALMACEN de EXPO MENSUAL)
create or replace function fn_kpi_inventario_mensual(p_local uuid default null, p_anio int default extract(year from current_date)::int)
returns table(mes int, local_codigo text, responsable text, conteos bigint, valor_sistema numeric,
              sobrante numeric, faltante numeric, diferencia_bruta numeric, pct_diferencia numeric, meta numeric, cumple boolean)
language sql stable security invoker as $$
  select extract(month from fecha)::int, local_codigo::text, coalesce(responsable_almacen, '—'), count(*),
         sum(valor_sistema), sum(sobrante_valor), sum(faltante_valor), sum(diferencia_bruta_valor),
         round(sum(diferencia_bruta_valor) / nullif(sum(valor_sistema), 0), 4),
         max(meta), sum(diferencia_bruta_valor) / nullif(sum(valor_sistema), 0) <= max(meta)
  from v_conteo_resumen
  where estado = 'cerrado' and tipo = 'almacen' and extract(year from fecha) = p_anio
    and (p_local is null or local_id = p_local)
  group by 1, 2, 3 order by 1, 2
$$;

-- Comparativo lado a lado entre negocios
create or replace function fn_comparativo_locales(p_desde date, p_hasta date)
returns table(local_id uuid, local_codigo text, local_nombre text, valor_stock numeric, compras numeric,
              transporte numeric, ahorro numeric, consumo_valor numeric, diferencia_inventario numeric,
              pct_diferencia numeric, descuentos numeric, roturas numeric, otif numeric, requerimientos bigint)
language sql stable security invoker as $$
  select l.id, l.codigo::text, l.nombre,
    (select round(coalesce(sum(valor), 0), 2) from v_stock s where s.local_id = l.id and s.cantidad > 0),
    (select round(coalesce(sum(total), 0), 2) from v_compra_resumen c where c.local_id = l.id and c.estado <> 'anulada' and c.fecha between p_desde and p_hasta),
    (select round(coalesce(sum(costo_transporte), 0), 2) from v_compra_resumen c where c.local_id = l.id and c.estado <> 'anulada' and c.fecha between p_desde and p_hasta),
    (select round(coalesce(sum(ahorro), 0), 2) from v_compra_resumen c where c.local_id = l.id and c.estado <> 'anulada' and c.fecha between p_desde and p_hasta),
    (select round(coalesce(sum(d.cantidad * d.costo_unitario), 0), 2)
       from movimiento m join movimiento_detalle d on d.movimiento_id = m.id
      where m.local_id = l.id and not m.anulado and m.tipo in ('salida_consumo','salida_venta','merma')
        and m.fecha::date between p_desde and p_hasta),
    (select round(coalesce(sum(diferencia_bruta_valor), 0), 2) from v_conteo_resumen r where r.local_id = l.id and r.estado = 'cerrado' and r.fecha between p_desde and p_hasta),
    (select round(sum(diferencia_bruta_valor) / nullif(sum(valor_sistema), 0), 4) from v_conteo_resumen r where r.local_id = l.id and r.estado = 'cerrado' and r.fecha between p_desde and p_hasta),
    (select round(coalesce(sum(monto), 0), 2) from descuento d where d.local_id = l.id and d.estado <> 'anulado' and d.fecha between p_desde and p_hasta),
    (select round(coalesce(sum(total), 0), 2) from rotura r where r.local_id = l.id and r.fecha between p_desde and p_hasta),
    (select round(avg(case when on_time and in_full then 1 else 0 end), 4) from v_compra_resumen c where c.local_id = l.id and c.on_time is not null and c.fecha between p_desde and p_hasta),
    (select count(*) from requerimiento r where r.local_id = l.id and r.created_at::date between p_desde and p_hasta)
  from local l where l.activo order by l.orden
$$;

-- Ranking de proveedores por volumen
create or replace function fn_top_proveedores(p_local uuid default null, p_desde date default date_trunc('year', current_date)::date,
                                              p_hasta date default current_date, p_limite int default 10)
returns table(proveedor_id uuid, proveedor text, compras bigint, total numeric, participacion numeric)
language sql stable security invoker as $$
  with t as (select proveedor_id, proveedor, count(*) n, sum(total) total
             from v_compra_resumen where estado <> 'anulada' and proveedor_id is not null
               and fecha between p_desde and p_hasta and (p_local is null or local_id = p_local)
             group by 1, 2)
  select proveedor_id, proveedor, n, round(total, 2), round(total / nullif(sum(total) over (), 0), 4)
  from t order by total desc limit p_limite
$$;

-- Productos con mayor variación de precio en el periodo
create or replace function fn_variacion_precios(p_desde date default (current_date - interval '6 months')::date,
                                                p_hasta date default current_date, p_limite int default 10)
returns table(producto_id uuid, producto text, unidad text, precio_inicial numeric, precio_final numeric,
              variacion numeric, variacion_pct numeric, compras bigint)
language sql stable security invoker as $$
  select h.producto_id, p.nombre, u.codigo,
         (array_agg(h.precio order by h.fecha, h.created_at))[1],
         (array_agg(h.precio order by h.fecha desc, h.created_at desc))[1],
         (array_agg(h.precio order by h.fecha desc, h.created_at desc))[1] - (array_agg(h.precio order by h.fecha, h.created_at))[1],
         round(((array_agg(h.precio order by h.fecha desc, h.created_at desc))[1] - (array_agg(h.precio order by h.fecha, h.created_at))[1])
               / nullif((array_agg(h.precio order by h.fecha, h.created_at))[1], 0), 4),
         count(*)
  from precio_historial h join producto p on p.id = h.producto_id join unidad_medida u on u.id = p.unidad_id
  where h.tipo = 'compra' and h.fecha between p_desde and p_hasta
  group by h.producto_id, p.nombre, u.codigo
  having count(*) > 1
  order by abs(((array_agg(h.precio order by h.fecha desc, h.created_at desc))[1] - (array_agg(h.precio order by h.fecha, h.created_at))[1])
               / nullif((array_agg(h.precio order by h.fecha, h.created_at))[1], 0)) desc nulls last
  limit p_limite
$$;

-- Proveedores registrados por mes (hoja PROVEEDORES de EXPO MENSUAL)
create or replace function fn_proveedores_mensual(p_anio int default extract(year from current_date)::int)
returns table(mes int, nuevos bigint, acumulado numeric)
language sql stable security invoker as $$
  select m, n, sum(n) over (order by m)
  from (select g.m, (select count(*) from proveedor p where extract(year from p.fecha_registro) = p_anio
                                                   and extract(month from p.fecha_registro) = g.m) n
        from generate_series(1, 12) g(m)) x
$$;

-- =============================================================================
-- 16. SEGURIDAD: ROW LEVEL SECURITY
-- =============================================================================

do $$
declare
  r record;
  v_local_col boolean;
  v_read text;
begin
  for r in select * from (values
      ('empresa','maestros'), ('local','maestros'), ('almacen','maestros'), ('area','maestros'),
      ('ciudad','maestros'), ('unidad_medida','maestros'), ('categoria','maestros'), ('producto','maestros'),
      ('producto_almacen','maestros'), ('personal','maestros'), ('tipo_movimiento','maestros'), ('motivo','maestros'),
      ('parametro','configuracion'), ('vianda_item','maestros'), ('vianda_conversion','maestros'), ('tarea','maestros'),
      ('movimiento','inventario'), ('movimiento_detalle','inventario'), ('lote','inventario'), ('lote_consumo','inventario'),
      ('producto_local','maestros'),
      ('conteo','conteos'), ('conteo_detalle','conteos'),
      ('proveedor','proveedores'), ('proveedor_contacto','proveedores'),
      ('compra','compras'), ('compra_detalle','compras'), ('precio_historial','compras'), ('transporte','compras'),
      ('cotizacion','compras'), ('cotizacion_item','compras'), ('cotizacion_oferta','compras'), ('cotizacion_precio','compras'),
      ('requerimiento','requerimientos'), ('requerimiento_detalle','requerimientos'),
      ('traslado','traslados'), ('traslado_detalle','traslados'),
      ('venta_vianda','carnes'), ('venta_vianda_detalle','carnes'),
      ('descuento','descuentos'), ('descuento_detalle','descuentos'), ('rotura','descuentos'), ('rotura_responsable','descuentos'),
      ('documento','documentos'), ('tarea_registro','tareas'),
      ('rol','seguridad'), ('rol_permiso','seguridad'), ('usuario_local','seguridad'), ('periodo_cierre','configuracion'),
      ('correlativo','configuracion')
    ) as t(tabla, modulo)
  loop
    execute format('alter table %I enable row level security', r.tabla);
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tabla and column_name = 'local_id') into v_local_col;
    v_read := format('(select fn_puede(%L, ''leer''))', r.modulo)
              || case when v_local_col then ' and (local_id is null or array[local_id] <@ (select fn_mis_locales()))' else '' end;
    execute format('drop policy if exists p_leer on %I', r.tabla);
    execute format('create policy p_leer on %I for select to authenticated using (%s)', r.tabla, v_read);
    execute format('drop policy if exists p_insertar on %I', r.tabla);
    execute format('create policy p_insertar on %I for insert to authenticated with check ((select fn_puede(%L, ''escribir'')))', r.tabla, r.modulo);
    execute format('drop policy if exists p_actualizar on %I', r.tabla);
    execute format('create policy p_actualizar on %I for update to authenticated using ((select fn_puede(%L, ''escribir'')))', r.tabla, r.modulo);
    execute format('drop policy if exists p_eliminar on %I', r.tabla);
    execute format('create policy p_eliminar on %I for delete to authenticated using ((select fn_puede(%L, ''escribir'')))', r.tabla, r.modulo);
  end loop;
end $$;

-- Tablas de solo lectura para usuarios (las escriben triggers SECURITY DEFINER)
alter table stock enable row level security;
drop policy if exists p_leer on stock;
create policy p_leer on stock for select to authenticated using ((select fn_puede('inventario', 'leer')));

alter table auditoria enable row level security;
drop policy if exists p_leer on auditoria;
create policy p_leer on auditoria for select to authenticated using ((select fn_puede('seguridad', 'leer')));

-- Usuarios: cada uno ve su perfil; administración con permiso de seguridad
alter table usuario enable row level security;
drop policy if exists p_leer on usuario;
create policy p_leer on usuario for select to authenticated using (id = (select auth.uid()) or (select fn_puede('seguridad', 'leer')));
drop policy if exists p_escribir on usuario;
create policy p_escribir on usuario for all to authenticated using ((select fn_puede('seguridad', 'escribir')))
  with check ((select fn_puede('seguridad', 'escribir')));

-- Storage: bucket privado para documentos
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
    insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false) on conflict (id) do nothing;
    execute 'drop policy if exists "documentos_leer" on storage.objects';
    execute $p$create policy "documentos_leer" on storage.objects for select to authenticated
             using (bucket_id = 'documentos' and public.fn_puede('documentos','leer'))$p$;
    execute 'drop policy if exists "documentos_escribir" on storage.objects';
    execute $p$create policy "documentos_escribir" on storage.objects for insert to authenticated
             with check (bucket_id = 'documentos' and public.fn_puede('documentos','escribir'))$p$;
    execute 'drop policy if exists "documentos_eliminar" on storage.objects';
    execute $p$create policy "documentos_eliminar" on storage.objects for delete to authenticated
             using (bucket_id = 'documentos' and public.fn_puede('documentos','escribir'))$p$;
  end if;
end $$;

-- =============================================================================
-- RESET (solo desarrollo) — descomentar para borrar todo y reinstalar
-- =============================================================================
-- drop schema public cascade; create schema public;
-- grant usage on schema public to postgres, anon, authenticated, service_role;
-- grant all on all tables in schema public to postgres, anon, authenticated, service_role;
-- alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
-- alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
-- alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
