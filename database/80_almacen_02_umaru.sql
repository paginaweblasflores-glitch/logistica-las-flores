-- =============================================================================
-- 80 · Hotel Umaru con dos almacenes, como Las Flores (Almacén 01 y Almacén 02)
--
-- · El almacén actual pasa a llamarse «Almacén 01 — Hotel Umaru» (mismo código ALM-UM: no cambia nada más).
-- · Se crea «Almacén 02 — Hotel Umaru» (ALM2-UM) con los 36 productos de doc/umaru.xlsx (limpieza y aseo),
--   en el orden del Excel: código 1 a 36 de ese almacén.
-- · Cada negocio tiene su propia copia del producto: si ya existe en Las Flores, la copia de Umaru hereda sus datos
--   (categoría, unidad, presentación) y comparte su código maestro; los 3 que no existen en ningún catálogo
--   se crean nuevos (Hipoclorito de calcio al 70 %, Botellas delivery 1 LT, Spray aromatizante).
-- · Sin stock: el almacén registra su stock inicial. Se puede volver a ejecutar (no duplica).
-- =============================================================================
do $$
declare
  v_um uuid; v_alm2 uuid; v_und uuid; v_id uuid; r record; lf record; n_nuevos int := 0; n_copias int := 0; n_ya int := 0;
begin
  select id into v_um from local where codigo = 'UM';
  select id into v_und from unidad_medida where codigo = 'UND';
  if v_um is null then raise exception 'No existe el negocio Hotel Umaru (UM).'; end if;

  -- Almacén 01: solo el nombre (como «Almacén 01 — Las Flores»)
  update almacen set nombre = 'Almacén 01 — Hotel Umaru' where codigo = 'ALM-UM';

  -- Almacén 02
  insert into almacen (local_id, codigo, nombre, tipo, es_principal, activo)
  values (v_um, 'ALM2-UM', 'Almacén 02 — Hotel Umaru', 'almacen', false, true)
  on conflict (codigo) do update set nombre = excluded.nombre, activo = true
  returning id into v_alm2;

  create temp table _um2 (n int, nombre text, tipo text, categoria text) on commit drop;
  insert into _um2 values
    (1, 'GUANTES CORRUGADO T7', null, null),
    (2, 'GUANTES QUIRÚRGICOS T(M)', null, null),
    (3, 'MASCARILLAS DESECHABLES', null, null),
    (4, 'SECADOR COLORES', null, null),
    (5, 'REDECILLAS DESECHABLES', null, null),
    (6, 'AYUDÍN LÍQUIDO 4 LT', null, null),
    (7, 'BALDE CON REJILLA', null, null),
    (8, 'ESCOBA', null, null),
    (9, 'ESCOBILLAS ROPA', null, null),
    (10, 'ESPONJA VASO', null, null),
    (11, 'ESPONJA METAL', null, null),
    (12, 'HIPOCLORITO DE CALCIO AL 70%', 'limpieza', 'Limpieza'),
    (13, 'JABÓN EN BARRA', null, null),
    (14, 'JABÓN LIQUÍDO PEQUEÑO', null, null),
    (15, 'JABÓN LIQUIDO 5 LT', null, null),
    (16, 'JALADOR DE AGUA', null, null),
    (17, 'LAVA VAJILLAS 1 KG PASTA', null, null),
    (18, 'LEJÌA 5 LT', null, null),
    (19, 'LIMPIA VIDRIOS 4 LT', null, null),
    (20, 'SPRAY MATA ÁCAROS', null, null),
    (21, 'RECOGEDOR', null, null),
    (22, 'SPRAY MATA MOSCA', null, null),
    (23, 'TRAPEADOR MOPA', null, null),
    (24, 'TRAPEADOR TOALLA', null, null),
    (25, 'PALO DE ESCOBA', null, null),
    (26, 'SPRAY MATA TODO', null, null),
    (27, 'SPRAY ARAÑAS', null, null),
    (28, 'GUANTES CORRUGADO T8', null, null),
    (29, 'GUANTES CORRUGADO T9', null, null),
    (30, 'SECADORES BLANCOS', null, null),
    (31, 'BOTELLAS DELIVERY 1 LT', 'suministro', 'Descartables y empaques'),
    (32, 'ESPONJA BRILLO', null, null),
    (33, 'DETERGENTE X KL', null, null),
    (34, 'DETERGENTE LÍQUIDO 5 LT', null, null),
    (35, 'AMBIENTADOR (LIMPIA TODO)', null, null),
    (36, 'SPRAY AROMATIZANTE', 'limpieza', 'Limpieza');

  for r in select * from _um2 order by n loop
    -- ¿ya existe en el catálogo de Umaru? (no se duplica)
    select p.id into v_id from producto p join producto_local pl on pl.producto_id = p.id and pl.local_id = v_um
     where upper(p.nombre) = upper(r.nombre) limit 1;
    if v_id is not null then
      n_ya := n_ya + 1;
    else
      -- el de Las Flores con el mismo nombre: la copia de Umaru hereda sus datos y su código maestro
      select p.* into lf from producto p join producto_local pl on pl.producto_id = p.id
        join local l on l.id = pl.local_id and l.codigo = 'LF'
       where upper(p.nombre) = upper(r.nombre) limit 1;
      if lf.id is not null then
        insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, marca, presentacion, es_perecible, controla_lote,
                              costo_referencia, maestro_id, presentacion_id, presentacion_cantidad)
        values ('P-' || lpad(fn_siguiente_numero('PROD')::text, 5, '0'), lf.nombre, lf.tipo, lf.categoria_id, lf.unidad_id, lf.marca,
                lf.presentacion, lf.es_perecible, lf.controla_lote, 0, lf.maestro_id, lf.presentacion_id, lf.presentacion_cantidad)
        returning id into v_id;
        n_copias := n_copias + 1;
      else
        insert into producto (codigo, nombre, tipo, categoria_id, unidad_id, controla_lote, costo_referencia)
        values ('P-' || lpad(fn_siguiente_numero('PROD')::text, 5, '0'), r.nombre, coalesce(r.tipo, 'suministro'),
                (select id from categoria where nombre = r.categoria and padre_id is null limit 1), v_und, true, 0)
        returning id into v_id;
        n_nuevos := n_nuevos + 1;
      end if;
      lf := null;
      insert into producto_local (producto_id, local_id) values (v_id, v_um) on conflict do nothing;
    end if;
    -- en el Almacén 02 (su código 1, 2, 3… lo pone la base en el orden del Excel)
    insert into producto_almacen (producto_id, almacen_id, stock_minimo) values (v_id, v_alm2, 0)
    on conflict (producto_id, almacen_id) do nothing;
    v_id := null;
  end loop;
  raise notice 'Almacén 02 — Hotel Umaru: % copiados de Las Flores, % nuevos, % ya estaban en Umaru', n_copias, n_nuevos, n_ya;
end $$;

-- Verificación: Almacén 01 — Hotel Umaru = 261 y Almacén 02 — Hotel Umaru = 36
select a.nombre as almacen, count(pa.producto_id) as productos, min(pa.codigo) as primer_codigo, max(pa.codigo) as ultimo_codigo
  from almacen a left join producto_almacen pa on pa.almacen_id = a.id
 where a.codigo in ('ALM-UM', 'ALM2-UM') group by a.nombre order by a.nombre;
