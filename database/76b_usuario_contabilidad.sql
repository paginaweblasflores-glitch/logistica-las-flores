-- =============================================================================
-- 76b · Usuario de la contadora («Contadora», panel de Contabilidad)
--
-- La contraseña NO va en este archivo. Pasos:
--   1. Supabase → Authentication → Users → «Add user» → «Create new user»:
--        Email: contadora@lasflores.local · Password: (la de la contadora) · marcar «Auto Confirm User».
--   2. Ejecute este archivo: lo convierte en el usuario «Contadora» del sistema (rol Contabilidad).
-- Requiere la migración 76.
-- =============================================================================
do $$
declare
  v_uid uuid;
begin
  if not exists (select 1 from public.rol where codigo = 'contabilidad') then
    raise exception 'Primero ejecute 76_panel_contabilidad.sql.';
  end if;
  select id into v_uid from auth.users where lower(trim(email)) = 'contadora@lasflores.local';
  -- si se creó con otro correo: el único usuario de acceso que todavía no está en el sistema
  if v_uid is null and (select count(*) from auth.users a where not exists (select 1 from public.usuario u where u.id = a.id)) = 1 then
    select a.id into v_uid from auth.users a where not exists (select 1 from public.usuario u where u.id = a.id);
  end if;
  if v_uid is null then
    raise exception 'No encuentro el usuario de la contadora. Correos sin usuario en el sistema: %. Créelo en Authentication → Users → Add user con el correo contadora@lasflores.local.',
      coalesce((select string_agg(a.email, ', ') from auth.users a where not exists (select 1 from public.usuario u where u.id = a.id)), 'ninguno');
  end if;

  -- ve los dos negocios (cada uno con su RUC)
  insert into public.usuario (id, username, nombre, rol, todos_locales)
  values (v_uid, 'Contadora', 'Contadora', 'contabilidad', true)
  on conflict (id) do update set username = 'Contadora', nombre = 'Contadora', rol = 'contabilidad', todos_locales = true, activo = true;
end $$;
