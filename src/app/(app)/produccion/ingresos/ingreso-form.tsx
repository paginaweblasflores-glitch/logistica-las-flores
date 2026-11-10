'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ComboInput } from '@/components/combo-input'
import { Select } from '@/components/select'
import { fmtSoles } from '@/lib/format'
import { registrarIngreso, type LineaIngreso } from '../actions'

type Prod = { id: string; nombre: string; tipo: 'kardex' | 'compra'; unidad: 'KG' | 'UND'; porcion: string | null; usa_sacos: boolean; hueso_grasa: boolean; merma: boolean }
type Opc = { id: string; nombre: string }

const n = (v?: string) => (v === undefined || v === '' ? null : Number(v.replace(',', '.')))

/**
 * Ingreso de proveedor, como en su cuaderno: fecha y hora, proveedor y guía; luego cada producto con
 * sus sacos y/o kilos (papa), o sus kilos y porciones (carnes del kardex), y el precio. El total sale solo.
 */
export function IngresoForm({ productos, proveedores, ahora }: { productos: Prod[]; proveedores: Opc[]; ahora: string }) {
  const [lineas, setLineas] = useState<LineaIngreso[]>([])
  const [vuelta, setVuelta] = useState(0)
  const prod = (id: string) => productos.find((p) => p.id === id)!
  const set = (i: number, k: keyof LineaIngreso, v: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const total = (l: LineaIngreso) => {
    const p = prod(l.producto_id), base = p.unidad === 'KG' ? n(l.kilos) : n(l.cantidad), precio = n(l.precio)
    return precio !== null && base !== null ? precio * base : null
  }
  const suma = lineas.reduce((s, l) => s + (total(l) ?? 0), 0)
  const hayExtra = lineas.some((l) => prod(l.producto_id).hueso_grasa || prod(l.producto_id).merma)
  const celda = (i: number, k: keyof LineaIngreso, label: string, ok: boolean, step = 'any') => ok
    ? <input type="number" step={step} min="0" value={lineas[i][k] ?? ''} onChange={(e) => set(i, k, e.target.value)} aria-label={label} className="field h-8 w-24 text-right tabular" />
    : <span className="block text-center text-xs text-subtle">—</span>

  return (
    <ActionForm action={registrarIngreso} onSuccess={() => { setLineas([]); setVuelta((v) => v + 1) }} className="space-y-4">
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
      <div key={vuelta} className="space-y-4">
        {/* primero los productos que llegaron */}
        <Select options={productos.filter((p) => !lineas.some((l) => l.producto_id === p.id))} value="" placeholder="Agregar producto: carne, papa…"
          onChange={(id) => id && setLineas((ls) => [...ls, { producto_id: id }])} ariaLabel="Agregar producto" />
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr>
              <th className="th w-10">Ítem</th><th className="th">Producto</th><th className="th text-center">Sacos</th><th className="th text-center">Kilos</th>
              <th className="th text-center">Cantidad</th>{hayExtra && <><th className="th text-center">Hueso kg</th><th className="th text-center">Grasa kg</th><th className="th text-center">Merma kg</th></>}
              <th className="th text-center">Precio S/</th><th className="th text-right">Total</th><th className="th w-10" />
            </tr></thead>
            <tbody>
              {lineas.map((l, i) => {
                const p = prod(l.producto_id), t = total(l)
                return (
                  <tr key={l.producto_id}>
                    <td className="td text-muted tabular">{i + 1}</td>
                    <td className="td font-medium">{p.nombre}
                      <span className="block text-[11px] font-normal text-muted">{p.tipo === 'kardex' ? `Kardex · cantidad en ${p.porcion}` : p.unidad === 'KG' ? 'Precio por kilo' : 'Precio por unidad'}</span></td>
                    <td className="td py-1">{celda(i, 'sacos', `Sacos de ${p.nombre}`, p.usa_sacos)}</td>
                    <td className="td py-1">{celda(i, 'kilos', `Kilos de ${p.nombre}`, p.unidad === 'KG')}</td>
                    <td className="td py-1">{celda(i, 'cantidad', `Cantidad de ${p.nombre}`, p.tipo === 'kardex' || p.unidad === 'UND')}</td>
                    {hayExtra && <>
                      <td className="td py-1">{celda(i, 'hueso', `Hueso de ${p.nombre}`, p.hueso_grasa)}</td>
                      <td className="td py-1">{celda(i, 'grasa', `Grasa de ${p.nombre}`, p.hueso_grasa)}</td>
                      <td className="td py-1">{celda(i, 'merma', `Merma de ${p.nombre}`, p.merma)}</td>
                    </>}
                    <td className="td py-1">{celda(i, 'precio', `Precio de ${p.nombre}`, true)}</td>
                    <td className="td text-right font-semibold tabular">{t === null ? '—' : fmtSoles(t)}</td>
                    <td className="td"><button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label={`Quitar ${p.nombre}`}
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-brand-600"><Trash2 className="size-4" /></button></td>
                  </tr>
                )
              })}
              {!lineas.length && <tr><td colSpan={10} className="td py-8 text-center text-muted">Aún no hay productos. Agréguelos con el buscador.</td></tr>}
            </tbody>
            {lineas.length > 0 && <tfoot><tr><td colSpan={hayExtra ? 9 : 6} className="td text-right font-semibold">Total</td><td className="td text-right font-bold tabular">{fmtSoles(suma)}</td><td /></tr></tfoot>}
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label><span className="label">Fecha y hora <span className="req">*</span></span><input type="datetime-local" name="fecha" defaultValue={ahora} required className="field tabular" /></label>
          <div className="md:col-span-2"><span className="label">Proveedor</span><ComboInput name="proveedor" opciones={proveedores} placeholder="Elija o escriba el proveedor" /></div>
          <label><span className="label">N° de guía</span><input name="guia" className="field uppercase" /></label>
          <label className="md:col-span-4"><span className="label">Observación <span className="font-normal text-subtle">(opcional)</span></span><input name="observacion" className="field" /></label>
        </div>
      </div>
      <div className="flex justify-end"><SubmitButton>Registrar ingreso</SubmitButton></div>
    </ActionForm>
  )
}
