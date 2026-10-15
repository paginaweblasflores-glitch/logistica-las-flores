-- =============================================================================
--  31_tendencia_de_precios.sql
--  Pedido de Fernanda (2026-10-12): los precios de compra cambian cada 3–7 días; con el historial
--  de todo el año ver por producto en qué meses baja o sube, para comprar más cuando está barato.
--  El precio sale de cada boleta que registra el almacén (precio_historial, tipo compra).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- Precio por mes de un producto: promedio, mínimo, máximo y cuántas compras (todo calculado en la base)
create or replace function public.fn_precio_mensual(p_producto uuid, p_local uuid default null)
returns table(anio int, mes int, promedio numeric, minimo numeric, maximo numeric, compras int, proveedor_mas_barato text)
language sql stable security invoker set search_path = public as $$
  with h as (
    select date_trunc('month', ph.fecha)::date as m, ph.fecha, ph.precio, pr.razon_social as proveedor
    from precio_historial ph left join proveedor pr on pr.id = ph.proveedor_id
    where ph.producto_id = p_producto and ph.tipo = 'compra' and ph.precio > 0
      and (p_local is null or ph.local_id = p_local)
  ), mes as (
    select m, round(avg(precio), 4) as promedio, min(precio) as minimo, max(precio) as maximo, count(*)::int as compras
    from h group by m
  )
  select extract(year from mes.m)::int, extract(month from mes.m)::int, mes.promedio, mes.minimo, mes.maximo, mes.compras,
         -- a quién se le compró más barato ese mes
         (select h2.proveedor from h h2 where h2.m = mes.m order by h2.precio, h2.fecha limit 1)
  from mes
  order by mes.m
$$;
grant execute on function public.fn_precio_mensual(uuid, uuid) to authenticated;

-- Verificación
select count(*) as compras_con_precio from public.precio_historial where tipo = 'compra' and precio > 0;
