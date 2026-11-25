-- =============================================================================
-- 89 · Número de WhatsApp al que Logística envía el requerimiento del almacén aprobado
--
-- Un solo número para los dos negocios; se cambia en Configuración → Metas y parámetros.
-- Se guarda como texto (solo dígitos, con el código del país: 51…).
-- =============================================================================

insert into parametro (clave, valor, valor_texto, descripcion)
values ('whatsapp_requerimientos', null, '51997615449', 'WhatsApp al que se envía el requerimiento aprobado')
on conflict (clave) do nothing;
