import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getLocales } from '@/lib/session'
import { LOGO_DOC } from '@/lib/empresa'
import { fmtDate, fmtQty, fmtSoles, hoyLima, MESES, MESES_CORTO } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Badge } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { Bars, BarList } from '@/components/charts'
import { ExcelDirectorio } from './excel'

export const metadata = { title: 'Informe al Directorio' }

type Informe = {
  total: number; total_anterior: number; compras: number; proveedores: number; productos: number; inventario_hoy: number
  por_almacen: { almacen: string; total: number; compras: number }[]
  por_categoria: { categoria: string; total: number }[]
  top_productos: { producto: string; unidad: string; cantidad: number; total: number; veces: number }[]
  top_proveedores: { proveedor: string; total: number; compras: number }[]
  meses: { mes: string; total: number }[]
}

const ultimoDia = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}` }
const corto = (a: string) => a.replace(/\s*—.*$/, '')

/**
 * Informe al Directorio: las compras del mes de UNA empresa (negocio), con todos sus almacenes. El mes se llena
 * día a día (se puede descargar el avance) y se cierra solo al terminar el último día. En pantalla y en PDF
 * (Imprimir / PDF): el resumen ejecutivo con gráficos; en Excel, el anexo con cada compra y el resumen por producto.
 */
export default async function InformeDirectorioPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [panel, { local }, locales, supabase] = await Promise.all([getPanel(), getAmbito(), getLocales(), createClient()])
  if (panel !== 'logistica' && panel !== 'contabilidad') notFound()
  const hoy = hoyLima()
  // el negocio: el elegido aquí, el de arriba o el primero
  const negocio = locales.find((l) => l.codigo === sp(params, 'negocio')) ?? local ?? locales[0]
  const mes = /^\d{4}-\d{2}$/.test(sp(params, 'mes')) ? sp(params, 'mes') : hoy.slice(0, 7)
  const [anio, nMes] = mes.split('-').map(Number)
  const desde = `${mes}-01`, hasta = ultimoDia(mes)
  const cerrado = hasta < hoy
  const estado = cerrado ? 'Mes cerrado' : mes > hoy.slice(0, 7) ? 'Mes por empezar' : `Avance al ${fmtDate(hoy)}`
  const { data } = await supabase.rpc('fn_informe_directorio', { p_local: negocio.id, p_mes: desde })
  const inf = data as Informe | null
  if (!inf) notFound()

  const etiqueta = `${MESES[nMes - 1]} ${anio}`
  const variacion = inf.total_anterior > 0 ? (inf.total - inf.total_anterior) / inf.total_anterior : null
  const share = (v: number) => (inf.total > 0 ? v / inf.total : 0)
  const serie = inf.meses.map((m) => ({ mes: `${MESES_CORTO[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(2, 4)}`, total: Number(m.total) }))
  const href = (q: Record<string, string>) => `/reportes/directorio?${new URLSearchParams({ negocio: negocio.codigo, mes, ...q })}`

  return (
    <>
      <PageHeader title="Informe al Directorio" back={{ href: '/reportes', label: 'Reportes' }}
        description="Compras del mes por empresa (todos sus almacenes). Se llena día a día y se cierra solo el último día del mes."
        actions={<>
          <PrintButton label="Imprimir / PDF" />
          <ExcelDirectorio localId={negocio.id} ruc={negocio.ruc ?? '—'} razon={negocio.razon_social ?? negocio.nombre} desde={desde} hasta={hasta} etiqueta={etiqueta} estado={estado} />
          <ExcelDirectorio localId={negocio.id} ruc={negocio.ruc ?? '—'} razon={negocio.razon_social ?? negocio.nombre} desde={`${anio}-01-01`} hasta={`${anio}-12-31`}
            etiqueta={`Año ${anio}`} estado={anio < Number(hoy.slice(0, 4)) ? 'Año cerrado' : `Avance al ${fmtDate(hoy)}`} anio />
        </>} />

      {/* empresa y mes (no salen en el PDF) */}
      <form className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
        <div>
          <span className="label">Empresa</span>
          <div className="flex gap-1">
            {locales.map((l) => (
              <Link key={l.id} href={href({ negocio: l.codigo })} className={cn('rounded-lg border px-3 py-2 text-sm font-semibold', l.id === negocio.id ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line text-ink-700 hover:border-line-strong')}>
                {l.nombre}
              </Link>
            ))}
          </div>
        </div>
        <input type="hidden" name="negocio" value={negocio.codigo} />
        <label><span className="label">Mes</span><input type="month" name="mes" defaultValue={mes} max={hoy.slice(0, 7)} className="field tabular" /></label>
        <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-brand-600">Ver</button>
      </form>

      {/* el informe (lo que sale en el PDF) */}
      <section className="documento print-area card mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <div className="flex items-center gap-4">
            <Image src={LOGO_DOC[negocio.codigo] ?? LOGO_DOC.LF} alt="" width={150} height={64} priority className="h-14 w-auto object-contain" />
            <div>
              <p className="text-lg font-bold">{negocio.razon_social ?? negocio.nombre}</p>
              <p className="text-xs text-muted">RUC {negocio.ruc ?? '—'} · {negocio.nombre}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold tracking-wide text-muted uppercase">Informe al Directorio · Compras</p>
            <p className="text-2xl font-bold">{etiqueta}</p>
            <Badge tone={cerrado ? 'green' : 'amber'}>{estado}</Badge>
          </div>
        </header>

        {/* las cifras del mes */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra titulo="Total comprado" valor={fmtSoles(inf.total)}
            nota={variacion === null ? 'Sin compras el mes anterior' : `${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion * 100).toFixed(1)} % vs. mes anterior (${fmtSoles(inf.total_anterior)})`}
            tono={variacion === null ? undefined : variacion > 0 ? 'text-brand-700' : 'text-leaf-600'} />
          <Cifra titulo="Compras registradas" valor={String(inf.compras)} nota={`${inf.productos} productos distintos`} />
          <Cifra titulo="Proveedores" valor={String(inf.proveedores)} nota="a los que se compró en el mes" />
          <Cifra titulo="Valor del inventario" valor={fmtSoles(inf.inventario_hoy)} nota={`al ${fmtDate(hoy)}`} />
        </div>

        {inf.total === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-muted">No hay compras registradas en {etiqueta.toLowerCase()}.</p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <Bloque titulo="Compras de los últimos 6 meses">
                <Bars data={serie} x="mes" series={[{ key: 'total', name: 'Compras' }]} height={210} />
              </Bloque>
              <Bloque titulo="En qué se gastó (por categoría)">
                <BarList items={inf.por_categoria.slice(0, 7).map((c) => ({ key: c.categoria, label: c.categoria, value: Number(c.total), share: share(Number(c.total)) }))} />
              </Bloque>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <Bloque titulo="Por almacén">
                <BarList color="#1f2937" items={inf.por_almacen.map((a) => ({ key: a.almacen, label: <>{corto(a.almacen)} <span className="text-xs font-normal text-muted">· {a.compras} compras</span></>, value: Number(a.total), share: share(Number(a.total)) }))} />
              </Bloque>
              <Bloque titulo="Los 5 proveedores principales">
                <BarList color="#1f2937" items={inf.top_proveedores.map((p) => ({ key: p.proveedor, label: <>{p.proveedor} <span className="text-xs font-normal text-muted">· {p.compras} compras</span></>, value: Number(p.total), share: share(Number(p.total)) }))} />
              </Bloque>
            </div>
            <Bloque titulo="Los 10 productos con más gasto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-muted uppercase">
                  <th className="py-2">Producto</th><th className="py-2 text-right">Veces</th><th className="py-2 text-right">Cantidad</th><th className="py-2 text-right">Total</th><th className="py-2 text-right">% del mes</th>
                </tr></thead>
                <tbody>{inf.top_productos.map((p) => (
                  <tr key={p.producto + p.unidad} className="border-b border-line/60">
                    <td className="py-1.5 font-medium">{p.producto}</td>
                    <td className="py-1.5 text-right tabular">{p.veces}</td>
                    <td className="py-1.5 text-right tabular">{fmtQty(p.cantidad)} {p.unidad}</td>
                    <td className="py-1.5 text-right font-semibold tabular">{fmtSoles(p.total)}</td>
                    <td className="py-1.5 text-right text-muted tabular">{(share(Number(p.total)) * 100).toFixed(1)} %</td>
                  </tr>
                ))}</tbody>
              </table>
            </Bloque>
          </>
        )}
        <p className="border-t border-line pt-3 text-[11px] text-muted">
          Compras registradas al llegar al almacén (boleta o factura), de todos los almacenes de {negocio.nombre}. El detalle de cada compra y el resumen por producto están en el anexo (Excel).
          Generado el {fmtDate(new Date(), true)}.
        </p>
      </section>
    </>
  )
}

function Cifra({ titulo, valor, nota, tono }: { titulo: string; valor: string; nota: string; tono?: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs font-semibold text-muted uppercase">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular">{valor}</p>
      <p className={cn('mt-1 text-xs text-muted', tono)}>{nota}</p>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <p className="mb-3 text-sm font-bold">{titulo}</p>
      {children}
    </div>
  )
}
