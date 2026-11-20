-- =============================================================================
-- 79 · Dos unidades por producto: la chica (en la que se guarda el stock) y una presentación grande
--
-- Cada producto se guarda SIEMPRE en su unidad chica (kilo, litro, unidad/botella): todas las cuentas se
-- hacen ahí y nada descuadra. Además tiene UNA presentación grande que llena el almacén en la ficha
-- («Saco, trae 50 kg», «Caja, trae 12 unidades»). En cualquier formulario se escribe en la chica o en la grande
-- y el sistema convierte solo: Las Flores despacha «1 saco», Umaru «20 kg».
-- =============================================================================

-- ── La presentación grande del producto ─────────────────────────────────────────────────────
alter table public.producto add column if not exists presentacion_id uuid references public.unidad_medida(id);
alter table public.producto add column if not exists presentacion_cantidad numeric(14,4);
alter table public.producto drop constraint if exists producto_presentacion_check;
alter table public.producto add constraint producto_presentacion_check check (
  (presentacion_id is null and presentacion_cantidad is null)
  or (presentacion_id is not null and presentacion_cantidad > 0 and presentacion_id <> unidad_id));

-- ── La unidad chica no se cambia si ya hay movimientos (descuadraría el stock y el Kardex) ──
create or replace function public.fn_producto_unidad_fija() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unidad_id is distinct from old.unidad_id
     and (exists (select 1 from movimiento_detalle where producto_id = new.id)
          or exists (select 1 from stock where producto_id = new.id and cantidad <> 0)) then
    raise exception 'No se puede cambiar la unidad: el producto ya tiene movimientos. Su presentación grande sí se puede cambiar.';
  end if;
  return new;
end $$;
drop trigger if exists tg_producto_unidad_fija on public.producto;
create trigger tg_producto_unidad_fija before update of unidad_id on public.producto
  for each row execute function public.fn_producto_unidad_fija();

-- ── Conversión en la base (requerimientos, traspasos): la presentación grande convierte sola ──
create or replace function public.fn_factor_unidad(p_producto uuid, p_unidad uuid) returns numeric
language plpgsql stable set search_path = public as $$
declare u record; b record; pr record;
begin
  select unidad_id, presentacion_id, presentacion_cantidad into pr from producto where id = p_producto;
  if p_unidad is null or p_unidad = pr.unidad_id then return 1; end if;
  -- su presentación grande: «1 saco = 50 kg»
  if p_unidad = pr.presentacion_id and pr.presentacion_cantidad > 0 then return pr.presentacion_cantidad; end if;
  select * into u from fn_unidad_base(p_unidad);
  select * into b from fn_producto_base(p_producto);
  if u.base is not null and b.base is not null and u.base = b.base and b.q <> 0 then return u.q / b.q; end if;
  -- «Unidad» (o docena, par) en un producto que se cuenta por empaque: cada empaque es una unidad
  if (select codigo from unidad_medida where id = u.base) = 'UND'
     and (select m.tipo from producto p join unidad_medida m on m.id = p.unidad_id where p.id = p_producto) = 'empaque' then
    return u.q;
  end if;
  return null;
end $$;
grant execute on function public.fn_factor_unidad(uuid, uuid) to authenticated;

-- ── El buscador de productos entrega también la presentación ───────────────────────────────
drop function if exists public.fn_buscar_productos(text, uuid, text[], int);
create or replace function public.fn_buscar_productos(
  p_texto text, p_almacen uuid default null, p_tipos text[] default null, p_limite int default 30)
returns table(id uuid, codigo text, nombre text, tipo text, costo_referencia numeric, controla_lote boolean,
              unidad text, stock numeric, rango int, unidad_id uuid, contenido numeric, contenido_unidad_id uuid, contenido_unidad text, imagen_url text,
              presentacion_id uuid, presentacion_cantidad numeric, presentacion text)
language sql stable security invoker set search_path = public as $$
  with q as (
    select fn_normalizar(p_texto) as t,
           array_remove(string_to_array(fn_normalizar(p_texto), ' '), '') as palabras
  ), c as (
    select p.id, p.nombre, p.tipo, p.costo_referencia, p.controla_lote, p.codigo as codigo_global,
           p.nombre_busqueda as nb, pa.codigo as codigo_alm, u.codigo as unidad, p.maestro_id,
           p.imagen_url, p.unidad_id, p.contenido, p.contenido_unidad_id, (select cu.codigo from unidad_medida cu where cu.id = p.contenido_unidad_id) as contenido_unidad,
           p.presentacion_id, p.presentacion_cantidad, (select pu.nombre from unidad_medida pu where pu.id = p.presentacion_id) as presentacion,
           (select s.cantidad from stock s where s.producto_id = p.id and s.almacen_id = p_almacen) as stock
    from producto p
    join unidad_medida u on u.id = p.unidad_id
    left join producto_almacen pa on pa.producto_id = p.id and pa.almacen_id = p_almacen
    where p.activo
      and (p_almacen is null or pa.producto_id is not null)
      and (p_tipos is null or p.tipo = any(p_tipos))
  ), r as (
    select c.*,
           case
             when (q.t ~ '^\d+$' and ((p_almacen is not null and c.codigo_alm = q.t::bigint)
                                       or (p_almacen is null and c.codigo_global = 'P-' || lpad(q.t, 5, '0'))))
                  or lower(c.codigo_global) = q.t then 0
             when left(c.nb, length(q.t)) = q.t then 1
             when position(' ' || q.t in ' ' || c.nb) > 0 then 2
             else 3
           end as rango,
           not exists (select 1 from unnest(q.palabras) w where position(w in c.nb) = 0) as en_nombre,
           c.nb = q.t as igual,
           q.t = '' as vacio
    from c, q
  ), u as (
    select distinct on (r.maestro_id) r.* from r
    where r.rango = 0 or r.en_nombre
    order by r.maestro_id, r.rango, r.codigo_global
  )
  select u.id, coalesce(u.codigo_alm::text, u.codigo_global), u.nombre, u.tipo, u.costo_referencia, u.controla_lote,
         u.unidad, u.stock, u.rango, u.unidad_id, u.contenido, u.contenido_unidad_id, u.contenido_unidad, u.imagen_url,
         u.presentacion_id, u.presentacion_cantidad, u.presentacion
  from u
  order by u.rango, u.igual desc, case when u.vacio then u.codigo_alm end, u.nombre
  limit greatest(coalesce(p_limite, 30), 1)
$$;
grant execute on function public.fn_buscar_productos(text, uuid, text[], int) to authenticated;

-- ── Stock con su presentación (para verlo en las dos unidades: «130 kg · 2 sacos + 30 kg») ──
create or replace view public.v_stock with (security_invoker = true) as
select s.producto_id, s.almacen_id, a.local_id, l.codigo as local_codigo, l.nombre as local_nombre,
       a.nombre as almacen_nombre, a.tipo as almacen_tipo,
       p.codigo, p.nombre, p.tipo as producto_tipo, c.nombre as categoria, u.codigo as unidad,
       s.cantidad, s.costo_promedio, s.valor, s.ultimo_movimiento,
       pa.stock_minimo, pa.stock_maximo, pa.stock_objetivo,
       case when s.cantidad <= 0 then 'agotado'
            when pa.stock_minimo > 0 and s.cantidad <= pa.stock_minimo then 'critico'
            when pa.stock_maximo is not null and s.cantidad > pa.stock_maximo then 'exceso'
            else 'normal' end as estado,
       p.imagen_url,
       pa.codigo as codigo_almacen,
       c.zona,
       pu.nombre as presentacion, p.presentacion_cantidad
from public.stock s
join public.producto p on p.id = s.producto_id
join public.almacen a on a.id = s.almacen_id
join public.local l on l.id = a.local_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id
left join public.producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
left join public.unidad_medida pu on pu.id = p.presentacion_id
where p.activo;

-- ── Unidad chica de los productos que se conocen (acordado con el usuario, 2026-11-20) ──────
-- Solo si aún no tienen movimientos. La presentación grande (cuánto trae el saco o la caja) la llena el almacén.
do $$
declare v_kg uuid; v_l uuid; n int;
begin
  select id into v_kg from public.unidad_medida where codigo = 'KG';
  select id into v_l from public.unidad_medida where codigo = 'L';
  update public.producto p set unidad_id = v_kg
   where p.unidad_id <> v_kg
     and p.nombre in ('AZÚCAR BLANCA X 50 KG', 'AZÚCAR RUBIA X 50 KG', 'AZÚCAR IMPALPABLE GM', 'COMINO GM',
                      'HARINA DE TRIGO NICOLINI (MORADO)', 'HARINA FUERZA BLANCA NIEVE (ANARANJADO)',
                      'CAFE RISO KL', 'FIDEOS SPAGHETTI KL', 'MANTEQUILLA X KL', 'PAPEL DESPACHO X KL')
     and not exists (select 1 from public.movimiento_detalle d where d.producto_id = p.id);
  get diagnostics n = row_count;
  raise notice 'Pasaron a Kilo: %', n;
  update public.producto p set unidad_id = v_l
   where p.unidad_id <> v_l and p.nombre in ('ACEITE 20 LT', 'SILLAO 5 LT')
     and not exists (select 1 from public.movimiento_detalle d where d.producto_id = p.id);
  get diagnostics n = row_count;
  raise notice 'Pasaron a Litro: %', n;
end $$;

-- ── «Agregar los que están bajo el mínimo» (requerimiento del almacén): con su unidad y su presentación ──
drop function if exists public.fn_bajo_minimo(uuid);
create or replace function public.fn_bajo_minimo(p_almacen uuid)
returns table(id uuid, codigo text, nombre text, unidad text, tipo text, costo_referencia numeric, controla_lote boolean,
              stock numeric, minimo numeric, unidad_id uuid, presentacion_id uuid, presentacion_cantidad numeric, presentacion text)
language sql stable security invoker set search_path = public as $$
  select p.id, pa.codigo::text, p.nombre, u.codigo, p.tipo, p.costo_referencia, p.controla_lote,
         coalesce(s.cantidad, 0), pa.stock_minimo, p.unidad_id, p.presentacion_id, p.presentacion_cantidad, pu.nombre
  from producto_almacen pa
  join producto p on p.id = pa.producto_id and p.activo
  join unidad_medida u on u.id = p.unidad_id
  left join unidad_medida pu on pu.id = p.presentacion_id
  left join stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id
  where pa.almacen_id = p_almacen and pa.stock_minimo > 0 and coalesce(s.cantidad, 0) <= pa.stock_minimo
  order by coalesce(s.cantidad, 0) / nullif(pa.stock_minimo, 0), p.nombre
$$;
grant execute on function public.fn_bajo_minimo(uuid) to authenticated;
