-- =============================================================================
--  55_unidades_que_sobran.sql
--  Se quitan las unidades que repiten a «Unidad»:
--   · Botella, Lata, Rollo y Juego: cada una es 1 unidad;
--   · Docena y Par: se escriben 12 o 2 unidades.
--  Ningún producto las usa (migración 54). Si algún documento antiguo las nombra, quedan solo inactivas
--  (ese documento sigue mostrándolas); si nadie las nombra, se borran.
--  Si alguien escribe una de ellas como unidad nueva: botella, lata, rollo o juego → «Unidad»;
--  docena o par → se le pide escribirlo en unidades.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

do $$
declare r record;
begin
  for r in select id, codigo from public.unidad_medida where codigo in ('BOT', 'LAT', 'ROL', 'JGO', 'DOC', 'PAR') loop
    begin
      delete from public.unidad_medida where id = r.id;
    exception when foreign_key_violation then
      update public.unidad_medida set activo = false where id = r.id;
    end;
  end loop;
end $$;

create or replace function public.fn_unidad_nueva(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_n text; v_base text; v_cod text; v_id uuid; i int := 1;
begin
  if not fn_puede('maestros', 'escribir') and not fn_es_almacen() then raise exception 'No autorizado'; end if;
  if length(v_nombre) < 2 or length(v_nombre) > 30 then raise exception 'Escriba el nombre de la unidad (de 2 a 30 letras)'; end if;
  v_n := fn_normalizar(v_nombre);
  v_n := case v_n when 'kilogramo' then 'kilo' when 'kilogramos' then 'kilo' when 'kilos' then 'kilo' when 'kg' then 'kilo' when 'kgs' then 'kilo'
                  when 'gr' then 'gramo' when 'grs' then 'gramo' when 'lt' then 'litro' when 'lts' then 'litro'
                  when 'u' then 'unidad' when 'und' then 'unidad' when 'unid' then 'unidad' when 'unidades' then 'unidad'
                  when 'mts' then 'metro' when 'galones' then 'galon' when 'pqt' then 'paquete'
                  -- una botella, lata, rollo o juego es una unidad
                  when 'botella' then 'unidad' when 'botellas' then 'unidad' when 'bot' then 'unidad'
                  when 'lata' then 'unidad' when 'latas' then 'unidad' when 'lat' then 'unidad'
                  when 'rollo' then 'unidad' when 'rollos' then 'unidad' when 'juego' then 'unidad' when 'juegos' then 'unidad' else v_n end;
  if v_n in ('docena', 'docenas', 'doc', 'par', 'pares') then
    raise exception 'Use «Unidad»: escriba la cantidad en unidades (1 docena = 12, 1 par = 2)';
  end if;
  select id into v_id from unidad_medida
   where fn_normalizar(nombre) in (v_n, regexp_replace(v_n, 'es$', ''), regexp_replace(v_n, 's$', ''))
      or fn_normalizar(codigo) = v_n
   order by activo desc limit 1;
  if v_id is not null then
    update unidad_medida set activo = true where id = v_id and codigo <> 'SD';
    return v_id;
  end if;
  v_base := left(upper(regexp_replace(fn_normalizar(v_nombre), '[^a-z]', '', 'g')), 3);
  if v_base = '' then v_base := 'UM'; end if;
  v_cod := v_base;
  while exists (select 1 from unidad_medida where codigo = v_cod) loop
    i := i + 1; v_cod := v_base || i;
  end loop;
  insert into unidad_medida (codigo, nombre, orden)
  values (v_cod, upper(left(v_nombre, 1)) || lower(substr(v_nombre, 2)), 50)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fn_unidad_nueva(text) to authenticated;

-- Verificación: las unidades que quedan
select nombre, codigo from public.unidad_medida where activo order by orden, nombre;
