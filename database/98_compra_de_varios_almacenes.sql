-- =============================================================================
-- 98 · Compra con boleta con productos de VARIOS almacenes del negocio (una factura = una compra = una OC)
--
-- Una misma factura trae productos para almacenes distintos (harina al 01, lavavajillas al 03).
-- · compra_detalle.almacen_id: el almacén al que entra ESE producto (vacío = el almacén de la compra, como siempre).
-- · fn_recibir_compra: registra UNA entrada por almacén (cada almacén la ve en su historial y su Kardex, con el
--   mismo número de factura). Las compras de un solo almacén quedan exactamente igual.
-- · fn_ingreso_directo: acepta el almacén de cada línea.
-- · v_ingreso_almacen: cada producto con SU almacén (Ingresos, Informe al Directorio, carpeta…).
-- =============================================================================

alter table public.compra_detalle add column if not exists almacen_id uuid references public.almacen(id);

-- 1) la llegada: una entrada por almacén ------------------------------------------------------------------
create or replace function public.fn_recibir_compra(p_compra uuid, p_fecha_entrega timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype; v_mov uuid; v_m uuid; v_lineas jsonb; v_alm uuid;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if not fn_tiene_local(v_c.local_id) or not (fn_puede('inventario', 'escribir') or fn_puede('compras', 'escribir')) then
    raise exception 'No autorizado para recibir esta compra';
  end if;
  if v_c.estado = 'recibida' then raise exception 'La compra % ya fue recibida', v_c.numero; end if;
  if v_c.estado = 'anulada' then raise exception 'La compra % está anulada', v_c.numero; end if;
  -- cada producto entra a un almacén del mismo negocio de la compra
  if exists (select 1 from compra_detalle d join almacen a on a.id = d.almacen_id
              where d.compra_id = p_compra and a.local_id <> v_c.local_id) then
    raise exception 'Los productos deben entrar a almacenes del mismo negocio';
  end if;

  update compra_detalle set cantidad_recibida = coalesce(cantidad_recibida, cantidad_solicitada)
   where compra_id = p_compra;

  -- una entrada por almacén (el de la compra primero: es la que se devuelve)
  for v_alm in
    select x.alm from (select distinct coalesce(d.almacen_id, v_c.almacen_id) as alm from compra_detalle d
                        where d.compra_id = p_compra and d.producto_id is not null and d.cantidad_recibida > 0) x
    order by (x.alm = v_c.almacen_id) desc, x.alm
  loop
    select jsonb_agg(jsonb_build_object(
             'producto_id', producto_id, 'cantidad', cantidad_recibida,
             'costo_unitario', precio_unitario, 'fecha_vencimiento', fecha_vencimiento))
      into v_lineas
    from compra_detalle
    where compra_id = p_compra and producto_id is not null and cantidad_recibida > 0 and coalesce(almacen_id, v_c.almacen_id) = v_alm;
    v_m := fn_registrar_movimiento('entrada_compra', v_alm, v_lineas, p_fecha_entrega, null,
             concat_ws(' ', v_c.tipo_documento, v_c.numero_documento), 'Recepción ' || v_c.numero,
             null, 'compra', p_compra);
    v_mov := coalesce(v_mov, v_m);
  end loop;

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

-- 2) la compra con boleta: el almacén de cada línea (si no viene, el de la compra) ---------------------------
create or replace function public.fn_ingreso_directo(
  p_almacen uuid, p_proveedor uuid, p_fecha timestamptz, p_tipo_doc text, p_num_doc text, p_total_doc numeric,
  p_lineas jsonb, p_observacion text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_cod text; v_anio text := to_char(p_fecha, 'YYYY'); v_id uuid; l jsonb; n int := 0; v_alm uuid;
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
    -- otro almacén del mismo negocio (el producto debe estar en ese almacén)
    v_alm := nullif(l->>'almacen_id', '')::uuid;
    if v_alm = p_almacen then v_alm := null; end if;
    if v_alm is not null and not exists (select 1 from producto_almacen pa join almacen a on a.id = pa.almacen_id
                                          where pa.almacen_id = v_alm and pa.producto_id = (l->>'producto_id')::uuid and a.local_id = v_local) then
      raise exception 'Un producto no pertenece al almacén elegido';
    end if;
    insert into compra_detalle (compra_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, fecha_vencimiento, observacion, almacen_id)
    values (v_id, (l->>'producto_id')::uuid, (l->>'cantidad')::numeric, (l->>'cantidad')::numeric,
            coalesce((l->>'precio')::numeric, 0), nullif(l->>'fecha_vencimiento', '')::date,
            nullif(l->>'observacion', ''), v_alm);   -- cómo se escribió («4 Caja (1 = 6 BOT)»)
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Agregue al menos un producto con cantidad'; end if;
  perform fn_recibir_compra(v_id, p_fecha);
  return v_id;
end $$;

-- 3) los ingresos: cada producto con SU almacén ------------------------------------------------------------
create or replace view public.v_ingreso_almacen with (security_invoker = true) as
select d.id, c.id as compra_id, c.numero, c.sin_orden, c.local_id, l.codigo as local_codigo,
       coalesce(d.almacen_id, c.almacen_id) as almacen_id, a.nombre as almacen, coalesce(c.fecha_entrega, c.fecha::timestamptz) as fecha_ingreso,
       c.proveedor_id, pr.razon_social as proveedor, c.tipo_documento, c.numero_documento, c.total_documento,
       d.producto_id, coalesce(p.nombre, d.descripcion) as producto, p.codigo as producto_codigo, p.marca, p.presentacion,
       coalesce(u.codigo, d.unidad_texto, 'UND') as unidad, (d.producto_id is null) as fuera_de_catalogo,
       d.cantidad_solicitada, coalesce(d.cantidad_recibida, 0) as cantidad, d.precio_unitario, d.precio_orden,
       round(coalesce(d.cantidad_recibida, 0) * d.precio_unitario, 2) as total,
       (d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencia_precio,
       d.precio_anterior,
       round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) as variacion_pct,
       us.nombre as recibido_por,
       pa.codigo as codigo_almacen
from public.compra_detalle d
join public.compra c on c.id = d.compra_id
join public.local l on l.id = c.local_id
join public.almacen a on a.id = coalesce(d.almacen_id, c.almacen_id)
left join public.producto p on p.id = d.producto_id
left join public.unidad_medida u on u.id = p.unidad_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.usuario us on us.id = c.recibido_por
left join public.producto_almacen pa on pa.producto_id = d.producto_id and pa.almacen_id = coalesce(d.almacen_id, c.almacen_id)
where c.estado = 'recibida';

notify pgrst, 'reload schema';
