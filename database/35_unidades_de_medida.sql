-- =============================================================================
--  35_unidades_de_medida.sql
--  Lista de unidades limpia (las conocidas, base: Catálogo 03 de SUNAT) y la opción «Otra…»:
--    · se quitan las que nadie usa y casi no se usan en un almacén (onza, tarro, frasco…);
--    · el desplegable muestra solo el nombre, en un orden fijo (peso/volumen → empaques → cantidades);
--    · «Por definir» (SD) queda solo para los productos que aún la tienen: ya no se ofrece;
--    · «Otra…»: el almacén escribe una unidad nueva y queda guardada para la próxima vez
--      (si ya existe —«kilo», «KILOGRAMO», «litros»— se usa la existente, no se repite).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

alter table public.unidad_medida add column if not exists orden integer not null default 100;
alter table public.unidad_medida add column if not exists activo boolean not null default true;

-- 1) Quitar las que no se usan (solo si ningún producto las tiene)
delete from public.unidad_medida u
where u.codigo in ('OZ', 'MG', 'TAR', 'FCO', 'BID', 'BLI', 'SOB', 'CTO', 'PZA', 'POR')
  and not exists (select 1 from public.producto p where p.unidad_id = u.id);

-- 2) Las conocidas, con su nombre y su orden en el desplegable
insert into public.unidad_medida (codigo, nombre, orden) values
  ('UND', 'Unidad', 1), ('KG', 'Kilogramo', 2), ('G', 'Gramo', 3), ('L', 'Litro', 4), ('ML', 'Mililitro', 5),
  ('GAL', 'Galón', 6), ('M', 'Metro', 7),
  ('CJ', 'Caja', 10), ('PAQ', 'Paquete', 11), ('BOL', 'Bolsa', 12), ('BOT', 'Botella', 13), ('LAT', 'Lata', 14),
  ('SAC', 'Saco', 15), ('BAL', 'Balde', 16), ('ROL', 'Rollo', 17),
  ('DOC', 'Docena', 20), ('PAR', 'Par', 21), ('JGO', 'Juego', 22), ('MLL', 'Millar', 23)
on conflict (codigo) do update set nombre = excluded.nombre, orden = excluded.orden, activo = true;

-- «Por definir»: solo marca los productos pendientes; no se elige
update public.unidad_medida set activo = false, orden = 999 where codigo = 'SD';

-- 3) «Otra…»: devuelve la unidad (la existente si ya está, o una nueva)
create or replace function public.fn_unidad_nueva(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_n text; v_base text; v_cod text; v_id uuid; i int := 1;
begin
  if not fn_puede('maestros', 'escribir') and not fn_es_almacen() then raise exception 'No autorizado'; end if;
  if length(v_nombre) < 2 or length(v_nombre) > 30 then raise exception 'Escriba el nombre de la unidad (de 2 a 30 letras)'; end if;
  v_n := fn_normalizar(v_nombre);
  -- abreviaturas y plurales comunes → la unidad que ya existe
  v_n := case v_n when 'kilo' then 'kilogramo' when 'kilos' then 'kilogramo' when 'kg' then 'kilogramo' when 'kgs' then 'kilogramo'
                  when 'gr' then 'gramo' when 'grs' then 'gramo' when 'lt' then 'litro' when 'lts' then 'litro'
                  when 'u' then 'unidad' when 'und' then 'unidad' when 'unid' then 'unidad' when 'unidades' then 'unidad'
                  when 'mts' then 'metro' when 'galones' then 'galon' when 'pqt' then 'paquete' else v_n end;
  select id into v_id from unidad_medida
   where fn_normalizar(nombre) in (v_n, regexp_replace(v_n, 'es$', ''), regexp_replace(v_n, 's$', ''))
      or fn_normalizar(codigo) = v_n
   order by activo desc limit 1;
  if v_id is not null then
    update unidad_medida set activo = true where id = v_id and codigo <> 'SD';
    return v_id;
  end if;
  -- código corto: primeras letras del nombre (CAJON → CAJ; si ya existe, CAJ2, CAJ3…)
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

-- Verificación: la lista como se verá en el desplegable
select nombre, codigo, (select count(*) from public.producto p where p.unidad_id = u.id) productos
from public.unidad_medida u where activo order by orden, nombre;
