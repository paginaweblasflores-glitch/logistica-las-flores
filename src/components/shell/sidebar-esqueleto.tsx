import Image from 'next/image'

/**
 * La barra lateral mientras llega la sesión (forma parte del marco que se muestra al instante).
 * Mismas medidas que la barra real para que nada salte al completarse.
 */
export function SidebarEsqueleto() {
  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 bg-ink-900 lg:block" aria-busy="true" aria-label="Cargando menú">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 pt-5 pb-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
              <Image src="/logo.png" alt="" width={34} height={34} />
            </span>
            <span className="block text-[15px] font-bold text-white">Las Flores</span>
          </div>
          <div className="animate-pulse space-y-2 px-3">
            <div className="mb-4 h-12 rounded-lg bg-white/[0.05]" />
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-white/[0.04]" />)}
          </div>
        </div>
      </aside>
      <div className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 bg-ink-900 px-3 lg:hidden">
        <span className="size-10" />
        <span className="text-[15px] font-bold text-white">Las Flores</span>
      </div>
    </>
  )
}
