-- =============================================================================
-- 87 · Reportes del almacén en Excel: una fila por producto, con la cantidad exacta del sistema
--
-- · fn_reporte_stock: el stock de HOY de cada producto (lo mismo que muestra Inventario), también en su
--   presentación grande («2 sacos + 30 KG»), ordenado como el almacén físico (zona → categoría → producto).
-- · fn_reporte_resumen: por producto, en el periodo: stock al inicio, entradas, salidas y stock al final
--   (inicio + entradas − salidas = final). Solo los productos con stock o movimientos.
-- Las dos respetan el almacén elegido (o todos los del negocio) y los permisos de quien consulta.
-- =============================================================================

-- «2 sacos + 30 KG» (vacío si no tiene presentación o no llega a una)
create or replace function public.fn_en_presentacion(p_cantidad numeric, p_unidad text, p_presentacion text, p_trae numeric)
returns text language sql immutable as $$
  select case when p_presentacion is null or coalesce(p_trae, 0) <= 0 or abs(p_cantidad) < p_trae then null
    else trunc(p_cantidad / p_trae)::text || ' ' || lower(p_presentacion) || case when trunc(p_cantidad / p_trae) = 1 then '' else 's' end
         || case when p_cantidad - trunc(p_cantidad / p_trae) * p_trae <> 0
                 then ' + ' || trim(to_char(p_cantidad - trunc(p_cantidad / p_trae) * p_trae, 'FM999999990.###')) || ' ' || p_unidad else '' end
  end
$$;

create or replace function public.fn_reporte_stock(p_local uuid, p_almacen uuid default null)
returns table(almacen text, codigo bigint, producto text, zona text, categoria text, unidad text, stock numeric,
              en_presentacion text, costo_promedio numeric, valor numeric, minimo numeric, estado text)
language sql stable security invoker set search_path = public as $$
  select s.almacen_nombre, s.codigo_almacen, s.nombre,
         case s.zona when 'alimentos' then 'Alimentos y bebidas' when 'contacto' then 'Contacto con alimentos'
                     when 'quimicos' then 'Limpieza y químicos' when 'no_alimentarios' then 'No alimentarios' else 'Sin zona' end,
         s.categoria, s.unidad, s.cantidad,
         fn_en_presentacion(s.cantidad, s.unidad, s.presentacion, s.presentacion_cantidad),
         s.costo_promedio, s.valor, s.stock_minimo,
         case s.estado when 'agotado' then 'Agotado' when 'critico' then 'Por reponer' when 'exceso' then 'Exceso' else 'Normal' end
  from v_stock s
  where s.local_id = p_local and s.almacen_tipo = 'almacen' and (p_almacen is null or s.almacen_id = p_almacen)
  order by s.almacen_nombre,
           case s.zona when 'alimentos' then 1 when 'contacto' then 2 when 'quimicos' then 3 when 'no_alimentarios' then 4 else 5 end,
           s.categoria nulls last, s.nombre
$$;

create or replace function public.fn_reporte_resumen(p_local uuid, p_almacen uuid, p_desde date, p_hasta date)
returns table(almacen text, codigo bigint, producto text, categoria text, unidad text,
              stock_inicio numeric, entradas numeric, salidas numeric, stock_final numeric, costo_promedio numeric, valor_final numeric)
language sql stable security invoker set search_path = public as $$
  with rango as (
    select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ), mov as (
    -- cada línea vigente de los almacenes del negocio (o del elegido), con su signo
    select m.almacen_id, d.producto_id, t.signo, d.cantidad, m.fecha
    from movimiento m join movimiento_detalle d on d.movimiento_id = m.id join tipo_movimiento t on t.codigo = m.tipo
    join almacen a on a.id = m.almacen_id and a.tipo = 'almacen'
    where not m.anulado and m.local_id = p_local and (p_almacen is null or m.almacen_id = p_almacen)
      and m.fecha < (select fin from rango)
  ), r as (
    select almacen_id, producto_id,
           coalesce(sum(signo * cantidad) filter (where fecha < (select ini from rango)), 0) as inicio,
           coalesce(sum(cantidad) filter (where signo > 0 and fecha >= (select ini from rango)), 0) as entradas,
           coalesce(sum(cantidad) filter (where signo < 0 and fecha >= (select ini from rango)), 0) as salidas
    from mov group by almacen_id, producto_id
  )
  select a.nombre, pa.codigo, p.nombre, c.nombre, u.codigo,
         r.inicio, r.entradas, r.salidas, r.inicio + r.entradas - r.salidas,
         coalesce(s.costo_promedio, 0), round((r.inicio + r.entradas - r.salidas) * coalesce(s.costo_promedio, 0), 2)
  from r
  join almacen a on a.id = r.almacen_id
  join producto p on p.id = r.producto_id
  join unidad_medida u on u.id = p.unidad_id
  left join categoria c on c.id = p.categoria_id
  left join producto_almacen pa on pa.producto_id = r.producto_id and pa.almacen_id = r.almacen_id
  left join stock s on s.producto_id = r.producto_id and s.almacen_id = r.almacen_id
  where r.inicio <> 0 or r.entradas <> 0 or r.salidas <> 0
  order by a.nombre, c.nombre nulls last, p.nombre
$$;

grant execute on function public.fn_en_presentacion(numeric, text, text, numeric) to authenticated;
grant execute on function public.fn_reporte_stock(uuid, uuid) to authenticated;
grant execute on function public.fn_reporte_resumen(uuid, uuid, date, date) to authenticated;
