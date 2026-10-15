'use client'

import { LineItems } from '@/components/line-items'

export function CotLineas() {
  return <LineItems name="lineas" allowFreeText fields={[{ key: 'cantidad', label: 'Cantidad', required: true, width: '140px' }]} />
}
