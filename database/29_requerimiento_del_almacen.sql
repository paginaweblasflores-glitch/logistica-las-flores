-- =============================================================================
--  29_requerimiento_del_almacen.sql
--  Flujo acordado con Fernanda (2026-10-12):
--    1) El ALMACÉN pide (su lista de productos del catálogo, para reponer stock). Requerimiento propio,
--       separado del de los jefes de área: numeración RA-LF-2026-0001, sin área, sin firmas, sin precio.
--    2) Fernanda aprueba, cotiza si quiere y lo marca «Comprado» (elige proveedor): NO pone precios.
--    3) El almacén registra la llegada UNA sola vez, en Entradas → Compra con boleta: elige la compra,
--       se carga lo pedido y completa lo de la boleta (lo que llegó, precio, comprobante, vencimiento).
--       Si llegó menos, el requerimiento se cierra como parcial (8 de 10). Puede agregar productos
--       que vinieron en la boleta sin estar en el requerimiento (quedan marcados).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Origen del requerimiento ------------------------------------------------------------------------
alter table public.requerimiento add column if not exists origen text not null default 'area';
alter table public.requerimiento add column if not exists almacen_id uuid references public.almacen(id);
do $$ begin
  alter table public.requerimiento add constraint ck_requerimiento_origen
    check (origen in ('area', 'almacen') and (origen = 'area' or almacen_id is not null));
exception when duplicate_object then null; end $$;
create index if not exists ix_req_origen on public.requerimiento(origen, estado);

-- producto que llegó en la boleta sin estar en el requerimiento
alter table public.compra_detalle add column if not exists agregado boolean not null default false;

-- 2) Numeración propia del requerimiento del almacén: RA-LF-2026-0001 -------------------------------
create or replace function public.fn_numerar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_anio text := to_char(coalesce((to_jsonb(new)->>'fecha')::timestamptz, now()), 'YYYY');
        v_loc text;
begin
  if new.numero is not null then return new; end if;
  case tg_table_name
    when 'requerimiento' then
      if coalesce(to_jsonb(new)->>'origen', 'area') = 'almacen' then
        select codigo into v_loc from local where id = new.local_id;
        new.numero := 'RA-' || v_loc || '-' || v_anio || '-' || lpad(fn_siguiente_numero('RA-' || v_loc || '-' || v_anio)::text, 4, '0');
      else
        select sufijo_doc into v_loc from local where id = new.local_id;
        new.numero := lpad(fn_siguiente_numero('REQ-' || v_anio || '-' || v_loc)::text, 3, '0') || '-' || v_anio || '-LOG-' || v_loc;
      end if;
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

-- 3) El almacén crea su requerimiento (solo productos de SU almacén) --------------------------------
-- p_lineas: [{producto_id, cantidad, observacion?}]
create or replace function public.fn_crear_requerimiento_almacen(
  p_almacen uuid, p_lineas jsonb, p_fecha_requerida date default null, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_id uuid; v_nombre text;
begin
  select local_id into v_local from almacen where id = p_almacen and activo;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén hace su requerimiento';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l
             where coalesce(nullif(l->>'cantidad', '')::numeric, 0) <= 0
                or not exists (select 1 from producto_almacen pa where pa.producto_id = (l->>'producto_id')::uuid and pa.almacen_id = p_almacen)) then
    raise exception 'Cada producto debe ser de su almacén y tener cantidad mayor a cero';
  end if;
  select nombre into v_nombre from usuario where id = auth.uid();
  insert into requerimiento (local_id, origen, almacen_id, solicitante, fecha_requerida, observacion)
  values (v_local, 'almacen', p_almacen, coalesce(v_nombre, 'Almacén'), p_fecha_requerida, nullif(btrim(coalesce(p_observacion, '')), ''))
  returning id into v_id;
  insert into requerimiento_detalle (requerimiento_id, producto_id, descripcion, stock_actual, cantidad_solicitada, motivo)
  select v_id, p.id, p.nombre, coalesce((select s.cantidad from stock s where s.producto_id = p.id and s.almacen_id = p_almacen), 0),
         (l->>'cantidad')::numeric, nullif(btrim(coalesce(l->>'observacion', '')), '')
  from jsonb_array_elements(p_lineas) l join producto p on p.id = (l->>'producto_id')::uuid;
  return v_id;
end $$;
grant execute on function public.fn_crear_requerimiento_almacen(uuid, jsonb, date, text) to authenticated;

-- 4) Fernanda lo marca «Comprado»: una compra por proveedor, SIN precios (los pone el almacén con la boleta)
-- Directo (sin cotización): todo lo aprobado a un proveedor.
create or replace function public.fn_comprar_requerimiento_almacen(
  p_requerimiento uuid, p_proveedor uuid, p_fecha_compromiso timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r requerimiento%rowtype; v_c uuid;
begin
  select * into v_r from requerimiento where id = p_requerimiento for update;
  if v_r.id is null or v_r.origen <> 'almacen' then raise exception 'No es un requerimiento del almacén'; end if;
  if not fn_puede('compras', 'escribir') or not fn_tiene_local(v_r.local_id) then raise exception 'No autorizado'; end if;
  if v_r.estado <> 'aprobado' then raise exception 'El requerimiento % debe estar aprobado (y sin compra)', v_r.numero; end if;
  if p_proveedor is null then raise exception 'Elija el proveedor'; end if;
  insert into compra (local_id, almacen_id, proveedor_id, requerimiento_id, estado, fecha_aprobacion, fecha_compromiso)
  values (v_r.local_id, v_r.almacen_id, p_proveedor, v_r.id, 'aprobada', now(), p_fecha_compromiso)
  returning id into v_c;
  insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario)
  select v_c, d.producto_id, coalesce(d.cantidad_aprobada, d.cantidad_solicitada), 0
  from requerimiento_detalle d
  where d.requerimiento_id = v_r.id and d.producto_id is not null and coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0;
  update requerimiento set estado = 'comprado' where id = v_r.id;
  return v_c;
end $$;
grant execute on function public.fn_comprar_requerimiento_almacen(uuid, uuid, timestamptz) to authenticated;

-- Con cotización adjudicada: una compra por cada proveedor ganador, con sus productos (sin precios)
create or replace function public.fn_comprar_desde_cotizacion(p_cotizacion uuid, p_fecha_compromiso timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_q cotizacion%rowtype; v_r requerimiento%rowtype; o record; v_c uuid; n int := 0;
begin
  select * into v_q from cotizacion where id = p_cotizacion;
  if v_q.id is null or v_q.estado <> 'adjudicada' then raise exception 'La cotización debe estar adjudicada'; end if;
  select * into v_r from requerimiento where id = v_q.requerimiento_id for update;
  if v_r.id is null or v_r.origen <> 'almacen' then raise exception 'No es un requerimiento del almacén'; end if;
  if not fn_puede('compras', 'escribir') or not fn_tiene_local(v_r.local_id) then raise exception 'No autorizado'; end if;
  for o in
    select distinct i.oferta_ganadora_id as oferta, x.proveedor_id
    from cotizacion_item i join cotizacion_oferta x on x.id = i.oferta_ganadora_id
    where i.cotizacion_id = p_cotizacion and i.oferta_ganadora_id is not null
      and not exists (select 1 from compra c where c.oferta_id = i.oferta_ganadora_id and c.estado <> 'anulada')
  loop
    insert into compra (local_id, almacen_id, proveedor_id, requerimiento_id, cotizacion_id, oferta_id, estado, fecha_aprobacion, fecha_compromiso)
    values (v_r.local_id, v_r.almacen_id, o.proveedor_id, v_r.id, p_cotizacion, o.oferta, 'aprobada', now(), p_fecha_compromiso)
    returning id into v_c;
    insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, precio_unitario)
    select v_c, i.producto_id, i.cantidad, 0
    from cotizacion_item i where i.cotizacion_id = p_cotizacion and i.oferta_ganadora_id = o.oferta and i.producto_id is not null;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Ya se registraron las compras de esta cotización'; end if;
  update requerimiento set estado = 'comprado' where id = v_r.id and estado in ('aprobado', 'en_cotizacion');
  return n;
end $$;
grant execute on function public.fn_comprar_desde_cotizacion(uuid, timestamptz) to authenticated;

-- 5) La llegada: el almacén registra la entrada con los datos de la boleta (UN solo paso) ------------
-- p_lineas: [{detalle_id? , producto_id, cantidad, precio, fecha_vencimiento?}]  (sin detalle_id = agregado)
create or replace function public.fn_entrada_de_compra(
  p_compra uuid, p_fecha timestamptz, p_tipo_doc text, p_num_doc text, p_total_doc numeric, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype; l jsonb; v_mov uuid; v_nro text; v_prod uuid;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if v_c.estado <> 'aprobada' then raise exception 'La compra % no está en camino (ya llegó o fue anulada)', v_c.numero; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_c.local_id) then raise exception 'La llegada la registra el almacén'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]')) loop
    if coalesce(nullif(l->>'cantidad', '')::numeric, 0) < 0 or coalesce(nullif(l->>'precio', '')::numeric, 0) < 0 then
      raise exception 'Las cantidades y precios no pueden ser negativos';
    end if;
    if coalesce(nullif(l->>'cantidad', '')::numeric, 0) > 0 and coalesce(nullif(l->>'precio', '')::numeric, 0) = 0 then
      raise exception 'Falta el precio de algún producto que llegó (cópielo de la boleta)';
    end if;
    if nullif(l->>'detalle_id', '') is not null then
      update compra_detalle set cantidad_recibida = coalesce(nullif(l->>'cantidad', '')::numeric, 0),
                                precio_unitario = coalesce(nullif(l->>'precio', '')::numeric, 0),
                                fecha_vencimiento = nullif(l->>'fecha_vencimiento', '')::date
       where id = (l->>'detalle_id')::uuid and compra_id = p_compra;
    elsif coalesce(nullif(l->>'cantidad', '')::numeric, 0) > 0 then
      v_prod := (l->>'producto_id')::uuid;
      if not exists (select 1 from producto_almacen where producto_id = v_prod and almacen_id = v_c.almacen_id) then
        raise exception 'Un producto agregado no es de este almacén';
      end if;
      insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, fecha_vencimiento, agregado)
      values (p_compra, v_prod, (l->>'cantidad')::numeric, (l->>'cantidad')::numeric, (l->>'precio')::numeric,
              nullif(l->>'fecha_vencimiento', '')::date, true);
    end if;
  end loop;
  -- lo que no se tocó no llegó
  update compra_detalle set cantidad_recibida = 0 where compra_id = p_compra and cantidad_recibida is null;
  -- productos con control de vencimiento: llegan con su fecha (crea el lote para FIFO)
  if exists (select 1 from compra_detalle d join producto p on p.id = d.producto_id
              where d.compra_id = p_compra and p.controla_lote and d.fecha_vencimiento is null and d.cantidad_recibida > 0) then
    raise exception 'Indique la fecha de vencimiento de "%"', (select p.nombre from compra_detalle d join producto p on p.id = d.producto_id
              where d.compra_id = p_compra and p.controla_lote and d.fecha_vencimiento is null and d.cantidad_recibida > 0 limit 1);
  end if;
  update compra set tipo_documento = coalesce(nullif(p_tipo_doc, ''), tipo_documento),
                    numero_documento = coalesce(nullif(btrim(coalesce(p_num_doc, '')), ''), numero_documento),
                    total_documento = p_total_doc, recibido_por = auth.uid()
   where id = p_compra;
  v_mov := fn_recibir_compra(p_compra, coalesce(p_fecha, now()));
  select nro into v_nro from movimiento where id = v_mov;
  return jsonb_build_object('movimiento_id', v_mov, 'nro', v_nro);
end $$;
grant execute on function public.fn_entrada_de_compra(uuid, timestamptz, text, text, numeric, jsonb) to authenticated;

-- 5b) Recepción: el historial de precios solo con lo que llegó y su precio real ----------------------
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

  -- historial de precios: solo lo que llegó con su precio, con la fecha en que llegó (para las tendencias)
  insert into precio_historial(producto_id, proveedor_id, local_id, fecha, precio, tipo, compra_detalle_id)
  select d.producto_id, v_c.proveedor_id, v_c.local_id, (p_fecha_entrega at time zone 'America/Lima')::date, d.precio_unitario, 'compra', d.id
  from compra_detalle d where d.compra_id = p_compra and d.producto_id is not null and d.cantidad_recibida > 0 and d.precio_unitario > 0;

  update producto p set costo_referencia = d.precio_unitario, updated_at = now()
  from compra_detalle d where d.compra_id = p_compra and d.producto_id = p.id and d.cantidad_recibida > 0 and d.precio_unitario > 0;

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

-- 6) Resumen del requerimiento con su origen y si llegó completo ------------------------------------
drop view if exists public.v_requerimiento_resumen;
create view public.v_requerimiento_resumen with (security_invoker = true) as
select r.*, l.nombre as local_nombre, l.codigo as local_codigo, ar.nombre as area_nombre, alm.nombre as almacen_nombre,
       (select count(*) from public.requerimiento_detalle d where d.requerimiento_id = r.id) as items,
       (select round(sum(coalesce(d.cantidad_aprobada, d.cantidad_solicitada) * coalesce(d.precio_estimado, 0)), 2)
          from public.requerimiento_detalle d where d.requerimiento_id = r.id) as monto_estimado,
       round(extract(epoch from (r.aprobado_at - r.created_at)) / 3600.0, 1) as horas_aprobacion,
       (r.aprobado_at - r.created_at) <= make_interval(hours => public.fn_param('horas_objetivo_requerimiento', 24)::int) as dentro_objetivo,
       -- atendido parcial: algún producto aprobado llegó en menor cantidad
       (r.estado = 'atendido' and exists (
          select 1 from public.requerimiento_detalle d
          where d.requerimiento_id = r.id and d.producto_id is not null and coalesce(d.cantidad_aprobada, d.cantidad_solicitada) > 0
            and coalesce((select sum(cd.cantidad_recibida) from public.compra_detalle cd join public.compra c on c.id = cd.compra_id
                          where c.requerimiento_id = r.id and c.estado = 'recibida' and cd.producto_id = d.producto_id), 0)
                < coalesce(d.cantidad_aprobada, d.cantidad_solicitada))) as parcial
from public.requerimiento r
join public.local l on l.id = r.local_id
left join public.area ar on ar.id = r.area_id
left join public.almacen alm on alm.id = r.almacen_id;

-- Verificación
select origen, count(*) from public.requerimiento group by origen;
