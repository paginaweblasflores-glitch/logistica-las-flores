-- =============================================================================
-- 77 · Quitar las categorías vacías «Carnes y viandas» y «Vajilla y menaje»
-- Las carnes viven en el sistema de Producción y la vajilla no se maneja en el almacén.
-- Solo se borran si siguen vacías (sin productos, subcategorías ni proveedores); si no, se avisa.
-- =============================================================================
do $$
declare r record;
begin
  for r in select id, nombre from public.categoria where nombre in ('Carnes y viandas', 'Vajilla y menaje') loop
    if exists (select 1 from public.producto where categoria_id = r.id)
       or exists (select 1 from public.categoria where padre_id = r.id)
       or exists (select 1 from public.proveedor where categoria_id = r.id) then
      raise notice 'No se borró «%»: tiene productos, subcategorías o proveedores.', r.nombre;
    else
      delete from public.categoria where id = r.id;
      raise notice 'Categoría «%» eliminada.', r.nombre;
    end if;
  end loop;
end $$;
