/**
 * Requerimiento juntado (RL): un producto pedido en varios requerimientos del almacén del mismo día va en UNA
 * línea con la cantidad sumada. Se suma en la unidad en que se pidió («5 Paquete») si todos lo pidieron en la
 * misma; si no, en la unidad del producto (con la que se compra y se recibe).
 */
export type LineaRL = {
  id: string; producto_id: string | null; descripcion: string
  cantidad_solicitada: number; cantidad_aprobada: number | null
  /** lo pedido tal cual (3 Paquete) y su unidad; cantidad_solicitada está en la unidad del producto */
  cantidad_pedida: number | null; unidad_pedido_id: string | null; pedida: { nombre: string } | null
  producto: { unidad: { codigo: string } } | null
}

const r4 = (n: number) => Math.round(n * 10000) / 10000
/** lo aprobado (en el almacén ya no se aprueba: es lo pedido) */
export const aprobadoDe = (d: LineaRL) => Number(d.cantidad_aprobada ?? d.cantidad_solicitada)
/** unidades del producto por cada unidad pedida (1 si se pidió en la del producto) */
export const factorDe = (d: LineaRL) =>
  Number(d.cantidad_pedida) > 0 && d.pedida && Number(d.cantidad_pedida) !== Number(d.cantidad_solicitada)
    ? Number(d.cantidad_solicitada) / Number(d.cantidad_pedida) : 1

export function agruparLineas<T extends LineaRL>(lineas: T[]) {
  const grupos = new Map<string, T[]>()
  for (const d of lineas) {
    if (aprobadoDe(d) <= 0) continue
    const k = d.producto_id ?? d.descripcion
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  return [...grupos.entries()].map(([clave, ls]) => {
    const base = r4(ls.reduce((s, d) => s + aprobadoDe(d), 0))
    // misma unidad pedida y misma equivalencia en todas: se suma en ella
    const f = factorDe(ls[0])
    const igual = f !== 1 && ls.every((d) => d.unidad_pedido_id === ls[0].unidad_pedido_id && Math.abs(factorDe(d) - f) < 1e-6)
    const pedida = igual ? { nombre: ls[0].pedida!.nombre, factor: r4(f), cantidad: r4(ls.reduce((s, d) => s + aprobadoDe(d) / factorDe(d), 0)) } : null
    return { clave, lineas: ls, base, pedida }
  })
}
