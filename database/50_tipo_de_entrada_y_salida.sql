-- =============================================================================
--  50_tipo_de_entrada_y_salida.sql
--  Entradas y salidas: el tipo se elige de una lista (Compra con boleta, Sobrante / Salida a un área, Merma…)
--  o se escribe uno nuevo («Donación», «Evento»…), que queda guardado para la próxima vez y aparece con su
--  nombre en el historial y el Kardex. Por dentro, una entrada nueva suma como un sobrante y una salida nueva
--  resta como un faltante.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

drop function if exists public.fn_registrar_entrada_salida(text, uuid, jsonb, timestamptz, text, text, text, text);
create or replace function public.fn_registrar_entrada_salida(
  p_tipo text, p_almacen uuid, p_lineas jsonb, p_fecha timestamptz default now(),
  p_area text default null, p_recibe text default null, p_observacion text default null, p_documento text default null,
  p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_signo smallint; v_area uuid; v_id uuid; v_nro text; l jsonb; v_motivo uuid;
        v_mot_txt text := nullif(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), '');
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
  -- tipo escrito por el almacén («Donación», «Evento»…): queda como motivo y aparece en la lista la próxima vez
  if v_mot_txt is not null then
    select id into v_motivo from motivo
     where codigo like case when v_signo > 0 then 'TIPO-E-%' else 'TIPO-S-%' end and fn_normalizar(nombre) = fn_normalizar(v_mot_txt)
     limit 1;
    if v_motivo is null then
      insert into motivo (codigo, nombre, aplica_a)
      values ((case when v_signo > 0 then 'TIPO-E-' else 'TIPO-S-' end) || fn_siguiente_numero('TIPO_MOV'),
              upper(left(v_mot_txt, 1)) || substr(v_mot_txt, 2), case when v_signo > 0 then 'entrada' else 'salida' end)
      returning id into v_motivo;
    end if;
  end if;
  v_id := fn_registrar_movimiento(p_tipo, p_almacen, p_lineas, coalesce(p_fecha, now()), v_motivo,
                                  nullif(btrim(coalesce(p_documento, '')), ''), nullif(btrim(coalesce(p_observacion, '')), ''));
  update movimiento set area_id = v_area, recibe = v_recibe where id = v_id returning nro into v_nro;
  return jsonb_build_object('id', v_id, 'nro', v_nro);
end $$;
grant execute on function public.fn_registrar_entrada_salida(text, uuid, jsonb, timestamptz, text, text, text, text, text) to authenticated;
