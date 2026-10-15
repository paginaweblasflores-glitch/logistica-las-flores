'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Error fuera de una página (p. ej. la base no respondió al cargar la sesión): se muestra para reintentar,
 * sin cerrar la sesión del usuario.
 */
export default function ErrorGeneral({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4">
      <div className="card max-w-lg p-8 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><AlertTriangle className="size-6" /></span>
        <h1 className="text-lg font-bold">No se pudo conectar con el sistema</h1>
        <p className="mt-2 text-sm text-muted">Puede ser la conexión a internet. Su sesión sigue abierta: vuelva a intentar en un momento.</p>
        <button onClick={reset} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">
          <RotateCcw className="size-4" /> Reintentar
        </button>
      </div>
    </div>
  )
}
