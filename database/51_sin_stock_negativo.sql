-- =============================================================================
--  51_sin_stock_negativo.sql
--  Ningún almacén queda con stock negativo:
--   · una salida (o un traspaso) de más de lo que hay se rechaza con «Stock insuficiente de …»;
--   · tampoco se puede anular una entrada si parte de lo que entró ya salió (el stock quedaría negativo).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

alter table public.almacen alter column permite_negativo set default false;
update public.almacen set permite_negativo = false where permite_negativo;

-- Anular un movimiento revierte el stock; si era una entrada y ya se usó, el stock no alcanza para revertirla
create or replace function public.fn_movimiento_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_signo smallint; d record; c record; v_cant numeric; v_nombre text;
begin
  if not (new.anulado and not old.anulado) then return null; end if;
  select signo into v_signo from tipo_movimiento where codigo = new.tipo;
  for d in select * from movimiento_detalle where movimiento_id = new.id loop
    update stock set cantidad = cantidad - v_signo * d.cantidad
     where producto_id = d.producto_id and almacen_id = new.almacen_id
    returning cantidad into v_cant;
    if v_cant < 0 and not (select permite_negativo from almacen where id = new.almacen_id) then
      select nombre into v_nombre from producto where id = d.producto_id;
      raise exception 'No se puede anular: de "%" ya salió parte de lo que entró (quedan %, la entrada fue de %). Registre una salida o un ajuste en su lugar',
        v_nombre, round(v_cant + d.cantidad, 2), round(d.cantidad, 2);
    end if;
    if v_signo > 0 then
      update lote set cantidad_disponible = greatest(cantidad_disponible - d.cantidad, 0)
       where movimiento_id = new.id and producto_id = d.producto_id;
    else
      for c in select * from lote_consumo where detalle_id = d.id loop
        update lote set cantidad_disponible = cantidad_disponible + c.cantidad where id = c.lote_id;
      end loop;
    end if;
  end loop;
  return null;
end $$;

-- Verificación: todos en «no»
select nombre, permite_negativo from public.almacen order by nombre;
