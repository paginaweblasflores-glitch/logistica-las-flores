-- =============================================================================
--  24_codigo_por_almacen_e_inventario_inicial.sql
--  Cada almacén es independiente y tiene SU propio correlativo de códigos (desde 1):
--    Catálogo principal (P-00001)  →  maestra del negocio (producto_local.codigo: Las Flores 10)
--                                   →  código de cada almacén (producto_almacen.codigo: Almacén 01 = 5,
--                                      Almacén 02 — Cocina = 50, Hotel Umaru = 1…)
--  · Los traspasos pasan por la maestra (el que recibe ve SU código; si el producto no estaba en
--    su almacén, se agrega solo con el siguiente código de ese almacén).
--  · Inventario inicial: el responsable pone UNA sola vez la cantidad que tiene hoy y su precio
--    unitario (en Productos). Queda en el Kardex como «Inventario inicial». Después solo cambia
--    con ingresos, salidas, traspasos o conteos.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Código por almacén --------------------------------------------------------------------------------
alter table public.producto_almacen add column if not exists codigo integer;

do $$
declare r record; v_max int;
begin
  for r in select id, codigo from public.almacen loop
    select coalesce(max(codigo), 0) into v_max from public.producto_almacen where almacen_id = r.id;
    -- los que aún no tienen código: en el orden de la maestra de su negocio (orden del Excel)
    update public.producto_almacen pa set codigo = v_max + x.n
    from (select pa2.producto_id,
                 row_number() over (order by pl.codigo nulls last, p.codigo) as n
          from public.producto_almacen pa2
          join public.almacen a on a.id = pa2.almacen_id
          join public.producto p on p.id = pa2.producto_id
          left join public.producto_local pl on pl.producto_id = pa2.producto_id and pl.local_id = a.local_id
          where pa2.almacen_id = r.id and pa2.codigo is null) x
    where pa.almacen_id = r.id and pa.producto_id = x.producto_id;
    insert into public.correlativo (serie, ultimo)
    values ('ALM-' || r.codigo, (select coalesce(max(codigo), 0) from public.producto_almacen where almacen_id = r.id))
    on conflict (serie) do update set ultimo = greatest(public.correlativo.ultimo, excluded.ultimo);
  end loop;
end $$;
create unique index if not exists ux_producto_almacen_codigo on public.producto_almacen (almacen_id, codigo);

-- Al agregar un producto a un almacén recibe el siguiente código de ESE almacén
create or replace function public.fn_producto_almacen_codigo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.codigo is null then
    new.codigo := fn_siguiente_numero('ALM-' || (select codigo from almacen where id = new.almacen_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_producto_almacen_codigo on public.producto_almacen;
create trigger trg_producto_almacen_codigo before insert on public.producto_almacen
  for each row execute function public.fn_producto_almacen_codigo();

-- Si a un almacén le llega stock de un producto que no tenía (traspaso, ingreso, compra): se agrega solo,
-- a su almacén (con su código) y al catálogo de su negocio (maestra) si tampoco estaba
create or replace function public.fn_stock_en_almacen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into producto_local (producto_id, local_id)
  select new.producto_id, a.local_id from almacen a where a.id = new.almacen_id
  on conflict (producto_id, local_id) do nothing;
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  values (new.producto_id, new.almacen_id, 0)
  on conflict (producto_id, almacen_id) do nothing;
  return new;
end $$;

-- 2) Inventario inicial (una sola vez por producto y almacén) ------------------------------------------
-- solo se registra desde Productos (una vez): no aparece como tipo en «Registrar entrada o salida»
update public.tipo_movimiento set nombre = 'Inventario inicial', manual = false where codigo = 'stock_inicial';

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
      v_lineas := v_lineas || jsonb_build_object('producto_id', v_prod, 'cantidad', v_cant, 'costo_unitario', v_precio);
      n_reg := n_reg + 1;
    end if;
  end loop;
  if jsonb_array_length(v_lineas) > 0 then
    perform fn_registrar_movimiento('stock_inicial', p_almacen, v_lineas, now(), null, 'INV-INICIAL', 'Inventario inicial');
  end if;
  return jsonb_build_object('registrados', n_reg, 'omitidos', n_omit);
end $$;
grant execute on function public.fn_inventario_inicial(uuid, jsonb) to authenticated;

-- 3) El código del almacén en Stock e Ingresos ------------------------------------------------------
create or replace view public.v_stock with (security_invoker = true) as
select s.producto_id, s.almacen_id, a.local_id, l.codigo as local_codigo, l.nombre as local_nombre,
       a.nombre as almacen_nombre, a.tipo as almacen_tipo,
       p.codigo, p.nombre, p.tipo as producto_tipo, c.nombre as categoria, u.codigo as unidad,
       s.cantidad, s.costo_promedio, s.valor, s.ultimo_movimiento,
       pa.stock_minimo, pa.stock_maximo, pa.stock_objetivo,
       case when s.cantidad <= 0 then 'agotado'
            when pa.stock_minimo > 0 and s.cantidad <= pa.stock_minimo then 'critico'
            when pa.stock_maximo is not null and s.cantidad > pa.stock_maximo then 'exceso'
            else 'normal' end as estado,
       p.imagen_url,
       pa.codigo as codigo_almacen
from public.stock s
join public.producto p on p.id = s.producto_id
join public.almacen a on a.id = s.almacen_id
join public.local l on l.id = a.local_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id
left join public.producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
where p.activo;

create or replace view public.v_ingreso_almacen with (security_invoker = true) as
select d.id, c.id as compra_id, c.numero, c.sin_orden, c.local_id, l.codigo as local_codigo,
       c.almacen_id, a.nombre as almacen, coalesce(c.fecha_entrega, c.fecha::timestamptz) as fecha_ingreso,
       c.proveedor_id, pr.razon_social as proveedor, c.tipo_documento, c.numero_documento, c.total_documento,
       d.producto_id, coalesce(p.nombre, d.descripcion) as producto, p.codigo as producto_codigo, p.marca, p.presentacion,
       coalesce(u.codigo, d.unidad_texto, 'UND') as unidad, (d.producto_id is null) as fuera_de_catalogo,
       d.cantidad_solicitada, coalesce(d.cantidad_recibida, 0) as cantidad, d.precio_unitario, d.precio_orden,
       round(coalesce(d.cantidad_recibida, 0) * d.precio_unitario, 2) as total,
       (d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencia_precio,
       d.precio_anterior,
       round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) as variacion_pct,
       us.nombre as recibido_por,
       pa.codigo as codigo_almacen
from public.compra_detalle d
join public.compra c on c.id = d.compra_id
join public.local l on l.id = c.local_id
join public.almacen a on a.id = c.almacen_id
left join public.producto p on p.id = d.producto_id
left join public.unidad_medida u on u.id = p.unidad_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.usuario us on us.id = c.recibido_por
left join public.producto_almacen pa on pa.producto_id = d.producto_id and pa.almacen_id = c.almacen_id
where c.estado = 'recibida';

-- Verificación
select a.nombre as almacen, count(*) as productos, min(pa.codigo) as desde, max(pa.codigo) as hasta
from public.producto_almacen pa join public.almacen a on a.id = pa.almacen_id
group by a.nombre order by 1;
