-- =============================================================================
--  32_almacen_hernan.sql
--  Lo acordado con el Sr. Hernán (almacén Las Flores, 2026-10-13):
--    1) Separar los productos entre Almacén 01 («arriba») y Almacén 02 («abajo», cocina): entre ellos no hay
--       traspasos; cada producto es de uno u otro. Lo hace él una sola vez, antes de poner las cantidades.
--    2) «Enviar stock del día»: cada mañana, antes de cualquier movimiento, la foto del stock completo
--       queda guardada con fecha y hora y Fernanda la ve en su panel (antes era un Excel de Tumisoft).
--    3) Para el requerimiento: los productos que bajaron del mínimo, de una sola vez.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Pasar productos de un almacén a otro del mismo negocio (solo los que aún no tienen movimientos ahí)
create or replace function public.fn_mover_productos_almacen(p_productos uuid[], p_origen uuid, p_destino uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lo uuid; v_ld uuid; n_mov int := 0; n_omit int := 0; p uuid;
begin
  select local_id into v_lo from almacen where id = p_origen and activo;
  select local_id into v_ld from almacen where id = p_destino and activo;
  if v_lo is null or v_ld is null or v_lo <> v_ld or p_origen = p_destino then
    raise exception 'Los dos almacenes deben ser distintos y del mismo negocio';
  end if;
  if not fn_es_almacen() or not fn_tiene_local(v_lo) then raise exception 'Solo el responsable del almacén separa sus productos'; end if;
  foreach p in array coalesce(p_productos, '{}') loop
    -- con stock o movimientos en el origen no se mueve (eso ya sería un traspaso)
    if exists (select 1 from stock s where s.producto_id = p and s.almacen_id = p_origen)
       or not exists (select 1 from producto_almacen pa where pa.producto_id = p and pa.almacen_id = p_origen) then
      n_omit := n_omit + 1; continue;
    end if;
    insert into producto_almacen (producto_id, almacen_id, stock_minimo, stock_maximo, stock_objetivo, ubicacion)
    select producto_id, p_destino, stock_minimo, stock_maximo, stock_objetivo, ubicacion
    from producto_almacen where producto_id = p and almacen_id = p_origen
    on conflict (producto_id, almacen_id) do nothing;
    delete from producto_almacen where producto_id = p and almacen_id = p_origen;
    n_mov := n_mov + 1;
  end loop;
  return jsonb_build_object('movidos', n_mov, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_mover_productos_almacen(uuid[], uuid, uuid) to authenticated;

-- 2) Stock del día -----------------------------------------------------------------------------------
create table if not exists public.reporte_stock (
  id          uuid primary key default gen_random_uuid(),
  almacen_id  uuid not null references public.almacen(id),
  local_id    uuid not null references public.local(id),
  fecha       date not null,                       -- día (hora de Lima)
  enviado_at  timestamptz not null default now(),
  enviado_por uuid references auth.users(id) default auth.uid(),
  productos   int not null default 0,
  valor       numeric(18,2) not null default 0,
  unique (almacen_id, fecha)
);
create table if not exists public.reporte_stock_detalle (
  reporte_id      uuid not null references public.reporte_stock(id) on delete cascade,
  producto_id     uuid not null references public.producto(id),
  codigo_almacen  integer,
  producto        text not null,
  categoria       text,
  unidad          text,
  cantidad        numeric(16,4) not null,
  costo_promedio  numeric(14,4),
  valor           numeric(18,4),
  primary key (reporte_id, producto_id)
);
create index if not exists ix_reporte_stock_fecha on public.reporte_stock(local_id, fecha desc);
alter table public.reporte_stock enable row level security;
alter table public.reporte_stock_detalle enable row level security;
drop policy if exists p_leer on public.reporte_stock;
create policy p_leer on public.reporte_stock for select to authenticated using ((select public.fn_tiene_local(local_id)));
drop policy if exists p_leer on public.reporte_stock_detalle;
create policy p_leer on public.reporte_stock_detalle for select to authenticated
  using (exists (select 1 from public.reporte_stock r where r.id = reporte_id and public.fn_tiene_local(r.local_id)));

-- Lo envía el almacén: foto de TODO su stock en este momento. Si ya lo envió hoy, se reemplaza (queda la hora nueva).
create or replace function public.fn_enviar_stock_dia(p_almacen uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_local uuid; v_id uuid; v_hoy date := (now() at time zone 'America/Lima')::date; n int; v numeric;
begin
  select local_id into v_local from almacen where id = p_almacen and activo;
  if v_local is null then raise exception 'Almacén no válido'; end if;
  if not fn_es_almacen() or not fn_tiene_local(v_local) then raise exception 'El stock del día lo envía el responsable del almacén'; end if;
  insert into reporte_stock (almacen_id, local_id, fecha) values (p_almacen, v_local, v_hoy)
  on conflict (almacen_id, fecha) do update set enviado_at = now(), enviado_por = auth.uid()
  returning id into v_id;
  delete from reporte_stock_detalle where reporte_id = v_id;
  -- todos los productos del almacén (también los que están en cero), con su código y su costo
  insert into reporte_stock_detalle (reporte_id, producto_id, codigo_almacen, producto, categoria, unidad, cantidad, costo_promedio, valor)
  select v_id, p.id, pa.codigo, p.nombre, c.nombre, u.codigo, coalesce(s.cantidad, 0), s.costo_promedio, coalesce(s.valor, 0)
  from producto_almacen pa
  join producto p on p.id = pa.producto_id and p.activo
  join unidad_medida u on u.id = p.unidad_id
  left join categoria c on c.id = p.categoria_id
  left join stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id
  where pa.almacen_id = p_almacen;
  select count(*), coalesce(sum(valor), 0) into n, v from reporte_stock_detalle where reporte_id = v_id;
  update reporte_stock set productos = n, valor = round(v, 2) where id = v_id;
  return jsonb_build_object('id', v_id, 'productos', n, 'valor', round(v, 2));
end $$;
grant execute on function public.fn_enviar_stock_dia(uuid) to authenticated;

-- 3) Productos bajo el mínimo de un almacén (para cargarlos al requerimiento de una vez) --------------
create or replace function public.fn_bajo_minimo(p_almacen uuid)
returns table(id uuid, codigo text, nombre text, unidad text, tipo text, costo_referencia numeric, controla_lote boolean,
              stock numeric, minimo numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, pa.codigo::text, p.nombre, u.codigo, p.tipo, p.costo_referencia, p.controla_lote,
         coalesce(s.cantidad, 0), pa.stock_minimo
  from producto_almacen pa
  join producto p on p.id = pa.producto_id and p.activo
  join unidad_medida u on u.id = p.unidad_id
  left join stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id
  where pa.almacen_id = p_almacen and pa.stock_minimo > 0 and coalesce(s.cantidad, 0) <= pa.stock_minimo
  order by coalesce(s.cantidad, 0) / nullif(pa.stock_minimo, 0), p.nombre
$$;
grant execute on function public.fn_bajo_minimo(uuid) to authenticated;

-- Verificación
select count(*) as reportes_de_stock from public.reporte_stock;
