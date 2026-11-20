/**
 * Cantidades en las dos unidades del producto: la chica (en la que se guarda el stock: kilo, unidad…) y su
 * presentación grande (saco, caja…, con cuánto trae). Ej.: 130 kg con «Saco, trae 50» → «2 sacos + 30 KG».
 */
const n3 = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 3 })
const plural = (s: string, n: number) => (n === 1 ? s : /[aeiouáéíóú]$/i.test(s) ? `${s}s` : `${s}es`)

/** La cantidad en la presentación grande («2 sacos + 30 KG»); null si no tiene o no llega a una */
export function enGrande(cantidad: number | string | null | undefined, unidad: string, presentacion?: string | null, trae?: number | string | null) {
  const q = Number(cantidad) || 0
  const t = Number(trae)
  if (!presentacion || !(t > 0) || Math.abs(q) < t) return null
  const enteras = Math.trunc(q / t)
  const resto = Math.round((q - enteras * t) * 1000) / 1000
  return `${n3(enteras)} ${plural(presentacion.toLowerCase(), Math.abs(enteras))}${resto ? ` + ${n3(resto)} ${unidad}` : ''}`
}

/** Las dos a la vez: «130 KG · 2 sacos + 30 KG» (sin presentación, solo la chica) */
export function enDosUnidades(cantidad: number | string | null | undefined, unidad: string, presentacion?: string | null, trae?: number | string | null) {
  const chica = `${n3(Number(cantidad) || 0)} ${unidad}`
  const grande = enGrande(cantidad, unidad, presentacion, trae)
  return grande ? `${chica} · ${grande}` : chica
}
