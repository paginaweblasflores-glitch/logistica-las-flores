import Link from 'next/link'
import { Wine, ClipboardCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtQty, fmtSoles, hoyLima, MESES_CORTO } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, Badge, EmptyState, LinkButton, EstadoBadge, Note } from '@/components/ui'
import { Bars } from '@/components/charts'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Bebidas de oficinas' }

export default async function BebidasPage() {
  const { local } = await getAmbito()
  const supabase = await createClient()
  const oficinas = await getAlmacenes(local?.id, ['oficina'])
  const ids = oficinas.map((o) => o.id)
  const anio = hoyLima().slice(0, 4)

  const [{ data: stock }, { data: conteos }] = await Promise.all([
    supabase.from('v_stock').select('producto_id, almacen_id, nombre, cantidad, stock_objetivo, costo_promedio').in('almacen_id', ids).eq('producto_tipo', 'bebida').order('nombre'),
    supabase.from('v_conteo_resumen').select('id, numero, fecha, estado, almacen_id, almacen_nombre, responsable_almacen, sobrante_unidades, faltante_unidades, sobrante_valor, faltante_valor, items_con_diferencia')
      .in('almacen_id', ids).eq('tipo', 'bebidas').gte('fecha', `${anio}-01-01`).order('fecha', { ascending: false }),
  ])
  type S = { producto_id: string; almacen_id: string; nombre: string; cantidad: number; stock_objetivo: number | null; costo_promedio: number }
  type C = { id: string; numero: string; fecha: string; estado: string; almacen_id: string; almacen_nombre: string; responsable_almacen: string | null
    sobrante_unidades: number; faltante_unidades: number; sobrante_valor: number; faltante_valor: number; items_con_diferencia: number }
  const st = (stock ?? []) as S[]
  const cs = (conteos ?? []) as C[]
  const productos = [...new Map(st.map((s) => [s.producto_id, s.nombre])).entries()]
  const celda = (p: string, a: string) => st.find((s) => s.producto_id === p && s.almacen_id === a)

  // Resumen mensual (positivo / negativo / total general) por oficina — hoja "Hoja1"
  const serie = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, string | number> = { mes: MESES_CORTO[i] }
    for (const o of oficinas) {
      const m = cs.filter((c) => c.almacen_id === o.id && Number(c.fecha.slice(5, 7)) === i + 1 && c.estado === 'cerrado')
      row[o.codigo!] = Math.round(m.reduce((s, c) => s + Math.abs(Number(c.faltante_valor)) + Number(c.sobrante_valor), 0) * 100) / 100
    }
    return row
  }).filter((r) => oficinas.some((o) => Number(r[o.codigo!]) > 0))

  return (
    <>
      <PageHeader title="Bebidas de oficinas"
        description="Cada oficina mantiene un stock fijo (par). El conteo mensual compara lo encontrado contra el par; los faltantes se descuentan al responsable y se reponen desde el almacén."
        actions={<>
          <LinkButton href="/conteos/nuevo" variant="dark"><ClipboardCheck className="size-4" /> Conteo mensual</LinkButton>
        </>} />
      {!oficinas.length ? <div className="card"><EmptyState title="No hay oficinas configuradas en este negocio" description="Las oficinas con bebidas son almacenes de tipo “oficina”." /></div> : (
        <>
          <Section icon={Wine} title="Stock par vs. stock actual" className="mb-5" bodyClassName="p-0">
            <PagedTable head={<tr><Th>Producto</Th>{oficinas.map((o) => <Th key={o.id} right className="border-l border-line">{o.nombre}</Th>)}</tr>}>{productos.map(([pid, nombre]) => (
                <tr key={pid}><Td className="font-medium">{nombre}</Td>
                  {oficinas.map((o) => {
                    const c = celda(pid, o.id)
                    if (!c) return <Td key={o.id} right className="border-l border-line text-subtle">—</Td>
                    const falta = Number(c.stock_objetivo ?? 0) - Number(c.cantidad)
                    return (
                      <Td key={o.id} right className="border-l border-line">
                        <span className="font-semibold">{fmtQty(c.cantidad)}</span><span className="text-xs text-muted"> / {fmtQty(c.stock_objetivo)}</span>
                        {falta > 0 && <Badge tone="red" className="ml-2">−{fmtQty(falta)}</Badge>}
                        {falta < 0 && <Badge tone="green" className="ml-2">+{fmtQty(-falta)}</Badge>}
                      </Td>
                    )
                  })}
                </tr>
              ))}</PagedTable>
          </Section>
          <div className="mb-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Section title={`Diferencias valorizadas por mes ${anio}`}>
              {serie.length ? <Bars data={serie} x="mes" height={240} series={oficinas.map((o) => ({ key: o.codigo!, name: o.nombre }))} /> : <EmptyState title="Sin conteos cerrados" />}
            </Section>
            <Section title="Resumen del año por oficina" bodyClassName="p-0">
              <PagedTable head={<tr><Th>Oficina</Th><Th right>Total positivo</Th><Th right>Total negativo</Th><Th right>Total general</Th></tr>}>{oficinas.map((o) => {
                  const m = cs.filter((c) => c.almacen_id === o.id && c.estado === 'cerrado')
                  const pos = m.reduce((s, c) => s + Number(c.sobrante_valor), 0), neg = m.reduce((s, c) => s + Number(c.faltante_valor), 0)
                  return <tr key={o.id}><Td className="font-medium">{o.nombre}</Td><Td right className="text-leaf-600">{fmtSoles(pos)}</Td><Td right className="text-brand-700">{fmtSoles(neg)}</Td><Td right className="font-bold">{fmtSoles(pos + Math.abs(neg))}</Td></tr>
                })}</PagedTable>
            </Section>
          </div>
          <div className="mb-4"><Note>“Total general” = positivos + |negativos| valorizados (en el Excel se sumaban unidades de botellas distintas y el rango de la fórmula no siempre cubría todas las filas).</Note></div>
          <Section title="Conteos mensuales" bodyClassName="p-0">
            {cs.length ? (
              <PagedTable head={<tr><Th>N°</Th><Th>Fecha</Th><Th>Oficina</Th><Th>Responsable</Th><Th right>Positivo</Th><Th right>Negativo</Th><Th>Estado</Th></tr>}>{cs.map((c) => (
                  <tr key={c.id}><Td><Link href={`/conteos/${c.id}`} className="font-semibold text-brand-600">{c.numero}</Link></Td><Td className="tabular">{fmtDate(c.fecha)}</Td><Td>{c.almacen_nombre}</Td>
                    <Td className="text-xs">{c.responsable_almacen ?? '—'}</Td><Td right className="text-leaf-600">{fmtQty(c.sobrante_unidades)} · {fmtSoles(c.sobrante_valor)}</Td>
                    <Td right className="text-brand-700">{fmtQty(c.faltante_unidades)} · {fmtSoles(c.faltante_valor)}</Td><Td><EstadoBadge estado={c.estado} /></Td></tr>
                ))}</PagedTable>
            ) : <EmptyState title="Sin conteos de bebidas este año" />}
          </Section>
        </>
      )}
    </>
  )
}
