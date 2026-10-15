import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, ShoppingCart, TrendingUp, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCiudades, getLocalesOpc } from '@/lib/queries'
import { fmtDate, fmtPct, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Stat, LocalBadge, Badge, EmptyState } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ProveedorForm, type Proveedor } from '../form'
import { agregarContacto } from '../actions'
import { PagedTable } from '@/components/pager'
import { etiquetaTipo } from '@/lib/proveedor-tipo'

export const metadata = { title: 'Proveedor' }

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: p }, { data: compras }, { data: precios }, { data: contactos }, ciudades, locales, { data: ofertas }] = await Promise.all([
    supabase.from('proveedor').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_compra_resumen').select('id, numero, fecha, local_codigo, estado, total, ahorro, on_time, in_full').eq('proveedor_id', id).order('fecha', { ascending: false }).limit(100),
    supabase.from('v_trazabilidad_precios').select('id, producto_id, producto, unidad, fecha, precio, precio_anterior, variacion_pct').eq('proveedor_id', id).order('fecha', { ascending: false }).limit(60),
    supabase.from('proveedor_contacto').select('id, nombre, telefono, email, local:local_id(codigo)').eq('proveedor_id', id),
    getCiudades(), getLocalesOpc(),
    supabase.from('cotizacion_oferta').select('id, cotizacion_id').eq('proveedor_id', id),
  ])
  if (!p) notFound()
  type C = { id: string; numero: string; fecha: string; local_codigo: string; estado: string; total: number; ahorro: number | null; on_time: boolean | null; in_full: boolean | null }
  const cs = (compras ?? []) as C[]
  const validas = cs.filter((c) => c.estado !== 'anulada')
  const total = validas.reduce((s, c) => s + Number(c.total), 0)
  const evaluadas = validas.filter((c) => c.on_time !== null)
  const otif = evaluadas.length ? evaluadas.filter((c) => c.on_time && c.in_full).length / evaluadas.length : null
  // Cotizaciones: en cuántas participó y cuántos productos ganó (se adjudica producto por producto)
  const idsOferta = (ofertas ?? []).map((o) => o.id)
  const cotizo = new Set((ofertas ?? []).map((o) => o.cotizacion_id)).size
  const { count: ganados } = idsOferta.length
    ? await supabase.from('cotizacion_item').select('id', { count: 'exact', head: true }).in('oferta_ganadora_id', idsOferta)
    : { count: 0 }

  return (
    <>
      <PageHeader title={p.razon_social} back={{ href: '/proveedores', label: 'Proveedores' }}
        description={<>{etiquetaTipo(p.tipo)} · {p.subcategoria ?? 'Sin rubro'}{p.ruc ? ` · RUC ${p.ruc}` : ''}{p.es_transportista ? ' · hace fletes' : ''} · <Badge tone={p.activo ? 'green' : 'gray'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Compras" value={validas.length} hint={`Desde ${fmtDate(p.fecha_registro)}`} />
        <Stat label="Monto comprado" value={fmtSoles(total)} />
        <Stat label="Cotizaciones" value={cotizo} hint={cotizo ? `Ganó ${ganados ?? 0} ${ganados === 1 ? 'producto' : 'productos'}` : 'Aún no cotizó'} />
        <Stat label="Ahorro acumulado" value={fmtSoles(validas.reduce((s, c) => s + Number(c.ahorro ?? 0), 0))} />
        <Stat label="OTIF del proveedor" value={fmtPct(otif)} meta={{ valor: otif, meta: 0.95 }} hint={`${evaluadas.length} entregas evaluadas`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Section icon={ShoppingCart} title="Historial de compras" bodyClassName="p-0">
            {cs.length ? (
              <PagedTable head={<tr><Th>N°</Th><Th>Fecha</Th><Th>Negocio</Th><Th right>Total</Th><Th right>Ahorro</Th><Th>Entrega</Th><Th>Estado</Th></tr>}>{cs.map((c) => (
                  <tr key={c.id}><Td><Link href={`/compras/${c.id}`} className="font-semibold text-brand-600">{c.numero}</Link></Td><Td className="tabular">{fmtDate(c.fecha)}</Td>
                    <Td><LocalBadge codigo={c.local_codigo} /></Td><Td right>{fmtSoles(c.total)}</Td><Td right>{fmtSoles(c.ahorro)}</Td>
                    <Td>{c.on_time === null ? '—' : <Badge tone={c.on_time && c.in_full ? 'green' : 'red'}>{c.on_time && c.in_full ? 'OTIF' : 'Fuera'}</Badge>}</Td>
                    <Td><EstadoBadge estado={c.estado} /></Td></tr>
                ))}</PagedTable>
            ) : <EmptyState title="Sin compras registradas" />}
          </Section>
          <Section icon={TrendingUp} title="Historial de precios" bodyClassName="p-0">
            {precios?.length ? (
              <PagedTable head={<tr><Th>Fecha</Th><Th>Producto</Th><Th right>Precio</Th><Th right>Anterior</Th><Th right>Var.</Th></tr>}>{(precios as { id: string; producto_id: string; producto: string; unidad: string; fecha: string; precio: number; precio_anterior: number | null; variacion_pct: number | null }[]).map((h) => (
                  <tr key={h.id}><Td className="tabular">{fmtDate(h.fecha)}</Td><Td><Link href={`/precios?producto=${h.producto_id}`} className="hover:text-brand-600">{h.producto}</Link></Td>
                    <Td right className="font-semibold">{fmtSoles(h.precio)}<span className="text-xs font-normal text-muted"> /{h.unidad}</span></Td><Td right className="text-muted">{fmtSoles(h.precio_anterior)}</Td>
                    <Td right>{h.variacion_pct === null ? '—' : <Badge tone={h.variacion_pct > 0 ? 'red' : 'green'}>{fmtPct(h.variacion_pct)}</Badge>}</Td></tr>
                ))}</PagedTable>
            ) : <EmptyState title="Sin precios registrados" />}
          </Section>
        </div>
        <div className="space-y-5">
          <Section icon={Building2} title="Datos del proveedor"><ProveedorForm p={p as Proveedor} ciudades={ciudades} /></Section>
          <Section icon={Phone} title="Contactos por negocio">
            <ul className="mb-4 space-y-2 text-sm">
              {(contactos as unknown as { id: string; nombre: string | null; telefono: string | null; email: string | null; local: { codigo: string } | null }[] ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span><b>{c.nombre ?? '—'}</b> <span className="text-muted">{c.telefono} {c.email}</span></span><LocalBadge codigo={c.local?.codigo} />
                </li>
              ))}
              {!contactos?.length && <li className="text-muted">Sin contactos adicionales. {p.contacto && <>Contacto principal: <b>{p.contacto}</b> {p.telefono}</>}</li>}
            </ul>
            <ActionForm action={agregarContacto} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="proveedor_id" value={id} />
              <input name="nombre" placeholder="Nombre" className="field" required />
              <input name="telefono" placeholder="Teléfono" className="field" />
              <Select name="local_id" options={locales} placeholder="Ambos negocios" />
              <SubmitButton variant="outline">Agregar contacto</SubmitButton>
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  )
}

