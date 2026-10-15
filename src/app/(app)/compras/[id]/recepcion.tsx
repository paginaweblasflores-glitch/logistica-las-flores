'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { useUnidades, factorUnidad, UnidadCelda } from '@/components/unidad-linea'
import { Badge } from '@/components/ui'
import { fmtSoles } from '@/lib/format'
import { recibirCompra } from '../actions'
import { Select } from '@/components/select'
import { COMPROBANTES } from '@/lib/documentos'

type LineaRec = { id: string; producto: string; unidad: string; pedido: number; precio: number
  /** producto con «Controlar vencimiento (FIFO)»: llega con su fecha de vencimiento */
  conVencimiento?: boolean }
const num = (v: string) => Number(String(v).replace(',', '.'))

/**
 * Llegada de la compra con la boleta en mano: cantidad que llegó y PRECIO UNITARIO de la boleta por producto
 * (viene el de la orden; si la boleta trae otro, se cambia y queda marcado para Logística).
 * `alStock`: los productos del catálogo suben al stock; si todo es fuera de catálogo, solo queda la llegada.
 */
export function Recepcion({ id, lineas, alStock = true, doc }: {
  id: string; lineas: LineaRec[]; alStock?: boolean; doc?: { tipo: string | null; numero: string | null }
}) {
  const [rec, setRec] = useState<Record<string, { cant: string; precio: string; vence: string; uni: string; equivale: string }>>(
    Object.fromEntries(lineas.map((l) => [l.id, { cant: String(l.pedido), precio: String(l.precio), vence: '', uni: '', equivale: '' }])))
  const u = useUnidades()
  // cuántas unidades del producto es 1 de la unidad en que se escribió lo que llegó (cajas, paquetes…)
  const fac = (l: LineaRec) => factorUnidad(u, { unidad: l.unidad }, rec[l.id].uni, rec[l.id].equivale) ?? 1
  const hayVence = lineas.some((l) => l.conVencimiento)
  const [totalBoleta, setTotalBoleta] = useState('')
  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16)
  const suma = lineas.reduce((s, l) => s + (num(rec[l.id].cant) || 0) * (num(rec[l.id].precio) || 0), 0)
  const incompleta = lineas.some((l) => num(rec[l.id].cant) * fac(l) < l.pedido)
  const conDiferencia = lineas.filter((l) => rec[l.id].precio !== '' && Math.abs(num(rec[l.id].precio) / fac(l) - l.precio) > 0.00005)
  const noCuadra = totalBoleta !== '' && Math.abs(num(totalBoleta) - suma) > 0.05
  // cantidad y precio en la unidad del producto
  const payload = lineas.map((l) => ({ id: l.id, cantidad: Math.round((num(rec[l.id].cant) || 0) * fac(l) * 10000) / 10000,
    precio: Math.round(((num(rec[l.id].precio) || 0) / fac(l)) * 10000) / 10000, fecha_vencimiento: rec[l.id].vence || null }))

  return (
    <ActionForm action={recibirCompra} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lineas" value={JSON.stringify(payload)} />

      <div className="grid gap-3 sm:grid-cols-4">
        <label><span className="label">Comprobante</span>
          <Select name="tipo_documento" options={COMPROBANTES} defaultValue={doc?.tipo ?? 'boleta'} required /></label>
        <label><span className="label">N° del comprobante</span><input name="numero_documento" defaultValue={doc?.numero ?? ''} className="field" placeholder="B001-000123" /></label>
        <label><span className="label">Total del comprobante (S/)</span>
          <input name="total_documento" inputMode="decimal" value={totalBoleta} onChange={(e) => setTotalBoleta(e.target.value)} className="field tabular" placeholder={suma.toFixed(2)} /></label>
        <label><span className="label">Fecha y hora de llegada</span><input type="datetime-local" name="fecha_entrega" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_entrega_inicial" value={ahora} /></label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th">Producto</th><th className="th text-right">Pedido</th><th className="th w-28 text-right">Llegó</th><th className="th w-40">Unidad</th>
            <th className="th w-36 text-right">Precio</th>{hayVence && <th className="th w-40">Vencimiento</th>}<th className="th text-right">Total</th></tr></thead>
          <tbody>
            {lineas.map((l) => {
              const r = rec[l.id]
              const dif = r.precio !== '' && Math.abs(num(r.precio) / fac(l) - l.precio) > 0.00005
              return (
                <tr key={l.id}>
                  <td className="td"><span className="font-medium">{l.producto}</span>
                    {dif && <span className="mt-0.5 block"><Badge tone="amber">Orden: {fmtSoles(l.precio)} · {num(r.precio) / fac(l) > l.precio ? 'subió' : 'bajó'}</Badge></span>}</td>
                  <td className="td text-right tabular">{l.pedido} {l.unidad}</td>
                  <td className="td py-1"><input inputMode="decimal" value={r.cant} aria-label={`Llegó de ${l.producto}`} onFocus={(e) => e.target.select()}
                    onChange={(e) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], cant: e.target.value } }))} className="field h-8 text-right tabular" /></td>
                  <td className="td py-1"><UnidadCelda u={u} p={{ unidad: l.unidad }} value={r.uni} equivale={r.equivale} cantidad={r.cant} etiqueta={`Unidad de ${l.producto}`}
                    onUnidad={(v) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], uni: v } }))} onEquivale={(v) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], equivale: v } }))} /></td>
                  <td className="td py-1"><input inputMode="decimal" value={r.precio} aria-label={`Precio unitario de ${l.producto}`} onFocus={(e) => e.target.select()}
                    onChange={(e) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], precio: e.target.value } }))} className="field h-8 text-right tabular" /></td>
                  {hayVence && <td className="td py-1">{l.conVencimiento
                    ? <input type="date" value={r.vence} aria-label={`Vencimiento de ${l.producto}`}
                        onChange={(e) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], vence: e.target.value } }))} className="field h-8 tabular" />
                    : <span className="block px-1 text-xs text-subtle">—</span>}</td>}
                  <td className="td text-right font-semibold tabular">{fmtSoles((num(r.cant) || 0) * (num(r.precio) || 0))}</td>
                </tr>
              )
            })}
            <tr className="bg-canvas/60"><td className="td text-right font-semibold" colSpan={hayVence ? 6 : 5}>Suma</td><td className="td text-right text-base font-bold tabular">{fmtSoles(suma)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-sm">
        {noCuadra && <p className="font-semibold text-brand-700">El total del comprobante ({fmtSoles(num(totalBoleta))}) no cuadra con la suma ({fmtSoles(suma)}). Revise cantidades y precios.</p>}
        {conDiferencia.length > 0 && <p className="text-amber-700">{conDiferencia.length === 1 ? '1 producto tiene' : `${conDiferencia.length} productos tienen`} un precio distinto al de la orden: quedará marcado para Logística.</p>}
        {incompleta && <p className="text-amber-700">La entrega quedará registrada como <b>incompleta</b> (afecta el indicador IF).</p>}
      </div>
      <div className="flex justify-end">
        <SubmitButton confirm={alStock ? '¿Confirmar la llegada? Los productos del almacén se sumarán al stock con estos precios.' : '¿Confirmar la llegada? Se registra la fecha, lo que llegó y su precio (estos bienes no entran al almacén).'}>Confirmar llegada</SubmitButton>
      </div>
    </ActionForm>
  )
}
