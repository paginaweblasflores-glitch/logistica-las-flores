/**
 * La orden de compra se imprime solo cuando está completa: con proveedor y precios. La compra con boleta que
 * registra el almacén ya la trae completa (se genera al registrar la entrada); con cotización, desde que se
 * elige el proveedor. Las anuladas no tienen OC.
 */
export function ocCompleta(c: { estado: string; proveedor: unknown; total: number }) {
  return c.estado !== 'anulada' && !!c.proveedor && c.total > 0
}

/** Quién imprime la OC: Logística (es su documento) y Contabilidad (va en la carpeta). El almacén no. */
export const imprimeOC = (panel: string) => panel === 'logistica' || panel === 'contabilidad'

/** Importe de la orden: lo pedido por el precio */
export const totalOrden = (lineas: { cantidad_solicitada: number; precio_unitario: number }[]) =>
  lineas.reduce((s, l) => s + Number(l.cantidad_solicitada) * Number(l.precio_unitario), 0)

export const AVISO_OC = 'La OC se podrá imprimir cuando tenga proveedor y precios (al registrar la llegada con la boleta).'
