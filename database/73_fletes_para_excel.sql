-- =============================================================================
--  73_fletes_para_excel.sql
--  Excel de Transporte: cada flete (tramo) con su negocio, compra, transportista y origen en texto,
--  tal como se ve en la pantalla.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

create or replace view public.v_transporte with (security_invoker = true) as
select t.id, t.fecha, t.local_id, l.nombre as negocio, c.numero as compra,
       coalesce(p.razon_social, t.transportista) as transportista,
       ci.nombre as origen, t.destino, t.documento, t.costo, t.peso_kg, t.bultos, t.observacion
from public.transporte t
left join public.local l on l.id = t.local_id
left join public.compra c on c.id = t.compra_id
left join public.proveedor p on p.id = t.transportista_id
left join public.ciudad ci on ci.id = t.ciudad_origen_id;

grant select on public.v_transporte to authenticated;

-- Verificación: debe responder (0 filas mientras no haya fletes)
select count(*) as fletes from public.v_transporte;
