-- =============================================================================
-- 84 · Almacén 02 — Cocina Las Flores: 3 productos creados el 23/11 que ya existían en el catálogo
--
-- Pedido del usuario (2026-11-24): se usa el producto del catálogo (nombre bien escrito) y se eliminan los creados.
--   #139 ORGINZADOR DE CUBIERTOS      → ORGANIZADORES DE CUBIERTOS
--   #153 DOCIFICADOR                  → DOSIFICADOR
--   #155 PINZA PARA DESHUESAR PESCADO → PINZA PARA HUESO DE PESCADO
-- El stock inicial ya cargado PASA al producto del catálogo (misma cantidad, precio, fecha y N° de entrada en el
-- Kardex), con el mismo código del Almacén 02 (139, 153, 155). El original se quita del Almacén 01, donde no tenía
-- stock (solo figuraba pendiente). Seguridad: solo si los nombres coinciden y ninguno de los dos tiene otros
-- movimientos; si no, se avisa y no se toca. Se puede volver a ejecutar.
-- =============================================================================
do $$
declare r record; v_alm2 uuid; v_alm1 uuid; v_nuevo uuid; v_orig uuid; v_pa record; n_ok int := 0;
begin
  select id into v_alm2 from almacen where codigo = 'ALM2-LF';
  select id into v_alm1 from almacen where codigo = 'ALM-LF';
  -- la línea del stock inicial cambia de producto: se desactiva SOLO aquí la protección del Kardex
  execute 'alter table public.movimiento_detalle disable trigger trg_movdet_inmutable';
  for r in select * from (values
      (139, 'ORGINZADOR DE CUBIERTOS', 'ORGANIZADORES DE CUBIERTOS'),
      (153, 'DOCIFICADOR', 'DOSIFICADOR'),
      (155, 'PINZA PARA DESHUESAR PESCADO', 'PINZA PARA HUESO DE PESCADO')
    ) as t(codigo, nuevo, original) loop
    v_nuevo := null; v_orig := null;
    select p.id into v_nuevo from producto_almacen pa join producto p on p.id = pa.producto_id
     where pa.almacen_id = v_alm2 and pa.codigo = r.codigo and upper(btrim(regexp_replace(p.nombre, '\s+', ' ', 'g'))) = r.nuevo;
    select p.id into v_orig from producto p join producto_local pl on pl.producto_id = p.id
      join local l on l.id = pl.local_id and l.codigo = 'LF'
     where upper(btrim(regexp_replace(p.nombre, '\s+', ' ', 'g'))) = r.original and p.activo limit 1;
    if v_nuevo is null or v_orig is null then raise notice 'No encontrado (no se toca): % / %', r.nuevo, r.original; continue; end if;
    if exists (select 1 from movimiento_detalle d join movimiento m on m.id = d.movimiento_id where d.producto_id = v_nuevo and m.tipo <> 'stock_inicial')
       or exists (select 1 from movimiento_detalle where producto_id = v_orig)
       or exists (select 1 from stock where producto_id = v_orig)
       or exists (select 1 from compra_detalle where producto_id in (v_nuevo, v_orig))
       or exists (select 1 from requerimiento_detalle where producto_id in (v_nuevo, v_orig))
       or exists (select 1 from traslado_detalle where producto_id in (v_nuevo, v_orig)) then
      raise notice 'Tiene movimientos (no se toca, revisar a mano): % / %', r.nuevo, r.original; continue;
    end if;

    -- el original entra al Almacén 02 con el código y los parámetros que tenía el creado
    select * into v_pa from producto_almacen where producto_id = v_nuevo and almacen_id = v_alm2;
    delete from producto_almacen where producto_id = v_nuevo and almacen_id = v_alm2;
    insert into producto_almacen (producto_id, almacen_id, codigo, stock_minimo, dias_aviso_vencimiento)
    values (v_orig, v_alm2, v_pa.codigo, v_pa.stock_minimo, v_pa.dias_aviso_vencimiento)
    on conflict (producto_id, almacen_id) do nothing;

    -- su stock inicial pasa al original (misma entrada del Kardex, mismo lote y mismo stock)
    update movimiento_detalle set producto_id = v_orig where producto_id = v_nuevo;
    update lote set producto_id = v_orig where producto_id = v_nuevo;
    update stock set producto_id = v_orig where producto_id = v_nuevo;
    update precio_historial set producto_id = v_orig where producto_id = v_nuevo;
    update producto set costo_referencia = (select costo_referencia from producto where id = v_nuevo)
     where id = v_orig and coalesce(costo_referencia, 0) = 0;

    -- el original sale del Almacén 01 (ahí no tenía stock) y el creado se elimina
    delete from producto_almacen where producto_id = v_orig and almacen_id = v_alm1
       and not exists (select 1 from stock where producto_id = v_orig and almacen_id = v_alm1);
    delete from producto_almacen where producto_id = v_nuevo;
    delete from producto_local where producto_id = v_nuevo;
    delete from producto where id = v_nuevo;
    n_ok := n_ok + 1;
    raise notice 'Unificado: % → % (Almacén 02 #%)', r.nuevo, r.original, r.codigo;
  end loop;
  execute 'alter table public.movimiento_detalle enable trigger trg_movdet_inmutable';
  raise notice 'Productos unificados: % de 3', n_ok;
end $$;

-- Verificación: los 3 del catálogo en el Almacén 02 con su stock; y la protección del Kardex activa («O»)
select pa.codigo, p.nombre, s.cantidad as stock
  from producto_almacen pa join producto p on p.id = pa.producto_id
  left join stock s on s.producto_id = p.id and s.almacen_id = pa.almacen_id
 where pa.almacen_id = (select id from almacen where codigo = 'ALM2-LF') and pa.codigo in (139, 153, 155) order by pa.codigo;
select tgname, tgenabled from pg_trigger where tgname = 'trg_movdet_inmutable';
