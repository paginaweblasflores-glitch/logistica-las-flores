-- =============================================================================
--  34_traspaso_recepcion.sql
--  Recepción de traspasos (revisado con los fallos que tuvieron otros sistemas de almacén):
--    1) No se puede recibir MÁS de lo enviado: antes se recortaba en silencio; ahora se rechaza con un aviso.
--       Tampoco cantidades negativas ni líneas que no son del traspaso.
--    2) Lo no aceptado (rechazado o la diferencia de una línea recibida a medias) vuelve al almacén de
--       origen. Productos con FIFO: vuelve a SUS lotes, con su fecha de vencimiento y su lugar en la fila
--       (antes volvía como un lote nuevo, sin vencimiento y como si fuera lo más reciente).
--    3) Lo aceptado entra al destino con el vencimiento de los lotes que salieron del origen
--       (antes tomaba la fecha que se escribía a mano al enviar).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

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
                            'fecha_ingreso', lt.fecha_ingreso);
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
    -- FIFO: lo devuelto recupera la fecha de ingreso de su lote original (vuelve a su lugar en la fila)
    for l in select * from jsonb_array_elements(v_devolucion) loop
      continue when l->>'fecha_ingreso' is null;
      select id into v_lote from lote
       where movimiento_id = v_dev and producto_id = (l->>'producto_id')::uuid and fecha_ingreso = p_fecha
         and cantidad_inicial = (l->>'cantidad')::numeric
         and fecha_vencimiento is not distinct from nullif(l->>'fecha_vencimiento', '')::date
       limit 1;
      update lote set fecha_ingreso = (l->>'fecha_ingreso')::timestamptz where id = v_lote;
    end loop;
  end if;

  update traslado set estado = 'recibido', recibido_at = p_fecha, recibido_por = auth.uid(),
                      recibe_personal_id = coalesce(p_personal, recibe_personal_id)
  where id = p_traslado;
end $$;

grant execute on function public.fn_traspaso_recibir(uuid, jsonb, uuid, timestamptz) to authenticated;
