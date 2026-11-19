-- =============================================================================
--  74_zonas_del_almacen.sql
--  Zonas sanitarias del almacén (NTS 142-MINSA/2018/DIGESA y RM 066-2015/MINSA): los productos de limpieza y
--  químicos van separados de los alimentos. Cada categoría pertenece a una zona:
--    · alimentos        → Abarrotes, Bebidas, Infusiones y café
--    · contacto         → Descartables y empaques, Utensilios (materiales en contacto con alimentos)
--    · quimicos         → Limpieza, Plaguicidas
--    · no_alimentarios  → Útiles de oficina, Uniformes, Equipos y activos, Botiquín y cuidado, Varios
--  Una categoría nueva queda «sin zona» hasta que Logística la asigne en Configuración.
--  Además, la revisión de la clasificación aprobada el 2026-11-19: categorías nuevas Plaguicidas y Varios,
--  y 24 productos que cambian de categoría (Las Flores y Umaru a la vez: se busca por nombre).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) La zona de cada categoría
alter table public.categoria add column if not exists zona text;
do $$ begin
  alter table public.categoria add constraint ck_categoria_zona check (zona in ('alimentos', 'contacto', 'quimicos', 'no_alimentarios'));
exception when duplicate_object then null; end $$;

do $$
begin
  -- 2) Categorías nuevas
  insert into public.categoria (nombre)
  select v.nombre from (values ('Plaguicidas'), ('Varios')) v(nombre)
  where not exists (select 1 from public.categoria c where c.nombre = v.nombre and c.padre_id is null);

  update public.categoria set zona = 'alimentos'       where padre_id is null and nombre in ('Abarrotes', 'Bebidas', 'Infusiones y café', 'Carnes y viandas');
  update public.categoria set zona = 'contacto'        where padre_id is null and nombre in ('Descartables y empaques', 'Utensilios', 'Vajilla y menaje');
  update public.categoria set zona = 'quimicos'        where padre_id is null and nombre in ('Limpieza', 'Plaguicidas');
  update public.categoria set zona = 'no_alimentarios' where padre_id is null and nombre in ('Útiles de oficina', 'Uniformes', 'Equipos y activos', 'Botiquín y cuidado', 'Varios');
  -- las subcategorías siguen a su categoría
  update public.categoria h set zona = p.zona from public.categoria p where h.padre_id = p.id and h.zona is null;

  -- 3) Productos que cambian de categoría
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Abarrotes' and padre_id is null), updated_at = now()
   where nombre in ('BALDE DE MANJAR BLANQUITO (BAZO VELARDE)');
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Limpieza' and padre_id is null), updated_at = now()
   where nombre in ('GUANTES CORRUGADO T7', 'GUANTES CORRUGADO T8', 'GUANTES CORRUGADO T9', 'BOLSA NEGRA 20X30', 'BOLSA NEGRA 26X40');
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Uniformes' and padre_id is null), updated_at = now()
   where nombre in ('REDECILLAS DESECHABLES');
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Útiles de oficina' and padre_id is null), updated_at = now()
   where nombre in ('CUTTER');
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Plaguicidas' and padre_id is null), updated_at = now()
   where nombre in ('SPRAY ARAÑAS', 'SPRAY CUCARACHA', 'SPRAY MATA ÁCAROS', 'SPRAY MATA MOSCA', 'SPRAY MATA PULGAS', 'SPRAY MATA TODO', 'VENENO PARA RATA', 'PEGA MOSCA');
  update public.producto set categoria_id = (select id from public.categoria where nombre = 'Varios' and padre_id is null), updated_at = now()
   where nombre in ('FOSFORO', 'PELOTITAS DE PING PONG', 'VELA GRANDE', 'VELA PEQUEÑA', 'PAVILO', 'ENCENDEDOR MOZO', 'ENSENDEDOR COCINA', 'GANCHO REYPLAST DE ROPA');
end $$;

-- 4) La zona en las vistas del stock y del catálogo (al final: una vista solo suma columnas al final)
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
       pa.codigo as codigo_almacen,
       c.zona
from public.stock s
join public.producto p on p.id = s.producto_id
join public.almacen a on a.id = s.almacen_id
join public.local l on l.id = a.local_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id
left join public.producto_almacen pa on pa.producto_id = s.producto_id and pa.almacen_id = s.almacen_id
where p.activo;

create or replace view public.v_catalogo_almacen with (security_invoker = true) as
select pa.almacen_id, a.local_id, a.nombre as almacen,
       pa.codigo as codigo_almacen, p.id as producto_id, p.nombre, c.nombre as categoria, u.nombre as unidad,
       p.marca, p.costo_referencia, p.activo,
       case when exists (select 1 from public.stock s where s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id)
            then 'Listo' else 'Pendiente' end as stock_inicial,
       c.zona
from public.producto_almacen pa
join public.producto p on p.id = pa.producto_id
join public.almacen a on a.id = pa.almacen_id
join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria c on c.id = p.categoria_id;
grant select on public.v_catalogo_almacen to authenticated;

-- Verificación: productos por zona y categoría
select coalesce(c.zona, 'sin zona') as zona, c.nombre as categoria, count(p.id) as productos
  from public.categoria c left join public.producto p on p.categoria_id = c.id
 where c.padre_id is null
 group by 1, 2 order by 1, 2;
