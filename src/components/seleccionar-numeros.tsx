'use client'

import { useEffect } from 'react'

/**
 * En todo el sistema: al entrar a un campo de número (cantidad, precio, mínimo, días…) se selecciona lo escrito,
 * así se reemplaza tecleando sin borrar el 0 de antes. Un solo oyente para todos los formularios.
 */
export function SeleccionarNumeros() {
  useEffect(() => {
    const alEntrar = (e: FocusEvent) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || el.readOnly || el.disabled) return
      const esNumero = el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric'
      if (!esNumero) return
      el.select()
      // algunos navegadores quitan la selección al soltar el clic: ese primer soltar no la cambia
      el.addEventListener('mouseup', (m) => m.preventDefault(), { once: true })
    }
    document.addEventListener('focusin', alEntrar)
    return () => document.removeEventListener('focusin', alEntrar)
  }, [])
  return null
}
