'use client'

import type { Opcion } from '@/lib/queries'
import { Combobox } from '@/components/combobox'

/**
 * Campo de lista abierta: se elige de la lista o se escribe uno nuevo (origen de compra, transportista, área…).
 * Lo nuevo se registra al guardar y desde ahí aparece en la lista para la próxima vez.
 * Envía el NOMBRE; el servidor lo convierte en id (ver `lib/listas-abiertas.ts`).
 */
export function ComboInput({ name, opciones, defaultValue, placeholder, required }: {
  name: string; opciones: (Opcion | { id: string; nombre: string })[]; defaultValue?: string | null; placeholder?: string; required?: boolean
}) {
  return <Combobox libre name={name} options={opciones.map((o) => ({ id: o.nombre, nombre: o.nombre }))} defaultValue={defaultValue ?? ''}
    placeholder={placeholder} required={required} />
}
