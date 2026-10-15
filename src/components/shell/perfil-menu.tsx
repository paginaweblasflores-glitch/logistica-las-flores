'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout } from '@/app/login/actions'

/** Perfil del usuario en la barra superior: al hacer clic muestra el menú con "Cerrar sesión". */
export function PerfilMenu({ nombre, rol }: { nombre: string; rol: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Iniciales de las palabras principales ("Jefe de Área" → JA, "Fernanda Fernández Lapa" → FF)
  const iniciales = nombre.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || nombre.slice(0, 2).toUpperCase()
  const rolTexto = ({ admin: 'Administrador', logistica: 'Logística', almacen: 'Almacén', compras: 'Compras', cocina: 'Cocina', consulta: 'Consulta' } as Record<string, string>)[rol]
    ?? rol.charAt(0).toUpperCase() + rol.slice(1)

  useEffect(() => {
    if (!open) return
    const cerrar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta de ${nombre}`}
        title={nombre}
        className={cn('grid size-10 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white transition-shadow hover:ring-4 hover:ring-brand-100',
          open && 'ring-4 ring-brand-100')}
      >
        {iniciales}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{iniciales}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">{nombre}</span>
              <span className="block text-xs text-muted">{rolTexto}</span>
            </span>
          </div>
          <form action={logout} className="p-1.5">
            <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50">
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
