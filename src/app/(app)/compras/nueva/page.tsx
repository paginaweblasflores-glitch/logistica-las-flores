import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes, getCiudades, getProveedores, getLocalesOpc } from '@/lib/queries'
import { hoyLima } from '@/lib/format'
import { PageHeader, Section, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { etiquetaCanal } from '@/lib/proveedor-tipo'
import { ComboInput } from '@/components/combo-input'
import { ProveedorPicker } from '@/components/proveedor-picker'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import type { Line } from '@/lib/lines'
import { CompraLineas } from './lineas'
import { crearCompra } from '../actions'
import { COMPROBANTES } from '@/lib/documentos'

export const metadata = { title: 'Nueva compra' }

export default async function NuevaCompraPage({ searchParams }: { searchParams: Promise<{ requerimiento?: string; cotizacion?: string; oferta?: string }> }) {
  const { requerimiento, cotizacion, oferta } = await searchParams
  const { local } = await getAmbito()
  const supabase = await createClient()
  const [almacenes, proveedores, ciudades, { data: pagos }] = await Promise.all([
    getAlmacenes(local?.id), getProveedores(), getCiudades(),
    supabase.from('compra').select('forma_pago').not('forma_pago', 'is', null).order('created_at', { ascending: false }).limit(500),
  ])
  // formas de pago: las de siempre y las que ya se escribieron en compras anteriores (p. ej. «Yape»)
  const formasPago = [...new Set(['Transferencia', 'Efectivo', 'Crédito 15 días', 'Crédito 30 días', 'Tarjeta', 'Pago por caja',
    ...(pagos ?? []).map((x) => String(x.forma_pago).trim()).filter(Boolean)])].map((n) => ({ id: n, nombre: n }))
  // El almacén de destino define la empresa que compra (RUC y razón social del negocio)
  const negocios = new Map((await getLocalesOpc()).map((l) => [l.id, l.nombre]))
  const almacenesOpc = almacenes.map((a) => ({ ...a, nombre: `${a.nombre} — ${negocios.get(String(a.local_id)) ?? ''}` }))

  // Precarga desde un requerimiento aprobado
  let inicial: Line[] = []
  let req: { id: string; numero: string } | null = null
  if (requerimiento) {
    const { data } = await supabase.from('requerimiento')
      .select('id, numero, estado, compra(id, numero, estado), requerimiento_detalle(id, producto_id, descripcion, marca, cantidad_solicitada, cantidad_aprobada, precio_estimado, producto:producto_id(unidad:unidad_id(codigo)))')
      .eq('id', requerimiento).maybeSingle()
    // Solo un requerimiento aprobado y sin compra vigente pasa a compra
    const yaComprado = ((data?.compra ?? []) as { id: string; numero: string; estado: string }[]).find((c) => c.estado !== 'anulada')
    if (data && yaComprado) return <Bloqueado texto={`El requerimiento ${data.numero} ya tiene la compra ${yaComprado.numero}.`} href={`/compras/${yaComprado.id}`} />
    if (data && !['aprobado', 'en_cotizacion'].includes(data.estado)) return <Bloqueado texto={`El requerimiento ${data.numero} está "${data.estado}": solo un requerimiento aprobado pasa a compra.`} href={`/requerimientos/${data.id}`} />
    if (data) {
      req = { id: data.id, numero: data.numero }
      type D = { id: string; producto_id: string | null; descripcion: string; marca: string | null; cantidad_solicitada: number; cantidad_aprobada: number | null; precio_estimado: number | null; producto: { unidad: { codigo: string } } | null }
      // Todo lo APROBADO del requerimiento, esté o no en el catálogo; lo no aprobado (0) no se compra
      inicial = ((data.requerimiento_detalle ?? []) as unknown as D[]).filter((d) => d.cantidad_aprobada === null || Number(d.cantidad_aprobada) > 0).map((d) => ({
        producto_id: d.producto_id, requerimiento_detalle_id: d.id,
        descripcion: d.producto_id || !d.marca ? d.descripcion : `${d.descripcion} — ${d.marca}`, unidad: d.producto?.unidad.codigo ?? 'UND',
        cantidad: String(d.cantidad_aprobada ?? d.cantidad_solicitada), precio: d.precio_estimado ? String(d.precio_estimado) : '', fecha_vencimiento: '',
      }))
    }
  }
  // Precarga desde una cotización adjudicada: una compra por cada oferta ganadora (proveedor + forma de compra),
  // solo con los productos que ganó esa oferta y a su precio
  let cot: { id: string; numero: string; oferta: string; proveedor: string; canal: string | null; ciudad: string | null; partes: number } | null = null
  if (cotizacion) {
    const { data } = await supabase.from('cotizacion')
      .select('id, numero, estado, requerimiento:requerimiento_id(id, numero), cotizacion_item(id, producto_id, requerimiento_detalle_id, descripcion, cantidad, oferta_ganadora_id, producto:producto_id(unidad:unidad_id(codigo)))')
      .eq('id', cotizacion).maybeSingle()
    if (data && data.estado !== 'adjudicada') return <Bloqueado texto={`La cotización ${data.numero} aún no está adjudicada.`} href={`/cotizaciones/${data.id}`} />
    if (data) {
      type I = { id: string; producto_id: string | null; requerimiento_detalle_id: string | null; descripcion: string; cantidad: number; oferta_ganadora_id: string | null; producto: { unidad: { codigo: string } } | null }
      const items = (data.cotizacion_item ?? []) as unknown as I[]
      const partes = [...new Set(items.map((i) => i.oferta_ganadora_id).filter(Boolean))] as string[]
      const ofertaId = oferta && partes.includes(oferta) ? oferta : partes.length === 1 ? partes[0] : null
      if (!ofertaId) return <Bloqueado texto={`La cotización ${data.numero} se repartió entre ${partes.length} proveedores: genere cada compra desde la cotización.`} href={`/cotizaciones/${data.id}`} />
      const { data: ya } = await supabase.from('compra').select('id, numero').eq('oferta_id', ofertaId).neq('estado', 'anulada').limit(1)
      if (ya?.length) return <Bloqueado texto={`Esta parte de la cotización ${data.numero} ya tiene la compra ${ya[0].numero}.`} href={`/compras/${ya[0].id}`} />
      const { data: of } = await supabase.from('cotizacion_oferta').select('proveedor_id, canal, proveedor:proveedor_id(tipo), cotizacion_precio(item_id, precio_unitario)').eq('id', ofertaId).single()
      const o = of as unknown as { proveedor_id: string; canal: string | null; proveedor: { tipo: string } | null; cotizacion_precio: { item_id: string; precio_unitario: number }[] }
      // origen sugerido: por internet → "En línea"; en tienda de una cadena o negocio local → Ayacucho (Huamanga)
      const origen = o.canal === 'en_linea' ? 'En línea'
        : o.canal === 'tienda' && ['cadena', 'negocio_local'].includes(o.proveedor?.tipo ?? '') ? 'Ayacucho' : null
      cot = { id: data.id, numero: data.numero, oferta: ofertaId, proveedor: o.proveedor_id, canal: o.canal, partes: partes.length,
        ciudad: ciudades.find((c) => c.nombre === origen)?.id ?? null }
      // la compra queda enlazada al requerimiento de origen (cuando llegan todas sus compras, pasa a Atendido)
      const rq = data.requerimiento as unknown as { id: string; numero: string } | null
      if (rq) req = rq
      const precios = new Map(o.cotizacion_precio.map((p) => [p.item_id, p.precio_unitario]))
      inicial = items.filter((i) => i.oferta_ganadora_id === ofertaId).map((i) => ({
        producto_id: i.producto_id, requerimiento_detalle_id: i.requerimiento_detalle_id, descripcion: i.descripcion, unidad: i.producto?.unidad.codigo ?? 'UND',
        cantidad: String(i.cantidad), precio: precios.has(i.id) ? String(precios.get(i.id)) : '', fecha_vencimiento: '',
      }))
    }
  }
  const principal = almacenes.find((a) => a.tipo === 'almacen')

  return (
    <>
      <PageHeader title="Nueva compra" back={{ href: '/compras', label: 'Compras' }}
        description={cot ? <>Generada desde la cotización <b>{cot.numero}</b>{req ? <> del requerimiento <b>{req.numero}</b></> : null}{cot.canal ? <> · se compra <b>{etiquetaCanal(cot.canal)?.toLowerCase()}</b></> : null}{cot.partes > 1 ? <> · es 1 de las {cot.partes} compras de esta cotización (solo los productos que ganó este proveedor)</> : null}.</> : req ? <>Generada desde el requerimiento <b>{req.numero}</b>.</> : 'Registre proveedor, origen, documento y productos. El precio anterior y la variación se calculan solos.'} />
      <ActionForm action={crearCompra} className="space-y-5">
        {req && <input type="hidden" name="requerimiento_id" value={req.id} />}
        {cot && <><input type="hidden" name="cotizacion_id" value={cot.id} /><input type="hidden" name="oferta_id" value={cot.oferta} /></>}
        <Section title="Productos y datos de la compra">
          {/* orden estándar: productos → datos → observación */}
          <div className="mb-6"><CompraLineas inicial={inicial} /></div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2"><span className="label">Proveedor o tienda</span><ProveedorPicker name="proveedor" proveedores={proveedores} defaultValue={cot?.proveedor} /></div>
            <label><span className="label">Almacén destino *</span><Select name="almacen" options={almacenesOpc} defaultValue={principal?.id} required /></label>
            <label><span className="label">Origen de compra</span><ComboInput name="ciudad" opciones={ciudades} placeholder="Elija o escriba: Cusco, Huancayo…" defaultValue={ciudades.find((x) => x.id === cot?.ciudad)?.nombre} /></label>
            <label><span className="label">Fecha *</span><input type="date" name="fecha" defaultValue={hoyLima()} required className="field" /></label>
            <label><span className="label">Tipo de documento</span>
              <Select name="tipo_documento" options={COMPROBANTES} defaultValue="factura" required />
            </label>
            <label><span className="label">N° documento</span><input name="numero_documento" className="field" placeholder="F001-000123" /></label>
            <label><span className="label">Forma de pago</span>
              <ComboInput name="forma_pago" opciones={formasPago} defaultValue="Transferencia" placeholder="Elija o escriba: Yape…" />
            </label>
            <label><span className="label">Entrega comprometida</span><input type="datetime-local" name="fecha_compromiso" className="field" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Observación <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="observacion" className="field" /></label>
        </Section>
        <Note><b>Pasos:</b> 1) Logística registra la compra y la <b>aprueba</b> (desde ahí corre el plazo de entrega) →
          2) cuando llega la mercadería, el <b>almacén</b> confirma la recepción en la ficha de la compra (fecha, hora y cantidades que llegaron) y entra al stock. El <b>flete</b> (si lo hay) se agrega en la ficha de la compra cuando ocurre, por tramos.</Note>
        <Note>OTIF: se considera <b>a tiempo</b> si se recibe antes de la entrega comprometida (o dentro de las 24 h de aprobada si no hay compromiso) y <b>completa</b> si llegan todas las cantidades pedidas.</Note>
        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton name="accion" value="borrador" variant="outline">Guardar borrador</SubmitButton>
          <SubmitButton name="accion" value="aprobar">Aprobar compra</SubmitButton>
        </div>
      </ActionForm>
    </>
  )
}

/** Paso no disponible: el documento ya avanzó en el flujo (solo puede consultarse). */
function Bloqueado({ texto, href }: { texto: string; href: string }) {
  return (
    <>
      <PageHeader title="Nueva compra" back={{ href: '/compras', label: 'Compras' }} />
      <div className="card flex flex-col items-start gap-3 p-6">
        <p className="text-sm">{texto}</p>
        <a href={href} className="text-sm font-semibold text-brand-600">Ver documento →</a>
      </div>
    </>
  )
}
