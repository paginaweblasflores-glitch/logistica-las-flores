import { ZONAS } from '@/lib/zonas'

const SIN = 'Sin categoría'
const porNombre = ([a]: [string, unknown], [b]: [string, unknown]) => (a === SIN ? 1 : b === SIN ? -1 : a.localeCompare(b, 'es'))

/** Agrupa por categoría: categorías en orden alfabético y «Sin categoría» al final; dentro, el orden que traen. */
export function agruparPorCategoria<T>(filas: T[], categoriaDe: (f: T) => string | null | undefined) {
  const grupos = new Map<string, T[]>()
  for (const f of filas) {
    const c = categoriaDe(f) || SIN
    const g = grupos.get(c)
    if (g) g.push(f)
    else grupos.set(c, [f])
  }
  return [...grupos.entries()].sort(porNombre)
}

/**
 * Agrupa por zona sanitaria y, dentro, por categoría. Las zonas van en su orden fijo (alimentos, contacto,
 * químicos, no alimentarios) y al final lo que aún no tiene zona.
 */
export function agruparPorZona<T>(filas: T[], zonaDe: (f: T) => string | null | undefined, categoriaDe: (f: T) => string | null | undefined) {
  const orden = [...ZONAS.map((z) => z.id as string), '']
  const porZona = new Map<string, T[]>()
  for (const f of filas) {
    const z = zonaDe(f)
    const k = z && orden.includes(z) ? z : ''
    const g = porZona.get(k)
    if (g) g.push(f)
    else porZona.set(k, [f])
  }
  return orden.filter((z) => porZona.has(z)).map((z) => ({ zona: z || null, categorias: agruparPorCategoria(porZona.get(z)!, categoriaDe) }))
}
