'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { guardarVenta } from '../actions'

type Plato = { id: string; nombre: string; carnes: { producto: string; porcion: string | null; factor: number; concepto: string }[] }
const n = (v?: string) => (v === undefined || v === '' ? 0 : Number(v.replace(',', '.')) || 0)
const fmt = (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 2 })

/**
 * La hojita de venta: platos vendidos en dos hojas que se suman. Abajo, la carne que eso descuenta del kardex
 * (cuy medio = ½ cuy; mixto = ½ cuy + ⅔ de chicharrón; puca = ⅓ de chicharrón para el aderezo).
 */
export function VentaForm({ fecha, platos, inicial, observacion }: {
  fecha: string; platos: Plato[]; inicial: Record<string, { hoja1: number; hoja2: number }>; observacion: string | null
}) {
  const [h, setH] = useState<Record<string, { hoja1: string; hoja2: string }>>(() =>
    Object.fromEntries(platos.map((p) => [p.id, { hoja1: inicial[p.id]?.hoja1 ? String(inicial[p.id].hoja1) : '', hoja2: inicial[p.id]?.hoja2 ? String(inicial[p.id].hoja2) : '' }])))
  const set = (id: string, k: 'hoja1' | 'hoja2', v: string) => setH((s) => ({ ...s, [id]: { ...s[id], [k]: v } }))
  const total = (id: string) => n(h[id]?.hoja1) + n(h[id]?.hoja2)

  // carne que descuenta, por carne y concepto (venta / puca)
  const carne = new Map<string, { producto: string; porcion: string | null; concepto: string; cantidad: number }>()
  for (const p of platos) for (const c of p.carnes) {
    const k = `${c.producto}|${c.concepto}`
    const r = carne.get(k) ?? { producto: c.producto, porcion: c.porcion, concepto: c.concepto, cantidad: 0 }
    r.cantidad += total(p.id) * c.factor
    carne.set(k, r)
  }
  const descuenta = [...carne.values()].filter((r) => r.cantidad)
  const lineas = platos.map((p) => ({ plato_id: p.id, hoja1: n(h[p.id]?.hoja1), hoja2: n(h[p.id]?.hoja2) }))
  const platosTotal = platos.reduce((s, p) => s + total(p.id), 0)

  return (
    <ActionForm action={guardarVenta} className="space-y-4">
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Plato</th><th className="th w-32 text-center">Hoja 1</th><th className="th w-32 text-center">Hoja 2</th><th className="th w-24 text-right">Total</th></tr></thead>
            <tbody>
              {platos.map((p) => (
                <tr key={p.id}>
                  <td className="td font-medium">{p.nombre}</td>
                  {(['hoja1', 'hoja2'] as const).map((k) => (
                    <td key={k} className="td py-1">
                      <input type="number" step="any" min="0" value={h[p.id]?.[k] ?? ''} onChange={(e) => set(p.id, k, e.target.value)} onFocus={(e) => e.target.select()}
                        aria-label={`${p.nombre} ${k === 'hoja1' ? 'hoja 1' : 'hoja 2'}`} className="field h-8 text-right tabular" />
                    </td>
                  ))}
                  <td className="td text-right font-semibold tabular">{total(p.id) ? fmt(total(p.id)) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="td text-right font-semibold">Platos del día</td><td className="td text-right font-bold tabular">{fmt(platosTotal)}</td></tr></tfoot>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">Descuenta del kardex</p>
            {descuenta.length ? (
              <ul className="divide-y divide-line text-sm">
                {descuenta.map((r) => (
                  <li key={`${r.producto}|${r.concepto}`} className="flex items-center justify-between px-4 py-2">
                    <span>{r.producto}{r.concepto !== 'venta' && <span className="ml-1.5 text-xs text-muted">({r.concepto === 'puca' ? 'puca' : r.concepto})</span>}</span>
                    <b className="tabular">{fmt(Math.round(r.cantidad * 100) / 100)} <span className="font-normal text-muted">{r.porcion}</span></b>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-6 text-center text-sm text-muted">Escriba los platos vendidos.</p>}
          </div>
          <label className="block"><span className="label">Observación <span className="font-normal text-subtle">(opcional)</span></span>
            <input name="observacion" defaultValue={observacion ?? ''} className="field" /></label>
          <div className="flex justify-end"><SubmitButton>Guardar venta del día</SubmitButton></div>
        </div>
      </div>
    </ActionForm>
  )
}
