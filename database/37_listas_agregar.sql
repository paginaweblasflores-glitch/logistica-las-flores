-- =============================================================================
--  37_listas_agregar.sql
--  Listas desplegables con «Agregar…»: si lo escrito no existe, se guarda en su catálogo y la próxima vez
--  ya sale en la lista. Solo en: categoría, área, personal y ciudad (lo demás solo se elige).
--  Si ya existe con otra forma de escribirlo (mayúsculas, tildes, plural), devuelve el que ya hay.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_catalogo_agregar(p_tipo text, p_nombre text, p_local uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_n text; v_id uuid; v_txt text;
begin
  if not (fn_puede('maestros', 'escribir') or fn_es_almacen()
          or (p_tipo = 'area' and fn_puede('requerimientos', 'escribir'))) then
    raise exception 'No autorizado';
  end if;
  if p_local is not null and not fn_tiene_local(p_local) then raise exception 'No autorizado para ese negocio'; end if;
  if length(v_nombre) < 3 or length(v_nombre) > 60 then raise exception 'Escriba el nombre (de 3 a 60 letras)'; end if;
  v_n := fn_normalizar(v_nombre);
  -- «Cocina» y «cocinas», «Ayacucho» y «AYACUCHO» son lo mismo
  v_n := regexp_replace(v_n, '(es|s)$', '');

  if p_tipo = 'categoria' then
    select c.id, case when pa.nombre is null then c.nombre else pa.nombre || ' › ' || c.nombre end into v_id, v_txt
    from categoria c left join categoria pa on pa.id = c.padre_id
    where regexp_replace(fn_normalizar(c.nombre), '(es|s)$', '') = v_n limit 1;
    if v_id is null then
      insert into categoria (nombre) values (upper(left(v_nombre, 1)) || substr(v_nombre, 2)) returning id, nombre into v_id, v_txt;
    end if;

  elsif p_tipo = 'area' then
    select id, nombre into v_id, v_txt from area
    where regexp_replace(fn_normalizar(nombre), '(es|s)$', '') = v_n and (local_id is null or local_id is not distinct from p_local)
    order by activo desc limit 1;
    if v_id is null then
      insert into area (local_id, nombre) values (p_local, upper(left(v_nombre, 1)) || substr(v_nombre, 2)) returning id, nombre into v_id, v_txt;
    else
      update area set activo = true where id = v_id;
    end if;

  elsif p_tipo = 'personal' then
    select id, nombres into v_id, v_txt from personal
    where fn_normalizar(nombres) = fn_normalizar(v_nombre) and (local_id is null or p_local is null or local_id = p_local)
    order by activo desc limit 1;
    if v_id is null then
      insert into personal (local_id, nombres) values (p_local, upper(v_nombre)) returning id, nombres into v_id, v_txt;
    else
      update personal set activo = true where id = v_id;
    end if;

  elsif p_tipo = 'ciudad' then
    select id, nombre into v_id, v_txt from ciudad where regexp_replace(fn_normalizar(nombre), '(es|s)$', '') = v_n limit 1;
    if v_id is null then
      insert into ciudad (nombre, orden) values (initcap(v_nombre), coalesce((select max(orden) from ciudad), 0) + 1)
      returning id, nombre into v_id, v_txt;
    end if;

  else
    raise exception 'Esta lista no permite agregar opciones';
  end if;

  return jsonb_build_object('id', v_id, 'nombre', v_txt);
end $$;
grant execute on function public.fn_catalogo_agregar(text, text, uuid) to authenticated;
