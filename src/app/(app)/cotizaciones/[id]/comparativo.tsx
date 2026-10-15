'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { etiquetaCanal, nombreOferta } from '@/lib/proveedor-tipo'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { adjudicar } from '../actions'

export type ItemCmp = { id: string; descripcion: string; cantidad: number; unidad: string | null; ganadora: string | null
  /** pedido en otra unidad (3 Saco): se muestra y se compara por esa unidad; factor = unidades del producto por cada una */
  cantidadPedida?: number | null; unidadPedido?: string | null; factor?: number }
export type OfertaCmp = { id: string; proveedor: string; canal: string | null; ronda: number; fecha: string; vigente: boolean; precios: Record<string, number>
  /** precio por unidad suelta que dio el proveedor (opcional) */
  sueltos?: Record<string, number>
  /** cargada con «Usar estos precios» (de una cotización anterior) */
  anterior?: boolean }

const NO = '' // "no comprar" este producto

/**
 * Cuadro comparativo. Con la cotización abierta, en cada producto se elige el proveedor (viene marcado el más
 * barato de las ofertas vigentes) y se adjudica todo de una vez: se generará una compra por cada proveedor ganador.
 */
export function Comparativo({ cotizacionId, abierta, items, ofertas }: { cotizacionId: string; abierta: boolean; items: ItemCmp[]; ofertas: OfertaCmp[] }) {
  const vigentes = ofertas.filter((o) => o.vigente)
  const masBarata = (item: string) => vigentes
    .filter((o) => o.precios[item] !== undefined)
    .reduce<OfertaCmp | null>((m, o) => (!m || o.precios[item] < m.precios[item] ? o : m), null)

  const [eleccion, setEleccion] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, masBarata(i.id)?.id ?? NO])))

  const grupos = useMemo(() => {
    const m = new Map<string, { oferta: OfertaCmp; productos: number; total: number }>()
    for (const i of items) {
      const o = vigentes.find((x) => x.id === eleccion[i.id])
      if (!o) continue
      const g = m.get(o.id) ?? { oferta: o, productos: 0, total: 0 }
      g.productos += 1; g.total += o.precios[i.id] * Number(i.cantidad)
      m.set(o.id, g)
    }
    return [...m.values()]
  }, [eleccion, items, vigentes])
  const sinProveedor = items.filter((i) => !eleccion[i.id])
  // en el cuadro solo los productos que algún proveedor cotizó
  const cotizados = items.filter((i) => ofertas.some((o) => o.precios[i.id] !== undefined))
  const enPedido = (i: ItemCmp) => !!i.unidadPedido && !!i.factor && i.factor !== 1
  const total = (o: OfertaCmp) => items.reduce((s, i) => s + Number(o.precios[i.id] ?? 0) * Number(i.cantidad), 0)

  const tabla = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th">Producto</th><th className="th text-right">Cant.</th>
            {ofertas.map((o) => (
              <th key={o.id} className={cn('th text-right', !o.vigente && 'opacity-60')}>
                {o.proveedor}<span className="block font-normal normal-case">{o.canal && <>{etiquetaCanal(o.canal)} · </>}{o.ronda}ª ronda · {fmtDate(o.fecha)}{o.anterior && <span className="block font-semibold text-amber-700">Precios de una cotización anterior</span>}</span>
              </th>
            ))}
            {abierta && <th className="th no-print text-center">No comprar</th>}
          </tr>
        </thead>
        <tbody>
          {cotizados.map((i) => {
            const barata = masBarata(i.id)
            return (
              <tr key={i.id}>
                <td className="td font-medium">{i.descripcion}</td>
                <td className="td text-right tabular">{enPedido(i)
                  ? <>{fmtQty(i.cantidadPedida)} <span className="text-xs text-muted">{i.unidadPedido}</span><span className="block text-[11px] text-muted">= {fmtQty(i.cantidad)} {i.unidad}</span></>
                  : <>{fmtQty(i.cantidad)} <span className="text-xs text-muted">{i.unidad}</span></>}</td>
                {ofertas.map((o) => {
                  const p = o.precios[i.id]
                  const gana = abierta ? eleccion[i.id] === o.id : i.ganadora === o.id
                  const elegible = abierta && o.vigente && p !== undefined
                  return (
                    <td key={o.id} className={cn('td text-right tabular', gana && 'bg-leaf-50', !o.vigente && 'opacity-60')}>
                      {p === undefined ? <span className="text-subtle">—</span> : (
                        <label className={cn('flex items-start justify-end gap-2', elegible && 'cursor-pointer')}>
                          <span>
                            {/* precio por saco/paquete (si se pidió así) y, debajo, por unidad y el total */}
                            <span className={cn(barata?.id === o.id && 'font-bold text-leaf-600')}>{fmtSoles(enPedido(i) ? p * i.factor! : p)}{enPedido(i) && <span className="text-xs font-normal"> /{i.unidadPedido!.toLowerCase()}</span>}</span>
                            {enPedido(i) && <span className="block text-[11px] font-normal text-muted">{fmtSoles(o.sueltos?.[i.id] ?? p)} /{i.unidad}</span>}
                            <span className="block text-xs font-normal text-muted">{fmtSoles(p * Number(i.cantidad))}</span>
                          </span>
                          {elegible && <input type="radio" name={`g-${i.id}`} checked={gana} onChange={() => setEleccion((e) => ({ ...e, [i.id]: o.id }))}
                            aria-label={`Comprar ${i.descripcion} a ${nombreOferta(o)}`} className="no-print mt-0.5 size-4 accent-leaf-600" />}
                          {!abierta && gana && <Check className="mt-0.5 size-4 text-leaf-600" aria-label="Ganador" />}
                        </label>
                      )}
                    </td>
                  )
                })}
                {abierta && (
                  <td className="td no-print text-center">
                    <input type="radio" name={`g-${i.id}`} checked={!eleccion[i.id]} onChange={() => setEleccion((e) => ({ ...e, [i.id]: NO }))}
                      aria-label={`No comprar ${i.descripcion}`} className="size-4 accent-brand-600" />
                  </td>
                )}
              </tr>
            )
          })}
          <tr className="bg-canvas/70">
            <td className="td font-bold" colSpan={2}>Total de cada oferta</td>
            {ofertas.map((o) => <td key={o.id} className={cn('td text-right font-bold tabular', !o.vigente && 'opacity-60')}>{fmtSoles(total(o))}</td>)}
            {abierta && <td className="td no-print" />}
          </tr>
        </tbody>
      </table>
    </div>
  )

  if (!abierta) return tabla

  const totalElegido = grupos.reduce((s, g) => s + g.total, 0)
  return (
    <ActionForm action={adjudicar}>
      <input type="hidden" name="cotizacion_id" value={cotizacionId} />
      <input type="hidden" name="ganadores" value={JSON.stringify(eleccion)} />
      {tabla}
      <div className="no-print space-y-3 border-t border-line p-4">
        <p className="text-xs text-muted">
          En cada producto viene marcado el precio más bajo (de la última ronda de cada proveedor). Cambie la marca si prefiere otro
          proveedor por calidad, plazo o para juntar productos en una sola compra.
        </p>
        {grupos.length > 0 && (
          <div>
            <p className="label">Se generará {grupos.length === 1 ? '1 compra' : `${grupos.length} compras, una por proveedor`}</p>
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line text-sm">
              {grupos.map((g) => (
                <li key={g.oferta.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span><b>{nombreOferta(g.oferta)}</b> <span className="text-xs text-muted">· {g.productos} {g.productos === 1 ? 'producto' : 'productos'}</span></span>
                  <span className="font-semibold tabular">{fmtSoles(g.total)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-canvas/60 px-3 py-2 font-bold"><span>Total</span><span className="tabular">{fmtSoles(totalElegido)}</span></li>
            </ul>
          </div>
        )}
        {sinProveedor.length > 0 && (
          <p className="text-xs font-semibold text-brand-700">No se comprará: {sinProveedor.map((i) => i.descripcion).join(', ')}.</p>
        )}
        <div className="flex justify-end">
          {grupos.length > 0
            ? <SubmitButton confirm={`¿Adjudicar? Se generará${grupos.length === 1 ? ' 1 compra' : `n ${grupos.length} compras (una por proveedor)`} por ${fmtSoles(totalElegido)}. Después ya no se pueden cambiar los precios ni los ganadores.`}>Adjudicar</SubmitButton>
            : <p className="text-sm text-muted">Marque al menos un producto con su proveedor para adjudicar.</p>}
        </div>
      </div>
    </ActionForm>
  )
}
