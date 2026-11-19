'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GrupoCategoria = {
  categoria: string
  cantidad: number
  /** dato extra al lado del título (p. ej. «3 por reponer») */
  detalle?: React.ReactNode
  /** las filas <tr> de los productos de la categoría (se arman en el servidor) */
  filas: React.ReactNode
}

/**
 * Tabla de productos agrupada por categoría: un título por categoría (con su cantidad) que se abre y se cierra,
 * y debajo sus productos. Así trabaja el almacén: todo organizado por categoría.
 */
export function TablaPorCategoria({ head, columnas, grupos }: { head: React.ReactNode; columnas: number; grupos: GrupoCategoria[] }) {
  const [cerradas, setCerradas] = useState<Set<string>>(() => new Set())
  const alternar = (c: string) => setCerradas((s) => {
    const n = new Set(s)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    return n
  })
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>{head}</thead>
        {grupos.map((g) => {
          const abierta = !cerradas.has(g.categoria)
          return (
            <tbody key={g.categoria}>
              <tr>
                <th colSpan={columnas} className="border-y border-line bg-sand p-0 text-left">
                  <button type="button" onClick={() => alternar(g.categoria)} aria-expanded={abierta}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide text-ink-900 uppercase hover:bg-canvas">
                    <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', !abierta && '-rotate-90')} aria-hidden />
                    {g.categoria}
                    <span className="font-semibold text-muted normal-case">· {g.cantidad} {g.cantidad === 1 ? 'producto' : 'productos'}</span>
                    {g.detalle && <span className="font-semibold normal-case">{g.detalle}</span>}
                  </button>
                </th>
              </tr>
              {abierta && g.filas}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
