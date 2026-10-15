'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><AlertTriangle className="size-6" /></span>
      <h1 className="text-lg font-bold">No se pudo cargar esta página</h1>
      <p className="mt-2 text-sm text-muted">{error.message || 'Ocurrió un error inesperado.'}</p>
      <button onClick={reset} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">
        <RotateCcw className="size-4" /> Reintentar
      </button>
    </div>
  )
}
