-- =============================================================================
--  21_productos_por_almacen.sql
--  Catálogo principal → negocio (Las Flores / Umaru) → almacén (Almacén 01 / Almacén 02 — Cocina).
--  · Cada producto queda marcado en el/los almacén(es) donde se usa (producto_almacen).
--    Carga de Tumisoft: donde tenía stock; los que no tenían stock en ninguno, en los dos
--    (aparecen en los dos Excel).
--  · Si a un almacén le llega stock de un producto que no tenía (compra, ingreso, traspaso),
--    el producto se agrega solo a ese almacén.
--  · El TIPO del producto (que usan por dentro los controles de carnes y bebidas) se deduce
--    de su CATEGORÍA: el formulario solo pide la categoría.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Productos por almacén (Las Flores) -----------------------------------------------------------
do $$
declare v_a1 uuid; v_a2 uuid;
begin
  select id into v_a1 from almacen where codigo = 'ALM-LF';
  select id into v_a2 from almacen where codigo = 'ALM2-LF';
  if v_a1 is null or v_a2 is null then return; end if;

  -- solo están en el Almacén 02 — Cocina: se quitan del 01 (si nadie les puso un mínimo)
  delete from producto_almacen pa
   where pa.almacen_id = v_a1 and coalesce(pa.stock_minimo, 0) = 0 and pa.stock_maximo is null and pa.ubicacion is null
     and not exists (select 1 from stock s where s.producto_id = pa.producto_id and s.almacen_id = v_a1 and s.cantidad > 0)
     and exists (select 1 from stock s where s.producto_id = pa.producto_id and s.almacen_id = v_a2 and s.cantidad > 0);

  -- con stock en cada almacén
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select s.producto_id, s.almacen_id, 0 from stock s
   where s.almacen_id in (v_a1, v_a2) and s.cantidad > 0
  on conflict (producto_id, almacen_id) do nothing;

  -- sin stock en ninguno (vienen en los dos Excel): en los dos almacenes
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  select pl.producto_id, a.id, 0
  from producto_local pl join local l on l.id = pl.local_id and l.codigo = 'LF'
  cross join (values (v_a1), (v_a2)) a(id)
  where not exists (select 1 from stock s where s.producto_id = pl.producto_id and s.almacen_id in (v_a1, v_a2) and s.cantidad > 0)
  on conflict (producto_id, almacen_id) do nothing;
end $$;

-- 2) Al llegar stock a un almacén, el producto pasa a ser de ese almacén ----------------------------
create or replace function public.fn_stock_en_almacen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into producto_almacen (producto_id, almacen_id, stock_minimo)
  values (new.producto_id, new.almacen_id, 0)
  on conflict (producto_id, almacen_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_stock_en_almacen on public.stock;
create trigger trg_stock_en_almacen after insert on public.stock
  for each row execute function public.fn_stock_en_almacen();

-- Ya no se asigna solo al almacén principal al marcar el negocio: el almacén se elige al crear el producto
drop trigger if exists trg_producto_local_minimo on public.producto_local;

-- 3) Tipo según la categoría ---------------------------------------------------------------------------
alter table public.categoria add column if not exists tipo_producto text;
update public.categoria c set tipo_producto = v.tipo
from (values ('Abarrotes', 'insumo'), ('Infusiones y café', 'insumo'), ('Bebidas', 'bebida'), ('Carnes y viandas', 'carne'),
             ('Limpieza', 'limpieza'), ('Descartables y empaques', 'suministro'), ('Útiles de oficina', 'suministro'),
             ('Botiquín y cuidado', 'suministro'), ('Uniformes', 'utensilio'), ('Utensilios', 'utensilio'),
             ('Vajilla y menaje', 'activo'), ('Equipos y activos', 'activo')) v(nombre, tipo)
where c.nombre = v.nombre and c.padre_id is null;

create or replace function public.fn_producto_tipo_por_categoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tipo := coalesce(
    (select coalesce(c.tipo_producto, p.tipo_producto) from categoria c left join categoria p on p.id = c.padre_id where c.id = new.categoria_id),
    new.tipo, 'insumo');
  return new;
end $$;
drop trigger if exists trg_producto_tipo on public.producto;
create trigger trg_producto_tipo before insert or update of categoria_id on public.producto
  for each row execute function public.fn_producto_tipo_por_categoria();

-- los ya cargados quedan con el tipo de su categoría
update public.producto p set tipo = coalesce(c.tipo_producto, pc.tipo_producto)
from public.categoria c left join public.categoria pc on pc.id = c.padre_id
where c.id = p.categoria_id and coalesce(c.tipo_producto, pc.tipo_producto) is not null
  and p.tipo is distinct from coalesce(c.tipo_producto, pc.tipo_producto);

-- Verificación
select a.nombre as almacen, count(*) as productos
from public.producto_almacen pa join public.almacen a on a.id = pa.almacen_id
where a.codigo in ('ALM-LF', 'ALM2-LF') group by a.nombre order by 1;
