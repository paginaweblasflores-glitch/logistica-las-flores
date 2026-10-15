'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ProductPicker, type ProductoLite } from '@/components/product-picker'
import { useUnidades, factorUnidad, UnidadCelda } from '@/components/unidad-linea'
import { Badge } from '@/components/ui'
import { fmtSoles } from '@/lib/format'
import { registrarEntradaCompra } from '../../compras/actions'
import { Select } from '@/components/select'
import { COMPROBANTES } from '@/lib/documentos'
import { ProveedorPicker, type ProveedorOpc } from '@/components/proveedor-picker'
import { TotalComprobante } from '@/components/total-comprobante'

export type LineaPedida = { detalle_id: string; producto_id: string; codigo: string; nombre: string; unidad: string; pedido: number; controla_lote: boolean
  /** último precio de compra: viene sugerido; solo se cambia si la boleta trae otro */
  ultimo?: number | null
  /** unidad del producto y, si es empaque, cuánto trae (para escribir lo que llegó en otra unidad) */
  unidad_id?: string | null; contenido?: number | null; contenido_unidad_id?: string | null
  /** se pidió en otra unidad (3 Saco): la llegada viene en esa unidad; factor = unidades del producto por cada una */
  enPedido?: { cantidad: number; unidad_id: string; nombre: string; factor: number } | null
  /** precio adjudicado en la cotización (por unidad del producto): viene sugerido antes que el último de compra */
  cotizado?: number | null }
type Fila = { detalle_id: string | null; producto_id: string; codigo: string; nombre: string; unidad: string; pedido: number | null; controla_lote: boolean
  unidad_id?: string | null; contenido?: number | null; contenido_unidad_id?: string | null
  cant: string; precio: string; vence: string; uni: string; equivale: string; enPedido?: LineaPedida['enPedido'] }
const num = (v: string) => Number(String(v).replace(',', '.'))

/**
 * Llegada de una compra (del requerimiento del almacén) con la boleta en mano: lo pedido ya viene cargado;
 * se completa lo que llegó, el precio unitario de la boleta y su vencimiento. Si en la misma boleta llegó
 * algo que no estaba en el requerimiento, se agrega aquí (queda marcado para Logística). Es la ENTRADA.
 */
export function LlegadaCompra({ compraId, lineas, almacenId, proveedores, proveedorId }: { compraId: string; lineas: LineaPedida[]; almacenId: string
  /** el proveedor de la boleta (si Logística compró por cotización, ya viene elegido) */
  proveedores: ProveedorOpc[]; proveedorId?: string | null }) {
  const [filas, setFilas] = useState<Fila[]>(lineas.map((l) => {
    // en la unidad del pedido (3 Saco, a S/ 140 el saco); el precio sugerido: el adjudicado o, si no, el último de compra
    const f = l.enPedido?.factor ?? 1
    const base = l.cotizado ?? l.ultimo ?? null
    return { ...l, cant: String(l.enPedido?.cantidad ?? l.pedido), precio: base ? String(Math.round(base * f * 10000) / 10000) : '', vence: '',
      uni: l.enPedido?.unidad_id ?? '', equivale: l.enPedido ? String(f) : '' }
  }))
  const [totalDoc, setTotalDoc] = useState('')
  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16)
  const u = useUnidades()
  // cuántas unidades del producto es 1 de la unidad en que se escribió (1 si es la misma)
  const fac = (f: Fila) => factorUnidad(u, f, f.uni, f.equivale) ?? 1
  const set = (i: number, k: 'cant' | 'precio' | 'vence' | 'uni' | 'equivale', v: string) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  function agregar(p: ProductoLite) {
    if (filas.some((f) => f.producto_id === p.id)) return
    setFilas((fs) => [...fs, { detalle_id: null, producto_id: p.id, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad, pedido: null,
      controla_lote: !!p.controla_lote, unidad_id: p.unidad_id, contenido: p.contenido, contenido_unidad_id: p.contenido_unidad_id,
      cant: '', precio: p.costo_referencia > 0 ? String(p.costo_referencia) : '', vence: '', uni: '', equivale: '' }])
  }
  const suma = filas.reduce((s, f) => s + (num(f.cant) || 0) * (num(f.precio) || 0), 0)
  const hayVence = filas.some((f) => f.controla_lote)
  const noCuadra = totalDoc !== '' && Math.abs(num(totalDoc) - suma) > 0.05
  // lo pedido está en la unidad del producto: se compara lo que llegó ya convertido
  const incompletos = filas.filter((f) => f.pedido !== null && (num(f.cant) || 0) * fac(f) < f.pedido).length
  // cantidad y precio en la unidad del producto (si se escribió en cajas, paquetes…, se convierte)
  const payload = filas.map((f) => ({ detalle_id: f.detalle_id, producto_id: f.producto_id,
    cantidad: Math.round((num(f.cant) || 0) * fac(f) * 10000) / 10000, precio: Math.round(((num(f.precio) || 0) / fac(f)) * 10000) / 10000,
    fecha_vencimiento: f.controla_lote ? f.vence || null : null }))

  return (
    <ActionForm action={registrarEntradaCompra} className="space-y-5">
      <input type="hidden" name="compra" value={compraId} />
      <input type="hidden" name="lineas" value={JSON.stringify(payload)} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th w-16 text-right">Cód.</th><th className="th">Producto</th><th className="th text-right">Pedido</th>
            <th className="th w-28 text-right">Llegó</th><th className="th w-40">Unidad</th><th className="th w-36 text-right">Precio</th>
            {hayVence && <th className="th w-40">Vencimiento</th>}<th className="th text-right">Importe</th><th className="th w-10" /></tr></thead>
          <tbody>
            {filas.map((f, i) => {
              return (
                <tr key={f.producto_id}>
                  <td className="td text-right font-mono text-xs font-semibold">{f.codigo}</td>
                  <td className="td"><span className="font-medium">{f.nombre}</span> <span className="text-xs text-muted">{f.unidad}</span>
                    {f.pedido === null && <span className="mt-0.5 block"><Badge tone="violet">No estaba en el requerimiento</Badge></span>}</td>
                  <td className="td text-right tabular">{f.pedido === null ? '—' : f.enPedido
                    ? <>{f.enPedido.cantidad} {f.enPedido.nombre}</> : f.pedido}</td>
                  <td className="td py-1"><input inputMode="decimal" value={f.cant} required onFocus={(e) => e.target.select()} onChange={(e) => {
                      // no más de lo pedido (en la unidad en que se escribe)
                      const tope = f.pedido === null ? null : Math.round(f.pedido / fac(f) * 10000) / 10000
                      set(i, 'cant', tope !== null && num(e.target.value) > tope ? String(tope) : e.target.value)
                    }}
                    aria-label={`Llegó de ${f.nombre}`} className="field h-8 text-right tabular" /></td>
                  <td className="td py-1"><UnidadCelda u={u} p={f} value={f.uni} equivale={f.equivale} cantidad={f.cant}
                    onUnidad={(v) => set(i, 'uni', v)} onEquivale={(v) => set(i, 'equivale', v)} etiqueta={`Unidad de ${f.nombre}`}
                    fijo={f.enPedido && f.uni === f.enPedido.unidad_id ? f.enPedido.factor : undefined} /></td>
                  <td className="td py-1"><input inputMode="decimal" value={f.precio} required={num(f.cant) > 0} onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'precio', e.target.value)}
                    aria-label={`Precio unitario de ${f.nombre}`} placeholder="0.00" className="field h-8 text-right tabular" /></td>
                  {hayVence && <td className="td py-1">{f.controla_lote
                    ? <input type="date" value={f.vence} onChange={(e) => set(i, 'vence', e.target.value)} aria-label={`Vencimiento de ${f.nombre}`} className="field h-8 tabular" />
                    : <span className="block px-1 text-xs text-subtle">—</span>}</td>}
                  <td className="td text-right font-semibold tabular">{fmtSoles((num(f.cant) || 0) * (num(f.precio) || 0))}</td>
                  <td className="td py-1">{f.pedido === null && (
                    <button type="button" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} aria-label="Quitar" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-600"><Trash2 className="size-4" /></button>
                  )}</td>
                </tr>
              )
            })}
            <tr className="bg-canvas/60"><td className="td text-right font-semibold" colSpan={hayVence ? 7 : 6}>Suma</td><td className="td text-right text-base font-bold tabular">{fmtSoles(suma)}</td><td /></tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ProductPicker onSelect={agregar} almacenId={almacenId} className="min-w-72 flex-1" placeholder="¿Llegó algo más en la misma boleta? Agréguelo: nombre o código…" />
      </div>
      {/* orden estándar: productos → datos de la boleta */}
      <div className="grid gap-4 pt-1 md:grid-cols-4">
        <div className="md:col-span-2"><span className="label">Proveedor *</span><ProveedorPicker name="proveedor" proveedores={proveedores} defaultValue={proveedorId} required placeholder="Escriba para buscar: distraroj, backus…" /></div>
        <label><span className="label">Comprobante</span>
          <Select name="tipo_documento" options={COMPROBANTES} defaultValue="boleta" required /></label>
        <label><span className="label">N° del comprobante</span><input name="numero_documento" className="field" placeholder="B001-000123" /></label>
        <TotalComprobante suma={suma} onEscrito={setTotalDoc} />
        <label><span className="label">Fecha y hora de llegada</span>
          <input type="datetime-local" name="fecha" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_inicial" value={ahora} /></label>
      </div>
      <div className="space-y-1 text-sm">
        {noCuadra && <p className="font-semibold text-brand-700">El total del comprobante ({fmtSoles(num(totalDoc))}) no cuadra con la suma ({fmtSoles(suma)}). Revise cantidades y precios.</p>}
        {incompletos > 0 && <p className="text-amber-700">{incompletos === 1 ? '1 producto llegó' : `${incompletos} productos llegaron`} en menor cantidad: el requerimiento quedará como <b>atendido parcial</b>.</p>}
      </div>
      <div className="flex justify-end">
        <SubmitButton confirm="¿Registrar la entrada? Los productos que llegaron se sumarán al stock con estos precios.">Registrar entrada</SubmitButton>
      </div>
    </ActionForm>
  )
}
