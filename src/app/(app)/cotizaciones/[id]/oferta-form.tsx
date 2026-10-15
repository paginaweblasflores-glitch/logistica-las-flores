'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { fmtQty, fmtSoles } from '@/lib/format'
import { registrarOferta } from '../actions'
import { ProveedorPicker, type ProveedorOpc } from '@/components/proveedor-picker'
import { CANALES, canalSugerido, type Canal } from '@/lib/proveedor-tipo'

/**
 * Un producto a cotizar. Si se pidió en otra unidad (3 Saco), se cotiza en esa: `cantidadPedida` y `unidadPedido`,
 * y `factor` = unidades del producto que trae cada una (50). `cantidad` está en la unidad del producto.
 */
export type ItemOferta = { id: string; descripcion: string; cantidad: number; unidad: string | null
  cantidadPedida: number | null; unidadPedido: string | null; factor: number }

const n = (v: string | undefined) => (v === undefined || v === '' ? null : Number(String(v).replace(',', '.')))

export function OfertaForm({ cotizacionId, proveedores, items }: { cotizacionId: string; proveedores: ProveedorOpc[]; items: ItemOferta[] }) {
  // productos que cotiza este proveedor (todos marcados al inicio)
  const [marcados, setMarcados] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.id, true])))
  // precio por la unidad del pedido (saco) y, opcional, por unidad suelta
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [sueltos, setSueltos] = useState<Record<string, string>>({})
  const [canal, setCanal] = useState<Canal>('tienda')
  // al guardar se limpia todo para registrar la oferta de otro proveedor
  const [vuelta, setVuelta] = useState(0)
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10)

  const enPedido = (i: ItemOferta) => !!i.unidadPedido && i.factor !== 1
  // precio por unidad del producto (lo que se guarda y se compara): el del saco ÷ lo que trae; si solo dio el suelto, ese
  const porUnidad = (i: ItemOferta) => {
    const p = n(precios[i.id]), s = n(sueltos[i.id])
    if (p !== null) return enPedido(i) ? p / i.factor : p
    return enPedido(i) ? s : null
  }
  const payload = Object.fromEntries(items.filter((i) => marcados[i.id] && porUnidad(i) !== null)
    .map((i) => [i.id, { p: porUnidad(i), u: enPedido(i) ? n(sueltos[i.id]) : null }]))
  const total = items.reduce((s, i) => s + (marcados[i.id] ? (porUnidad(i) ?? 0) * i.cantidad : 0), 0)
  const todos = items.every((i) => marcados[i.id])
  const cant = (i: ItemOferta) => (enPedido(i) ? `${fmtQty(i.cantidadPedida)} ${i.unidadPedido}` : `${fmtQty(i.cantidad)} ${i.unidad ?? ''}`)

  return (
    <ActionForm action={registrarOferta} onSuccess={() => { setPrecios({}); setSueltos({}); setCanal('tienda'); setMarcados(Object.fromEntries(items.map((i) => [i.id, true]))); setVuelta((v) => v + 1) }}>
      <div key={vuelta} className="space-y-4">
      <input type="hidden" name="cotizacion_id" value={cotizacionId} />
      <input type="hidden" name="precios" value={JSON.stringify(payload)} />

      {/* primero, qué productos se cotizan (todos marcados) */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">Productos a cotizar</span>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={todos} onChange={(e) => setMarcados(Object.fromEntries(items.map((i) => [i.id, e.target.checked])))} className="size-4 accent-brand-600" />Todos
          </label>
        </div>
        <div className="divide-y divide-line rounded-lg border border-line">
          {items.map((i) => (
            <label key={i.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
              <input type="checkbox" checked={marcados[i.id]} onChange={(e) => setMarcados((m) => ({ ...m, [i.id]: e.target.checked }))} aria-label={`Cotizar ${i.descripcion}`} className="size-4 shrink-0 accent-brand-600" />
              <span className={marcados[i.id] ? '' : 'text-muted'}>{i.descripcion} <span className="text-xs text-muted">× {cant(i)}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div><span className="label">Proveedor o tienda *</span><ProveedorPicker name="proveedor" proveedores={proveedores} required onChange={(p) => setCanal(canalSugerido(p?.tipo))} /></div>
        <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoy} className="field" /></label>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="label">¿Cómo se compra? *</legend>
        {CANALES.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="canal" value={c.id} checked={canal === c.id} onChange={() => setCanal(c.id)} className="size-4 accent-brand-600" />{c.nombre}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted">Si el proveedor ya cotizó de la misma forma, se registrará como una nueva ronda. Para comparar una cadena en tienda y por internet, registre una oferta de cada forma. ¿No está en la lista? Escríbalo y use “Agregar como proveedor nuevo”.</p>
      {/* los precios que ofrece (de los productos marcados) */}
      <div className="space-y-2">
        {items.filter((i) => marcados[i.id]).map((i) => {
          const pu = porUnidad(i)
          return (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span>{i.descripcion} <span className="text-xs text-muted">× {cant(i)}</span>
                {enPedido(i) && <span className="block text-[11px] text-muted">1 {i.unidadPedido!.toLowerCase()} = {fmtQty(i.factor)} {i.unidad}</span>}</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted">S/ por {enPedido(i) ? i.unidadPedido!.toLowerCase() : (i.unidad ?? 'unidad')}
                  <input type="number" step="any" min="0" value={precios[i.id] ?? ''} onChange={(e) => setPrecios((s) => ({ ...s, [i.id]: e.target.value }))}
                    aria-label={`Precio de ${i.descripcion}`} className="field h-8 w-28 text-right tabular" /></label>
                {enPedido(i) && (
                  <label className="flex items-center gap-1.5 text-xs text-muted">por {i.unidad} <span className="text-subtle">(opcional)</span>
                    <input type="number" step="any" min="0" value={sueltos[i.id] ?? ''} placeholder={pu !== null && n(precios[i.id]) !== null ? pu.toFixed(2) : ''}
                      onChange={(e) => setSueltos((s) => ({ ...s, [i.id]: e.target.value }))}
                      aria-label={`Precio por unidad de ${i.descripcion}`} className="field h-8 w-24 text-right tabular" /></label>
                )}
              </div>
            </div>
          )
        })}
      </div>


      {/* siempre a la vista, aunque la lista de productos sea larga */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t border-line bg-white px-5 py-3">
        <span className="text-sm">Total oferta: <b className="tabular">{fmtSoles(total)}</b></span>
        <SubmitButton>Guardar oferta</SubmitButton>
      </div>
      </div>
    </ActionForm>
  )
}
