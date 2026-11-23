/**
 * «Enviar stock del día» (cada mañana el almacén envía a Logística la foto de su stock).
 * DESACTIVADO por ahora (pedido del usuario, 2026-11-23): durante la semana de pruebas los almacenes registran
 * entradas, salidas y traspasos sin ese paso. Para volver a usarlo: poner `true` y subir a producción.
 * Desactivado no se muestra el aviso ni el botón, ni la pantalla «Stock del día» en el menú de Logística;
 * los envíos que ya existen se conservan.
 */
export const ENVIO_STOCK_DIA = false
