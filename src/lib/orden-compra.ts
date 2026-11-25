/**
 * La orden de compra se imprime solo cuando está completa: con proveedor y precios. En una compra marcada
 * «Comprado» eso pasa cuando el almacén registra la llegada con la boleta; con cotización, desde que se elige
 * el proveedor. Las compras directas del almacén (sin orden) y las anuladas no tienen OC.
 */
export function ocCompleta(c: { sin_orden?: boolean | null; estado: string; proveedor: unknown; total: number }) {
  return !c.sin_orden && c.estado !== 'anulada' && !!c.proveedor && c.total > 0
}

/** Quién imprime la OC: Logística (es su documento) y Contabilidad (va en la carpeta). El almacén no. */
export const imprimeOC = (panel: string) => panel === 'logistica' || panel === 'contabilidad'

/** Importe de la orden: lo pedido por el precio */
export const totalOrden = (lineas: { cantidad_solicitada: number; precio_unitario: number }[]) =>
  lineas.reduce((s, l) => s + Number(l.cantidad_solicitada) * Number(l.precio_unitario), 0)

export const AVISO_OC = 'La OC se podrá imprimir cuando tenga proveedor y precios (al registrar la llegada con la boleta).'
