-- =============================================================================
--  39_fifo_para_todos.sql
--  Todos los productos con FIFO, sin casilla (acordado 2026-10-14):
--    · cada llegada (entrada, compra, inventario inicial) puede llevar su fecha de vencimiento: es OPCIONAL
--      (uniformes, útiles… la dejan vacía) y queda como un lote; las salidas descuentan siempre lo más antiguo;
--    · el stock que ya había (sin lote) pasa a un lote inicial por almacén, con la fecha de la ficha si la tiene;
--    · la «Fecha de vencimiento» de la ficha del producto se aplica a su stock que aún no tiene fecha;
--    · se deja de usar «Perecible» (no hacía nada) y la casilla «Controlar vencimiento (FIFO)».
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Todos con FIFO (y los que se creen en adelante)
alter table public.producto alter column controla_lote set default true;
update public.producto set controla_lote = true where not controla_lote;

-- 2) El stock que no tiene lote pasa a un lote inicial (sale primero: lleva la fecha de su primer movimiento)
insert into public.lote (producto_id, almacen_id, movimiento_id, fecha_ingreso, fecha_vencimiento, cantidad_inicial, cantidad_disponible, costo_unitario)
select s.producto_id, s.almacen_id, null,
       coalesce((select min(m.fecha) from public.movimiento m join public.movimiento_detalle d on d.movimiento_id = m.id
                  where d.producto_id = s.producto_id and m.almacen_id = s.almacen_id and not m.anulado), s.ultimo_movimiento, now()),
       pa.fecha_vencimiento, s.cantidad - coalesce(l.disp, 0), s.cantidad - coalesce(l.disp, 0), coalesce(s.costo_promedio, 0)
from public.stock s
left join (select producto_id, almacen_id, sum(cantidad_disponible) disp from public.lote group by 1, 2) l
       on l.producto_id = s.producto_id and l.almacen_id = s.almacen_id
left join public.producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
where s.cantidad - coalesce(l.disp, 0) > 0;

-- 3) Fecha de la ficha → al stock de ese almacén que aún no tiene fecha
create or replace function public.fn_ficha_vencimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.fecha_vencimiento is not null and new.fecha_vencimiento is distinct from old.fecha_vencimiento then
    update lote set fecha_vencimiento = new.fecha_vencimiento
     where producto_id = new.producto_id and almacen_id = new.almacen_id and cantidad_disponible > 0 and fecha_vencimiento is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_ficha_vencimiento on public.producto_almacen;
create trigger trg_ficha_vencimiento after update of fecha_vencimiento on public.producto_almacen
  for each row execute function public.fn_ficha_vencimiento();

-- 4) Las entradas ya no exigen la fecha (antes era obligatoria para los productos con FIFO)
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
  -- la fecha de vencimiento es opcional (los productos que no vencen la dejan vacía); cada entrada crea su lote (FIFO)
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
  -- la fecha de vencimiento es opcional (los productos que no vencen la dejan vacía)
  update compra set tipo_documento = coalesce(nullif(p_tipo_doc, ''), tipo_documento),
                    numero_documento = coalesce(nullif(trim(p_num_doc), ''), numero_documento),
                    total_documento = p_total_doc,
                    recibido_por = auth.uid()
   where id = p_compra;
  return fn_recibir_compra(p_compra, p_fecha);
end $$;

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
  -- la fecha de vencimiento es opcional (los productos que no vencen la dejan vacía)
  update compra set tipo_documento = coalesce(nullif(p_tipo_doc, ''), tipo_documento),
                    numero_documento = coalesce(nullif(btrim(coalesce(p_num_doc, '')), ''), numero_documento),
                    total_documento = p_total_doc, recibido_por = auth.uid()
   where id = p_compra;
  v_mov := fn_recibir_compra(p_compra, coalesce(p_fecha, now()));
  select nro into v_nro from movimiento where id = v_mov;
  return jsonb_build_object('movimiento_id', v_mov, 'nro', v_nro);
end $$;
grant execute on function public.fn_entrada_de_compra(uuid, timestamptz, text, text, numeric, jsonb) to authenticated;

-- Verificación: productos sin FIFO (debe ser 0) y stock sin lote (debe ser 0)
select (select count(*) from public.producto where not controla_lote) sin_fifo,
       (select count(*) from public.stock s where s.cantidad > coalesce((select sum(cantidad_disponible) from public.lote l
          where l.producto_id = s.producto_id and l.almacen_id = s.almacen_id), 0)) stock_sin_lote;
