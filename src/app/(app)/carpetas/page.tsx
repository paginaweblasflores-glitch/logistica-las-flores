import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { avanceCarpeta, carpetaDeCompra, ESTADOS_CONTABLES, type Contable, type DocCarpeta } from '@/lib/carpeta'
import { nombreComprobante } from '@/lib/documentos'
import { fmtDate, fmtSoles, hoyLima, MESES } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, Badge, LocalBadge } from '@/components/ui'
import { Select } from '@/components/select'
import { ExportButton } from '@/components/export-button'

export const metadata = { title: 'Carpetas de compra' }

const SUNAT: Record<string, string> = { '01': 'Factura', '03': 'Boleta', '04': 'Liquidación de compra', '12': 'Ticket' }

/** Primer día del mes siguiente (para filtrar «llegó en este mes» con la hora de Lima). */
const siguienteMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Carpetas de compra (panel de Contabilidad): las compras que ya llegaron, mes a mes, con el estado de su
 * registro contable y cuántos de los 6 documentos tienen. El Excel es el registro de compras del mes.
 */
export default async function CarpetasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, supabase] = await Promise.all([getAmbito(), createClient()])
  const { from, to } = paginar(params)
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes : hoyLima().slice(0, 7)
  const estado = sp(params, 'estado')

  // por la fecha en que llegó (hora de Lima)
  const base = () => {
    let q = supabase.from('v_registro_compras').select('id', { count: 'exact', head: true })
      .gte('fecha_entrega', `${mes}-01T00:00:00-05:00`).lt('fecha_entrega', `${siguienteMes(mes)}-01T00:00:00-05:00`)
    if (local) q = q.eq('local_id', local.id)
    return q
  }
  let lista = supabase.from('v_registro_compras')
    .select('id, numero, fecha_entrega, local_codigo, sin_orden, cotizacion_id, tipo_documento, numero_documento, total_documento, total_compra, proveedor, estado_contable, tipo_sunat, serie, numero_comprobante, vendedor, total, observacion, compra_documento(tipo, estado, numero, fecha, monto, medio, nota, archivo_path, archivo_nombre, archivo_mime)', { count: 'exact' })
    .gte('fecha_entrega', `${mes}-01T00:00:00-05:00`).lt('fecha_entrega', `${siguienteMes(mes)}-01T00:00:00-05:00`)
  if (local) lista = lista.eq('local_id', local.id)
  if (estado) lista = lista.eq('estado_contable', estado)
  // la lista y los contadores por estado, al mismo tiempo
  const [{ data, count }, ...conteos] = await Promise.all([
    lista.order('fecha_entrega', { ascending: false }).range(from, to),
    ...ESTADOS_CONTABLES.map((e) => base().eq('estado_contable', e.id)),
  ])

  type Row = { id: string; numero: string; fecha_entrega: string; local_codigo: string; sin_orden: boolean; cotizacion_id: string | null
    tipo_documento: string | null; numero_documento: string | null; total_documento: number | null; total_compra: number; proveedor: string | null
    estado_contable: 'pendiente' | 'registrado' | 'observado'; tipo_sunat: string | null; serie: string | null; numero_comprobante: string | null
    vendedor: string | null; total: number | null; observacion: string | null; compra_documento: DocCarpeta[] }
  const filas = (data ?? []) as Row[]
  const avance = (r: Row) => avanceCarpeta(carpetaDeCompra({
    id: r.id, estado: 'recibida', sin_orden: r.sin_orden, tipo_documento: r.tipo_documento, numero_documento: r.numero_documento,
    cotizacion: r.cotizacion_id ? { id: r.cotizacion_id, numero: '' } : null, entrada: null,
    contable: r.estado_contable === 'pendiente' ? null : { estado: r.estado_contable, observacion: r.observacion, serie: r.serie, numero: r.numero_comprobante } as Contable,
  }, r.compra_documento))
  const [a, m] = mes.split('-').map(Number)

  return (
    <>
      <PageHeader title="Carpetas de compra" description="Las compras que llegaron en el mes: registre el comprobante de cada una y revise sus documentos."
        actions={
          <ExportButton filename={`registro_compras_${local?.codigo ?? 'todos'}_${mes}`} table="v_registro_compras" order="fecha_emision" label="Excel del mes"
            filters={{ local_id: local?.id, periodo: mes, estado_contable: 'registrado' }}
            columns={{ empresa_ruc: 'RUC empresa', empresa: 'Empresa', periodo: 'Mes contable', fecha_emision: 'Fecha de emisión', tipo_sunat: 'Tipo (SUNAT)',
              serie: 'Serie', numero_comprobante: 'Número', doc_tipo: 'Doc. vendedor', doc_numero: 'N° doc. vendedor', vendedor: 'Vendedor',
              base: 'Base imponible', igv: 'IGV', total: 'Total', numero: 'N° compra', observacion: 'Observación' }} />
        } />
      <FilterBar>
        <FilterField label="Mes de llegada"><input type="month" name="mes" defaultValue={mes} className="field w-44" /></FilterField>
        <FilterField label="Estado contable"><Select name="estado" options={ESTADOS_CONTABLES} defaultValue={estado} placeholder="Todos" /></FilterField>
      </FilterBar>
      <Section icon={FolderOpen} title={`${MESES[m - 1]} ${a}`} bodyClassName="p-0"
        stats={ESTADOS_CONTABLES.map((e, i) => ({ label: e.nombre, value: conteos[i].count ?? 0 }))}>
        {filas.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Llegó</Th><Th>Negocio</Th><Th>Proveedor</Th><Th>Comprobante</Th><Th right>Total</Th><Th>Carpeta</Th><Th>Contabilidad</Th></tr></thead>
              <tbody>
                {filas.map((r) => {
                  const av = avance(r)
                  const est = ESTADOS_CONTABLES.find((e) => e.id === r.estado_contable)!
                  return (
                    <tr key={r.id} className="hover:bg-canvas/60">
                      <Td><Link href={`/compras/${r.id}`} className="enlace whitespace-nowrap">{r.numero}</Link>
                        {r.sin_orden && <span className="block text-xs text-muted">Ingreso directo</span>}</Td>
                      <Td className="tabular">{fmtDate(r.fecha_entrega)}</Td>
                      <Td><LocalBadge codigo={r.local_codigo} /></Td>
                      <Td>{r.vendedor ?? r.proveedor ?? '—'}</Td>
                      <Td className="text-xs">{r.estado_contable === 'registrado' && r.tipo_sunat
                        ? <>{SUNAT[r.tipo_sunat]} {r.serie}-{r.numero_comprobante}</>
                        : <>{nombreComprobante(r.tipo_documento) ?? '—'} {r.numero_documento}</>}</Td>
                      <Td right className="font-semibold">{fmtSoles(r.total ?? r.total_documento ?? r.total_compra)}</Td>
                      <Td><Badge tone={av.invalido ? 'red' : av.listos === av.total ? 'green' : 'amber'}>{av.listos}/{av.total}</Badge></Td>
                      <Td><Badge tone={est.tone}>{est.nombre}</Badge>
                        {r.estado_contable === 'observado' && r.observacion && <span className="mt-0.5 block max-w-56 text-xs text-muted">{r.observacion}</span>}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin compras recibidas en este mes" />}
      </Section>
    </>
  )
}
