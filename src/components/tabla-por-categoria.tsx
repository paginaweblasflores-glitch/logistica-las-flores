'use client'

import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { zonaDe, SIN_ZONA } from '@/lib/zonas'

export type GrupoCategoria = {
  categoria: string
  cantidad: number
  /** dato extra al lado del título (p. ej. «3 por reponer») */
  detalle?: React.ReactNode
  /** las filas <tr> de los productos de la categoría (se arman en el servidor) */
  filas: React.ReactNode
}
export type GrupoZona = { zona: string | null; categorias: GrupoCategoria[] }

/**
 * Categorías abiertas de cada tabla, en memoria de la pestaña: al ir a otro módulo y volver se ven como se dejaron;
 * al recargar la página (F5) todo vuelve a empezar cerrado.
 */
const abiertasPorTabla = new Map<string, Set<string>>()

/**
 * Tabla de productos organizada como el almacén físico: por ZONA sanitaria (alimentos, contacto con alimentos,
 * limpieza y químicos, no alimentarios), con su recordatorio, y dentro por CATEGORÍA. Las categorías empiezan
 * cerradas y se abren con un clic.
 * `id`: nombre de la tabla (cada una recuerda lo suyo). `anchos`: ancho de cada columna (la cabecera queda alineada
 * aunque todas las categorías estén cerradas); vacío = el resto del espacio.
 */
export function TablaPorCategoria({ id, head, columnas, zonas, anchos }: {
  id: string; head: React.ReactNode; columnas: number; zonas: GrupoZona[]; anchos?: (string | undefined)[]
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(abiertasPorTabla.get(id)))
  const alternar = (c: string) => {
    const n = new Set(abiertas)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    abiertasPorTabla.set(id, n)
    setAbiertas(n)
  }
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', anchos && 'min-w-[720px] table-fixed')}>
        {anchos && <colgroup>{anchos.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>}
        <thead>{head}</thead>
        {zonas.map((z) => {
          const info = zonaDe(z.zona) ?? SIN_ZONA
          const total = z.categorias.reduce((s, c) => s + c.cantidad, 0)
          return (
            <tbody key={z.zona ?? 'sin'}>
              {/* la zona: color y recordatorio de cómo se guarda en el almacén físico */}
              <tr>
                <th colSpan={columnas} className="p-0 text-left" style={{ background: info.fondo }}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-l-4 px-4 py-2.5" style={{ borderColor: info.color }}>
                    <span className="text-sm font-bold" style={{ color: info.color }}>{info.nombre}</span>
                    <span className="text-xs font-semibold text-muted">{total} {total === 1 ? 'producto' : 'productos'}</span>
                    <span className="basis-full text-xs font-normal text-ink-700">{info.recordatorio}</span>
                  </div>
                </th>
              </tr>
              {z.categorias.map((g) => {
                const clave = `${z.zona}:${g.categoria}`
                const abierta = abiertas.has(clave)
                return [
                  <tr key={clave}>
                    <th colSpan={columnas} className="border-y border-line bg-sand p-0 text-left">
                      <button type="button" onClick={() => alternar(clave)} aria-expanded={abierta}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide text-ink-900 uppercase hover:bg-canvas">
                        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', !abierta && '-rotate-90')} aria-hidden />
                        {g.categoria}
                        <span className="font-semibold text-muted normal-case">· {g.cantidad} {g.cantidad === 1 ? 'producto' : 'productos'}</span>
                        {g.detalle && <span className="font-semibold normal-case">{g.detalle}</span>}
                      </button>
                    </th>
                  </tr>,
                  abierta ? <Fragment key={`${clave}:filas`}>{g.filas}</Fragment> : null,
                ]
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

