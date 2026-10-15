import { BarChart3, Scale, ShoppingCart, ClipboardCheck, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel } from '@/lib/session'
import { ReportesAlmacen } from './reportes-almacen'
import { resolverPeriodo } from '@/lib/periodo'
import { fmtDate, fmtPct, fmtSoles, MESES, MESES_CORTO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, Badge, Note } from '@/components/ui'
import { PeriodoSelector } from '@/components/periodo-selector'
import { Bars } from '@/components/charts'
import { ReportExport, type Hoja } from '@/components/report-export'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Reportes e indicadores' }

type Comp = { local_id: string; local_codigo: string; local_nombre: string; valor_stock: number; compras: number; transporte: number; ahorro: number
  consumo_valor: number; diferencia_inventario: number; pct_diferencia: number | null; descuentos: number; roturas: number; otif: number | null; requerimientos: number }
type KC = { mes: number; ciudad: string | null; pedidos: number; evaluados: number; ot: number | null; in_full: number | null; otif: number | null; total: number; ahorro: number; ahorro_pct: number | null; transporte: number }
type KI = { mes: number; local_codigo: string; responsable: string; conteos: number; valor_sistema: number; sobrante: number; faltante: number; diferencia_bruta: number; pct_diferencia: number | null; meta: number; cumple: boolean }

export default async function ReportesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  // Cada panel tiene sus propios reportes
  if ((await getPanel()) === 'almacen') {
    const amb = await getAmbito()
    if (amb.local) return <ReportesAlmacen local={amb.local} params={params} />
  }
  const periodo = resolverPeriodo({ periodo: params.periodo ?? 'anio', desde: params.desde, hasta: params.hasta })
  const { local } = await getAmbito()
  const supabase = await createClient()
  const anio = Number(periodo.hasta.slice(0, 4))
  const [{ data: comp }, { data: kc }, { data: ki }, { data: prov }, { data: metas }] = await Promise.all([
    supabase.rpc('fn_comparativo_locales', { p_desde: periodo.desde, p_hasta: periodo.hasta }),
    supabase.rpc('fn_kpi_compras_mensual', { p_local: local?.id ?? null, p_anio: anio }),
    supabase.rpc('fn_kpi_inventario_mensual', { p_local: local?.id ?? null, p_anio: anio }),
    supabase.rpc('fn_proveedores_mensual', { p_anio: anio }),
    supabase.from('parametro').select('clave, valor'),
  ])
  const meta = Object.fromEntries((metas ?? []).map((m) => [m.clave, Number(m.valor)]))
  const cs = (comp ?? []) as Comp[]
  const kcs = (kc ?? []) as KC[]
  const kis = (ki ?? []) as KI[]
  const ciudades = [...new Set(kcs.filter((k) => k.ciudad).map((k) => k.ciudad!))]
  const meses = [...new Set(kcs.map((k) => k.mes))].sort((a, b) => a - b)

  // Comparativo: filas = indicador, columnas = negocios + global
  const sum = (k: keyof Comp) => cs.reduce((s, c) => s + Number(c[k] ?? 0), 0)
  const filas: { label: string; key: keyof Comp; fmt: (v: number | null) => string; global: number | null; mejor?: 'alto' | 'bajo' }[] = [
    { label: 'Valor del stock actual', key: 'valor_stock', fmt: fmtSoles, global: sum('valor_stock') },
    { label: 'Compras del periodo', key: 'compras', fmt: fmtSoles, global: sum('compras') },
    { label: 'Transporte', key: 'transporte', fmt: fmtSoles, global: sum('transporte'), mejor: 'bajo' },
    { label: 'Ahorro / (sobrecosto) en compras', key: 'ahorro', fmt: fmtSoles, global: sum('ahorro'), mejor: 'alto' },
    { label: 'Consumo valorizado (salidas)', key: 'consumo_valor', fmt: fmtSoles, global: sum('consumo_valor') },
    { label: 'Diferencia de inventario (S/)', key: 'diferencia_inventario', fmt: fmtSoles, global: sum('diferencia_inventario'), mejor: 'bajo' },
    { label: 'Diferencia de inventario (%)', key: 'pct_diferencia', fmt: fmtPct, global: null, mejor: 'bajo' },
    { label: 'OTIF', key: 'otif', fmt: fmtPct, global: null, mejor: 'alto' },
    { label: 'Descuentos al personal', key: 'descuentos', fmt: fmtSoles, global: sum('descuentos') },
    { label: 'Roturas de utensilios', key: 'roturas', fmt: fmtSoles, global: sum('roturas'), mejor: 'bajo' },
    { label: 'Requerimientos atendidos', key: 'requerimientos', fmt: (v) => String(v ?? 0), global: sum('requerimientos') },
  ]

  const serieCompras = meses.map((m) => ({ mes: MESES_CORTO[m - 1], ...Object.fromEntries(ciudades.map((c) => [c, Number(kcs.find((k) => k.mes === m && k.ciudad === c)?.total ?? 0)])) }))
  const hojas: Hoja[] = [
    { nombre: 'Comparativo', filas: filas.map((f) => ({ Indicador: f.label, ...Object.fromEntries(cs.map((c) => [c.local_nombre, c[f.key] === null ? null : Number(c[f.key])])), Global: f.global })) },
    { nombre: 'Compras OTIF', filas: kcs.map((k) => ({ Mes: MESES[k.mes - 1], Origen: k.ciudad ?? 'CONSOLIDADO', Pedidos: k.pedidos, 'OT %': k.ot, 'IF %': k.in_full, 'OTIF %': k.otif, 'Compras S/': k.total, 'Ahorro S/': k.ahorro, 'Ahorro %': k.ahorro_pct, 'Transporte S/': k.transporte })) },
    { nombre: 'Exactitud inventario', filas: kis.map((k) => ({ Mes: MESES[k.mes - 1], Negocio: k.local_codigo, Responsable: k.responsable, Conteos: k.conteos, 'Valor sistema': k.valor_sistema, Sobrante: k.sobrante, Faltante: k.faltante, 'Diferencia S/': k.diferencia_bruta, 'Diferencia %': k.pct_diferencia, Meta: k.meta, Cumple: k.cumple ? 'SÍ' : 'NO' })) },
    { nombre: 'Proveedores', filas: ((prov ?? []) as { mes: number; nuevos: number; acumulado: number }[]).map((p) => ({ Mes: MESES[p.mes - 1], Nuevos: p.nuevos, Acumulado: p.acumulado })) },
  ]

  return (
    <>
      <PageHeader title="Reportes e indicadores"
        description={<>Indicadores oficiales del MOF y comparativo entre negocios · {local ? local.nombre : 'Global'} · {fmtDate(periodo.desde)} – {fmtDate(periodo.hasta)}</>}
        actions={<><PeriodoSelector actual={periodo.key} desde={periodo.desde} hasta={periodo.hasta} /><ReportExport archivo={`reporte_logistica_${periodo.desde}_${periodo.hasta}`} hojas={hojas} /></>} />

      <Section icon={Scale} title="Comparativo entre negocios" className="mb-5" bodyClassName="p-0">
        <Table>
          <thead><tr><Th>Indicador</Th>{cs.map((c) => <Th key={c.local_id} right>{c.local_nombre}</Th>)}<Th right className="bg-ink-900 text-white">Global</Th></tr></thead>
          <tbody>{filas.map((f) => {
            const vals = cs.map((c) => (c[f.key] === null ? null : Number(c[f.key])))
            const validos = vals.filter((v): v is number => v !== null)
            const best = f.mejor && validos.length > 1 ? (f.mejor === 'alto' ? Math.max(...validos) : Math.min(...validos)) : null
            return (
              <tr key={f.key}>
                <Td className="font-medium">{f.label}</Td>
                {vals.map((v, i) => <Td key={i} right className={cn(best !== null && v === best && 'font-bold text-leaf-600')}>{f.fmt(v)}</Td>)}
                <Td right className="bg-canvas/60 font-bold">{f.global === null ? '—' : f.fmt(f.global)}</Td>
              </tr>
            )
          })}</tbody>
        </Table>
      </Section>

      <Section icon={ShoppingCart} title={`Indicador de compras ${anio} — OT, IF, OTIF y ahorro por origen`} className="mb-5"
        stats={[{ label: 'Meta OTIF', value: `≥ ${fmtPct(meta.meta_otif)}` }, { label: 'Meta ahorro', value: `≥ ${fmtPct(meta.meta_ahorro)}` }]} bodyClassName="p-0">
        <div className="p-5"><Bars data={serieCompras} x="mes" series={ciudades.map((c) => ({ key: c, name: c, stack: 'c' }))} height={230} /></div>
        <PagedTable head={<tr><Th>Mes</Th><Th>Origen</Th><Th right>Pedidos</Th><Th right>OT</Th><Th right>IF</Th><Th right>OTIF</Th><Th right>Compras</Th><Th right>Ahorro S/</Th><Th right>Ahorro %</Th><Th right>Transporte</Th></tr>}>{kcs.map((k, i) => {
            const cons = k.ciudad === null
            return (
              <tr key={i} className={cons ? 'bg-canvas/70 font-semibold' : ''}>
                <Td>{cons ? MESES[k.mes - 1] : ''}</Td><Td>{cons ? 'Consolidado' : k.ciudad}</Td><Td right>{k.pedidos}</Td>
                <Td right>{fmtPct(k.ot)}</Td><Td right>{fmtPct(k.in_full)}</Td>
                <Td right>{k.otif === null ? '—' : <Badge tone={k.otif >= (meta.meta_otif ?? 0.95) ? 'green' : 'red'}>{fmtPct(k.otif)}</Badge>}</Td>
                <Td right>{fmtSoles(k.total)}</Td><Td right className={k.ahorro < 0 ? 'text-brand-700' : 'text-leaf-600'}>{fmtSoles(k.ahorro)}</Td>
                <Td right>{fmtPct(k.ahorro_pct)}</Td><Td right>{fmtSoles(k.transporte)}</Td>
              </tr>
            )
          })}</PagedTable>
      </Section>

      <div className="mb-5"><Note>
        Correcciones respecto al Excel “MEJ INDICADOR DE COMPRAS”: (1) “a tiempo” vale 1, no 3 (el Excel daba OT de 160%–300%); (2) el consolidado es el promedio ponderado por pedidos, no la suma de Lima + Ayacucho;
        (3) OTIF = pedidos a tiempo <b>y</b> completos; (4) el ahorro se calcula por precio unitario × cantidad, comparado con la compra anterior del mismo producto; (5) se incluyen todas las filas (el Excel usaba el rango fijo E4:E46).
      </Note></div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Section icon={ClipboardCheck} title={`Exactitud de inventario ${anio} (meta ≤ ${fmtPct(meta.meta_diferencia_inventario)})`} bodyClassName="p-0">
          <PagedTable head={<tr><Th>Mes</Th><Th>Negocio</Th><Th>Responsable</Th><Th right>Valor sistema</Th><Th right>Sobrante</Th><Th right>Faltante</Th><Th right>Dif. %</Th></tr>}>{kis.map((k, i) => (
              <tr key={i}><Td>{MESES[k.mes - 1]}</Td><Td>{k.local_codigo}</Td><Td className="text-xs">{k.responsable}</Td>
                <Td right>{fmtSoles(k.valor_sistema)}</Td><Td right className="text-leaf-600">{fmtSoles(k.sobrante)}</Td><Td right className="text-brand-700">{fmtSoles(k.faltante)}</Td>
                <Td right><Badge tone={k.cumple ? 'green' : 'red'}>{fmtPct(k.pct_diferencia)}</Badge></Td></tr>
            ))}</PagedTable>
        </Section>
        <Section icon={UserPlus} title={`Proveedores registrados ${anio}`} bodyClassName="p-0">
          <PagedTable head={<tr><Th>Mes</Th><Th right>Nuevos</Th><Th right>Acumulado</Th></tr>}>{((prov ?? []) as { mes: number; nuevos: number; acumulado: number }[]).map((p) => (
              <tr key={p.mes}><Td>{MESES[p.mes - 1]}</Td><Td right>{p.nuevos}</Td><Td right className="font-semibold">{p.acumulado}</Td></tr>
            ))}</PagedTable>
        </Section>
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted"><BarChart3 className="size-3.5" /> Todos los indicadores se calculan en la base de datos a partir de los registros; no hay copias manuales entre archivos.</p>
    </>
  )
}
