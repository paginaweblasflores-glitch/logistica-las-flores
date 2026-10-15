-- =============================================================================
--  25_entradas_salidas_y_vencimientos.sql
--  · Entradas y Salidas por separado: cada movimiento recibe su número propio por almacén
--      entradas  E-00001, E-00002…  (compras, devoluciones de un área, sobrantes, traspasos recibidos…)
--      salidas   S-00001, S-00002…  (consumo de un área, merma, devolución a proveedor, faltantes…)
--  · La salida guarda el ÁREA destino y QUIÉN RETIRA (va en el ticket que se firma).
--  · Fecha de vencimiento: los productos con «Controlar vencimiento (FIFO)» la llevan en cada entrada
--    y en su cantidad inicial (crea el lote; las salidas descuentan primero el más antiguo).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Número propio, área y quién retira ------------------------------------------------------------
alter table public.movimiento add column if not exists nro     text;
alter table public.movimiento add column if not exists area_id uuid references public.area(id);
alter table public.movimiento add column if not exists recibe  text;
create index if not exists ix_mov_area on public.movimiento(area_id, fecha) where area_id is not null;

-- El número se pone al registrar: serie ENT-<almacén> o SAL-<almacén>
create or replace function public.fn_movimiento_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_signo smallint; v_alm text;
begin
  select local_id, codigo into new.local_id, v_alm from almacen where id = new.almacen_id;
  if tg_op = 'INSERT' then
    perform fn_validar_periodo(new.local_id, new.fecha::date);
    if new.nro is null then
      select signo into v_signo from tipo_movimiento where codigo = new.tipo;
      new.nro := case when v_signo > 0 then 'E-' else 'S-' end
                 || lpad(fn_siguiente_numero(case when v_signo > 0 then 'ENT-' else 'SAL-' end || v_alm)::text, 5, '0');
    end if;
  elsif tg_op = 'UPDATE' then
    if new.anulado is distinct from old.anulado then
      perform fn_validar_periodo(old.local_id, old.fecha::date);
      if old.anulado and not new.anulado then
        raise exception 'Un movimiento anulado no puede reactivarse';
      end if;
      new.anulado_at := case when new.anulado then now() end;
    elsif (new.fecha, new.almacen_id, new.tipo) is distinct from (old.fecha, old.almacen_id, old.tipo) then
      raise exception 'Los movimientos no se editan: anule y registre uno nuevo';
    end if;
  end if;
  return new;
end $$;

-- Los que ya existen: numerados en orden de fecha, por almacén y por entrada/salida
do $$
declare r record;
begin
  update public.movimiento m set nro = x.pref || lpad(x.n::text, 5, '0')
  from (select m2.id, case when t.signo > 0 then 'E-' else 'S-' end as pref,
               row_number() over (partition by m2.almacen_id, t.signo > 0 order by m2.fecha, m2.numero) as n
        from public.movimiento m2 join public.tipo_movimiento t on t.codigo = m2.tipo) x
  where m.id = x.id and m.nro is null;
  for r in
    select a.codigo, t.signo > 0 as entrada, count(*) as n
    from public.movimiento m join public.almacen a on a.id = m.almacen_id join public.tipo_movimiento t on t.codigo = m.tipo
    group by 1, 2
  loop
    insert into public.correlativo (serie, ultimo)
    values (case when r.entrada then 'ENT-' else 'SAL-' end || r.codigo, r.n)
    on conflict (serie) do update set ultimo = greatest(public.correlativo.ultimo, excluded.ultimo);
  end loop;
end $$;
create unique index if not exists ux_movimiento_nro on public.movimiento (almacen_id, nro);

-- 2) Registrar una entrada o salida del almacén (con área y quién retira) ---------------------------
-- p_lineas: [{producto_id, cantidad, costo_unitario?, fecha_vencimiento?, observacion?}]
create or replace function public.fn_registrar_entrada_salida(
  p_tipo text, p_almacen uuid, p_lineas jsonb, p_fecha timestamptz default now(),
  p_area text default null, p_recibe text default null, p_observacion text default null, p_documento text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_signo smallint; v_area uuid; v_id uuid; v_nro text; l jsonb;
        v_area_txt text := nullif(btrim(regexp_replace(coalesce(p_area, ''), '\s+', ' ', 'g')), '');
        v_recibe text := nullif(upper(btrim(coalesce(p_recibe, ''))), '');
begin
  select local_id into v_local from almacen where id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén registra sus entradas y salidas';
  end if;
  select signo into v_signo from tipo_movimiento where codigo = p_tipo
    and codigo in ('entrada_devolucion', 'ajuste_positivo', 'salida_consumo', 'merma', 'devolucion_proveedor', 'ajuste_negativo');
  if v_signo is null then raise exception 'Tipo de movimiento no válido'; end if;
  if p_tipo in ('salida_consumo', 'entrada_devolucion') and v_area_txt is null then
    raise exception 'Indique el área';
  end if;
  if p_tipo = 'salida_consumo' and v_recibe is null then
    raise exception 'Indique quién retira los productos';
  end if;
  -- productos con control de vencimiento: la entrada lleva su fecha (crea el lote para FIFO)
  if v_signo > 0 then
    for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]')) loop
      if nullif(l->>'fecha_vencimiento', '') is null
         and (select controla_lote from producto where id = (l->>'producto_id')::uuid) then
        raise exception 'Indique la fecha de vencimiento de "%"', (select nombre from producto where id = (l->>'producto_id')::uuid);
      end if;
    end loop;
  end if;
  -- área: se elige de la lista o se escribe una nueva (queda para la próxima vez)
  if v_area_txt is not null then
    select id into v_area from area
     where (local_id = v_local or local_id is null) and lower(nombre) = lower(v_area_txt)
     order by local_id nulls last limit 1;
    if v_area is null then
      insert into area (local_id, nombre) values (v_local, initcap(v_area_txt)) returning id into v_area;
    end if;
  end if;
  v_id := fn_registrar_movimiento(p_tipo, p_almacen, p_lineas, coalesce(p_fecha, now()), null,
                                  nullif(btrim(coalesce(p_documento, '')), ''), nullif(btrim(coalesce(p_observacion, '')), ''));
  update movimiento set area_id = v_area, recibe = v_recibe where id = v_id returning nro into v_nro;
  return jsonb_build_object('id', v_id, 'nro', v_nro);
end $$;
grant execute on function public.fn_registrar_entrada_salida(text, uuid, jsonb, timestamptz, text, text, text, text) to authenticated;

-- 3) Cantidad inicial con su fecha de vencimiento (productos con control de vencimiento) ------------
create or replace function public.fn_inventario_inicial(p_almacen uuid, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_local uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
        v_lineas jsonb := '[]'; n_reg int := 0; n_omit int := 0;
begin
  select local_id into v_local from almacen where id = p_almacen;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then
    raise exception 'Solo el responsable del almacén registra su inventario inicial';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_prod := (l->>'producto_id')::uuid;
    v_cant := coalesce(nullif(l->>'cantidad', '')::numeric, 0);
    v_precio := nullif(l->>'precio', '')::numeric;
    if v_cant < 0 or coalesce(v_precio, 0) < 0 then raise exception 'La cantidad y el precio no pueden ser negativos'; end if;
    if not exists (select 1 from producto_almacen where producto_id = v_prod and almacen_id = p_almacen) then
      raise exception 'Un producto no pertenece a este almacén';
    end if;
    -- ya tiene inventario en este almacén (cualquier movimiento): se bloquea, no se vuelve a poner
    if exists (select 1 from stock where producto_id = v_prod and almacen_id = p_almacen) then
      n_omit := n_omit + 1; continue;
    end if;
    if coalesce(v_precio, 0) > 0 then
      update producto set costo_referencia = v_precio, updated_at = now() where id = v_prod;
    end if;
    if v_cant > 0 then
      v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_precio,
                                                 'fecha_vencimiento', nullif(l->>'fecha_vencimiento', ''));
      n_reg := n_reg + 1;
    end if;
  end loop;
  if jsonb_array_length(v_lineas) > 0 then
    perform fn_registrar_movimiento('stock_inicial', p_almacen, v_lineas, now(), null, 'INV-INICIAL', 'Inventario inicial');
  end if;
  return jsonb_build_object('registrados', n_reg, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_inventario_inicial(uuid, jsonb) to authenticated;


-- 3b) Recepción de compras (órdenes de Logística) con la fecha de vencimiento ----------------------
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
           precio_unitario = coalesce((l->>'precio')::numeric, d.precio_unitario),
           fecha_vencimiento = coalesce(nullif(l->>'fecha_vencimiento', '')::date, d.fecha_vencimiento)
     where d.id = (l->>'id')::uuid and d.compra_id = p_compra;
  end loop;
  -- los productos con control de vencimiento llegan con su fecha (crea el lote para FIFO)
  if exists (select 1 from compra_detalle d join producto p on p.id = d.producto_id
              where d.compra_id = p_compra and p.controla_lote and d.fecha_vencimiento is null
                and coalesce(d.cantidad_recibida, 0) > 0) then
    raise exception 'Indique la fecha de vencimiento de "%"', (select p.nombre from compra_detalle d join producto p on p.id = d.producto_id
              where d.compra_id = p_compra and p.controla_lote and d.fecha_vencimiento is null and coalesce(d.cantidad_recibida, 0) > 0 limit 1);
  end if;
  update compra set tipo_documento = coalesce(nullif(p_tipo_doc, ''), tipo_documento),
                    numero_documento = coalesce(nullif(trim(p_num_doc), ''), numero_documento),
                    total_documento = p_total_doc,
                    recibido_por = auth.uid()
   where id = p_compra;
  return fn_recibir_compra(p_compra, p_fecha);
end $$;

-- 4) El número E-/S- en el Kardex -----------------------------------------------------------------
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
       m.nro
from public.movimiento m
join public.movimiento_detalle d on d.movimiento_id = m.id
join public.tipo_movimiento t on t.codigo = m.tipo
join public.almacen a on a.id = m.almacen_id
join public.producto p on p.id = d.producto_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.motivo mo on mo.id = m.motivo_id
where not m.anulado;

-- Verificación
select a.nombre as almacen, left(m.nro, 1) as serie, count(*) as movimientos, max(m.nro) as ultimo
from public.movimiento m join public.almacen a on a.id = m.almacen_id
group by 1, 2 order by 1, 2;
