'use client'

import { useSyncExternalStore } from 'react'

const nada = () => () => {}

/**
 * true solo en el navegador (después de hidratar); false en el servidor y en la primera pintura.
 * Para lo que necesita `document` o `window` (portales, impresión) sin un render extra por efecto.
 */
export function useMontado() {
  return useSyncExternalStore(nada, () => true, () => false)
}
