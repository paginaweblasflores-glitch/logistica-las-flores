-- =============================================================================
--  18_ingresos_de_almacen.sql
--  El almacén es quien recibe con la boleta en mano: registra el PRECIO REAL y el TOTAL
--  (lo que antes llenaba en el Excel "ALMACEN F1 Y H2"). Logística supervisa.
--  · Recibir una compra: N° y total de la boleta, cantidad que llegó y precio unitario de la
--    boleta por producto. Si el precio difiere de la orden, queda marcado (precio_orden).
--  · Ingreso directo: compras que maneja el almacén sin requerimiento ni orden de compra
--    (p. ej. el distribuidor de gaseosas). N° IN-LF-2026-0001. Entran al stock y al historial
--    de precios, pero no cuentan para el indicador OTIF (no hubo orden ni plazo).
--  · v_ingreso_almacen: el "Excel F1 Y H2" dentro del sistema, para los dos almacenes.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
alter table public.compra add column if not exists sin_orden boolean not null default false;
alter table public.compra add column if not exists total_documento numeric(14,2);
alter table public.compra add column if not exists recibido_por uuid references auth.users(id);
alter table public.compra_detalle add column if not exists precio_orden numeric(14,4);   -- precio de la orden si la boleta trajo otro

create or replace view public.v_compra_resumen with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, l.nombre as local_nombre, l.codigo as local_codigo,
       c.almacen_id, c.proveedor_id, pr.razon_social as proveedor, c.ciudad_id, ci.nombre as ciudad,
       c.estado, c.tipo_documento, c.numero_documento, c.forma_pago, c.requerimiento_id,
       c.fecha_aprobacion, c.fecha_entrega,
       coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) as fecha_objetivo,
       x.items, x.total, x.total_solicitado, x.ahorro, x.base_comparable,
       coalesce(tr.costo, 0) as costo_transporte,
       x.total + coalesce(tr.costo, 0) as costo_total,
       -- OTIF (definición estándar: pedido a tiempo Y completo)
       case when c.estado = 'recibida' and not c.sin_orden and c.fecha_aprobacion is not null
            then c.fecha_entrega <= coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) end as on_time,
       case when c.estado = 'recibida' and not c.sin_orden then x.in_full end as in_full,
       case when c.estado = 'recibida' and not c.sin_orden then x.fill_rate end as fill_rate,
       round(extract(epoch from (c.fecha_entrega - c.fecha_aprobacion)) / 3600.0, 1) as horas_entrega,
       -- todo lo comprado es fuera de catálogo (va directo al área): la llegada la registra Logística, no el almacén
       coalesce(x.solo_fuera_catalogo, false) as solo_fuera_catalogo,
       c.sin_orden, c.total_documento,
       coalesce(x.diferencias_precio, 0) as diferencias_precio
from public.compra c
join public.local l on l.id = c.local_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id
left join lateral (
  select count(*) as items,
         round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total,
         round(sum(d.cantidad_solicitada * d.precio_unitario), 2) as total_solicitado,
         round(sum(case when d.precio_anterior is not null
                        then (d.precio_anterior - d.precio_unitario) * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as ahorro,
         round(sum(case when d.precio_anterior is not null
                        then d.precio_anterior * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as base_comparable,
         bool_and(coalesce(d.cantidad_recibida, 0) >= d.cantidad_solicitada) as in_full,
         least(1, sum(least(coalesce(d.cantidad_recibida, 0), d.cantidad_solicitada)) / nullif(sum(d.cantidad_solicitada), 0)) as fill_rate,
         bool_and(d.producto_id is null) as solo_fuera_catalogo,
         count(*) filter (where d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencias_precio
  from public.compra_detalle d where d.compra_id = c.id) x on true
left join lateral (select sum(t.costo) costo from public.transporte t where t.compra_id = c.id) tr on true;

-- Ingresos de almacén (una fila por producto recibido)
create or replace view public.v_ingreso_almacen with (security_invoker = true) as
select d.id, c.id as compra_id, c.numero, c.sin_orden, c.local_id, l.codigo as local_codigo,
       c.almacen_id, a.nombre as almacen, coalesce(c.fecha_entrega, c.fecha::timestamptz) as fecha_ingreso,
       c.proveedor_id, pr.razon_social as proveedor, c.tipo_documento, c.numero_documento, c.total_documento,
       d.producto_id, coalesce(p.nombre, d.descripcion) as producto, p.codigo as producto_codigo, p.marca, p.presentacion,
       coalesce(u.codigo, d.unidad_texto, 'UND') as unidad, (d.producto_id is null) as fuera_de_catalogo,
       d.cantidad_solicitada, coalesce(d.cantidad_recibida, 0) as cantidad, d.precio_unitario, d.precio_orden,
       round(coalesce(d.cantidad_recibida, 0) * d.precio_unitario, 2) as total,
       (d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencia_precio,
       d.precio_anterior,
       round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) as variacion_pct,
       us.nombre as recibido_por
from public.compra_detalle d
join public.compra c on c.id = d.compra_id
join public.local l on l.id = c.local_id
join public.almacen a on a.id = c.almacen_id
left join public.producto p on p.id = d.producto_id
left join public.unidad_medida u on u.id = p.unidad_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.usuario us on us.id = c.recibido_por
where c.estado = 'recibida';

-- Recibir una compra con los datos de la boleta (precio real por producto). Todo en una transacción.
create or replace function public.fn_recibir_compra_boleta(
  p_compra uuid, p_fecha timestamptz, p_tipo_doc text, p_num_doc text, p_total_doc numeric, p_lineas jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype; l jsonb;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if v_c.estado <> 'aprobada' then raise exception 'La compra % no está pendiente de llegada', v_c.numero; end if;
  if not fn_tiene_local(v_c.local_id) or not (fn_puede('inventario', 'escribir') or fn_puede('compras', 'escribir')) then
    raise exception 'No autorizado para recibir esta compra';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    update compra_detalle d
       set cantidad_recibida = coalesce((l->>'cantidad')::numeric, d.cantidad_solicitada),
           precio_orden = case when l ? 'precio' and (l->>'precio')::numeric <> d.precio_unitario
                               then coalesce(d.precio_orden, d.precio_unitario) else d.precio_orden end,
           precio_unitario = coalesce((l->>'precio')::numeric, d.precio_unitario)
     where d.id = (l->>'id')::uuid and d.compra_id = p_compra;
  end loop;
  update compra set tipo_documento = coalesce(nullif(p_tipo_doc, ''), tipo_documento),
                    numero_documento = coalesce(nullif(trim(p_num_doc), ''), numero_documento),
                    total_documento = p_total_doc,
                    recibido_por = auth.uid()
   where id = p_compra;
  return fn_recibir_compra(p_compra, p_fecha);
end $$;

-- Ingreso directo del almacén (sin requerimiento ni orden de compra): se registra y entra al stock al momento
create or replace function public.fn_ingreso_directo(
  p_almacen uuid, p_proveedor uuid, p_fecha timestamptz, p_tipo_doc text, p_num_doc text, p_total_doc numeric,
  p_lineas jsonb, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_cod text; v_anio text := to_char(p_fecha, 'YYYY'); v_id uuid; l jsonb; n int := 0;
begin
  select a.local_id, lo.codigo into v_local, v_cod from almacen a join local lo on lo.id = a.local_id where a.id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_tiene_local(v_local) or not fn_puede('inventario', 'escribir') then
    raise exception 'No autorizado para registrar ingresos en este almacén';
  end if;
  insert into compra (numero, local_id, almacen_id, proveedor_id, fecha, fecha_aprobacion, tipo_documento, numero_documento,
                      total_documento, estado, sin_orden, recibido_por, observacion)
  values ('IN-' || v_cod || '-' || v_anio || '-' || lpad(fn_siguiente_numero('IN-' || v_cod || '-' || v_anio)::text, 4, '0'),
          v_local, p_almacen, p_proveedor, p_fecha::date, p_fecha, nullif(p_tipo_doc, ''), nullif(trim(p_num_doc), ''),
          p_total_doc, 'aprobada', true, auth.uid(), nullif(trim(p_observacion), ''))
  returning id into v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    if (l->>'producto_id') is null or coalesce((l->>'cantidad')::numeric, 0) <= 0 then continue; end if;
    insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, fecha_vencimiento)
    values (v_id, (l->>'producto_id')::uuid, (l->>'cantidad')::numeric, (l->>'cantidad')::numeric,
            coalesce((l->>'precio')::numeric, 0), nullif(l->>'fecha_vencimiento', '')::date);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  perform fn_recibir_compra(v_id, p_fecha);
  return v_id;
end $$;

-- El almacén puede registrar al momento un proveedor nuevo (p. ej. su distribuidor) al hacer un ingreso directo
drop policy if exists p_insertar_almacen on public.proveedor;
create policy p_insertar_almacen on public.proveedor for insert to authenticated
  with check ((select public.fn_puede('inventario', 'escribir')));

-- Verificación
select numero, estado, sin_orden, diferencias_precio from public.v_compra_resumen order by numero;
