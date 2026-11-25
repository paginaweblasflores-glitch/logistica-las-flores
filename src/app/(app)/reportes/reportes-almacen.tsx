import { getAlmacenActivo } from '@/lib/session'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, PackagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Local } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { TIPOS_DE } from '@/lib/movimientos'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FiltroFechas, EmptyState } from '@/components/ui'
import { PagedTable } from '@/components/pager'
import { ExportButton } from '@/components/export-button'

type Linea = { movimiento_id: string; numero: number; fecha: string; tipo: string; tipo_nombre: string; almacen_nombre: string; documento: string | null
  observacion: string | null; motivo_nombre: string | null; producto_nombre: string; unidad: string; entrada: number | null; salida: number | null; importe: number }

/** «Movimientos (Kardex)»: cada movimiento con el stock que quedó después (saldo del producto en su almacén) */
const COLS = { nro: 'N° mov.', fecha: 'Fecha', tipo_nombre: 'Tipo', almacen_nombre: 'Almacén', producto_nombre: 'Producto', unidad: 'Unidad',
  entrada: 'Entrada', salida: 'Salida', saldo: 'Stock después', costo_unitario: 'Costo', importe: 'Importe', documento: 'Documento', motivo_nombre: 'Motivo', observacion: 'Observación' }

/** Una descarga del recuadro «Descargar en Excel»: qué responde y su botón */
function Descarga({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-line p-3">
      <div><p className="text-sm font-semibold">{titulo}</p><p className="text-xs text-muted">{texto}</p></div>
      {children}
    </div>
  )
}

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
  // los tipos de cada tarjeta (pantalla y Excel usan los mismos): entradas y salidas sin los traspasos, que van aparte
  const TIPOS = {
    entradas: TIPOS_DE.entrada.filter((t) => t !== 'traslado_entrada'),
    salidas: TIPOS_DE.salida.filter((t) => t !== 'traslado_salida'),
    enviados: ['traslado_salida'],
    recibidos: ['traslado_entrada'],
  }
  const grupos = {
    entradas: ls.filter((l) => TIPOS.entradas.includes(l.tipo)),
    salidas: ls.filter((l) => TIPOS.salidas.includes(l.tipo)),
    enviados: ls.filter((l) => l.tipo === 'traslado_salida'),
    recibidos: ls.filter((l) => l.tipo === 'traslado_entrada'),
  }
  type Nuevo = { producto_id: string; nombre: string; codigo_local: number | null; primera_fecha: string; tipo: string; cantidad: number }
  const nv = (nuevos ?? []) as Nuevo[]
  const suma = (arr: Linea[]) => ({ lineas: arr.length, unidades: arr.reduce((s, l) => s + Number(l.entrada ?? l.salida ?? 0), 0), valor: arr.reduce((s, l) => s + Number(l.importe), 0) })

  const tarjetas = [
    { id: 'entradas', titulo: 'Entradas', icon: ArrowDownToLine, nota: 'Compras recibidas, stock inicial, devoluciones y ajustes', ...suma(grupos.entradas) },
    { id: 'salidas', titulo: 'Salidas', icon: ArrowUpFromLine, nota: 'Salidas a áreas, mermas, devoluciones y faltantes', ...suma(grupos.salidas) },
    { id: 'enviados', titulo: 'Traspasos enviados', icon: ArrowLeftRight, nota: 'Salieron hacia otro almacén', ...suma(grupos.enviados) },
    { id: 'recibidos', titulo: 'Traspasos recibidos', icon: ArrowLeftRight, nota: 'Entraron desde otro almacén (incluye devoluciones)', ...suma(grupos.recibidos) },
    { id: 'nuevos', titulo: 'Productos nuevos', icon: PackagePlus, nota: 'Primer movimiento en su almacén', lineas: nv.length, unidades: null, valor: null },
  ] as const
  const qs = (id: string) => `?desde=${desde}&hasta=${hasta}&ver=${id}`
  const actual = tarjetas.find((t) => t.id === ver) ?? tarjetas[0]
  const detalle = ver === 'nuevos' ? null : grupos[ver as keyof typeof grupos] ?? grupos.entradas

  return (
    <>
      <PageHeader title={`Reportes${sel.actual ? ` · ${sel.actual.corto}` : ''}`} />
      <FilterBar>
        <input type="hidden" name="ver" value={ver} />
        <FiltroFechas desde={desde} hasta={hasta} />
      </FilterBar>

      {/* cada descarga responde una pregunta distinta (almacén elegido arriba y fechas del filtro) */}
      <Section title="Descargar en Excel" className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Descarga titulo="Stock actual" texto="La cantidad exacta de cada producto hoy, como en Inventario (una fila por producto).">
            <ExportButton label="Stock actual" filename={`stock_${local.codigo}_${hoy}`} rpc={{ fn: 'fn_reporte_stock', args: { p_local: local.id, p_almacen: sel.id } }}
              opcionales={['en_presentacion', 'costo_promedio', 'valor', 'minimo']}
              columns={{ almacen: 'Almacén', codigo: 'Cód.', producto: 'Producto', zona: 'Zona', categoria: 'Categoría', unidad: 'Unidad', stock: 'Stock',
                en_presentacion: 'En presentación grande', costo_promedio: 'Costo promedio', valor: 'Valor', minimo: 'Mínimo', estado: 'Estado' }} />
          </Descarga>
          <Descarga titulo="Resumen del periodo" texto="Por producto: stock al inicio + entradas − salidas = stock al final.">
            <ExportButton label="Resumen del periodo" filename={`resumen_${local.codigo}_${desde}_${hasta}`}
              rpc={{ fn: 'fn_reporte_resumen', args: { p_local: local.id, p_almacen: sel.id, p_desde: desde, p_hasta: hasta } }}
              opcionales={['costo_promedio', 'valor_final']}
              columns={{ almacen: 'Almacén', codigo: 'Cód.', producto: 'Producto', categoria: 'Categoría', unidad: 'Unidad', stock_inicio: 'Stock al inicio',
                entradas: 'Entradas', salidas: 'Salidas', stock_final: 'Stock al final', costo_promedio: 'Costo promedio', valor_final: 'Valor final' }} />
          </Descarga>
          <Descarga titulo="Movimientos (Kardex)" texto="Cada entrada y salida, una por una, con el stock que quedó después de cada una.">
            <ExportButton label="Movimientos" filename={`movimientos_${local.codigo}_${desde}_${hasta}`} table="v_kardex" columns={COLS}
              opcionales={['costo_unitario', 'importe', 'documento', 'motivo_nombre', 'observacion']}
              dateColumn="fecha" desde={desde} hasta={hasta} order="fecha"
              filters={{ local_id: local.id, almacen_id: sel.id ?? undefined }} />
          </Descarga>
          <Descarga titulo="Compras del periodo" texto="Qué se compró, a quién, con qué comprobante y a qué precio.">
            {/* el cuadro que pide el Sr. Vladimir: cada compra con su fecha, comprobante, marca, cantidad, precio y total */}
            <ExportButton label="Compras" filename={`compras_${desde}_${hasta}`} opcionales={['marca', 'numero_documento']} table="v_ingreso_almacen" dateColumn="fecha_ingreso" desde={desde} hasta={hasta} order="fecha_ingreso"
              filters={{ almacen_id: sel.id ?? undefined, local_id: !sel.id ? local.id : undefined, fuera_de_catalogo: 'false' }}
              columns={{ fecha_ingreso: 'Fecha de entrada', almacen: 'Almacén', proveedor: 'Proveedor', tipo_documento: 'Comprobante', numero_documento: 'N° comprobante',
                codigo_almacen: 'Cód.', producto: 'Producto', marca: 'Marca', unidad: 'Unidad', cantidad: 'Cantidad', precio_unitario: 'Precio unitario', total: 'Total' }} />
          </Descarga>
        </div>
      </Section>

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

      <Section title={`Detalle: ${actual.titulo}`} bodyClassName="p-0">
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
                  <Td className="text-xs">{l.documento?.toUpperCase() ?? '—'}<span className="block text-muted">{l.motivo_nombre ?? l.observacion ?? ''}</span></Td>
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
