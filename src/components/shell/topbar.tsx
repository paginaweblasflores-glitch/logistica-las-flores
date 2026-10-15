'use client'

import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Globe2, LoaderCircle, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setAmbito, setAlmacenActivo } from './ambito-actions'
import { PerfilMenu } from './perfil-menu'
import { Campana, type Avisos } from './campana'
import { RUTAS_CON_AMBITO } from '@/lib/nav'

type LocalLite = { codigo: string; nombre: string; titulo?: string }

export function Topbar({ ambito, ambitoFijo, locales, usuario, fecha, avisos, almacenes = [], almacenActivo = null }: {
  ambito: string
  ambitoFijo: boolean
  locales: LocalLite[]
  usuario: { nombre: string; rol: string }
  fecha: string
  /** null = el panel no tiene campanita (jefes de área) */
  avisos: Avisos | null
  /** panel de almacén con varios almacenes (Las Flores: Almacén 01 y Almacén 02 — Cocina) */
  almacenes?: { id: string; corto: string; nombre: string }[]
  almacenActivo?: string | null
}) {
  const [pending, start] = useTransition()
  const enRuta = RUTAS_CON_AMBITO.has(usePathname())
  const mostrarAmbito = enRuta && !ambitoFijo
  // mismo diseño que Global / Las Flores / Umaru, pero con los almacenes del responsable
  const mostrarAlmacen = enRuta && almacenes.length > 1
  const opcAlmacen = [{ id: 'TODOS', corto: 'Todos', nombre: 'Todos sus almacenes' }, ...almacenes]
  const opciones = [{ codigo: 'GLOBAL', nombre: 'Global' }, ...locales]

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 pr-4 pl-16 lg:px-6">
        {mostrarAmbito && (
        <div role="radiogroup" aria-label="Ámbito de negocio"
             className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-canvas p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {opciones.map((o) => {
            const active = ambito === o.codigo
            return (
              <button
                key={o.codigo}
                role="radio"
                aria-checked={active}
                disabled={pending}
                title={'titulo' in o ? o.titulo : 'Ambos negocios'}
                onClick={() => start(() => setAmbito(o.codigo))}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  active ? 'bg-ink-900 text-white shadow-sm' : 'text-muted hover:text-ink-900',
                )}
              >
                {o.codigo === 'GLOBAL' && <Globe2 className="size-3.5" />}
                {o.codigo !== 'GLOBAL' && (
                  <span className={cn('size-2 rounded-full', o.codigo === 'LF' ? 'bg-brand-500' : 'bg-umaru-500')} />
                )}
                {o.nombre}
              </button>
            )
          })}
          {pending && <LoaderCircle className="mx-1 size-4 animate-spin text-muted" />}
        </div>
        )}

        {mostrarAlmacen && (
        <div role="radiogroup" aria-label="Almacén"
             className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-canvas p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {opcAlmacen.map((o) => {
            const active = (almacenActivo ?? 'TODOS') === o.id
            return (
              <button key={o.id} role="radio" aria-checked={active} disabled={pending} title={o.nombre}
                onClick={() => start(() => setAlmacenActivo(o.id))}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  active ? 'bg-ink-900 text-white shadow-sm' : 'text-muted hover:text-ink-900',
                )}>
                {o.id === 'TODOS' ? <Globe2 className="size-3.5" /> : <Warehouse className="size-3.5" />}
                {o.corto}
              </button>
            )
          })}
          {pending && <LoaderCircle className="mx-1 size-4 animate-spin text-muted" />}
        </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden text-sm whitespace-nowrap text-muted xl:block tabular">{fecha}</span>
          {avisos && <Campana avisos={avisos} />}
          <PerfilMenu nombre={usuario.nombre} rol={usuario.rol} />
        </div>
      </div>
    </header>
  )
}
