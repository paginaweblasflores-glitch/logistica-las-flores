'use client'

import { useMemo, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { fmtQty } from '@/lib/format'
import { guardarVenta } from './actions'
import { Select } from '@/components/select'

type Item = { id: string; codigo: string; nombre: string; conversiones: { producto: string; factor: number }[] }

export function VentaForm({ localId, almacenes, fecha, items, inicial, registrador }: {
  localId: string; almacenes: { id: string; nombre: string }[]; fecha: string; items: Item[]
  inicial: Record<string, { salon: string; llevar: string }>; registrador: string
}) {
  const [v, setV] = useState(inicial)
  const set = (id: string, k: 'salon' | 'llevar', val: string) => setV((s) => ({ ...s, [id]: { ...(s[id] ?? { salon: '', llevar: '' }), [k]: val } }))
  // Consumo teórico de cada carne según las reglas de conversión
  const consumo = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      const q = (Number(v[it.id]?.salon) || 0) + (Number(v[it.id]?.llevar) || 0)
      for (const c of it.conversiones) m.set(c.producto, (m.get(c.producto) ?? 0) + q * c.factor)
    }
    return [...m.entries()].filter(([, q]) => q > 0)
  }, [v, items])

  return (
    <ActionForm action={guardarVenta} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <input type="hidden" name="local_id" value={localId} />
      <input type="hidden" name="items" value={JSON.stringify(v)} />
      <div>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={fecha} className="field" /></label>
          <label><span className="label">Registrado por</span><input name="registrado_por" defaultValue={registrador} className="field" /></label>
          <label><span className="label">Cocina (Kardex)</span>
            <Select name="almacen" options={almacenes} defaultValue={almacenes[0]?.id} required />
          </label>
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Producto vendido</th><th className="th w-28">Salón</th><th className="th w-28">Para llevar</th><th className="th text-right">Total</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="td font-medium">{it.nombre}<span className="block text-xs text-muted">{it.conversiones.map((c) => `${c.producto} ×${Number(c.factor.toFixed(3))}`).join(' + ')}</span></td>
                  <td className="td py-1"><input type="number" min="0" step="0.5" value={v[it.id]?.salon ?? ''} onChange={(e) => set(it.id, 'salon', e.target.value)} className="field h-8 tabular" aria-label={`Salón ${it.nombre}`} /></td>
                  <td className="td py-1"><input type="number" min="0" step="0.5" value={v[it.id]?.llevar ?? ''} onChange={(e) => set(it.id, 'llevar', e.target.value)} className="field h-8 tabular" aria-label={`Llevar ${it.nombre}`} /></td>
                  <td className="td text-right font-semibold tabular">{fmtQty((Number(v[it.id]?.salon) || 0) + (Number(v[it.id]?.llevar) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-canvas/50 p-4">
          <p className="mb-2 text-sm font-bold">Consumo que se descontará del Kardex</p>
          <ul className="space-y-1.5 text-sm">
            {consumo.map(([p, q]) => <li key={p} className="flex justify-between"><span>{p}</span><b className="tabular">{fmtQty(Math.round(q * 1000) / 1000)}</b></li>)}
            {!consumo.length && <li className="text-muted">Ingrese las cantidades vendidas.</li>}
          </ul>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="generar" defaultChecked className="mt-0.5 size-4 accent-brand-600" />
          <span>Registrar la salida por <b>VENTA</b> en el Kardex de carnes (evita digitar dos veces). Si ya existía para este día, se reemplaza.</span></label>
        <input name="observacion" placeholder="Observación del día" className="field" />
        <SubmitButton className="w-full">Guardar venta del día</SubmitButton>
      </div>
    </ActionForm>
  )
}
