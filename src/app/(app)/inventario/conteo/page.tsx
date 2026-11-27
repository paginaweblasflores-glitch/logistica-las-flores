import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, getLocales } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { LOGO_DOC } from '@/lib/empresa'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, FilterBar, FilterField, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Hoja de conteo' }

type Fila = { codigo: number | null; producto: string; unidad: string; zona: string; categoria: string; stock: number; en_presentacion: string | null; ultimo_precio: number | null }

/**
 * Hoja de conteo del almacén (Imprimir / PDF, A4): todos los productos con el stock de HOY y su último precio de
 * compra, con ✓, «Cantidad física» y «Diferencia» en blanco para contar a mano. Ordenada como el almacén físico
 * (zona → categoría → producto). La descargan Logística y el almacenero; las diferencias se corrigen con «Ajustar»
 * en Stock actual. No registra el conteo en el sistema.
 */
export default async function HojaConteoPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [panel, sel, { local }, locales, supabase] = await Promise.all([getPanel(), getAlmacenActivo(), getAmbito(), getLocales(), createClient()])
  if (panel !== 'logistica' && panel !== 'almacen') notFound()
  // los almacenes que puede elegir: los suyos (almacén) o los del negocio de arriba (Logística)
  const opciones = panel === 'almacen' ? sel.lista.map((a) => ({ id: a.id, nombre: a.nombre })) : (await getAlmacenes(local?.id, ['almacen'])).map((a) => ({ id: a.id, nombre: a.nombre }))
  const almacenId = sp(params, 'almacen') || sel.id || (opciones.length === 1 ? opciones[0].id : '')
  const almacen = opciones.find((a) => a.id === almacenId)
  const categoria = sp(params, 'categoria')

  const filtros = (
    <FilterBar>
      <FilterField label="Almacén" className="min-w-64"><Select name="almacen" options={opciones} defaultValue={almacenId} placeholder="Elija el almacén" /></FilterField>
    </FilterBar>
  )
  if (!almacen) {
    return (
      <>
        <PageHeader title="Hoja de conteo" back={{ href: '/inventario', label: 'Stock actual' }} />
        {filtros}
        <Note>Elija el almacén que va a contar.</Note>
      </>
    )
  }

  const [{ data }, { data: alm }] = await Promise.all([
    supabase.rpc('fn_hoja_conteo', { p_almacen: almacen.id }),
    // los responsables (Configuración → Firmas de la orden de compra) y la empresa
    supabase.from('almacen').select('local:local_id(id, codigo, oc_elaborado_por, oc_aprobado_por)').eq('id', almacen.id).maybeSingle(),
  ])
  const neg = alm?.local as unknown as { id: string; codigo: string; oc_elaborado_por: string | null; oc_aprobado_por: string | null } | null
  const empresa = locales.find((l) => l.id === neg?.id)
  const todas = (data ?? []) as Fila[]
  const categorias = [...new Set(todas.map((f) => f.categoria))]
  const filas = categoria ? todas.filter((f) => f.categoria === categoria) : todas
  // agrupadas por zona → categoría (como el almacén físico)
  const grupos: { zona: string; categoria: string; filas: Fila[] }[] = []
  for (const f of filas) {
    const g = grupos.at(-1)
    if (g && g.zona === f.zona && g.categoria === f.categoria) g.filas.push(f)
    else grupos.push({ zona: f.zona, categoria: f.categoria, filas: [f] })
  }
  const ahora = new Date()
  let n = 0

  return (
    <>
      <PageHeader title={`Hoja de conteo · ${almacen.nombre}`} back={{ href: '/inventario', label: 'Stock actual' }}
        description="Con el stock de este momento. Imprímala (o guárdela en PDF), cuente y corrija las diferencias con «Ajustar» en Stock actual."
        actions={<PrintButton label="Imprimir / PDF" />} />
      <FilterBar>
        <FilterField label="Almacén" className="min-w-64"><Select name="almacen" options={opciones} defaultValue={almacenId} placeholder="Elija el almacén" /></FilterField>
        <FilterField label="Categoría" className="min-w-56"><Select name="categoria" options={categorias.map((c) => ({ id: c, nombre: c }))} defaultValue={categoria} placeholder="Todas" /></FilterField>
      </FilterBar>

      <section className="documento print-area hoja-conteo card mx-auto max-w-5xl p-6 text-sm sm:p-8">
        <header className="mb-3 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-3">
          <div className="flex items-center gap-3">
            <Image src={LOGO_DOC[neg?.codigo ?? 'LF'] ?? LOGO_DOC.LF} alt="" width={120} height={52} priority className="h-12 w-auto object-contain" />
            <div><p className="font-bold">{empresa?.razon_social ?? empresa?.nombre}</p><p className="text-xs">RUC {empresa?.ruc ?? '—'}</p></div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">CONTEO DE ALMACÉN</p>
            <p className="text-xs font-semibold">{almacen.nombre}{categoria ? ` · ${categoria}` : ''}</p>
          </div>
        </header>
        <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <p><b>Responsable del conteo:</b> {neg?.oc_aprobado_por ?? '________________'}</p>
          <p><b>Fecha:</b> {fmtDate(ahora)}</p>
          <p><b>Responsable del almacén:</b> {neg?.oc_elaborado_por ?? '________________'}</p>
          <p><b>Hora:</b> {ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })} · stock del sistema a esta hora</p>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead><tr className="bg-canvas">
            {['✓', 'N°', 'Cód.', 'Nombre del producto', 'Unidad', 'Precio', 'Stock del sistema', 'Cantidad física', 'Diferencia'].map((h) => (
              <th key={h} className={`border border-ink-900/50 px-1.5 py-1 font-semibold ${['Precio', 'Stock del sistema'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {grupos.map((g) => [
              <tr key={`${g.zona}|${g.categoria}`}><td colSpan={9} className="border border-ink-900/50 bg-canvas/60 px-1.5 py-1 text-[10px] font-bold uppercase">{g.zona} · {g.categoria}</td></tr>,
              ...g.filas.map((f) => {
                n += 1
                return (
                  <tr key={`${f.codigo}-${f.producto}`} className="h-7">
                    <td className="w-6 border border-ink-900/50 text-center">☐</td>
                    <td className="w-8 border border-ink-900/50 px-1.5 tabular">{n}</td>
                    <td className="w-10 border border-ink-900/50 px-1.5 font-mono tabular">{f.codigo ?? '—'}</td>
                    <td className="border border-ink-900/50 px-1.5">{f.producto}</td>
                    <td className="w-12 border border-ink-900/50 px-1.5">{f.unidad}</td>
                    <td className="w-16 border border-ink-900/50 px-1.5 text-right tabular">{f.ultimo_precio === null ? '—' : fmtSoles(f.ultimo_precio)}</td>
                    <td className="w-20 border border-ink-900/50 px-1.5 text-right font-semibold tabular">{fmtQty(f.stock)}{f.en_presentacion && <span className="block text-[9px] font-normal">{f.en_presentacion}</span>}</td>
                    <td className="w-20 border border-ink-900/50" />
                    <td className="w-16 border border-ink-900/50" />
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-muted">{filas.length} productos · Precio: último precio de compra · Diferencia = cantidad física − stock del sistema.</p>
        <div className="mt-5 text-xs">
          <p className="font-bold">Observaciones:</p>
          <div className="mt-2 space-y-5">{[1, 2, 3].map((i) => <div key={i} className="border-b border-ink-900/50" />)}</div>
        </div>
      </section>
    </>
  )
}
