import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ClipboardCheck, PackagePlus, Scale, FileText, BadgeMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPanel } from '@/lib/session'
import { fmtDate, fmtPct, fmtQty, fmtSoles } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Badge, Note, Stat, LocalBadge, btnClass } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ProductPicker } from '@/components/product-picker'
import { PrintButton } from '@/components/print-button'
import { HojaConteo, type Detalle } from './hoja'
import { agregarProductoConteo, anularConteo, cerrarConteo, pasarAVerificacion, reabrirConteo } from '../actions'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Conteo físico' }

const ETAPAS = [
  { key: 'inicial', label: 'Reporte inicial' }, { key: 'conteo', label: 'Conteo' }, { key: 'verificacion', label: 'Verificación' },
  { key: 'resultado', label: 'Resultado' }, { key: 'descuento', label: 'Descuento' }, { key: 'final', label: 'Reporte final' },
] as const

type Resumen = { id: string; numero: string; fecha: string; hora: string | null; tipo: string; estado: string; local_id: string; local_nombre: string; local_codigo: string
  almacen_nombre: string; responsable_conteo: string | null; responsable_almacen: string | null; items: number; items_contados: number
  items_con_diferencia: number; valor_sistema: number; sobrante_valor: number; faltante_valor: number; sobrante_unidades: number; faltante_unidades: number
  diferencia_bruta_valor: number; diferencia_neta_valor: number; pct_diferencia: number | null; faltante_descontable: number; meta: number }

export default async function ConteoDetallePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ etapa?: string }>
}) {
  const { id } = await params
  const [{ etapa: etapaParam }, supabase] = await Promise.all([searchParams, createClient()])
  const [{ data: resumen }, { data: conteo }, { data: det }, { data: descuentos }] = await Promise.all([
    supabase.from('v_conteo_resumen').select('*').eq('id', id).maybeSingle(),
    supabase.from('conteo').select('id, fuente_stock, observacion, ajuste_movimiento_id, cerrado_at, almacen_id').eq('id', id).maybeSingle(),
    supabase.from('conteo_detalle')
      .select('id, stock_sistema, costo_unitario, conteo_1, conteo_2, conteo_3, cantidad_fisica, diferencia, valor_diferencia, aplica_descuento, precio_descuento, observacion, producto:producto_id(nombre, codigo, imagen_url, unidad:unidad_id(codigo), categoria:categoria_id(nombre))')
      .eq('conteo_id', id).limit(5000),
    supabase.from('descuento').select('id, numero, monto, estado').eq('conteo_id', id),
  ])
  if (!resumen || !conteo) notFound()
  const r = resumen as Resumen

  type Raw = { id: string; stock_sistema: number; costo_unitario: number; conteo_1: number | null; conteo_2: number | null; conteo_3: number | null
    cantidad_fisica: number | null; diferencia: number | null; valor_diferencia: number | null; aplica_descuento: boolean; precio_descuento: number | null
    observacion: string | null; producto: { nombre: string; codigo: string; imagen_url: string | null; unidad: { codigo: string }; categoria: { nombre: string } | null } }
  const rows = ((det ?? []) as unknown as Raw[])
    .map((d) => ({ ...d, producto: d.producto.nombre, codigo: d.producto.codigo, imagen_url: d.producto.imagen_url, unidad: d.producto.unidad.codigo, categoria: d.producto.categoria?.nombre ?? null }))
    .sort((a, b) => a.producto.localeCompare(b.producto))

  const cerrado = r.estado === 'cerrado' || r.estado === 'anulado'
  // Los conteos los hace Logística; el almacén solo ve el resultado
  const bloqueado = cerrado || (await getPanel()) === 'almacen'
  const defecto = r.estado === 'abierto' ? 'conteo' : r.estado === 'verificacion' ? 'verificacion' : 'final'
  const etapa = (ETAPAS.some((e) => e.key === etapaParam) ? etapaParam : defecto) as (typeof ETAPAS)[number]['key']
  const idx = ETAPAS.findIndex((e) => e.key === etapa)
  const avance = r.estado === 'abierto' ? 1 : r.estado === 'verificacion' ? 4 : 5

  const sobrantes = rows.filter((d) => (d.diferencia ?? 0) > 0)
  const faltantes = rows.filter((d) => (d.diferencia ?? 0) < 0)
  const aDescontar = faltantes.filter((d) => d.aplica_descuento)
  const totalDescuento = aDescontar.reduce((s, d) => s + -Number(d.diferencia) * Number(d.precio_descuento ?? d.costo_unitario), 0)
  const cumple = r.pct_diferencia !== null && r.pct_diferencia <= r.meta

  return (
    <>
      <PageHeader
        title={`Conteo ${r.numero}`}
        back={{ href: '/conteos', label: 'Conteos' }}
        description={<><LocalBadge codigo={r.local_codigo} /> · {r.almacen_nombre} · {fmtDate(r.fecha)} {r.hora?.slice(0, 5)} · Stock de referencia: {conteo.fuente_stock}</>}
        actions={<>
          <EstadoBadge estado={r.estado} />
          {!bloqueado && (
            <ActionForm action={anularConteo}>
              <input type="hidden" name="conteo_id" value={id} />
              <SubmitButton variant="danger" size="sm" confirm="¿Anular este conteo? No afectará el stock.">Anular</SubmitButton>
            </ActionForm>
          )}
        </>}
      />

      {/* Barra de etapas (las 6 hojas del Excel) */}
      <nav aria-label="Etapas" className="no-print mb-5 grid grid-cols-3 gap-2 md:grid-cols-6">
        {ETAPAS.map((e, i) => {
          const done = i <= avance
          return (
            <Link key={e.key} href={`?etapa=${e.key}`}
                  className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors',
                    i === idx ? 'border-ink-900 bg-ink-900 text-white' : done ? 'border-line bg-white text-ink-900 hover:border-brand-200' : 'border-dashed border-line bg-transparent text-muted')}>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px]',
                i === idx ? 'bg-brand-600 text-white' : done ? 'bg-leaf-500 text-white' : 'bg-canvas text-muted')}>
                {done && i !== idx ? <Check className="size-3" /> : i + 1}
              </span>
              {e.label}
            </Link>
          )
        })}
      </nav>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Productos" value={`${r.items_contados}/${r.items}`} hint={`${r.items_con_diferencia} con diferencia`} />
        <Stat label="Valor del sistema" value={fmtSoles(r.valor_sistema)} />
        <Stat label="Sobrantes" value={fmtSoles(r.sobrante_valor)} tone="good" hint={`${fmtQty(r.sobrante_unidades)} unid.`} />
        <Stat label="Faltantes" value={fmtSoles(r.faltante_valor)} tone="bad" hint={`${fmtQty(r.faltante_unidades)} unid.`} />
        <Stat label="% diferencia" value={fmtPct(r.pct_diferencia)} meta={{ valor: r.pct_diferencia, meta: r.meta, menorEsMejor: true }} hint={`Meta ≤ ${fmtPct(r.meta)}`} />
      </div>

      {etapa === 'inicial' && (
        <Section icon={FileText} title="Reporte inicial — stock del sistema al iniciar" bodyClassName="p-0"
                 stats={[{ label: 'Productos', value: rows.length }, { label: 'Valor', value: fmtSoles(r.valor_sistema) }]}>
          <PagedTable head={<tr><Th>Código</Th><Th>Producto</Th><Th>Categoría</Th><Th right>Stock</Th><Th right>Costo</Th><Th right>Valor</Th></tr>}>
              {rows.map((d) => (
                <tr key={d.id}><Td className="text-xs text-muted">{d.codigo}</Td><Td>{d.producto}</Td><Td className="text-xs">{d.categoria ?? '—'}</Td>
                  <Td right>{fmtQty(d.stock_sistema)} <span className="text-xs text-muted">{d.unidad}</span></Td><Td right>{fmtSoles(d.costo_unitario)}</Td>
                  <Td right>{fmtSoles(Number(d.stock_sistema) * Number(d.costo_unitario))}</Td></tr>
              ))}
            </PagedTable>
        </Section>
      )}

      {etapa === 'conteo' && (
        <Section icon={ClipboardCheck} title="Hoja de conteo" actions={!bloqueado && r.estado === 'abierto' && (
          <ActionForm action={pasarAVerificacion}>
            <input type="hidden" name="conteo_id" value={id} />
            <SubmitButton variant="dark" size="sm">Terminar conteo → verificación</SubmitButton>
          </ActionForm>
        )}>
          {!bloqueado && (
            <ActionForm action={agregarProductoConteo} className="no-print mb-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="conteo_id" value={id} />
              <label className="min-w-72 flex-1"><span className="label">¿Encontró un producto que no está en la lista?</span><ProductPicker name="producto" /></label>
              <SubmitButton variant="outline"><PackagePlus className="size-4" /> Agregar al conteo</SubmitButton>
            </ActionForm>
          )}
          <HojaConteo conteoId={id} rows={rows as Detalle[]} modo="conteo" editable={!bloqueado && r.estado === 'abierto'} />
        </Section>
      )}

      {etapa === 'verificacion' && (
        <Section icon={Scale} title="Verificación — sistema vs. físico" actions={!bloqueado && (
          <div className="flex gap-2">
            {!bloqueado && r.estado === 'verificacion' && (
              <ActionForm action={reabrirConteo}><input type="hidden" name="conteo_id" value={id} /><SubmitButton variant="outline" size="sm">Volver a contar</SubmitButton></ActionForm>
            )}
            <Link href="?etapa=resultado" className={btnClass('dark', 'sm')}>Ver resultado →</Link>
          </div>
        )}>
          <div className="mb-4"><Note>Revise cada diferencia. Desmarque <b>Descontar</b> en los faltantes que no corresponde cobrar (equivale a la marca “no” del Excel) y, si el precio de descuento es distinto al costo, escríbalo.</Note></div>
          <HojaConteo conteoId={id} rows={rows as Detalle[]} modo="verificacion" editable={!bloqueado} />
        </Section>
      )}

      {etapa === 'resultado' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <DifTable title="Sobrantes (positivo)" rows={sobrantes} tone="good" />
          <DifTable title="Faltantes (negativo)" rows={faltantes} tone="bad" />
          <div className="xl:col-span-2">
            <Note>
              Resultado neto: <b>{fmtSoles(r.diferencia_neta_valor)}</b> · Diferencia bruta (sobrantes + faltantes): <b>{fmtSoles(r.diferencia_bruta_valor)}</b> ·
              {' '}% sobre el valor del sistema: <b className={cumple ? 'text-leaf-600' : 'text-brand-700'}>{fmtPct(r.pct_diferencia)}</b> ({cumple ? 'cumple' : 'no cumple'} la meta de {fmtPct(r.meta)}).
            </Note>
          </div>
        </div>
      )}

      {etapa === 'descuento' && (
        <Section icon={BadgeMinus} title="Descuento al responsable" bodyClassName="p-0"
                 stats={[{ label: 'Responsable', value: r.responsable_almacen ?? '—' }, { label: 'Total', value: fmtSoles(totalDescuento) }]}>
          {aDescontar.length ? (
            <Table>
              <thead><tr><Th>Producto</Th><Th right>Cantidad faltante</Th><Th right>Precio</Th><Th right>Importe</Th><Th>Observación</Th></tr></thead>
              <tbody>
                {aDescontar.map((d) => (
                  <tr key={d.id}><Td>{d.producto}</Td><Td right>{fmtQty(-Number(d.diferencia))} {d.unidad}</Td>
                    <Td right>{fmtSoles(d.precio_descuento ?? d.costo_unitario)}</Td>
                    <Td right className="font-semibold">{fmtSoles(-Number(d.diferencia) * Number(d.precio_descuento ?? d.costo_unitario))}</Td>
                    <Td className="text-xs text-muted">{d.observacion}</Td></tr>
                ))}
                <tr><Td colSpan={3} className="text-right font-semibold">Total a descontar</Td><Td right className="text-base font-bold text-brand-700">{fmtSoles(totalDescuento)}</Td><Td /></tr>
              </tbody>
            </Table>
          ) : <div className="p-6 text-sm text-muted">No hay faltantes marcados para descuento.</div>}
          {!!descuentos?.length && (
            <div className="border-t border-line p-4 text-sm">
              Descuento generado: {descuentos.map((x) => <Link key={x.id} href={`/descuentos/${x.id}`} className="ml-1 font-semibold text-brand-600">{x.numero} ({fmtSoles(x.monto)})</Link>)}
            </div>
          )}
        </Section>
      )}

      {etapa === 'final' && (
        <div className="space-y-5">
          {!bloqueado ? (
            <Section title="Cerrar conteo">
              <ActionForm action={cerrarConteo} className="space-y-3">
                <input type="hidden" name="conteo_id" value={id} />
                <label className={cn('flex items-center gap-2 text-sm', conteo.fuente_stock !== 'sistema' && 'opacity-50')}>
                  <input type="checkbox" name="generar_ajuste" defaultChecked={conteo.fuente_stock === 'sistema'} disabled={conteo.fuente_stock !== 'sistema'} className="size-4 accent-brand-600" />
                  Ajustar el stock del sistema a lo contado (genera movimientos de ajuste positivo/negativo)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="generar_descuento" defaultChecked={!!r.responsable_almacen} disabled={!r.responsable_almacen} className="size-4 accent-brand-600" />
                  Generar descuento de {fmtSoles(totalDescuento)} a {r.responsable_almacen ?? '(sin responsable)'}
                </label>
                <SubmitButton confirm="Al cerrar, el conteo ya no podrá modificarse. ¿Continuar?">Cerrar conteo y generar reporte final</SubmitButton>
              </ActionForm>
            </Section>
          ) : (
            <div className="no-print flex flex-wrap items-center gap-3">
              <PrintButton label="Imprimir reporte" />
              {conteo.ajuste_movimiento_id && <Link href={`/inventario/kardex?desde=${r.fecha}&hasta=${r.fecha}`} className={btnClass('outline')}>Ver ajustes en Kardex</Link>}
              {descuentos?.map((x) => <Link key={x.id} href={`/descuentos/${x.id}`} className={btnClass('outline')}>Informe de descuento {x.numero}</Link>)}
            </div>
          )}

          <section className="card print-area p-6">
            <header className="mb-4 flex items-start justify-between border-b border-line pb-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Reporte final de conteo físico</p>
                <h2 className="text-xl font-bold">{r.local_nombre} — {r.almacen_nombre}</h2>
                <p className="text-sm text-muted">N° {r.numero} · {fmtDate(r.fecha)} {r.hora?.slice(0, 5)} · Cerrado {fmtDate(conteo.cerrado_at, true)}</p>
              </div>
              <Badge tone={cumple ? 'green' : 'red'}>{fmtPct(r.pct_diferencia)} · meta {fmtPct(r.meta)}</Badge>
            </header>
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div><dt className="text-muted">Responsable del conteo</dt><dd className="font-semibold">{r.responsable_conteo ?? '—'}</dd></div>
              <div><dt className="text-muted">Responsable del almacén</dt><dd className="font-semibold">{r.responsable_almacen ?? '—'}</dd></div>
              <div><dt className="text-muted">Valor del sistema</dt><dd className="font-semibold tabular">{fmtSoles(r.valor_sistema)}</dd></div>
              <div><dt className="text-muted">Resultado neto</dt><dd className="font-semibold tabular">{fmtSoles(r.diferencia_neta_valor)}</dd></div>
            </dl>
            <Table>
              <thead><tr><Th>Producto</Th><Th right>Sistema</Th><Th right>Físico</Th><Th right>Diferencia</Th><Th right>Valor</Th><Th>Observación</Th></tr></thead>
              <tbody>
                {[...sobrantes, ...faltantes].map((d) => (
                  <tr key={d.id}><Td>{d.producto}</Td><Td right>{fmtQty(d.stock_sistema)}</Td><Td right>{fmtQty(d.cantidad_fisica)}</Td>
                    <Td right className={Number(d.diferencia) > 0 ? 'text-leaf-600' : 'text-brand-700'}>{fmtQty(d.diferencia)}</Td>
                    <Td right>{fmtSoles(d.valor_diferencia)}</Td><Td className="text-xs">{d.observacion}{!d.aplica_descuento && Number(d.diferencia) < 0 ? ' (no descontable)' : ''}</Td></tr>
                ))}
                {!sobrantes.length && !faltantes.length && <tr><Td colSpan={6} className="py-6 text-center text-muted">Sin diferencias: el inventario cuadra.</Td></tr>}
              </tbody>
            </Table>
            <p className="mt-3 text-xs text-muted">Los demás {rows.length - sobrantes.length - faltantes.length} productos contados coinciden con el sistema.</p>
            <div className="mt-14 grid grid-cols-3 gap-8 text-center text-xs">
              {[r.responsable_almacen ?? 'Responsable de almacén', r.responsable_conteo ?? 'Logística', 'Administración'].map((n) => (
                <div key={n} className="border-t border-ink-900 pt-2 font-semibold">{n}</div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function DifTable({ title, rows, tone }: { title: string; tone: 'good' | 'bad'
  rows: { id: string; producto: string; unidad: string; stock_sistema: number; cantidad_fisica: number | null; diferencia: number | null; valor_diferencia: number | null }[] }) {
  const total = rows.reduce((s, d) => s + Number(d.valor_diferencia ?? 0), 0)
  return (
    <Section title={title} bodyClassName="p-0" stats={[{ label: 'Ítems', value: rows.length }, { label: 'Valor', value: fmtSoles(total) }]}>
      <PagedTable head={<tr><Th>Producto</Th><Th right>Sistema</Th><Th right>Físico</Th><Th right>Dif.</Th><Th right>Valor</Th></tr>}>
          {rows.map((d) => (
            <tr key={d.id}><Td>{d.producto}</Td><Td right>{fmtQty(d.stock_sistema)}</Td><Td right>{fmtQty(d.cantidad_fisica)}</Td>
              <Td right className={tone === 'good' ? 'text-leaf-600' : 'text-brand-700'}>{fmtQty(d.diferencia)} <span className="text-xs text-muted">{d.unidad}</span></Td>
              <Td right className="font-semibold">{fmtSoles(d.valor_diferencia)}</Td></tr>
          ))}
          {!rows.length && <tr><Td colSpan={5} className="py-6 text-center text-muted">Ninguno</Td></tr>}
        </PagedTable>
    </Section>
  )
}
