import Link from 'next/link'
import { Drumstick, AlertTriangle, Table2, ClipboardCheck, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtQty, hoyLima } from '@/lib/format'
import { cn, sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, Badge, EmptyState, LinkButton, Note, FilterBar, FilterField } from '@/components/ui'
import { VentaForm } from './venta-form'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Carnes y viandas' }

const TABS = [
  { key: 'venta', label: 'Venta del día' }, { key: 'conciliacion', label: 'Conciliación' },
  { key: 'totalizado', label: 'Totalizado por concepto' }, { key: 'saldo', label: 'Saldo por carne' },
]

export default async function CarnesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const { local, locales } = await getAmbito()
  // los controles son de Logística: registra la venta del día, el ingreso por compra y el conteo sabatino
  const supabase = await createClient()
  const loc = locales.find((l) => l.codigo === sp(params, 'local')) ?? local ?? locales[0]
  const tab = sp(params, 'tab', 'venta')
  const fecha = sp(params, 'fecha', hoyLima())
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  const cocinas = await getAlmacenes(loc.id, ['cocina'])
  const base = `?local=${loc.codigo}`

  return (
    <>
      <PageHeader title="Carnes y viandas"
        description="Kardex de carnes por negocio, registro diario de la venta de viandas y conciliación automática venta ↔ Kardex. Conteo físico semanal (sábados) en Conteos."
        actions={<>
          <LinkButton href="/conteos/nuevo" variant="dark"><ClipboardCheck className="size-4" /> Conteo sabatino</LinkButton>
        </>} />

      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {locales.map((l) => (
            <Link key={l.id} href={`?local=${l.codigo}&tab=${tab}`} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', l.id === loc.id ? 'bg-ink-900 text-white' : 'text-muted')}>{l.nombre}</Link>
          ))}
        </div>
        <div className="flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <Link key={t.key} href={`${base}&tab=${t.key}`} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', tab === t.key ? 'border-brand-600 text-ink-900' : 'border-transparent text-muted hover:text-ink-900')}>{t.label}</Link>
          ))}
        </div>
      </div>

      {tab === 'venta' && <VentaTab localId={loc.id} fecha={fecha} cocinas={cocinas} base={base} />}
      {tab === 'conciliacion' && <ConciliacionTab localId={loc.id} desde={desde} hasta={hasta} base={base} />}
      {tab === 'totalizado' && <TotalizadoTab cocinas={cocinas} desde={desde} hasta={hasta} base={base} />}
      {tab === 'saldo' && <SaldoTab cocinas={cocinas} />}
    </>
  )

  async function VentaTab({ localId, fecha, cocinas, base }: { localId: string; fecha: string; cocinas: { id: string; nombre: string }[]; base: string }) {
    const [{ data: items }, { data: venta }, { data: ultimas }] = await Promise.all([
      supabase.from('vianda_item').select('id, codigo, nombre, orden, vianda_conversion(factor, producto:producto_id(nombre))').eq('activo', true).order('orden'),
      supabase.from('venta_vianda').select('id, registrado_por, movimiento_id, venta_vianda_detalle(item_id, cantidad_salon, cantidad_llevar)').eq('local_id', localId).eq('fecha', fecha).maybeSingle(),
      supabase.from('venta_vianda').select('id, fecha, registrado_por, movimiento_id, venta_vianda_detalle(cantidad)').eq('local_id', localId).order('fecha', { ascending: false }).limit(10),
    ])
    type It = { id: string; codigo: string; nombre: string; vianda_conversion: { factor: number; producto: { nombre: string } }[] }
    const its = ((items ?? []) as unknown as It[]).map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, conversiones: i.vianda_conversion.map((c) => ({ producto: c.producto.nombre, factor: Number(c.factor) })) }))
    const inicial: Record<string, { salon: string; llevar: string }> = {}
    for (const d of (venta?.venta_vianda_detalle ?? []) as { item_id: string; cantidad_salon: number; cantidad_llevar: number }[]) {
      inicial[d.item_id] = { salon: d.cantidad_salon ? String(d.cantidad_salon) : '', llevar: d.cantidad_llevar ? String(d.cantidad_llevar) : '' }
    }
    return (
      <div className="space-y-5">
        <FilterBar><input type="hidden" name="local" value={base.split('=')[1]} /><input type="hidden" name="tab" value="venta" />
          <FilterField label="Día"><input type="date" name="fecha" defaultValue={fecha} className="field" /></FilterField></FilterBar>
        <Section icon={Drumstick} title={`Venta de viandas — ${fmtDate(fecha)}`} stats={venta ? [{ label: 'Estado', value: venta.movimiento_id ? 'En Kardex' : 'Sin salida en Kardex' }] : []}>
          <VentaForm key={fecha} localId={localId} almacenes={cocinas} fecha={fecha} items={its} inicial={inicial} registrador={venta?.registrado_por ?? ''} />
        </Section>
        <Section title="Últimos días registrados" bodyClassName="p-0">
          <PagedTable head={<tr><Th>Fecha</Th><Th>Registrado por</Th><Th right>Platos</Th><Th>Kardex</Th></tr>}>{((ultimas ?? []) as { id: string; fecha: string; registrado_por: string | null; movimiento_id: string | null; venta_vianda_detalle: { cantidad: number }[] }[]).map((u) => (
              <tr key={u.id}><Td><Link href={`${base}&tab=venta&fecha=${u.fecha}`} className="font-semibold text-brand-600">{fmtDate(u.fecha)}</Link></Td><Td>{u.registrado_por ?? '—'}</Td>
                <Td right>{fmtQty(u.venta_vianda_detalle.reduce((s, d) => s + Number(d.cantidad), 0))}</Td>
                <Td>{u.movimiento_id ? <Badge tone="green">Registrado</Badge> : <Badge tone="red">Pendiente</Badge>}</Td></tr>
            ))}</PagedTable>
        </Section>
      </div>
    )
  }

  async function ConciliacionTab({ localId, desde, hasta, base }: { localId: string; desde: string; hasta: string; base: string }) {
    const { data } = await supabase.rpc('fn_conciliacion_viandas', { p_local: localId, p_desde: desde, p_hasta: hasta }).order('fecha', { ascending: false }).order('producto')
    type R = { fecha: string; producto_id: string; producto: string; consumo_teorico: number; salida_kardex: number; diferencia: number; alerta: boolean }
    const rows = (data ?? []) as R[]
    const alertas = rows.filter((r) => r.alerta).length
    return (
      <div className="space-y-4">
        <FilterBar><input type="hidden" name="local" value={base.split('=')[1]} /><input type="hidden" name="tab" value="conciliacion" />
          <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
          <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField></FilterBar>
        <Note>Consumo teórico = ventas × reglas de conversión (Cuy = entero + medio/2 + mixto/2; Chicharrón = chicharrón + mixto×⅔ + puca/3; demás 1 a 1). Se compara con las salidas por <b>VENTA</b> del Kardex del mismo día. La tolerancia se configura en Configuración.</Note>
        <Section icon={AlertTriangle} title="Venta vs. Kardex" bodyClassName="p-0" stats={[{ label: 'Alertas', value: alertas }, { label: 'Registros', value: rows.length }]}>
          {rows.length ? (
            <PagedTable head={<tr><Th>Fecha</Th><Th>Carne</Th><Th right>Consumo por venta</Th><Th right>Salida en Kardex</Th><Th right>Diferencia</Th><Th>Estado</Th></tr>}>{rows.map((r) => (
                <tr key={r.fecha + r.producto_id} className={r.alerta ? 'bg-brand-50/40' : ''}>
                  <Td className="tabular">{fmtDate(r.fecha)}</Td><Td className="font-medium">{r.producto}</Td>
                  <Td right>{fmtQty(r.consumo_teorico)}</Td><Td right>{fmtQty(r.salida_kardex)}</Td>
                  <Td right className={Number(r.diferencia) !== 0 ? 'font-bold text-brand-700' : ''}>{fmtQty(r.diferencia)}</Td>
                  <Td>{r.alerta ? <Badge tone="red">Revisar</Badge> : <Badge tone="green">OK</Badge>}</Td>
                </tr>
              ))}</PagedTable>
          ) : <EmptyState title="Sin datos en el rango" />}
        </Section>
      </div>
    )
  }

  async function TotalizadoTab({ cocinas, desde, hasta, base }: { cocinas: { id: string }[]; desde: string; hasta: string; base: string }) {
    const { data } = await supabase.from('v_kardex').select('producto_nombre, motivo_nombre, tipo_nombre, entrada, salida').in('almacen_id', cocinas.map((c) => c.id)).gte('fecha', desde).lte('fecha', `${hasta}T23:59:59`).limit(20000)
    type K = { producto_nombre: string; motivo_nombre: string | null; tipo_nombre: string; entrada: number | null; salida: number | null }
    const piv = new Map<string, Map<string, number>>()
    const conceptos = new Set<string>()
    for (const r of (data ?? []) as K[]) {
      const concepto = r.entrada ? 'INGRESA' : (r.motivo_nombre ?? r.tipo_nombre).toUpperCase()
      conceptos.add(concepto)
      const m = piv.get(r.producto_nombre) ?? new Map<string, number>()
      m.set(concepto, (m.get(concepto) ?? 0) + Number(r.entrada ?? 0) - Number(r.salida ?? 0))
      piv.set(r.producto_nombre, m)
    }
    const cols = ['INGRESA', ...[...conceptos].filter((c) => c !== 'INGRESA').sort()]
    return (
      <div className="space-y-4">
        <FilterBar><input type="hidden" name="local" value={base.split('=')[1]} /><input type="hidden" name="tab" value="totalizado" />
          <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
          <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField></FilterBar>
        <Section icon={Table2} title="Totalizado del periodo (ingresos y salidas por concepto)" bodyClassName="p-0">
          {piv.size ? (
            <PagedTable head={<tr><Th>Carne</Th>{cols.map((c) => <Th key={c} right>{c}</Th>)}<Th right>Neto</Th></tr>}>{[...piv.entries()].sort().map(([p, m]) => (
                <tr key={p}><Td className="font-medium">{p}</Td>{cols.map((c) => <Td key={c} right className={(m.get(c) ?? 0) < 0 ? 'text-brand-700' : (m.get(c) ?? 0) > 0 ? 'text-leaf-600' : 'text-subtle'}>{m.get(c) ? fmtQty(m.get(c)) : '—'}</Td>)}
                  <Td right className="font-bold">{fmtQty([...m.values()].reduce((s, v) => s + v, 0))}</Td></tr>
              ))}</PagedTable>
          ) : <EmptyState title="Sin movimientos de carnes en el periodo" />}
        </Section>
      </div>
    )
  }

  async function SaldoTab({ cocinas }: { cocinas: { id: string; nombre: string }[] }) {
    const { data } = await supabase.from('v_stock').select('producto_id, nombre, almacen_nombre, almacen_id, cantidad, unidad, costo_promedio, valor').in('almacen_id', cocinas.map((c) => c.id)).eq('producto_tipo', 'carne').order('nombre')
    type S = { producto_id: string; nombre: string; almacen_nombre: string; almacen_id: string; cantidad: number; unidad: string; costo_promedio: number; valor: number }
    return (
      <Section icon={Drumstick} title="Saldo actual del Kardex de carnes" bodyClassName="p-0"
               actions={<LinkButton href="/compras/nueva" size="sm" variant="outline"><Plus className="size-3.5" /> Ingreso (compra)</LinkButton>}>
        {data?.length ? (
          <PagedTable head={<tr><Th>Carne</Th><Th>Cocina</Th><Th right>Saldo</Th><Th right>Costo prom.</Th><Th /></tr>}>{(data as S[]).map((s) => (
              <tr key={s.producto_id + s.almacen_id}><Td className="font-medium">{s.nombre}</Td><Td className="text-xs">{s.almacen_nombre}</Td>
                <Td right className="font-bold">{fmtQty(s.cantidad)} <span className="text-xs font-normal text-muted">{s.unidad}</span></Td>
                <Td right>S/ {Number(s.costo_promedio).toFixed(2)}</Td>
                <Td><Link href={`/inventario/kardex?producto=${s.producto_id}&almacen=${s.almacen_id}`} className="text-xs font-semibold text-brand-600">Ver Kardex</Link></Td></tr>
            ))}</PagedTable>
        ) : <EmptyState title="Sin carnes registradas en esta cocina" />}
      </Section>
    )
  }
}
