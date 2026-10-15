-- =============================================================================
--  09_corregir_precios_por_paquete.sql
--
--  El 08 cargó para estos 11 productos el precio del cuaderno "ALMACEN F1 Y H2", pero
--  ese precio es por PAQUETE, CAJA o KILO, mientras que el stock se cuenta por UNIDAD
--  (ej. taper de puca: 1 400 unidades × S/ 14.50 del paquete = S/ 20 300, irreal).
--  Se dejan en S/ 0 para que Fernanda ponga el precio por unidad en la ficha del producto.
--  Solo se tocan si todavía tienen exactamente el precio que cargó el 08 (si Fernanda ya
--  lo corrigió, se respeta). Todo en un solo bloque: se aplica completo o nada.
--
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
do $$
begin
  create temporary table _malo (codigo text primary key, costo numeric) on commit drop;
  insert into _malo values
    ('P-00244', 18.3),     -- KETCHUP SACHET X 250       (precio de la caja)
    ('P-00314', 44.86),    -- MAYONESA SACHET X 250      (precio de la caja)
    ('P-00323', 18.3),     -- MOSTAZA SACHET X 250       (precio de la caja)
    ('P-00326', 40),       -- NUEZ MOSCADA               (precio del kilo)
    ('P-00443', 14.5),     -- TAPER DE PUCA 1/2 LITROS   (precio del paquete)
    ('P-00444', 11.5),     -- TAPER ENSALADA X 8 ONZ     (precio del paquete)
    ('P-00447', 8),        -- TAPER QAPCHI 4 ONZ         (precio del paquete)
    ('P-00465', 4.3),      -- VASO ACRILICO 3 ONZAS      (precio del paquete)
    ('P-00470', 1.6),      -- VASO DESECHABLE 5 ONZAS    (precio del paquete)
    ('P-00472', 2.75),     -- VASO DESECHABLE 9 ONZAS    (precio del paquete)
    ('P-00375', 2.5);      -- PLATO DE CHAUFA            (probable precio por paquete)

  alter table public.movimiento_detalle disable trigger trg_movdet_inmutable;
  update public.movimiento_detalle d set costo_unitario = 0
  from public.movimiento m, public.producto p, _malo x
  where m.id = d.movimiento_id and m.tipo = 'stock_inicial' and not m.anulado
    and p.id = d.producto_id and x.codigo = p.codigo and d.costo_unitario = x.costo;
  alter table public.movimiento_detalle enable trigger trg_movdet_inmutable;

  update public.lote l set costo_unitario = 0
  from public.producto p, _malo x, public.movimiento m
  where p.id = l.producto_id and x.codigo = p.codigo and l.costo_unitario = x.costo
    and m.id = l.movimiento_id and m.tipo = 'stock_inicial';

  update public.stock s set costo_promedio = 0
  from public.producto p, _malo x
  where p.id = s.producto_id and x.codigo = p.codigo and s.costo_promedio = x.costo;

  update public.producto p set costo_referencia = 0
  from _malo x where x.codigo = p.codigo and p.costo_referencia = x.costo;

  drop table _malo;
end $$;

-- Verificación: valor del stock por almacén (ya sin los precios por paquete)
select a.nombre as almacen, round(sum(s.valor), 2) as valor_soles
from public.stock s join public.almacen a on a.id = s.almacen_id
group by a.nombre order by a.nombre;
