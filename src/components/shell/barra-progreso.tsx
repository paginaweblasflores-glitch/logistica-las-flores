'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Barra fina arriba mientras se abre otra pantalla. Al navegar ya no hay esqueleto: la pantalla anterior se
 * queda hasta que la nueva llega completa, y esta barra avisa que el clic sí se recibió.
 * Empieza con cualquier enlace interno (menú, botones, enlaces de las tablas) y termina cuando cambia la dirección.
 */
export function BarraProgreso() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const clave = `${pathname}?${search}`
  const [activo, setActivo] = useState(false)
  // llegó la pantalla nueva (cambió la dirección): se apaga (ajuste durante el render, sin efecto)
  const [vista, setVista] = useState(clave)
  if (vista !== clave) {
    setVista(clave)
    setActivo(false)
  }

  useEffect(() => {
    function alHacerClic(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const destino = new URL(a.href, location.href)
      if (destino.origin !== location.origin) return
      // la misma pantalla (o solo un #ancla): no hay nada que cargar
      if (destino.pathname === location.pathname && destino.search === location.search) return
      setActivo(true)
    }
    document.addEventListener('click', alHacerClic)
    return () => document.removeEventListener('click', alHacerClic)
  }, [])

  // por si la navegación se cancela o falla: no queda encendida para siempre
  useEffect(() => {
    if (!activo) return
    const t = setTimeout(() => setActivo(false), 15_000)
    return () => clearTimeout(t)
  }, [activo])

  if (!activo) return null
  return <div className="barra-progreso no-print" role="progressbar" aria-label="Cargando la pantalla" />
}
