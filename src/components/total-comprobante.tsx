'use client'

import { useEffect, useState } from 'react'

/** la suma de las líneas de una boleta, para «Total del comprobante» (las líneas la avisan con este evento) */
export const EVENTO_SUMA = 'suma-boleta'
export const avisarSuma = (n: number) => window.dispatchEvent(new CustomEvent(EVENTO_SUMA, { detail: n }))
/** «Repartir la diferencia»: las líneas multiplican su precio por este factor (total del comprobante ÷ suma) */
export const EVENTO_REPARTIR = 'repartir-boleta'

/**
 * «Total del comprobante»: se llena solo con la suma de los productos (y se actualiza al agregar o cambiar).
 * Si se escribe otro monto (el de la boleta), queda ese; al borrarlo vuelve a seguir la suma.
 */
export function TotalComprobante({ suma: sumaProp, onEscrito, onRepartir }: { suma?: number
  /** avisa el monto escrito a mano ('' si sigue la suma), para avisar si no cuadra */
  onEscrito?: (v: string) => void
  /** reparte la diferencia entre las líneas (con su propio estado); sin esto, se avisa a <LineItems/> con un evento */
  onRepartir?: (factor: number) => void }) {
  const [sumaEv, setSumaEv] = useState(0)
  const [escrito, setEscrito] = useState<string | null>(null)
  useEffect(() => {
    if (sumaProp !== undefined) return
    const f = (e: Event) => setSumaEv(Number((e as CustomEvent).detail) || 0)
    window.addEventListener(EVENTO_SUMA, f)
    return () => window.removeEventListener(EVENTO_SUMA, f)
  }, [sumaProp])
  const suma = sumaProp ?? sumaEv
  const valor = escrito ?? (suma > 0 ? suma.toFixed(2) : '')
  const total = Number(String(escrito ?? '').replace(',', '.'))
  // la factura trae un descuento (o recargo) sobre el total: se reparte entre los productos según su importe
  const diferencia = escrito !== null && total > 0 && suma > 0 && Math.abs(total - suma) > 0.005 ? total - suma : 0
  function repartir() {
    const factor = total / suma
    if (onRepartir) onRepartir(factor)
    else window.dispatchEvent(new CustomEvent(EVENTO_REPARTIR, { detail: factor }))
  }
  return (
    <div>
      <label><span className="label">Total del comprobante (S/)</span>
        <input name="total_documento" inputMode="decimal" value={valor} onFocus={(e) => e.target.select()}
          onChange={(e) => { setEscrito(e.target.value === '' ? null : e.target.value); onEscrito?.(e.target.value) }} className="field tabular" /></label>
      {diferencia !== 0 && (
        <button type="button" onClick={repartir} className="mt-1 text-left text-xs font-semibold text-brand-700 hover:underline"
          title="Para un descuento o recargo sobre el total de la factura: se reparte entre los productos según su importe">
          Repartir {diferencia < 0 ? 'el descuento' : 'la diferencia'} de S/ {Math.abs(diferencia).toFixed(2)} entre los productos
        </button>
      )}
    </div>
  )
}
