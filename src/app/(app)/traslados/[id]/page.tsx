import Image from 'next/image'
import { notFound } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getMisLocales, getPanel, getAlmacenActivo } from '@/lib/session'
import { etiquetaNegocio } from '@/lib/empresa'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Note } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { TicketButton } from '@/components/ticket'
import { LOGO_DOC } from '@/lib/empresa'
import { RecepcionTraspaso, CancelarTraspaso } from './recepcion'

export const metadata = { title: 'Traspaso' }

export default async function TrasladoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enviado?: string }> }) {
  const [{ id }, { enviado }] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const [{ data: t }, panel, mios] = await Promise.all([
    supabase.from('traslado')
      .select(`id, numero, fecha, estado, motivo, observacion, recibido_at, motivo_cancelacion, cancelado_at, local_origen_id, local_destino_id, almacen_origen_id, almacen_destino_id,
               origen:almacen_origen_id(nombre, local:local_id(codigo, nombre, empresa:empresa_id(razon_social, ruc))), destino:almacen_destino_id(nombre, local:local_id(nombre, empresa:empresa_id(razon_social, ruc))),
               recibe, recibe_personal:recibe_personal_id(nombres),
               traslado_detalle(id, cantidad, cantidad_recibida, cantidad_rechazada, precio, fecha_vencimiento, observacion, factor, cantidad_envio, envio:unidad_envio_id(codigo), producto:producto_id(nombre, codigo, unidad:unidad_id(codigo), alm:producto_almacen(almacen_id, codigo)), destino:producto_destino_id(unidad:unidad_id(codigo), alm:producto_almacen(almacen_id, codigo)))`)
      .eq('id', id).maybeSingle(),
    getPanel(), getMisLocales(),
  ])
  if (!t) notFound()
  type T = { id: string; numero: string; almacen_origen_id: string; almacen_destino_id: string; fecha: string; estado: string; motivo: string | null; observacion: string | null; recibido_at: string | null
    motivo_cancelacion: string | null; cancelado_at: string | null; local_origen_id: string; local_destino_id: string
    origen: { nombre: string; local: { codigo: string; nombre: string; empresa: { razon_social: string; ruc: string } } }; destino: { nombre: string; local: { nombre: string; empresa: { razon_social: string; ruc: string } } }
    recibe: string | null; recibe_personal: { nombres: string } | null
    traslado_detalle: { id: string; cantidad: number; cantidad_recibida: number | null; cantidad_rechazada: number | null; precio: number | null
      fecha_vencimiento: string | null; observacion: string | null; factor: number; cantidad_envio: number | null; envio: { codigo: string } | null
      producto: { nombre: string; codigo: string; unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] }
      destino: { unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] } | null }[] }
  const tr = t as unknown as T
  const ids = new Set(mios.map((l) => l.id))
  const pendiente = tr.estado === 'pendiente'
  // con varios almacenes (Las Flores 01 y 02) el que recibe o cancela es el almacén elegido arriba; con «Todos», nadie
  const sel = await getAlmacenActivo()
  const varios = sel.lista.length > 1
  const soyDestino = panel === 'almacen' && (varios ? sel.id === tr.almacen_destino_id : ids.has(tr.local_destino_id))
  const soyOrigen = panel === 'almacen' && (varios ? sel.id === tr.almacen_origen_id : ids.has(tr.local_origen_id))
  const recibido = tr.estado === 'recibido'
  // código de cada producto: el del almacén elegido arriba si es el de origen o destino; si no, el del origen
  const almCodigo = sel.id === tr.almacen_destino_id ? tr.almacen_destino_id : tr.almacen_origen_id
  const total = tr.traslado_detalle.reduce((s, d) => s + Number(recibido ? d.cantidad_recibida ?? 0 : d.cantidad) * Number(d.precio ?? 0), 0)
  // una sola firma: quien recibe (escrito al enviar; en traspasos antiguos, el elegido al recibir)
  const quienRecibe = tr.recibe ?? tr.recibe_personal?.nombres ?? null

  return (
    <>
      <PageHeader title={`Traspaso ${tr.numero}`} back={{ href: '/traslados', label: 'Traspasos' }}
        actions={<>
          <EstadoBadge estado={tr.estado} />
          {/* el acta se imprime cuando el destino ya respondió (recibido, parcial o rechazado) */}
          {!pendiente && tr.estado !== 'cancelado' && <PrintButton label="Imprimir PDF" />}
          {/* ticket para la tiquetera: se imprime solo al enviarlo (lo firma quien recibe) */}
          {tr.estado !== 'cancelado' && (
            <TicketButton auto={enviado === '1' && soyOrigen} data={{
              logo: LOGO_DOC[tr.origen.local.codigo], negocio: tr.origen.local.nombre, titulo: 'Comprobante de traspaso entre almacenes', numero: tr.numero,
              datos: [['Fecha', fmtDate(tr.fecha, true)], ['Origen', tr.origen.nombre], ['Destino', tr.destino.nombre]],
              items: tr.traslado_detalle.map((d) => ({ descripcion: d.producto.nombre, cantidad: fmtQty(d.cantidad_envio ?? d.cantidad), unidad: d.envio?.codigo ?? d.producto.unidad.codigo })),
              observacion: tr.motivo ?? tr.observacion,
              firmas: [{ nombre: quienRecibe, etiqueta: 'Recibí conforme' }],
            }} />
          )}
          {pendiente && soyOrigen && !soyDestino && <CancelarTraspaso id={id} />}
        </>} />

      {pendiente && soyDestino && (
        <Section icon={PackageCheck} title="Recibir mercadería" className="no-print mb-5">
          <RecepcionTraspaso id={id}
            // se recibe en la unidad del almacén que recibe (p. ej. 2 sacos enviados = 100 kilos)
            lineas={tr.traslado_detalle.map((d) => ({ id: d.id, producto: d.producto.nombre, unidad: d.destino?.unidad.codigo ?? d.producto.unidad.codigo,
              cantidad: Number(d.cantidad) * Number(d.factor || 1), factor: Number(d.factor || 1),
              enviado: `${fmtQty(d.cantidad_envio ?? d.cantidad)} ${d.envio?.codigo ?? d.producto.unidad.codigo}` }))} />
        </Section>
      )}
      {pendiente && !soyDestino && (
        <div className="no-print mb-4"><Note>Pendiente de recepción en <b>{tr.destino.nombre}</b>. La mercadería ya salió de {tr.origen.nombre}.
          {panel === 'almacen' && varios && ids.has(tr.local_destino_id) && <> Para recibirlo, elija arriba <b>{sel.lista.find((a) => a.id === tr.almacen_destino_id)?.corto ?? tr.destino.nombre}</b>.</>}</Note></div>
      )}
      {tr.estado === 'cancelado' && (
        <div className="no-print mb-4"><Note tone="warn">Cancelado el {fmtDate(tr.cancelado_at, true)}. Motivo: <b>{tr.motivo_cancelacion}</b>. La mercadería volvió a {tr.origen.nombre}.</Note></div>
      )}

      <section className="card print-area mx-auto max-w-4xl p-8">
        <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={56} height={56} />
            <div><p className="font-bold">{tr.origen.local.empresa.razon_social}</p><p className="text-xs text-muted">RUC {tr.origen.local.empresa.ruc} · {tr.origen.local.nombre}</p></div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold tracking-wide uppercase">Acta de traspaso</p>
            <p className="text-xs text-muted">Entrega y recepción de mercadería</p>
            <p className="mt-1 text-lg font-bold">N° {tr.numero}</p>
          </div>
        </header>
        <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2"><dt className="w-24 font-semibold">Envío:</dt><dd>{fmtDate(tr.fecha, true)}</dd></div>
          <div className="flex gap-2"><dt className="w-24 font-semibold">Recepción:</dt><dd>{fmtDate(tr.recibido_at, true)}</dd></div>
          <div className="flex gap-2"><dt className="w-24 shrink-0 font-semibold">Origen:</dt><dd>{tr.origen.nombre}<span className="block text-xs text-muted">{etiquetaNegocio({ nombre: tr.origen.local.nombre, ...tr.origen.local.empresa })}</span></dd></div>
          <div className="flex gap-2"><dt className="w-24 shrink-0 font-semibold">Destino:</dt><dd>{tr.destino.nombre}<span className="block text-xs text-muted">{etiquetaNegocio({ nombre: tr.destino.local.nombre, ...tr.destino.local.empresa })}</span></dd></div>
          <div className="col-span-2 flex gap-2"><dt className="w-24 font-semibold">Motivo:</dt><dd>{tr.motivo ?? '—'}</dd></div>
        </dl>
        <Table>
          <thead><tr><Th>Ítem</Th><Th right>Cód.</Th><Th>Producto</Th><Th right>Enviado</Th>{recibido && <><Th right>Recibido</Th><Th right>Devuelto</Th></>}<Th right>Costo (S/)</Th><Th>Vencimiento</Th></tr></thead>
          <tbody>
            {tr.traslado_detalle.map((d, i) => (
              <tr key={d.id}><Td>{i + 1}</Td><Td right className="font-mono text-xs font-semibold">{(d.destino?.alm ?? []).concat(d.producto.alm).find((a) => a.almacen_id === almCodigo)?.codigo ?? '—'}</Td><Td>{d.producto.nombre}{d.observacion && <span className="block text-xs text-muted">{d.observacion}</span>}</Td>
                <Td right>{fmtQty(d.cantidad_envio ?? d.cantidad)} {d.envio?.codigo ?? d.producto.unidad.codigo}
                  {Number(d.factor) !== 1 && <span className="block text-xs text-muted">= {fmtQty(Number(d.cantidad) * Number(d.factor))} {d.destino?.unidad.codigo}</span>}</Td>
                {recibido && <><Td right className="font-semibold">{fmtQty(Number(d.cantidad_recibida ?? 0) * Number(d.factor || 1))} {d.destino?.unidad.codigo ?? d.producto.unidad.codigo}</Td>
                  <Td right className={Number(d.cantidad_rechazada) > 0 ? 'text-brand-700' : 'text-muted'}>{fmtQty(d.cantidad_rechazada)} {d.producto.unidad.codigo}</Td></>}
                <Td right>{fmtSoles(d.precio)}</Td><Td>{fmtDate(d.fecha_vencimiento)}</Td></tr>
            ))}
            <tr><Td colSpan={recibido ? 6 : 4} className="text-right font-semibold">Valor {recibido ? 'recibido' : 'enviado'}</Td><Td right className="font-bold">{fmtSoles(total)}</Td><Td /></tr>
          </tbody>
        </Table>
        <div className="mx-auto mt-20 w-72 border-t border-ink-900 pt-2 text-center text-xs">
          {quienRecibe && <b className="block text-sm uppercase">{quienRecibe}</b>}Recibí conforme
        </div>
      </section>
    </>
  )
}
