'use client'

import { useEffect, useState } from 'react'

/** la suma de las líneas de una boleta, para «Total del comprobante» (las líneas la avisan con este evento) */
export const EVENTO_SUMA = 'suma-boleta'
export const avisarSuma = (n: number) => window.dispatchEvent(new CustomEvent(EVENTO_SUMA, { detail: n }))

/**
 * «Total del comprobante»: se llena solo con la suma de los productos (y se actualiza al agregar o cambiar).
 * Si se escribe otro monto (el de la boleta), queda ese; al borrarlo vuelve a seguir la suma.
 */
export function TotalComprobante({ suma: sumaProp, onEscrito }: { suma?: number
  /** avisa el monto escrito a mano ('' si sigue la suma), para avisar si no cuadra */
  onEscrito?: (v: string) => void }) {
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
  return (
    <label><span className="label">Total del comprobante (S/)</span>
      <input name="total_documento" inputMode="decimal" value={valor} onFocus={(e) => e.target.select()}
        onChange={(e) => { setEscrito(e.target.value === '' ? null : e.target.value); onEscrito?.(e.target.value) }} className="field tabular" /></label>
  )
}
