'use client'

import { LineItems } from '@/components/line-items'

/** Detalle del requerimiento: bienes del catálogo o escritos a mano (lo más común en las áreas). */
export function ReqLineas() {
  return (
    <LineItems
      name="lineas"
      allowFreeText
      totalKey="cantidad"
      priceKey="precio_estimado"
      fields={[
        { key: 'imagen', label: 'Foto ref.', type: 'image', width: '110px' },
        { key: 'marca', label: 'Marca', type: 'text', width: '130px' },
        { key: 'cantidad', label: 'Cantidad', required: true, width: '100px' },
        { key: 'precio_estimado', label: 'Precio estimado', width: '120px', init: (p) => (p.costo_referencia ? String(p.costo_referencia) : '') },
        { key: 'motivo', label: 'Motivo / observación', type: 'text' },
        { key: 'area_destino', label: 'Área que lo usará', type: 'text', width: '150px' },
      ]}
    />
  )
}
