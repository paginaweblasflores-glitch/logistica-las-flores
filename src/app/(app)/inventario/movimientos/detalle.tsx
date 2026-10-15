import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { LOGO_DOC } from '@/lib/empresa'
import { NOMBRE_TIPO, TIPOS_DE, type Sentido } from '@/lib/movimientos'
import { PageHeader, Section, Table, Th, Td, Badge, Note } from '@/components/ui'
import { AnularConMotivo } from '@/components/anular-con-motivo'
import { TicketButton } from '@/components/ticket'
import { anularMovimiento } from './actions'

/** Ficha de una entrada o salida. La salida a un área tiene su ticket (se imprime solo al registrarla). */
export async function DetalleMovimiento({ id, sentido, imprimir }: { id: string; sentido: Sentido; imprimir?: boolean }) {
  const supabase = await createClient()
  const { data } = await supabase.from('movimiento')
    .select(`id, nro, fecha, tipo, anulado, motivo_anulacion, anulado_at, documento, observacion, recibe, referencia_tipo, referencia_id, almacen_id,
             almacen:almacen_id(nombre), local:local_id(codigo, nombre), area:area_id(nombre),
             movimiento_detalle(id, cantidad, costo_unitario, fecha_vencimiento, producto:producto_id(nombre, unidad:unidad_id(codigo), alm:producto_almacen(almacen_id, codigo)))`)
    .eq('id', id).maybeSingle()
  if (!data) notFound()
  type M = { id: string; nro: string | null; fecha: string; tipo: string; anulado: boolean; motivo_anulacion: string | null; anulado_at: string | null
    documento: string | null; observacion: string | null; recibe: string | null; referencia_tipo: string | null; referencia_id: string | null; almacen_id: string
    almacen: { nombre: string }; local: { codigo: string; nombre: string }; area: { nombre: string } | null
    movimiento_detalle: { id: string; cantidad: number; costo_unitario: number | null; fecha_vencimiento: string | null; producto: { nombre: string; unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] } }[] }
  const m = data as unknown as M
  // una entrada abierta desde /salidas (o al revés): a su historial correcto
  const suSentido: Sentido = TIPOS_DE.entrada.includes(m.tipo) ? 'entrada' : 'salida'
  if (suSentido !== sentido) redirect(`/${suSentido}s/${id}`)

  const [panel, sel] = await Promise.all([getPanel(), getAlmacenActivo()])
  const ruta = sentido === 'entrada' ? '/entradas' : '/salidas'
  const puedeAnular = panel === 'almacen' && !soloConsulta(sel) && !m.anulado && (m.referencia_tipo === 'manual' || !m.referencia_tipo) && m.tipo !== 'stock_inicial'
  const total = m.movimiento_detalle.reduce((s, d) => s + Number(d.cantidad) * Number(d.costo_unitario ?? 0), 0)
  const hayVence = m.movimiento_detalle.some((d) => d.fecha_vencimiento)
  const origen = m.referencia_tipo === 'compra' ? `/compras/${m.referencia_id}` : m.referencia_tipo === 'traslado' ? `/traslados/${m.referencia_id}` : m.referencia_tipo === 'conteo' ? `/conteos/${m.referencia_id}` : null
  const conTicket = m.tipo === 'salida_consumo' && !m.anulado

  const datos: [string, React.ReactNode][] = [
    ['Fecha', fmtDate(m.fecha, true)],
    ['Tipo', NOMBRE_TIPO[m.tipo] ?? m.tipo],
    ['Almacén', m.almacen.nombre],
    ...(m.area ? [[sentido === 'entrada' ? 'Área que devuelve' : 'Área destino', m.area.nombre] as [string, string]] : []),
    ...(m.recibe ? [['Entregado a', m.recibe] as [string, string]] : []),
    ...(m.documento ? [['Documento', origen ? <Link key="d" href={origen} className="font-semibold text-brand-600">{m.documento}</Link> : m.documento] as [string, React.ReactNode]] : []),
    ...(m.observacion ? [['Observación', m.observacion] as [string, string]] : []),
  ]

  return (
    <>
      <PageHeader title={`${sentido === 'entrada' ? 'Entrada' : 'Salida'} ${m.nro ?? ''}`} back={{ href: ruta, label: sentido === 'entrada' ? 'Entradas' : 'Salidas' }}
        actions={<>
          {conTicket && (
            <TicketButton auto={imprimir} label="Imprimir ticket" data={{
              logo: LOGO_DOC[m.local.codigo], negocio: m.local.nombre, titulo: 'Comprobante de salida de almacén', numero: m.nro ?? '',
              datos: [['Fecha', fmtDate(m.fecha, true)], ['Almacén', m.almacen.nombre], ['Área destino', m.area?.nombre ?? '—']],
              items: m.movimiento_detalle.map((d) => ({ descripcion: d.producto.nombre, cantidad: fmtQty(d.cantidad), unidad: d.producto.unidad.codigo })),
              observacion: m.observacion, firmas: [{ nombre: m.recibe, etiqueta: 'Recibí conforme' }],
            }} />
          )}
          {puedeAnular && (
            <AnularConMotivo action={anularMovimiento} campos={{ id: m.id }} titulo={`Anular la ${sentido} ${m.nro ?? ''}`}
              detalle="Los registros no se editan ni se borran: se anulan (se revierte el stock) y se registran de nuevo bien.">
              <Ban className="size-3.5" /> Anular
            </AnularConMotivo>
          )}
        </>} />
      {m.anulado && <div className="mb-4"><Note tone="warn">Anulada el {fmtDate(m.anulado_at, true)}{m.motivo_anulacion ? <>. Motivo: <b>{m.motivo_anulacion}</b></> : ''}. El stock fue revertido.</Note></div>}
      <Section title="Datos" className="mb-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {datos.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          <div><dt className="text-xs text-muted">Estado</dt><dd>{m.anulado ? <Badge tone="dark">Anulada</Badge> : <Badge tone="green">Registrada</Badge>}</dd></div>
        </dl>
      </Section>
      <Section title="Productos" bodyClassName="p-0" stats={[{ label: 'Ítems', value: m.movimiento_detalle.length }, { label: 'Valor', value: fmtSoles(total) }]}>
        <Table>
          <thead><tr><Th>Ítem</Th><Th right>Cód.</Th><Th>Producto</Th><Th right>Cantidad</Th><Th right>Costo unit.</Th><Th right>Importe</Th>{hayVence && <Th>Vencimiento</Th>}</tr></thead>
          <tbody>
            {m.movimiento_detalle.map((d, i) => (
              <tr key={d.id}>
                <Td className="text-muted tabular">{i + 1}</Td>
                <Td right className="font-mono text-xs font-semibold">{d.producto.alm.find((a) => a.almacen_id === m.almacen_id)?.codigo ?? '—'}</Td>
                <Td className="font-medium">{d.producto.nombre}</Td>
                <Td right>{fmtQty(d.cantidad)} <span className="text-xs text-muted">{d.producto.unidad.codigo}</span></Td>
                <Td right>{fmtSoles(d.costo_unitario)}</Td>
                <Td right className="font-semibold">{fmtSoles(Number(d.cantidad) * Number(d.costo_unitario ?? 0))}</Td>
                {hayVence && <Td className="tabular">{fmtDate(d.fecha_vencimiento)}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  )
}
