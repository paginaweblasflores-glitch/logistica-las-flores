/** Agrupa por categoría: categorías en orden alfabético y «Sin categoría» al final; dentro, el orden que traen. */
export function agruparPorCategoria<T>(filas: T[], categoriaDe: (f: T) => string | null | undefined) {
  const SIN = 'Sin categoría'
  const grupos = new Map<string, T[]>()
  for (const f of filas) {
    const c = categoriaDe(f) || SIN
    const g = grupos.get(c)
    if (g) g.push(f)
    else grupos.set(c, [f])
  }
  return [...grupos.entries()].sort(([a], [b]) => (a === SIN ? 1 : b === SIN ? -1 : a.localeCompare(b, 'es')))
}
