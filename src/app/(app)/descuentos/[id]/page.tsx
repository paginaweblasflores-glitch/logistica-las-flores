import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { solesEnLetras } from '@/lib/numero-letras'
import { PageHeader, Table, Th, Td, EstadoBadge } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { PrintButton } from '@/components/print-button'
import { cambiarEstadoDescuento } from '../actions'

export const metadata = { title: 'Informe de descuento' }

const TITULO: Record<string, string> = {
  conteo: 'Informe de descuento por faltante de productos en almacén', rotura: 'Informe de descuento por roturas y pérdidas',
  bebidas: 'Informe de descuento por faltante de bebidas', caja: 'Informe de descuento por faltante en caja', manual: 'Informe de descuento',
}

export default async function DescuentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: d } = await supabase.from('descuento')
    .select('id, numero, fecha, origen, monto, estado, observacion, conteo:conteo_id(id, numero, fecha, hora, almacen:almacen_id(nombre)), personal:personal_id(nombres, cargo), local:local_id(nombre, empresa:empresa_id(razon_social, ruc)), descuento_detalle(id, descripcion, cantidad, precio_unitario, importe)')
    .eq('id', id).maybeSingle()
  if (!d) notFound()
  type D = { id: string; numero: string; fecha: string; origen: string; monto: number; estado: string; observacion: string | null
    conteo: { id: string; numero: string; fecha: string; hora: string | null; almacen: { nombre: string } } | null
    personal: { nombres: string; cargo: string | null }; local: { nombre: string; empresa: { razon_social: string; ruc: string } }
    descuento_detalle: { id: string; descripcion: string; cantidad: number; precio_unitario: number; importe: number }[] }
  const x = d as unknown as D

  return (
    <>
      <PageHeader title={`Descuento ${x.numero}`} back={{ href: '/descuentos', label: 'Descuentos' }}
        actions={<>
          <EstadoBadge estado={x.estado} />
          {/* el informe se imprime para firma del trabajador cuando ya está aprobado */}
          {['aprobado', 'aplicado'].includes(x.estado) && <PrintButton label="Imprimir informe" />}
          {x.estado === 'propuesto' && <ActionForm action={cambiarEstadoDescuento}><input type="hidden" name="id" value={id} /><input type="hidden" name="estado" value="aprobado" /><SubmitButton variant="dark">Aprobar</SubmitButton></ActionForm>}
          {x.estado === 'aprobado' && <ActionForm action={cambiarEstadoDescuento}><input type="hidden" name="id" value={id} /><input type="hidden" name="estado" value="aplicado" /><SubmitButton>Marcar aplicado en planilla</SubmitButton></ActionForm>}
          {x.estado !== 'anulado' && x.estado !== 'aplicado' && <ActionForm action={cambiarEstadoDescuento}><input type="hidden" name="id" value={id} /><input type="hidden" name="estado" value="anulado" /><SubmitButton variant="danger" confirm="¿Anular el descuento?">Anular</SubmitButton></ActionForm>}
        </>} />

      <article className="card print-area mx-auto max-w-3xl p-10 text-[15px] leading-relaxed">
        <header className="mb-6 flex items-start justify-between border-b-2 border-ink-900 pb-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={56} height={56} />
            <div><p className="font-bold">{x.local.empresa.razon_social}</p><p className="text-sm text-muted">RUC: {x.local.empresa.ruc} · {x.local.nombre}</p></div>
          </div>
          <p className="text-right text-sm">N° {x.numero}<br />{fmtDate(x.fecha)}</p>
        </header>
        <h2 className="mb-5 text-center text-lg font-bold uppercase">{TITULO[x.origen] ?? 'Informe de descuento'}</h2>
        <p className="mb-4">
          Yo, Fernanda Fernández, del área de Logística, informo que
          {x.conteo ? <> con fecha {fmtDate(x.conteo.fecha)}{x.conteo.hora ? ` a las ${x.conteo.hora.slice(0, 5)}` : ''} se realizó el conteo físico de productos en {x.conteo.almacen.nombre} (conteo <Link href={`/conteos/${x.conteo.id}`} className="font-semibold">{x.conteo.numero}</Link>), encontrándose diferencias en el inventario.</>
            : <> se determinaron los siguientes cargos correspondientes a {x.local.nombre}{x.observacion ? ` (${x.observacion})` : ''}.</>}
        </p>
        <p className="mb-4">Como resultado, bajo responsabilidad de <b>{x.personal.nombres}</b>{x.personal.cargo ? ` (${x.personal.cargo})` : ''}, se determinó el siguiente detalle:</p>
        <Table className="mb-4 rounded-lg border border-line">
          <thead><tr><Th>Producto</Th><Th right>Cantidad</Th><Th right>Precio unitario</Th><Th right>Importe</Th></tr></thead>
          <tbody>
            {x.descuento_detalle.map((l) => (
              <tr key={l.id}><Td>{l.descripcion}</Td><Td right>{fmtQty(l.cantidad)}</Td><Td right>{fmtSoles(l.precio_unitario)}</Td><Td right>{fmtSoles(l.importe)}</Td></tr>
            ))}
            <tr><Td colSpan={3} className="text-right font-bold">TOTAL</Td><Td right className="font-bold">{fmtSoles(x.monto)}</Td></tr>
          </tbody>
        </Table>
        <p className="mb-10">En consecuencia, se solicita realizar el descuento correspondiente a <b>{x.personal.nombres}</b> por el importe total de <b>{fmtSoles(x.monto)}</b> ({solesEnLetras(Number(x.monto))}), conforme a las políticas internas de la empresa.</p>
        <div className="mt-20 grid grid-cols-3 gap-8 text-center text-xs">
          <div className="border-t border-ink-900 pt-2"><b>{x.personal.nombres}</b><br />Responsable</div>
          <div className="border-t border-ink-900 pt-2"><b>FERNANDEZ LAPA, FERNANDA</b><br />Área de Logística</div>
          <div className="border-t border-ink-900 pt-2"><b>Administración</b><br />V° B°</div>
        </div>
      </article>
    </>
  )
}
