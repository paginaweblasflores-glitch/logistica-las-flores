-- =============================================================================
--  14_cadenas_y_forma_de_compra.sql
--  · Nuevo tipo de proveedor "Tienda grande o cadena": tiene local (p. ej. en
--    Huamanga) y también vende por internet (Plaza Vea, Tottus, Promart…).
--    "tienda_en_linea" queda solo para las que no tienen local (AliExpress, Temu…).
--  · Cada oferta de cotización indica CÓMO se compra: en tienda o por internet.
--    Así se puede comparar la misma cadena en tienda y por internet.
--  · La cotización recuerda qué oferta exacta se adjudicó (proveedor + forma).
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================
alter table public.proveedor drop constraint if exists proveedor_tipo_check;
alter table public.proveedor add constraint proveedor_tipo_check
  check (tipo in ('proveedor', 'cadena', 'tienda_en_linea', 'negocio_local'));

-- Cadenas con tienda física + venta por internet
update public.proveedor
set tipo = 'cadena',
    forma_pedido = case when forma_pedido in ('Compra en línea', 'Compra en línea / tienda', 'Web') or forma_pedido is null then 'En tienda o por internet' else forma_pedido end,
    condiciones_pago = case when condiciones_pago in ('Tarjeta / en línea', 'Pago con tarjeta / en línea') then 'Efectivo / tarjeta' else condiciones_pago end,
    -- ya no son "solo en línea": la ciudad se deja vacía (tienen locales en varias ciudades)
    ciudad_id = case when ciudad_id = (select id from public.ciudad where nombre = 'En línea' limit 1) then null else ciudad_id end
where upper(razon_social) in (
  'SAGA FALABELLA', 'RIPLEY', 'OECHSLE',
  'PLAZA VEA', 'TOTTUS', 'WONG', 'METRO', 'VIVANDA', 'MAKRO', 'MASS', 'TAMBO', 'OXXO',
  'SODIMAC', 'PROMART', 'DOLLARCITY', 'CASAIDEAS', 'MINISO', 'TAI LOY',
  'COOLBOX', 'COOLBOX PERÚ', 'HIRAOKA', 'EFE', 'LA CURACAO', 'IMPACTO', 'STEREN',
  'INKAFARMA', 'MIFARMA', 'BOTICAS HOGAR Y SALUD'
);

-- Las que son solo por internet
update public.proveedor set forma_pedido = 'Compra en línea'
where tipo = 'tienda_en_linea' and forma_pedido = 'Compra en línea / tienda';

-- Forma de compra en cada oferta
alter table public.cotizacion_oferta add column if not exists canal text;
alter table public.cotizacion_oferta drop constraint if exists cotizacion_oferta_canal_check;
alter table public.cotizacion_oferta add constraint cotizacion_oferta_canal_check check (canal in ('tienda', 'en_linea'));
update public.cotizacion_oferta o set canal = 'en_linea'
from public.proveedor p
where p.id = o.proveedor_id and p.tipo = 'tienda_en_linea' and o.canal is null;

-- La ronda ahora es por proveedor Y forma de compra (Plaza Vea en tienda 1ª ronda + Plaza Vea por internet 1ª ronda)
alter table public.cotizacion_oferta drop constraint if exists cotizacion_oferta_cotizacion_id_proveedor_id_ronda_key;
create unique index if not exists ux_cotizacion_oferta_ronda
  on public.cotizacion_oferta (cotizacion_id, proveedor_id, (coalesce(canal, 'tienda')), ronda);

-- Oferta adjudicada (proveedor + forma de compra + ronda)
alter table public.cotizacion add column if not exists oferta_aprobada_id uuid references public.cotizacion_oferta(id) on delete set null;

create or replace view public.v_cotizacion_ahorro with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, c.titulo, c.estado, c.proveedor_aprobado_id,
       pr.razon_social as proveedor_aprobado,
       (select min(total) from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.ronda = 1) as total_primera_ronda,
       coalesce((select o.total from public.v_cotizacion_oferta o where o.id = c.oferta_aprobada_id),
                (select o.total from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.proveedor_id = c.proveedor_aprobado_id
                  order by o.ronda desc limit 1)) as total_adjudicado,
       (select min(total) from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.ronda = 1)
       - coalesce((select o.total from public.v_cotizacion_oferta o where o.id = c.oferta_aprobada_id),
                  (select o.total from public.v_cotizacion_oferta o where o.cotizacion_id = c.id and o.proveedor_id = c.proveedor_aprobado_id
                    order by o.ronda desc limit 1)) as ahorro,
       c.oferta_aprobada_id,
       (select x.canal from public.cotizacion_oferta x where x.id = c.oferta_aprobada_id) as canal_aprobado
from public.cotizacion c left join public.proveedor pr on pr.id = c.proveedor_aprobado_id;

-- Verificación
select tipo, count(*) from public.proveedor group by tipo order by 1;
