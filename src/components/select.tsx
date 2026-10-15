'use client'

import type { Opcion } from '@/lib/queries'
import { Combobox, type CatalogoAbierto } from '@/components/combobox'

/**
 * Lista desplegable estándar del sistema (se elige o se escribe para buscar). Ver `Combobox`.
 * `agregar`: permite agregar una opción nueva a ese catálogo (categoría, área, personal, ciudad).
 */
export function Select({ name, options, defaultValue, value, onChange, placeholder, required, className, id, disabled, agregar, local, autoFocus, ariaLabel }: {
  name?: string; options: readonly (Opcion | { id: string; nombre: string })[]; defaultValue?: string | null; placeholder?: string
  value?: string; onChange?: (v: string) => void
  required?: boolean; className?: string; id?: string; disabled?: boolean
  agregar?: CatalogoAbierto; local?: string | null; autoFocus?: boolean; ariaLabel?: string
}) {
  return (
    <Combobox name={name} options={options.map((o) => ({ id: o.id, nombre: o.nombre }))} defaultValue={defaultValue} value={value} onChange={onChange}
      placeholder={placeholder} required={required} className={className} id={id} disabled={disabled} agregar={agregar} local={local}
      autoFocus={autoFocus} ariaLabel={ariaLabel} />
  )
}
