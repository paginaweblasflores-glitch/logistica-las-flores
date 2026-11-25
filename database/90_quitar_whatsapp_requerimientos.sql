-- =============================================================================
-- 90 · Se quita el número de WhatsApp de los requerimientos (de la 89)
--
-- En la computadora el botón solo descarga la imagen; en el celular se comparte eligiendo el contacto.
-- El número ya no se usa.
-- =============================================================================

delete from parametro where clave = 'whatsapp_requerimientos';
