-- =============================================================================
--  67_integridad_auditoria.sql
--  Correcciones de la auditoría de Codex (QA-01, QA-02, QA-04, QA-05, QA-16, QA-22 y auditoría de Producción),
--  con las 4 reglas aprobadas por el usuario el 2026-11-11:
--    1) Una ENTRADA cuya mercadería ya se usó (salió parte de su lote) no se anula: se corrige con un ajuste.
--    2) Un CONTEO cerrado o anulado no cambia (ni su detalle, ni su estado). No se reabre: se hace un conteo nuevo.
--    3) Un producto de PRODUCCIÓN con movimientos no cambia de tipo, unidad ni porción; y no se da de baja con saldo.
--    4) Los movimientos de PRODUCCIÓN no se editan ni se borran: se corrigen anulándolos con motivo
--       (las salidas que genera la venta del día sí se rehacen al corregir la venta).
--  Además: operaciones de varios pasos en UNA transacción (QA-02) y una sola compra vigente por origen (QA-16).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-02 · Operaciones de varios pasos: todo o nada
-- Ejecuta en orden una lista de pasos (insertar / actualizar / llamar) dentro de la MISMA transacción:
-- si un paso falla, no queda nada a medias. Solo tablas y funciones de la lista permitida, y con los
-- permisos del usuario (security invoker: valen las mismas políticas RLS que antes).
-- Un valor "@id:nombre" se reemplaza por el id (o resultado) del paso con «como: nombre».
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_resolver_refs(p jsonb, p_ids jsonb) returns jsonb
language plpgsql immutable as $$
declare r jsonb; k text; v jsonb;
begin
  if jsonb_typeof(p) = 'string' and left(p #>> '{}', 4) = '@id:' and p_ids ? substr(p #>> '{}', 5) then
    return p_ids -> substr(p #>> '{}', 5);
  elsif jsonb_typeof(p) = 'object' then
    r := '{}';
    for k, v in select * from jsonb_each(p) loop r := r || jsonb_build_object(k, public.fn_resolver_refs(v, p_ids)); end loop;
    return r;
  elsif jsonb_typeof(p) = 'array' then
    return coalesce((select jsonb_agg(public.fn_resolver_refs(e, p_ids) order by n) from jsonb_array_elements(p) with ordinality as a(e, n)), '[]');
  end if;
  return p;
end $$;

create or replace function public.fn_en_una_operacion(p_pasos jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  c_tablas constant text[] := array['compra','compra_detalle','requerimiento','requerimiento_detalle','cotizacion','cotizacion_item',
    'cotizacion_oferta','cotizacion_precio','conteo','descuento','descuento_detalle'];
  c_funciones constant text[] := array['fn_recibir_compra','fn_iniciar_conteo','fn_compra_poner_proveedor','fn_entrada_de_compra'];
  v_ids jsonb := '{}'; paso jsonb; v_tabla text; v_vals jsonb; v_cols text; v_malas text; v_fila jsonb; v_donde text; n int;
  k text; v jsonb; v_fn text; v_args text; v_proc oid; v_res text;
begin
  for paso in select e from jsonb_array_elements(p_pasos) with ordinality as a(e, i) order by i loop
    paso := public.fn_resolver_refs(paso, v_ids);

    if paso ? 'insertar' then
      v_tabla := paso->>'insertar';
      if not v_tabla = any(c_tablas) then raise exception 'Tabla no permitida: %', v_tabla; end if;
      v_vals := case when jsonb_typeof(paso->'valores') = 'array' then paso->'valores' else jsonb_build_array(paso->'valores') end;
      if jsonb_array_length(v_vals) = 0 then continue; end if;
      -- columnas: las que trae el paso (las demás toman su valor por defecto); deben existir en la tabla
      select string_agg(distinct quote_ident(c), ', '), string_agg(distinct c, ', ') filter (where not exists (
               select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = v_tabla and ic.column_name = c))
        into v_cols, v_malas
        from jsonb_array_elements(v_vals) e, jsonb_object_keys(e) c;
      if v_malas is not null then raise exception 'Columna no válida en %: %', v_tabla, v_malas; end if;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) returning to_jsonb(%I.*)',
                     v_tabla, v_cols, v_cols, v_tabla, v_tabla) into v_fila using v_vals;
      if paso ? 'como' then v_ids := v_ids || jsonb_build_object(paso->>'como', v_fila->'id'); end if;

    elsif paso ? 'actualizar' then
      v_tabla := paso->>'actualizar';
      if not v_tabla = any(c_tablas) then raise exception 'Tabla no permitida: %', v_tabla; end if;
      select string_agg(quote_ident(c), ', '), string_agg(c, ', ') filter (where not exists (
               select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = v_tabla and ic.column_name = c))
        into v_cols, v_malas from jsonb_object_keys(paso->'valores') c;
      if v_malas is not null or v_cols is null then raise exception 'Columnas no válidas en %: %', v_tabla, coalesce(v_malas, '(ninguna)'); end if;
      -- condiciones: columna = valor, o columna en [valores]; sin condiciones no se actualiza nada
      v_donde := '';
      for k, v in select * from jsonb_each(paso->'donde') loop
        if not exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = v_tabla and ic.column_name = k) then
          raise exception 'Columna no válida en %: %', v_tabla, k;
        end if;
        v_donde := v_donde || ' and ' || case
          when jsonb_typeof(v) = 'array' then format('x.%I::text = any(array(select jsonb_array_elements_text($2->%L)))', k, k)
          when jsonb_typeof(v) = 'null' then format('x.%I is null', k)
          else format('x.%I::text = ($2->>%L)', k, k) end;
      end loop;
      if v_donde = '' then raise exception 'Actualización sin condiciones en %', v_tabla; end if;
      execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where true %s',
                     v_tabla, v_cols, v_cols, v_tabla, v_donde) using paso->'valores', paso->'donde';
      get diagnostics n = row_count;
      -- «exigir»: si no cambió ninguna fila (otra pestaña ya lo cambió, no existe…), se cancela TODO con ese mensaje
      if n = 0 and paso ? 'exigir' then raise exception '%', paso->>'exigir'; end if;

    elsif paso ? 'llamar' then
      v_fn := paso->>'llamar';
      if not v_fn = any(c_funciones) then raise exception 'Función no permitida: %', v_fn; end if;
      -- la versión de la función cuyos parámetros cubren los que se envían (y cada valor con su tipo)
      select p.oid into v_proc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = v_fn
         and not exists (select 1 from jsonb_object_keys(coalesce(paso->'args', '{}')) a where not a = any(coalesce(p.proargnames, '{}')))
       order by p.pronargs limit 1;
      if v_proc is null then raise exception 'Parámetros no válidos para %', v_fn; end if;
      select string_agg(format('%I => ($1->>%L)::%s', a.nombre, a.nombre, format_type(a.tipo, null)), ', ')
        into v_args
        from (select unnest(p.proargnames) nombre, unnest(p.proargtypes::oid[]) tipo from pg_proc p where p.oid = v_proc) a
       where coalesce(paso->'args', '{}') ? a.nombre;
      execute format('select (public.%I(%s))::text', v_fn, coalesce(v_args, '')) into v_res using paso->'args';
      if paso ? 'como' then v_ids := v_ids || jsonb_build_object(paso->>'como', v_res); end if;

    else
      raise exception 'Paso no reconocido: %', paso;
    end if;
  end loop;
  return v_ids;
end $$;
grant execute on function public.fn_en_una_operacion(jsonb) to authenticated;
revoke execute on function public.fn_en_una_operacion(jsonb) from anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-01 · Regla 1: una entrada cuya mercadería ya se usó no se anula (se corrige con un ajuste)
-- Antes: restaba la entrada del stock y «truncaba» el lote en cero; el stock y la suma de lotes podían descuadrarse.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_movimiento_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_signo smallint; d record; c record; v_cant numeric; v_nombre text; v_usado numeric;
begin
  if not (new.anulado and not old.anulado) then return null; end if;
  select signo into v_signo from tipo_movimiento where codigo = new.tipo;
  for d in select * from movimiento_detalle where movimiento_id = new.id loop
    if v_signo > 0 then
      -- ¿ya salió algo de lo que entró con esta entrada? (su lote tiene menos de lo que se recibió)
      select coalesce(sum(cantidad_inicial - cantidad_disponible), 0) into v_usado
        from lote where movimiento_id = new.id and producto_id = d.producto_id and cantidad_disponible < cantidad_inicial;
      if v_usado > 0 then
        select nombre into v_nombre from producto where id = d.producto_id;
        raise exception 'No se puede anular: de "%" ya se usaron % de esta entrada. Corríjalo con un ajuste (entrada o salida) en lugar de anular.',
          v_nombre, fn_num(v_usado);
      end if;
    end if;
    update stock set cantidad = cantidad - v_signo * d.cantidad
     where producto_id = d.producto_id and almacen_id = new.almacen_id
    returning cantidad into v_cant;
    if v_cant < 0 and not (select permite_negativo from almacen where id = new.almacen_id) then
      select nombre into v_nombre from producto where id = d.producto_id;
      raise exception 'No se puede anular: de "%" ya salió parte de lo que entró (quedan %, la entrada fue de %). Registre una salida o un ajuste en su lugar',
        v_nombre, fn_num(v_cant + d.cantidad), fn_num(d.cantidad);
    end if;
    if v_signo > 0 then
      -- sin consumo: el lote de esta entrada vuelve a cero exacto (stock = suma de lotes)
      update lote set cantidad_disponible = cantidad_disponible - d.cantidad
       where movimiento_id = new.id and producto_id = d.producto_id;
    else
      for c in select * from lote_consumo where detalle_id = d.id loop
        update lote set cantidad_disponible = cantidad_disponible + c.cantidad where id = c.lote_id;
      end loop;
    end if;
  end loop;
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-05 · Regla 2: un conteo cerrado o anulado no cambia
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- pasos permitidos del conteo: abierto ⇄ verificación → cerrado; abierto/verificación → anulado
create or replace function public.fn_conteo_transicion() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.estado in ('cerrado', 'anulado') then
    raise exception 'El conteo % está %: ya no se puede modificar. Si hubo un error, haga un conteo nuevo.', coalesce(old.numero, ''), old.estado;
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'abierto' and new.estado in ('verificacion', 'cerrado', 'anulado'))
    or (old.estado = 'verificacion' and new.estado in ('abierto', 'cerrado', 'anulado'))) then
    raise exception 'Paso no permitido en el conteo: de % a %', old.estado, new.estado;
  end if;
  return new;
end $$;
drop trigger if exists trg_conteo_transicion on public.conteo;
create trigger trg_conteo_transicion before update on public.conteo for each row execute function public.fn_conteo_transicion();

-- su detalle (cantidades, descontar…) solo cambia mientras el conteo está abierto o en verificación
create or replace function public.fn_conteo_detalle_bloqueo() returns trigger
language plpgsql set search_path = public as $$
declare v_estado text;
begin
  select estado into v_estado from conteo where id = coalesce(new.conteo_id, old.conteo_id);
  if v_estado in ('cerrado', 'anulado') then
    raise exception 'El conteo está %: su detalle ya no se puede modificar.', v_estado;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_conteo_detalle_bloqueo on public.conteo_detalle;
create trigger trg_conteo_detalle_bloqueo before insert or update or delete on public.conteo_detalle
  for each row execute function public.fn_conteo_detalle_bloqueo();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-16 · Una sola compra vigente por origen, también con dos pestañas a la vez
--   · por oferta ganadora de una cotización (cotización repartida = una compra por oferta)
--   · por requerimiento comprado sin cotización
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from compra where oferta_id is not null and estado <> 'anulada' group by oferta_id having count(*) > 1) then
    raise exception 'Hay compras vigentes repetidas para la misma oferta: anule la sobrante antes de ejecutar este script';
  end if;
  if exists (select 1 from compra where requerimiento_id is not null and oferta_id is null and estado <> 'anulada' group by requerimiento_id having count(*) > 1) then
    raise exception 'Hay compras vigentes repetidas para el mismo requerimiento: anule la sobrante antes de ejecutar este script';
  end if;
end $$;
create unique index if not exists ux_compra_oferta_vigente on public.compra (oferta_id)
  where oferta_id is not null and estado <> 'anulada';
create unique index if not exists ux_compra_requerimiento_vigente on public.compra (requerimiento_id)
  where requerimiento_id is not null and oferta_id is null and estado <> 'anulada';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-04 · Producción: cantidades y precios nunca negativos (también si se llama a la base directamente)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.prod_movimiento drop constraint if exists prod_mov_no_negativos;
alter table public.prod_movimiento add constraint prod_mov_no_negativos check (
  coalesce(sacos, 0) >= 0 and coalesce(kilos, 0) >= 0 and coalesce(cantidad, 0) >= 0 and coalesce(precio, 0) >= 0
  and coalesce(total, 0) >= 0 and coalesce(hueso, 0) >= 0 and coalesce(grasa, 0) >= 0 and coalesce(merma, 0) >= 0);
alter table public.prod_venta_detalle drop constraint if exists prod_venta_no_negativos;
alter table public.prod_venta_detalle add constraint prod_venta_no_negativos check (hoja1 >= 0 and hoja2 >= 0);
alter table public.prod_conteo drop constraint if exists prod_conteo_no_negativo;
alter table public.prod_conteo add constraint prod_conteo_no_negativo check (contado >= 0);
alter table public.prod_producto drop constraint if exists prod_producto_gramos;
alter table public.prod_producto add constraint prod_producto_gramos check (gramos_porcion is null or gramos_porcion >= 0);

-- la venta del día rechaza platos negativos con un mensaje claro (antes de tocar el kardex)
create or replace function public.fn_prod_guardar_venta(p_fecha date, p_lineas jsonb, p_observacion text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare v_venta uuid; n int;
begin
  if not public.fn_puede('produccion', 'escribir') then raise exception 'Solo Producción registra la venta del día'; end if;
  if jsonb_typeof(coalesce(p_lineas, '[]')) <> 'array' then raise exception 'Los platos vendidos llegaron mal'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_lineas, '[]')) x
             where coalesce((x->>'hoja1')::numeric, 0) < 0 or coalesce((x->>'hoja2')::numeric, 0) < 0) then
    raise exception 'Los platos vendidos no pueden ser negativos';
  end if;
  insert into prod_venta (fecha, observacion) values (p_fecha, nullif(trim(p_observacion), ''))
  on conflict (local_id, fecha) do update set observacion = excluded.observacion, updated_at = now()
  returning id into v_venta;
  delete from prod_venta_detalle where venta_id = v_venta;
  insert into prod_venta_detalle (venta_id, plato_id, hoja1, hoja2)
  select v_venta, (x->>'plato_id')::uuid, coalesce((x->>'hoja1')::numeric, 0), coalesce((x->>'hoja2')::numeric, 0)
  from jsonb_array_elements(p_lineas) x
  where coalesce((x->>'hoja1')::numeric, 0) <> 0 or coalesce((x->>'hoja2')::numeric, 0) <> 0;
  -- las salidas de esta venta se rehacen (si se corrige la hojita, el Kardex queda igual a lo nuevo)
  delete from prod_movimiento where venta_id = v_venta;
  insert into prod_movimiento (fecha, tipo, producto_id, concepto, cantidad, venta_id, observacion)
  select (p_fecha + time '23:00') at time zone 'America/Lima', 'salida', pc.producto_id, pc.concepto,
         round(sum((d.hoja1 + d.hoja2) * pc.factor), 2), v_venta, 'Venta del día'
  from prod_venta_detalle d join prod_plato_carne pc on pc.plato_id = d.plato_id
  where d.venta_id = v_venta
  group by pc.producto_id, pc.concepto
  having round(sum((d.hoja1 + d.hoja2) * pc.factor), 2) <> 0;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.fn_prod_guardar_venta(date, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- QA-22 · Regla 3: un producto de Producción con movimientos conserva tipo, unidad y porción;
--         y no se da de baja mientras tenga saldo
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_prod_producto_historial() returns trigger
language plpgsql set search_path = public as $$
declare v_saldo numeric;
begin
  if (new.tipo, new.unidad, coalesce(new.porcion, '')) is distinct from (old.tipo, old.unidad, coalesce(old.porcion, ''))
     and exists (select 1 from prod_movimiento where producto_id = old.id) then
    raise exception 'El producto % ya tiene movimientos: no se puede cambiar su tipo, unidad ni en qué se cuenta. Cree un producto nuevo.', old.nombre;
  end if;
  if old.activo and not new.activo then
    select coalesce(sum(case when tipo = 'ingreso' then cantidad else -cantidad end), 0) into v_saldo
      from prod_movimiento where producto_id = old.id and not anulado;
    if old.tipo = 'kardex' and v_saldo <> 0 then
      raise exception 'No se puede dar de baja %: todavía tiene saldo (%).', old.nombre, fn_num(v_saldo);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_prod_producto_historial on public.prod_producto;
create trigger trg_prod_producto_historial before update on public.prod_producto
  for each row execute function public.fn_prod_producto_historial();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Regla 4 · Movimientos de Producción inalterables: solo se anulan con motivo
--   · UPDATE: únicamente marcar «anulado» (de no a sí) y anotar el motivo en la observación
--   · DELETE: solo las salidas que genera la venta del día (la venta las rehace al corregirse)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_prod_movimiento_inalterable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.venta_id is null then
      raise exception 'Los movimientos de Producción no se borran: anúlelos con un motivo.';
    end if;
    return old;
  end if;
  if old.anulado then raise exception 'Este movimiento ya está anulado.'; end if;
  if (to_jsonb(new) - 'anulado' - 'observacion') is distinct from (to_jsonb(old) - 'anulado' - 'observacion') then
    raise exception 'Los movimientos de Producción no se editan: anúlelo con un motivo y regístrelo de nuevo.';
  end if;
  return new;
end $$;
drop trigger if exists trg_prod_movimiento_inalterable on public.prod_movimiento;
create trigger trg_prod_movimiento_inalterable before update or delete on public.prod_movimiento
  for each row execute function public.fn_prod_movimiento_inalterable();

-- Verificación
select
  (select count(*) from pg_trigger where tgname in ('trg_conteo_transicion', 'trg_conteo_detalle_bloqueo',
     'trg_prod_producto_historial', 'trg_prod_movimiento_inalterable')) as triggers_nuevos,          -- 4
  (select count(*) from pg_indexes where indexname in ('ux_compra_oferta_vigente', 'ux_compra_requerimiento_vigente')) as indices_unicos, -- 2
  (select count(*) from pg_proc where proname in ('fn_en_una_operacion', 'fn_resolver_refs')) as funciones;                            -- 2
