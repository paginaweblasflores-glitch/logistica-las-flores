import { getAlmacenActivo } from '@/lib/session'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, PackagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Local } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FilterField, EmptyState } from '@/components/ui'
import { PagedTable } from '@/components/pager'
import { ExportButton } from '@/components/export-button'

type Linea = { movimiento_id: string; numero: number; fecha: string; tipo: string; tipo_nombre: string; almacen_nombre: string; documento: string | null
  observacion: string | null; motivo_nombre: string | null; producto_nombre: string; unidad: string; entrada: number | null; salida: number | null; importe: number }

const COLS = { numero: 'N° mov.', fecha: 'Fecha', tipo_nombre: 'Tipo', almacen_nombre: 'Almacén', producto_nombre: 'Producto', unidad: 'Unidad',
  entrada: 'Entrada', salida: 'Salida', costo_unitario: 'Costo', importe: 'Importe', documento: 'Documento', motivo_nombre: 'Motivo', observacion: 'Observación' }

/** Reportes del panel de almacén: qué entró, qué salió, qué se traspasó y qué productos son nuevos en el rango. */
export async function ReportesAlmacen({ local, params }: { local: Local; params: Record<string, string> }) {
  const supabase = await createClient()
  const hoy = hoyLima()
  const desde = sp(params, 'desde', `${hoy.slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoy)
  const ver = sp(params, 'ver', 'entradas')

  const sel = await getAlmacenActivo()   // reportes del almacén elegido arriba (o de todos)
  const [{ data: lineas }, { data: nuevos }] = await Promise.all([
    supabase.from('v_movimiento_linea')
      .select('movimiento_id, numero, fecha, tipo, tipo_nombre, almacen_nombre, documento, observacion, motivo_nombre, producto_nombre, unidad, entrada, salida, importe')
      .eq('local_id', local.id).match(sel.id ? { almacen_id: sel.id } : {}).gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`)
      .order('fecha', { ascending: false }).limit(10000),
    supabase.rpc('fn_productos_nuevos', { p_local: local.id, p_desde: desde, p_hasta: hasta }),
  ])
  const ls = (lineas ?? []) as Linea[]
  const grupos = {
    entradas: ls.filter((l) => l.entrada !== null && l.tipo !== 'traslado_entrada'),
    salidas: ls.filter((l) => l.salida !== null && l.tipo !== 'traslado_salida'),
    enviados: ls.filter((l) => l.tipo === 'traslado_salida'),
    recibidos: ls.filter((l) => l.tipo === 'traslado_entrada'),
  }
  type Nuevo = { producto_id: string; nombre: string; codigo_local: number | null; primera_fecha: string; tipo: string; cantidad: number }
  const nv = (nuevos ?? []) as Nuevo[]
  const suma = (arr: Linea[]) => ({ lineas: arr.length, unidades: arr.reduce((s, l) => s + Number(l.entrada ?? l.salida ?? 0), 0), valor: arr.reduce((s, l) => s + Number(l.importe), 0) })

  const tarjetas = [
    { id: 'entradas', titulo: 'Entradas', icon: ArrowDownToLine, nota: 'Compras recibidas, stock inicial, devoluciones y ajustes', ...suma(grupos.entradas) },
    { id: 'salidas', titulo: 'Salidas', icon: ArrowUpFromLine, nota: 'Consumo de áreas, ventas, mermas y ajustes', ...suma(grupos.salidas) },
    { id: 'enviados', titulo: 'Traspasos enviados', icon: ArrowLeftRight, nota: 'Salieron hacia otro almacén', ...suma(grupos.enviados) },
    { id: 'recibidos', titulo: 'Traspasos recibidos', icon: ArrowLeftRight, nota: 'Entraron desde otro almacén (incluye devoluciones)', ...suma(grupos.recibidos) },
    { id: 'nuevos', titulo: 'Productos nuevos', icon: PackagePlus, nota: 'Primer movimiento en su almacén', lineas: nv.length, unidades: null, valor: null },
  ] as const
  const qs = (id: string) => `?desde=${desde}&hasta=${hasta}&ver=${id}`
  const actual = tarjetas.find((t) => t.id === ver) ?? tarjetas[0]
  const detalle = ver === 'nuevos' ? null : grupos[ver as keyof typeof grupos] ?? grupos.entradas

  return (
    <>
      <PageHeader title="Reportes del almacén" description={`Movimientos de ${local.nombre} del ${fmtDate(desde)} al ${fmtDate(hasta)}.`} />
      <FilterBar>
        <input type="hidden" name="ver" value={ver} />
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tarjetas.map((t) => {
          const Icon = t.icon
          return (
            <Link key={t.id} href={qs(t.id)} aria-current={actual.id === t.id ? 'page' : undefined}
              className={cn('card flex flex-col gap-1 p-4 transition-colors hover:border-brand-200', actual.id === t.id && 'border-brand-600 ring-2 ring-brand-100')}>
              <span className="flex items-center justify-between text-xs font-semibold tracking-wide text-muted uppercase">{t.titulo}<Icon className="size-4 text-subtle" /></span>
              <span className="text-2xl font-bold tabular">{t.lineas}</span>
              <span className="text-xs text-muted">{t.unidades !== null ? `${fmtQty(t.unidades)} unidades · ${fmtSoles(t.valor)}` : t.nota}</span>
            </Link>
          )
        })}
      </div>

      <Section title={`Detalle: ${actual.titulo}`} bodyClassName="p-0"
        actions={detalle ? <ExportButton filename={`almacen_${local.codigo}_${actual.id}_${desde}_${hasta}`} table="v_movimiento_linea" columns={COLS}
          dateColumn="fecha" desde={desde} hasta={hasta} order="fecha"
          filters={{ local_id: local.id, ...(actual.id === 'enviados' ? { tipo: 'traslado_salida' } : actual.id === 'recibidos' ? { tipo: 'traslado_entrada' } : actual.id === 'entradas' ? { signo: '1' } : { signo: '-1' }) }} /> : undefined}>
        {detalle ? (
          detalle.length ? (
            <PagedTable head={<tr><Th>Fecha</Th><Th>Tipo</Th><Th>Producto</Th><Th right>Cantidad</Th><Th right>Importe</Th><Th>Documento / motivo</Th></tr>}>
              {detalle.map((l, i) => (
                <tr key={l.movimiento_id + i}>
                  <Td className="whitespace-nowrap tabular">{fmtDate(l.fecha, true)}</Td>
                  <Td className="text-xs">{l.tipo_nombre}<span className="block text-muted">{l.almacen_nombre}</span></Td>
                  <Td className="font-medium">{l.producto_nombre}</Td>
                  <Td right className="tabular">{fmtQty(l.entrada ?? l.salida)} <span className="text-xs text-muted">{l.unidad}</span></Td>
                  <Td right>{fmtSoles(l.importe)}</Td>
                  <Td className="text-xs">{l.documento ?? '—'}<span className="block text-muted">{l.motivo_nombre ?? l.observacion ?? ''}</span></Td>
                </tr>
              ))}
            </PagedTable>
          ) : <EmptyState title="Sin movimientos de este tipo en el rango" />
        ) : nv.length ? (
          <PagedTable head={<tr><Th right>Cód.</Th><Th>Producto</Th><Th>Primer movimiento</Th><Th right>Cantidad</Th></tr>}>
            {nv.map((n) => (
              <tr key={n.producto_id}>
                <Td right className="font-mono text-xs tabular">{n.codigo_local ?? '—'}</Td>
                <Td><Link href={`/productos/${n.producto_id}`} className="font-medium hover:text-brand-600">{n.nombre}</Link></Td>
                <Td className="text-xs tabular">{fmtDate(n.primera_fecha, true)}</Td>
                <Td right className="tabular">{fmtQty(n.cantidad)}</Td>
              </tr>
            ))}
          </PagedTable>
        ) : <EmptyState title="No hubo productos nuevos en el rango" />}
      </Section>
    </>
  )
}
