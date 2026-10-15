'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { navDe, rutaActiva, type NavModule } from '@/lib/nav'
import { inicioDe, type Panel } from '@/lib/panel'
import { cn } from '@/lib/utils'

const moduloActivo = (pathname: string, m: NavModule, todos: NavModule[] = []) => {
  if (!m.href) return !!m.items?.some((i) => rutaActiva(pathname, i.href))
  if (!rutaActiva(pathname, m.href)) return false
  // si otro enlace directo coincide de forma más específica (p. ej. /requerimientos/nuevo), gana ese
  return !todos.some((o) => o.href && o.href.length > m.href!.length && rutaActiva(pathname, o.href))
}

const itemClass = (active: boolean) => cn(
  'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
  active ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
)

function NavContent({ onNavigate, panel, subtitulo }: { onNavigate?: () => void; panel: Panel; subtitulo: string }) {
  const pathname = usePathname()
  const NAV = navDe(panel)
  // Acordeón: solo un módulo abierto; al navegar se abre el módulo de la pantalla actual.
  const actual = NAV.find((m) => m.items && moduloActivo(pathname, m))?.label ?? null
  const [abierto, setAbierto] = useState<string | null>(actual)
  useEffect(() => { if (actual) setAbierto(actual) }, [actual])

  return (
    <div className="flex h-full flex-col">
      <Link href={inicioDe(panel)} onClick={onNavigate} className="flex items-center gap-3 px-5 pt-5 pb-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
          <Image src="/logo.png" alt="" width={34} height={34} />
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-bold text-white">Las Flores</span>
          <span className="block text-[11px] font-medium tracking-wide text-white/45 uppercase">{subtitulo}</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Menú principal">
        <ul className="space-y-0.5">
          {NAV.map((m) => {
            const Icon = m.icon
            const active = moduloActivo(pathname, m, NAV)
            const icono = <Icon className={cn('size-[17px] shrink-0', active ? 'text-brand-500' : 'text-white/45 group-hover:text-white/80')} />

            if (m.href) {
              return (
                <li key={m.label}>
                  <Link href={m.href} onClick={onNavigate} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
                    {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-500" />}
                    {icono}{m.label}
                  </Link>
                </li>
              )
            }

            const open = abierto === m.label
            const id = `nav-${m.label.replace(/\s+/g, '-').toLowerCase()}`
            return (
              <li key={m.label}>
                <button type="button" onClick={() => setAbierto(open ? null : m.label)} aria-expanded={open} aria-controls={id}
                        className={itemClass(active && !open)}>
                  {active && !open && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-500" />}
                  {icono}
                  <span className={cn('flex-1', active && 'text-white')}>{m.label}</span>
                  <ChevronDown className={cn('size-4 shrink-0 text-white/40 transition-transform duration-200 ease-out', open && 'rotate-180')} />
                </button>
                <div id={id} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <ul className="overflow-hidden" inert={!open}>
                    <li className="h-1" aria-hidden />
                    {m.items!.map((it) => {
                      // gana el enlace más específico (/ingresos/nuevo sobre /ingresos)
                      const on = rutaActiva(pathname, it.href)
                        && !m.items!.some((o) => o.href.length > it.href.length && rutaActiva(pathname, o.href))
                      return (
                        <li key={it.href}>
                          <Link href={it.href} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                                className={cn('relative ml-[21px] flex items-center border-l py-1.5 pr-3 pl-[18px] text-[13px] transition-colors',
                                  on ? 'border-brand-500 font-semibold text-white' : 'border-white/10 text-white/55 hover:border-white/30 hover:text-white')}>
                            {it.label}
                          </Link>
                        </li>
                      )
                    })}
                    <li className="h-1.5" aria-hidden />
                  </ul>
                </div>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

export function Sidebar({ panel, subtitulo }: { panel: Panel; subtitulo: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 bg-ink-900 lg:block">
        <NavContent panel={panel} subtitulo={subtitulo} />
      </aside>

      <button
        onClick={() => setOpen(true)}
        className="no-print fixed top-3 left-3 z-40 grid size-10 place-items-center rounded-lg bg-ink-900 text-white shadow lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 text-white/60" aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            <NavContent onNavigate={() => setOpen(false)} panel={panel} subtitulo={subtitulo} />
          </aside>
        </div>
      )}
    </>
  )
}
