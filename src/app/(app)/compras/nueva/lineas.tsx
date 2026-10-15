'use client'

import { LineItems } from '@/components/line-items'
import type { Line } from '@/lib/lines'

export function CompraLineas({ inicial }: { inicial: Line[] }) {
  return (
    <LineItems
      name="lineas"
      initial={inicial}
      allowFreeText   // bienes de requerimientos que no están en el catálogo (no entran al inventario)
      totalKey="cantidad"
      priceKey="precio"
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '120px' },
        { key: 'precio', label: 'Precio unitario (S/)', required: true, width: '160px', init: (p) => (p.costo_referencia ? String(p.costo_referencia) : '') },
        { key: 'fecha_vencimiento', label: 'Vencimiento (perecibles)', type: 'date', width: '170px' },
      ]}
    />
  )
}
