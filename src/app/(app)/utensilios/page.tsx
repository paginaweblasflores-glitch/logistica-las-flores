import Link from 'next/link'
import { UtensilsCrossed, Hammer, BadgeMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes, getAreas, getLocalesOpc, getPersonal } from '@/lib/queries'
import { fmtDate, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, Badge, EmptyState, FilterBar, FilterField, LocalBadge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { RoturaForm } from './rotura-form'
import { generarDescuentosRoturas } from './actions'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Utensilios y roturas' }

export default async function UtensiliosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const { local } = await getAmbito()
  // los controles son de Logística: registra las roturas y genera los descuentos
  const supabase = await createClient()
  const periodo = sp(params, 'periodo', hoyLima().slice(0, 7))
  const [locales, areas, almacenes, personal] = await Promise.all([getLocalesOpc(), getAreas(), getAlmacenes(null, ['area', 'bar', 'activos', 'cocina']), getPersonal()])
  const ini = `${periodo}-01`
  const fin = new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)).toISOString().slice(0, 10)

  let rq = supabase.from('rotura').select('id, fecha, descripcion, cantidad, precio_unitario, total, pct_colaborador, es_grupal, tipo, descontado, local:local_id(codigo), area:area_id(nombre), rotura_responsable(personal:personal_id(nombres))')
    .gte('fecha', ini).lte('fecha', fin)
  if (local) rq = rq.eq('local_id', local.id)
  let iq = supabase.from('v_stock').select('producto_id, almacen_id, nombre, almacen_nombre, local_codigo, cantidad, costo_promedio, valor').in('producto_tipo', ['activo', 'utensilio']).gt('cantidad', 0)
  if (local) iq = iq.eq('local_id', local.id)
  const [{ data: roturas }, { data: inventario }] = await Promise.all([rq.order('fecha', { ascending: false }), iq.order('almacen_nombre').order('nombre').limit(2000)])

  type R = { id: string; fecha: string; descripcion: string; cantidad: number; precio_unitario: number; total: number; pct_colaborador: number; es_grupal: boolean; tipo: string
    descontado: boolean; local: { codigo: string }; area: { nombre: string } | null; rotura_responsable: { personal: { nombres: string } }[] }
  const rs = (roturas ?? []) as unknown as R[]
  const total = rs.reduce((s, r) => s + Number(r.total), 0)
  const colab = rs.reduce((s, r) => s + Number(r.total) * Number(r.pct_colaborador), 0)
  type I = { producto_id: string; almacen_id: string; nombre: string; almacen_nombre: string; local_codigo: string; cantidad: number; costo_promedio: number; valor: number }
  const inv = (inventario ?? []) as I[]

  return (
    <>
      <PageHeader title="Utensilios y roturas" description="Inventario patrimonial por área (salón, repostería, bar, azafate), registro de roturas/pérdidas con sus responsables y descuento mensual." />
      <Section icon={Hammer} title="Registrar rotura o pérdida" className="mb-5">
        <RoturaForm locales={locales} areas={areas} almacenes={almacenes} personal={personal} localDefault={local?.id} hoy={hoyLima()} />
      </Section>

      <FilterBar><FilterField label="Mes"><input type="month" name="periodo" defaultValue={periodo} className="field" /></FilterField></FilterBar>
      <Section icon={UtensilsCrossed} title={`Roturas de ${periodo}`} className="mb-5" bodyClassName="p-0"
        stats={[{ label: 'Total', value: fmtSoles(total) }, { label: 'A cargo del personal', value: fmtSoles(colab) }, { label: 'Asume la empresa', value: fmtSoles(total - colab) }]}
        actions={
          <ActionForm action={generarDescuentosRoturas} className="flex items-center gap-2">
            <input type="hidden" name="periodo" value={periodo} />
            <Select name="local" options={locales} defaultValue={local?.id ?? locales[0]?.id} className="h-8 w-80 text-xs" />
            <SubmitButton size="sm" confirm={`¿Generar los descuentos por roturas de ${periodo}?`}><BadgeMinus className="size-3.5" /> Generar descuentos</SubmitButton>
          </ActionForm>
        }>
        {rs.length ? (
          <PagedTable head={<tr><Th>Fecha</Th><Th>Negocio / área</Th><Th>Bien</Th><Th right>Cant.</Th><Th right>Precio</Th><Th right>Total</Th><Th>Responsables</Th><Th right>Cargo c/u</Th><Th>Estado</Th></tr>}>{rs.map((r) => {
              const n = r.rotura_responsable.length || 1
              return (
                <tr key={r.id}>
                  <Td className="tabular">{fmtDate(r.fecha)}</Td><Td><LocalBadge codigo={r.local.codigo} /><span className="block text-xs text-muted">{r.area?.nombre ?? '—'}</span></Td>
                  <Td className="font-medium">{r.descripcion}{r.tipo !== 'rotura' && <Badge tone="gray" className="ml-1">{r.tipo.replace('_', ' ')}</Badge>}</Td>
                  <Td right>{fmtQty(r.cantidad)}</Td><Td right>{fmtSoles(r.precio_unitario)}</Td><Td right className="font-semibold">{fmtSoles(r.total)}</Td>
                  <Td className="max-w-64 text-xs">{r.es_grupal ? <Badge tone="violet">Grupal ÷{n}</Badge> : null} {r.rotura_responsable.map((x) => x.personal.nombres).join(', ')}</Td>
                  <Td right>{fmtSoles((Number(r.total) * Number(r.pct_colaborador)) / n)}<span className="block text-xs text-muted">{Math.round(Number(r.pct_colaborador) * 100)}%</span></Td>
                  <Td>{r.descontado ? <Badge tone="green">Descontado</Badge> : <Badge tone="amber">Pendiente</Badge>}</Td>
                </tr>
              )
            })}</PagedTable>
        ) : <EmptyState title="Sin roturas registradas en el mes" />}
      </Section>
      <div className="mb-4"><Note>Regla aplicada (hoja “CONTROL DE PÉRDIDAS Y DESCUENTOS POR ROTURAS”): rotura individual → el colaborador asume el % indicado (50% por defecto) y la empresa el resto; rotura grupal (“TODOS”) → el total se reparte en partes iguales entre el personal seleccionado.</Note></div>

      <Section title="Inventario patrimonial por área" bodyClassName="p-0" stats={[{ label: 'Valor', value: fmtSoles(inv.reduce((s, i) => s + Number(i.valor), 0)) }]}>
        {inv.length ? (
          <PagedTable head={<tr><Th>Bien</Th><Th>Área / almacén</Th><Th right>Cantidad</Th><Th right>Costo</Th><Th right>Valor</Th><Th /></tr>}>{inv.map((i) => (
              <tr key={i.producto_id + i.almacen_id}><Td className="font-medium">{i.nombre}</Td><Td className="text-xs">{i.almacen_nombre} <LocalBadge codigo={i.local_codigo} /></Td>
                <Td right>{fmtQty(i.cantidad)}</Td><Td right>{fmtSoles(i.costo_promedio)}</Td><Td right>{fmtSoles(i.valor)}</Td>
                <Td><Link href={`/inventario/kardex?producto=${i.producto_id}&almacen=${i.almacen_id}`} className="text-xs font-semibold text-brand-600">Kardex</Link></Td></tr>
            ))}</PagedTable>
        ) : <EmptyState title="Sin bienes registrados" description="Registre el inventario patrimonial con un movimiento de stock inicial en cada área." />}
      </Section>
    </>
  )
}
