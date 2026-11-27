import Link from 'next/link'
import { PackageCheck, Printer, Layers } from 'lucide-react'
import { ocCompleta, totalOrden } from '@/lib/orden-compra'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Badge, LinkButton, Note } from '@/components/ui'
import { EnvioBadge } from '../juntados'

export type DetAlm = { id: string; producto_id: string | null; descripcion: string; stock_actual: number | null; cantidad_solicitada: number
  cantidad_aprobada: number | null; motivo: string | null
  /** lo pedido tal cual, en la unidad elegida (cantidad_solicitada está en la unidad del producto) */
  cantidad_pedida?: number | null; pedida?: { nombre: string } | null
  /** Logística ya lo envió al proveedor (descargó la imagen / el PDF del RL) */
  enviado_at?: string | null
  producto: { codigo: string; unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] } | null }
export type CompraAlm = { id: string; numero: string; estado: string; fecha: string; fecha_entrega?: string | null; tipo_documento: string | null; numero_documento: string | null
  proveedor: { razon_social: string } | null
  compra_detalle: { id: string; producto_id: string | null; cantidad_solicitada: number; cantidad_recibida: number | null; precio_unitario: number; agregado?: boolean
    producto: { nombre: string; unidad: { codigo: string } } | null }[] }
type R = { id: string; numero: string; estado: string; parcial: boolean; almacen_id: string; almacen_nombre: string | null; solicitante: string
  created_at: string; fecha_requerida: string | null; observacion: string | null; aprobado_at: string | null; aprobado_por: string | null }

/**
 * Requerimiento del ALMACÉN (su lista para reponer stock). Ya no se aprueba ni se marca «Comprado»: Logística lo
 * trabaja JUNTADO con los demás del día en el RL (elige productos, descarga la imagen y la envía al proveedor).
 * Aquí se ve qué se pidió y qué ya se envió; la llegada (cantidades reales, precio y boleta) la registra el
 * almacén en Entradas.
 */
export function RequerimientoAlmacen({ r, det, compras, cots, gestiona, esAlmacen, consolidado }: {
  r: R; det: DetAlm[]; compras: CompraAlm[]; cots: { id: string; numero: string; estado: string }[]
  gestiona: boolean; esAlmacen: boolean
  /** el RL del día en que Logística lo trabaja */
  consolidado: { id: string; numero: string } | null
}) {
  const vigentes = compras.filter((c) => c.estado !== 'anulada')
  const cotVigente = cots.find((c) => c.estado !== 'anulada')
  const enCamino = vigentes.filter((c) => c.estado === 'aprobada')
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
  const conObs = det.some((d) => d.motivo)
  // envío al proveedor: todos, algunos o ninguno de lo pedido
  const pedidas = det.filter((d) => Number(d.cantidad_aprobada ?? d.cantidad_solicitada) > 0)
  const enviadas = pedidas.filter((d) => d.enviado_at).length
  const envio = pedidas.length && enviadas === pedidas.length ? 'si' : enviadas ? 'parcial' : 'no'

  return (
    <>
      <PageHeader title={`Requerimiento ${r.numero}`} back={{ href: '/requerimientos', label: 'Requerimientos' }}
        description={`${r.almacen_nombre ?? 'Almacén'} · pedido el ${fmtDate(r.created_at, true)}${r.fecha_requerida ? ` · para el ${fmtDate(r.fecha_requerida)}` : ''}`}
        actions={<>
          {r.parcial ? <Badge tone="amber">Atendido parcial</Badge> : r.estado === 'aprobado' ? <EnvioBadge envio={envio} /> : <EstadoBadge estado={r.estado} />}
          {/* Logística lo trabaja junto con los demás del día */}
          {gestiona && consolidado && <LinkButton href={`/requerimientos/rl/${consolidado.id}`} variant="outline"><Layers className="size-4" /> Ver en {consolidado.numero}</LinkButton>}
          {cotVigente && <LinkButton href={`/cotizaciones/${cotVigente.id}`} variant="outline">Ver cotización {cotVigente.numero}</LinkButton>}
          {vigentes.map((c) => <LinkButton key={c.id} href={`/compras/${c.id}`} variant="outline">{vigentes.length > 1 ? 'Compra' : 'Ver compra'} {c.numero}</LinkButton>)}
          {/* la OC, cuando ya tiene proveedor y precios (Logística) */}
          {gestiona && vigentes.filter((c) => ocCompleta({ estado: c.estado, proveedor: c.proveedor, total: totalOrden(c.compra_detalle) })).map((c) => (
            <LinkButton key={`oc-${c.id}`} href={`/compras/${c.id}/orden`} variant="outline"><Printer className="size-4" /> Imprimir OC{vigentes.length > 1 ? ` ${c.numero}` : ''}</LinkButton>
          ))}
        </>} />

      {enCamino.length > 0 && (
        <div className="mb-5"><Note>
          <b>En camino</b> ({enCamino.map((c) => `${c.numero} · ${c.proveedor?.razon_social ?? 'sin proveedor'}`).join(' · ')}).{' '}
          {esAlmacen
            ? <>Cuando llegue, regístrelo en <Link href={`/entradas/nueva?tipo=compra&compra=${enCamino[0].id}`} className="enlace">Entradas → Compra con boleta</Link> con los datos de la boleta.</>
            : 'El almacén registrará la llegada con la boleta.'}
        </Note></div>
      )}
      {r.observacion && <p className="mb-4 text-sm"><span className="text-muted">Observación:</span> {r.observacion}</p>}

      <Section icon={PackageCheck} title="Productos" bodyClassName="p-0"
        stats={[{ label: 'Enviados al proveedor', value: `${enviadas} de ${pedidas.length}` }]}>
        <Table>
          <thead><tr><Th right>Cód.</Th><Th>Producto</Th><Th right>Pedido</Th><Th>Envío</Th>
            {recibido && <><Th right>Llegó</Th><Th right>Precio (boleta)</Th></>}{conObs && <Th>Observación</Th>}</tr></thead>
          <tbody>
            {det.map((d) => {
              const pedido = Number(d.cantidad_aprobada ?? d.cantidad_solicitada)
              const lleg = llego(d.producto_id)
              return (
                <tr key={d.id} className={pedido === 0 ? 'text-muted line-through' : d.enviado_at ? 'bg-leaf-50/60' : ''}>
                  <Td right className="font-mono text-xs font-semibold">{codigo(d)}</Td>
                  <Td className="font-medium">{d.descripcion} <span className="text-xs text-muted">{d.producto?.unidad.codigo}</span></Td>
                  <Td right>{enPedido(d)
                    ? <>{fmtQty(d.cantidad_pedida)} {d.pedida!.nombre}<span className="block text-[11px] text-muted">= {fmtQty(d.cantidad_solicitada)} {d.producto?.unidad.codigo}</span></>
                    : fmtQty(d.cantidad_solicitada)}</Td>
                  <Td>{pedido === 0 ? '—' : d.enviado_at ? <Badge tone="green">Enviado · {fmtDate(d.enviado_at, true)}</Badge> : <span className="text-xs text-muted">Por enviar</span>}</Td>
                  {recibido && <>
                    <Td right className={lleg < pedido && pedido !== 0 ? 'font-semibold text-amber-700' : 'font-semibold'}>{fmtQty(lleg)}{lleg < pedido && pedido !== 0 && <span className="block text-[11px] font-normal">de {fmtQty(pedido)}</span>}</Td>
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
                <Td right>—</Td><Td />
                {recibido && <><Td right className="font-semibold">{fmtQty(d.cantidad_recibida)}</Td><Td right>{fmtSoles(d.precio_unitario)}</Td></>}
                {conObs && <Td />}
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  )
}
