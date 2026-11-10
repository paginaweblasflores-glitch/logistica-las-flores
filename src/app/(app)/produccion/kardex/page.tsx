import Link from 'next/link'
import { Beef, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCatalogoProduccion, ahoraLima } from '@/lib/produccion'
import { fmtDate, fmtQty, hoyLima } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FilterField, Badge } from '@/components/ui'
import { PagedTable } from '@/components/pager'
import { ExportButton } from '@/components/export-button'
import { AnularConMotivo } from '@/components/anular-con-motivo'
import { SalidaForm, ConteoForm } from './forms'
import { anularMovimiento } from '../actions'

export const metadata = { title: 'Kardex de carnes' }

type Saldo = { producto_id: string; nombre: string; porcion: string | null; unidad: string; saldo: number; ultimo_ingreso: string | null }
type Mov = { id: string; fecha: string; tipo: string; concepto_nombre: string | null; proveedor: string | null; guia: string | null; kilos: number | null
  hueso: number | null; grasa: number | null; merma: number | null; movimiento: number; saldo: number; venta_id: string | null; observacion: string | null }

export default async function KardexProduccionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const supabase = await createClient()
  const [{ data: saldos }, { conceptos }] = await Promise.all([
    supabase.from('v_prod_saldo').select('producto_id, nombre, porcion, unidad, saldo, ultimo_ingreso').order('orden'),
    getCatalogoProduccion(),
  ])
  const lista = (saldos ?? []) as Saldo[]
  const sel = lista.find((s) => s.producto_id === sp(params, 'carne')) ?? lista[0]
  const mes = sp(params, 'mes', hoyLima().slice(0, 7))
  const [y, m] = mes.split('-').map(Number)
  const hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)

  const [{ data: movs }, { data: conteos }] = sel ? await Promise.all([
    supabase.from('v_prod_kardex').select('id, fecha, tipo, concepto_nombre, proveedor, guia, kilos, hueso, grasa, merma, movimiento, saldo, venta_id, observacion')
      .eq('producto_id', sel.producto_id).gte('fecha', `${mes}-01T00:00:00-05:00`).lt('fecha', `${hasta}T00:00:00-05:00`).order('fecha', { ascending: false }),
    supabase.from('prod_conteo').select('id, fecha, contado, saldo, observacion').eq('producto_id', sel.producto_id).order('fecha', { ascending: false }).limit(10),
  ]) : [{ data: [] }, { data: [] }]
  const filas = (movs ?? []) as Mov[]
  const porcion = sel?.porcion ?? 'unidades'
  const entradas = filas.filter((f) => f.movimiento > 0).reduce((s, f) => s + Number(f.movimiento), 0)
  const salidas = filas.filter((f) => f.movimiento < 0).reduce((s, f) => s - Number(f.movimiento), 0)

  return (
    <>
      <PageHeader title="Kardex de carnes" />
      {/* saldo de cada carne: se elige una para ver su kardex */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {lista.map((s) => (
          <Link key={s.producto_id} href={`?carne=${s.producto_id}&mes=${mes}`}
            className={cn('rounded-xl border bg-white px-4 py-3 transition-colors hover:border-field', s.producto_id === sel?.producto_id ? 'border-brand-600 ring-2 ring-brand-600/15' : 'border-line')}>
            <span className="block text-xs font-semibold text-muted">{s.nombre}</span>
            <span className={cn('block text-2xl font-bold tabular', Number(s.saldo) < 0 ? 'text-brand-600' : Number(s.saldo) === 0 ? 'text-subtle' : 'text-ink-900')}>{fmtQty(s.saldo)}</span>
            <span className="block text-[11px] text-muted">{s.porcion}</span>
          </Link>
        ))}
      </div>

      {sel && <>
        <div className="mb-5 grid gap-5 lg:grid-cols-[3fr_2fr]">
          <Section title={`Salida de ${sel.nombre}`}><SalidaForm productoId={sel.producto_id} porcion={porcion} conceptos={conceptos.filter((c) => c.id !== 'venta')} ahora={ahoraLima()} /></Section>
          <Section title="Conteo físico" stats={[{ label: 'Saldo del kardex', value: `${fmtQty(sel.saldo)} ${porcion}` }]}><ConteoForm productoId={sel.producto_id} porcion={porcion} /></Section>
        </div>

        <FilterBar>
          <input type="hidden" name="carne" value={sel.producto_id} />
          <FilterField label="Mes"><input type="month" name="mes" defaultValue={mes} className="field" /></FilterField>
        </FilterBar>

        <Section icon={Beef} title={`Kardex de ${sel.nombre}`} bodyClassName="p-0" className="mb-5"
          stats={[{ label: 'Entradas del mes', value: fmtQty(entradas) }, { label: 'Salidas del mes', value: fmtQty(salidas) }, { label: 'Saldo', value: `${fmtQty(sel.saldo)} ${porcion}` }]}
          actions={<ExportButton filename={`Kardex ${sel.nombre} ${mes}`} table="v_prod_kardex" filters={{ producto_id: sel.producto_id }}
            dateColumn="fecha" desde={`${mes}-01`} hasta={new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)} order="fecha"
            columns={{ fecha: 'Fecha', concepto_nombre: 'Concepto', proveedor: 'Proveedor', guia: 'Guía', kilos: 'Peso (kg)', hueso: 'Hueso (kg)', grasa: 'Grasa (kg)', merma: 'Merma (kg)', movimiento: 'Cantidad', saldo: 'Saldo', observacion: 'Observación' }} />}>
          <PagedTable head={<tr><Th>Fecha</Th><Th>Concepto</Th><Th>Proveedor / guía</Th><Th right>Peso kg</Th><Th right>Entrada</Th><Th right>Salida</Th><Th right>Saldo</Th><Th>Observación</Th><Th /></tr>}
            empty="Sin movimientos en este mes.">
            {filas.map((f) => (
              <tr key={f.id}>
                <Td className="whitespace-nowrap tabular">{fmtDate(f.fecha, true)}</Td>
                <Td>{f.tipo === 'ingreso' ? <Badge tone="green">Ingresa</Badge> : <Badge tone={f.venta_id ? 'gray' : 'red'}>{f.concepto_nombre}</Badge>}</Td>
                <Td>{f.proveedor ?? '—'}{f.guia && <span className="block text-xs text-muted uppercase">Guía {f.guia}</span>}</Td>
                <Td right>{f.kilos ? fmtQty(f.kilos) : '—'}
                  {(f.hueso || f.grasa || f.merma) && <span className="block text-[11px] text-muted">{[f.hueso && `hueso ${fmtQty(f.hueso)}`, f.grasa && `grasa ${fmtQty(f.grasa)}`, f.merma && `merma ${fmtQty(f.merma)}`].filter(Boolean).join(' · ')}</span>}</Td>
                <Td right className="font-semibold text-leaf-600">{f.movimiento > 0 ? fmtQty(f.movimiento) : ''}</Td>
                <Td right className="font-semibold text-brand-600">{f.movimiento < 0 ? fmtQty(-f.movimiento) : ''}</Td>
                <Td right className="font-bold">{fmtQty(f.saldo)}</Td>
                <Td className="text-xs text-muted">{f.observacion}</Td>
                <Td>{!f.venta_id && (
                  <AnularConMotivo action={anularMovimiento} campos={{ id: f.id }} titulo={`Anular ${f.tipo === 'ingreso' ? 'ingreso' : 'salida'} de ${sel.nombre}`}
                    detalle="El registro no se borra: queda anulado y el saldo se recalcula.">
                    <Ban className="size-3.5" /> Anular
                  </AnularConMotivo>)}</Td>
              </tr>
            ))}
          </PagedTable>
        </Section>

        {(conteos ?? []).length > 0 && (
          <Section title="Últimos conteos" bodyClassName="p-0">
            <PagedTable head={<tr><Th>Fecha</Th><Th right>Contado</Th><Th right>Kardex</Th><Th right>Diferencia</Th><Th>Observación</Th></tr>}>
              {(conteos ?? []).map((c) => {
                const dif = Math.round((Number(c.contado) - Number(c.saldo)) * 1000) / 1000
                return (
                  <tr key={c.id}>
                    <Td className="tabular">{fmtDate(c.fecha, true)}</Td>
                    <Td right>{fmtQty(c.contado)}</Td><Td right>{fmtQty(c.saldo)}</Td>
                    <Td right>{dif === 0 ? <Badge tone="green">Cuadra</Badge> : <Badge tone="red">{dif > 0 ? '+' : ''}{fmtQty(dif)}</Badge>}</Td>
                    <Td className="text-xs text-muted">{c.observacion}</Td>
                  </tr>
                )
              })}
            </PagedTable>
          </Section>
        )}
      </>}
    </>
  )
}
