-- =============================================================================
-- 95 · Hoja de conteo del almacén (PDF para imprimir y contar a mano)
--
-- TODOS los productos del almacén (también los que están en 0: a veces hay producto físico aunque el sistema
-- diga 0), con su stock de HOY y el último precio de compra, ordenados como el almacén físico:
-- zona sanitaria → categoría → producto. La usan Logística y el almacenero; las diferencias se corrigen con
-- «Ajustar» en Stock actual. No registra el conteo en el sistema.
-- =============================================================================

create or replace function public.fn_hoja_conteo(p_almacen uuid)
returns table(codigo bigint, producto text, unidad text, zona text, categoria text, stock numeric,
              en_presentacion text, ultimo_precio numeric)
language sql stable security invoker set search_path = public as $$
  select pa.codigo, p.nombre, u.codigo,
         case c.zona when 'alimentos' then 'Alimentos y bebidas' when 'contacto' then 'Contacto con alimentos'
                     when 'quimicos' then 'Limpieza y químicos' when 'no_alimentarios' then 'No alimentarios' else 'Sin zona' end,
         coalesce(c.nombre, 'Sin categoría'),
         coalesce(s.cantidad, 0),
         fn_en_presentacion(coalesce(s.cantidad, 0), u.codigo, pu.nombre, p.presentacion_cantidad),
         -- el último precio de compra (en este almacén; si nunca llegó aquí, en cualquiera del negocio)
         coalesce(
           (select d.precio_unitario from compra_detalle d join compra k on k.id = d.compra_id
             where d.producto_id = p.id and k.estado = 'recibida' and k.almacen_id = pa.almacen_id and d.precio_unitario > 0
             order by coalesce(k.fecha_entrega, k.fecha::timestamptz) desc limit 1),
           (select d.precio_unitario from compra_detalle d join compra k on k.id = d.compra_id
             where d.producto_id = p.id and k.estado = 'recibida' and k.local_id = a.local_id and d.precio_unitario > 0
             order by coalesce(k.fecha_entrega, k.fecha::timestamptz) desc limit 1))
  from producto_almacen pa
  join producto p on p.id = pa.producto_id and p.activo
  join almacen a on a.id = pa.almacen_id
  join unidad_medida u on u.id = p.unidad_id
  left join unidad_medida pu on pu.id = p.presentacion_id
  left join categoria c on c.id = p.categoria_id
  left join stock s on s.producto_id = pa.producto_id and s.almacen_id = pa.almacen_id
  where pa.almacen_id = p_almacen
  order by case c.zona when 'alimentos' then 1 when 'contacto' then 2 when 'quimicos' then 3 when 'no_alimentarios' then 4 else 5 end,
           c.nombre nulls last, p.nombre
$$;
grant execute on function public.fn_hoja_conteo(uuid) to authenticated;

-- Verificación: cuántos productos tiene la hoja de cada almacén
select a.nombre, (select count(*) from public.fn_hoja_conteo(a.id)) as productos
from public.almacen a where a.tipo = 'almacen' and a.activo order by a.nombre;
