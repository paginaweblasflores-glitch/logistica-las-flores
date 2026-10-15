'use client'

import { LineItems } from '@/components/line-items'

export function TrasladoLineas({ almacenId }: { almacenId?: string | null }) {
  return (
    <LineItems
      name="lineas"
      almacenId={almacenId}
      totalKey="cantidad"
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '120px' },
        // cualquier unidad: las que se convierten solas (sacos ↔ kilos) o cajas, paquetes… indicando cuánto trae
        { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '150px', todasUnidades: true, init: (p) => p.unidad_id ?? '' },
        { key: 'observacion', label: 'Observaciones', type: 'text' },
      ]}
    />
  )
}
