-- =============================================================================
--  36_unidades_orden_por_uso.sql
--  Ajustes a la lista de unidades (sigue a la 35):
--    · «Kilogramo» se llama «Kilo», como se dice en el almacén (el código sigue siendo KG);
--    · se quita «Millar» (nadie la usa);
--    · v_unidad_uso: cuántos productos usa cada unidad, para mostrar primero las MÁS USADAS
--      (se calcula en la base, no en la pantalla).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

update public.unidad_medida set nombre = 'Kilo' where codigo = 'KG';

delete from public.unidad_medida u
where u.codigo = 'MLL' and not exists (select 1 from public.producto p where p.unidad_id = u.id);
update public.unidad_medida set activo = false where codigo = 'MLL';   -- por si algún producto la tuviera

create or replace view public.v_unidad_uso with (security_invoker = true) as
select u.id, u.codigo, u.nombre, u.orden, u.activo,
       (select count(*) from public.producto p where p.unidad_id = u.id and p.activo)::int as productos
from public.unidad_medida u;
grant select on public.v_unidad_uso to authenticated;

-- «Otra…»: «kilogramo», «kilos», «kg» → Kilo (el resto igual que en la 35)
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
                  when 'mts' then 'metro' when 'galones' then 'galon' when 'pqt' then 'paquete' else v_n end;
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

-- Verificación
select nombre, codigo, productos from public.v_unidad_uso where activo order by productos desc, nombre;
