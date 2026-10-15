-- =============================================================================
--  52_mensajes_sin_decimales.sql
--  Los avisos de stock muestran las cantidades sin ceros de más:
--  «Stock insuficiente de "…" (disponible 15, solicitado 20)» en vez de «15.0000 / 20.0000».
--  Si la cantidad tiene decimales de verdad (2.5 kilos), se muestran (hasta 3).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- una cantidad para mostrar en un mensaje: 15.0000 → 15 · 2.5000 → 2.5
create or replace function public.fn_num(p numeric) returns text
language sql immutable as $$ select trim_scale(round(p, 3))::text $$;

-- Salidas (y todo lo que descuenta stock)
create or replace function public.fn_movimiento_detalle_aplicar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mov      movimiento%rowtype;
  v_signo    smallint;
  v_prod     producto%rowtype;
  v_stock    stock%rowtype;
  v_rest     numeric;
  v_toma     numeric;
  v_oldest   uuid;
  r          record;
  v_local    uuid;
  v_dest     uuid;
  v_factor   numeric;
begin
  select * into v_mov from movimiento where id = new.movimiento_id;
  -- cada negocio tiene su propio producto (unido por el código maestro): si llega el del otro negocio
  -- (traspaso, compra), se usa el de este negocio y se convierte la cantidad y el costo a su unidad
  select local_id into v_local from almacen where id = v_mov.almacen_id;
  if not exists (select 1 from producto_local where producto_id = new.producto_id and local_id = v_local) then
    v_dest := fn_producto_en_local(new.producto_id, v_local);
    if v_dest <> new.producto_id then
      v_factor := fn_factor_productos(new.producto_id, v_dest);
      if v_factor is null then
        raise exception 'No se puede convertir "%" a la unidad de este almacén: indique en la ficha del producto cuánto trae cada unidad',
          (select nombre from producto where id = new.producto_id);
      end if;
      new.cantidad := round(new.cantidad * v_factor, 4);
      new.costo_unitario := case when new.costo_unitario is null then null else round(new.costo_unitario / v_factor, 4) end;
      new.producto_id := v_dest;
      new.lote_id := null;
    end if;
  end if;
  if v_mov.anulado then raise exception 'No se puede agregar líneas a un movimiento anulado'; end if;
  select signo into v_signo from tipo_movimiento where codigo = v_mov.tipo;
  select * into v_prod from producto where id = new.producto_id;

  insert into stock(producto_id, almacen_id, cantidad, costo_promedio)
  values (new.producto_id, v_mov.almacen_id, 0, coalesce(new.costo_unitario, v_prod.costo_referencia, 0))
  on conflict do nothing;
  select * into v_stock from stock
   where producto_id = new.producto_id and almacen_id = v_mov.almacen_id for update;

  if v_signo > 0 then
    new.costo_unitario := coalesce(new.costo_unitario, v_stock.costo_promedio, v_prod.costo_referencia, 0);
    update stock set
      costo_promedio = case
        when greatest(v_stock.cantidad, 0) + new.cantidad > 0
        then round((greatest(v_stock.cantidad, 0) * v_stock.costo_promedio + new.cantidad * new.costo_unitario)
                   / (greatest(v_stock.cantidad, 0) + new.cantidad), 4)
        else costo_promedio end,
      cantidad = cantidad + new.cantidad,
      ultimo_movimiento = v_mov.fecha
    where producto_id = new.producto_id and almacen_id = v_mov.almacen_id;

    if v_prod.controla_lote then
      insert into lote(producto_id, almacen_id, movimiento_id, fecha_ingreso, fecha_vencimiento,
                       cantidad_inicial, cantidad_disponible, costo_unitario)
      values (new.producto_id, v_mov.almacen_id, v_mov.id, v_mov.fecha, new.fecha_vencimiento,
              new.cantidad, new.cantidad, new.costo_unitario);
    end if;
  else
    -- Salida: valoriza al costo promedio vigente (si no se indicó)
    new.costo_unitario := coalesce(new.costo_unitario, v_stock.costo_promedio);
    if v_stock.cantidad - new.cantidad < 0 and not (select permite_negativo from almacen where id = v_mov.almacen_id) then
      raise exception 'Stock insuficiente de "%" (disponible %, solicitado %)', v_prod.nombre, fn_num(v_stock.cantidad), fn_num(new.cantidad);
    end if;
    update stock set cantidad = cantidad - new.cantidad, ultimo_movimiento = v_mov.fecha
    where producto_id = new.producto_id and almacen_id = v_mov.almacen_id;
  end if;
  return new;
end $$;

-- Envío de un traspaso
create or replace function public.fn_traspaso_enviar(p_origen uuid, p_destino uuid, p_lineas jsonb,
                                                    p_motivo text default null, p_personal uuid default null,
                                                    p_fecha timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num text; v_loc uuid; r record; v_lineas jsonb; ln jsonb; v_f numeric; v_lin jsonb := '[]';
        v_loc_dest uuid; v_dest uuid; v_factor numeric;
begin
  select local_id into v_loc from almacen where id = p_origen;
  if v_loc is null or not exists (select 1 from almacen where id = p_destino) then raise exception 'Almacén no válido'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos'; end if;
  if not fn_puede('traslados', 'escribir') or not fn_tiene_local(v_loc) then
    raise exception 'No autorizado: solo el almacén de origen puede enviar este traspaso';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'El traspaso no tiene productos'; end if;

  -- cada línea puede venir en otra unidad del producto (p. ej. kilos de un producto que se maneja en sacos):
  -- se pasa a la unidad del producto
  for ln in select * from jsonb_array_elements(p_lineas) loop
    -- la unidad elegida: la convierte el sistema o, si no sabe, con lo que escribió el almacén («1 caja = 6 BOT»)
    v_f := case when nullif(ln->>'unidad_id', '') is null then 1
                else coalesce(fn_factor_unidad((ln->>'producto_id')::uuid, (ln->>'unidad_id')::uuid), nullif(ln->>'equivale', '')::numeric) end;
    if v_f is null or v_f <= 0 then
      raise exception 'No se puede enviar "%" en esa unidad: indique en la ficha del producto cuánto trae cada unidad',
        (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    v_lin := v_lin || (ln || jsonb_build_object('cantidad_envio', (ln->>'cantidad')::numeric,
                                                'cantidad', round((ln->>'cantidad')::numeric * v_f, 3)));
  end loop;
  p_lineas := v_lin;

  -- stock acumulado: dos líneas del mismo producto se validan juntas
  for r in
    select (x->>'producto_id')::uuid producto_id, sum((x->>'cantidad')::numeric) cant
    from jsonb_array_elements(p_lineas) x group by 1
  loop
    if r.cant is null or r.cant <= 0 then raise exception 'Las cantidades deben ser mayores a cero'; end if;
    if coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0) < r.cant then
      raise exception 'Stock insuficiente de "%" (disponible %, a enviar %)',
        (select nombre from producto where id = r.producto_id),
        fn_num(coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0)), fn_num(r.cant);
    end if;
  end loop;

  insert into traslado (fecha, almacen_origen_id, almacen_destino_id, motivo, entrega_personal_id, estado)
  values (p_fecha, p_origen, p_destino, p_motivo, p_personal, 'pendiente')
  returning id, numero into v_id, v_num;

  -- el producto del negocio de destino (el mismo si es el mismo negocio; si no lo tiene, se crea en su lista)
  select local_id into v_loc_dest from almacen where id = p_destino;
  for ln in select * from jsonb_array_elements(p_lineas) loop
    v_dest := fn_producto_en_local((ln->>'producto_id')::uuid, v_loc_dest);
    v_factor := fn_factor_productos((ln->>'producto_id')::uuid, v_dest);
    if v_factor is null then
      raise exception 'No se puede pasar "%" a la unidad del almacén de destino: indique en la ficha del producto cuánto trae cada unidad',
        (select nombre from producto where id = (ln->>'producto_id')::uuid);
    end if;
    insert into traslado_detalle (traslado_id, producto_id, cantidad, precio, fecha_vencimiento, observacion,
                                  producto_destino_id, factor, unidad_envio_id, cantidad_envio)
    values (v_id, (ln->>'producto_id')::uuid, (ln->>'cantidad')::numeric,
            coalesce((select costo_promedio from stock s where s.producto_id = (ln->>'producto_id')::uuid and s.almacen_id = p_origen), 0),
            nullif(ln->>'fecha_vencimiento','')::date, ln->>'observacion',
            v_dest, v_factor, coalesce(nullif(ln->>'unidad_id', '')::uuid, (select unidad_id from producto where id = (ln->>'producto_id')::uuid)),
            (ln->>'cantidad_envio')::numeric);
  end loop;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad, 'observacion', observacion))
    into v_lineas from traslado_detalle where traslado_id = v_id;
  perform fn_registrar_movimiento('traslado_salida', p_origen, v_lineas, p_fecha, null, v_num,
            coalesce(p_motivo, 'Traspaso'), p_personal, 'traslado', v_id);

  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

-- Recepción de un traspaso
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
        (select nombre from producto where id = v_det.producto_id), fn_num(v_det.cantidad), fn_num(v_cant);
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

-- Anulación
create or replace function public.fn_movimiento_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_signo smallint; d record; c record; v_cant numeric; v_nombre text;
begin
  if not (new.anulado and not old.anulado) then return null; end if;
  select signo into v_signo from tipo_movimiento where codigo = new.tipo;
  for d in select * from movimiento_detalle where movimiento_id = new.id loop
    update stock set cantidad = cantidad - v_signo * d.cantidad
     where producto_id = d.producto_id and almacen_id = new.almacen_id
    returning cantidad into v_cant;
    if v_cant < 0 and not (select permite_negativo from almacen where id = new.almacen_id) then
      select nombre into v_nombre from producto where id = d.producto_id;
      raise exception 'No se puede anular: de "%" ya salió parte de lo que entró (quedan %, la entrada fue de %). Registre una salida o un ajuste en su lugar',
        v_nombre, fn_num(v_cant + d.cantidad), fn_num(d.cantidad);
    end if;
    if v_signo > 0 then
      update lote set cantidad_disponible = greatest(cantidad_disponible - d.cantidad, 0)
       where movimiento_id = new.id and producto_id = d.producto_id;
    else
      for c in select * from lote_consumo where detalle_id = d.id loop
        update lote set cantidad_disponible = cantidad_disponible + c.cantidad where id = c.lote_id;
      end loop;
    end if;
  end loop;
  return null;
end $$;
