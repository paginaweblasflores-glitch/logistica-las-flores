'use client'

import { LineItems } from '@/components/line-items'

/** Productos de una entrada (con vencimiento si el producto lo controla) o de una salida (con su stock a la vista). */
export function LineasEntradaSalida({ almacenId, almacenes, entrada }: { almacenId: string | null; entrada: boolean
  /** salida de varios almacenes: se busca en todos y cada producto lleva su almacén */
  almacenes?: string[] }) {
  return (
    <LineItems
      name="lineas"
      almacenId={almacenId}
      almacenes={almacenes}
      mostrarStock={!entrada}
      mostrarVence={!entrada}
      topeStock={!entrada}
      fields={entrada
        ? [
            { key: 'cantidad', label: 'Cantidad', required: true, width: '120px' },
            // unidad en que se escribe la cantidad (y el precio): la del producto o cualquier otra (cajas, paquetes… con cuánto trae)
            { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '150px', todasUnidades: true, init: (p) => p.unidad_id ?? '' },
            { key: 'fecha_vencimiento', label: 'Vencimiento', type: 'date', width: '170px', soloConVencimiento: true },
          ]
        : [{ key: 'cantidad', label: 'Cantidad', required: true, width: '120px' },
            { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '150px', todasUnidades: true, init: (p) => p.unidad_id ?? '' }]}
    />
  )
}
