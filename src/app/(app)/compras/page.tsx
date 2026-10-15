import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShoppingCart, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo } from '@/lib/session'
import { getCiudades, getProveedores } from '@/lib/queries'
import { fmtDate, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, EstadoBadge, Badge, LocalBadge } from '@/components/ui'
import { Select } from '@/components/select'
import { ExportButton } from '@/components/export-button'

export const metadata = { title: 'Compras' }

const ESTADOS = [{ id: 'borrador', nombre: 'Borrador' }, { id: 'aprobada', nombre: 'Aprobada (por recibir)' }, { id: 'recibida', nombre: 'Recibida' }, { id: 'anulada', nombre: 'Anulada' }]

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // el almacén registra la llegada de las compras en Entradas (un solo paso)
  if ((await getPanel()) === 'almacen') redirect('/entradas/nueva?tipo=compra')
  const params = await searchParams
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const almacen = panel === 'almacen'
  const { page, size, from, to } = paginar(params)
  // El almacén ve las órdenes aprobadas que debe recibir (y las ya recibidas)
  const estado = sp(params, 'estado', almacen ? 'aprobada' : ''), proveedor = sp(params, 'proveedor'), ciudad = sp(params, 'ciudad')
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 4)}-01-01`), hasta = sp(params, 'hasta', hoyLima())

  let q = supabase.from('v_compra_resumen')
    .select('id, numero, fecha, local_codigo, proveedor, proveedor_id, ciudad, estado, tipo_documento, numero_documento, items, total, ahorro, costo_transporte, on_time, in_full, horas_entrega, fecha_objetivo, diferencias_precio', { count: 'exact' })
    .gte('fecha', desde).lte('fecha', hasta)
  if (local) q = q.eq('local_id', local.id)
  // los ingresos directos del almacén (sin orden) se ven en «Ingresos de almacén», no aquí
  q = q.eq('sin_orden', false)
  // lo que es todo fuera de catálogo va directo al área: su llegada la registra Logística, no el almacén
  if (almacen) q = q.eq('solo_fuera_catalogo', false)
  if (sel.id) q = q.eq('almacen_id', sel.id)   // las compras que llegan al almacén elegido arriba
  if (estado) q = q.eq('estado', estado)
  if (proveedor) q = q.eq('proveedor_id', proveedor)
  if (ciudad) q = q.eq('ciudad_id', ciudad)
  // la lista, el resumen (agregado en la base) y las listas de los filtros: al mismo tiempo
  const [{ data, count }, { data: resumen }, proveedores, ciudades] = await Promise.all([
    q.order('fecha', { ascending: false }).order('numero', { ascending: false }).range(from, to),
    supabase.rpc('fn_compras_resumen', { p_local: local?.id ?? null, p_desde: desde, p_hasta: hasta }),
    getProveedores(), getCiudades(),
  ])
  const c = resumen as { total: number; transporte: number; ahorro: number; sobrecosto: number; cantidad: number } | null

  type Row = { id: string; numero: string; fecha: string; local_codigo: string; proveedor: string | null; proveedor_id: string | null; ciudad: string | null; estado: string
    tipo_documento: string | null; numero_documento: string | null; items: number; total: number; ahorro: number | null; costo_transporte: number
    on_time: boolean | null; in_full: boolean | null; horas_entrega: number | null; fecha_objetivo: string | null; diferencias_precio: number }

  return (
    <>
      <PageHeader title={almacen ? 'Recepción de compras' : 'Compras'}
        description={almacen
          ? 'Órdenes de compra aprobadas por Logística para su almacén. Abra una orden y confirme lo que llegó: el stock sube solo.'
          : 'Registro de todas las compras por negocio y origen. Las crea y aprueba Logística; la recepción la confirma cada almacén.'}
        actions={almacen ? undefined : <>
          <ExportButton filename="compras_detalle" table="v_compra_detalle" dateColumn="fecha" desde={desde} hasta={hasta} order="fecha"
            filters={{ local_id: local?.id }}
            columns={{ numero: 'N° compra', fecha: 'Fecha', estado: 'Estado', proveedor: 'Proveedor', ciudad: 'Origen', producto_codigo: 'Código', producto: 'Producto', categoria: 'Categoría', unidad: 'Unidad', cantidad_solicitada: 'Cant. pedida', cantidad_recibida: 'Cant. recibida', precio_unitario: 'Precio', precio_anterior: 'Precio anterior', variacion_pct: 'Variación %', importe: 'Importe' }} />
          <LinkButton href="/compras/nueva"><Plus className="size-4" /> Nueva compra</LinkButton>
        </>} />
      <FilterBar>
        <FilterField label="Proveedor" className="min-w-56"><Select name="proveedor" options={proveedores} defaultValue={proveedor} placeholder="Todos" /></FilterField>
        <FilterField label="Origen"><Select name="ciudad" options={ciudades} defaultValue={ciudad} placeholder="Todos" /></FilterField>
        <FilterField label="Estado"><Select name="estado" options={almacen ? ESTADOS.filter((e) => e.id === 'aprobada' || e.id === 'recibida') : ESTADOS} defaultValue={estado} placeholder="Todos" /></FilterField>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>
      <Section icon={ShoppingCart} title="Compras registradas" bodyClassName="p-0"
        stats={c ? [{ label: 'Total', value: fmtSoles(c.total) }, { label: 'Transporte', value: fmtSoles(c.transporte) }, { label: 'Ahorro', value: fmtSoles(c.ahorro) }, { label: 'Sobrecosto', value: fmtSoles(c.sobrecosto) }] : []}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Fecha</Th><Th>Negocio</Th><Th>Proveedor</Th><Th>Origen</Th><Th>Documento</Th><Th right>Total</Th><Th right>Ahorro</Th><Th>Entrega</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {(data as Row[]).map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/60">
                    <Td><Link href={`/compras/${r.id}`} className="font-semibold text-brand-600">{r.numero}</Link>
                      {r.diferencias_precio > 0 && <span className="mt-0.5 block"><Badge tone="amber">Precio ≠ orden</Badge></span>}</Td>
                    <Td className="tabular">{fmtDate(r.fecha)}</Td>
                    <Td><LocalBadge codigo={r.local_codigo} /></Td>
                    <Td>{r.proveedor_id ? <Link href={`/proveedores/${r.proveedor_id}`} className="hover:text-brand-600">{r.proveedor}</Link> : '—'}</Td>
                    <Td>{r.ciudad ?? '—'}</Td>
                    <Td className="text-xs">{r.tipo_documento ? <span className="capitalize">{r.tipo_documento}</span> : ''} {r.numero_documento}</Td>
                    <Td right className="font-semibold">{fmtSoles(r.total)}{r.costo_transporte > 0 && <span className="block text-xs font-normal text-muted">+ {fmtSoles(r.costo_transporte)} flete</span>}</Td>
                    <Td right className={Number(r.ahorro) > 0 ? 'text-leaf-600' : Number(r.ahorro) < 0 ? 'text-brand-700' : 'text-muted'}>{r.ahorro === null ? '—' : fmtSoles(r.ahorro)}</Td>
                    <Td>{r.on_time === null ? <span className="text-xs text-muted">{r.estado === 'aprobada' && r.fecha_objetivo ? `Debe llegar ${fmtDate(r.fecha_objetivo)}` : '—'}</span> : (
                      <span className="flex gap-1">
                        <Badge tone={r.on_time ? 'green' : 'red'}>{r.on_time ? 'A tiempo' : `Tarde ${r.horas_entrega}h`}</Badge>
                        {r.in_full === false && <Badge tone="amber">Incompleta</Badge>}
                      </span>
                    )}</Td>
                    <Td><EstadoBadge estado={r.estado} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title={almacen ? 'No hay compras por recibir' : 'Sin compras en el periodo'} action={almacen ? undefined : <LinkButton href="/compras/nueva">Registrar compra</LinkButton>} />}
      </Section>
    </>
  )
}

