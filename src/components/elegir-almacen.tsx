import { Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/ui'

/**
 * Con «Todos» elegido arriba el panel es solo para consultar. Para registrar (producto, ingreso, salida,
 * traspaso…) primero se elige el almacén donde se va a trabajar.
 */
export function ElegirAlmacen({ titulo, volver }: { titulo: string; volver: { href: string; label: string } }) {
  return (
    <>
      <PageHeader title={titulo} back={volver} />
      <div className="card flex items-start gap-4 p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink-700"><Warehouse className="size-5" /></span>
        <div className="text-sm">
          <p className="font-semibold">Elija arriba el almacén donde va a trabajar</p>
          <p className="mt-1 text-muted">Con «Todos» solo se consulta. Para registrar, seleccione <b>Almacén 01</b> o <b>Almacén 02 — Cocina</b> en la barra superior y vuelva a esta pantalla.</p>
        </div>
      </div>
    </>
  )
}
