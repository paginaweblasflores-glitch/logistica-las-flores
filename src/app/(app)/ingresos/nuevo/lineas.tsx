'use client'

import { LineItems } from '@/components/line-items'
import { avisarSuma } from '@/components/total-comprobante'

/** Productos del ingreso: cantidad que entró y precio unitario de la boleta (el total se calcula solo). */
export function IngresoLineas({ almacenId }: { almacenId?: string | null }) {
  return (
    <LineItems
      name="lineas"
      almacenId={almacenId}
      totalKey="cantidad"
      priceKey="precio"
      onTotal={avisarSuma}
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '110px' },
        // unidad en que se escribe la cantidad (y el precio): la del producto o cualquier otra (cajas, paquetes… con cuánto trae)
        { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '150px', todasUnidades: true, init: (p) => p.unidad_id ?? '' },
        { key: 'precio', label: 'Precio', required: true, width: '170px', init: (p) => (p.costo_referencia ? String(p.costo_referencia) : '') },
        { key: 'fecha_vencimiento', label: 'Vencimiento', type: 'date', width: '160px', soloConVencimiento: true },
      ]}
    />
  )
}
