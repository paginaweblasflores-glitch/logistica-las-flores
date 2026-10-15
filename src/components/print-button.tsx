'use client'

import { Printer } from 'lucide-react'
import { btnClass } from '@/components/ui'

/**
 * Imprime la página (o guarda como PDF desde el diálogo del navegador). Se muestra solo cuando el documento
 * ya está listo (adjudicado, aprobado, recibido, cerrado…) y como botón secundario: no compite con la acción del paso.
 */
export function PrintButton({ label = 'Imprimir / PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btnClass('outline')}>
      <Printer className="size-4" /> {label}
    </button>
  )
}
