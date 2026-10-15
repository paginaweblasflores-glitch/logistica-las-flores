-- =============================================================================
--  07_productos_por_negocio_sin_tumisoft.sql
--
--  1) PRODUCTOS POR NEGOCIO: un catálogo único (la "ficha" de cada producto) y
--     una marca de en qué negocio se usa: Las Flores, Umaru o ambos. Cada negocio
--     sigue llevando SU PROPIO stock (tabla stock por almacén).
--     Se llena con lo que ya se sabe: stock actual, parámetros por almacén y los
--     reportes diarios importados (si el producto tuvo stock en algún almacén del
--     negocio durante 2026, se usa en ese negocio).
--     Desde ahora, cuando un producto entra a un almacén (compra, traslado, stock
--     inicial), queda marcado automáticamente en ese negocio.
--  2) SE ELIMINA TUMISOFT: importación, historial importado, códigos Tumisoft y la
--     opción de conteo "según Tumisoft". El sistema pasa a ser la única fuente.
--     Los productos con código "TS-…" pasan a "P-00001", "P-00002"… (orden alfabético).
--
--  Ejecutar una vez en Supabase → SQL Editor. Es reejecutable.
-- =============================================================================
set search_path = public, extensions;   -- además, todas las tablas van con su nombre completo (public.)

-- 1) Productos por negocio ---------------------------------------------------------------
create table if not exists public.producto_local (
  producto_id uuid not null references public.producto(id) on delete cascade,
  local_id    uuid not null references public.local(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (producto_id, local_id)
);
create index if not exists ix_producto_local_local on public.producto_local(local_id);

alter table public.producto_local enable row level security;
drop policy if exists p_leer on public.producto_local;
create policy p_leer on public.producto_local for select to authenticated using ((select public.fn_puede('maestros', 'leer')));
drop policy if exists p_insertar on public.producto_local;
create policy p_insertar on public.producto_local for insert to authenticated with check ((select public.fn_puede('maestros', 'escribir')));
drop policy if exists p_actualizar on public.producto_local;
create policy p_actualizar on public.producto_local for update to authenticated using ((select public.fn_puede('maestros', 'escribir')));
drop policy if exists p_eliminar on public.producto_local;
create policy p_eliminar on public.producto_local for delete to authenticated using ((select public.fn_puede('maestros', 'escribir')));

-- Llenado inicial con lo que ya se sabe
insert into public.producto_local (producto_id, local_id)
select distinct s.producto_id, a.local_id from public.stock s join public.almacen a on a.id = s.almacen_id
on conflict do nothing;

insert into public.producto_local (producto_id, local_id)
select distinct pa.producto_id, a.local_id from public.producto_almacen pa join public.almacen a on a.id = pa.almacen_id
on conflict do nothing;

do $$
begin
  if to_regclass('public.tumisoft_stock') is not null then
    execute $q$
      insert into public.producto_local (producto_id, local_id)
      select distinct t.producto_id, a.local_id
      from public.tumisoft_stock t
      join public.tumisoft_importacion i on i.id = t.importacion_id
      join public.almacen a on a.id = i.almacen_id
      where t.stock > 0
      on conflict do nothing $q$;
  end if;
end $$;

-- Todo producto que entra a un almacén queda marcado en el negocio de ese almacén
create or replace function public.fn_stock_producto_local() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.producto_local (producto_id, local_id)
  select new.producto_id, a.local_id from public.almacen a where a.id = new.almacen_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_stock_producto_local on public.stock;
create trigger trg_stock_producto_local after insert on public.stock
  for each row execute function public.fn_stock_producto_local();

-- Cantidad de productos activos por negocio (y sin negocio asignado)
create or replace function public.fn_resumen_productos()
returns table(local_codigo text, local_nombre text, productos bigint)
language sql stable security invoker set search_path = public as $$
  select l.codigo::text, l.nombre, count(p.id)
  from public.local l
  left join public.producto_local pl on pl.local_id = l.id
  left join public.producto p on p.id = pl.producto_id and p.activo
  group by l.codigo, l.nombre
  union all
  select 'SIN'::text, 'Sin negocio asignado', count(*)
  from public.producto p
  where p.activo and not exists (select 1 from public.producto_local pl where pl.producto_id = p.id)
  order by 1
$$;

-- 2) Quitar Tumisoft -----------------------------------------------------------------------
-- 2a. Conteos: la referencia es siempre el stock del sistema (o el stock par)
update public.conteo set fuente_stock = 'sistema' where fuente_stock = 'tumisoft';
alter table public.conteo drop constraint if exists conteo_fuente_stock_check;
alter table public.conteo add constraint conteo_fuente_stock_check check (fuente_stock in ('sistema','objetivo'));

create or replace function public.fn_iniciar_conteo(p_conteo uuid, p_solo_con_stock boolean default false) returns integer
language plpgsql set search_path = public as $$
declare v_c public.conteo%rowtype; n integer;
begin
  select * into v_c from public.conteo where id = p_conteo;
  if v_c.estado <> 'abierto' then raise exception 'Solo se inicializa un conteo abierto'; end if;
  delete from public.conteo_detalle where conteo_id = p_conteo and conteo_1 is null and cantidad_fisica is null;

  insert into conteo_detalle(conteo_id, producto_id, stock_sistema, costo_unitario)
  select p_conteo, p.id,
         case v_c.fuente_stock when 'objetivo' then coalesce(pa.stock_objetivo, 0) else coalesce(s.cantidad, 0) end,
         coalesce(nullif(s.costo_promedio, 0), p.costo_referencia, 0)
  from public.producto p
  left join public.stock s on s.producto_id = p.id and s.almacen_id = v_c.almacen_id
  left join public.producto_almacen pa on pa.producto_id = p.id and pa.almacen_id = v_c.almacen_id
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

-- 2b. Vista de stock sin el código Tumisoft (se recrea: cambia la lista de columnas)
drop view if exists public.v_stock;
create view public.v_stock with (security_invoker = true) as
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
from public.stock s
join public.producto p on p.id = s.producto_id
join public.almacen a on a.id = s.almacen_id
join public.local l on l.id = a.local_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id
left join public.producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
where p.activo;

-- 2c. Movimientos de stock inicial: sin referencias a la importación
update public.movimiento
set documento = 'INV-INICIAL',
    observacion = 'Stock inicial al ' || to_char(fecha at time zone 'America/Lima', 'DD/MM/YYYY'),
    referencia_tipo = 'manual', referencia_id = null
where referencia_tipo = 'importacion' or documento = 'TUMISOFT';
alter table public.movimiento drop constraint if exists movimiento_referencia_tipo_check;
alter table public.movimiento add constraint movimiento_referencia_tipo_check
  check (referencia_tipo in ('compra','traslado','conteo','vianda','manual','requerimiento'));

-- 2d. Función, historial y columnas de Tumisoft
drop function if exists public.fn_importar_tumisoft(uuid, date, jsonb, text, boolean);
drop table if exists public.tumisoft_stock;
drop table if exists public.tumisoft_importacion;
alter table public.almacen drop column if exists nombre_tumisoft;
alter table public.unidad_medida drop column if exists nombre_tumisoft;

-- 2e. Códigos de producto: "TS-…" → "P-00001"… (el código "C. interno" de Tumisoft se descarta)
do $$
declare v_max int;
begin
  if exists (select 1 from public.producto where codigo like 'TS-%') then
    select coalesce(max(substring(codigo from '^P-(\d{5})$')::int), 0) into v_max from public.producto;
    update public.producto p set codigo = 'P-' || lpad((v_max + x.n)::text, 5, '0')
    from (select id, row_number() over (order by nombre, codigo) n from public.producto where codigo like 'TS-%') x
    where x.id = p.id;
    select coalesce(max(substring(codigo from '^P-(\d{5})$')::int), 0) into v_max from public.producto;
    insert into public.correlativo(serie, ultimo) values ('PROD', v_max)
    on conflict (serie) do update set ultimo = greatest(correlativo.ultimo, excluded.ultimo);
  end if;
end $$;
alter table public.producto drop column if exists codigo_tumisoft;

-- Verificación
select * from public.fn_resumen_productos();
