'use client'

import { useRouter } from 'next/navigation'
import { Combobox } from '@/components/combobox'

export type TipoOpc = { valor: string; nombre: string }

/**
 * «Tipo de entrada / salida» (primer campo del formulario): se elige de la lista o se escribe uno nuevo
 * («Donación», «Evento»…), que queda guardado para la próxima vez. Al cambiarlo, el formulario cambia solo.
 */
export function TipoMovimiento({ ruta, etiqueta, opciones, actual }: { ruta: string; etiqueta: string; opciones: TipoOpc[]; actual: string }) {
  const router = useRouter()
  const nombreActual = opciones.find((o) => o.valor === actual)?.nombre ?? actual
  return (
    <div><span className="label">{etiqueta} *</span>
      <Combobox libre required options={opciones.map((o) => ({ id: o.nombre, nombre: o.nombre }))} value={nombreActual} ariaLabel={etiqueta}
        onChange={(v) => {
          if (!v || v === nombreActual) return
          const o = opciones.find((x) => x.nombre.toLowerCase() === v.toLowerCase())
          // uno de la lista: su formulario; uno nuevo (o escrito antes): «otro» con su nombre
          router.push(o && !o.valor.startsWith('otro:') ? `${ruta}?tipo=${o.valor}` : `${ruta}?tipo=otro&motivo=${encodeURIComponent(o?.nombre ?? v)}`)
        }} />
    </div>
  )
}
