-- =============================================================================
-- 76 · Panel de Contabilidad (la contadora de las «contabilidades menores»)
--
-- Lo único que le interesa: los documentos de cada orden de compra (la carpeta). Ella registra el
-- comprobante (03) en contabilidad: tipo SUNAT, serie, número, fecha de emisión, vendedor, base, IGV y total;
-- lo marca «Registrado» u «Observado». No maneja dinero, stock ni requerimientos.
-- Además: el proveedor puede tener DNI (productores sin RUC → liquidación de compra) y se retira el
-- usuario «Producción Las Flores» (Producción vive en otro sistema).
-- El usuario de la contadora se crea aparte: 76b_usuario_contabilidad.sql (con su contraseña).
-- =============================================================================

-- ── Rol y permisos: solo lectura de compras y su contexto; escribe solo con fn_registrar_comprobante ──
insert into public.rol (codigo, nombre, descripcion)
values ('contabilidad', 'Contabilidad', 'Registra los comprobantes de las compras (registro de compras)')
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

insert into public.rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('contabilidad', 'compras',         true, false, false),
  ('contabilidad', 'proveedores',     true, false, false),
  ('contabilidad', 'documentos',      true, false, false),
  ('contabilidad', 'maestros',        true, false, false),   -- negocios, almacenes, áreas
  ('contabilidad', 'requerimientos',  true, false, false),   -- el requerimiento de origen de cada compra
  ('contabilidad', 'inventario',      true, false, false),   -- la nota de ingreso (entrada al almacén)
  ('contabilidad', 'configuracion',   true, false, false),   -- parámetros (plazo de entrega de la OC)
  ('contabilidad', 'contabilidad',    true, true,  false),
  ('admin',        'contabilidad',    true, false, false),   -- Logística ve lo registrado por la contadora
  ('almacen',      'contabilidad',    true, false, false)
on conflict (rol, modulo) do update set leer = excluded.leer, escribir = excluded.escribir, aprobar = excluded.aprobar;

-- ── El proveedor sin RUC (productores de cuy…) se identifica con su DNI ──────────────────────
alter table public.proveedor add column if not exists dni varchar(8);
alter table public.proveedor drop constraint if exists proveedor_dni_check;
alter table public.proveedor add constraint proveedor_dni_check check (dni is null or dni ~ '^\d{8}$');

-- ── Registro contable del comprobante de cada compra (uno por compra) ─────────────────────────
create table if not exists public.compra_contable (
  compra_id      uuid primary key references public.compra(id) on delete cascade,
  estado         text not null check (estado in ('registrado','observado')),
  tipo_sunat     text check (tipo_sunat in ('01','03','04','12')),   -- factura, boleta, liquidación de compra, ticket
  serie          text,
  numero         text,
  fecha_emision  date,
  doc_tipo       text check (doc_tipo in ('RUC','DNI')),             -- del vendedor
  doc_numero     text,
  vendedor       text,
  base           numeric(14,2),
  igv            numeric(14,2),
  total          numeric(14,2),
  periodo        text check (periodo ~ '^\d{4}-\d{2}$'),            -- mes contable: 2026-11
  observacion    text,
  registrado_por uuid default auth.uid() references auth.users(id),
  updated_at     timestamptz not null default now()
);
create index if not exists ix_compra_contable_periodo on public.compra_contable(periodo);

alter table public.compra_contable enable row level security;
drop policy if exists p_leer on public.compra_contable;
create policy p_leer on public.compra_contable for select to authenticated
  using ((select public.fn_puede('contabilidad', 'leer')) and exists (select 1 from public.compra c where c.id = compra_id));

/**
 * La contadora registra (o corrige) el comprobante de una compra, o lo observa con su motivo.
 * Registrado exige tipo, serie, número, fecha, documento del vendedor y montos que cuadren (base + IGV = total).
 */
create or replace function public.fn_registrar_comprobante(
  p_compra uuid, p_estado text, p_tipo_sunat text default null, p_serie text default null, p_numero text default null,
  p_fecha_emision date default null, p_doc_tipo text default null, p_doc_numero text default null, p_vendedor text default null,
  p_base numeric default null, p_igv numeric default null, p_total numeric default null, p_periodo text default null,
  p_observacion text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not public.fn_puede('contabilidad', 'escribir') then raise exception 'Solo Contabilidad registra los comprobantes.'; end if;
  select estado into v_estado from compra where id = p_compra;
  if v_estado is null then raise exception 'Compra no encontrada.'; end if;
  if v_estado = 'anulada' then raise exception 'La compra está anulada.'; end if;
  if p_estado not in ('registrado','observado') then raise exception 'Estado no válido.'; end if;
  if p_estado = 'observado' and nullif(trim(p_observacion), '') is null then raise exception 'Escriba la observación.'; end if;
  if p_estado = 'registrado' then
    if p_tipo_sunat not in ('01','03','04','12') then raise exception 'Elija el tipo de comprobante.'; end if;
    if nullif(trim(p_serie), '') is null or nullif(trim(p_numero), '') is null then raise exception 'Escriba la serie y el número del comprobante.'; end if;
    if p_fecha_emision is null then raise exception 'Indique la fecha de emisión.'; end if;
    if p_doc_tipo = 'RUC' and coalesce(p_doc_numero, '') !~ '^\d{11}$' then raise exception 'El RUC del vendedor debe tener 11 dígitos.'; end if;
    if p_doc_tipo = 'DNI' and coalesce(p_doc_numero, '') !~ '^\d{8}$' then raise exception 'El DNI del vendedor debe tener 8 dígitos.'; end if;
    if p_doc_tipo is null then raise exception 'Indique el RUC o DNI del vendedor.'; end if;
    if p_tipo_sunat = '01' and p_doc_tipo <> 'RUC' then raise exception 'Una factura siempre lleva el RUC del vendedor.'; end if;
    if p_total is null or p_total <= 0 then raise exception 'Indique el total del comprobante.'; end if;
    if abs(coalesce(p_base, 0) + coalesce(p_igv, 0) - p_total) > 0.05 then raise exception 'La base más el IGV no suman el total.'; end if;
    if coalesce(p_periodo, '') !~ '^\d{4}-\d{2}$' then raise exception 'Indique el mes contable.'; end if;
  end if;

  insert into compra_contable as k (compra_id, estado, tipo_sunat, serie, numero, fecha_emision, doc_tipo, doc_numero, vendedor,
                                    base, igv, total, periodo, observacion, registrado_por, updated_at)
  values (p_compra, p_estado, p_tipo_sunat, upper(nullif(trim(p_serie), '')), nullif(trim(p_numero), ''), p_fecha_emision,
          p_doc_tipo, nullif(trim(p_doc_numero), ''), upper(nullif(trim(p_vendedor), '')), p_base, p_igv, p_total,
          nullif(p_periodo, ''), nullif(trim(p_observacion), ''), auth.uid(), now())
  on conflict (compra_id) do update set
    estado = excluded.estado, tipo_sunat = excluded.tipo_sunat, serie = excluded.serie, numero = excluded.numero,
    fecha_emision = excluded.fecha_emision, doc_tipo = excluded.doc_tipo, doc_numero = excluded.doc_numero, vendedor = excluded.vendedor,
    base = excluded.base, igv = excluded.igv, total = excluded.total, periodo = excluded.periodo,
    observacion = excluded.observacion, registrado_por = excluded.registrado_por, updated_at = now();
end $$;
revoke execute on function public.fn_registrar_comprobante(uuid, text, text, text, text, date, text, text, text, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.fn_registrar_comprobante(uuid, text, text, text, text, date, text, text, text, numeric, numeric, numeric, text, text) to authenticated;

-- ── Registro de compras: una fila por compra recibida (para la lista y el Excel del mes) ──────
create or replace view public.v_registro_compras with (security_invoker = true) as
select c.id, c.numero, c.fecha, c.fecha_entrega, c.local_id, l.codigo as local_codigo, e.razon_social as empresa, e.ruc as empresa_ruc,
       c.sin_orden, c.cotizacion_id, c.tipo_documento, c.numero_documento, c.total_documento,
       pr.razon_social as proveedor, pr.ruc as proveedor_ruc, pr.dni as proveedor_dni,
       r.total as total_compra,
       coalesce(k.estado, 'pendiente') as estado_contable,
       k.tipo_sunat, k.serie, k.numero as numero_comprobante, k.fecha_emision, k.doc_tipo, k.doc_numero, k.vendedor,
       k.base, k.igv, k.total, k.periodo, k.observacion, k.updated_at as contable_at
from public.compra c
join public.local l on l.id = c.local_id
left join public.empresa e on e.id = l.empresa_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.compra_contable k on k.compra_id = c.id
left join lateral (select round(sum(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario), 2) as total
                   from public.compra_detalle d where d.compra_id = c.id) r on true
where c.estado = 'recibida';

-- ── Se retira el usuario «Producción Las Flores» (Producción y conteos viven en otro sistema) ──
do $$
declare
  v_uid uuid;
  r record;
begin
  select id into v_uid from public.usuario where rol = 'produccion' and username = 'Producción Las Flores';
  if v_uid is null then return; end if;
  -- lo que registró queda, sin autor (columnas created_by, registrado_por…); si una no admite vacío, se avisa
  for r in
    select n.nspname as esquema, cl.relname as tabla, a.attname as columna
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = co.conrelid and a.attnum = co.conkey[1]
    where co.contype = 'f' and co.confrelid = 'auth.users'::regclass and array_length(co.conkey, 1) = 1
      and not (n.nspname = 'public' and cl.relname = 'usuario') and n.nspname = 'public'
  loop
    begin
      execute format('update %I.%I set %I = null where %I = $1', r.esquema, r.tabla, r.columna, r.columna) using v_uid;
    exception when others then
      raise notice 'No se pudo quitar el autor en %.%: %', r.tabla, r.columna, sqlerrm;
    end;
  end loop;
  delete from public.usuario_local where usuario_id = v_uid;
  delete from public.usuario where id = v_uid;
  begin
    delete from auth.identities where user_id = v_uid;
    delete from auth.users where id = v_uid;
  exception when others then
    raise notice 'El acceso de Producción no se pudo borrar (%): queda sin usuario en el sistema y no puede entrar.', sqlerrm;
  end;
end $$;
