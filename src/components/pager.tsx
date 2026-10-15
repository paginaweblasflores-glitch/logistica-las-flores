'use client'

import { Children, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { TAMANOS_PAGINA, TAMANO_DEFECTO } from '@/lib/paginacion'
import { Select } from '@/components/select'

/* ───────────── Barra de paginación (presentación) ───────────── */
export function PagerBar({ page, size, total, onPage, onSize }: {
  page: number; size: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  const desde = total === 0 ? 0 : (page - 1) * size + 1
  const hasta = Math.min(total, page * size)
  const btn = 'grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-700 transition-colors hover:bg-canvas disabled:pointer-events-none disabled:opacity-35'
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
      <label className="flex items-center gap-2">
        <span>Filas por página</span>
        <Select value={String(size)} onChange={(v) => onSize(Number(v))} required options={TAMANOS_PAGINA.map((n) => ({ id: String(n), nombre: String(n) }))} className="h-8 w-20" ariaLabel="Filas por página" />
      </label>
      <div className="flex items-center gap-3">
        <span className="tabular">{desde.toLocaleString('es-PE')}–{hasta.toLocaleString('es-PE')} de {total.toLocaleString('es-PE')}</span>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(1)} aria-label="Primera página"><ChevronsLeft className="size-4" /></button>
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" /></button>
          <span className="min-w-20 text-center text-xs tabular">Página {page} de {pages}</span>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente"><ChevronRight className="size-4" /></button>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Última página"><ChevronsRight className="size-4" /></button>
        </div>
      </div>
    </div>
  )
}

/* ───────────── Paginación en servidor (?page=&size= en la URL) ───────────── */
export function UrlPagination({ total, prefijo = '' }: { total: number; prefijo?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const size = Number(sp.get(prefijo + 'size')) || TAMANO_DEFECTO
  const page = Math.max(1, Number(sp.get(prefijo + 'page')) || 1)
  const ir = (p: number, s = size) => {
    const q = new URLSearchParams(sp.toString())
    q.set(prefijo + 'page', String(p))
    q.set(prefijo + 'size', String(s))
    router.push(`${pathname}?${q.toString()}`, { scroll: false })
  }
  return <PagerBar page={page} size={size} total={total} onPage={(p) => ir(p)} onSize={(s) => ir(1, s)} />
}

/* ───────────── Tabla con paginación local (datos ya cargados) ───────────── */
export function PagedTable({ head, children, empty, foot, className }: {
  head: React.ReactNode
  children: React.ReactNode
  empty?: React.ReactNode
  foot?: React.ReactNode
  className?: string
}) {
  const filas = Children.toArray(children)
  const [size, setSize] = useState<number>(TAMANO_DEFECTO)
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(filas.length / size))
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const visibles = filas.slice((page - 1) * size, page * size)
  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>{head}</thead>
          <tbody>
            {visibles}
            {!filas.length && empty && <tr><td colSpan={99} className="td py-8 text-center text-muted">{empty}</td></tr>}
          </tbody>
          {foot && <tfoot>{foot}</tfoot>}
        </table>
      </div>
      {filas.length > 0 && <PagerBar page={page} size={size} total={filas.length} onPage={setPage} onSize={(s) => { setSize(s); setPage(1) }} />}
    </div>
  )
}

/** Paginación local para listas que no son tablas (ej. hoja de conteo) */
export function usePagina<T>(items: T[]) {
  const [size, setSize] = useState<number>(TAMANO_DEFECTO)
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const actual = Math.min(page, pages)
  return {
    visibles: items.slice((actual - 1) * size, actual * size),
    offset: (actual - 1) * size,
    barra: <PagerBar page={actual} size={size} total={items.length} onPage={setPage} onSize={(s) => { setSize(s); setPage(1) }} />,
    irA: setPage,
  }
}


/** Conserva la cantidad de filas elegida al enviar un formulario de filtros (GET) */
export function KeepSize({ prefijo = '' }: { prefijo?: string }) {
  const size = useSearchParams().get(prefijo + 'size')
  return size ? <input type="hidden" name={prefijo + 'size'} value={size} /> : null
}
