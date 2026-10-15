-- =============================================================================
--  41_un_lote_por_fecha.sql
--  Un producto con la misma fecha de vencimiento no debe aparecer partido en dos:
--    1) Traspasos: lo que no se acepta vuelve a SU lote del origen (solo sube la cantidad);
--       antes quedaba como un lote aparte con la misma fecha.
--    2) Se juntan los que ya quedaron así (las devoluciones del traspaso de prueba TR-2026-0001).
--    3) «Vencimientos» (y la campanita) muestran una fila por producto, almacén y fecha, con la cantidad sumada
--       (aunque sean dos compras distintas con la misma fecha).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Recepción de traspasos
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
        order by lo.fecha_ingreso, lo.fecha_vencimiento nulls last
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

-- 2) Juntar las devoluciones que quedaron como lote aparte con su lote original
--    (mismo producto, almacén, fecha de ingreso y vencimiento; solo si el lote aparte no tuvo salidas)
with aparte as (
  select l.id, l.producto_id, l.almacen_id, l.fecha_ingreso, l.fecha_vencimiento, l.cantidad_disponible
  from public.lote l join public.movimiento m on m.id = l.movimiento_id
  where m.tipo = 'traslado_entrada' and m.referencia_tipo = 'traslado' and m.observacion like 'Devolución:%'
    and not exists (select 1 from public.lote_consumo c where c.lote_id = l.id)
), par as (
  select a.id aparte_id, a.cantidad_disponible,
         (select o.id from public.lote o
           where o.producto_id = a.producto_id and o.almacen_id = a.almacen_id and o.id <> a.id
             and o.fecha_ingreso = a.fecha_ingreso and o.fecha_vencimiento is not distinct from a.fecha_vencimiento
             and o.id not in (select id from aparte)
           order by o.id limit 1) original_id
  from aparte a
), sube as (
  update public.lote o set cantidad_disponible = o.cantidad_disponible + s.cant
  from (select original_id, sum(cantidad_disponible) cant from par where original_id is not null group by 1) s
  where o.id = s.original_id
  returning o.id
)
delete from public.lote where id in (select aparte_id from par where original_id is not null);

-- 3) Vencimientos: una fila por producto, almacén y fecha
create or replace view public.v_vencimiento with (security_invoker = true) as
select 'L' || l.producto_id::text || l.almacen_id::text || l.fecha_vencimiento::text as id,
       l.producto_id, l.producto, l.codigo_almacen, l.almacen_id, l.almacen, l.local_id,
       l.fecha_vencimiento, l.dias_para_vencer, l.dias_aviso, sum(l.cantidad_disponible)::numeric(16,4) as cantidad, u.codigo as unidad, true as fifo,
       l.estado
from public.v_lote_fifo l
join public.producto p on p.id = l.producto_id
join public.unidad_medida u on u.id = p.unidad_id
where l.fecha_vencimiento is not null
group by l.producto_id, l.producto, l.codigo_almacen, l.almacen_id, l.almacen, l.local_id, l.fecha_vencimiento,
         l.dias_para_vencer, l.dias_aviso, u.codigo, l.estado
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

-- Verificación: no debe haber dos filas del mismo producto, almacén y fecha
select producto, almacen, fecha_vencimiento, cantidad from public.v_vencimiento order by producto, fecha_vencimiento;
