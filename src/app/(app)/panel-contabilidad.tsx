import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { avanceCarpeta, carpetaDeCompra, type DocCarpeta } from '@/lib/carpeta'
import { nombreComprobante, SIN_COMPROBANTE_VALIDO } from '@/lib/documentos'
import { fmtDate, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Stat, Table, Th, Td, Badge, LocalBadge, EmptyState, LinkButton } from '@/components/ui'

type Fila = { id: string; numero: string; fecha_entrega: string; local_codigo: string; sin_orden: boolean; cotizacion_id: string | null
  tipo_documento: string | null; numero_documento: string | null; total_documento: number | null; total_compra: number; proveedor: string | null
  estado_contable: 'pendiente' | 'registrado' | 'observado'; observacion: string | null; compra_documento: DocCarpeta[] }

/**
 * Inicio de la contadora: lo que falta en el registro de compras (por registrar, observado, sin comprobante
 * válido) y las carpetas incompletas. Todo con un clic a la compra.
 */
export async function PanelContabilidad() {
  const [{ local }, supabase] = await Promise.all([getAmbito(), createClient()])
  // lo que aún no está registrado (pendiente u observado), de todas las fechas
  let q = supabase.from('v_registro_compras')
    .select('id, numero, fecha_entrega, local_codigo, sin_orden, cotizacion_id, tipo_documento, numero_documento, total_documento, total_compra, proveedor, estado_contable, observacion, compra_documento(tipo, estado, numero, fecha, monto, medio, nota, archivo_path, archivo_nombre, archivo_mime)')
    .neq('estado_contable', 'registrado')
  if (local) q = q.eq('local_id', local.id)
  const { data } = await q.order('fecha_entrega').limit(500)
  const filas = (data ?? []) as Fila[]

  const observadas = filas.filter((f) => f.estado_contable === 'observado')
  const pendientes = filas.filter((f) => f.estado_contable === 'pendiente')
  const sinValido = pendientes.filter((f) => !f.tipo_documento || SIN_COMPROBANTE_VALIDO.has(f.tipo_documento))
  const incompletas = filas.filter((f) => {
    const a = avanceCarpeta(carpetaDeCompra({ ...f, estado: 'recibida', cotizacion: f.cotizacion_id ? { id: f.cotizacion_id, numero: '' } : null, contable: null }, f.compra_documento))
    return a.listos < a.total
  })

  return (
    <>
      <PageHeader title="Contabilidad" description={<>Registro de compras{local ? <> · <b className="text-ink-900">{local.nombre}</b></> : ' · ambos negocios'}</>}
        actions={<LinkButton href="/carpetas"><FolderOpen className="size-4" /> Carpetas de compra</LinkButton>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Comprobantes por registrar" value={pendientes.length} tone={pendientes.length ? 'warn' : 'good'} hint="Compras que ya llegaron" />
        <Stat label="Observados" value={observadas.length} tone={observadas.length ? 'bad' : 'default'} hint="Esperan corrección de Logística" />
        <Stat label="Sin comprobante válido" value={sinValido.length} tone={sinValido.length ? 'bad' : 'default'} hint="Nota de venta o sin documento" />
        <Stat label="Carpetas incompletas" value={incompletas.length} tone={incompletas.length ? 'warn' : 'default'} hint="Falta guía, pago u otro documento" />
      </div>
      <Section icon={FolderOpen} title="Por registrar u observadas" bodyClassName="p-0">
        {filas.length ? (
          <Table>
            <thead><tr><Th>N°</Th><Th>Llegó</Th><Th>Negocio</Th><Th>Proveedor</Th><Th>Comprobante</Th><Th right>Total</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {filas.slice(0, 50).map((f) => (
                <tr key={f.id} className="hover:bg-canvas/60">
                  <Td><Link href={`/compras/${f.id}`} className="enlace whitespace-nowrap">{f.numero}</Link></Td>
                  <Td className="tabular">{fmtDate(f.fecha_entrega)}</Td>
                  <Td><LocalBadge codigo={f.local_codigo} /></Td>
                  <Td>{f.proveedor ?? '—'}</Td>
                  <Td className="text-xs">{nombreComprobante(f.tipo_documento) ?? '—'} {f.numero_documento}
                    {(!f.tipo_documento || SIN_COMPROBANTE_VALIDO.has(f.tipo_documento)) && <span className="block"><Badge tone="red">Sin comprobante válido</Badge></span>}</Td>
                  <Td right className="font-semibold">{fmtSoles(f.total_documento ?? f.total_compra)}</Td>
                  <Td>{f.estado_contable === 'observado'
                    ? <><Badge tone="red">Observado</Badge>{f.observacion && <span className="mt-0.5 block max-w-56 text-xs text-muted">{f.observacion}</span>}</>
                    : <Badge tone="amber">Por registrar</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="Todo registrado" description="No hay comprobantes pendientes." />}
      </Section>
    </>
  )
}
