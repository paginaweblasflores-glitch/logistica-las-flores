-- =============================================================================
-- 82 · Las Flores con un tercer almacén: «Almacén 03 — Las Flores»
--
-- · Se reutiliza el antiguo «Almacén 03 — Activos y equipos» (ACT-LF), que estaba desactivado y vacío
--   (sin productos, stock ni movimientos): pasa a «Almacén 03 — Las Flores» (ALM3-LF), almacén normal y activo.
--   Así no quedan dos «Almacén 03». Lo maneja el mismo usuario del almacén de Las Flores.
-- · Sus productos son los 26 de doc/almacen3.xlsx, en el orden del Excel (código 1 a 26 de ese almacén):
--   los que ya están en el catálogo de Las Flores se agregan; los que solo existen en Umaru reciben su copia
--   en Las Flores (mismo código maestro, categoría y unidad); los demás se crean nuevos.
-- · Sin stock: el almacén registra su stock inicial. Se puede volver a ejecutar (no duplica).
-- =============================================================================
do $$
declare
  v_lf uuid; v_alm3 uuid; v_und uuid; v_id uuid; r record; o record;
  n_ya int := 0; n_copias int := 0; n_nuevos int := 0;
begin
  select id into v_lf from local where codigo = 'LF';
  select id into v_und from unidad_medida where codigo = 'UND';
  if v_lf is null then raise exception 'No existe el negocio Restaurante Las Flores (LF).'; end if;

  -- el Almacén 03 antiguo (vacío) pasa a ser un almacén normal; si no existiera, se crea
  update almacen set codigo = 'ALM3-LF', nombre = 'Almacén 03 — Las Flores', tipo = 'almacen', activo = true
   where codigo = 'ACT-LF'
     and not exists (select 1 from producto_almacen pa where pa.almacen_id = almacen.id)
     and not exists (select 1 from movimiento m where m.almacen_id = almacen.id);
  insert into almacen (local_id, codigo, nombre, tipo, es_principal, activo)
  values (v_lf, 'ALM3-LF', 'Almacén 03 — Las Flores', 'almacen', false, true)
  on conflict (codigo) do update set nombre = excluded.nombre, tipo = 'almacen', activo = true
  returning id into v_alm3;

  create temp table _alm3 (n int, nombre text, tipo text, categoria text) on commit drop;
  insert into _alm3 values
    (1, 'BOLETA DE PAGO', 'suministro', 'Descartables y empaques'),
    (2, 'BOTELLA PERSONAL 350 ML', 'suministro', 'Descartables y empaques'),
    (3, 'VASO ACRILICO 3 ONZAS', 'suministro', 'Descartables y empaques'),
    (4, 'VASO ACRILICOS DE 7 ONZAS', 'suministro', 'Descartables y empaques'),
    (5, 'ARCHIVADORES', 'suministro', 'Descartables y empaques'),
    (6, 'BOTELLAS DELIVERY 1 LT', 'suministro', 'Descartables y empaques'),
    (7, 'BOTELLA TAXISTA 800 ML', 'suministro', 'Descartables y empaques'),
    (8, 'VASO ACRILICO 10 ONZAS', 'suministro', 'Descartables y empaques'),
    (9, 'ARCHIVADOR MEDIANO', 'suministro', 'Útiles de oficina'),
    (10, 'TINA GRANDE', 'utensilio', 'Utensilios'),
    (11, 'SORBETE GRANDE', 'suministro', 'Descartables y empaques'),
    (12, 'VASO POLIPAPEL TAPA DOMO HELADO', 'suministro', 'Descartables y empaques'),
    (13, 'CUCHARITAS MEDIANA POSTRE', 'suministro', 'Descartables y empaques'),
    (14, 'VASO TAPA PLANA PANACOTA', 'suministro', 'Descartables y empaques'),
    (15, 'TINA PEQUEÑA', 'utensilio', 'Utensilios'),
    (16, 'VASO ACRILICO DE 5 OZ', 'suministro', 'Descartables y empaques'),
    (17, 'VASO ACRILICO DE 12 OZ', 'suministro', 'Descartables y empaques'),
    (18, 'VASO POLIPAPEL LAS FLORES', 'suministro', 'Descartables y empaques'),
    (19, 'VASO POLIPAPEL CAFE', 'suministro', 'Descartables y empaques'),
    (20, 'BOLSAS EMPAQUE AL VACIO 15X25', 'suministro', 'Descartables y empaques'),
    (21, 'BOLSAS EMPAQUE AL VACIO 24X38', 'suministro', 'Descartables y empaques'),
    (22, 'BOLSAS EMPAQUE AL VACIO 20X22', 'suministro', 'Descartables y empaques'),
    (23, 'BOLSAS EMPAQUE AL VACIO 15X20', 'suministro', 'Descartables y empaques'),
    (24, 'BOLSAS EMPAQUE AL VACIO 20X33', 'suministro', 'Descartables y empaques'),
    (25, 'VASO TAPA DOMO TAXISTA', 'suministro', 'Descartables y empaques'),
    (26, 'VASO DE LICUADORA', 'suministro', 'Descartables y empaques');

  for r in select * from _alm3 order by n loop
    -- ¿ya está en el catálogo de Las Flores? (se agrega a este almacén, no se duplica)
    select p.id into v_id from producto p join producto_local pl on pl.producto_id = p.id and pl.local_id = v_lf
     where upper(btrim(regexp_replace(p.nombre, '\s+', ' ', 'g'))) = upper(r.nombre) limit 1;
    if v_id is not null then
      n_ya := n_ya + 1;
    else
      -- solo existe en Umaru: Las Flores recibe su copia con los mismos datos y el mismo código maestro
      select p.* into o from producto p join producto_local pl on pl.producto_id = p.id
        join local l on l.id = pl.local_id and l.codigo = 'UM'
       where upper(btrim(regexp_replace(p.nombre, '\s+', ' ', 'g'))) = upper(r.nombre) limit 1;
      if o.id is not null then
        insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, marca, presentacion, es_perecible, controla_lote,
                              costo_referencia, maestro_id, presentacion_id, presentacion_cantidad)
        values ('P-' || lpad(fn_siguiente_numero('PROD')::text, 5, '0'), r.nombre, o.tipo, o.categoria_id, o.unidad_id, o.marca,
                o.presentacion, o.es_perecible, o.controla_lote, 0, o.maestro_id, o.presentacion_id, o.presentacion_cantidad)
        returning id into v_id;
        n_copias := n_copias + 1;
      else
        insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, controla_lote, costo_referencia)
        values ('P-' || lpad(fn_siguiente_numero('PROD')::text, 5, '0'), r.nombre, r.tipo,
                (select id from categoria where nombre = r.categoria and padre_id is null limit 1), v_und, true, 0)
        returning id into v_id;
        n_nuevos := n_nuevos + 1;
      end if;
      o := null;
      insert into producto_local (producto_id, local_id) values (v_id, v_lf) on conflict do nothing;
    end if;
    -- en el Almacén 03 (su código 1, 2, 3… lo pone la base en el orden del Excel)
    insert into producto_almacen (producto_id, almacen_id, stock_minimo) values (v_id, v_alm3, 0)
    on conflict (producto_id, almacen_id) do nothing;
    v_id := null;
  end loop;
  raise notice 'Almacén 03 — Las Flores: % ya estaban en Las Flores, % copiados de Umaru, % nuevos', n_ya, n_copias, n_nuevos;
end $$;

-- Verificación: Almacén 03 — Las Flores = 26 productos (códigos 1 a 26)
select a.codigo, a.nombre, a.activo, count(pa.producto_id) as productos, min(pa.codigo) as primer_codigo, max(pa.codigo) as ultimo_codigo
  from almacen a left join producto_almacen pa on pa.almacen_id = a.id
 where a.local_id = (select id from local where codigo = 'LF') and a.tipo = 'almacen'
 group by a.codigo, a.nombre, a.activo order by a.nombre;
