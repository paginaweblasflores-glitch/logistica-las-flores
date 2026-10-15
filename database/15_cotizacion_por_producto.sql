-- =============================================================================
--  15_cotizacion_por_producto.sql
--  Una cotización puede repartirse entre varios proveedores: cada producto se
--  adjudica a la oferta que gana (el sistema propone la más barata) y se genera
--  UNA COMPRA POR PROVEEDOR ganador. El requerimiento queda "atendido" cuando
--  llegaron todas sus compras.
--  · cotizacion_item.oferta_ganadora_id   → qué oferta ganó ese producto
--  · cotizacion_item.requerimiento_detalle_id → enlace con el producto del requerimiento
--  · compra.oferta_id                      → de qué oferta ganadora salió la compra
--  Las cotizaciones ya adjudicadas (a un solo proveedor) se pasan a este esquema.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
alter table public.cotizacion_item add column if not exists oferta_ganadora_id uuid references public.cotizacion_oferta(id) on delete set null;
alter table public.cotizacion_item add column if not exists requerimiento_detalle_id uuid references public.requerimiento_detalle(id) on delete set null;
alter table public.compra add column if not exists oferta_id uuid references public.cotizacion_oferta(id) on delete set null;
create index if not exists ix_compra_oferta on public.compra(oferta_id);

-- Enlace de los productos ya cotizados con su requerimiento (por descripción)
update public.cotizacion_item i set requerimiento_detalle_id = d.id
from public.cotizacion c, public.requerimiento_detalle d
where c.id = i.cotizacion_id and d.requerimiento_id = c.requerimiento_id
  and d.descripcion = i.descripcion and i.requerimiento_detalle_id is null;

-- Cotizaciones ya adjudicadas: cada producto gana con la oferta adjudicada (última ronda de ese proveedor)
update public.cotizacion_item i set oferta_ganadora_id = (
  select o.id from public.cotizacion_oferta o
  join public.cotizacion_precio cp on cp.oferta_id = o.id and cp.item_id = i.id
  where o.cotizacion_id = c.id
    and (o.id = c.oferta_aprobada_id or (c.oferta_aprobada_id is null and o.proveedor_id = c.proveedor_aprobado_id))
  order by o.ronda desc limit 1)
from public.cotizacion c
where c.id = i.cotizacion_id and c.estado = 'adjudicada' and c.proveedor_aprobado_id is not null and i.oferta_ganadora_id is null;

-- Compras ya generadas desde esas cotizaciones
update public.compra x set oferta_id = (
  select i.oferta_ganadora_id from public.cotizacion_item i
  where i.cotizacion_id = x.cotizacion_id and i.oferta_ganadora_id is not null limit 1)
where x.cotizacion_id is not null and x.oferta_id is null;

-- Resumen de la cotización: si se adjudicó por producto, los totales se calculan producto por producto
-- (1ª ronda = el precio más bajo de la 1ª ronda de cada producto; adjudicado = el precio del ganador).
create or replace view public.v_cotizacion_ahorro with (security_invoker = true) as
with gan as (
  select i.cotizacion_id, i.cantidad, i.oferta_ganadora_id,
         (select cp.precio_unitario from public.cotizacion_precio cp where cp.oferta_id = i.oferta_ganadora_id and cp.item_id = i.id) as precio_final,
         (select min(cp.precio_unitario) from public.cotizacion_precio cp join public.cotizacion_oferta o on o.id = cp.oferta_id
           where o.cotizacion_id = i.cotizacion_id and o.ronda = 1 and cp.item_id = i.id) as precio_r1
  from public.cotizacion_item i where i.oferta_ganadora_id is not null
), res as (
  select cotizacion_id,
         round(sum(precio_final * cantidad), 2) as total_final,
         round(sum(coalesce(precio_r1, precio_final) * cantidad), 2) as total_r1,
         count(distinct oferta_ganadora_id) as n_ofertas
  from gan group by cotizacion_id
), viejo as (
  select c.id,
         (select min(total) from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.ronda = 1) as total_r1,
         coalesce((select o.total from public.v_cotizacion_oferta o where o.id = c.oferta_aprobada_id),
                  (select o.total from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.proveedor_id = c.proveedor_aprobado_id
                    order by o.ronda desc limit 1)) as total_final
  from public.cotizacion c
)
select c.id, c.numero, c.fecha, c.local_id, c.titulo, c.estado, c.proveedor_aprobado_id,
       coalesce((select string_agg(distinct p.razon_social, ', ')
                   from public.cotizacion_item i
                   join public.cotizacion_oferta o on o.id = i.oferta_ganadora_id
                   join public.proveedor p on p.id = o.proveedor_id
                  where i.cotizacion_id = c.id), pr.razon_social) as proveedor_aprobado,
       case when res.cotizacion_id is not null then res.total_r1 else v.total_r1 end as total_primera_ronda,
       case when res.cotizacion_id is not null then res.total_final else v.total_final end as total_adjudicado,
       case when res.cotizacion_id is not null then res.total_r1 - res.total_final else v.total_r1 - v.total_final end as ahorro,
       c.oferta_aprobada_id,
       (select x.canal from public.cotizacion_oferta x where x.id = c.oferta_aprobada_id) as canal_aprobado,
       coalesce(res.n_ofertas, 0)::int as compras_previstas
from public.cotizacion c
left join public.proveedor pr on pr.id = c.proveedor_aprobado_id
left join res on res.cotizacion_id = c.id
left join viejo v on v.id = c.id;

-- Recepción de compras: el requerimiento se cierra solo cuando llegaron todas sus compras
create or replace function public.fn_recibir_compra(p_compra uuid, p_fecha_entrega timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype; v_mov uuid; v_lineas jsonb;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if not fn_tiene_local(v_c.local_id) or not (fn_puede('inventario', 'escribir') or fn_puede('compras', 'escribir')) then
    raise exception 'No autorizado para recibir esta compra';
  end if;
  if v_c.estado = 'recibida' then raise exception 'La compra % ya fue recibida', v_c.numero; end if;
  if v_c.estado = 'anulada' then raise exception 'La compra % está anulada', v_c.numero; end if;

  update compra_detalle set cantidad_recibida = coalesce(cantidad_recibida, cantidad_solicitada)
   where compra_id = p_compra;

  select jsonb_agg(jsonb_build_object(
           'producto_id', producto_id, 'cantidad', cantidad_recibida,
           'costo_unitario', precio_unitario, 'fecha_vencimiento', fecha_vencimiento))
    into v_lineas
  from compra_detalle where compra_id = p_compra and producto_id is not null and cantidad_recibida > 0;

  if v_lineas is not null then
    v_mov := fn_registrar_movimiento('entrada_compra', v_c.almacen_id, v_lineas, p_fecha_entrega, null,
               concat_ws(' ', v_c.tipo_documento, v_c.numero_documento), 'Recepción ' || v_c.numero,
               null, 'compra', p_compra);
  end if;

  insert into precio_historial(producto_id, proveedor_id, local_id, fecha, precio, tipo, compra_detalle_id)
  select d.producto_id, v_c.proveedor_id, v_c.local_id, v_c.fecha, d.precio_unitario, 'compra', d.id
  from compra_detalle d where d.compra_id = p_compra and d.producto_id is not null;

  update producto p set costo_referencia = d.precio_unitario, updated_at = now()
  from compra_detalle d where d.compra_id = p_compra and d.producto_id = p.id;

  update compra set estado = 'recibida',
                    fecha_entrega = p_fecha_entrega,
                    fecha_aprobacion = coalesce(fecha_aprobacion, p_fecha_entrega)
   where id = p_compra;
  -- El requerimiento queda atendido cuando ya llegó TODO: no quedan compras suyas por recibir y
  -- cada proveedor ganador de su cotización (puede ser más de uno) ya tiene su compra recibida.
  if v_c.requerimiento_id is not null
     and not exists (select 1 from compra x where x.requerimiento_id = v_c.requerimiento_id and x.estado not in ('recibida', 'anulada'))
     and not exists (
       select 1 from cotizacion_item i join cotizacion q on q.id = i.cotizacion_id
       where q.requerimiento_id = v_c.requerimiento_id and q.estado = 'adjudicada' and i.oferta_ganadora_id is not null
         and not exists (select 1 from compra x where x.oferta_id = i.oferta_ganadora_id and x.estado = 'recibida'))
  then
    update requerimiento set estado = 'atendido', atendido_at = coalesce(atendido_at, p_fecha_entrega)
     where id = v_c.requerimiento_id and estado in ('aprobado', 'en_cotizacion', 'comprado');
  end if;
  return v_mov;
end $$;

-- Verificación
select c.numero, c.estado, v.proveedor_aprobado, v.total_adjudicado, v.compras_previstas,
       (select count(*) from public.compra x where x.cotizacion_id = c.id and x.estado <> 'anulada') as compras
from public.cotizacion c join public.v_cotizacion_ahorro v on v.id = c.id order by c.numero;
