import { notFound } from 'next/navigation'
import { Boxes } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td } from '@/components/ui'
import { ExportButton } from '@/components/export-button'

export const metadata = { title: 'Stock del día' }

/** Un envío del stock del día: todos los productos del almacén con su cantidad y valor en ese momento. */
export default async function StockDiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: r }, { data: det }] = await Promise.all([
    supabase.from('reporte_stock').select('id, fecha, enviado_at, productos, valor, almacen:almacen_id(nombre)').eq('id', id).maybeSingle(),
    supabase.from('reporte_stock_detalle').select('producto_id, codigo_almacen, producto, categoria, unidad, cantidad, costo_promedio, valor')
      .eq('reporte_id', id).order('categoria').order('producto').limit(5000),
  ])
  if (!r) notFound()
  const rep = r as unknown as { fecha: string; enviado_at: string; productos: number; valor: number; almacen: { nombre: string } }
  type D = { producto_id: string; codigo_almacen: number | null; producto: string; categoria: string | null; unidad: string; cantidad: number; costo_promedio: number | null; valor: number }
  const filas = (det ?? []) as D[]
  const conStock = filas.filter((f) => Number(f.cantidad) !== 0).length
  const hora = new Date(rep.enviado_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

  return (
    <>
      <PageHeader title={`Stock del ${fmtDate(rep.fecha)} · ${rep.almacen.nombre}`} back={{ href: '/almacenes/stock-diario', label: 'Stock del día' }}
        description={`Enviado a las ${hora} · es el stock de ese momento, antes de los movimientos del día.`}
        actions={<ExportButton filename={`stock_${rep.almacen.nombre}_${rep.fecha}`} table="reporte_stock_detalle" filters={{ reporte_id: id }} order="producto"
          columns={{ codigo_almacen: 'Cód.', producto: 'Producto', categoria: 'Categoría', unidad: 'Unidad', cantidad: 'Cantidad', costo_promedio: 'Costo promedio', valor: 'Valor' }} />} />
      <Section icon={Boxes} title="Productos" bodyClassName="p-0"
        stats={[{ label: 'Con stock', value: `${conStock} de ${filas.length}` }, { label: 'Valor', value: fmtSoles(rep.valor) }]}>
        <Table>
          <thead><tr><Th right>Cód.</Th><Th>Producto</Th><Th>Categoría</Th><Th right>Cantidad</Th><Th right>Costo prom.</Th><Th right>Valor</Th></tr></thead>
          <tbody>{filas.map((f) => (
            <tr key={f.producto_id} className={Number(f.cantidad) === 0 ? 'text-muted' : ''}>
              <Td right className="font-mono text-xs font-semibold">{f.codigo_almacen ?? '—'}</Td>
              <Td className="font-medium">{f.producto}</Td>
              <Td className="text-xs">{f.categoria ?? '—'}</Td>
              <Td right className="font-semibold">{fmtQty(f.cantidad)} <span className="text-xs font-normal text-muted">{f.unidad}</span></Td>
              <Td right className="text-muted">{fmtSoles(f.costo_promedio)}</Td>
              <Td right>{fmtSoles(f.valor)}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>
    </>
  )
}
