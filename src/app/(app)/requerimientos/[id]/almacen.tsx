import Link from 'next/link'
import Image from 'next/image'
import { PackageCheck } from 'lucide-react'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Badge, LinkButton, Note } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { PrintButton } from '@/components/print-button'
import { AprobacionAlmacen } from './aprobacion-almacen'
import { cotizarRequerimiento, comprarRequerimientoAlmacen } from '../actions'

export type DetAlm = { id: string; producto_id: string | null; descripcion: string; stock_actual: number | null; cantidad_solicitada: number
  cantidad_aprobada: number | null; motivo: string | null
  /** lo pedido tal cual, en la unidad elegida (cantidad_solicitada está en la unidad del producto) */
  cantidad_pedida?: number | null; pedida?: { nombre: string } | null
  producto: { codigo: string; unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] } | null }
export type CompraAlm = { id: string; numero: string; estado: string; fecha: string; fecha_entrega?: string | null; tipo_documento: string | null; numero_documento: string | null
  proveedor: { razon_social: string } | null
  compra_detalle: { id: string; producto_id: string | null; cantidad_solicitada: number; cantidad_recibida: number | null; precio_unitario: number; agregado?: boolean
    producto: { nombre: string; unidad: { codigo: string } } | null }[] }
type R = { id: string; numero: string; estado: string; parcial: boolean; almacen_id: string; almacen_nombre: string | null; solicitante: string
  created_at: string; fecha_requerida: string | null; observacion: string | null; aprobado_at: string | null; aprobado_por: string | null }

/**
 * Requerimiento del ALMACÉN (su lista para reponer stock). Fernanda aprueba, cotiza si quiere y lo marca
 * «Comprado» eligiendo el proveedor, sin precios. La llegada (cantidades reales, precio y boleta) la registra
 * el almacén en Entradas; ahí se cierra, completo o parcial.
 */
export function RequerimientoAlmacen({ r, det, compras, cots, gestiona, esAlmacen }: {
  r: R; det: DetAlm[]; compras: CompraAlm[]; cots: { id: string; numero: string; estado: string }[]
  gestiona: boolean; esAlmacen: boolean
}) {
  const vigentes = compras.filter((c) => c.estado !== 'anulada')
  const cotVigente = cots.find((c) => c.estado !== 'anulada')
  const enCamino = vigentes.filter((c) => c.estado === 'aprobada')
  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16)
  // lo que llegó de cada producto (de las compras ya registradas por el almacén) y su precio de boleta
  const llego = (pid: string | null) => vigentes.filter((c) => c.estado === 'recibida')
    .flatMap((c) => c.compra_detalle.filter((d) => d.producto_id === pid)).reduce((s, d) => s + Number(d.cantidad_recibida ?? 0), 0)
  const precio = (pid: string | null) => vigentes.filter((c) => c.estado === 'recibida')
    .flatMap((c) => c.compra_detalle.filter((d) => d.producto_id === pid && Number(d.cantidad_recibida) > 0)).map((d) => Number(d.precio_unitario))[0] ?? null
  const agregados = vigentes.flatMap((c) => c.compra_detalle.filter((d) => d.agregado))
  const recibido = vigentes.some((c) => c.estado === 'recibida')
  const codigo = (d: DetAlm) => d.producto?.alm.find((a) => a.almacen_id === r.almacen_id)?.codigo ?? '—'
  // lo pedido tal cual (4 Paquete) y cuántas unidades del producto trae cada una
  const enPedido = (d: DetAlm) => d.cantidad_pedida != null && d.pedida && Number(d.cantidad_pedida) > 0 && Number(d.cantidad_pedida) !== Number(d.cantidad_solicitada)
  const factor = (d: DetAlm) => (enPedido(d) ? Number(d.cantidad_solicitada) / Number(d.cantidad_pedida) : 1)
  const unidadPedido = (d: DetAlm) => (enPedido(d) ? d.pedida!.nombre : d.producto?.unidad.codigo ?? '')
  const aprobando = gestiona && r.estado === 'solicitado'
  const conObs = det.some((d) => d.motivo)
  // aprobado y aún sin compra ni cotización: Fernanda compra directo («Comprado») o pide cotización
  const porComprar = gestiona && r.estado === 'aprobado' && !vigentes.length && !cotVigente
  const aprobadoTxt = (d: DetAlm) => { const a = Number(d.cantidad_aprobada ?? d.cantidad_solicitada); return enPedido(d) ? `${fmtQty(a / factor(d))} ${unidadPedido(d)}` : `${fmtQty(a)} ${d.producto?.unidad.codigo ?? ''}` }

  return (
    <>
      <PageHeader title={`Requerimiento ${r.numero}`} back={{ href: '/requerimientos', label: 'Requerimientos' }}
        description={`${r.almacen_nombre ?? 'Almacén'} · pedido el ${fmtDate(r.created_at, true)}${r.fecha_requerida ? ` · para el ${fmtDate(r.fecha_requerida)}` : ''}`}
        actions={<>
          {r.parcial ? <Badge tone="amber">Atendido parcial</Badge> : <EstadoBadge estado={r.estado} />}
          {gestiona && ['aprobado', 'comprado'].includes(r.estado) && <PrintButton label="Imprimir" />}
          {porComprar && (
            <ActionForm action={cotizarRequerimiento}><input type="hidden" name="id" value={r.id} />
              <SubmitButton variant="outline" confirm="¿Pasar a cotización? Se crea el cuadro comparativo con los productos aprobados.">Solicitar cotización</SubmitButton></ActionForm>
          )}
          {cotVigente && <LinkButton href={`/cotizaciones/${cotVigente.id}`} variant="outline">Ver cotización {cotVigente.numero}</LinkButton>}
          {vigentes.map((c) => <LinkButton key={c.id} href={`/compras/${c.id}`} variant="outline">{vigentes.length > 1 ? 'Compra' : 'Ver compra'} {c.numero}</LinkButton>)}
        </>} />

      {enCamino.length > 0 && (
        <div className="mb-5"><Note>
          <b>En camino</b> ({enCamino.map((c) => `${c.numero} · ${c.proveedor?.razon_social ?? 'sin proveedor'}`).join(' · ')}).{' '}
          {esAlmacen
            ? <>Cuando llegue, regístrelo en <Link href={`/entradas/nueva?tipo=compra&compra=${enCamino[0].id}`} className="font-semibold text-brand-600">Entradas → Compra con boleta</Link> con los datos de la boleta.</>
            : 'El almacén registrará la llegada con la boleta.'}
        </Note></div>
      )}
      {r.observacion && <p className="mb-4 text-sm"><span className="text-muted">Observación:</span> {r.observacion}</p>}

      <Section icon={PackageCheck} title="Productos" bodyClassName="p-0"
        stats={r.aprobado_at ? [{ label: 'Aprobado', value: fmtDate(r.aprobado_at, true) }] : []}>
        {/* Logística aprueba aquí mismo, en las unidades en que se pidió */}
        {aprobando ? (
          <AprobacionAlmacen id={r.id} lineas={det.map((d) => ({ id: d.id, codigo: codigo(d), descripcion: d.descripcion, unidadProducto: d.producto?.unidad.codigo ?? '',
            pedido: enPedido(d) ? Number(d.cantidad_pedida) : Number(d.cantidad_solicitada), unidad: unidadPedido(d), factor: factor(d), motivo: d.motivo }))} />
        ) : (
        <Table>
          <thead><tr><Th right>Cód.</Th><Th>Producto</Th><Th right>Pedido</Th><Th right>Aprobado</Th>
            {recibido && <><Th right>Llegó</Th><Th right>Precio (boleta)</Th></>}{conObs && <Th>Observación</Th>}</tr></thead>
          <tbody>
            {det.map((d) => {
              const aprob = d.cantidad_aprobada === null ? null : Number(d.cantidad_aprobada)
              const pedido = aprob ?? Number(d.cantidad_solicitada)
              const lleg = llego(d.producto_id)
              return (
                <tr key={d.id} className={aprob === 0 ? 'text-muted line-through' : ''}>
                  <Td right className="font-mono text-xs font-semibold">{codigo(d)}</Td>
                  <Td className="font-medium">{d.descripcion} <span className="text-xs text-muted">{d.producto?.unidad.codigo}</span></Td>
                  <Td right>{d.cantidad_pedida != null && d.pedida && Number(d.cantidad_pedida) !== Number(d.cantidad_solicitada)
                    ? <>{fmtQty(d.cantidad_pedida)} {d.pedida.nombre}<span className="block text-[11px] text-muted">= {fmtQty(d.cantidad_solicitada)} {d.producto?.unidad.codigo}</span></>
                    : fmtQty(d.cantidad_solicitada)}</Td>
                  <Td right className="font-semibold">{aprob === null ? '—' : enPedido(d) ? <>{fmtQty(aprob / factor(d))} {unidadPedido(d)}<span className="block text-[11px] font-normal text-muted">= {fmtQty(aprob)} {d.producto?.unidad.codigo}</span></> : fmtQty(aprob)}</Td>
                  {recibido && <>
                    <Td right className={lleg < pedido && aprob !== 0 ? 'font-semibold text-amber-700' : 'font-semibold'}>{fmtQty(lleg)}{lleg < pedido && aprob !== 0 && <span className="block text-[11px] font-normal">de {fmtQty(pedido)}</span>}</Td>
                    <Td right>{fmtSoles(precio(d.producto_id))}</Td>
                  </>}
                  {conObs && <Td className="text-xs text-muted">{d.motivo ?? ''}</Td>}
                </tr>
              )
            })}
            {agregados.map((d) => (
              <tr key={d.id}>
                <Td right className="text-muted">—</Td>
                <Td className="font-medium">{d.producto?.nombre} <Badge tone="violet" className="ml-1">No estaba en el requerimiento</Badge></Td>
                <Td right>—</Td><Td right>—</Td>
                {recibido && <><Td right className="font-semibold">{fmtQty(d.cantidad_recibida)}</Td><Td right>{fmtSoles(d.precio_unitario)}</Td></>}
                {conObs && <Td />}
              </tr>
            ))}
          </tbody>
        </Table>
        )}
        {/* compra directa: solo cuándo debe llegar (el proveedor lo pone el almacén con la boleta) */}
        {porComprar && (
          <ActionForm action={comprarRequerimientoAlmacen} className="flex flex-wrap items-end justify-end gap-3 border-t border-line px-5 py-4">
            <input type="hidden" name="id" value={r.id} />
            <label className="w-60"><span className="label">Debe llegar <span className="font-normal normal-case text-subtle">(opcional)</span></span><input type="datetime-local" name="fecha_compromiso" min={ahora} className="field" /></label>
            <SubmitButton confirm="¿Marcar como comprado? El almacén registrará la llegada con la boleta.">Comprado</SubmitButton>
          </ActionForm>
        )}
      </Section>

      {/* hoja para imprimir (PDF): lo aprobado, para ir a comprar */}
      <section className="documento print-area hidden print:block">
        <header className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-3">
          <div className="flex items-center gap-3"><Image src="/logo.png" alt="" width={48} height={48} />
            <div><p className="font-bold">Requerimiento {r.numero}</p><p className="text-xs">{r.almacen_nombre} · pedido el {fmtDate(r.created_at, true)}</p></div></div>
          {r.aprobado_at && <p className="text-xs">Aprobado el {fmtDate(r.aprobado_at, true)}</p>}
        </header>
        <table className="w-full text-sm">
          <thead><tr><th className="th text-left">Ítem</th><th className="th text-right">Cód.</th><th className="th text-left">Producto</th><th className="th text-right">Cantidad</th></tr></thead>
          <tbody>{det.filter((d) => Number(d.cantidad_aprobada ?? d.cantidad_solicitada) > 0).map((d, i) => (
            <tr key={d.id}><td className="td">{i + 1}</td><td className="td text-right font-mono">{codigo(d)}</td><td className="td">{d.descripcion}</td><td className="td text-right">{aprobadoTxt(d)}</td></tr>
          ))}</tbody>
        </table>
        {r.observacion && <p className="mt-3 text-xs">Observación: {r.observacion}</p>}
      </section>
    </>
  )
}
