'use client'

import { Fragment, useMemo, useState } from 'react'
import { Eye, EyeOff, Save, Search } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { fmtQty, fmtSoles } from '@/lib/format'
import { cn } from '@/lib/utils'
import { guardarConteo } from '../actions'
import { usePagina } from '@/components/pager'
import { ProductoFoto } from '@/components/producto-foto'
import { Select } from '@/components/select'

export type Detalle = {
  id: string; producto: string; codigo: string; unidad: string; categoria: string | null; imagen_url: string | null
  stock_sistema: number; costo_unitario: number; conteo_1: number | null; conteo_2: number | null; conteo_3: number | null
  cantidad_fisica: number | null; aplica_descuento: boolean; precio_descuento: number | null; observacion: string | null
}
type Edit = Partial<Record<'conteo_1' | 'conteo_2' | 'conteo_3' | 'cantidad_fisica' | 'precio_descuento' | 'observacion', string>> & { aplica_descuento?: boolean }

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)))

export function HojaConteo({ conteoId, rows, modo, editable }: {
  conteoId: string; rows: Detalle[]; modo: 'conteo' | 'verificacion'; editable: boolean
}) {
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [ciego, setCiego] = useState(modo === 'conteo')
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'diferencia'>(modo === 'verificacion' ? 'diferencia' : 'todos')
  const [q, setQ] = useState('')
  // se cuenta por categoría (cerveza, gaseosa, limpieza…): la hoja va agrupada y se puede ver una sola
  const [cat, setCat] = useState('')
  const categorias = useMemo(() => [...new Set(rows.map((r) => r.categoria ?? 'Sin categoría'))].sort(), [rows])

  const val = (r: Detalle, k: keyof Edit): string => {
    const e = edits[r.id]?.[k]
    if (e !== undefined) return String(e)
    return k === 'observacion' ? r.observacion ?? '' : str(r[k as keyof Detalle] as number | null)
  }
  const final = (r: Detalle): number | null => {
    const e = edits[r.id]
    if (e?.cantidad_fisica !== undefined) return e.cantidad_fisica === '' ? null : Number(e.cantidad_fisica)
    if (e && (e.conteo_1 !== undefined || e.conteo_2 !== undefined || e.conteo_3 !== undefined)) {
      for (const k of ['conteo_3', 'conteo_2', 'conteo_1'] as const) { const v = val(r, k); if (v !== '') return Number(v) }
      return null
    }
    return r.cantidad_fisica === null ? null : Number(r.cantidad_fisica)
  }
  const set = (id: string, k: keyof Edit, v: string | boolean) => setEdits((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (cat && (r.categoria ?? 'Sin categoría') !== cat) return false
      if (t && !r.producto.toLowerCase().includes(t) && !r.codigo.toLowerCase().includes(t)) return false
      const f = final(r)
      if (filtro === 'pendientes') return f === null
      if (filtro === 'diferencia') return f !== null && f !== Number(r.stock_sistema)
      return true
    }).sort((a, b) => (a.categoria ?? 'Sin categoría').localeCompare(b.categoria ?? 'Sin categoría') || a.producto.localeCompare(b.producto))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filtro, edits, cat])

  const pag = usePagina(visibles)
  const contados = rows.filter((r) => final(r) !== null).length
  const cambios = Object.keys(edits).length
  const payload = JSON.stringify(Object.entries(edits).map(([id, e]) => ({ id, ...e })))

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-col="${e.currentTarget.dataset.col}"]`))
    const i = inputs.indexOf(e.currentTarget)
    inputs[i + 1]?.focus(); inputs[i + 1]?.select()
  }

  return (
    <ActionForm action={guardarConteo} className="space-y-3" onSuccess={() => setEdits({})}>
      <input type="hidden" name="conteo_id" value={conteoId} />
      <input type="hidden" name="items" value={payload} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la hoja…" className="field pl-9" />
        </div>
        <Select value={cat} onChange={setCat} options={categorias.map((c) => ({ id: c, nombre: c }))} placeholder="Todas las categorías" className="h-9 w-52" ariaLabel="Categoría" />
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-xs font-semibold">
          {(['todos', 'pendientes', 'diferencia'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
                    className={cn('rounded-md px-3 py-1.5 capitalize', filtro === f ? 'bg-ink-900 text-white' : 'text-muted')}>
              {f === 'diferencia' ? 'Con diferencia' : f === 'pendientes' ? 'Sin contar' : 'Todos'}
            </button>
          ))}
        </div>
        {modo === 'conteo' && (
          <button type="button" onClick={() => setCiego((c) => !c)} className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-semibold">
            {ciego ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {ciego ? 'Conteo a ciegas' : 'Mostrando sistema'}
          </button>
        )}
        <span className="text-xs text-muted tabular">Contados {contados}/{rows.length}</span>
        {editable && (
          <SubmitButton className="ml-auto" variant={cambios ? 'primary' : 'outline'}>
            <Save className="size-4" /> Guardar {cambios ? `(${cambios})` : ''}
          </SubmitButton>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line"><div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="th w-12">Ítem</th>
              <th className="th">Producto</th>
              {(!ciego || modo === 'verificacion') && <th className="th text-right">Sistema</th>}
              {modo === 'conteo' ? (
                <>
                  <th className="th w-28">Conteo 1</th><th className="th w-28">Reconteo 2</th><th className="th w-28">Reconteo 3</th>
                  <th className="th text-right">Final</th>
                  {!ciego && <th className="th text-right">Diferencia</th>}
                </>
              ) : (
                <>
                  <th className="th w-28">Físico final</th><th className="th text-right">Diferencia</th><th className="th text-right">Costo</th>
                  <th className="th text-right">Valor dif.</th><th className="th">Descontar</th><th className="th w-28">Precio desc.</th><th className="th">Observación</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pag.visibles.map((r, idx) => {
              const i = pag.offset + idx
              const f = final(r)
              const dif = f === null ? null : f - Number(r.stock_sistema)
              const dirty = !!edits[r.id]
              const grupo = r.categoria ?? 'Sin categoría'
              const nuevoGrupo = idx === 0 || (pag.visibles[idx - 1].categoria ?? 'Sin categoría') !== grupo
              return (
                <Fragment key={r.id}>
                {nuevoGrupo && <tr><td colSpan={10} className="border-b border-line bg-canvas px-3 py-1.5 text-xs font-bold tracking-wide uppercase">{grupo}</td></tr>}
                <tr className={cn(dirty && 'bg-amber-50/60', dif !== null && dif !== 0 && !ciego && 'bg-brand-50/30')}>
                  <td className="td text-xs text-muted tabular">{i + 1}</td>
                  <td className="td">
                    <span className="flex items-center gap-3">
                      <ProductoFoto src={r.imagen_url} alt={r.producto} size="md" />
                      <span className="min-w-0">
                        <span className="block font-medium">{r.producto}</span>
                        <span className="text-xs text-muted">{r.codigo} · {r.unidad}</span>
                      </span>
                    </span>
                  </td>
                  {(!ciego || modo === 'verificacion') && <td className="td text-right tabular">{fmtQty(r.stock_sistema)}</td>}
                  {modo === 'conteo' ? (
                    <>
                      {(['conteo_1', 'conteo_2', 'conteo_3'] as const).map((k) => (
                        <td key={k} className="td py-1">
                          <input data-col={k} type="number" step="any" min="0" disabled={!editable} value={val(r, k)} onKeyDown={onKey}
                                 onChange={(e) => set(r.id, k, e.target.value)} className="field h-8 tabular" aria-label={`${k} ${r.producto}`} />
                        </td>
                      ))}
                      <td className="td text-right font-bold tabular">{fmtQty(f)}</td>
                      {!ciego && <td className={cn('td text-right font-semibold tabular', dif! > 0 && 'text-leaf-600', dif! < 0 && 'text-brand-700')}>{dif === null ? '' : (dif > 0 ? '+' : '') + fmtQty(dif)}</td>}
                    </>
                  ) : (
                    <>
                      <td className="td py-1">
                        <input data-col="cantidad_fisica" type="number" step="any" min="0" disabled={!editable} value={f === null ? '' : String(f)} onKeyDown={onKey}
                               onChange={(e) => set(r.id, 'cantidad_fisica', e.target.value)} className="field h-8 tabular" />
                      </td>
                      <td className={cn('td text-right font-semibold tabular', dif! > 0 && 'text-leaf-600', dif! < 0 && 'text-brand-700')}>{dif === null ? '' : (dif > 0 ? '+' : '') + fmtQty(dif)}</td>
                      <td className="td text-right text-muted tabular">{fmtSoles(r.costo_unitario)}</td>
                      <td className="td text-right font-semibold tabular">{dif === null ? '' : fmtSoles(dif * Number(r.costo_unitario))}</td>
                      <td className="td">
                        {dif !== null && dif < 0 && (
                          <input type="checkbox" disabled={!editable} className="size-4 accent-brand-600"
                                 checked={edits[r.id]?.aplica_descuento ?? r.aplica_descuento}
                                 onChange={(e) => set(r.id, 'aplica_descuento', e.target.checked)} aria-label="Aplicar descuento" />
                        )}
                      </td>
                      <td className="td py-1">
                        {dif !== null && dif < 0 && (
                          <input type="number" step="any" min="0" disabled={!editable} value={val(r, 'precio_descuento')} placeholder={String(Number(r.costo_unitario))}
                                 onChange={(e) => set(r.id, 'precio_descuento', e.target.value)} className="field h-8 tabular" />
                        )}
                      </td>
                      <td className="td py-1">
                        <input type="text" disabled={!editable} value={val(r, 'observacion')} onChange={(e) => set(r.id, 'observacion', e.target.value)} className="field h-8" />
                      </td>
                    </>
                  )}
                </tr>
                </Fragment>
              )
            })}
            {!visibles.length && <tr><td colSpan={10} className="td py-10 text-center text-muted">No hay productos para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {pag.barra}
      </div>
    </ActionForm>
  )
}
