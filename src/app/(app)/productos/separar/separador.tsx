'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { moverProductos } from '../actions'
import { Select } from '@/components/select'

export type FilaSeparar = { id: string; codigo: number | null; nombre: string; categoria: string; conStock: boolean }
type Alm = { id: string; corto: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Lista del almacén de origen con casillas, búsqueda y filtro por categoría; «Pasar al …» mueve los marcados. */
export function Separador({ origen, destino, filas, almacenes }: { origen: Alm; destino: Alm; filas: FilaSeparar[]; almacenes: Alm[] }) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const categorias = useMemo(() => [...new Set(filas.map((f) => f.categoria))].sort(), [filas])
  const visibles = useMemo(() => {
    const palabras = norm(q).split(/\s+/).filter(Boolean)
    return filas.filter((f) => (!cat || f.categoria === cat) && palabras.every((w) => norm(f.nombre).includes(w) || String(f.codigo) === w))
  }, [filas, q, cat])
  const movibles = visibles.filter((f) => !f.conStock)
  const todosMarcados = movibles.length > 0 && movibles.every((f) => marcados.has(f.id))
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const marcarVisibles = () => setMarcados((s) => {
    const n = new Set(s)
    for (const f of movibles) if (todosMarcados) n.delete(f.id); else n.add(f.id)
    return n
  })

  return (
    <div className="space-y-4">
      {/* de qué almacén a cuál */}
      <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white p-1">
        {almacenes.map((a) => {
          const otro = almacenes.find((x) => x.id !== a.id)!
          return (
            <Link key={a.id} href={`/productos/separar?desde=${a.id}`}
              className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold', a.id === origen.id ? 'bg-ink-900 text-white' : 'text-muted hover:bg-canvas hover:text-ink-900')}>
              {a.corto} <ArrowRight className="size-3.5" /> {otro.corto}
            </Link>
          )
        })}
      </nav>

      <ActionForm action={moverProductos} onSuccess={() => setMarcados(new Set())} className="card overflow-hidden">
        <input type="hidden" name="origen" value={origen.id} />
        <input type="hidden" name="destino" value={destino.id} />
        <input type="hidden" name="productos" value={JSON.stringify([...marcados])} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código…" className="field pl-9" />
          </div>
          <Select value={cat} onChange={setCat} options={categorias.map((c) => ({ id: c, nombre: c }))} placeholder="Todas las categorías" className="w-56" ariaLabel="Categoría" />
          <span className="text-xs text-muted tabular">{visibles.length} de {filas.length} en {origen.corto}</span>
          <SubmitButton className="ml-auto" confirm={`¿Pasar ${marcados.size} producto(s) de ${origen.corto} a ${destino.corto}? Recibirán el siguiente código de ${destino.corto}.`}>
            Pasar {marcados.size || ''} a {destino.corto}
          </SubmitButton>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10"><tr>
              <th className="th w-10"><input type="checkbox" checked={todosMarcados} onChange={marcarVisibles} aria-label="Marcar los visibles" className="size-4 accent-brand-600" /></th>
              <th className="th w-16 text-right">Cód.</th><th className="th">Producto</th><th className="th">Categoría</th>
            </tr></thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} onClick={() => !f.conStock && alternar(f.id)} className={cn(f.conStock ? 'text-muted' : 'cursor-pointer hover:bg-canvas/60', marcados.has(f.id) && 'bg-brand-50')}>
                  <td className="td"><input type="checkbox" disabled={f.conStock} checked={marcados.has(f.id)} onChange={() => alternar(f.id)} onClick={(e) => e.stopPropagation()}
                    aria-label={`Marcar ${f.nombre}`} className="size-4 accent-brand-600" /></td>
                  <td className="td text-right font-mono text-xs font-semibold">{f.codigo ?? '—'}</td>
                  <td className="td font-medium">{f.nombre}{f.conStock && <span className="ml-2 text-xs font-normal">· ya tiene cantidad aquí</span>}</td>
                  <td className="td text-xs text-muted">{f.categoria}</td>
                </tr>
              ))}
              {!visibles.length && <tr><td colSpan={4} className="td py-10 text-center text-muted">Sin productos para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </ActionForm>
    </div>
  )
}
