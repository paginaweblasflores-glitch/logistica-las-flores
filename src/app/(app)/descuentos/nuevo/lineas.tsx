'use client'

import { LineItems } from '@/components/line-items'

export function DescLineas() {
  return (
    <LineItems name="lineas" allowFreeText totalKey="cantidad" priceKey="precio"
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '120px' },
        { key: 'precio', label: 'Precio unitario (S/)', required: true, width: '160px', init: (p) => String(p.costo_referencia ?? '') },
      ]} />
  )
}
