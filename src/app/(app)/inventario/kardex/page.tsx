import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getAlmacenActivo, getPanel } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, EmptyState, Badge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ProductPicker, type ProductoLite } from '@/components/product-picker'
import { ExportButton } from '@/components/export-button'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Kardex' }

const REF_LINK: Record<string, string> = { compra: '/compras/', traslado: '/traslados/', conteo: '/conteos/' }

export default async function KardexPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, sel, supabase, panel] = await Promise.all([getAmbito(), getAlmacenActivo(), createClient(), getPanel()])
  const producto = sp(params, 'producto'), almacen = sp(params, 'almacen') || sel.id || ''
  // almacenes: el Kardex es el historial de UN producto (se abre desde Stock); la lista general repetía Entradas y Salidas
  const soloProducto = panel === 'almacen' && !producto
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 4)}-01-01`), hasta = sp(params, 'hasta', hoyLima())

  // Con producto: Kardex con saldo acumulado. Sin producto: últimas líneas (sin recorrer todo el historial)
  let q = supabase.from(producto ? 'v_kardex' : 'v_movimiento_linea')
    .select(`detalle_id, movimiento_id, numero, nro, fecha, tipo_nombre, signo, almacen_nombre, almacen_id, motivo_nombre, referencia_tipo, referencia_id, documento, observacion, producto_id, producto_nombre, unidad, entrada, salida, costo_unitario, importe, fifo_cumplido, codigo_almacen${producto ? ', saldo' : ''}`)
    .gte('fecha', desde).lte('fecha', `${hasta}T23:59:59`)
  if (producto) q = q.eq('producto_id', producto)
  if (almacen) q = q.eq('almacen_id', almacen)
  else if (local) q = q.eq('local_id', local.id)
  // movimientos, almacenes y el producto elegido: al mismo tiempo
  const [{ data, error }, almacenes, { data: pData }] = await Promise.all([
    soloProducto ? Promise.resolve({ data: [], error: null }) : q.order('fecha', { ascending: !!producto }).order('numero', { ascending: !!producto }).limit(producto ? 2000 : 200),
    getAlmacenes(local?.id),
    producto ? supabase.from('producto').select('id, codigo, nombre, tipo, costo_referencia, unidad:unidad_id(codigo)').eq('id', producto).maybeSingle() : Promise.resolve({ data: null }),
  ])
  let prod: ProductoLite | null = null
  if (pData) { const d = pData as unknown as ProductoLite & { unidad: { codigo: string } }; prod = { ...d, unidad: d.unidad.codigo } }

  type Row = { detalle_id: string; movimiento_id: string; numero: number; nro: string | null; fecha: string; tipo_nombre: string; signo: number; almacen_nombre: string
    motivo_nombre: string | null; referencia_tipo: string | null; referencia_id: string | null; documento: string | null; observacion: string | null
    producto_id: string; producto_nombre: string; unidad: string; entrada: number | null; salida: number | null; costo_unitario: number | null
    importe: number; saldo: number; fifo_cumplido: boolean | null; codigo_almacen: number | null }
  const rows = (data ?? []) as unknown as Row[]
  const totEntrada = rows.reduce((s, r) => s + Number(r.entrada ?? 0), 0)
  const totSalida = rows.reduce((s, r) => s + Number(r.salida ?? 0), 0)
  const saldoFinal = producto && almacen && rows.length ? rows[rows.length - 1].saldo : null

  return (
    <>
      <PageHeader title="Kardex" back={panel === 'almacen' ? { href: '/inventario', label: 'Stock' } : undefined}
        description={panel === 'almacen' ? 'Historial del producto: todo lo que entró y salió, y cómo fue quedando la cantidad.' : 'Historial de movimientos con saldo acumulado. Seleccione producto y almacén para ver el Kardex valorizado completo.'}
        actions={<ExportButton filename="kardex" table="v_kardex" dateColumn="fecha" desde={desde} hasta={hasta} order="fecha"
          filters={{ producto_id: producto || undefined, almacen_id: almacen || undefined, local_id: !almacen ? local?.id : undefined }}
          columns={{ fecha: 'Fecha', nro: 'N°', tipo_nombre: 'Tipo', motivo_nombre: 'Concepto', almacen_nombre: 'Almacén', producto_nombre: 'Producto', unidad: 'Unidad', entrada: 'Ingreso', salida: 'Salida', saldo: 'Saldo', costo_unitario: 'Costo unit.', importe: 'Importe', documento: 'Documento', observacion: 'Observación' }} />} />

      <FilterBar>
        <FilterField label="Producto" className="min-w-72"><ProductPicker name="producto" defaultValue={prod} almacenId={sel.id} /></FilterField>
        {!sel.lista.length && <FilterField label="Almacén"><Select name="almacen" options={almacenes} defaultValue={almacen} placeholder="Todos" /></FilterField>}
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>

      {!producto && !soloProducto && <div className="mb-4"><Note>Mostrando los últimos 200 movimientos. Elija un producto para ver su Kardex completo con saldo.</Note></div>}
      {soloProducto && <EmptyState title="Elija un producto" description="Busque el producto arriba, o en Stock use el botón «Kardex» de su fila." />}
      {error && <div className="mb-4"><Note tone="warn">{error.message}</Note></div>}

      {!soloProducto && <Section icon={ScrollText} title={prod ? `Kardex — ${rows[0]?.codigo_almacen != null ? `Cód. ${rows[0].codigo_almacen} · ` : ''}${prod.nombre}` : 'Movimientos recientes'} bodyClassName="p-0"
        stats={[{ label: 'Ingresos', value: fmtQty(totEntrada) }, { label: 'Salidas', value: fmtQty(totSalida) },
                ...(saldoFinal !== null ? [{ label: 'Saldo', value: `${fmtQty(saldoFinal)} ${prod?.unidad ?? ''}` }] : [])]}>
        {rows.length ? (
          <PagedTable head={<tr>
              <Th>Fecha</Th><Th>N°</Th><Th>Concepto</Th>{!producto && <><Th right>Cód.</Th><Th>Producto</Th></>}<Th>Almacén</Th>
              <Th right>Ingreso</Th><Th right>Salida</Th>{producto && <Th right>Saldo</Th>}<Th right>Costo</Th><Th right>Importe</Th><Th>Documento</Th>
            </tr>}>
              {rows.map((r) => (
                <tr key={r.detalle_id} className="hover:bg-canvas/60">
                  <Td className="whitespace-nowrap tabular">{fmtDate(r.fecha, true)}</Td>
                  <Td className="font-mono text-xs font-semibold whitespace-nowrap"><Link href={`/${r.signo > 0 ? 'entradas' : 'salidas'}/${r.movimiento_id}`} className="text-brand-600 hover:underline">{r.nro ?? r.numero}</Link></Td>
                  <Td>
                    <span className="block font-medium">{r.motivo_nombre ?? r.tipo_nombre}</span>
                    {r.motivo_nombre && <span className="text-xs text-muted">{r.tipo_nombre}</span>}
                    {r.fifo_cumplido === false && <Badge tone="red" className="ml-1">Fuera de FIFO</Badge>}
                  </Td>
                  {!producto && <Td right className="font-mono text-xs font-semibold">{r.codigo_almacen ?? '—'}</Td>}
                  {!producto && <Td><Link href={`?producto=${r.producto_id}&desde=${desde}&hasta=${hasta}`} className="hover:text-brand-600">{r.producto_nombre}</Link></Td>}
                  <Td className="text-xs">{r.almacen_nombre}</Td>
                  <Td right className="text-leaf-600">{r.entrada ? fmtQty(r.entrada) : ''}</Td>
                  <Td right className="text-brand-700">{r.salida ? fmtQty(r.salida) : ''}</Td>
                  {producto && <Td right className="font-bold">{fmtQty(r.saldo)}</Td>}
                  <Td right className="text-muted">{fmtSoles(r.costo_unitario)}</Td>
                  <Td right>{fmtSoles(r.importe)}</Td>
                  <Td className="text-xs">
                    {r.referencia_tipo && REF_LINK[r.referencia_tipo] && r.referencia_id
                      ? <Link href={REF_LINK[r.referencia_tipo] + r.referencia_id} className="font-semibold text-brand-600">{r.documento ?? r.referencia_tipo}</Link>
                      : <span className="text-muted">{r.documento ?? r.observacion ?? ''}</span>}
                  </Td>
                </tr>
              ))}
            </PagedTable>
        ) : <EmptyState title="Sin movimientos en el rango" description={`Del ${fmtDate(desde)} al ${fmtDate(hasta)}`} />}
      </Section>}
    </>
  )
}

