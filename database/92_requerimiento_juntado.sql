-- =============================================================================
-- 92 · Requerimiento juntado de Logística (RL): los requerimientos del ALMACÉN de un negocio en un día
--
-- · Cada negocio aparte (Umaru con Umaru, Las Flores con Las Flores). Dentro del negocio se juntan TODOS los
--   requerimientos del almacén del mismo día (00:00–23:59, hora de Lima), de cualquiera de sus almacenes.
--   Fernanda los ve como uno solo: RL-UM-2026-0004. Por dentro siguen separados (cada almacén ve los suyos).
-- · Ya no se aprueban: al crearse quedan aprobados con lo pedido (sin botón Aprobar ni «Comprado»).
-- · requerimiento_detalle.enviado_at: Logística descargó la imagen / el PDF con ese producto (queda en verde).
-- · cotizacion.consolidado_id: la cotización hecha desde el RL (con los productos que marcó Fernanda).
-- · Los requerimientos del almacén que ya existen se juntan por su día; los que Logística ya trabajó
--   (aprobados, comprados…) quedan como ENVIADOS; los que estaban por aprobar quedan aprobados y por enviar.
-- Los requerimientos de las ÁREAS no cambian.
-- =============================================================================

-- 1) el requerimiento juntado ---------------------------------------------------------------------
create table if not exists public.requerimiento_consolidado (
  id         uuid primary key default gen_random_uuid(),
  numero     text unique,                                   -- RL-UM-2026-0004
  local_id   uuid not null references public.local(id),
  fecha      date not null,                                 -- el día (hora de Lima)
  created_at timestamptz not null default now(),
  unique (local_id, fecha)
);
alter table public.requerimiento_consolidado enable row level security;
drop policy if exists p_leer on public.requerimiento_consolidado;
create policy p_leer on public.requerimiento_consolidado for select to authenticated
  using ((select public.fn_puede('requerimientos', 'leer')) and array[local_id] <@ (select public.fn_mis_locales()));

alter table public.requerimiento add column if not exists consolidado_id uuid references public.requerimiento_consolidado(id);
create index if not exists ix_req_consolidado on public.requerimiento(consolidado_id);
alter table public.requerimiento_detalle add column if not exists enviado_at timestamptz;
alter table public.requerimiento_detalle add column if not exists enviado_por uuid references auth.users(id);
alter table public.cotizacion add column if not exists consolidado_id uuid references public.requerimiento_consolidado(id);

-- 2) el RL del negocio en ese día (lo crea si no existe, con el siguiente número del negocio en el año)
create or replace function public.fn_consolidado_de(p_local uuid, p_fecha date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_loc text; v_anio text := to_char(p_fecha, 'YYYY');
begin
  select id into v_id from requerimiento_consolidado where local_id = p_local and fecha = p_fecha;
  if v_id is not null then return v_id; end if;
  select codigo into v_loc from local where id = p_local;
  insert into requerimiento_consolidado (local_id, fecha, numero)
  values (p_local, p_fecha, 'RL-' || v_loc || '-' || v_anio || '-' || lpad(fn_siguiente_numero('RL-' || v_loc || '-' || v_anio)::text, 4, '0'))
  on conflict (local_id, fecha) do nothing
  returning id into v_id;
  -- otro requerimiento del mismo día lo creó al mismo tiempo
  if v_id is null then select id into v_id from requerimiento_consolidado where local_id = p_local and fecha = p_fecha; end if;
  return v_id;
end $$;
revoke execute on function public.fn_consolidado_de(uuid, date) from public, anon, authenticated;

-- 3) al crearse un requerimiento del almacén: va a su RL y queda aprobado (sin paso de aprobación) ----
create or replace function public.fn_req_almacen_al_crear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(to_jsonb(new)->>'origen', 'area') = 'almacen' then
    new.consolidado_id := coalesce(new.consolidado_id,
      fn_consolidado_de(new.local_id, (coalesce(new.created_at, now()) at time zone 'America/Lima')::date));
    if new.estado = 'solicitado' then
      new.estado := 'aprobado'; new.aprobado_at := now(); new.aprobado_por := 'Automático';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_req_almacen_al_crear on public.requerimiento;
create trigger trg_req_almacen_al_crear before insert on public.requerimiento
  for each row execute function public.fn_req_almacen_al_crear();

-- cada producto del requerimiento del almacén queda aprobado con lo pedido
create or replace function public.fn_reqdet_almacen_aprobado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cantidad_aprobada is null
     and exists (select 1 from requerimiento r where r.id = new.requerimiento_id and r.origen = 'almacen') then
    new.cantidad_aprobada := new.cantidad_solicitada;
  end if;
  return new;
end $$;
drop trigger if exists trg_reqdet_almacen_aprobado on public.requerimiento_detalle;
create trigger trg_reqdet_almacen_aprobado before insert on public.requerimiento_detalle
  for each row execute function public.fn_reqdet_almacen_aprobado();

-- 4) Logística marca (o desmarca) los productos que ya envió al proveedor -----------------------------
create or replace function public.fn_marcar_enviados(p_detalles uuid[], p_enviado boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not fn_puede('requerimientos', 'aprobar') then raise exception 'Solo Logística marca lo enviado al proveedor'; end if;
  update requerimiento_detalle d
     set enviado_at = case when p_enviado then now() end, enviado_por = case when p_enviado then auth.uid() end
    from requerimiento r
   where r.id = d.requerimiento_id and d.id = any(p_detalles) and r.origen = 'almacen' and fn_tiene_local(r.local_id);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.fn_marcar_enviados(uuid[], boolean) to authenticated;

-- 5) la lista de Logística: un RL por negocio y día ---------------------------------------------------
create or replace view public.v_requerimiento_consolidado with (security_invoker = true) as
select c.id, c.numero, c.local_id, l.codigo as local_codigo, l.nombre as local_nombre, c.fecha,
       count(distinct r.id) as requerimientos,
       array_agg(distinct r.numero) as numeros,
       count(distinct d.producto_id) filter (where coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0) as productos,
       count(distinct d.producto_id) filter (where coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0 and d.enviado_at is null) as por_enviar,
       -- los que aún tienen algo por enviar van primero en la lista
       bool_or(coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0 and d.enviado_at is null) is true as pendiente
from public.requerimiento_consolidado c
join public.local l on l.id = c.local_id
join public.requerimiento r on r.consolidado_id = c.id and r.estado <> 'rechazado'
left join public.requerimiento_detalle d on d.requerimiento_id = r.id
group by c.id, l.codigo, l.nombre;
grant select on public.v_requerimiento_consolidado to authenticated;

-- 6) los que ya existen -------------------------------------------------------------------------------
do $$
declare r record;
begin
  -- se juntan por su día, en orden (así los números RL van del más antiguo al más nuevo)
  for r in select id, local_id, created_at from requerimiento
            where origen = 'almacen' and consolidado_id is null and estado <> 'rechazado' order by created_at loop
    update requerimiento set consolidado_id = fn_consolidado_de(r.local_id, (r.created_at at time zone 'America/Lima')::date)
     where id = r.id;
  end loop;
end $$;

-- los que Logística ya trabajó (aprobados, cotizados, comprados, atendidos): ENVIADOS
update requerimiento_detalle d set enviado_at = coalesce(r.aprobado_at, r.created_at)
  from requerimiento r
 where r.id = d.requerimiento_id and r.origen = 'almacen' and d.enviado_at is null
   and r.estado in ('aprobado', 'en_cotizacion', 'comprado', 'atendido', 'cerrado');

-- los que estaban por aprobar: aprobados con lo pedido y POR ENVIAR
update requerimiento_detalle d set cantidad_aprobada = d.cantidad_solicitada
  from requerimiento r
 where r.id = d.requerimiento_id and r.origen = 'almacen' and r.estado = 'solicitado' and d.cantidad_aprobada is null;
update requerimiento set estado = 'aprobado', aprobado_at = now(), aprobado_por = 'Automático'
 where origen = 'almacen' and estado = 'solicitado';

notify pgrst, 'reload schema';

-- Verificación: cada RL con sus requerimientos y lo que falta enviar
select numero, local_codigo, fecha, requerimientos, numeros, productos, por_enviar
from public.v_requerimiento_consolidado order by fecha desc, local_codigo;
