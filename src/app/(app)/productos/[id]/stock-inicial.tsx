'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { PrecioCelda } from '@/components/precio-linea'
import { enDosUnidades } from '@/lib/unidades'
import { fmtDate, fmtSoles } from '@/lib/format'
import { registrarStockInicial, deshacerStockInicial } from '../actions'

const num = (v: string) => Number(v.replace(',', '.'))
const n4 = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 4 })

/**
 * Stock inicial del producto en el almacén elegido: se pone UNA sola vez (entrada «Stock inicial», queda en el Kardex).
 * Se cuenta en la unidad chica (kilos) o en la presentación grande (sacos): el sistema lo guarda en la chica y
 * muestra el precio por unidad chica (se puede corregir). La presentación se define antes, en «Datos del producto».
 * Después la cantidad cambia solo con Entradas, Salidas y Traspasos; este recuadro ya no aparece.
 */
export function StockInicial({ productoId, almacenId, almacen, unidad, presentacion, trae }: {
  productoId: string; almacenId: string; almacen: string; unidad: string
  /** presentación grande definida en «Datos del producto» (Saco) y cuánto trae (50); vacía si no tiene */
  presentacion: string | null; trae: number | null
}) {
  const u = (unidad || 'unidad').toLowerCase()
  const pres = presentacion
  const factor = Number(trae)
  const [en, setEn] = useState<'chica' | 'grande'>('chica')
  const grande = en === 'grande' && !!pres && factor > 0
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  // lo que se teclea en «por kg» (se recalcula al cambiar el precio por saco)
  const [chicaEscrita, setChicaEscrita] = useState<string | null>(null)
  const enChica = grande ? num(cantidad) * factor : num(cantidad)

  return (
    <ActionForm action={registrarStockInicial} className="space-y-3">
      <input type="hidden" name="producto_id" value={productoId} />
      <input type="hidden" name="almacen" value={almacenId} />
      <input type="hidden" name="en" value={grande ? 'grande' : 'chica'} />
      {!presentacion && (
        // la presentación (saco, caja…) se define en un solo lugar: «Datos del producto»
        <p className="text-xs text-muted">¿Lo cuenta en sacos o cajas? Defina primero la <b>presentación grande</b> en «Datos del producto» y guárdela: aquí aparecerá para elegirla.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <label><span className="label">Cantidad que tiene hoy <span className="req">*</span></span>
          <input type="number" step="any" min="0" name="cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required placeholder="0"
            onFocus={(e) => e.target.select()} className="field tabular" />
          {grande && num(cantidad) > 0 && <span className="mt-1 block text-xs text-muted">= {n4(enChica)} {u}</span>}</label>
        <label><span className="label">En</span>
          <Select value={grande ? 'grande' : 'chica'} onChange={(v) => setEn(v === 'grande' ? 'grande' : 'chica')} ariaLabel="Unidad de la cantidad"
            options={[{ id: 'chica', nombre: unidad || 'Unidad' }, ...(pres && factor > 0 ? [{ id: 'grande', nombre: `${pres} (${n4(factor)} ${u})` }] : [])]} /></label>
        {/* precio por saco y, debajo, por kilo (lo calcula el sistema y se puede corregir) */}
        <div><span className="label">Precio por {grande ? pres!.toLowerCase() : u} (S/)</span>
          <input type="hidden" name="precio" value={precio} />
          <PrecioCelda precio={precio} factor={grande ? factor : 1} unidad={u} chicaEscrita={chicaEscrita} etiqueta="Precio"
            onPrecio={(v) => { setPrecio(v); setChicaEscrita(null) }} onChica={(p, escrito) => { setPrecio(p); setChicaEscrita(escrito) }} /></div>
        <label><span className="label">Fecha de vencimiento</span>
          <input type="date" name="fecha_vencimiento" className="field tabular" /></label>
      </div>
      {!precio && num(cantidad) > 0 && (
        <p className="text-xs text-amber-700">Sin precio, este stock vale S/ 0 y sus salidas salen sin costo hasta la primera compra. Si lo sabe, escríbalo.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Se registra en {almacen}. Si no hay nada de este producto, escriba <b>0</b>. Si se equivoca, luego puede corregirlo.</p>
        {/* 0 también vale: «no hay stock de este producto» */}
        <SubmitButton listo={(d) => String(d.get('cantidad') ?? '') !== '' && Number(d.get('cantidad')) >= 0}>
          {cantidad !== '' && num(cantidad) === 0 ? 'Registrar en 0 (sin stock)' : 'Registrar stock inicial'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/**
 * Stock inicial ya registrado: lo que se puso y «Corregir», que lo deshace (queda anulado en el Kardex) y deja el
 * producto «Pendiente» para cargarlo bien (si la unidad estaba mal, se cambia antes en «Datos del producto»).
 * Solo aparece mientras el producto no tenga otros movimientos en este almacén.
 */
export function StockInicialRegistrado({ productoId, almacenId, unidad, presentacion, trae, registrado }: {
  productoId: string; almacenId: string; unidad: string; presentacion: string | null; trae: number | null
  /** null = se registró en 0 (sin stock) */
  registrado: { cantidad: number; precio: number | null; vence: string | null; fecha: string } | null
}) {
  return (
    <ActionForm action={deshacerStockInicial} className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="producto_id" value={productoId} />
      <input type="hidden" name="almacen" value={almacenId} />
      <p className="text-sm">
        {registrado ? <>Registrado: <b>{enDosUnidades(registrado.cantidad, unidad, presentacion, trae)}</b>
          {registrado.precio !== null && registrado.precio > 0 ? <> a <b>{fmtSoles(registrado.precio)}</b> por {unidad.toLowerCase()}</> : <span className="text-amber-700"> · sin precio</span>}
          {registrado.vence && <> · vence {fmtDate(registrado.vence)}</>}
          <span className="text-muted"> · {fmtDate(registrado.fecha, true)}</span></>
          : <>Registrado en <b>0</b>: este producto no tenía stock.</>}
      </p>
      <SubmitButton variant="outline" size="sm"
        confirm="Se deshace el stock inicial de este producto (queda anulado en el Kardex) y vuelve a «Pendiente» para cargarlo de nuevo. Si la unidad estaba mal, cámbiela en «Datos del producto» antes de volver a cargarlo.">
        Corregir stock inicial</SubmitButton>
    </ActionForm>
  )
}
