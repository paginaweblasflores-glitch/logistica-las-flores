-- =============================================================================
--  10_paneles_almacen.sql · Paneles de ALMACÉN (Las Flores y Umaru) sobre la misma base
--
--  Basado en la arquitectura del sistema "las-flores-almacen" (doc-notas/almacen-traspasos-arquitectura.md):
--   · Catálogo MAESTRO único + CÓDIGO LOCAL por almacén (cada negocio numera sus productos desde 1).
--   · Cada almacén aislado: solo ve y escribe lo suyo. Logística (Fernanda) ve ambos (solo lectura
--     en lo operativo del almacén; eso se controla en la aplicación).
--   · TRASPASOS: envío → pendiente → recepción parcial o total (lo rechazado vuelve al origen)
--     o cancelación/rechazo total con motivo. N° global por año (TR-2026-0001). El stock del
--     origen baja al ENVIAR. Todo ocurre en funciones de la base (una sola transacción: si algo
--     falla no queda nada a medias, sin pasos de "compensación" en el cliente).
--   · El inventario de cada almacén = solo lo que tuvo movimientos ahí (ya funcionaba así).
--   · Usuarios: "Almacén Las Flores" y "Almacén Umaru" (rol almacén, un solo negocio cada uno).
--
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) PERMISOS DEL ROL ALMACÉN ---------------------------------------------------------------
update public.rol set descripcion = 'Panel de almacén: recepción, salidas, traspasos, controles y su catálogo local'
where codigo = 'almacen';

insert into public.rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('almacen', '*',              true, false, false),
  ('almacen', 'inventario',     true, true,  false),
  ('almacen', 'traslados',      true, true,  false),
  ('almacen', 'carnes',         true, true,  false),
  ('almacen', 'controles',      true, true,  false),   -- roturas de utensilios
  ('almacen', 'requerimientos', true, true,  false),
  ('almacen', 'tareas',         true, true,  false),
  ('almacen', 'maestros',       true, true,  false),   -- alta de productos en su catálogo local
  ('almacen', 'conteos',        true, false, false)    -- los conteos los hace Logística; el almacén ve el resultado
on conflict (rol, modulo) do update set leer = excluded.leer, escribir = excluded.escribir, aprobar = excluded.aprobar;

-- 2) CÓDIGO LOCAL POR ALMACÉN ----------------------------------------------------------------
alter table public.producto_local add column if not exists codigo integer;

-- Numeración inicial: cada negocio desde 1, en orden alfabético de su catálogo
do $$
begin
  if exists (select 1 from public.producto_local where codigo is null) then
    with base as (
      select l.codigo as loc, coalesce((select max(pl2.codigo) from public.producto_local pl2 where pl2.local_id = pl.local_id), 0) as desde,
             pl.producto_id, pl.local_id,
             row_number() over (partition by pl.local_id order by p.nombre, p.codigo) as n
      from public.producto_local pl
      join public.producto p on p.id = pl.producto_id
      join public.local l on l.id = pl.local_id
      where pl.codigo is null
    )
    update public.producto_local pl set codigo = b.desde + b.n
    from base b where b.producto_id = pl.producto_id and b.local_id = pl.local_id;
  end if;
  -- el contador de cada negocio continúa desde el último código
  insert into public.correlativo (serie, ultimo)
  select 'COD-' || l.codigo, max(pl.codigo) from public.producto_local pl join public.local l on l.id = pl.local_id
  group by l.codigo
  on conflict (serie) do update set ultimo = greatest(public.correlativo.ultimo, excluded.ultimo);
end $$;

create unique index if not exists ux_producto_local_codigo on public.producto_local(local_id, codigo);

create or replace function public.fn_producto_local_codigo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.codigo is null then
    new.codigo := fn_siguiente_numero('COD-' || (select codigo from local where id = new.local_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_producto_local_codigo on public.producto_local;
create trigger trg_producto_local_codigo before insert on public.producto_local
  for each row execute function public.fn_producto_local_codigo();

-- Búsqueda en el catálogo maestro para el alta: todas las palabras, sin tildes ni mayúsculas.
-- Indica si el producto ya está en el catálogo del usuario (y con qué código local).
create or replace function public.fn_buscar_producto_maestro(p_texto text, p_limite int default 5)
returns table(id uuid, codigo text, nombre text, imagen_url text, unidad text, codigo_local integer)
language sql stable security invoker set search_path = public as $$
  select p.id, p.codigo::text, p.nombre, p.imagen_url, u.codigo::text,
         (select pl.codigo from producto_local pl where pl.producto_id = p.id
            and array[pl.local_id] <@ fn_mis_locales() order by pl.codigo limit 1)
  from producto p join unidad_medida u on u.id = p.unidad_id
  where p.activo and length(trim(coalesce(p_texto, ''))) >= 2
    and not exists (
      select 1 from unnest(string_to_array(fn_normalizar(p_texto), ' ')) w
      where w <> '' and position(w in fn_normalizar(p.nombre)) = 0)
  order by length(p.nombre), p.nombre
  limit p_limite
$$;
grant execute on function public.fn_buscar_producto_maestro(text, int) to authenticated;

-- 3) TRASPASOS ---------------------------------------------------------------------------------
alter table public.traslado add column if not exists local_origen_id uuid references public.local(id);
alter table public.traslado add column if not exists local_destino_id uuid references public.local(id);
alter table public.traslado add column if not exists motivo_cancelacion text;
alter table public.traslado add column if not exists cancelado_at timestamptz;
alter table public.traslado add column if not exists cancelado_por uuid references auth.users(id);
alter table public.traslado add column if not exists recibido_por uuid references auth.users(id);
alter table public.traslado_detalle add column if not exists cantidad_recibida numeric(14,3);
alter table public.traslado_detalle add column if not exists cantidad_rechazada numeric(14,3);

alter table public.traslado drop constraint if exists traslado_estado_check;
update public.traslado set estado = 'pendiente' where estado = 'enviado';
update public.traslado set estado = 'cancelado' where estado = 'anulado';
alter table public.traslado alter column estado set default 'pendiente';
alter table public.traslado add constraint traslado_estado_check check (estado in ('pendiente','recibido','cancelado'));

update public.traslado t set local_origen_id = ao.local_id, local_destino_id = ad.local_id
from public.almacen ao, public.almacen ad
where ao.id = t.almacen_origen_id and ad.id = t.almacen_destino_id and (t.local_origen_id is null or t.local_destino_id is null);

create or replace function public.fn_traslado_locales() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select local_id into new.local_origen_id from almacen where id = new.almacen_origen_id;
  select local_id into new.local_destino_id from almacen where id = new.almacen_destino_id;
  return new;
end $$;
drop trigger if exists trg_traslado_locales on public.traslado;
create trigger trg_traslado_locales before insert or update of almacen_origen_id, almacen_destino_id on public.traslado
  for each row execute function public.fn_traslado_locales();

-- Las funciones anteriores (envío y recepción total) se reemplazan por las de abajo
drop function if exists public.fn_enviar_traslado(uuid);
drop function if exists public.fn_recibir_traslado(uuid, timestamptz);

-- 3a. ENVIAR: valida stock acumulado, crea el documento y descuenta el origen (todo o nada)
create or replace function public.fn_traspaso_enviar(p_origen uuid, p_destino uuid, p_lineas jsonb,
                                                    p_motivo text default null, p_personal uuid default null,
                                                    p_fecha timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num text; v_loc uuid; r record; v_lineas jsonb;
begin
  select local_id into v_loc from almacen where id = p_origen;
  if v_loc is null or not exists (select 1 from almacen where id = p_destino) then raise exception 'Almacén no válido'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos'; end if;
  if not fn_puede('traslados', 'escribir') or not fn_tiene_local(v_loc) then
    raise exception 'No autorizado: solo el almacén de origen puede enviar este traspaso';
  end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'El traspaso no tiene productos'; end if;

  -- stock acumulado: dos líneas del mismo producto se validan juntas
  for r in
    select (x->>'producto_id')::uuid producto_id, sum((x->>'cantidad')::numeric) cant
    from jsonb_array_elements(p_lineas) x group by 1
  loop
    if r.cant is null or r.cant <= 0 then raise exception 'Las cantidades deben ser mayores a cero'; end if;
    if coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0) < r.cant then
      raise exception 'Stock insuficiente de "%" (disponible %, a enviar %)',
        (select nombre from producto where id = r.producto_id),
        coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0), r.cant;
    end if;
  end loop;

  insert into traslado (fecha, almacen_origen_id, almacen_destino_id, motivo, entrega_personal_id, estado)
  values (p_fecha, p_origen, p_destino, p_motivo, p_personal, 'pendiente')
  returning id, numero into v_id, v_num;

  insert into traslado_detalle (traslado_id, producto_id, cantidad, precio, fecha_vencimiento, observacion)
  select v_id, (x->>'producto_id')::uuid, (x->>'cantidad')::numeric,
         coalesce((select costo_promedio from stock s where s.producto_id = (x->>'producto_id')::uuid and s.almacen_id = p_origen), 0),
         nullif(x->>'fecha_vencimiento','')::date, x->>'observacion'
  from jsonb_array_elements(p_lineas) x;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad, 'observacion', observacion))
    into v_lineas from traslado_detalle where traslado_id = v_id;
  perform fn_registrar_movimiento('traslado_salida', p_origen, v_lineas, p_fecha, null, v_num,
            coalesce(p_motivo, 'Traspaso'), p_personal, 'traslado', v_id);

  return jsonb_build_object('id', v_id, 'numero', v_num);
end $$;

-- 3b. RECIBIR línea por línea: lo aceptado entra al destino; lo no aceptado vuelve al origen
--     p_lineas = [{ "detalle_id": uuid, "cantidad": número a aceptar (0 = rechazar) }]
create or replace function public.fn_traspaso_recibir(p_traslado uuid, p_lineas jsonb,
                                                     p_personal uuid default null, p_fecha timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare v_t traslado%rowtype; v_entrada jsonb; v_devolucion jsonb; v_ok integer;
begin
  select * into v_t from traslado where id = p_traslado for update;
  if v_t.id is null then raise exception 'No existe el traspaso'; end if;
  if v_t.estado is distinct from 'pendiente' then raise exception 'El traspaso % ya no está pendiente', v_t.numero; end if;
  if not fn_puede('traslados', 'escribir') or not fn_tiene_local(v_t.local_destino_id) then
    raise exception 'No autorizado: solo el almacén de destino puede recibir este traspaso';
  end if;

  update traslado_detalle d
     set cantidad_recibida = least(greatest(coalesce((x->>'cantidad')::numeric, 0), 0), d.cantidad),
         cantidad_rechazada = d.cantidad - least(greatest(coalesce((x->>'cantidad')::numeric, 0), 0), d.cantidad)
  from jsonb_array_elements(p_lineas) x
  where d.traslado_id = p_traslado and d.id = (x->>'detalle_id')::uuid;
  -- líneas no enviadas en p_lineas = rechazadas por completo
  update traslado_detalle set cantidad_recibida = 0, cantidad_rechazada = cantidad
  where traslado_id = p_traslado and cantidad_recibida is null;

  select count(*) into v_ok from traslado_detalle where traslado_id = p_traslado and cantidad_recibida > 0;
  if v_ok = 0 then raise exception 'No aceptó ningún producto: use "Rechazar todo" e indique el motivo'; end if;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad_recibida,
                   'costo_unitario', precio, 'fecha_vencimiento', fecha_vencimiento))
    into v_entrada from traslado_detalle where traslado_id = p_traslado and cantidad_recibida > 0;
  perform fn_registrar_movimiento('traslado_entrada', v_t.almacen_destino_id, v_entrada, p_fecha, null, v_t.numero,
            'Traspaso ' || v_t.numero || ' recibido', p_personal, 'traslado', p_traslado);

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad_rechazada, 'costo_unitario', precio))
    into v_devolucion from traslado_detalle where traslado_id = p_traslado and cantidad_rechazada > 0;
  if v_devolucion is not null then
    perform fn_registrar_movimiento('traslado_entrada', v_t.almacen_origen_id, v_devolucion, p_fecha, null, v_t.numero,
              'Devolución: no aceptado en la recepción del traspaso ' || v_t.numero, null, 'traslado', p_traslado);
  end if;

  update traslado set estado = 'recibido', recibido_at = p_fecha, recibido_por = auth.uid(),
                      recibe_personal_id = coalesce(p_personal, recibe_personal_id)
  where id = p_traslado;
end $$;

-- 3c. CANCELAR (el origen, antes de que lo reciban) o RECHAZAR TODO (el destino), con motivo.
--     Primero se marca cancelado y luego se devuelve el stock al origen anulando la salida.
create or replace function public.fn_traspaso_cancelar(p_traslado uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t traslado%rowtype;
begin
  select * into v_t from traslado where id = p_traslado for update;
  if v_t.id is null then raise exception 'No existe el traspaso'; end if;
  if v_t.estado is distinct from 'pendiente' then raise exception 'El traspaso % ya no está pendiente', v_t.numero; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique el motivo'; end if;
  if not fn_puede('traslados', 'escribir')
     or not (fn_tiene_local(v_t.local_origen_id) or fn_tiene_local(v_t.local_destino_id)) then
    raise exception 'No autorizado';
  end if;

  update traslado set estado = 'cancelado', motivo_cancelacion = p_motivo, cancelado_at = now(), cancelado_por = auth.uid()
  where id = p_traslado;
  update movimiento set anulado = true
  where referencia_tipo = 'traslado' and referencia_id = p_traslado and tipo = 'traslado_salida' and not anulado;
end $$;

grant execute on function public.fn_traspaso_enviar(uuid, uuid, jsonb, text, uuid, timestamptz) to authenticated;
grant execute on function public.fn_traspaso_recibir(uuid, jsonb, uuid, timestamptz) to authenticated;
grant execute on function public.fn_traspaso_cancelar(uuid, text) to authenticated;

-- 3d. REPORTE: productos nuevos en un almacén = primer movimiento real del producto en ese negocio
--     dentro del rango (no la fecha de alta en el catálogo general)
create or replace function public.fn_productos_nuevos(p_local uuid, p_desde date, p_hasta date)
returns table(producto_id uuid, nombre text, codigo_local integer, primera_fecha timestamptz, tipo text, cantidad numeric)
language sql stable security invoker set search_path = public as $$
  with primero as (
    select distinct on (d.producto_id) d.producto_id, m.fecha, m.tipo, d.cantidad
    from movimiento m join movimiento_detalle d on d.movimiento_id = m.id
    where m.local_id = p_local and not m.anulado
    order by d.producto_id, m.fecha, m.numero
  )
  select f.producto_id, p.nombre,
         (select pl.codigo from producto_local pl where pl.producto_id = f.producto_id and pl.local_id = p_local),
         f.fecha, f.tipo, f.cantidad
  from primero f join producto p on p.id = f.producto_id
  where (f.fecha at time zone 'America/Lima')::date between p_desde and p_hasta
  order by f.fecha desc
$$;
grant execute on function public.fn_productos_nuevos(uuid, date, date) to authenticated;

-- 4) RECEPCIÓN DE COMPRAS por el almacén (la orden la crea/aprueba Logística) ---------------------
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
  from compra_detalle where compra_id = p_compra and cantidad_recibida > 0;

  if v_lineas is not null then
    v_mov := fn_registrar_movimiento('entrada_compra', v_c.almacen_id, v_lineas, p_fecha_entrega, null,
               concat_ws(' ', v_c.tipo_documento, v_c.numero_documento), 'Recepción ' || v_c.numero,
               null, 'compra', p_compra);
  end if;

  insert into precio_historial(producto_id, proveedor_id, local_id, fecha, precio, tipo, compra_detalle_id)
  select d.producto_id, v_c.proveedor_id, v_c.local_id, v_c.fecha, d.precio_unitario, 'compra', d.id
  from compra_detalle d where d.compra_id = p_compra;

  update producto p set costo_referencia = d.precio_unitario, updated_at = now()
  from compra_detalle d where d.compra_id = p_compra and d.producto_id = p.id;

  update compra set estado = 'recibida',
                    fecha_entrega = p_fecha_entrega,
                    fecha_aprobacion = coalesce(fecha_aprobacion, p_fecha_entrega)
   where id = p_compra;
  return v_mov;
end $$;

-- 5) AISLAMIENTO POR NEGOCIO (RLS) ---------------------------------------------------------------
-- Antes: escribir solo exigía permiso del módulo. Ahora además el negocio debe ser uno de los del usuario.
do $$
declare
  r record;
  v_local_col boolean;
  v_read text;
  v_write text;
begin
  for r in select * from (values
      ('empresa','maestros'), ('local','maestros'), ('almacen','maestros'), ('area','maestros'),
      ('ciudad','maestros'), ('unidad_medida','maestros'), ('categoria','maestros'), ('producto','maestros'),
      ('personal','maestros'), ('tipo_movimiento','maestros'), ('motivo','maestros'),
      ('parametro','configuracion'), ('vianda_item','maestros'), ('vianda_conversion','maestros'), ('tarea','maestros'),
      ('movimiento','inventario'), ('producto_local','maestros'),
      ('conteo','conteos'), ('conteo_detalle','conteos'),
      ('proveedor','proveedores'), ('proveedor_contacto','proveedores'),
      ('compra','compras'), ('compra_detalle','compras'), ('precio_historial','compras'), ('transporte','compras'),
      ('cotizacion','compras'), ('cotizacion_item','compras'), ('cotizacion_oferta','compras'), ('cotizacion_precio','compras'),
      ('requerimiento','requerimientos'), ('requerimiento_detalle','requerimientos'),
      ('venta_vianda','carnes'), ('venta_vianda_detalle','carnes'),
      ('descuento','descuentos'), ('descuento_detalle','descuentos'), ('rotura','controles'), ('rotura_responsable','controles'),
      ('documento','documentos'), ('tarea_registro','tareas'),
      ('rol','seguridad'), ('rol_permiso','seguridad'), ('usuario_local','seguridad'), ('periodo_cierre','configuracion'),
      ('correlativo','configuracion')
    ) as t(tabla, modulo)
  loop
    execute format('alter table public.%I enable row level security', r.tabla);
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.tabla and column_name = 'local_id') into v_local_col;
    -- La lista de almacenes y áreas se lee completa (para elegir el destino de un traspaso); escribir sigue limitado
    v_read := format('(select public.fn_puede(%L, ''leer''))', r.modulo)
              || case when v_local_col and r.tabla not in ('almacen','area') then ' and (local_id is null or array[local_id] <@ (select public.fn_mis_locales()))' else '' end;
    v_write := format('(select public.fn_puede(%L, ''escribir''))', r.modulo)
              || case when v_local_col then ' and (local_id is null or array[local_id] <@ (select public.fn_mis_locales()))' else '' end;
    execute format('drop policy if exists p_leer on public.%I', r.tabla);
    execute format('create policy p_leer on public.%I for select to authenticated using (%s)', r.tabla, v_read);
    execute format('drop policy if exists p_insertar on public.%I', r.tabla);
    execute format('create policy p_insertar on public.%I for insert to authenticated with check (%s)', r.tabla, v_write);
    execute format('drop policy if exists p_actualizar on public.%I', r.tabla);
    execute format('create policy p_actualizar on public.%I for update to authenticated using (%s) with check (%s)', r.tabla, v_write, v_write);
    execute format('drop policy if exists p_eliminar on public.%I', r.tabla);
    execute format('create policy p_eliminar on public.%I for delete to authenticated using (%s)', r.tabla, v_write);
  end loop;
end $$;

-- Tablas por almacén sin columna local_id: el negocio sale del almacén o del documento padre
alter table public.stock enable row level security;
drop policy if exists p_leer on public.stock;
create policy p_leer on public.stock for select to authenticated using (
  (select public.fn_puede('inventario', 'leer'))
  and exists (select 1 from public.almacen a where a.id = stock.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));

alter table public.movimiento_detalle enable row level security;
drop policy if exists p_leer on public.movimiento_detalle;
drop policy if exists p_insertar on public.movimiento_detalle;
drop policy if exists p_actualizar on public.movimiento_detalle;
drop policy if exists p_eliminar on public.movimiento_detalle;
create policy p_leer on public.movimiento_detalle for select to authenticated using (
  (select public.fn_puede('inventario', 'leer'))
  and exists (select 1 from public.movimiento m where m.id = movimiento_detalle.movimiento_id
              and array[m.local_id] <@ (select public.fn_mis_locales())));
create policy p_insertar on public.movimiento_detalle for insert to authenticated with check (
  (select public.fn_puede('inventario', 'escribir'))
  and exists (select 1 from public.movimiento m where m.id = movimiento_detalle.movimiento_id
              and array[m.local_id] <@ (select public.fn_mis_locales())));
create policy p_actualizar on public.movimiento_detalle for update to authenticated using (
  (select public.fn_puede('inventario', 'escribir'))
  and exists (select 1 from public.movimiento m where m.id = movimiento_detalle.movimiento_id
              and array[m.local_id] <@ (select public.fn_mis_locales())));

alter table public.lote enable row level security;
drop policy if exists p_leer on public.lote;
drop policy if exists p_insertar on public.lote;
drop policy if exists p_actualizar on public.lote;
drop policy if exists p_eliminar on public.lote;
create policy p_leer on public.lote for select to authenticated using (
  (select public.fn_puede('inventario', 'leer'))
  and exists (select 1 from public.almacen a where a.id = lote.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));

alter table public.lote_consumo enable row level security;
drop policy if exists p_leer on public.lote_consumo;
drop policy if exists p_insertar on public.lote_consumo;
drop policy if exists p_actualizar on public.lote_consumo;
drop policy if exists p_eliminar on public.lote_consumo;
create policy p_leer on public.lote_consumo for select to authenticated using ((select public.fn_puede('inventario', 'leer')));

-- Parámetros por almacén (mínimo, máximo, par): todos los leen; cada uno edita solo los de sus almacenes
alter table public.producto_almacen enable row level security;
drop policy if exists p_leer on public.producto_almacen;
drop policy if exists p_insertar on public.producto_almacen;
drop policy if exists p_actualizar on public.producto_almacen;
drop policy if exists p_eliminar on public.producto_almacen;
create policy p_leer on public.producto_almacen for select to authenticated using ((select public.fn_puede('maestros', 'leer')));
create policy p_insertar on public.producto_almacen for insert to authenticated with check (
  (select public.fn_puede('maestros', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));
create policy p_actualizar on public.producto_almacen for update to authenticated using (
  (select public.fn_puede('maestros', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));
create policy p_eliminar on public.producto_almacen for delete to authenticated using (
  (select public.fn_puede('maestros', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));

-- Traspasos: los ven el origen y el destino; se escriben SOLO con las funciones de arriba
alter table public.traslado enable row level security;
drop policy if exists p_leer on public.traslado;
drop policy if exists p_insertar on public.traslado;
drop policy if exists p_actualizar on public.traslado;
drop policy if exists p_eliminar on public.traslado;
create policy p_leer on public.traslado for select to authenticated using (
  (select public.fn_puede('traslados', 'leer'))
  and (array[local_origen_id] <@ (select public.fn_mis_locales()) or array[local_destino_id] <@ (select public.fn_mis_locales())));

alter table public.traslado_detalle enable row level security;
drop policy if exists p_leer on public.traslado_detalle;
drop policy if exists p_insertar on public.traslado_detalle;
drop policy if exists p_actualizar on public.traslado_detalle;
drop policy if exists p_eliminar on public.traslado_detalle;
create policy p_leer on public.traslado_detalle for select to authenticated using (
  exists (select 1 from public.traslado t where t.id = traslado_detalle.traslado_id));

-- 6) USUARIOS DE ALMACÉN --------------------------------------------------------------------------
-- Contraseñas cifradas con bcrypt en Supabase Auth (cámbielas luego en Authentication → Users)
do $$
declare
  v record;
begin
  for v in select * from (values
      ('a1f10000-0000-4000-8000-000000000002'::uuid, 'almacen.lasflores@lasflores.local', 'CAMBIAR_CONTRASEÑA', 'Almacén Las Flores', 'LF'),
      ('a1f10000-0000-4000-8000-000000000003'::uuid, 'almacen.umaru@lasflores.local',     'CAMBIAR_CONTRASEÑA',     'Almacén Umaru',      'UM')
    ) as t(uid, email, clave, usuario, loc)
  loop
    if not exists (select 1 from auth.users where id = v.uid) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', v.uid, 'authenticated', 'authenticated',
              v.email, extensions.crypt(v.clave, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', v.usuario), now(), now(),
              '', '', '', '');
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v.uid::text, v.uid,
              jsonb_build_object('sub', v.uid::text, 'email', v.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    insert into public.usuario (id, username, nombre, rol, todos_locales)
    values (v.uid, v.usuario, v.usuario, 'almacen', false)
    on conflict (id) do update set rol = 'almacen', todos_locales = false, activo = true;
    insert into public.usuario_local (usuario_id, local_id)
    select v.uid, l.id from public.local l where l.codigo = v.loc
    on conflict do nothing;
  end loop;
end $$;

-- Verificación
select u.username, u.rol, l.codigo as negocio,
       (select count(*) from public.producto_local pl where pl.local_id = l.id) as productos_en_su_catalogo,
       (select max(codigo) from public.producto_local pl where pl.local_id = l.id) as ultimo_codigo_local
from public.usuario u
left join public.usuario_local ul on ul.usuario_id = u.id
left join public.local l on l.id = ul.local_id
order by u.username;
