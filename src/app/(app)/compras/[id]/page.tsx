import Link from 'next/link'
import { ComboInput } from '@/components/combo-input'
import { notFound } from 'next/navigation'
import { ShoppingCart, Truck, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProveedores, getCiudades } from '@/lib/queries'
import { getPanel, getLocales, getAlmacenActivo } from '@/lib/session'
import { etiquetaNegocio } from '@/lib/empresa'
import { fmtDate, fmtPct, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, Badge, Stat, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Recepcion } from './recepcion'
import { ResumenCompra, type FleteResumen } from './resumen'
import { anularCompra, aprobarCompra, agregarTransporte } from '../actions'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Compra' }

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // todo lo de la compra al mismo tiempo (antes eran 4 consultas en fila)
  const [{ data: c }, { data: det }, { data: fletes }, transportistas, ciudades, { data: extra }, panel, locales, almacenSel] = await Promise.all([
    supabase.from('v_compra_resumen').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_compra_detalle').select('id, producto_id, producto, producto_codigo, fuera_de_catalogo, unidad, cantidad_solicitada, cantidad_recibida, precio_unitario, precio_anterior, variacion, variacion_pct, importe, fecha_vencimiento').eq('compra_id', id),
    supabase.from('transporte').select('id, fecha, costo, peso_kg, bultos, documento, destino, transportista, proveedor:transportista_id(razon_social), ciudad:ciudad_origen_id(nombre)').eq('compra_id', id).order('fecha').order('created_at'),
    getProveedores(true), getCiudades(),
    // datos extra de la compra; por línea: el precio de la orden (si la boleta trajo otro) y si el producto controla vencimiento
    supabase.from('compra')
      .select('observacion, fecha_compromiso, recibido_por, motivo_anulacion, requerimiento:requerimiento_id(id, numero, created_at, aprobado_at), cotizacion:cotizacion_id(id, numero), proveedor:proveedor_id(ruc), compra_detalle(id, precio_orden, cantidad_pedida, pedida:unidad_pedido_id(nombre), producto:producto_id(id, controla_lote))').eq('id', id).maybeSingle(),
    getPanel(), getLocales(), getAlmacenActivo(),
  ])
  if (!c) notFound()
  const almacen = panel === 'almacen'
  const negocio = locales.find((l) => l.codigo === c.local_codigo)
  const lineasExtra = ((extra?.compra_detalle ?? []) as unknown as { id: string; precio_orden: number | null; cantidad_pedida: number | null; pedida: { nombre: string } | null; producto: { id: string; controla_lote: boolean } | null }[])
  const ordenDe = new Map(lineasExtra.map((x) => [x.id, x.precio_orden]))
  // lo que pidió el almacén tal cual, si fue en otra unidad (p. ej. 45 Kilo de un producto en sacos)
  const pedidoDe = new Map(lineasExtra.filter((x) => x.cantidad_pedida != null && x.pedida).map((x) => [x.id, x]))
  const { data: receptor } = extra?.recibido_por ? await supabase.from('usuario').select('nombre').eq('id', extra.recibido_por).maybeSingle() : { data: null }

  type Det = { id: string; producto_id: string | null; fuera_de_catalogo: boolean; producto: string; producto_codigo: string; unidad: string; cantidad_solicitada: number; cantidad_recibida: number | null
    precio_unitario: number; precio_anterior: number | null; variacion: number | null; variacion_pct: number | null; importe: number; fecha_vencimiento: string | null }
  const lineas = (det ?? []) as Det[]
  const req = (extra?.requerimiento as unknown as { id: string; numero: string; created_at: string; aprobado_at: string | null } | null)

  // Recibida = cerrada: solo el resumen final (sin editar, sin más tramos, sin anular)
  if (c.estado === 'recibida') {
    return <ResumenCompra c={c} lineas={lineas.map((l) => ({ ...l, precio_orden: ordenDe.get(l.id) ?? null }))} recibidoPor={receptor?.nombre ?? null} id={id} fletes={(fletes ?? []) as unknown as FleteResumen[]} almacen={almacen}
      negocio={negocio ? etiquetaNegocio(negocio) : c.local_codigo} localCodigo={c.local_codigo}
      proveedorRuc={(extra?.proveedor as unknown as { ruc: string | null } | null)?.ruc ?? null}
      requerimiento={req} cotizacion={(extra?.cotizacion as unknown as { id: string; numero: string } | null)}
      fechaCompromiso={extra?.fecha_compromiso ?? null} observacion={extra?.observacion ?? null} />
  }
  const umbral = 0.1
  const esMiAlmacen = almacenSel.lista.length <= 1 || almacenSel.id === c.almacen_id
  const recibida = c.estado === 'recibida'
  const hayCatalogo = lineas.some((l) => l.producto_id)
  const hayVence = lineas.some((l) => l.fecha_vencimiento)
  // productos con «Controlar vencimiento (FIFO)»: al recibir se pide su fecha de vencimiento
  const conLote = new Set(lineasExtra.filter((x) => x.producto?.controla_lote).map((x) => x.producto!.id))

  // Indicadores según el paso: cada uno aparece cuando ya tiene sentido
  const indicadores: React.ReactNode[] = [
    <Stat key="total" label="Total" value={fmtSoles(c.total)} hint={`${c.items} ${Number(c.items) === 1 ? 'producto' : 'productos'}`} />,
  ]
  if (c.estado === 'borrador') {
    indicadores.push(<Stat key="sig" label="Siguiente paso" value="Aprobar" hint={extra?.fecha_compromiso ? `Entrega comprometida ${fmtDate(extra.fecha_compromiso, true)}` : 'El plazo de entrega empieza al aprobar'} />)
  }
  if (c.estado === 'aprobada') {
    indicadores.push(<Stat key="plazo" label="Debe llegar" value={fmtDate(c.fecha_objetivo, true)} hint={c.solo_fuera_catalogo ? 'Registre la llegada cuando llegue' : 'Lo confirma el almacén al llegar'} />)
  }
  if (Number(c.costo_transporte) > 0) {
    indicadores.push(<Stat key="flete" label="Flete" value={fmtSoles(c.costo_transporte)} hint={`Costo total ${fmtSoles(c.costo_total)}`} />)
  }
  if (Number(c.base_comparable) > 0) {
    indicadores.push(<Stat key="ahorro" label="Ahorro vs. compra anterior" value={fmtSoles(c.ahorro)} tone={Number(c.ahorro) > 0 ? 'good' : Number(c.ahorro) < 0 ? 'bad' : 'default'}
      hint={fmtPct(Number(c.ahorro) / Number(c.base_comparable))} />)
  }
  if (recibida) {
    indicadores.push(
      <Stat key="ot" label="Entrega" value={c.on_time === null ? '—' : c.on_time ? 'A tiempo' : 'Fuera de plazo'} tone={c.on_time === null ? 'default' : c.on_time ? 'good' : 'bad'}
        hint={`${fmtDate(c.fecha_entrega, true)} · ${c.horas_entrega ?? '—'} h desde aprobación`} />,
      <Stat key="if" label="Completa (IF)" value={c.fill_rate === null ? '—' : fmtPct(c.fill_rate)} tone={c.in_full === null ? 'default' : c.in_full ? 'good' : 'warn'} />,
    )
  }

  return (
    <>
      <PageHeader title={`Compra ${c.numero}`} back={{ href: '/compras', label: almacen ? 'Recepción de compras' : 'Compras' }}
        description={<><b className="text-ink-900">{negocio ? etiquetaNegocio(negocio) : c.local_codigo}</b> · {c.proveedor ?? 'Sin proveedor'} · {c.ciudad ?? 'origen no indicado'} · {fmtDate(c.fecha)}{req && <> · Requerimiento <Link className="font-semibold text-brand-600" href={`/requerimientos/${req.id}`}>{req.numero}</Link></>}</>}
        actions={<>
          <EstadoBadge estado={c.estado} />
          {!almacen && c.estado === 'borrador' && (
            <ActionForm action={aprobarCompra}><input type="hidden" name="id" value={id} /><SubmitButton variant="dark" size="sm">Aprobar compra</SubmitButton></ActionForm>
          )}
          {!almacen && (c.estado === 'borrador' || c.estado === 'aprobada') && (
            <ActionForm action={anularCompra}><input type="hidden" name="id" value={id} />
              <SubmitButton variant="danger" size="sm" confirm="¿Anular la compra? Ya no se podrá recibir ni continuar.">Anular</SubmitButton>
            </ActionForm>
          )}
        </>} />

      {c.estado === 'anulada' && (
        <p className="mb-5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <b>Anulada.</b> {extra?.motivo_anulacion ? `Motivo: ${extra.motivo_anulacion}` : 'Se revirtió su efecto en el stock.'}
        </p>
      )}
      <div className={cn('mb-5 grid grid-cols-2 gap-4', indicadores.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>{indicadores}</div>

      <Section icon={ShoppingCart} title="Detalle" className="mb-5" bodyClassName="p-0"
               stats={[{ label: 'Documento', value: `${c.tipo_documento ?? ''} ${c.numero_documento ?? ''}`.trim() || '—' }, { label: 'Pago', value: c.forma_pago ?? '—' }]}>
        <Table>
          <thead><tr><Th>Producto</Th><Th right>Pedido</Th>{recibida && <Th right>Recibido</Th>}<Th right>Precio</Th>
            {hayCatalogo && <><Th right>Precio anterior</Th><Th right>Variación</Th></>}<Th right>Importe</Th>{hayVence && <Th>Vence</Th>}</tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id}>
                <Td>{l.producto_id
                  ? <><Link href={`/precios?producto=${l.producto_id}`} className="font-medium hover:text-brand-600">{l.producto}</Link><span className="block text-xs text-muted">{l.producto_codigo}</span></>
                  : <><span className="font-medium">{l.producto}</span><span className="block"><Badge tone="violet">Fuera de catálogo · no entra al almacén</Badge></span></>}</Td>
                <Td right>{(() => { const pd = pedidoDe.get(l.id); return pd && Number(pd.cantidad_pedida) !== Number(l.cantidad_solicitada)
                  ? <>{fmtQty(pd.cantidad_pedida)} {pd.pedida!.nombre}<span className="block text-[11px] text-muted">= {fmtQty(l.cantidad_solicitada)} {l.unidad}</span></>
                  : <>{fmtQty(l.cantidad_solicitada)} {l.unidad}</> })()}</Td>
                {recibida && <Td right className={l.cantidad_recibida !== null && Number(l.cantidad_recibida) < Number(l.cantidad_solicitada) ? 'text-amber-600' : ''}>{fmtQty(l.cantidad_recibida)}</Td>}
                <Td right className="font-semibold">{fmtSoles(l.precio_unitario)}</Td>
                {hayCatalogo && <>
                  <Td right className="text-muted">{l.producto_id ? fmtSoles(l.precio_anterior) : ''}</Td>
                  <Td right>{l.variacion_pct === null ? (l.producto_id ? '—' : '') : <Badge tone={l.variacion_pct > umbral ? 'red' : l.variacion_pct > 0 ? 'amber' : 'green'}>{l.variacion_pct > 0 ? '▲' : '▼'} {fmtPct(Math.abs(l.variacion_pct))}</Badge>}</Td>
                </>}
                <Td right className="font-semibold">{fmtSoles(l.importe)}</Td>
                {hayVence && <Td className="text-xs">{fmtDate(l.fecha_vencimiento)}</Td>}
              </tr>
            ))}
            <tr><Td colSpan={3 + (recibida ? 1 : 0) + (hayCatalogo ? 2 : 0)} className="text-right font-semibold">Total</Td><Td right className="text-base font-bold">{fmtSoles(c.total)}</Td>{hayVence && <Td />}</tr>
          </tbody>
        </Table>
        {extra?.observacion && <p className="border-t border-line px-5 py-3 text-sm"><span className="text-muted">Observación:</span> {extra.observacion}</p>}
      </Section>

      {/* Llegada: los productos del almacén los recibe el almacén (el elegido arriba); si todo es fuera de catálogo, Logística */}
      {almacen && c.estado === 'aprobada' && !c.solo_fuera_catalogo && !esMiAlmacen && (
        <p className="mb-5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">Esta compra llega a <b>{almacenSel.lista.find((a) => a.id === c.almacen_id)?.corto ?? 'otro almacén'}</b>: elíjalo arriba para registrar la llegada.</p>
      )}
      {almacen && c.estado === 'aprobada' && !c.solo_fuera_catalogo && esMiAlmacen && (
        <div className="mb-5"><Note>Cuando llegue, regístrela en <Link href={`/entradas/nueva?tipo=compra&compra=${id}`} className="font-semibold text-brand-600">Entradas → Compra con boleta</Link>: lo pedido ya viene cargado y usted completa lo de la boleta.</Note></div>
      )}
      {!almacen && c.estado === 'aprobada' && c.solo_fuera_catalogo && (
        <Section icon={PackageCheck} title="Registrar llegada" className="mb-5">
          <Recepcion id={id} alStock={!c.solo_fuera_catalogo} doc={{ tipo: c.tipo_documento, numero: c.numero_documento }}
            lineas={lineas.map((l) => ({ id: l.id, producto: l.producto, unidad: l.unidad, pedido: Number(l.cantidad_solicitada), precio: Number(l.precio_unitario), conVencimiento: conLote.has(l.producto_id ?? '') }))} />
        </Section>
      )}
      {!almacen && c.estado === 'aprobada' && !c.solo_fuera_catalogo && (
        <p className="mb-5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">Pendiente de llegada: la confirma el almacén (fecha, hora y cantidades) cuando llegue la mercadería.</p>
      )}

      {/* Flete opcional y por tramos: se registra después de aprobar, cuando ocurre
          (p. ej. Shalom Lima → agencia Huamanga y luego taxi agencia → local). Si el proveedor entrega en el local, no va nada. */}
      {c.estado !== 'borrador' && (c.estado !== 'anulada' || !!fletes?.length) && (
      <Section icon={Truck} title="Transporte (opcional)" bodyClassName="p-0" stats={[{ label: 'Total flete', value: fmtSoles(c.costo_transporte) }]}>
        {fletes?.length ? (
          <PagedTable head={<tr><Th>Tramo</Th><Th>Fecha</Th><Th>Transportista</Th><Th>Origen → destino</Th><Th>Guía</Th><Th right>Costo</Th></tr>}>
              {(fletes as unknown as { id: string; fecha: string; costo: number; documento: string | null; destino: string | null; transportista: string | null; proveedor: { razon_social: string } | null; ciudad: { nombre: string } | null }[]).map((t, i) => (
                <tr key={t.id}><Td className="tabular">{i + 1}</Td><Td>{fmtDate(t.fecha)}</Td><Td>{t.proveedor?.razon_social ?? t.transportista ?? '—'}</Td>
                  <Td className="text-xs">{t.ciudad?.nombre ?? '—'} → {t.destino ?? '—'}</Td><Td>{t.documento ?? '—'}</Td><Td right className="font-semibold">{fmtSoles(t.costo)}</Td></tr>
              ))}
            </PagedTable>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">Sin flete. Si el proveedor la entrega en el local, no registre nada. Si llega por agencia, registre cada tramo cuando ocurra
            (por ejemplo: Shalom de Lima a la agencia en Huamanga, y luego el taxi de la agencia al local).</p>
        )}
        {!almacen && c.estado !== 'anulada' && (
          <ActionForm action={agregarTransporte} resetOnSuccess className="grid gap-3 border-t border-line p-5 md:grid-cols-6">
            <input type="hidden" name="compra_id" value={id} /><input type="hidden" name="local_id" value={c.local_id} />
            <label className="md:col-span-2"><span className="label">Transportista *</span><ComboInput name="transportista" opciones={transportistas} placeholder="Elija o escriba: Shalom, taxi particular…" /></label>
            <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoyLima()} className="field" /></label>
            <label><span className="label">Desde (ciudad)</span><ComboInput name="ciudad" opciones={ciudades} placeholder="Lima, Ayacucho…" defaultValue={fletes?.length ? '' : ciudades.find((x) => x.id === c.ciudad_id)?.nombre} /></label>
            <label><span className="label">Hasta</span><input name="destino" className="field" placeholder="Agencia Shalom Huamanga, el local…" /></label>
            <label><span className="label">Costo S/ *</span><input type="number" step="0.01" min="0" name="costo" required className="field" /></label>
            <label className="md:col-span-2"><span className="label">Guía / boleta</span><input name="documento" className="field" /></label>
            <div className="flex items-end justify-end md:col-span-4"><SubmitButton variant="outline" size="sm">{fletes?.length ? 'Agregar otro tramo' : 'Agregar flete'}</SubmitButton></div>
          </ActionForm>
        )}
      </Section>
      )}
    </>
  )
}
