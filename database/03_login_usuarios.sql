-- =============================================================================
--  03_login_usuarios.sql · Lista de usuarios para el desplegable del login
--  Devuelve SOLO el nombre de usuario de las cuentas activas (sin correos ni datos
--  sensibles). Ya está incluido en 01_schema.sql; este archivo sirve para aplicarlo
--  a una base existente sin volver a ejecutar todo el esquema.
-- =============================================================================

create or replace function public.fn_usuarios_login()
returns table(username text)
language sql stable security definer set search_path = public as $$
  select u.username from usuario u where u.activo order by u.username
$$;

revoke all on function public.fn_usuarios_login() from public;
grant execute on function public.fn_usuarios_login() to anon, authenticated;
