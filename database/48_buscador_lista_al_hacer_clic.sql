-- =============================================================================
--  48_buscador_lista_al_hacer_clic.sql
--  Buscador de productos: al hacer clic (sin escribir) muestra la lista del almacén por código, con foto y stock;
--  al escribir filtra como antes. También devuelve la foto de cada producto.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

drop function if exists public.fn_buscar_productos(text, uuid, text[], int);
create or replace function public.fn_buscar_productos(
  p_texto text, p_almacen uuid default null, p_tipos text[] default null, p_limite int default 30)
returns table(id uuid, codigo text, nombre text, tipo text, costo_referencia numeric, controla_lote boolean,
              unidad text, stock numeric, rango int, unidad_id uuid, contenido numeric, contenido_unidad_id uuid, contenido_unidad text, imagen_url text)
language sql stable security invoker set search_path = public as $$
  with q as (
    select fn_normalizar(p_texto) as t,
           array_remove(string_to_array(fn_normalizar(p_texto), ' '), '') as palabras
  ), c as (
    select p.id, p.nombre, p.tipo, p.costo_referencia, p.controla_lote, p.codigo as codigo_global,
           p.nombre_busqueda as nb, pa.codigo as codigo_alm, u.codigo as unidad, p.maestro_id,
           p.imagen_url, p.unidad_id, p.contenido, p.contenido_unidad_id, (select cu.codigo from unidad_medida cu where cu.id = p.contenido_unidad_id) as contenido_unidad,
           (select s.cantidad from stock s where s.producto_id = p.id and s.almacen_id = p_almacen) as stock
    from producto p
    join unidad_medida u on u.id = p.unidad_id
    left join producto_almacen pa on pa.producto_id = p.id and pa.almacen_id = p_almacen
    where p.activo
      and (p_almacen is null or pa.producto_id is not null)
      and (p_tipos is null or p.tipo = any(p_tipos))
  ), r as (
    select c.*,
           case
             -- código exacto: el del almacén (23) o el general (P-00023)
             when (q.t ~ '^\d+$' and ((p_almacen is not null and c.codigo_alm = q.t::bigint)
                                       or (p_almacen is null and c.codigo_global = 'P-' || lpad(q.t, 5, '0'))))
                  or lower(c.codigo_global) = q.t then 0
             when left(c.nb, length(q.t)) = q.t then 1                        -- empieza con lo escrito
             when position(' ' || q.t in ' ' || c.nb) > 0 then 2               -- alguna palabra empieza
             else 3                                                            -- lo contiene
           end as rango,
           -- todas las palabras aparecen en el nombre (en cualquier orden)
           not exists (select 1 from unnest(q.palabras) w where position(w in c.nb) = 0) as en_nombre,
           c.nb = q.t as igual,
           q.t = '' as vacio   -- sin texto: toda la lista (al hacer clic en el buscador)
    from c, q
  ), u as (
    -- sin almacén (Logística, jefes de área): una sola fila por producto maestro (no repetir Las Flores y Umaru)
    select distinct on (r.maestro_id) r.* from r
    where r.rango = 0 or r.en_nombre
    order by r.maestro_id, r.rango, r.codigo_global
  )
  select u.id, coalesce(u.codigo_alm::text, u.codigo_global), u.nombre, u.tipo, u.costo_referencia, u.controla_lote,
         u.unidad, u.stock, u.rango, u.unidad_id, u.contenido, u.contenido_unidad_id, u.contenido_unidad, u.imagen_url
  from u
  -- sin texto: por código del almacén; con texto: los mejores primero y, dentro de cada grupo, por nombre
  order by u.rango, u.igual desc, case when u.vacio then u.codigo_alm end, u.nombre   -- dentro de cada grupo, en orden alfabético
  limit greatest(coalesce(p_limite, 30), 1)
$$;
grant execute on function public.fn_buscar_productos(text, uuid, text[], int) to authenticated;
