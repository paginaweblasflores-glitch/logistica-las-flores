-- =============================================================================
--  11_requerimientos_jefes_area.sql
--
--  1) PANEL "JEFE DE ÁREA": un solo usuario compartido (el personal rota) que SOLO crea
--     requerimientos y ve su estado. Usuario "Jefe de Area".
--  2) APROBADORES por monto: Fernanda (montos menores), Betsy (montos medios) y Mijaíl
--     (montos altos). Los topes son editables en Configuración. Al imprimir se elige quién firma.
--  3) Solicitud según el modelo de Logística: firma del solicitante (imagen), marca y área
--     destino por producto, fecha y hora de solicitud y de aprobación.
--  4) Los pedidos de las áreas suelen ser bienes que NO están en el catálogo ni en el almacén
--     (un dron para marketing, percheros para cocina…). Ahora pasan a cotización y compra
--     con su descripción, sin crear productos y SIN tocar el inventario.
--  5) Solo Logística aprueba: quien solicita (almacén, jefe de área) crea pero no cambia estados.
--
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) ROL JEFE DE ÁREA -----------------------------------------------------------------------
insert into public.rol (codigo, nombre, descripcion)
values ('jefe_area', 'Jefe de área', 'Panel de jefes de área: crea requerimientos y ve su estado')
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

insert into public.rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('jefe_area', 'requerimientos', true, true,  false),
  ('jefe_area', 'maestros',       true, false, false)   -- para elegir negocio, área y productos del catálogo
on conflict (rol, modulo) do update set leer = excluded.leer, escribir = excluded.escribir, aprobar = excluded.aprobar;

-- 2) APROBADORES POR MONTO ---------------------------------------------------------------------
create table if not exists public.requerimiento_aprobador (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  cargo       text not null,
  monto_hasta numeric(14,2),           -- tope del monto estimado que aprueba (NULL = sin tope)
  orden       smallint not null default 0,
  activo      boolean not null default true,
  unique (nombre)
);
insert into public.requerimiento_aprobador (nombre, cargo, monto_hasta, orden) values
  ('FERNANDEZ LAPA, FERNANDA',        'Área de Logística',             500,  1),
  ('FERNANDEZ LAPA, RITNEY BETSY',    'Administradora (Las Flores)',   2000, 2),
  ('RODRÍGUEZ CHUCHÓN, MIJAÍL',       'Gerente General',               null, 3)
on conflict (nombre) do nothing;

alter table public.requerimiento_aprobador enable row level security;
drop policy if exists p_leer on public.requerimiento_aprobador;
drop policy if exists p_escribir on public.requerimiento_aprobador;
create policy p_leer on public.requerimiento_aprobador for select to authenticated using ((select public.fn_puede('requerimientos', 'leer')));
create policy p_escribir on public.requerimiento_aprobador for all to authenticated
  using ((select public.fn_puede('configuracion', 'escribir'))) with check ((select public.fn_puede('configuracion', 'escribir')));

-- 3) CAMPOS DEL MODELO DE SOLICITUD ------------------------------------------------------------
alter table public.requerimiento add column if not exists firma_solicitante text;      -- imagen (data URL)
alter table public.requerimiento add column if not exists cargo_solicitante text;
alter table public.requerimiento add column if not exists aprobador_id uuid references public.requerimiento_aprobador(id);
alter table public.requerimiento_detalle add column if not exists marca text;
alter table public.requerimiento_detalle add column if not exists area_destino text;

drop view if exists public.v_requerimiento_resumen;
create view public.v_requerimiento_resumen with (security_invoker = true) as
select r.*, l.nombre as local_nombre, l.codigo as local_codigo, ar.nombre as area_nombre,
       (select count(*) from public.requerimiento_detalle d where d.requerimiento_id = r.id) as items,
       (select round(sum(coalesce(d.cantidad_aprobada, d.cantidad_solicitada) * coalesce(d.precio_estimado, 0)), 2)
          from public.requerimiento_detalle d where d.requerimiento_id = r.id) as monto_estimado,
       round(extract(epoch from (r.aprobado_at - r.created_at)) / 3600.0, 1) as horas_aprobacion,
       (r.aprobado_at - r.created_at) <= make_interval(hours => public.fn_param('horas_objetivo_requerimiento', 24)::int) as dentro_objetivo
from public.requerimiento r join public.local l on l.id = r.local_id left join public.area ar on ar.id = r.area_id;

-- 4) COMPRAS CON BIENES FUERA DEL CATÁLOGO (no entran al inventario) --------------------------
alter table public.compra_detalle alter column producto_id drop not null;
alter table public.compra_detalle add column if not exists descripcion text;
alter table public.compra_detalle add column if not exists unidad_texto text;   -- unidad del bien fuera de catálogo
alter table public.compra_detalle add column if not exists requerimiento_detalle_id uuid references public.requerimiento_detalle(id);
alter table public.compra_detalle drop constraint if exists compra_detalle_producto_o_descripcion;
alter table public.compra_detalle add constraint compra_detalle_producto_o_descripcion
  check (producto_id is not null or coalesce(trim(descripcion), '') <> '');

drop view if exists public.v_compra_detalle;
create view public.v_compra_detalle with (security_invoker = true) as
select d.*, c.numero, c.fecha, c.local_id, c.estado, c.proveedor_id, pr.razon_social as proveedor,
       c.ciudad_id, ci.nombre as ciudad,
       coalesce(p.nombre, d.descripcion) as producto, p.codigo as producto_codigo, cat.nombre as categoria,
       coalesce(u.codigo, d.unidad_texto, 'UND') as unidad,
       (d.producto_id is null) as fuera_de_catalogo,
       round(coalesce(d.cantidad_recibida, d.cantidad_solicitada) * d.precio_unitario, 2) as importe,
       d.precio_unitario - d.precio_anterior as variacion,
       round((d.precio_unitario - d.precio_anterior) / nullif(d.precio_anterior, 0), 4) as variacion_pct
from public.compra_detalle d
join public.compra c on c.id = d.compra_id
left join public.producto p on p.id = d.producto_id
left join public.unidad_medida u on u.id = p.unidad_id
left join public.categoria cat on cat.id = p.categoria_id
left join public.proveedor pr on pr.id = c.proveedor_id
left join public.ciudad ci on ci.id = c.ciudad_id;

-- Recepción: solo los productos del catálogo entran al almacén y al historial de precios;
-- los bienes del requerimiento (fuera de catálogo) quedan registrados en la compra y se entregan al área.
create or replace function public.fn_recibir_compra(p_compra uuid, p_fecha_entrega timestamptz default now()) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype; v_mov uuid; v_lineas jsonb;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe la compra'; end if;
  if not fn_tiene_local(v_c.local_id) or not (fn_puede('inventario', 'escribir') or fn_puede('compras', 'escribir')) then
    raise exception 'No autorizado para recibir esta compra';
  end if;
  if v_c.estado = 'recibida' then raise exception 'La compra % ya fue recibida', v_c.numero; end if;
  if v_c.estado = 'anulada' then raise exception 'La compra % está anulada', v_c.numero; end if;

  update compra_detalle set cantidad_recibida = coalesce(cantidad_recibida, cantidad_solicitada)
   where compra_id = p_compra;

  select jsonb_agg(jsonb_build_object(
           'producto_id', producto_id, 'cantidad', cantidad_recibida,
           'costo_unitario', precio_unitario, 'fecha_vencimiento', fecha_vencimiento))
    into v_lineas
  from compra_detalle where compra_id = p_compra and producto_id is not null and cantidad_recibida > 0;

  if v_lineas is not null then
    v_mov := fn_registrar_movimiento('entrada_compra', v_c.almacen_id, v_lineas, p_fecha_entrega, null,
               concat_ws(' ', v_c.tipo_documento, v_c.numero_documento), 'Recepción ' || v_c.numero,
               null, 'compra', p_compra);
  end if;

  insert into precio_historial(producto_id, proveedor_id, local_id, fecha, precio, tipo, compra_detalle_id)
  select d.producto_id, v_c.proveedor_id, v_c.local_id, v_c.fecha, d.precio_unitario, 'compra', d.id
  from compra_detalle d where d.compra_id = p_compra and d.producto_id is not null;

  update producto p set costo_referencia = d.precio_unitario, updated_at = now()
  from compra_detalle d where d.compra_id = p_compra and d.producto_id = p.id;

  update compra set estado = 'recibida',
                    fecha_entrega = p_fecha_entrega,
                    fecha_aprobacion = coalesce(fecha_aprobacion, p_fecha_entrega)
   where id = p_compra;
  -- el requerimiento de origen queda atendido
  update requerimiento set estado = 'atendido', atendido_at = coalesce(atendido_at, p_fecha_entrega)
   where id = v_c.requerimiento_id and estado in ('aprobado', 'en_cotizacion', 'comprado');
  return v_mov;
end $$;

-- 5) SOLO LOGÍSTICA APRUEBA ----------------------------------------------------------------------
-- Crear (insertar) = permiso "escribir"; cambiar o borrar (aprobar, rechazar, cantidades aprobadas) = permiso "aprobar".
do $$
declare t text;
begin
  foreach t in array array['requerimiento', 'requerimiento_detalle'] loop
    execute format('drop policy if exists p_actualizar on public.%I', t);
    execute format('drop policy if exists p_eliminar on public.%I', t);
  end loop;
end $$;
create policy p_actualizar on public.requerimiento for update to authenticated
  using ((select public.fn_puede('requerimientos', 'aprobar')) and array[local_id] <@ (select public.fn_mis_locales()))
  with check ((select public.fn_puede('requerimientos', 'aprobar')) and array[local_id] <@ (select public.fn_mis_locales()));
create policy p_eliminar on public.requerimiento for delete to authenticated
  using ((select public.fn_puede('requerimientos', 'aprobar')));
create policy p_actualizar on public.requerimiento_detalle for update to authenticated
  using ((select public.fn_puede('requerimientos', 'aprobar'))) with check ((select public.fn_puede('requerimientos', 'aprobar')));
create policy p_eliminar on public.requerimiento_detalle for delete to authenticated
  using ((select public.fn_puede('requerimientos', 'aprobar')));

-- El estado "en cotización" lo pone Logística al cotizar; el almacén y el jefe de área solo leen
-- (los demás permisos de requerimientos no cambian).

-- 6) USUARIO "Jefe de Area" -------------------------------------------------------------------------
do $$
declare v_uid uuid := 'a1f10000-0000-4000-8000-000000000004';
begin
  if not exists (select 1 from auth.users where id = v_uid) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
            'jefe.area@lasflores.local', extensions.crypt('CAMBIAR_CONTRASEÑA', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"nombre":"Jefe de Area"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', 'jefe.area@lasflores.local', 'email_verified', true),
            'email', now(), now(), now());
  end if;
  -- todos_locales: los jefes de área de ambos negocios usan el mismo usuario
  insert into public.usuario (id, username, nombre, rol, todos_locales)
  values (v_uid, 'Jefe de Area', 'Jefe de Área', 'jefe_area', true)
  on conflict (id) do update set rol = 'jefe_area', todos_locales = true, activo = true;
end $$;

-- Verificación
select u.username, u.rol, u.todos_locales,
       (select count(*) from public.requerimiento_aprobador) as aprobadores
from public.usuario u order by u.username;
