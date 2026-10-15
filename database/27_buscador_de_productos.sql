-- =============================================================================
--  27_buscador_de_productos.sql
--  Buscador de productos rápido y preciso (como en un almacén):
--    · sin distinguir mayúsculas, minúsculas ni tildes («cafe» = «CAFÉ»)
--    · todas las palabras escritas, en cualquier orden («vaso vid» → VASO DE VIDRIO)
--    · orden: código exacto → empieza con lo escrito → alguna palabra empieza → lo contiene
--    · un número busca el código del almacén y también en el nombre («20» → ACEITE 20 LT)
--  Además: el código del almacén en el Kardex y en FIFO y vencimientos.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Nombre normalizado para buscar (sin tildes, minúsculas, espacios simples) ----------------------
alter table public.producto add column if not exists nombre_busqueda text
  generated always as (public.fn_normalizar(nombre)) stored;
create index if not exists ix_producto_busqueda_trgm on public.producto using gin (nombre_busqueda extensions.gin_trgm_ops);

-- 2) Búsqueda ---------------------------------------------------------------------------------------
-- p_almacen: panel de almacén → solo los productos de ESE almacén, con su código y su stock
create or replace function public.fn_buscar_productos(
  p_texto text, p_almacen uuid default null, p_tipos text[] default null, p_limite int default 30)
returns table(id uuid, codigo text, nombre text, tipo text, costo_referencia numeric, controla_lote boolean,
              unidad text, stock numeric, rango int)
language sql stable security invoker set search_path = public as $$
  with q as (
    select fn_normalizar(p_texto) as t,
           array_remove(string_to_array(fn_normalizar(p_texto), ' '), '') as palabras
  ), c as (
    select p.id, p.nombre, p.tipo, p.costo_referencia, p.controla_lote, p.codigo as codigo_global,
           p.nombre_busqueda as nb, pa.codigo as codigo_alm, u.codigo as unidad,
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
             -- código exacto: el del almacén (23) o el general (P-00023)
             when (q.t ~ '^\d+$' and ((p_almacen is not null and c.codigo_alm = q.t::bigint)
                                       or (p_almacen is null and c.codigo_global = 'P-' || lpad(q.t, 5, '0'))))
                  or lower(c.codigo_global) = q.t then 0
             when left(c.nb, length(q.t)) = q.t then 1                        -- empieza con lo escrito
             when position(' ' || q.t in ' ' || c.nb) > 0 then 2               -- alguna palabra empieza
             else 3                                                            -- lo contiene
           end as rango,
           -- todas las palabras aparecen en el nombre (en cualquier orden)
           not exists (select 1 from unnest(q.palabras) w where position(w in c.nb) = 0) as en_nombre,
           c.nb = q.t as igual
    from c, q
    where q.t <> ''
  )
  select r.id, coalesce(r.codigo_alm::text, r.codigo_global), r.nombre, r.tipo, r.costo_referencia, r.controla_lote,
         r.unidad, r.stock, r.rango
  from r
  where r.rango = 0 or r.en_nombre
  order by r.rango, r.igual desc, r.nombre   -- dentro de cada grupo, en orden alfabético
  limit greatest(coalesce(p_limite, 30), 1)
$$;
grant execute on function public.fn_buscar_productos(text, uuid, text[], int) to authenticated;

-- 3) Código del almacén en Kardex, movimientos recientes y FIFO -------------------------------------
create or replace view public.v_kardex with (security_invoker = true) as
select m.id as movimiento_id, m.numero, m.fecha, m.tipo, t.nombre as tipo_nombre, t.signo,
       m.almacen_id, a.nombre as almacen_nombre, m.local_id, mo.codigo as motivo, mo.nombre as motivo_nombre,
       m.referencia_tipo, m.referencia_id, m.documento, m.observacion,
       d.id as detalle_id, d.producto_id, p.nombre as producto_nombre, u.codigo as unidad,
       case when t.signo > 0 then d.cantidad end as entrada,
       case when t.signo < 0 then d.cantidad end as salida,
       d.costo_unitario, round(d.cantidad * coalesce(d.costo_unitario, 0), 2) as importe,
       sum(t.signo * d.cantidad) over (partition by d.producto_id, m.almacen_id
                                       order by m.fecha, m.numero, d.id) as saldo,
       d.fifo_cumplido,
       m.nro,
       pa.codigo as codigo_almacen
from public.movimiento m
join public.movimiento_detalle d on d.movimiento_id = m.id
join public.tipo_movimiento t on t.codigo = m.tipo
join public.almacen a on a.id = m.almacen_id
join public.producto p on p.id = d.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.motivo mo on mo.id = m.motivo_id
left join public.producto_almacen pa on pa.producto_id = d.producto_id and pa.almacen_id = m.almacen_id
where not m.anulado;

create or replace view public.v_movimiento_linea with (security_invoker = true) as
select m.id as movimiento_id, m.numero, m.fecha, m.tipo, t.nombre as tipo_nombre, t.signo, m.almacen_id, a.nombre as almacen_nombre,
       m.local_id, mo.nombre as motivo_nombre, m.referencia_tipo, m.referencia_id, m.documento, m.observacion,
       d.id as detalle_id, d.producto_id, p.nombre as producto_nombre, u.codigo as unidad,
       case when t.signo > 0 then d.cantidad end as entrada, case when t.signo < 0 then d.cantidad end as salida,
       d.costo_unitario, round(d.cantidad * coalesce(d.costo_unitario, 0), 2) as importe, d.fifo_cumplido,
       m.nro,
       pa.codigo as codigo_almacen
from public.movimiento m
join public.movimiento_detalle d on d.movimiento_id = m.id
join public.tipo_movimiento t on t.codigo = m.tipo
join public.almacen a on a.id = m.almacen_id
join public.producto p on p.id = d.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.motivo mo on mo.id = m.motivo_id
left join public.producto_almacen pa on pa.producto_id = d.producto_id and pa.almacen_id = m.almacen_id
where not m.anulado;

create or replace view public.v_lote_fifo with (security_invoker = true) as
select lo.id, lo.producto_id, p.nombre as producto, lo.almacen_id, a.nombre as almacen, a.local_id,
       lo.fecha_ingreso, lo.fecha_vencimiento, lo.cantidad_inicial, lo.cantidad_disponible, lo.costo_unitario,
       (current_date - lo.fecha_ingreso::date) as dias_en_almacen,
       (lo.fecha_vencimiento - current_date) as dias_para_vencer,
       row_number() over (partition by lo.producto_id, lo.almacen_id order by lo.fecha_ingreso) as orden_salida,
       case when lo.fecha_vencimiento < current_date then 'vencido'
            when lo.fecha_vencimiento <= current_date + public.fn_param('dias_alerta_vencimiento', 7)::int then 'por_vencer'
            else 'vigente' end as estado,
       pa.codigo as codigo_almacen
from public.lote lo
join public.producto p on p.id = lo.producto_id
join public.almacen a on a.id = lo.almacen_id
left join public.producto_almacen pa on pa.producto_id = lo.producto_id and pa.almacen_id = lo.almacen_id
where lo.cantidad_disponible > 0;

-- Verificación: «v» en el Almacén 01 (primero los que empiezan con V)
select codigo, nombre, rango
from public.fn_buscar_productos('v', (select id from public.almacen where codigo = 'ALM-LF'), null, 10);
