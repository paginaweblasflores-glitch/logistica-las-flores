-- =============================================================================
--  44_catalogo_por_negocio_y_unidades.sql
--  Cada negocio (Las Flores y Umaru) con SU propio producto, unidos por el código maestro (acordado 2026-10-14):
--    · nombre, unidad, foto, marca, presentación, categoría y precio inicial son de cada negocio:
--      lo que cambia uno ya no cambia al otro;
--    · «¿Cuánto trae cada…?»: un producto en empaque (saco, caja…) dice cuánto trae (saco = 50 kilos);
--    · las unidades son «medida» (unidad, kilo, litro…) o «empaque» (saco, caja…); las nuevas, empaque;
--    · traspasos y compras: el sistema usa el producto del negocio que recibe y convierte la cantidad
--      y el costo a su unidad (2 sacos → 100 kilos); al enviar se puede elegir la unidad.
--  Lo que ya existe se conserva: los productos que hoy usan los dos negocios se separan en dos
--  (Umaru recibe su copia con sus mismos códigos, stock, lotes, movimientos y precios).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística).
-- =============================================================================

-- 1) Unidades: medida o empaque, y su equivalencia con la unidad base ------------------------------------
alter table public.unidad_medida add column if not exists tipo text not null default 'empaque';
alter table public.unidad_medida add column if not exists base_id uuid references public.unidad_medida(id);
alter table public.unidad_medida add column if not exists base_factor numeric(18,6);
do $$ begin
  alter table public.unidad_medida add constraint ck_unidad_tipo check (tipo in ('medida', 'empaque'));
exception when duplicate_object then null; end $$;

update public.unidad_medida set tipo = 'medida', base_id = id, base_factor = 1 where codigo in ('UND', 'KG', 'L', 'M');
update public.unidad_medida u set tipo = 'medida', base_id = b.id, base_factor = x.f
from (values ('G', 'KG', 0.001), ('ML', 'L', 0.001), ('GAL', 'L', 3.785), ('DOC', 'UND', 12), ('PAR', 'UND', 2)) x(cod, base, f)
join public.unidad_medida b on b.codigo = x.base
where u.codigo = x.cod;

drop view if exists public.v_unidad_uso;
create view public.v_unidad_uso with (security_invoker = true) as
select u.id, u.codigo, u.nombre, u.orden, u.activo,
       (select count(*) from public.producto p where p.unidad_id = u.id and p.activo)::int as productos,
       u.tipo
from public.unidad_medida u;
grant select on public.v_unidad_uso to authenticated;

-- 2) Producto: código maestro y «cuánto trae» -------------------------------------------------------------
alter table public.producto add column if not exists maestro_id uuid;
alter table public.producto add column if not exists contenido numeric(14,4);
alter table public.producto add column if not exists contenido_unidad_id uuid references public.unidad_medida(id);
update public.producto set maestro_id = id where maestro_id is null;
create index if not exists ix_producto_maestro on public.producto(maestro_id);

create or replace function public.fn_producto_maestro() returns trigger
language plpgsql as $$
begin
  new.maestro_id := coalesce(new.maestro_id, new.id);
  return new;
end $$;
drop trigger if exists trg_producto_maestro on public.producto;
create trigger trg_producto_maestro before insert on public.producto for each row execute function public.fn_producto_maestro();

-- 3) Conversión de unidades -------------------------------------------------------------------------------
-- una unidad expresada en su unidad base (medida) o en sí misma (empaque)
create or replace function public.fn_unidad_base(p_unidad uuid, out base uuid, out q numeric)
language sql stable set search_path = public as $$
  select case when u.tipo = 'medida' then coalesce(u.base_id, u.id) else u.id end,
         case when u.tipo = 'medida' then coalesce(u.base_factor, 1) else 1 end
  from unidad_medida u where u.id = p_unidad
$$;

-- una unidad del producto en la unidad base: medida → directo; empaque con «cuánto trae» → contenido
create or replace function public.fn_producto_base(p_producto uuid, out base uuid, out q numeric)
language plpgsql stable set search_path = public as $$
declare p producto%rowtype; t text;
begin
  select * into p from producto where id = p_producto;
  select tipo into t from unidad_medida where id = p.unidad_id;
  if t = 'medida' then
    select b.base, b.q into base, q from fn_unidad_base(p.unidad_id) b;
  elsif coalesce(p.contenido, 0) > 0 and p.contenido_unidad_id is not null then
    select b.base, b.q * p.contenido into base, q from fn_unidad_base(p.contenido_unidad_id) b;
  else
    base := p.unidad_id; q := 1;
  end if;
end $$;

-- cuántas unidades del producto B equivalen a 1 unidad del producto A (null = no se puede convertir)
create or replace function public.fn_factor_productos(p_de uuid, p_a uuid) returns numeric
language plpgsql stable set search_path = public as $$
declare a record; b record;
begin
  if p_de = p_a then return 1; end if;
  select * into a from fn_producto_base(p_de);
  select * into b from fn_producto_base(p_a);
  if a.base is null or b.base is null or a.base <> b.base or b.q = 0 then return null; end if;
  return a.q / b.q;
end $$;

-- cuántas unidades del producto equivalen a 1 de la unidad elegida (p. ej. 1 kilo = 0.02 sacos)
create or replace function public.fn_factor_unidad(p_producto uuid, p_unidad uuid) returns numeric
language plpgsql stable set search_path = public as $$
declare u record; b record;
begin
  if p_unidad is null or p_unidad = (select unidad_id from producto where id = p_producto) then return 1; end if;
  select * into u from fn_unidad_base(p_unidad);
  select * into b from fn_producto_base(p_producto);
  if u.base is null or b.base is null or u.base <> b.base or b.q = 0 then return null; end if;
  return u.q / b.q;
end $$;
grant execute on function public.fn_factor_productos(uuid, uuid) to authenticated;
grant execute on function public.fn_factor_unidad(uuid, uuid) to authenticated;

-- 4) El producto de un negocio: el mismo si ya es suyo; si no, el de ese negocio con el mismo código maestro;
--    si no lo tiene, se crea su copia (con los mismos datos) en la lista de ese negocio
create or replace function public.fn_producto_en_local(p_producto uuid, p_local uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; p producto%rowtype; n int;
begin
  if p_local is null then return p_producto; end if;
  if exists (select 1 from producto_local where producto_id = p_producto and local_id = p_local) then return p_producto; end if;
  -- un producto que aún no es de ningún negocio pasa a este
  if not exists (select 1 from producto_local where producto_id = p_producto) then
    insert into producto_local (producto_id, local_id) values (p_producto, p_local) on conflict do nothing;
    return p_producto;
  end if;
  select * into p from producto where id = p_producto;
  select x.id into v from producto x join producto_local pl on pl.producto_id = x.id and pl.local_id = p_local
   where x.maestro_id = p.maestro_id order by x.activo desc, x.created_at limit 1;
  if v is not null then return v; end if;
  if auth.uid() is not null and not (fn_es_almacen() or fn_puede('maestros', 'escribir')) then raise exception 'No autorizado'; end if;
  n := fn_siguiente_numero('PROD');
  insert into producto (codigo, codigo_barras, nombre, descripcion, tipo, categoria_id, unidad_id, marca, presentacion,
                        es_perecible, controla_lote, costo_referencia, precio_venta, imagen_url, activo, maestro_id, contenido, contenido_unidad_id)
  values ('P-' || lpad(n::text, 5, '0'), p.codigo_barras, p.nombre, p.descripcion, p.tipo, p.categoria_id, p.unidad_id, p.marca, p.presentacion,
          p.es_perecible, p.controla_lote, p.costo_referencia, p.precio_venta, p.imagen_url, true, p.maestro_id, p.contenido, p.contenido_unidad_id)
  returning id into v;
  insert into producto_local (producto_id, local_id) values (v, p_local) on conflict do nothing;
  return v;
end $$;
grant execute on function public.fn_producto_en_local(uuid, uuid) to authenticated;

-- 5) Separar los productos que hoy usan los dos negocios: Las Flores se queda con el actual y Umaru con su copia
--    (con sus mismos códigos, mínimos, stock, lotes, movimientos, compras, precios, conteos…)
alter table public.movimiento_detalle disable trigger trg_movdet_inmutable;
do $$
declare
  v_lf uuid := (select id from public.local where codigo = 'LF');
  r record; v_new uuid; n int; p public.producto%rowtype;
begin
  for r in
    select pl.producto_id, pl.local_id
    from public.producto_local pl
    where pl.local_id <> v_lf
      and exists (select 1 from public.producto_local o where o.producto_id = pl.producto_id and o.local_id = v_lf)
  loop
    select * into p from public.producto where id = r.producto_id;
    n := public.fn_siguiente_numero('PROD');
    insert into public.producto (codigo, codigo_barras, nombre, descripcion, tipo, categoria_id, unidad_id, marca, presentacion,
                                 es_perecible, controla_lote, costo_referencia, precio_venta, imagen_url, activo, maestro_id, contenido, contenido_unidad_id)
    values ('P-' || lpad(n::text, 5, '0'), p.codigo_barras, p.nombre, p.descripcion, p.tipo, p.categoria_id, p.unidad_id, p.marca, p.presentacion,
            p.es_perecible, p.controla_lote, p.costo_referencia, p.precio_venta, p.imagen_url, p.activo, p.maestro_id, p.contenido, p.contenido_unidad_id)
    returning id into v_new;

    update public.producto_local set producto_id = v_new where producto_id = r.producto_id and local_id = r.local_id;
    update public.producto_almacen pa set producto_id = v_new from public.almacen a
     where a.id = pa.almacen_id and a.local_id = r.local_id and pa.producto_id = r.producto_id;
    update public.stock s set producto_id = v_new from public.almacen a
     where a.id = s.almacen_id and a.local_id = r.local_id and s.producto_id = r.producto_id;
    update public.lote l set producto_id = v_new from public.almacen a
     where a.id = l.almacen_id and a.local_id = r.local_id and l.producto_id = r.producto_id;
    update public.movimiento_detalle d set producto_id = v_new from public.movimiento m
     where m.id = d.movimiento_id and m.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.conteo_detalle d set producto_id = v_new from public.conteo c
     where c.id = d.conteo_id and c.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.reporte_stock_detalle d set producto_id = v_new from public.reporte_stock s
     where s.id = d.reporte_id and s.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.requerimiento_detalle d set producto_id = v_new from public.requerimiento q
     where q.id = d.requerimiento_id and q.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.compra_detalle d set producto_id = v_new from public.compra c
     where c.id = d.compra_id and c.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.precio_historial set producto_id = v_new where local_id = r.local_id and producto_id = r.producto_id;
    update public.cotizacion_item d set producto_id = v_new from public.cotizacion c
     where c.id = d.cotizacion_id and c.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.descuento_detalle d set producto_id = v_new from public.descuento c
     where c.id = d.descuento_id and c.local_id = r.local_id and d.producto_id = r.producto_id;
    update public.rotura set producto_id = v_new where local_id = r.local_id and producto_id = r.producto_id;
    update public.traslado_detalle d set producto_id = v_new from public.traslado t
     where t.id = d.traslado_id and t.local_origen_id = r.local_id and d.producto_id = r.producto_id;
  end loop;
end $$;
alter table public.movimiento_detalle enable trigger trg_movdet_inmutable;

-- 6) Traspasos: el producto y la unidad del destino ---------------------------------------------------------
alter table public.traslado_detalle add column if not exists producto_destino_id uuid references public.producto(id);
alter table public.traslado_detalle add column if not exists factor numeric(18,6) not null default 1;
alter table public.traslado_detalle add column if not exists unidad_envio_id uuid references public.unidad_medida(id);
alter table public.traslado_detalle add column if not exists cantidad_envio numeric(14,3);
-- los que ya existen: el producto del negocio de destino (mismas unidades → factor 1)
update public.traslado_detalle d
   set producto_destino_id = coalesce((select x.id from public.producto x join public.producto p on p.id = d.producto_id
                                        join public.producto_local pl on pl.producto_id = x.id and pl.local_id = t.local_destino_id
                                       where x.maestro_id = p.maestro_id limit 1), d.producto_id),
       unidad_envio_id = coalesce(d.unidad_envio_id, (select unidad_id from public.producto where id = d.producto_id)),
       cantidad_envio = coalesce(d.cantidad_envio, d.cantidad)
from public.traslado t
where t.id = d.traslado_id and d.producto_destino_id is null;

-- 7) Movimientos: el producto del negocio del almacén, con conversión de unidad ------------------------------
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
      raise exception 'Stock insuficiente de "%" (disponible %, solicitado %)', v_prod.nombre, v_stock.cantidad, new.cantidad;
    end if;
    update stock set cantidad = cantidad - new.cantidad, ultimo_movimiento = v_mov.fecha
    where producto_id = new.producto_id and almacen_id = v_mov.almacen_id;
  end if;
  return new;
end $$;

-- 8) Enviar traspaso: con unidad por línea; guarda el producto y el factor del destino ----------------------
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
    v_f := case when nullif(ln->>'unidad_id', '') is null then 1
                else fn_factor_unidad((ln->>'producto_id')::uuid, (ln->>'unidad_id')::uuid) end;
    if v_f is null then
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
        coalesce((select cantidad from stock where producto_id = r.producto_id and almacen_id = p_origen), 0), r.cant;
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

-- 9) Buscador: datos de unidad y una sola fila por producto maestro fuera del almacén ----------------------
drop function if exists public.fn_buscar_productos(text, uuid, text[], int);
create or replace function public.fn_buscar_productos(
  p_texto text, p_almacen uuid default null, p_tipos text[] default null, p_limite int default 30)
returns table(id uuid, codigo text, nombre text, tipo text, costo_referencia numeric, controla_lote boolean,
              unidad text, stock numeric, rango int, unidad_id uuid, contenido numeric, contenido_unidad_id uuid, contenido_unidad text)
language sql stable security invoker set search_path = public as $$
  with q as (
    select fn_normalizar(p_texto) as t,
           array_remove(string_to_array(fn_normalizar(p_texto), ' '), '') as palabras
  ), c as (
    select p.id, p.nombre, p.tipo, p.costo_referencia, p.controla_lote, p.codigo as codigo_global,
           p.nombre_busqueda as nb, pa.codigo as codigo_alm, u.codigo as unidad, p.maestro_id,
           p.unidad_id, p.contenido, p.contenido_unidad_id, (select cu.codigo from unidad_medida cu where cu.id = p.contenido_unidad_id) as contenido_unidad,
           (select s.cantidad from stock s where s.producto_id = p.id and s.almacen_id = p_almacen) as stock
    from producto p
    join unidad_medida u on u.id = p.unidad_id
    left join producto_almacen pa on pa.producto_id = p.id and pa.almacen_id = p_almacen
    where p.activo
      and (p_almacen is null or pa.producto_id is not null)
      and (p_tipos is null or p.tipo = any(p_tipos))
  ), r as (
    select c.*,
           case
             -- código exacto: el del almacén (23) o el general (P-00023)
             when (q.t ~ '^\d+$' and ((p_almacen is not null and c.codigo_alm = q.t::bigint)
                                       or (p_almacen is null and c.codigo_global = 'P-' || lpad(q.t, 5, '0'))))
                  or lower(c.codigo_global) = q.t then 0
             when left(c.nb, length(q.t)) = q.t then 1                        -- empieza con lo escrito
             when position(' ' || q.t in ' ' || c.nb) > 0 then 2               -- alguna palabra empieza
             else 3                                                            -- lo contiene
           end as rango,
           -- todas las palabras aparecen en el nombre (en cualquier orden)
           not exists (select 1 from unnest(q.palabras) w where position(w in c.nb) = 0) as en_nombre,
           c.nb = q.t as igual
    from c, q
    where q.t <> ''
  ), u as (
    -- sin almacén (Logística, jefes de área): una sola fila por producto maestro (no repetir Las Flores y Umaru)
    select distinct on (r.maestro_id) r.* from r
    where r.rango = 0 or r.en_nombre
    order by r.maestro_id, r.rango, r.codigo_global
  )
  select u.id, coalesce(u.codigo_alm::text, u.codigo_global), u.nombre, u.tipo, u.costo_referencia, u.controla_lote,
         u.unidad, u.stock, u.rango, u.unidad_id, u.contenido, u.contenido_unidad_id, u.contenido_unidad
  from u
  order by u.rango, u.igual desc, u.nombre   -- dentro de cada grupo, en orden alfabético
  limit greatest(coalesce(p_limite, 30), 1)
$$;
grant execute on function public.fn_buscar_productos(text, uuid, text[], int) to authenticated;

-- Verificación: cada producto en un solo negocio (debe salir 0) y cuántos tiene cada negocio
select (select count(*) from (select producto_id from public.producto_local group by 1 having count(*) > 1) x) productos_compartidos,
       (select count(*) from public.producto_local pl join public.local l on l.id = pl.local_id where l.codigo = 'LF') las_flores,
       (select count(*) from public.producto_local pl join public.local l on l.id = pl.local_id where l.codigo = 'UM') umaru;
