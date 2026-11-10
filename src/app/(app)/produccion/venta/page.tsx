import Link from 'next/link'
import { ClipboardList, CircleCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtQty, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FilterField } from '@/components/ui'
import { PagedTable } from '@/components/pager'
import { VentaForm } from './venta-form'

export const metadata = { title: 'Venta del día' }

export default async function VentaDelDiaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const fecha = sp(params, 'fecha', hoyLima())
  const supabase = await createClient()
  const [{ data: platos }, { data: venta }, { data: ultimas }] = await Promise.all([
    supabase.from('prod_plato').select('id, nombre, orden, prod_plato_carne(factor, concepto, producto:producto_id(nombre, porcion))').eq('activo', true).order('orden'),
    supabase.from('prod_venta').select('id, observacion, updated_at, prod_venta_detalle(plato_id, hoja1, hoja2)').eq('fecha', fecha).maybeSingle(),
    supabase.from('prod_venta').select('id, fecha, updated_at, prod_venta_detalle(hoja1, hoja2)').order('fecha', { ascending: false }).limit(62),
  ])
  type PlatoDb = { id: string; nombre: string; prod_plato_carne: { factor: number; concepto: string; producto: { nombre: string; porcion: string | null } }[] }
  const lista = ((platos ?? []) as unknown as PlatoDb[]).map((p) => ({
    id: p.id, nombre: p.nombre,
    carnes: p.prod_plato_carne.map((c) => ({ producto: c.producto.nombre, porcion: c.producto.porcion, factor: Number(c.factor), concepto: c.concepto })),
  }))
  const inicial = Object.fromEntries((venta?.prod_venta_detalle ?? []).map((d) => [d.plato_id, { hoja1: Number(d.hoja1), hoja2: Number(d.hoja2) }]))

  return (
    <>
      <PageHeader title="Venta del día" />
      <FilterBar>
        <FilterField label="Fecha"><input type="date" name="fecha" defaultValue={fecha} max={hoyLima()} className="field" /></FilterField>
      </FilterBar>
      <Section icon={ClipboardList} title={`Platos vendidos — ${fmtDate(fecha)}`} className="mb-5"
        actions={venta ? <span className="flex items-center gap-1.5 text-xs font-semibold text-leaf-600"><CircleCheck className="size-4" /> Guardada {fmtDate(venta.updated_at, true)}</span> : undefined}>
        {/* key: al cambiar de fecha, la hojita se vuelve a llenar con lo de ese día */}
        <VentaForm key={fecha} fecha={fecha} platos={lista} inicial={inicial} observacion={venta?.observacion ?? null} />
      </Section>

      <Section title="Días registrados" bodyClassName="p-0">
        <PagedTable head={<tr><Th>Fecha</Th><Th right>Platos</Th><Th>Guardada</Th></tr>}
          empty="Aún no hay ventas registradas.">
          {(ultimas ?? []).map((v) => (
            <tr key={v.id}>
              <Td><Link href={`?fecha=${v.fecha}`} className="font-semibold text-brand-600">{fmtDate(v.fecha)}</Link></Td>
              <Td right>{fmtQty(v.prod_venta_detalle.reduce((s, d) => s + Number(d.hoja1) + Number(d.hoja2), 0))}</Td>
              <Td className="text-xs text-muted tabular">{fmtDate(v.updated_at, true)}</Td>
            </tr>
          ))}
        </PagedTable>
      </Section>
    </>
  )
}
