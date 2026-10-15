-- =============================================================================
--  53_unidad_es_un_empaque.sql
--  Elegir «Unidad» en un producto que se cuenta por empaque (botella, lata, paquete, caja…) es 1 a 1:
--  1 unidad = 1 botella (y 1 docena = 12 botellas), sin pedir «cuánto trae».
--  Antes, una Inca Kola con «trae 1 litro» se intentaba convertir por litros y pedía la equivalencia.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace function public.fn_factor_unidad(p_producto uuid, p_unidad uuid) returns numeric
language plpgsql stable set search_path = public as $$
declare u record; b record;
begin
  if p_unidad is null or p_unidad = (select unidad_id from producto where id = p_producto) then return 1; end if;
  select * into u from fn_unidad_base(p_unidad);
  select * into b from fn_producto_base(p_producto);
  if u.base is not null and b.base is not null and u.base = b.base and b.q <> 0 then return u.q / b.q; end if;
  -- «Unidad» (o docena, par) en un producto que se cuenta por empaque: cada empaque es una unidad
  if (select codigo from unidad_medida where id = u.base) = 'UND'
     and (select m.tipo from producto p join unidad_medida m on m.id = p.unidad_id where p.id = p_producto) = 'empaque' then
    return u.q;
  end if;
  return null;
end $$;
grant execute on function public.fn_factor_unidad(uuid, uuid) to authenticated;
