'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { useUnidades, factorUnidad, UnidadCelda } from '@/components/unidad-linea'
import { Badge } from '@/components/ui'
import { fmtSoles, ahoraLima } from '@/lib/format'
import { recibirCompra } from '../actions'
import { Select } from '@/components/select'
import { COMPROBANTES } from '@/lib/documentos'
import { CampoGuia } from '@/components/campo-guia'
import { TotalComprobante } from '@/components/total-comprobante'
import { PrecioCelda, ImporteCelda, importeDe, repartirPrecio } from '@/components/precio-linea'

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
  const [rec, setRec] = useState<Record<string, { cant: string; precio: string; vence: string; uni: string; equivale: string; _importe?: string | null; _chica?: string | null }>>(
    Object.fromEntries(lineas.map((l) => [l.id, { cant: String(l.pedido), precio: String(l.precio), vence: '', uni: '', equivale: '' }])))
  const u = useUnidades()
  // cuántas unidades del producto es 1 de la unidad en que se escribió lo que llegó (cajas, paquetes…)
  const fac = (l: LineaRec) => factorUnidad(u, { unidad: l.unidad }, rec[l.id].uni, rec[l.id].equivale) ?? 1
  const hayVence = lineas.some((l) => l.conVencimiento)
  const [totalBoleta, setTotalBoleta] = useState('')
  // el comprobante ya se registró en la compra: no se vuelve a pedir (solo «cambiar» si la boleta trae otro)
  const [cambiarDoc, setCambiarDoc] = useState(!doc?.numero)
  const nombreDoc = COMPROBANTES.find((x) => x.id === (doc?.tipo ?? 'boleta'))?.nombre ?? 'Comprobante'
  const [ahora] = useState(ahoraLima)   // la hora de Lima al abrir el formulario
  const suma = lineas.reduce((s, l) => s + importeDe(rec[l.id].cant, rec[l.id].precio), 0)
  // cambiar un campo de una línea (lo tecleado en «importe» o «por unidad» se olvida: se recalcula)
  const poner = (id: string, cambios: Record<string, string | null>) => setRec((s) => ({ ...s, [id]: { ...s[id], _importe: null, _chica: null, ...cambios } }))
  // «Repartir el descuento» del total del comprobante entre los productos, según su importe
  const repartir = (factor: number) => setRec((s) => Object.fromEntries(Object.entries(s).map(([k, r]) => [k, { ...r, precio: repartirPrecio(r.precio, factor), _importe: null, _chica: null }])))
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cambiarDoc ? <>
          <label><span className="label">Comprobante</span>
            <Select name="tipo_documento" options={COMPROBANTES} defaultValue={doc?.tipo ?? 'boleta'} required /></label>
          <label><span className="label">N° del comprobante</span><input name="numero_documento" defaultValue={doc?.numero ?? ''} className="field" placeholder="B001-000123" /></label>
        </> : (
          <div className="sm:col-span-2"><span className="label">Comprobante</span>
            <input type="hidden" name="tipo_documento" value={doc?.tipo ?? 'boleta'} /><input type="hidden" name="numero_documento" value={doc?.numero ?? ''} />
            <p className="flex h-10 items-center gap-2 text-sm"><b>{nombreDoc} {doc?.numero}</b>
              <button type="button" onClick={() => setCambiarDoc(true)} className="enlace text-xs">cambiar</button></p>
          </div>
        )}
        <TotalComprobante suma={suma} onEscrito={setTotalBoleta} onRepartir={repartir} />
        <label><span className="label">Fecha y hora de llegada</span><input type="datetime-local" name="fecha_entrega" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_entrega_inicial" value={ahora} /></label>
        <CampoGuia />
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
                    onChange={(e) => poner(l.id, { cant: e.target.value })} className="field h-8 text-right tabular" /></td>
                  <td className="td py-1"><UnidadCelda u={u} p={{ unidad: l.unidad }} value={r.uni} equivale={r.equivale} cantidad={r.cant} etiqueta={`Unidad de ${l.producto}`}
                    onUnidad={(v) => poner(l.id, { uni: v })} onEquivale={(v) => poner(l.id, { equivale: v })} /></td>
                  <td className="td py-1"><PrecioCelda precio={r.precio} factor={fac(l)} unidad={l.unidad} chicaEscrita={r._chica} etiqueta={`Precio unitario de ${l.producto}`}
                    onPrecio={(v) => poner(l.id, { precio: v })} onChica={(p, escrito) => poner(l.id, { precio: p, _chica: escrito })} /></td>
                  {hayVence && <td className="td py-1">{l.conVencimiento
                    ? <input type="date" value={r.vence} aria-label={`Vencimiento de ${l.producto}`}
                        onChange={(e) => setRec((s) => ({ ...s, [l.id]: { ...s[l.id], vence: e.target.value } }))} className="field h-8 tabular" />
                    : <span className="block px-1 text-xs text-subtle">—</span>}</td>}
                  <td className="td w-32 py-1"><ImporteCelda cantidad={r.cant} precio={r.precio} escrito={r._importe} etiqueta={`Importe de ${l.producto}`}
                    onImporte={(p, escrito) => poner(l.id, { ...(p !== null ? { precio: p } : {}), _importe: escrito })} /></td>
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
