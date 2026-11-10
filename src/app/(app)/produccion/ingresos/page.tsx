import { Truck, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCatalogoProduccion, cantidadIngreso, ahoraLima } from '@/lib/produccion'
import { fmtDate, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FilterField, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { PagedTable } from '@/components/pager'
import { AnularConMotivo } from '@/components/anular-con-motivo'
import { IngresoForm } from './ingreso-form'
import { anularMovimiento } from '../actions'

export const metadata = { title: 'Ingresos de proveedores' }

type Ingreso = { id: string; fecha: string; producto: string; producto_tipo: string; unidad: string; porcion: string | null; proveedor: string | null; guia: string | null
  sacos: number | null; kilos: number | null; cantidad: number | null; precio: number | null; total: number | null; observacion: string | null; anulado: boolean }

export default async function IngresosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const mes = sp(params, 'mes', hoyLima().slice(0, 7)), proveedor = sp(params, 'proveedor')
  const [y, m] = mes.split('-').map(Number)
  const hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const supabase = await createClient()
  let q = supabase.from('v_prod_ingreso').select('id, fecha, producto, producto_tipo, unidad, porcion, proveedor, guia, sacos, kilos, cantidad, precio, total, observacion, anulado')
    .gte('dia', `${mes}-01`).lt('dia', hasta)
  if (proveedor) q = q.eq('proveedor_id', proveedor)
  const [{ productos, proveedores }, { data }] = await Promise.all([getCatalogoProduccion(), q.order('fecha', { ascending: false }).limit(1000)])
  const filas = (data ?? []) as Ingreso[]
  const validas = filas.filter((f) => !f.anulado)

  // resumen del mes por producto: sacos, kilos, cantidad y total (lo que pidió: «cuántos kilos de carne, cuántos sacos de papa»)
  const porProducto = new Map<string, { producto: string; sacos: number; kilos: number; cantidad: number; porcion: string | null; unidad: string; total: number }>()
  for (const f of validas) {
    const r = porProducto.get(f.producto) ?? { producto: f.producto, sacos: 0, kilos: 0, cantidad: 0, porcion: f.porcion, unidad: f.unidad, total: 0 }
    r.sacos += Number(f.sacos ?? 0); r.kilos += Number(f.kilos ?? 0); r.cantidad += Number(f.cantidad ?? 0); r.total += Number(f.total ?? 0)
    porProducto.set(f.producto, r)
  }
  const resumen = [...porProducto.values()].sort((a, b) => b.total - a.total || a.producto.localeCompare(b.producto))
  const totalMes = validas.reduce((s, f) => s + Number(f.total ?? 0), 0)
  const kilosMes = validas.reduce((s, f) => s + Number(f.kilos ?? 0), 0)
  const sacosMes = validas.reduce((s, f) => s + Number(f.sacos ?? 0), 0)

  return (
    <>
      <PageHeader title="Ingresos de proveedores" />
      <Section icon={Truck} title="Registrar ingreso" className="mb-5">
        <IngresoForm productos={productos.filter((p) => p.activo)} proveedores={proveedores.filter((p) => p.activo)} ahora={ahoraLima()} />
      </Section>

      <FilterBar>
        <FilterField label="Mes"><input type="month" name="mes" defaultValue={mes} className="field" /></FilterField>
        <FilterField label="Proveedor"><Select name="proveedor" options={proveedores} defaultValue={proveedor} placeholder="Todos" /></FilterField>
      </FilterBar>

      <Section title="Resumen del mes" className="mb-5" bodyClassName="p-0"
        stats={[{ label: 'Sacos', value: fmtQty(sacosMes) }, { label: 'Kilos', value: fmtQty(kilosMes) }, { label: 'Total', value: fmtSoles(totalMes) }]}>
        <PagedTable head={<tr><Th>Producto</Th><Th right>Sacos</Th><Th right>Kilos</Th><Th right>Cantidad</Th><Th right>Total</Th></tr>}
          empty="Sin ingresos en este mes."
          foot={resumen.length > 0 && <tr><Td className="font-semibold">Total</Td><Td right className="font-semibold">{fmtQty(sacosMes)}</Td><Td right className="font-semibold">{fmtQty(kilosMes)}</Td><Td /><Td right className="font-bold">{fmtSoles(totalMes)}</Td></tr>}>
          {resumen.map((r) => (
            <tr key={r.producto}>
              <Td className="font-medium">{r.producto}</Td>
              <Td right>{r.sacos ? fmtQty(r.sacos) : '—'}</Td>
              <Td right>{r.kilos ? fmtQty(r.kilos) : '—'}</Td>
              <Td right>{r.cantidad ? `${fmtQty(r.cantidad)} ${r.porcion ?? 'und'}` : '—'}</Td>
              <Td right className="font-semibold">{r.total ? fmtSoles(r.total) : '—'}</Td>
            </tr>
          ))}
        </PagedTable>
      </Section>

      <Section title="Historial" bodyClassName="p-0" stats={[{ label: 'Registros', value: validas.length }]}>
        <PagedTable head={<tr><Th>Fecha</Th><Th>Producto</Th><Th>Cantidad</Th><Th>Proveedor</Th><Th>Guía</Th><Th right>Precio</Th><Th right>Total</Th><Th /></tr>}
          empty="Sin ingresos en este mes.">
          {filas.map((f) => (
            <tr key={f.id} className={f.anulado ? 'opacity-50' : undefined}>
              <Td className="whitespace-nowrap tabular">{fmtDate(f.fecha, true)}</Td>
              <Td className="font-medium">{f.producto}{f.producto_tipo === 'kardex' && <Badge tone="amber" className="ml-1.5">Kardex</Badge>}
                {f.observacion && <span className="block text-xs font-normal text-muted">{f.observacion}</span>}</Td>
              <Td className="whitespace-nowrap">{cantidadIngreso(f)}</Td>
              <Td>{f.proveedor ?? '—'}</Td>
              <Td className="uppercase">{f.guia ?? '—'}</Td>
              <Td right>{f.precio === null ? '—' : fmtSoles(f.precio)}</Td>
              <Td right className="font-semibold">{f.anulado ? <Badge tone="dark">Anulado</Badge> : f.total === null ? '—' : fmtSoles(f.total)}</Td>
              <Td>{!f.anulado && (
                <AnularConMotivo action={anularMovimiento} campos={{ id: f.id }} titulo={`Anular ingreso de ${f.producto}`}
                  detalle="El registro no se borra: queda anulado y deja de contar en el kardex y en los reportes.">
                  <Ban className="size-3.5" /> Anular
                </AnularConMotivo>)}</Td>
            </tr>
          ))}
        </PagedTable>
      </Section>
    </>
  )
}
