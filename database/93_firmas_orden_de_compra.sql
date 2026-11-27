-- =============================================================================
-- 93 · Firmas de la orden de compra («Elaborado por» y «Aprobado por»), guardadas por negocio
--
-- Cada OC toma los nombres de aquí (nadie los escribe al registrar). Se cambian en Configuración →
-- Firmas de la orden de compra. «Elaborado por»: el personal del almacén; «Aprobado por»: Logística.
-- =============================================================================

alter table public.local add column if not exists oc_elaborado_por text;
alter table public.local add column if not exists oc_aprobado_por text;

update public.local set oc_elaborado_por = coalesce(oc_elaborado_por, 'HERNÁN ESCRIBA'),
                        oc_aprobado_por  = coalesce(oc_aprobado_por, 'FERNANDA FERNÁNDEZ') where codigo = 'LF';
update public.local set oc_elaborado_por = coalesce(oc_elaborado_por, 'EDISON MEZA'),
                        oc_aprobado_por  = coalesce(oc_aprobado_por, 'FERNANDA FERNÁNDEZ') where codigo = 'UM';

-- Configuración guarda los nombres (solo quien puede escribir la configuración)
create or replace function public.fn_guardar_firmas_oc(p_local uuid, p_elaborado text, p_aprobado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('configuracion', 'escribir') then raise exception 'No autorizado para cambiar la configuración'; end if;
  update local set oc_elaborado_por = nullif(upper(btrim(coalesce(p_elaborado, ''))), ''),
                   oc_aprobado_por  = nullif(upper(btrim(coalesce(p_aprobado, ''))), '')
   where id = p_local;
end $$;
grant execute on function public.fn_guardar_firmas_oc(uuid, text, text) to authenticated;

-- Verificación
select codigo, nombre, oc_elaborado_por, oc_aprobado_por from public.local order by orden;
