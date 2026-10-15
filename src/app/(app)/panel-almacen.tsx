import { AvisoStockDia } from '@/components/aviso-stock-dia'
import Link from 'next/link'
import { ArrowLeftRight, Boxes, ChevronRight, ClipboardList, PackageCheck, PackageX, History, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Local } from '@/lib/session'
import { etiquetaNegocio } from '@/lib/empresa'
import { fmtDate, fmtQty, fmtSoles, inicioMes } from '@/lib/format'
import { PageHeader, Section, Stat, Table, Th, Td, Badge, EmptyState, LinkButton } from '@/components/ui'
import { ProductoFoto } from '@/components/producto-foto'
import { getAlmacenes } from '@/lib/queries'
import { getAlmacenActivo, soloConsulta } from '@/lib/session'

/** Inicio del panel de almacén: el estado de SU almacén y lo que tiene pendiente hoy. */
export async function PanelAlmacen({ local }: { local: Local }) {
  const supabase = await createClient()
  // almacén elegido arriba (Todos · Almacén 01 · Almacén 02 — Cocina): todo el inicio muestra solo ese
  const sel = await getAlmacenActivo()
  const solo = sel.id ? { almacen_id: sel.id } : {}
  const [stock, porRecibir, enviados, compras, reqs, movs, ingresos, almacenes] = await Promise.all([
    supabase.from('v_stock').select('producto_id, almacen_id, nombre, imagen_url, cantidad, unidad, valor, stock_minimo, estado').eq('local_id', local.id).match(solo).limit(5000),
    supabase.from('traslado').select('id, numero, fecha, origen:almacen_origen_id(nombre), traslado_detalle(count)').eq('local_destino_id', local.id).match(sel.id ? { almacen_destino_id: sel.id } : {}).eq('estado', 'pendiente').order('fecha'),
    supabase.from('traslado').select('id', { count: 'exact', head: true }).eq('local_origen_id', local.id).match(sel.id ? { almacen_origen_id: sel.id } : {}).eq('estado', 'pendiente'),
    supabase.from('v_compra_resumen').select('id, numero, fecha, proveedor, items').eq('local_id', local.id).eq('estado', 'aprobada').eq('solo_fuera_catalogo', false).match(solo).order('fecha'),
    supabase.from('requerimiento').select('id', { count: 'exact', head: true }).eq('local_id', local.id).eq('origen', 'almacen').match(solo).in('estado', ['solicitado', 'en_cotizacion', 'aprobado', 'comprado']),
    supabase.from('movimiento').select('id, numero, nro, fecha, tipo, documento, observacion, almacen:almacen_id(nombre), tipo_mov:tipo(nombre, signo), movimiento_detalle(count)')
      .eq('local_id', local.id).match(solo).eq('anulado', false).order('fecha', { ascending: false }).limit(8),
    // lo que ingresó este mes con su precio (antes, la hoja ANUAL del Excel F1 Y H2)
    supabase.from('v_ingreso_almacen').select('compra_id, almacen_id, total').eq('local_id', local.id).match(solo).eq('fuera_de_catalogo', false).gte('fecha_ingreso', inicioMes()).limit(5000),
    // los almacenes que maneja el responsable (Las Flores: Almacén 01 y Almacén 02 — Cocina)
    getAlmacenes(local.id, ['almacen']),
  ])

  type S = { producto_id: string; almacen_id: string; nombre: string; imagen_url: string | null; cantidad: number; unidad: string; valor: number; stock_minimo: number | null; estado: string }
  const st = (stock.data ?? []) as S[]
  const conStock = st.filter((s) => Number(s.cantidad) > 0)
  const porReponer = st.filter((s) => s.estado === 'critico' && Number(s.stock_minimo) > 0)
  const sinStock = st.filter((s) => s.estado === 'agotado' && Number(s.stock_minimo) > 0)
  const ing = (ingresos.data ?? []) as { compra_id: string; almacen_id: string; total: number }[]
  const ingresosMes = ing.reduce((a, r) => a + Number(r.total), 0)
  const comprobantesMes = new Set(ing.map((r) => r.compra_id)).size
  const valor = st.reduce((a, s) => a + Number(s.valor), 0)
  const porAlmacen = almacenes.map((a) => {
    const suyos = st.filter((s) => s.almacen_id === a.id)
    return { ...a, conStock: suyos.filter((s) => Number(s.cantidad) > 0).length,
      reponer: suyos.filter((s) => (s.estado === 'critico' || s.estado === 'agotado') && Number(s.stock_minimo) > 0).length,
      valor: suyos.reduce((x, s) => x + Number(s.valor), 0),
      ingresos: ing.filter((r) => r.almacen_id === a.id).reduce((x, r) => x + Number(r.total), 0) }
  })
  type T = { id: string; numero: string; fecha: string; origen: { nombre: string }; traslado_detalle: { count: number }[] }
  const pendientesRecibir = (porRecibir.data ?? []) as unknown as T[]
  type C = { id: string; numero: string; fecha: string; proveedor: string | null; items: number }
  const comprasRecibir = (compras.data ?? []) as C[]
  type M = { id: string; numero: number; nro: string | null; fecha: string; tipo: string; documento: string | null; observacion: string | null; almacen: { nombre: string }; tipo_mov: { nombre: string; signo: number }; movimiento_detalle: { count: number }[] }
  const ultimos = (movs.data ?? []) as unknown as M[]

  const tareas = [
    { label: 'Traspasos por recibir', value: pendientesRecibir.length, href: '/traslados' },
    { label: 'Compras por recibir', value: comprasRecibir.length, href: '/entradas/nueva?tipo=compra' },
    { label: 'Traspasos enviados sin recibir', value: enviados.count ?? 0, href: '/traslados?ver=enviados' },
    { label: 'Requerimientos en trámite', value: reqs.count ?? 0, href: '/requerimientos' },
  ]

  return (
    <>
      <PageHeader title={sel.actual && sel.lista.length > 1 ? sel.actual.corto : `Almacén ${local.codigo === 'UM' ? 'Hotel Umaru' : 'Restaurante Las Flores'}`}
        description={`${etiquetaNegocio(local)} · Estado de sus almacenes y lo que tiene pendiente.`}
        actions={<>
          {/* con «Todos» solo se consulta: para registrar se elige el almacén arriba */}
          {!soloConsulta(sel) && <>
            <LinkButton href="/traslados/nuevo" variant="outline"><ArrowLeftRight className="size-4" /> Enviar traspaso</LinkButton>
            <LinkButton href="/entradas/nueva" variant="outline"><Plus className="size-4" /> Nueva entrada</LinkButton>
            <LinkButton href="/salidas/nueva"><Plus className="size-4" /> Nueva salida</LinkButton>
          </>}
        </>} />

      <AvisoStockDia />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Productos con stock" value={new Set(conStock.map((s) => s.producto_id)).size}
              hint={porAlmacen.length > 1 && !sel.id ? 'Sin repetir los que están en los dos almacenes' : `${st.length} en su inventario`} />
        <Stat label="Ingresos del mes" value={fmtSoles(ingresosMes)} hint={`${comprobantesMes} ${comprobantesMes === 1 ? 'comprobante' : 'comprobantes'} registrados`} />
        <Stat label="Valor del stock" value={fmtSoles(valor)} hint="Solo productos con costo" />
        <Stat label="Por reponer" value={porReponer.length} tone={porReponer.length ? 'warn' : 'default'} hint="Llegaron a su stock mínimo" />
        <Stat label="Sin stock" value={sinStock.length} tone={sinStock.length ? 'bad' : 'default'} hint="Agotados con mínimo definido" />
      </div>

      {porAlmacen.length > 1 && !sel.id && (
        <div className={`mb-6 grid gap-4 ${porAlmacen.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {porAlmacen.map((a) => (
            <Link key={a.id} href={`/inventario?almacen=${a.id}`} className="card group flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
              <span className="flex items-center justify-between gap-2">
                <b className="text-sm">{a.nombre}</b><ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="grid grid-cols-3 gap-2 text-xs text-muted">
                <span><b className="block text-lg text-ink-900 tabular">{a.conStock}</b>con stock</span>
                <span><b className={`block text-lg tabular ${a.reponer ? 'text-amber-700' : 'text-ink-900'}`}>{a.reponer}</b>por reponer</span>
                <span><b className="block text-lg text-ink-900 tabular">{fmtSoles(a.ingresos)}</b>ingresos del mes</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Section icon={ClipboardList} title="Pendientes" bodyClassName="p-3">
          <ul className="space-y-1">
            {tareas.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-canvas">
                  <span>{x.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={x.value ? 'rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-700 tabular' : 'px-2 font-semibold text-subtle tabular'}>{x.value}</span>
                    <ChevronRight className="size-4 text-subtle" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={PackageCheck} title="Por recibir" bodyClassName="p-3" className="lg:col-span-2">
          {pendientesRecibir.length || comprasRecibir.length ? (
            <ul className="divide-y divide-line text-sm">
              {pendientesRecibir.map((t) => (
                <li key={t.id}><Link href={`/traslados/${t.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-canvas">
                  <span><Badge tone="amber">Traspaso</Badge> <b>{t.numero}</b> desde {t.origen.nombre}</span>
                  <span className="text-xs text-muted">{t.traslado_detalle[0]?.count ?? 0} productos · {fmtDate(t.fecha)} <span className="font-semibold text-brand-600">Recibir →</span></span>
                </Link></li>
              ))}
              {comprasRecibir.map((c) => (
                <li key={c.id}><Link href={`/entradas/nueva?tipo=compra&compra=${c.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-canvas">
                  <span><Badge tone="blue">Compra</Badge> <b>{c.numero}</b> · {c.proveedor ?? 'Sin proveedor'}</span>
                  <span className="text-xs text-muted">{c.items} productos · {fmtDate(c.fecha)} <span className="font-semibold text-brand-600">Recibir →</span></span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-muted">No tiene mercadería por recibir.</p>}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Section icon={History} title="Últimos movimientos" bodyClassName="p-0"
          actions={<span className="flex gap-3 text-xs font-semibold"><Link href="/entradas" className="text-brand-600">Entradas</Link><Link href="/salidas" className="text-brand-600">Salidas</Link></span>}>
          {ultimos.length ? (
            <Table>
              <thead><tr><Th>N°</Th><Th>Fecha</Th><Th>Tipo</Th><Th>Detalle</Th><Th right>Ítems</Th></tr></thead>
              <tbody>{ultimos.map((m) => (
                <tr key={m.id}>
                  <Td className="font-mono text-xs font-semibold whitespace-nowrap"><Link href={`/${m.tipo_mov.signo > 0 ? 'entradas' : 'salidas'}/${m.id}`} className="text-brand-600">{m.nro ?? m.numero}</Link></Td>
                  <Td className="whitespace-nowrap tabular">{fmtDate(m.fecha, true)}</Td>
                  <Td><Badge tone={m.tipo_mov.signo > 0 ? 'green' : 'red'}>{m.tipo_mov.signo > 0 ? '▲' : '▼'} {m.tipo_mov.nombre}</Badge></Td>
                  <Td className="text-xs">{m.documento ?? m.observacion ?? '—'}<span className="block text-muted">{m.almacen.nombre}</span></Td>
                  <Td right>{m.movimiento_detalle[0]?.count ?? 0}</Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <EmptyState title="Aún no hay movimientos" />}
        </Section>

        <Section icon={PackageX} title="Por reponer" bodyClassName="p-3"
          actions={<Link href="/inventario?alerta=1" className="text-xs font-semibold text-brand-600">Ver todos ({porReponer.length + sinStock.length})</Link>}>
          {porReponer.length + sinStock.length ? (
            <ul className="divide-y divide-line text-sm">
              {[...sinStock, ...porReponer].slice(0, 6).map((s) => (
                <li key={s.producto_id}><Link href={`/productos/${s.producto_id}`} className="flex items-center gap-3 px-2 py-2 hover:bg-canvas">
                  <ProductoFoto src={s.imagen_url} alt={s.nombre} />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.nombre}</span>
                  <span className="shrink-0 text-right text-xs"><b className={s.estado === 'agotado' ? 'text-brand-700' : 'text-amber-700'}>{fmtQty(s.cantidad)} {s.unidad}</b><span className="block text-muted">mín. {fmtQty(s.stock_minimo)}</span></span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="flex flex-col items-center gap-2 py-8 text-sm text-muted"><Boxes className="size-6 text-leaf-600" />Todo sobre el mínimo</p>}
        </Section>
      </div>
    </>
  )
}
