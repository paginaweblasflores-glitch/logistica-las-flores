import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuario, getLocales } from '@/lib/session'
import { panelDe } from '@/lib/panel'
import { etiquetaNegocio, LOGO_DOC as LOGO } from '@/lib/empresa'
import type { Aprobador } from '@/lib/aprobadores'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { PageHeader, Section, EstadoBadge, Badge, LinkButton, Note } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { PrintButton } from '@/components/print-button'
import { Aprobacion } from './aprobacion'
import { RequerimientoAlmacen, type DetAlm, type CompraAlm } from './almacen'
import { cambiarEstadoRequerimiento, cotizarRequerimiento } from '../actions'

export const metadata = { title: 'Requerimiento' }


export default async function RequerimientoPage({ params }: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  // todo al mismo tiempo (incluida la sesión)
  const [{ data: r }, { data: det }, { data: compras }, { data: cots }, { data: aps }, usuario] = await Promise.all([
    supabase.from('v_requerimiento_resumen').select('*').eq('id', id).maybeSingle(),
    supabase.from('requerimiento_detalle').select('id, producto_id, descripcion, imagen, marca, area_destino, stock_actual, cantidad_solicitada, cantidad_aprobada, precio_estimado, motivo, cantidad_pedida, pedida:unidad_pedido_id(nombre), producto:producto_id(codigo, unidad:unidad_id(codigo), alm:producto_almacen(almacen_id, codigo))').eq('requerimiento_id', id),
    supabase.from('compra').select('id, numero, estado, fecha, tipo_documento, numero_documento, proveedor:proveedor_id(razon_social, ruc), compra_detalle(id, producto_id, agregado, descripcion, unidad_texto, cantidad_solicitada, cantidad_recibida, precio_unitario, producto:producto_id(nombre, unidad:unidad_id(codigo)))').eq('requerimiento_id', id).order('fecha'),
    supabase.from('cotizacion').select('id, numero, estado').eq('requerimiento_id', id),
    supabase.from('requerimiento_aprobador').select('id, nombre, cargo, monto_hasta').eq('activo', true).order('orden'),
    getUsuario(),
  ])
  if (!r) notFound()
  // Requerimiento del ALMACÉN: su propia ficha (sin firmas ni precios; la llegada la registra el almacén en Entradas)
  if (r.origen === 'almacen') {
    return <RequerimientoAlmacen r={r} det={(det ?? []) as unknown as DetAlm[]} compras={(compras ?? []) as unknown as CompraAlm[]}
      cots={cots ?? []} gestiona={panelDe(usuario.rol) === 'logistica'} esAlmacen={panelDe(usuario.rol) === 'almacen'} />
  }
  // el negocio (con su RUC y razón social) ya viene con la sesión
  const loc = (await getLocales()).find((l) => l.id === r.local_id)
  const empresa = loc ? { razon_social: loc.razon_social ?? '', ruc: loc.ruc ?? '' } : undefined
  type D = { id: string; producto_id: string | null; descripcion: string; imagen: string | null; marca: string | null; area_destino: string | null; stock_actual: number | null
    cantidad_solicitada: number; cantidad_aprobada: number | null; precio_estimado: number | null; motivo: string | null
    producto: { codigo: string; unidad: { codigo: string } } | null }
  const lineas = (det ?? []) as unknown as D[]
  const aprobadores = (aps ?? []) as Aprobador[]
  const pendiente = r.estado === 'solicitado' || r.estado === 'en_cotizacion'
  // Aprobar, cotizar, comprar y rechazar es trabajo de Logística; quien solicita solo envía y sigue el estado
  const gestiona = panelDe(usuario.rol) === 'logistica'
  const monto = Number(r.monto_estimado ?? 0)
  // Las 4 firmas de la hoja, en el orden del formato de Fernanda (EJEMPLO DE SOLICITUD.xlsx):
  //   Solicitante | Administradora (Betsy)
  //   Área de Logística (Fernanda) | Gerente (Mijaíl)
  const rango = (a: Aprobador) => (/BETSY/i.test(a.nombre) ? 0 : /FERNANDA/i.test(a.nombre) ? 1 : /MIJA/i.test(a.nombre) ? 2 : 3)
  const firmas = [...aprobadores].sort((a, b) => rango(a) - rango(b))
  // con una cotización repartida puede haber una compra por proveedor
  const vigentes = (compras ?? []).filter((c) => c.estado !== 'anulada')
  const compraVigente = vigentes[0]
  const recibidas = vigentes.filter((c) => c.estado === 'recibida').length
  const comprado = vigentes.length > 0 && ['comprado', 'atendido', 'cerrado'].includes(r.estado)
  type CD = { id: string; descripcion: string | null; unidad_texto: string | null; cantidad_solicitada: number; cantidad_recibida: number | null; precio_unitario: number
    producto: { nombre: string; unidad: { codigo: string } } | null }
  type CC = { id: string; numero: string; fecha: string; tipo_documento: string | null; numero_documento: string | null
    proveedor: { razon_social: string; ruc: string | null } | null; compra_detalle: CD[] }
  const detCompras = vigentes as unknown as CC[]
  const cantComprada = (d: CD) => Number(d.cantidad_recibida ?? d.cantidad_solicitada)
  const totalComprado = detCompras.reduce((s, c) => s + c.compra_detalle.reduce((t, d) => t + cantComprada(d) * Number(d.precio_unitario), 0), 0)
  const DOC: Record<string, string> = { factura: 'Factura', boleta: 'Boleta', guia: 'Guía', ticket: 'Ticket', recibo: 'Recibo', sin_documento: 'Sin documento' }
  const cotVigente = (cots ?? []).find((c) => c.estado !== 'anulada')
  const negocio = etiquetaNegocio({ nombre: loc?.nombre ?? '', ruc: empresa?.ruc, razon_social: empresa?.razon_social })

  return (
    <>
      <PageHeader title={`Requerimiento ${r.numero}`} back={{ href: '/requerimientos', label: 'Requerimientos' }}
        actions={<>
          <EstadoBadge estado={r.estado} />
          {/* antes de aprobar: la hoja para las firmas (Fernanda la lleva a la reunión); ya comprado: con el detalle de la compra */}
          {gestiona && r.estado === 'solicitado' && <PrintButton label="Imprimir" />}
          {comprado && <PrintButton label="Imprimir requerimiento" />}
          {/* Cada paso habilita solo el siguiente; lo anterior queda de solo lectura */}
          {gestiona && r.estado === 'aprobado' && !compraVigente && !cotVigente && <>
            <ActionForm action={cotizarRequerimiento}><input type="hidden" name="id" value={id} />
              <SubmitButton variant="outline" confirm="¿Pasar a cotización? Se crea el cuadro comparativo con los productos aprobados.">Solicitar cotización</SubmitButton></ActionForm>
            <LinkButton href={`/compras/nueva?requerimiento=${id}`}>Generar compra</LinkButton>
            <ActionForm action={cambiarEstadoRequerimiento}><input type="hidden" name="id" value={id} /><input type="hidden" name="estado" value="atendido" />
              <SubmitButton variant="ghost" confirm="¿Marcar como atendido sin compra? Úselo solo si se entregó desde el almacén. Ya no podrá cotizarse ni comprarse.">Atender sin compra</SubmitButton></ActionForm>
          </>}
          {cotVigente && <LinkButton href={`/cotizaciones/${cotVigente.id}`} variant="outline">Ver cotización {cotVigente.numero}</LinkButton>}
          {vigentes.map((c) => <LinkButton key={c.id} href={`/compras/${c.id}`} variant="outline">{vigentes.length > 1 ? 'Compra' : 'Ver compra'} {c.numero}</LinkButton>)}
        </>} />

      {gestiona && r.estado === 'solicitado' && (
        <Section title="Aprobación de Logística" className="no-print mb-5">
          <Aprobacion id={id} aprobadores={aprobadores}
            lineas={lineas.map((l) => ({ id: l.id, descripcion: l.descripcion, imagen: l.imagen, solicitada: Number(l.cantidad_solicitada), precio: l.precio_estimado }))} />
        </Section>
      )}

      <Avance estado={r.estado} cotizacion={!!cotVigente || r.estado === 'en_cotizacion'} />
      {vigentes.length > 1 && r.estado !== 'atendido' && (
        <p className="no-print -mt-2 mb-5 text-sm text-muted">Se compra a {vigentes.length} proveedores: <b>{recibidas} de {vigentes.length} compras recibidas</b>. Pasa a Atendido cuando llegan todas.</p>
      )}
      {!gestiona && pendiente && <div className="no-print mb-4"><Note>Enviado a Logística. Aquí verá cuando se apruebe y qué productos se aprobaron.</Note></div>}

      {/* Documento: Solicitud de requerimiento de bienes y materiales */}
      <section className="documento card print-area p-6 sm:p-8">
        <header className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <Image src={LOGO[loc?.codigo ?? 'LF'] ?? LOGO.LF} alt={loc?.nombre ?? ''} width={150} height={64} priority className="h-16 w-auto object-contain" />
          <div className="text-right">
            <p className="text-sm font-bold tracking-wide uppercase">Solicitud de requerimiento de bienes y materiales</p>
            <p className="text-xs text-muted">{negocio}</p>
            <p className="mt-1 text-lg font-bold">N° {r.numero}</p>
          </div>
        </header>

        <p className="mb-4 text-sm"><b>ÁREA SOLICITANTE:</b> {r.area_nombre ?? '—'} <span className="text-muted">· Prioridad {r.prioridad}{r.fecha_requerida ? ` · requerido para el ${fmtDate(r.fecha_requerida)}` : ''}</span></p>

        <div className="mb-4 grid gap-4 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-line">
            <p className="border-b border-line bg-canvas px-3 py-1.5 text-xs font-bold tracking-wide uppercase">1. Datos de la solicitud</p>
            <dl className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-1 px-3 py-2">
              <dt className="text-muted">Responsable que solicita</dt><dd className="font-semibold">{r.solicitante}{r.cargo_solicitante && <span className="font-normal text-muted"> · {r.cargo_solicitante}</span>}</dd>
              <dt className="text-muted">Fecha y hora</dt><dd>{fmtDate(r.created_at, true)}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-line">
            <p className="border-b border-line bg-canvas px-3 py-1.5 text-xs font-bold tracking-wide uppercase">2. Datos de aprobación</p>
            <dl className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-1 px-3 py-2">
              <dt className="text-muted">Responsable que aprueba</dt><dd className="font-semibold">{r.aprobado_at ? r.aprobado_por : '—'}</dd>
              <dt className="text-muted">Fecha y hora</dt><dd>{fmtDate(r.aprobado_at, true)}</dd>
            </dl>
          </div>
        </div>

        <p className="mb-2 text-xs font-bold tracking-wide uppercase">3. Detalle del requerimiento</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-canvas">
              {['N°', 'Bien / material', 'Imagen referencial', 'Marca', 'Stock actual', 'Cant. solicitada', 'Cant. aprobada', 'Precio est.', 'Motivo / observación', 'Área'].map((h) => (
                <th key={h} className="border border-line px-2 py-1.5 text-left font-semibold">{h}</th>))}
            </tr></thead>
            <tbody>
              {lineas.map((l, i) => {
                const noAprobado = l.cantidad_aprobada !== null && Number(l.cantidad_aprobada) === 0
                return (
                  <tr key={l.id} className={noAprobado ? 'text-muted line-through' : ''}>
                    <td className="border border-line px-2 py-1.5">{i + 1}</td>
                    <td className="border border-line px-2 py-1.5 font-medium">{l.descripcion}{!l.producto_id && <Badge tone="violet" className="no-print ml-1.5">Fuera de catálogo</Badge>}</td>
                    <td className="border border-line px-1 py-1 text-center">{l.imagen && <img src={l.imagen} alt={l.descripcion} className="mx-auto h-16 w-20 object-contain" />}</td>
                    <td className="border border-line px-2 py-1.5">{l.marca ?? ''}</td>
                    <td className="border border-line px-2 py-1.5 text-right tabular">{l.stock_actual === null ? '' : fmtQty(l.stock_actual)}</td>
                    <td className="border border-line px-2 py-1.5 text-right tabular">{fmtQty(l.cantidad_solicitada)} {l.producto?.unidad.codigo ?? ''}</td>
                    <td className="border border-line px-2 py-1.5 text-right font-semibold tabular">{l.cantidad_aprobada === null ? '' : fmtQty(l.cantidad_aprobada)}</td>
                    <td className="border border-line px-2 py-1.5 text-right tabular">{l.precio_estimado ? fmtSoles(l.precio_estimado) : ''}</td>
                    <td className="border border-line px-2 py-1.5">{l.motivo ?? ''}</td>
                    <td className="border border-line px-2 py-1.5">{l.area_destino ?? ''}</td>
                  </tr>
                )
              })}
              <tr><td colSpan={7} className="border border-line px-2 py-1.5 text-right font-semibold">Monto estimado</td><td className="border border-line px-2 py-1.5 text-right font-bold tabular">{fmtSoles(monto)}</td><td colSpan={2} className="border border-line" /></tr>
            </tbody>
          </table>
        </div>
        {r.observacion && <p className="mt-3 text-sm">Observación: {r.observacion}</p>}

        {/* Lo que realmente se compró: proveedor, documento, cantidad y precio de cada compra */}
        {comprado && (
          <>
            <p className="mt-5 mb-2 text-xs font-bold tracking-wide uppercase">4. Detalle de la compra</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="bg-canvas">
                  {['Compra', 'Proveedor', 'Documento', 'Bien / material', 'Cantidad', 'Precio unit.', 'Importe'].map((h) => (
                    <th key={h} className="border border-line px-2 py-1.5 text-left font-semibold">{h}</th>))}
                </tr></thead>
                <tbody>
                  {detCompras.flatMap((c) => c.compra_detalle.map((d, i) => (
                    <tr key={d.id}>
                      {i === 0 && <>
                        <td rowSpan={c.compra_detalle.length} className="border border-line px-2 py-1.5 align-top font-semibold">{c.numero}<span className="block font-normal text-muted">{fmtDate(c.fecha)}</span></td>
                        <td rowSpan={c.compra_detalle.length} className="border border-line px-2 py-1.5 align-top">{c.proveedor?.razon_social ?? '—'}{c.proveedor?.ruc && <span className="block text-muted">RUC {c.proveedor.ruc}</span>}</td>
                        <td rowSpan={c.compra_detalle.length} className="border border-line px-2 py-1.5 align-top">{c.tipo_documento ? DOC[c.tipo_documento] ?? c.tipo_documento : '—'}{c.numero_documento && <span className="block">{c.numero_documento}</span>}</td>
                      </>}
                      <td className="border border-line px-2 py-1.5">{d.producto?.nombre ?? d.descripcion}</td>
                      <td className="border border-line px-2 py-1.5 text-right tabular">{fmtQty(cantComprada(d))} {d.producto?.unidad.codigo ?? d.unidad_texto ?? ''}</td>
                      <td className="border border-line px-2 py-1.5 text-right tabular">{fmtSoles(d.precio_unitario)}</td>
                      <td className="border border-line px-2 py-1.5 text-right tabular">{fmtSoles(cantComprada(d) * Number(d.precio_unitario))}</td>
                    </tr>
                  )))}
                  <tr><td colSpan={6} className="border border-line px-2 py-1.5 text-right font-semibold">Total comprado</td><td className="border border-line px-2 py-1.5 text-right font-bold tabular">{fmtSoles(totalComprado)}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Cuatro firmas (como el formato en Excel). Ya aprobado en el sistema, en el lugar de quien aprobó dice «Aprobado por…» */}
        <div className="firmas mt-10 grid grid-cols-2 gap-x-16 gap-y-10 text-center text-xs">
          <div>
            <div className="mb-1 flex h-20 items-end justify-center">
              {r.firma_solicitante && <img src={r.firma_solicitante} alt="Firma del solicitante" className="max-h-20 max-w-full object-contain" />}
            </div>
            <div className="border-t border-ink-900 pt-2"><b className="block">{r.solicitante}</b>{r.cargo_solicitante ?? `Área ${r.area_nombre ?? ''}`.trim()}</div>
          </div>
          {firmas.map((a) => {
            const aprobo = !!r.aprobado_at && a.id === r.aprobador_id
            return (
              <div key={a.id}>
                <div className="mb-1 flex h-20 items-end justify-center">
                  {aprobo && (
                    <span className="rounded border-2 border-leaf-600 px-3 py-1.5 font-bold tracking-wide text-leaf-600 uppercase">
                      {r.estado === 'rechazado' ? 'Rechazado' : 'Aprobado'} por {a.nombre}
                      <span className="block text-[10px] font-semibold normal-case">{fmtDate(r.aprobado_at, true)}</span>
                    </span>
                  )}
                </div>
                <div className="border-t border-ink-900 pt-2"><b className="block">{a.nombre}</b>{a.cargo}</div>
              </div>
            )
          })}
        </div>

        {(compras?.length || cots?.length) ? (
          <p className="no-print mt-6 text-xs text-muted">Documentos: {cots?.map((c) => <Link key={c.id} href={`/cotizaciones/${c.id}`} className="mr-2 font-semibold text-brand-600">{c.numero}</Link>)}
            {compras?.map((c) => <Link key={c.id} href={`/compras/${c.id}`} className="mr-2 font-semibold text-brand-600">{c.numero}</Link>)}</p>
        ) : null}
      </section>
    </>
  )
}

/** Barra de avance del requerimiento: Solicitado → Aprobado → (Cotización) → Compra → Atendido. */
function Avance({ estado, cotizacion }: { estado: string; cotizacion: boolean }) {
  if (estado === 'rechazado') return <div className="no-print mb-4"><Note tone="warn">Requerimiento <b>rechazado</b>: no se aprobó ningún producto. Solo puede consultarse.</Note></div>
  const pasos = [
    { key: 'solicitado', label: 'Solicitado' },
    { key: 'aprobado', label: 'Aprobado' },
    ...(cotizacion ? [{ key: 'en_cotizacion', label: 'Cotización' }] : []),
    { key: 'comprado', label: 'Compra' },
    { key: 'atendido', label: 'Atendido' },
  ]
  const orden = ['solicitado', 'aprobado', 'en_cotizacion', 'comprado', 'atendido', 'cerrado']
  const actual = orden.indexOf(estado)
  return (
    <ol className="no-print mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
      {pasos.map((p, i) => {
        const idx = orden.indexOf(p.key)
        const hecho = idx < actual || estado === 'atendido' || estado === 'cerrado'
        const ahora = idx === actual && !hecho
        return (
          <li key={p.key} className="flex items-center gap-2">
            {i > 0 && <span className={cn('h-px w-6', hecho || ahora ? 'bg-brand-600' : 'bg-line')} />}
            <span className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1',
              hecho ? 'border-leaf-500/40 bg-leaf-50 text-leaf-600' : ahora ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white text-muted')}>
              {hecho && <Check className="size-3.5" />}{p.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
