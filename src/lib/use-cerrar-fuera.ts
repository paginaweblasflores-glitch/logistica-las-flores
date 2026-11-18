'use client'

import { useEffect, useEffectEvent, type RefObject } from 'react'

/**
 * Cierra un desplegable (lista, menú, ventana de avisos) al hacer clic fuera de él y, si se pide, con la tecla Escape.
 * Escucha solo mientras está abierto y se suscribe una vez por apertura (no en cada render).
 * `alCerrar` siempre ve el estado actual del componente (useEffectEvent), sin volver a suscribirse.
 */
export function useCerrarFuera(ref: RefObject<HTMLElement | null>, abierto: boolean, alCerrar: () => void, { escape = false } = {}) {
  const cerrar = useEffectEvent(alCerrar)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) cerrar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('mousedown', fuera)
    if (escape) document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [ref, abierto, escape])
}
