import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

/** Usuario al pie de la barra lateral: iniciales, nombre, rol y el botón para cerrar sesión. */
export function PerfilBarra({ nombre, rol }: { nombre: string; rol: string }) {
  // Iniciales de las palabras principales ("Jefe de Área" → JA, "Fernanda Fernández Lapa" → FF)
  const iniciales = nombre.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || nombre.slice(0, 2).toUpperCase()
  const rolTexto = ({ admin: 'Administrador', logistica: 'Logística', almacen: 'Almacén', compras: 'Compras', cocina: 'Cocina', consulta: 'Consulta', jefe_area: 'Jefe de área' } as Record<string, string>)[rol]
    ?? rol.charAt(0).toUpperCase() + rol.slice(1)

  return (
    <div className="flex items-center gap-2.5 px-2 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-[13px] font-bold text-white" aria-hidden>{iniciales}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-white" title={nombre}>{nombre}</span>
        <span className="block truncate text-[11.5px] text-white/50">{rolTexto}</span>
      </span>
      <form action={logout}>
        <button title="Cerrar sesión" aria-label="Cerrar sesión"
                className="grid size-9 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white">
          <LogOut className="size-[17px]" />
        </button>
      </form>
    </div>
  )
}
