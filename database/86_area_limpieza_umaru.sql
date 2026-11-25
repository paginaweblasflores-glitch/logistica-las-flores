-- =============================================================================
-- 86 · Áreas de salida de Hotel Umaru: «Hotel» y «Limpieza»
-- «Hotel» ya se había agregado el 24/11; aquí se asegura que las dos existan y estén activas.
-- Solo Umaru (Las Flores no cambia). Se puede volver a ejecutar.
-- =============================================================================
insert into public.area (local_id, nombre)
select l.id, x.nombre from public.local l, (values ('Hotel'), ('Limpieza')) as x(nombre)
 where l.codigo = 'UM'
on conflict (local_id, nombre) do update set activo = true;

-- Verificación: deben salir Hotel y Limpieza, activas
select a.nombre, a.activo from public.area a join public.local l on l.id = a.local_id
 where l.codigo = 'UM' and a.nombre in ('Hotel', 'Limpieza') order by a.nombre;
