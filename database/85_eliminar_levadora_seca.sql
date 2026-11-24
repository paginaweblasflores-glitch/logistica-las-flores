-- =============================================================================
-- 85 · Eliminar #527 LEVADORA SECA (Almacén 01 — Las Flores): duplicado de #235 LEVADURA SECA INSTANT SUCCESS
--
-- Pedido del usuario (2026-11-24). Los dos tenían stock 1 (se contaba dos veces). Se borra el creado el 23/11
-- con su stock inicial; el original queda con su stock. Mismo método y protecciones que la migración 83.
-- =============================================================================
do $$
declare r record; v_id uuid; v_mov uuid; n_ok int := 0;
begin
  -- las líneas de movimiento no se borran (protección del Kardex): se desactiva SOLO durante este borrado
  -- y se vuelve a activar al final; si algo falla, la base deshace todo y la protección sigue activa
  execute 'alter table public.movimiento_detalle disable trigger trg_movdet_inmutable';
  for r in select * from (values
      ('ALM-LF', 527, 'LEVADORA SECA')
    ) as t(almacen, codigo, nombre) loop
    select p.id into v_id from producto_almacen pa join almacen a on a.id = pa.almacen_id join producto p on p.id = pa.producto_id
     where a.codigo = r.almacen and pa.codigo = r.codigo and upper(btrim(regexp_replace(p.nombre, '\s+', ' ', 'g'))) = r.nombre;
    if v_id is null then raise notice 'No encontrado (no se toca): % #% %', r.almacen, r.codigo, r.nombre; continue; end if;
    if exists (select 1 from movimiento_detalle d join movimiento m on m.id = d.movimiento_id
                where d.producto_id = v_id and m.tipo <> 'stock_inicial')
       or exists (select 1 from compra_detalle where producto_id = v_id)
       or exists (select 1 from requerimiento_detalle where producto_id = v_id)
       or exists (select 1 from traslado_detalle where producto_id = v_id) then
      raise notice 'Tiene otros movimientos (no se borra; dar de baja a mano): % #% %', r.almacen, r.codigo, r.nombre; continue;
    end if;
    -- su stock inicial: el movimiento entero si era solo de este producto; si no, solo su línea
    for v_mov in select distinct d.movimiento_id from movimiento_detalle d where d.producto_id = v_id loop
      delete from lote_consumo where detalle_id in (select id from movimiento_detalle where movimiento_id = v_mov and producto_id = v_id);
      delete from lote where movimiento_id = v_mov and producto_id = v_id;
      delete from movimiento_detalle where movimiento_id = v_mov and producto_id = v_id;
      delete from movimiento where id = v_mov and not exists (select 1 from movimiento_detalle where movimiento_id = v_mov);
    end loop;
    delete from lote where producto_id = v_id;
    delete from precio_historial where producto_id = v_id;
    delete from producto_almacen where producto_id = v_id;
    delete from stock where producto_id = v_id;
    delete from producto_local where producto_id = v_id;
    delete from producto where id = v_id;
    n_ok := n_ok + 1;
    raise notice 'Eliminado: % #% %', r.almacen, r.codigo, r.nombre;
  end loop;
  execute 'alter table public.movimiento_detalle enable trigger trg_movdet_inmutable';
  raise notice 'Productos eliminados: % de 1', n_ok;
end $$;

-- Verificación: la protección del Kardex debe quedar activa («O» = activa)
select tgname, tgenabled from pg_trigger where tgname = 'trg_movdet_inmutable';
