'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Opcion } from '@/lib/queries'
import type { UnidadOpc } from '@/components/unidad-combobox'
import { btnClass } from '@/components/ui'
import { ProductoFoto } from '@/components/producto-foto'
import { ProductoForm, type NegocioOpc } from '../form'
import { agregarAMiCatalogo } from '../actions'

type Sugerencia = { id: string; codigo: string; nombre: string; imagen_url: string | null; unidad: string; codigo_local: number | null }

/**
 * Alta de producto en el almacén: el formulario está listo desde el inicio. Mientras se escribe el nombre,
 * debajo aparecen los productos parecidos del catálogo para no duplicarlos (la persona decide; nunca se fusiona solo).
 */
export function AltaConSugerencias({ local, categorias, unidades, almacenId }: {
  local: NegocioOpc; categorias: Opcion[]; unidades: UnidadOpc[]; almacenId: string
}) {
  const [texto, setTexto] = useState('')
  const [sug, setSug] = useState<Sugerencia[]>([])
  const [usando, iniciar] = useTransition()
  const [error, setError] = useState('')
  const [cerrado, setCerrado] = useState('')   // texto con el que se cerró la lista ("es nuevo"): vuelve a abrirse si cambia
  // "Usar este": agrega a su catálogo el producto que ya existe (está dentro del formulario, por eso no es otro <form>)
  const usar = (id: string) => iniciar(async () => {
    const fd = new FormData(); fd.set('producto_id', id); fd.set('local_id', local.id)
    fd.set('almacen', almacenId)   // se agrega al almacén elegido arriba, con su propio código
    const r = await agregarAMiCatalogo(undefined, fd)
    if (r?.error) setError(r.error)
  })

  useEffect(() => {
    const t = texto.trim()
    if (t.length < 3) { setSug([]); return }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc('fn_buscar_producto_maestro', { p_texto: t, p_limite: 5 })
      const lista = (data ?? []) as Sugerencia[]
      // «Ya está» solo si está en ESTE almacén (con su código); si está en otro almacén o negocio, se ofrece «Usar este»
      const { data: aqui } = lista.length
        ? await supabase.from('producto_almacen').select('producto_id, codigo').eq('almacen_id', almacenId).in('producto_id', lista.map((s) => s.id))
        : { data: [] }
      const cod = new Map((aqui ?? []).map((x) => [x.producto_id, x.codigo as number | null]))
      setSug(lista.map((s) => ({ ...s, codigo_local: cod.has(s.id) ? cod.get(s.id) ?? 0 : null })))
    }, 250)
    return () => clearTimeout(timer)
  }, [texto, almacenId])

  const aviso = sug.length > 0 && cerrado !== texto && (
    <div className="absolute inset-x-0 top-full z-30 mt-1 w-[min(640px,calc(100vw-48px))] overflow-hidden rounded-lg border border-amber-200 bg-white shadow-xl">
      <p className="flex items-center justify-between gap-2 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
        ¿Ya existe? Revise antes de crearlo para no duplicarlo:
        <button type="button" onClick={() => setCerrado(texto)} className="rounded px-1.5 py-0.5 text-ink-700 hover:bg-amber-100">Es nuevo, cerrar ✕</button>
      </p>
      <ul className="divide-y divide-amber-100">
        {sug.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <ProductoFoto src={s.imagen_url} alt={s.nombre} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.nombre}</span><span className="text-xs text-muted">{s.unidad}</span></span>
            {s.codigo_local !== null ? (
              <Link href={`/productos/${s.id}`} className="shrink-0 text-xs font-semibold text-brand-600">Ya está (código {s.codigo_local}) →</Link>
            ) : (
              <button type="button" disabled={usando} onClick={() => usar(s.id)} className={btnClass('outline', 'sm') + ' shrink-0'}>{usando ? 'Agregando…' : 'Usar este'}</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="px-3 py-1.5 text-xs font-semibold text-brand-700">{error}</p>}
    </div>
  )

  return (
    <ProductoForm categorias={categorias} unidades={unidades} negocios={[local]} seleccionados={[local.id]}
      almacenId={almacenId} alEscribirNombre={setTexto} avisoNombre={aviso} />
  )
}
