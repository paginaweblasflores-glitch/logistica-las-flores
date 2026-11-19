'use client'

import { useState } from 'react'

/**
 * Guía de remisión al registrar la llegada (04 de la carpeta de la compra): su número, o «No vino guía»
 * (compra local, sin traslado). Vacío = queda pendiente en la carpeta.
 */
export function CampoGuia() {
  const [noVino, setNoVino] = useState(false)
  return (
    <div>
      <span className="label">Guía de remisión</span>
      <input name="guia_numero" className="field" placeholder={noVino ? 'No vino guía' : 'T001-000123'} disabled={noVino} />
      <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" name="guia_no_aplica" value="1" checked={noVino} onChange={(e) => setNoVino(e.target.checked)} className="size-3.5" />
        No vino guía (compra local)
      </label>
    </div>
  )
}
