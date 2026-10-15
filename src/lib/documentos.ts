export const TIPOS_DOC = [
  ['acta', 'Acta de entrega / recepción'], ['traslado', 'Traslado de productos'], ['informe', 'Informe'], ['cotizacion', 'Solicitud de cotización'],
  ['requerimiento', 'Solicitud de requerimiento'], ['contrato', 'Contrato'], ['fifo', 'Hoja FIFO'], ['diagrama', 'Diagrama / procedimiento'],
  ['inventario', 'Inventario (camisas, bienes)'], ['factura', 'Factura / comprobante'], ['otro', 'Otro'],
] as const

/** Comprobantes de compra (entradas y llegadas de compra) */
export const COMPROBANTES = [
  { id: 'boleta', nombre: 'Boleta' }, { id: 'factura', nombre: 'Factura' }, { id: 'ticket', nombre: 'Ticket' },
  { id: 'guia', nombre: 'Guía' }, { id: 'recibo', nombre: 'Recibo' }, { id: 'sin_documento', nombre: 'Sin documento' },
]
