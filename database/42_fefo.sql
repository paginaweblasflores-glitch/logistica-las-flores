-- =============================================================================
--  42_fefo.sql
--  FEFO: sale primero lo que VENCE primero (no solo lo que entró primero).
--    · las salidas descuentan el lote con la fecha de vencimiento más cercana;
--      los lotes sin fecha (uniformes, útiles…) salen después, por orden de llegada;
--    · «orden de salida» (reporte FIFO de Logística) y su cumplimiento siguen esta misma regla;
--    · en los traspasos, lo que se acepta es lo que vence antes; lo no aceptado vuelve a su lote.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Salidas: el lote que vence primero
create or replace function public.fn_movimiento_detalle_fifo() returns trigger
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
   order by fecha_vencimiento nulls last, fecha_ingreso limit 1;
  v_ok := new.lote_id is null or new.lote_id = v_oldest or v_oldest is null;

  -- 1) lote elegido manualmente (si lo hay), 2) resto en orden FIFO
  for r in
    select id, cantidad_disponible from lote
     where producto_id = new.producto_id and almacen_id = v_mov.almacen_id and cantidad_disponible > 0
     order by (id = new.lote_id) desc, fecha_vencimiento nulls last, fecha_ingreso
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

-- 2) Orden de salida de cada lote
create or replace view public.v_lote_fifo with (security_invoker = true) as
select lo.id, lo.producto_id, p.nombre as producto, lo.almacen_id, a.nombre as almacen, a.local_id,
       lo.fecha_ingreso, lo.fecha_vencimiento, lo.cantidad_inicial, lo.cantidad_disponible, lo.costo_unitario,
       (current_date - lo.fecha_ingreso::date) as dias_en_almacen,
       (lo.fecha_vencimiento - current_date) as dias_para_vencer,
       row_number() over (partition by lo.producto_id, lo.almacen_id order by lo.fecha_vencimiento nulls last, lo.fecha_ingreso) as orden_salida,
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

-- 3) Recepción de traspasos
create or replace function public.fn_traspaso_recibir(p_traslado uuid, p_lineas jsonb,
                                                     p_personal uuid default null, p_fecha timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare
  v_t traslado%rowtype; v_ok integer; x jsonb; v_det traslado_detalle%rowtype; v_cant numeric;
  v_entrada jsonb := '[]'; v_devolucion jsonb := '[]';
  p record; lt record; v_rec numeric; v_rech numeric; v_toma numeric; v_dev uuid; l jsonb; v_lote uuid;
begin
  select * into v_t from traslado where id = p_traslado for update;
  if v_t.id is null then raise exception 'No existe el traspaso'; end if;
  if v_t.estado is distinct from 'pendiente' then raise exception 'El traspaso % ya no está pendiente', v_t.numero; end if;
  if not fn_puede('traslados', 'escribir') or not fn_tiene_local(v_t.local_destino_id) then
    raise exception 'No autorizado: solo el almacén de destino puede recibir este traspaso';
  end if;

  -- 1) cada línea: de 0 (rechazada) hasta lo enviado; nunca más
  for x in select * from jsonb_array_elements(coalesce(p_lineas, '[]')) loop
    select * into v_det from traslado_detalle where id = (x->>'detalle_id')::uuid and traslado_id = p_traslado;
    if v_det.id is null then raise exception 'Hay un producto que no pertenece a este traspaso'; end if;
    v_cant := coalesce((x->>'cantidad')::numeric, 0);
    if v_cant < 0 then raise exception 'La cantidad recibida no puede ser negativa'; end if;
    if v_cant > v_det.cantidad then
      raise exception 'No puede recibir más de lo enviado de "%" (enviado %, recibe %)',
        (select nombre from producto where id = v_det.producto_id), v_det.cantidad, v_cant;
    end if;
    update traslado_detalle set cantidad_recibida = v_cant, cantidad_rechazada = cantidad - v_cant where id = v_det.id;
  end loop;
  -- líneas no enviadas en p_lineas = rechazadas por completo
  update traslado_detalle set cantidad_recibida = 0, cantidad_rechazada = cantidad
  where traslado_id = p_traslado and cantidad_recibida is null;

  select count(*) into v_ok from traslado_detalle where traslado_id = p_traslado and cantidad_recibida > 0;
  if v_ok = 0 then raise exception 'No aceptó ningún producto: use "Rechazar todo" e indique el motivo'; end if;

  -- 2) por producto: lo aceptado al destino y lo no aceptado de vuelta al origen.
  --    Con FIFO se reparte por los lotes que salieron (los más antiguos primero son los que se aceptan).
  for p in
    select d.producto_id, sum(d.cantidad_recibida) rec, sum(d.cantidad_rechazada) rech, max(d.precio) precio,
           max(d.fecha_vencimiento) fv, pr.controla_lote
    from traslado_detalle d join producto pr on pr.id = d.producto_id
    where d.traslado_id = p_traslado
    group by d.producto_id, pr.controla_lote
  loop
    v_rec := p.rec; v_rech := p.rech;
    if p.controla_lote then
      for lt in
        select lo.id, lo.fecha_ingreso, lo.fecha_vencimiento, sum(lc.cantidad) cant
        from movimiento m
        join movimiento_detalle md on md.movimiento_id = m.id and md.producto_id = p.producto_id
        join lote_consumo lc on lc.detalle_id = md.id
        join lote lo on lo.id = lc.lote_id
        where m.referencia_tipo = 'traslado' and m.referencia_id = p_traslado and m.tipo = 'traslado_salida' and not m.anulado
        group by lo.id, lo.fecha_ingreso, lo.fecha_vencimiento
        order by lo.fecha_vencimiento nulls last, lo.fecha_ingreso
      loop
        v_toma := least(v_rec, lt.cant);
        if v_toma > 0 then
          v_entrada := v_entrada || jsonb_build_object('producto_id', p.producto_id, 'cantidad', v_toma,
                         'costo_unitario', p.precio, 'fecha_vencimiento', lt.fecha_vencimiento);
          v_rec := v_rec - v_toma;
        end if;
        v_toma := least(v_rech, lt.cant - greatest(v_toma, 0));
        if v_toma > 0 then
          v_devolucion := v_devolucion || jsonb_build_object('producto_id', p.producto_id, 'cantidad', v_toma,
                            'costo_unitario', p.precio, 'fecha_vencimiento', lt.fecha_vencimiento,
                            'lote_origen', lt.id);
          v_rech := v_rech - v_toma;
        end if;
      end loop;
    end if;
    -- sin FIFO (o lo que no salió de un lote): una sola línea
    if v_rec > 0 then
      v_entrada := v_entrada || jsonb_build_object('producto_id', p.producto_id, 'cantidad', v_rec,
                     'costo_unitario', p.precio, 'fecha_vencimiento', p.fv);
    end if;
    if v_rech > 0 then
      v_devolucion := v_devolucion || jsonb_build_object('producto_id', p.producto_id, 'cantidad', v_rech,
                        'costo_unitario', p.precio, 'fecha_vencimiento', p.fv);
    end if;
  end loop;

  perform fn_registrar_movimiento('traslado_entrada', v_t.almacen_destino_id, v_entrada, p_fecha, null, v_t.numero,
            'Traspaso ' || v_t.numero || ' recibido', p_personal, 'traslado', p_traslado);

  if jsonb_array_length(v_devolucion) > 0 then
    v_dev := fn_registrar_movimiento('traslado_entrada', v_t.almacen_origen_id, v_devolucion, p_fecha, null, v_t.numero,
               'Devolución: no aceptado en la recepción del traspaso ' || v_t.numero, null, 'traslado', p_traslado);
    -- FIFO: lo devuelto vuelve a SU lote (solo sube su cantidad); no queda un lote aparte con la misma fecha
    for l in select * from jsonb_array_elements(v_devolucion) loop
      continue when l->>'lote_origen' is null;
      select id into v_lote from lote
       where movimiento_id = v_dev and producto_id = (l->>'producto_id')::uuid
         and cantidad_inicial = (l->>'cantidad')::numeric and cantidad_disponible = (l->>'cantidad')::numeric
       order by id limit 1;
      continue when v_lote is null;
      update lote set cantidad_disponible = cantidad_disponible + (l->>'cantidad')::numeric where id = (l->>'lote_origen')::uuid;
      delete from lote where id = v_lote;
    end loop;
  end if;

  update traslado set estado = 'recibido', recibido_at = p_fecha, recibido_por = auth.uid(),
                      recibe_personal_id = coalesce(p_personal, recibe_personal_id)
  where id = p_traslado;
end $$;

grant execute on function public.fn_traspaso_recibir(uuid, jsonb, uuid, timestamptz) to authenticated;

-- Verificación: orden de salida de cada producto (1 = sale primero)
select producto, almacen, fecha_vencimiento, fecha_ingreso::date, cantidad_disponible, orden_salida
from public.v_lote_fifo order by producto, almacen, orden_salida;
