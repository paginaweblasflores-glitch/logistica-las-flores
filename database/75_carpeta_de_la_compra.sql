-- =============================================================================
-- 75 · Carpeta de la compra y orden de compra imprimible
--
-- Cada orden de compra junta sus 6 documentos (lo que pide Fernanda):
--   01 Orden de compra ........ la genera el sistema (imprimible)
--   02 Proforma / cotización .. Logística (o la cotización del sistema)
--   03 Comprobante ............ factura, boleta o liquidación de compra (tipo y N° ya están en compra)
--   04 Guía de remisión ....... el almacén al recibir (o «No aplica»: compra local sin traslado)
--   05 Nota de ingreso ........ la entrada al almacén (sistema)
--   06 Constancia de pago ..... Logística
-- Aquí se guardan 02, 03 (solo el archivo), 04 y 06: número, fecha, archivo o «No aplica».
-- Los archivos van al bucket privado «documentos», carpeta compras/<id de la compra>/.
-- =============================================================================

-- ── Quién aprobó la orden (para «Aprobado por» en la OC impresa) ────────────────────────────
alter table public.compra add column if not exists aprobada_por uuid references auth.users(id);

create or replace function public.fn_compra_aprobada_por() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- al pasar a «aprobada» (por cualquier camino: botón Aprobar, «Comprado» desde el requerimiento…)
  if new.estado = 'aprobada' and (tg_op = 'INSERT' or old.estado is distinct from 'aprobada') then
    new.aprobada_por := coalesce(new.aprobada_por, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists tg_compra_aprobada_por on public.compra;
create trigger tg_compra_aprobada_por before insert or update of estado on public.compra
  for each row execute function public.fn_compra_aprobada_por();

-- ── Comprobantes: liquidación de compra (productores sin RUC) y nota de venta (no es comprobante válido) ──
do $$
declare r record;
begin
  -- quita la regla anterior del tipo de comprobante (con el nombre que tenga)
  for r in select conname from pg_constraint where conrelid = 'public.compra'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%tipo_documento%' loop
    execute format('alter table public.compra drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.compra add constraint compra_tipo_documento_check check (tipo_documento in
  ('factura','boleta','liquidacion','guia','ticket','recibo','nota_venta','sin_documento'));

-- ── Documentos de la carpeta ────────────────────────────────────────────────────────────────
create table if not exists public.compra_documento (
  id              uuid primary key default gen_random_uuid(),
  compra_id       uuid not null references public.compra(id) on delete cascade,
  tipo            text not null check (tipo in ('proforma','comprobante','guia','pago')),
  estado          text not null default 'registrado' check (estado in ('registrado','no_aplica')),
  numero          text,                 -- N° de proforma, de guía (T001-000123) o de operación del pago
  fecha           date,
  monto           numeric(14,2),        -- pago
  medio           text,                 -- pago: transferencia, efectivo, yape…
  nota            text,                 -- por qué no aplica, u observación
  archivo_path    text,                 -- bucket documentos: compras/<compra>/<archivo>
  archivo_nombre  text,
  archivo_mime    text,
  registrado_por  uuid default auth.uid() references auth.users(id),
  updated_at      timestamptz not null default now(),
  unique (compra_id, tipo)
);
create index if not exists ix_compra_documento_compra on public.compra_documento(compra_id);

-- se ve si se ve la compra (la política de compra filtra por negocio); se escribe solo con fn_compra_documento_guardar
alter table public.compra_documento enable row level security;
drop policy if exists p_leer on public.compra_documento;
create policy p_leer on public.compra_documento for select to authenticated
  using (exists (select 1 from public.compra c where c.id = compra_id));

/**
 * Registra (o corrige) un documento de la carpeta.
 * Logística: los cuatro. Almacén: guía y archivo del comprobante, solo de compras de sus negocios.
 * Sin archivo nuevo se conserva el anterior; «no_aplica» exige el motivo.
 */
create or replace function public.fn_compra_documento_guardar(
  p_compra uuid, p_tipo text, p_estado text, p_numero text default null, p_fecha date default null,
  p_monto numeric default null, p_medio text default null, p_nota text default null,
  p_archivo_path text default null, p_archivo_nombre text default null, p_archivo_mime text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_c record; v_id uuid;
  v_logistica boolean := public.fn_puede('compras', 'escribir');
begin
  select id, local_id, estado into v_c from compra where id = p_compra;
  if v_c.id is null then raise exception 'Compra no encontrada.'; end if;
  if v_c.estado = 'anulada' then raise exception 'La compra está anulada: su carpeta ya no se modifica.'; end if;
  if p_tipo not in ('proforma','comprobante','guia','pago') then raise exception 'Documento no válido.'; end if;
  if p_estado not in ('registrado','no_aplica') then raise exception 'Estado no válido.'; end if;
  if not (v_logistica or (public.fn_es_almacen() and p_tipo in ('guia','comprobante')
                          and array[v_c.local_id] <@ public.fn_mis_locales())) then
    raise exception 'No tiene permiso para registrar este documento.';
  end if;
  if p_tipo = 'comprobante' and p_estado = 'no_aplica' then raise exception 'El comprobante no puede marcarse «No aplica».'; end if;
  if p_estado = 'no_aplica' and nullif(trim(p_nota), '') is null then raise exception 'Indique por qué no aplica.'; end if;
  if p_archivo_path is not null and p_archivo_path not like 'compras/' || p_compra || '/%' then
    raise exception 'Archivo no válido.';
  end if;
  if p_estado = 'registrado' and nullif(trim(p_numero), '') is null and p_archivo_path is null
     and not exists (select 1 from compra_documento where compra_id = p_compra and tipo = p_tipo and archivo_path is not null) then
    raise exception 'Escriba el número o adjunte el archivo.';
  end if;
  if p_tipo = 'pago' and p_estado = 'registrado' and (p_monto is null or p_monto <= 0) then
    raise exception 'Indique el monto pagado.';
  end if;

  insert into compra_documento as d (compra_id, tipo, estado, numero, fecha, monto, medio, nota, archivo_path, archivo_nombre, archivo_mime, registrado_por, updated_at)
  values (p_compra, p_tipo, p_estado, nullif(trim(p_numero), ''), p_fecha, p_monto, nullif(trim(p_medio), ''), nullif(trim(p_nota), ''),
          p_archivo_path, p_archivo_nombre, p_archivo_mime, auth.uid(), now())
  on conflict (compra_id, tipo) do update set
    estado = excluded.estado, numero = excluded.numero, fecha = excluded.fecha, monto = excluded.monto, medio = excluded.medio,
    nota = excluded.nota, registrado_por = excluded.registrado_por, updated_at = now(),
    archivo_path = coalesce(excluded.archivo_path, d.archivo_path),
    archivo_nombre = case when excluded.archivo_path is null then d.archivo_nombre else excluded.archivo_nombre end,
    archivo_mime = case when excluded.archivo_path is null then d.archivo_mime else excluded.archivo_mime end
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fn_compra_documento_guardar(uuid, text, text, text, date, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.fn_compra_documento_guardar(uuid, text, text, text, date, numeric, text, text, text, text, text) to authenticated;

-- ── Archivos de la carpeta: Logística y el almacén suben en compras/… (leer ya lo permite «documentos_leer») ──
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute 'drop policy if exists "carpeta_compra_subir" on storage.objects';
    execute $p$create policy "carpeta_compra_subir" on storage.objects for insert to authenticated
             with check (bucket_id = 'documentos' and name like 'compras/%'
                         and ((select public.fn_puede('compras','escribir')) or (select public.fn_es_almacen())))$p$;
    execute 'drop policy if exists "carpeta_compra_leer" on storage.objects';
    execute $p$create policy "carpeta_compra_leer" on storage.objects for select to authenticated
             using (bucket_id = 'documentos' and name like 'compras/%'
                    and ((select public.fn_puede('compras','leer')) or (select public.fn_es_almacen())))$p$;
  end if;
end $$;

-- ── La lista de órdenes muestra el avance de la carpeta en la misma consulta (cotización al final de la vista) ──
create or replace view public.v_compra_resumen with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.local_id, l.nombre as local_nombre, l.codigo as local_codigo,
       c.almacen_id, c.proveedor_id, pr.razon_social as proveedor, c.ciudad_id, ci.nombre as ciudad,
       c.estado, c.tipo_documento, c.numero_documento, c.forma_pago, c.requerimiento_id,
       c.fecha_aprobacion, c.fecha_entrega,
       coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) as fecha_objetivo,
       x.items, x.total, x.total_solicitado, x.ahorro, x.base_comparable,
       coalesce(tr.costo, 0) as costo_transporte,
       x.total + coalesce(tr.costo, 0) as costo_total,
       -- OTIF (definición estándar: pedido a tiempo Y completo)
       case when c.estado = 'recibida' and not c.sin_orden and c.fecha_aprobacion is not null
            then c.fecha_entrega <= coalesce(c.fecha_compromiso, c.fecha_aprobacion + make_interval(hours => public.fn_param('otif_horas_objetivo', 24)::int)) end as on_time,
       case when c.estado = 'recibida' and not c.sin_orden then x.in_full end as in_full,
       case when c.estado = 'recibida' and not c.sin_orden then x.fill_rate end as fill_rate,
       round(extract(epoch from (c.fecha_entrega - c.fecha_aprobacion)) / 3600.0, 1) as horas_entrega,
       -- todo lo comprado es fuera de catálogo (va directo al área): la llegada la registra Logística, no el almacén
       coalesce(x.solo_fuera_catalogo, false) as solo_fuera_catalogo,
       c.sin_orden, c.total_documento,
       coalesce(x.diferencias_precio, 0) as diferencias_precio,
       c.cotizacion_id
from public.compra c
join public.local l on l.id = c.local_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id
left join lateral (
  select count(*) as items,
         round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total,
         round(sum(d.cantidad_solicitada * d.precio_unitario), 2) as total_solicitado,
         -- solo líneas con precio: una compra marcada «Comprado» aún no tiene precio (S/ 0) y no es un ahorro
         round(sum(case when d.precio_anterior is not null and d.precio_unitario > 0
                        then (d.precio_anterior - d.precio_unitario) * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as ahorro,
         round(sum(case when d.precio_anterior is not null and d.precio_unitario > 0
                        then d.precio_anterior * coalesce(d.cantidad_recibida, d.cantidad_solicitada) end), 2) as base_comparable,
         bool_and(coalesce(d.cantidad_recibida, 0) >= d.cantidad_solicitada) as in_full,
         least(1, sum(least(coalesce(d.cantidad_recibida, 0), d.cantidad_solicitada)) / nullif(sum(d.cantidad_solicitada), 0)) as fill_rate,
         bool_and(d.producto_id is null) as solo_fuera_catalogo,
         count(*) filter (where d.precio_orden is not null and d.precio_orden <> d.precio_unitario) as diferencias_precio
  from public.compra_detalle d where d.compra_id = c.id) x on true
left join lateral (select sum(t.costo) costo from public.transporte t where t.compra_id = c.id) tr on true;
