-- =============================================================================
--  33_aviso_de_vencimiento.sql
--  Vencimientos para TODOS los productos (no solo los de FIFO), como el stock mínimo:
--    · el responsable de cada almacén pone la fecha de vencimiento del producto y
--      con cuántos días de anticipación quiere el aviso (por defecto 30; puede ser 5, 7, 10…).
--    · productos con «Controlar vencimiento (FIFO)»: la fecha es la de cada lote (llega en cada entrada);
--      los días de aviso son los del producto en ese almacén.
--    · la campanita del almacén avisa cuando faltan esos días (o ya venció con saldo).
--  Reemplaza al parámetro general 'dias_alerta_vencimiento' (7 días) en el estado «por vencer».
--  Es solo de los almacenes: Logística no lo ve.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

alter table public.producto_almacen add column if not exists fecha_vencimiento date;
alter table public.producto_almacen add column if not exists dias_aviso_vencimiento integer not null default 30;
do $$ begin
  alter table public.producto_almacen add constraint ck_dias_aviso_vencimiento check (dias_aviso_vencimiento between 1 and 365);
exception when duplicate_object then null; end $$;

comment on column public.producto_almacen.fecha_vencimiento is 'Vencimiento del producto en este almacén (productos sin FIFO; los de FIFO usan la fecha de cada lote)';
comment on column public.producto_almacen.dias_aviso_vencimiento is 'Días antes del vencimiento en que avisa la campanita del almacén (por defecto 30)';

-- Lotes FIFO: «por vencer» según los días de aviso del producto en su almacén
create or replace view public.v_lote_fifo with (security_invoker = true) as
select lo.id, lo.producto_id, p.nombre as producto, lo.almacen_id, a.nombre as almacen, a.local_id,
       lo.fecha_ingreso, lo.fecha_vencimiento, lo.cantidad_inicial, lo.cantidad_disponible, lo.costo_unitario,
       (current_date - lo.fecha_ingreso::date) as dias_en_almacen,
       (lo.fecha_vencimiento - current_date) as dias_para_vencer,
       row_number() over (partition by lo.producto_id, lo.almacen_id order by lo.fecha_ingreso) as orden_salida,
       case when lo.fecha_vencimiento < current_date then 'vencido'
            when lo.fecha_vencimiento <= current_date + coalesce(pa.dias_aviso_vencimiento, 30) then 'por_vencer'
            else 'vigente' end as estado,
       pa.codigo as codigo_almacen,
       coalesce(pa.dias_aviso_vencimiento, 30) as dias_aviso
from public.lote lo
join public.producto p on p.id = lo.producto_id
join public.almacen a on a.id = lo.almacen_id
left join public.producto_almacen pa on pa.producto_id = lo.producto_id and pa.almacen_id = lo.almacen_id
where lo.cantidad_disponible > 0;

-- Todos los vencimientos con saldo: lotes (FIFO) + fecha puesta en la ficha (sin FIFO)
create or replace view public.v_vencimiento with (security_invoker = true) as
select 'L' || l.id::text as id, l.producto_id, l.producto, l.codigo_almacen, l.almacen_id, l.almacen, l.local_id,
       l.fecha_vencimiento, l.dias_para_vencer, l.dias_aviso, l.cantidad_disponible as cantidad, u.codigo as unidad, true as fifo, l.estado
from public.v_lote_fifo l
join public.producto p on p.id = l.producto_id
join public.unidad_medida u on u.id = p.unidad_id
where l.fecha_vencimiento is not null
union all
select 'P' || pa.producto_id::text || pa.almacen_id::text, pa.producto_id, p.nombre, pa.codigo, pa.almacen_id, a.nombre, a.local_id,
       pa.fecha_vencimiento, (pa.fecha_vencimiento - current_date), pa.dias_aviso_vencimiento, s.cantidad, u.codigo, false,
       case when pa.fecha_vencimiento < current_date then 'vencido'
            when pa.fecha_vencimiento <= current_date + pa.dias_aviso_vencimiento then 'por_vencer'
            else 'vigente' end
from public.producto_almacen pa
join public.producto p on p.id = pa.producto_id and not p.controla_lote and p.activo
join public.almacen a on a.id = pa.almacen_id
join public.unidad_medida u on u.id = p.unidad_id
join public.stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id and s.cantidad > 0
where pa.fecha_vencimiento is not null;
grant select on public.v_vencimiento to authenticated;

-- Separar Almacén 01 / 02: el producto se lleva también su vencimiento y sus días de aviso
create or replace function public.fn_mover_productos_almacen(p_productos uuid[], p_origen uuid, p_destino uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lo uuid; v_ld uuid; n_mov int := 0; n_omit int := 0; p uuid;
begin
  select local_id into v_lo from almacen where id = p_origen and activo;
  select local_id into v_ld from almacen where id = p_destino and activo;
  if v_lo is null or v_ld is null or v_lo <> v_ld or p_origen = p_destino then
    raise exception 'Los dos almacenes deben ser distintos y del mismo negocio';
  end if;
  if not fn_es_almacen() or not fn_tiene_local(v_lo) then raise exception 'Solo el responsable del almacén separa sus productos'; end if;
  foreach p in array coalesce(p_productos, '{}') loop
    -- con stock o movimientos en el origen no se mueve (eso ya sería un traspaso)
    if exists (select 1 from stock s where s.producto_id = p and s.almacen_id = p_origen)
       or not exists (select 1 from producto_almacen pa where pa.producto_id = p and pa.almacen_id = p_origen) then
      n_omit := n_omit + 1; continue;
    end if;
    insert into producto_almacen (producto_id, almacen_id, stock_minimo, stock_maximo, stock_objetivo, ubicacion, fecha_vencimiento, dias_aviso_vencimiento)
    select producto_id, p_destino, stock_minimo, stock_maximo, stock_objetivo, ubicacion, fecha_vencimiento, dias_aviso_vencimiento
    from producto_almacen where producto_id = p and almacen_id = p_origen
    on conflict (producto_id, almacen_id) do nothing;
    delete from producto_almacen where producto_id = p and almacen_id = p_origen;
    n_mov := n_mov + 1;
  end loop;
  return jsonb_build_object('movidos', n_mov, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_mover_productos_almacen(uuid[], uuid, uuid) to authenticated;

-- Verificación: vencimientos que hoy avisan
select almacen, producto, fecha_vencimiento, dias_para_vencer, dias_aviso, estado
from public.v_vencimiento where estado <> 'vigente' order by fecha_vencimiento;
