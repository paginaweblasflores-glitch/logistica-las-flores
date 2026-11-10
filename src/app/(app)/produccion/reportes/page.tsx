import Link from 'next/link'
import { BarChart3, Beef, Truck, CalendarCheck, Send, CircleCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPanel } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles, fmtPct, hoyLima, MESES, MESES_CORTO } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Section, Stat, Th, Td, Table, FilterBar, FilterField } from '@/components/ui'
import { Bars, Lines, BarList } from '@/components/charts'
import { PrintButton } from '@/components/print-button'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { PALETTE } from '@/lib/palette'
import { ExcelReporte, type Hoja } from './excel'
import { enviarReporte } from '../actions'

export const metadata = { title: 'Reportes de producción' }

const dia = (d: Date) => d.toISOString().slice(0, 10)
/** Periodos rápidos: esta semana (desde el lunes), este mes y el mes anterior. */
function periodos(hoy: string) {
  const h = new Date(`${hoy}T12:00:00Z`)
  const lunes = new Date(h); lunes.setUTCDate(h.getUTCDate() - ((h.getUTCDay() + 6) % 7))
  const ini = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1))
  const iniAnt = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1)), finAnt = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0))
  return [
    { id: 'semana', nombre: 'Esta semana', desde: dia(lunes), hasta: hoy },
    { id: 'mes', nombre: 'Este mes', desde: dia(ini), hasta: hoy },
    { id: 'anterior', nombre: 'Mes anterior', desde: dia(iniAnt), hasta: dia(finAnt) },
  ]
}

type Tot = { producto_id: string; producto: string; orden: number; porcion: string | null; concepto: string; cantidad: number; kilos: number | null }

export default async function ReportesProduccionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const hoy = hoyLima()
  const rapidos = periodos(hoy)
  const desde = sp(params, 'desde', rapidos[1].desde), hasta = sp(params, 'hasta', hoy)
  // 6 meses hasta el del periodo, para comparar
  const [hy, hm] = hasta.split('-').map(Number)
  const desde6 = dia(new Date(Date.UTC(hy, hm - 6, 1)))
  const supabase = await createClient()
  const [panel, { data: tot }, { data: saldos }, { data: conceptos }, { data: ingresos }, { data: meses }, { data: ventas }, { data: marcas }, { data: enviados }] = await Promise.all([
    getPanel(),
    supabase.rpc('fn_prod_totalizado', { p_desde: desde, p_hasta: hasta }),
    supabase.from('v_prod_saldo').select('producto_id, nombre, porcion, saldo').order('orden'),
    supabase.from('prod_concepto').select('codigo, nombre, orden').order('orden'),
    supabase.from('v_prod_ingreso').select('producto, producto_tipo, unidad, porcion, usa_sacos, proveedor, sacos, kilos, cantidad, total')
      .eq('anulado', false).gte('dia', desde).lte('dia', hasta).limit(5000),
    supabase.from('v_prod_mes').select('mes, producto, orden, cantidad').eq('concepto', 'venta').gte('mes', desde6).lte('mes', hasta),
    supabase.from('prod_venta').select('fecha, prod_venta_detalle(hoja1, hoja2)').gte('fecha', desde).lte('fecha', hasta).order('fecha'),
    supabase.from('prod_funcion_marca').select('estado, funcion:funcion_id(nombre, frecuencia, orden)').gte('fecha', desde).lte('fecha', hasta).limit(5000),
    supabase.from('prod_reporte').select('id, desde, hasta, enviado_at, observacion').order('enviado_at', { ascending: false }).limit(8),
  ])
  const filas = (tot ?? []) as Tot[]
  const nombreConcepto = Object.fromEntries((conceptos ?? []).map((c) => [c.codigo, c.nombre]))
  // columnas: los conceptos que hubo en el periodo, en el orden de su Excel
  const usados = (conceptos ?? []).map((c) => c.codigo).filter((c) => filas.some((f) => f.concepto === c))
  const carnes = (saldos ?? []).map((s) => ({ ...s, celdas: Object.fromEntries(filas.filter((f) => f.producto_id === s.producto_id).map((f) => [f.concepto, Number(f.cantidad)])),
    kilos: filas.filter((f) => f.producto_id === s.producto_id && f.concepto === 'ingreso').reduce((a, f) => a + Number(f.kilos ?? 0), 0) }))
  const ventaDe = (c: (typeof carnes)[number]) => c.celdas.venta ?? 0
  const sinVenta = filas.filter((f) => f.concepto !== 'ingreso' && f.concepto !== 'venta').reduce((a, f) => a + Number(f.cantidad), 0)

  // platos vendidos por día (de la hojita)
  const porDia = (ventas ?? []).map((v) => ({ dia: fmtDate(v.fecha).slice(0, 5), platos: v.prod_venta_detalle.reduce((a, d) => a + Number(d.hoja1) + Number(d.hoja2), 0) }))
  const platos = porDia.reduce((a, d) => a + d.platos, 0)

  // venta por mes (últimos 6): tabla carne × mes y gráfico del total
  const listaMeses = Array.from({ length: 6 }, (_, i) => dia(new Date(Date.UTC(hy, hm - 6 + i, 1))))
  const ventaMes = new Map<string, Record<string, number>>()
  for (const r of meses ?? []) {
    const fila = ventaMes.get(r.producto) ?? {}
    fila[r.mes] = (fila[r.mes] ?? 0) + Number(r.cantidad)
    ventaMes.set(r.producto, fila)
  }
  const etiquetaMes = (m: string) => `${MESES_CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

  // compras e ingresos por proveedor y por producto
  const ing = ingresos ?? []
  const porProveedor = new Map<string, number>()
  for (const r of ing) porProveedor.set(r.proveedor ?? 'Sin proveedor', (porProveedor.get(r.proveedor ?? 'Sin proveedor') ?? 0) + Number(r.total ?? 0))
  const proveedores = [...porProveedor.entries()].sort((a, b) => b[1] - a[1])
  const totalCompras = ing.reduce((a, r) => a + Number(r.total ?? 0), 0)
  const porProducto = new Map<string, { sacos: number; kilos: number; cantidad: number; porcion: string | null; total: number }>()
  for (const r of ing) {
    const x = porProducto.get(r.producto) ?? { sacos: 0, kilos: 0, cantidad: 0, porcion: r.porcion ?? (r.unidad === 'UND' ? 'und' : null), total: 0 }
    x.sacos += Number(r.sacos ?? 0); x.kilos += Number(r.kilos ?? 0); x.cantidad += Number(r.cantidad ?? 0); x.total += Number(r.total ?? 0)
    porProducto.set(r.producto, x)
  }
  const productosComprados = [...porProducto.entries()].sort((a, b) => b[1].total - a[1].total)
  const kilosCarne = ing.filter((r) => !r.usa_sacos).reduce((a, r) => a + Number(r.kilos ?? 0), 0)
  const sacosPapa = ing.filter((r) => r.usa_sacos).reduce((a, r) => a + Number(r.sacos ?? 0), 0)

  // diagrama: cuánto se cumplió
  type Marca = { estado: string; funcion: { nombre: string; frecuencia: string; orden: number } }
  const ms = (marcas ?? []) as unknown as Marca[]
  const okDiag = ms.filter((x) => x.estado === 'ok').length
  const porFuncion = new Map<string, { orden: number; frecuencia: string; ok: number; proceso: number; no: number }>()
  for (const x of ms) {
    const r = porFuncion.get(x.funcion.nombre) ?? { orden: x.funcion.orden, frecuencia: x.funcion.frecuencia, ok: 0, proceso: 0, no: 0 }
    r[x.estado as 'ok' | 'proceso' | 'no']++
    porFuncion.set(x.funcion.nombre, r)
  }
  const funciones = [...porFuncion.entries()].sort((a, b) => a[1].orden - b[1].orden)

  const titulo = desde === hasta ? fmtDate(desde) : `${fmtDate(desde)} al ${fmtDate(hasta)}`
  const hojas: Hoja[] = [
    { nombre: 'Totalizado', filas: [['Carne', 'Ingresa', ...usados.map((c) => nombreConcepto[c]), 'Kilos ingresados', 'Saldo actual', 'Se cuenta en'],
      ...carnes.map((c) => [c.nombre, c.celdas.ingreso ?? 0, ...usados.map((u) => -(c.celdas[u] ?? 0)), c.kilos, Number(c.saldo), c.porcion])] },
    { nombre: 'Venta por mes', filas: [['Carne', ...listaMeses.map(etiquetaMes)], ...carnes.map((c) => [c.nombre, ...listaMeses.map((m) => ventaMes.get(c.nombre)?.[m] ?? 0)])] },
    { nombre: 'Platos por día', filas: [['Día', 'Platos'], ...(ventas ?? []).map((v) => [v.fecha, v.prod_venta_detalle.reduce((a, d) => a + Number(d.hoja1) + Number(d.hoja2), 0)])] },
    { nombre: 'Proveedores', filas: [['Proveedor', 'Total S/'], ...proveedores.map(([p, t]) => [p, t])] },
    { nombre: 'Productos comprados', filas: [['Producto', 'Sacos', 'Kilos', 'Cantidad', 'Total S/'], ...productosComprados.map(([p, x]) => [p, x.sacos, x.kilos, x.cantidad, x.total])] },
    { nombre: 'Diagrama', filas: [['Función', 'Frecuencia', 'OK', 'En proceso', 'No se realizó'], ...funciones.map(([f, x]) => [f, x.frecuencia, x.ok, x.proceso, x.no])] },
  ]

  return (
    <>
      <PageHeader title="Reportes de producción" description={`Restaurante Las Flores · Área de Producción · ${titulo}`}
        actions={<><ExcelReporte archivo={`Reporte Producción ${desde} a ${hasta}`} hojas={hojas} /><PrintButton label="PDF" /></>} />

      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {rapidos.map((r) => (
            <Link key={r.id} href={`?desde=${r.desde}&hasta=${r.hasta}`}
              className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', r.desde === desde && r.hasta === hasta ? 'bg-ink-900 text-white' : 'text-muted hover:text-ink-900')}>{r.nombre}</Link>
          ))}
        </div>
        <FilterBar>
          <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
          <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
        </FilterBar>
      </div>

      {panel === 'produccion' && (
        <ActionForm action={enviarReporte} className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <input type="hidden" name="desde" value={desde} /><input type="hidden" name="hasta" value={hasta} />
          <span className="min-w-0 flex-1">Enviar este reporte (<b>{titulo}</b>) a Logística.</span>
          <SubmitButton size="sm"><Send className="size-3.5" /> Enviar a Logística</SubmitButton>
        </ActionForm>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Stat label="Platos vendidos" value={fmtQty(platos)} hint={`${porDia.length} ${porDia.length === 1 ? 'día registrado' : 'días registrados'}`} />
        <Stat label="Kilos ingresados" value={`${fmtQty(kilosCarne)} kg`} hint="Carnes y otros, sin la papa" />
        <Stat label="Papa ingresada" value={`${fmtQty(sacosPapa)} sacos`} hint="Productos que llegan en sacos" />
        <Stat label="Compras a proveedores" value={fmtSoles(totalCompras)} />
        <Stat label="Salidas fuera de venta" value={fmtQty(sinVenta)} hint="Pérdida, marketing, Santa Elena…" tone={sinVenta > 0 ? 'warn' : 'default'} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2 print:grid-cols-2">
        <Section icon={Beef} title="Venta por carne">
          {carnes.some((c) => ventaDe(c)) ? <Bars horizontal format="num" height={Math.max(220, carnes.length * 30)} x="carne"
            data={carnes.map((c) => ({ carne: c.nombre, venta: ventaDe(c) }))} series={[{ key: 'venta', name: 'Vendido', color: PALETTE.red }]} />
            : <p className="py-10 text-center text-sm text-muted">Sin ventas en el periodo.</p>}
        </Section>
        <Section icon={BarChart3} title="Platos vendidos por día">
          {porDia.length ? <Lines format="num" x="dia" data={porDia} series={[{ key: 'platos', name: 'Platos', color: PALETTE.red }]} />
            : <p className="py-10 text-center text-sm text-muted">Sin venta del día registrada.</p>}
        </Section>
      </div>

      <Section icon={Beef} title="Totalizado por carne y concepto" className="mb-5 break-inside-avoid" bodyClassName="p-0">
        <Table>
          <thead><tr><Th>Carne</Th><Th right>Ingresa</Th>{usados.map((c) => <Th key={c} right>{nombreConcepto[c]}</Th>)}<Th right>Kilos ingresados</Th><Th right>Saldo actual</Th></tr></thead>
          <tbody>{carnes.map((c) => (
            <tr key={c.producto_id}>
              <Td className="font-semibold">{c.nombre} <span className="text-xs font-normal text-muted">{c.porcion}</span></Td>
              <Td right>{c.celdas.ingreso ? <span className="rounded bg-leaf-50 px-1.5 py-0.5 font-semibold text-leaf-600">{fmtQty(c.celdas.ingreso)}</span> : '—'}</Td>
              {usados.map((u) => <Td key={u} right>{c.celdas[u] ? <span className={cn('rounded px-1.5 py-0.5 font-semibold', u === 'venta' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700')}>−{fmtQty(c.celdas[u])}</span> : '—'}</Td>)}
              <Td right>{c.kilos ? `${fmtQty(c.kilos)} kg` : '—'}</Td>
              <Td right className={cn('font-bold', Number(c.saldo) < 0 && 'text-brand-600')}>{fmtQty(c.saldo)}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>

      <Section icon={BarChart3} title="Venta por mes" className="mb-5 break-inside-avoid" bodyClassName="p-0">
        <div className="p-5">
          <Bars format="num" x="mes" data={listaMeses.map((m) => ({ mes: etiquetaMes(m), venta: [...ventaMes.values()].reduce((a, f) => a + (f[m] ?? 0), 0) }))}
            series={[{ key: 'venta', name: 'Vendido', color: PALETTE.red }]} height={220} />
        </div>
        <Table>
          <thead><tr><Th>Carne</Th>{listaMeses.map((m) => <Th key={m} right>{MESES[Number(m.slice(5, 7)) - 1]}</Th>)}</tr></thead>
          <tbody>{carnes.map((c) => (
            <tr key={c.producto_id}>
              <Td className="font-semibold">{c.nombre}</Td>
              {listaMeses.map((m) => <Td key={m} right>{ventaMes.get(c.nombre)?.[m] ? fmtQty(ventaMes.get(c.nombre)![m]) : '—'}</Td>)}
            </tr>
          ))}</tbody>
        </Table>
      </Section>

      <div className="mb-5 grid gap-5 lg:grid-cols-2 print:grid-cols-2">
        <Section icon={Truck} title="Compras por proveedor" stats={[{ label: 'Total', value: fmtSoles(totalCompras) }]} className="break-inside-avoid">
          {proveedores.length ? <BarList items={proveedores.map(([p, t]) => ({ key: p, label: p, value: t, share: totalCompras ? t / totalCompras : undefined }))} />
            : <p className="py-10 text-center text-sm text-muted">Sin ingresos de proveedores.</p>}
        </Section>
        <Section icon={Truck} title="Productos que ingresaron" bodyClassName="p-0" className="break-inside-avoid">
          <Table>
            <thead><tr><Th>Producto</Th><Th right>Sacos</Th><Th right>Kilos</Th><Th right>Cantidad</Th><Th right>Total</Th></tr></thead>
            <tbody>{productosComprados.map(([p, x]) => (
              <tr key={p}><Td className="font-medium">{p}</Td><Td right>{x.sacos ? fmtQty(x.sacos) : '—'}</Td><Td right>{x.kilos ? fmtQty(x.kilos) : '—'}</Td>
                <Td right>{x.cantidad ? `${fmtQty(x.cantidad)} ${x.porcion ?? ''}` : '—'}</Td><Td right className="font-semibold">{x.total ? fmtSoles(x.total) : '—'}</Td></tr>
            ))}
            {!productosComprados.length && <tr><Td colSpan={5} className="py-8 text-center text-muted">Sin ingresos.</Td></tr>}</tbody>
          </Table>
        </Section>
      </div>

      <Section icon={CalendarCheck} title="Diagrama de producción" className="mb-5 break-inside-avoid" bodyClassName="p-0"
        stats={[{ label: 'Cumplido', value: ms.length ? fmtPct(okDiag / ms.length) : '—' }]}>
        <Table>
          <thead><tr><Th>Función</Th><Th right>OK</Th><Th right>En proceso</Th><Th right>No se realizó</Th></tr></thead>
          <tbody>{funciones.map(([f, x]) => (
            <tr key={f}><Td>{f}</Td><Td right className="font-semibold text-leaf-600">{x.ok || '—'}</Td><Td right className="text-amber-700">{x.proceso || '—'}</Td><Td right className="text-brand-600">{x.no || '—'}</Td></tr>
          ))}
          {!funciones.length && <tr><Td colSpan={4} className="py-8 text-center text-muted">Sin marcas en el periodo.</Td></tr>}</tbody>
        </Table>
      </Section>

      <Section title={panel === 'produccion' ? 'Reportes enviados a Logística' : 'Reportes recibidos de Producción'} className="no-print" bodyClassName="p-0">
        <Table>
          <thead><tr><Th>Periodo</Th><Th>Enviado</Th><Th /></tr></thead>
          <tbody>{(enviados ?? []).map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{fmtDate(r.desde)} al {fmtDate(r.hasta)}</Td>
              <Td className="tabular"><span className="flex items-center gap-1.5"><CircleCheck className="size-4 text-leaf-600" />{fmtDate(r.enviado_at, true)}</span></Td>
              <Td><Link href={`?desde=${r.desde}&hasta=${r.hasta}`} className="text-xs font-semibold text-brand-600">Ver reporte</Link></Td>
            </tr>
          ))}
          {!(enviados ?? []).length && <tr><Td colSpan={3} className="py-8 text-center text-muted">Aún no hay reportes enviados.</Td></tr>}</tbody>
        </Table>
      </Section>
    </>
  )
}
