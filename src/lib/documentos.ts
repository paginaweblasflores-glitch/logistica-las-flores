export const TIPOS_DOC = [
  ['acta', 'Acta de entrega / recepción'], ['traslado', 'Traslado de productos'], ['informe', 'Informe'], ['cotizacion', 'Solicitud de cotización'],
  ['requerimiento', 'Solicitud de requerimiento'], ['contrato', 'Contrato'], ['fifo', 'Hoja FIFO'], ['diagrama', 'Diagrama / procedimiento'],
  ['inventario', 'Inventario (camisas, bienes)'], ['factura', 'Factura / comprobante'], ['otro', 'Otro'],
] as const

/**
 * Comprobantes de compra (entradas y llegadas de compra). La factura y la boleta las emite el vendedor; la
 * liquidación de compra la emite el comprador (Contabilidad, en SUNAT) cuando el vendedor no tiene RUC
 * (p. ej. productores de cuy). La nota de venta NO es comprobante de pago válido.
 */
export const COMPROBANTES = [
  { id: 'boleta', nombre: 'Boleta' }, { id: 'factura', nombre: 'Factura' }, { id: 'liquidacion', nombre: 'Liquidación de compra' },
  { id: 'ticket', nombre: 'Ticket' }, { id: 'guia', nombre: 'Guía' }, { id: 'recibo', nombre: 'Recibo' },
  { id: 'nota_venta', nombre: 'Nota de venta (no válida)' }, { id: 'sin_documento', nombre: 'Sin documento' },
]

/** Los que no sustentan la compra ante SUNAT: la carpeta los marca «Sin comprobante válido». */
export const SIN_COMPROBANTE_VALIDO = new Set(['nota_venta', 'sin_documento', 'guia'])

export const nombreComprobante = (id: string | null | undefined) => (id ? COMPROBANTES.find((x) => x.id === id)?.nombre ?? id : null)
