'use client'

import { useRef, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronsUpDown, Globe2, LoaderCircle, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setAmbito, setAlmacenActivo } from './ambito-actions'
import { RUTAS_CON_AMBITO } from '@/lib/nav'
import { useCerrarFuera } from '@/lib/use-cerrar-fuera'

export type AmbitoBarra = {
  ambito: string
  ambitoFijo: boolean
  locales: { codigo: string; nombre: string; titulo?: string }[]
  /** panel de almacén con varios almacenes (Las Flores: Almacén 01 y Almacén 02 — Cocina) */
  almacenes: { id: string; corto: string; nombre: string }[]
  almacenActivo: string | null
}

type Opcion = { id: string; nombre: string; titulo?: string; icono: React.ReactNode }

/**
 * Global / Las Flores / Umaru (o los almacenes del responsable), en la barra lateral.
 * Muestra solo lo elegido; al hacer clic se abre la lista para cambiar.
 * Solo aparece en las pantallas donde realmente filtra (RUTAS_CON_AMBITO).
 */
export function SelectorAmbito({ ambito, ambitoFijo, locales, almacenes, almacenActivo }: AmbitoBarra) {
  const enRuta = RUTAS_CON_AMBITO.has(usePathname())
  const punto = (c: string) => <span className={cn('mx-[3px] inline-block size-2 shrink-0 rounded-full', c === 'LF' ? 'bg-brand-500' : 'bg-umaru-500')} />

  if (enRuta && !ambitoFijo) {
    return (
      <Desplegable titulo="Negocio" actual={ambito} cambiar={setAmbito}
        opciones={[{ id: 'GLOBAL', nombre: 'Global', titulo: 'Ambos negocios', icono: <Globe2 className="size-3.5 shrink-0" /> },
          ...locales.map((l) => ({ id: l.codigo, nombre: l.nombre, titulo: l.titulo, icono: punto(l.codigo) }))]} />
    )
  }
  if (enRuta && almacenes.length > 1) {
    return (
      <Desplegable titulo="Almacén" actual={almacenActivo ?? 'TODOS'} cambiar={setAlmacenActivo}
        opciones={[{ id: 'TODOS', nombre: 'Todos', titulo: 'Todos sus almacenes', icono: <Globe2 className="size-3.5 shrink-0" /> },
          ...almacenes.map((a) => ({ id: a.id, nombre: a.corto, titulo: a.nombre, icono: <Warehouse className="size-3.5 shrink-0" /> }))]} />
    )
  }
  return null
}

function Desplegable({ titulo, actual, opciones, cambiar }: {
  titulo: string; actual: string; opciones: Opcion[]; cambiar: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const sel = opciones.find((o) => o.id === actual) ?? opciones[0]

  useCerrarFuera(ref, open, () => setOpen(false), { escape: true })

  return (
    <div ref={ref} className="relative mx-3 mb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={pending} aria-haspopup="listbox" aria-expanded={open}
              className={cn('flex w-full items-center gap-2.5 rounded-lg bg-white/[0.05] px-3 py-2 text-left ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] disabled:cursor-wait',
                open && 'bg-white/[0.09]')}>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold tracking-wider text-white/45 uppercase">{titulo}</span>
          <span className="mt-0.5 flex items-start gap-2 text-[13px] font-semibold text-white">
            <span className="flex h-[18px] items-center text-white/60">{sel.icono}</span>
            <span className="leading-snug">{sel.nombre}</span>
          </span>
        </span>
        {pending
          ? <LoaderCircle className="size-4 shrink-0 animate-spin text-white/60" aria-label="Cambiando…" />
          : <ChevronsUpDown className="size-4 shrink-0 text-white/45" aria-hidden />}
      </button>

      {open && (
        <ul role="listbox" aria-label={titulo}
            className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-line bg-white p-1 text-ink-900 shadow-xl">
          {opciones.map((o) => {
            const active = o.id === sel.id
            return (
              <li key={o.id}>
                <button type="button" role="option" aria-selected={active} title={o.titulo}
                        onClick={() => { setOpen(false); if (!active) start(() => cambiar(o.id)) }}
                        className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors',
                          active ? 'bg-canvas font-semibold' : 'hover:bg-canvas')}>
                  <span className="flex text-muted">{o.icono}</span>
                  <span className="min-w-0 flex-1 leading-snug">{o.nombre}</span>
                  {active && <Check className="size-3.5 shrink-0" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
