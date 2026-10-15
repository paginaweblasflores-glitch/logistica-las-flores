-- =============================================================================
--  20_control_catalogo_y_registros.sql
--  Quién puede cambiar qué (criterio de control interno):
--  · CATÁLOGO de productos = datos del almacén. Lo crean, editan (todos los campos), dan de
--    baja y eliminan los responsables de almacén. Logística solo lo consulta.
--      - Un producto que también usa el otro negocio no se edita desde un solo almacén.
--      - Eliminar solo si nunca tuvo movimientos; si ya tiene historial, se da de BAJA
--        (deja de aparecer, el kardex se conserva). Para darlo de baja su stock debe ser 0.
--  · STOCK y KARDEX no se editan nunca: son el resultado de los movimientos.
--  · MOVIMIENTOS (entradas, salidas, ingresos) son registros: no se editan ni se borran.
--    Si hubo un error se ANULAN con motivo (queda constancia) y se registran de nuevo.
--      - Salidas/ajustes manuales: los anula el almacén que los registró.
--      - Ingresos directos (sin orden): los anula el almacén que los registró.
--      - Lo que viene de una compra con orden, un traspaso o un conteo se corrige en su
--        propio documento (o con un ajuste), no desde aquí.
--  Ejecutar una vez en Supabase → SQL Editor (proyecto de logística). Es reejecutable.
-- =============================================================================

-- 1) Un permiso específico de un módulo manda sobre el comodín "*" ---------------------------
create or replace function public.fn_puede(p_modulo text, p_accion text default 'leer') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_accion when 'leer' then rp.leer when 'escribir' then rp.escribir
                         when 'aprobar' then rp.aprobar else false end
    from usuario u join rol_permiso rp on rp.rol = u.rol
    where u.id = auth.uid() and u.activo and (rp.modulo = p_modulo or rp.modulo = '*')
    order by (rp.modulo = p_modulo) desc
    limit 1), false)
$$;

-- Módulo propio para el catálogo (antes estaba dentro de "maestros", junto con áreas y personal)
insert into public.rol_permiso (rol, modulo, leer, escribir, aprobar) values
  ('almacen',   'catalogo', true, true,  false),
  ('admin',     'catalogo', true, false, false),   -- usuario de Logística (Fernanda)
  ('logistica', 'catalogo', true, false, false),
  ('jefe_area', 'catalogo', true, false, false),
  ('cocina',    'catalogo', true, false, false),
  ('mozo',      'catalogo', true, false, false),
  ('compras',   'catalogo', true, false, false)
on conflict (rol, modulo) do update set leer = excluded.leer, escribir = excluded.escribir, aprobar = excluded.aprobar;

-- ¿El producto se usa solo en negocios del usuario? (si lo comparte con otro negocio, no lo edita uno solo)
create or replace function public.fn_producto_es_mio(p_producto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from producto_local pl
                     where pl.producto_id = p_producto and not (array[pl.local_id] <@ fn_mis_locales()))
$$;

-- ¿Tuvo algún movimiento o documento? (entonces no se elimina: se da de baja)
create or replace function public.fn_producto_tiene_historial(p_producto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from movimiento_detalle where producto_id = p_producto)
      or exists (select 1 from compra_detalle where producto_id = p_producto)
      or exists (select 1 from traslado_detalle where producto_id = p_producto)
      or exists (select 1 from conteo_detalle where producto_id = p_producto)
      or exists (select 1 from requerimiento_detalle where producto_id = p_producto)
      or exists (select 1 from cotizacion_item where producto_id = p_producto)
      or exists (select 1 from precio_historial where producto_id = p_producto)
      or exists (select 1 from lote where producto_id = p_producto)
      or exists (select 1 from descuento_detalle where producto_id = p_producto)
      or exists (select 1 from rotura where producto_id = p_producto)
      or exists (select 1 from vianda_conversion where producto_id = p_producto)
      or exists (select 1 from stock where producto_id = p_producto and cantidad <> 0)
$$;

-- 2) Políticas del catálogo ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['producto', 'producto_local', 'producto_almacen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_leer on public.%I', t);
    execute format('drop policy if exists p_insertar on public.%I', t);
    execute format('drop policy if exists p_actualizar on public.%I', t);
    execute format('drop policy if exists p_eliminar on public.%I', t);
    execute format('create policy p_leer on public.%I for select to authenticated using ((select public.fn_puede(''catalogo'', ''leer'')))', t);
  end loop;
end $$;

-- producto: alta y edición del almacén; sin borrado directo (se usa fn_eliminar_producto)
create policy p_insertar on public.producto for insert to authenticated
  with check ((select public.fn_puede('catalogo', 'escribir')));
create policy p_actualizar on public.producto for update to authenticated
  using ((select public.fn_puede('catalogo', 'escribir')) and public.fn_producto_es_mio(id))
  with check ((select public.fn_puede('catalogo', 'escribir')) and public.fn_producto_es_mio(id));

-- producto_local y producto_almacen: cada almacén solo en su negocio
create policy p_insertar on public.producto_local for insert to authenticated
  with check ((select public.fn_puede('catalogo', 'escribir')) and array[local_id] <@ (select public.fn_mis_locales()));
create policy p_actualizar on public.producto_local for update to authenticated
  using ((select public.fn_puede('catalogo', 'escribir')) and array[local_id] <@ (select public.fn_mis_locales()))
  with check ((select public.fn_puede('catalogo', 'escribir')) and array[local_id] <@ (select public.fn_mis_locales()));
create policy p_eliminar on public.producto_local for delete to authenticated
  using ((select public.fn_puede('catalogo', 'escribir')) and array[local_id] <@ (select public.fn_mis_locales()));

create policy p_insertar on public.producto_almacen for insert to authenticated with check (
  (select public.fn_puede('catalogo', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));
create policy p_actualizar on public.producto_almacen for update to authenticated using (
  (select public.fn_puede('catalogo', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));
create policy p_eliminar on public.producto_almacen for delete to authenticated using (
  (select public.fn_puede('catalogo', 'escribir'))
  and exists (select 1 from public.almacen a where a.id = producto_almacen.almacen_id and array[a.local_id] <@ (select public.fn_mis_locales())));

-- Fotos de productos: las suben los almacenes
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute 'drop policy if exists "productos_escribir" on storage.objects';
    execute $p$create policy "productos_escribir" on storage.objects for insert to authenticated
               with check (bucket_id = 'productos' and (select public.fn_puede('catalogo', 'escribir')))$p$;
    execute 'drop policy if exists "productos_actualizar" on storage.objects';
    execute $p$create policy "productos_actualizar" on storage.objects for update to authenticated
               using (bucket_id = 'productos' and (select public.fn_puede('catalogo', 'escribir')))$p$;
    execute 'drop policy if exists "productos_eliminar" on storage.objects';
    execute $p$create policy "productos_eliminar" on storage.objects for delete to authenticated
               using (bucket_id = 'productos' and (select public.fn_puede('catalogo', 'escribir')))$p$;
  end if;
end $$;

-- 3) Eliminar / dar de baja un producto -----------------------------------------------------------
create or replace function public.fn_eliminar_producto(p_producto uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('catalogo', 'escribir') or not fn_producto_es_mio(p_producto) then
    raise exception 'No autorizado: el producto lo administra el almacén de su negocio';
  end if;
  if fn_producto_tiene_historial(p_producto) then
    raise exception 'El producto ya tiene movimientos: no se elimina, se da de baja (así se conserva su kardex)';
  end if;
  delete from producto_almacen where producto_id = p_producto;
  delete from stock where producto_id = p_producto;
  delete from producto_local where producto_id = p_producto;
  delete from producto where id = p_producto;
end $$;

create or replace function public.fn_baja_producto(p_producto uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_puede('catalogo', 'escribir') or not fn_producto_es_mio(p_producto) then
    raise exception 'No autorizado: el producto lo administra el almacén de su negocio';
  end if;
  if not p_activo and exists (select 1 from stock where producto_id = p_producto and cantidad <> 0) then
    raise exception 'Todavía tiene stock: primero regístrelo como salida o ajuste hasta dejarlo en 0';
  end if;
  update producto set activo = p_activo, updated_at = now() where id = p_producto;
end $$;

-- 4) Anulaciones con motivo -------------------------------------------------------------------------
-- ¿El usuario es el responsable de un almacén? (Logística supervisa, no anula registros del almacén)
create or replace function public.fn_es_almacen() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuario where id = auth.uid() and activo and rol = 'almacen')
$$;

alter table public.movimiento add column if not exists motivo_anulacion text;
alter table public.compra add column if not exists motivo_anulacion text;

-- Salida / ajuste manual: la anula el almacén que la registró (no las que vienen de compras, traspasos o conteos)
create or replace function public.fn_anular_movimiento(p_movimiento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_m movimiento%rowtype;
begin
  select * into v_m from movimiento where id = p_movimiento for update;
  if v_m.id is null then raise exception 'No existe el movimiento'; end if;
  if v_m.anulado then raise exception 'El movimiento ya estaba anulado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba el motivo de la anulación'; end if;
  if coalesce(v_m.referencia_tipo, 'manual') <> 'manual' then
    raise exception 'Este movimiento viene de un documento (compra, traspaso o conteo): corríjalo desde ese documento o con un ajuste';
  end if;
  if not fn_puede('inventario', 'escribir') or not fn_tiene_local(v_m.local_id) or not fn_es_almacen() then
    raise exception 'No autorizado: solo el almacén que lo registró puede anularlo';
  end if;
  update movimiento set anulado = true, motivo_anulacion = trim(p_motivo) where id = p_movimiento;
end $$;

-- Ingreso directo del almacén (sin orden de compra): lo anula el almacén que lo registró
create or replace function public.fn_anular_ingreso(p_compra uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_c compra%rowtype;
begin
  select * into v_c from compra where id = p_compra for update;
  if v_c.id is null then raise exception 'No existe el ingreso'; end if;
  if not v_c.sin_orden then raise exception 'Solo se anulan aquí los ingresos directos del almacén'; end if;
  if v_c.estado = 'anulada' then raise exception 'El ingreso ya estaba anulado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba el motivo de la anulación'; end if;
  if not fn_puede('inventario', 'escribir') or not fn_tiene_local(v_c.local_id) or not fn_es_almacen() then
    raise exception 'No autorizado: solo el almacén que lo registró puede anularlo';
  end if;
  update movimiento set anulado = true, motivo_anulacion = 'Ingreso ' || v_c.numero || ' anulado: ' || trim(p_motivo)
   where referencia_tipo = 'compra' and referencia_id = p_compra and not anulado;
  delete from precio_historial where compra_detalle_id in (select id from compra_detalle where compra_id = p_compra);
  update compra set estado = 'anulada', motivo_anulacion = trim(p_motivo) where id = p_compra;
end $$;

-- Verificación: Logística consulta el catálogo pero no lo edita; el almacén sí
select rol, modulo, leer, escribir from public.rol_permiso where modulo in ('catalogo', '*') order by rol, modulo;
