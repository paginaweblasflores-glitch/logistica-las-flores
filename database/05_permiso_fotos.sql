-- =============================================================================
--  05_permiso_fotos.sql · Corrige la subida de fotos de productos
--  Subir "reemplazando si ya existe" (upsert) exige también permiso de LECTURA
--  sobre los archivos del bucket "productos". Las fotos son públicas (solo imágenes
--  referenciales), así que cualquier usuario del sistema puede verlas.
--  Ejecutar una vez en Supabase → SQL Editor. Es reejecutable.
-- =============================================================================
drop policy if exists "productos_leer" on storage.objects;
create policy "productos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'productos');
