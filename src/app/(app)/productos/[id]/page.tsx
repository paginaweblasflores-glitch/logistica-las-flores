import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Image as ImageIcon, Package, Warehouse, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAlmacenes, getCategorias, getUnidades } from '@/lib/queries'
import { getMisLocales, getPanel, getAlmacenActivo, getLocales, soloConsulta } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, Section, Stat, LinkButton } from '@/components/ui'
import { ProductoForm, type Producto } from '../form'
import { ParametrosAlmacen } from './parametros'
import { FotoProducto } from './foto'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Badge } from '@/components/ui'
import { eliminarProducto, bajaProducto } from '../actions'

export const metadata = { title: 'Producto' }

export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // todo lo de la ficha al mismo tiempo (incluida la sesión y si el producto ya tiene historial)
  const [{ data: p }, categorias, unidades, almacenes, { data: stock }, { data: pa }, , locales, { data: pl }, panel, sel, todos, { data: conHistorial }] = await Promise.all([
    supabase.from('producto').select('*').eq('id', id).maybeSingle(),
    getCategorias(), getUnidades(), getAlmacenes(),
    supabase.from('stock').select('almacen_id, cantidad, costo_promedio, valor').eq('producto_id', id),
    supabase.from('producto_almacen').select('almacen_id, codigo, stock_minimo, stock_maximo, stock_objetivo, ubicacion, fecha_vencimiento, dias_aviso_vencimiento').eq('producto_id', id),
    Promise.resolve({ data: null }),   // el precio va abajo: necesita el código maestro y la unidad del producto
    getMisLocales(),
    supabase.from('producto_local').select('local_id, codigo').eq('producto_id', id),
    getPanel(), getAlmacenActivo(), getLocales(),
    supabase.rpc('fn_producto_tiene_historial', { p_producto: id }),
  ])
  if (!p) notFound()
  // último precio y rango: las compras de este producto y de su copia en el otro negocio (misma unidad)
  const { data: est } = await supabase.from('v_precio_estadistica').select('precio_actual, precio_min, precio_max, compras, ultima_compra')
    .eq('maestro_id', p.maestro_id).eq('unidad_id', p.unidad_id).maybeSingle()
  const st = (stock ?? []) as { almacen_id: string; cantidad: number; costo_promedio: number; valor: number }[]
  const total = st.reduce((s, x) => s + Number(x.cantidad), 0)
  const params_ = new Map((pa ?? []).map((x) => [x.almacen_id, x]))
  const almacen = panel === 'almacen'
  const misIds = new Set(locales.map((l) => l.id))
  // El catálogo lo administra el almacén de su negocio; un producto que comparte con el otro negocio no lo edita uno solo
  // Catálogo principal compartido: lo edita cualquier almacén que lo use; los cambios se ven en los dos negocios
  const compartido = (pl ?? []).some((x) => !misIds.has(x.local_id))
  const usadoPorMi = (pl ?? []).some((x) => misIds.has(x.local_id))
  // con «Todos» (solo consulta) la ficha no se edita: se elige arriba el almacén
  const editable = almacen && usadoPorMi && !soloConsulta(sel)
  const otros = compartido ? todos.filter((l) => (pl ?? []).some((x) => x.local_id === l.id && !misIds.has(l.id))).map((l) => l.nombre).join(' y ') : ''
  const tieneHistorial = editable ? conHistorial : true
  const stockMio = st.filter((x) => almacenes.some((a) => a.id === x.almacen_id && misIds.has(String(a.local_id)))).reduce((s, x) => s + Number(x.cantidad), 0)
  // Almacenes del responsable y en cuáles está el producto (Almacén 01 / Almacén 02 — Cocina)
  const enAlmacen = new Set((pa ?? []).map((x) => x.almacen_id))
  // Cada almacén ve y ajusta los parámetros de los almacenes donde está el producto
  const filas = almacenes.filter((a) => !almacen || (misIds.has(String(a.local_id)) && enAlmacen.has(a.id) && sel.lista.some((x) => x.id === a.id))).map((a) => {
    const x = params_.get(a.id), s = st.find((y) => y.almacen_id === a.id)
    return { almacen_id: a.id, nombre: a.nombre, stock: s ? Number(s.cantidad) : null, stock_minimo: x?.stock_minimo?.toString() ?? '', stock_maximo: x?.stock_maximo?.toString() ?? '', stock_objetivo: x?.stock_objetivo?.toString() ?? '', ubicacion: x?.ubicacion ?? '',
      fecha_vencimiento: x?.fecha_vencimiento ?? '', dias_aviso_vencimiento: String(x?.dias_aviso_vencimiento ?? 30) }
  })

  return (
    <>
      <PageHeader title={p.nombre} back={{ href: '/productos', label: 'Productos' }} description={almacen
          // códigos: el de cada almacén (lo que ve el responsable) y el de la maestra del negocio
          ? [...sel.lista.filter((a) => enAlmacen.has(a.id)).map((a) => `Código ${(pa ?? []).find((x) => x.almacen_id === a.id)?.codigo ?? '—'} en ${a.corto}`),
             sel.lista.length > 1 && pl?.find((x) => misIds.has(x.local_id))?.codigo ? `maestra ${pl.find((x) => misIds.has(x.local_id))!.codigo}` : null]
              .filter(Boolean).join(' · ') || 'No está en su almacén'
          : p.codigo}
        actions={<>{!p.activo && <Badge tone="gray">De baja</Badge>}<LinkButton href={`/inventario/kardex?producto=${id}`} variant="outline">Kardex</LinkButton><LinkButton href={`/precios?producto=${id}`} variant="outline">Precios</LinkButton></>} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Stock total" value={fmtQty(total)} hint={`${st.filter((x) => Number(x.cantidad) !== 0).length} almacenes`} />
        <Stat label="Valor" value={fmtSoles(st.reduce((s, x) => s + Number(x.valor), 0))} />
        <Stat label={est ? 'Último precio de compra' : 'Precio inicial'} value={fmtSoles(est?.precio_actual ?? p.costo_referencia)} hint={est ? `${fmtDate(est.ultima_compra)} · ${est.compras} ${est.compras === 1 ? 'compra' : 'compras'} · lo actualiza cada boleta` : 'Aún sin compras: la primera boleta lo actualiza'} />
        <Stat label="Rango de precio" value={est ? `${fmtSoles(est.precio_min)} – ${fmtSoles(est.precio_max)}` : '—'} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_240px]">
        <Section icon={Package} title="Datos del producto">
          <ProductoForm p={p as Producto} categorias={categorias} unidades={[...unidades.map((u) => ({ id: u.id, nombre: u.nombre, productos: u.productos, tipo: u.tipo })),
              // «Por definir» ya no se elige, pero se muestra en los productos que aún la tienen
              ...(unidades.some((u) => u.id === p.unidad_id) ? [] : [{ id: p.unidad_id, nombre: 'Por definir', productos: 0 }])]}
            negocios={locales} seleccionados={(pl ?? []).map((x) => x.local_id)} soloLectura={!editable}
            // cantidad del almacén elegido: se pone una sola vez (null = aún no tiene)
            almacenId={editable && sel.id && enAlmacen.has(sel.id) ? sel.id : null}
            cantidadActual={editable && sel.id && enAlmacen.has(sel.id) ? (st.some((x) => x.almacen_id === sel.id) ? Number(st.find((x) => x.almacen_id === sel.id)!.cantidad) : null) : undefined}
/>
          {!almacen && <p className="mt-3 text-xs text-muted">Solo consulta: el catálogo lo administra el responsable de cada almacén.</p>}
          {almacen && soloConsulta(sel) && <p className="mt-3 text-xs text-muted">Vista de todos sus almacenes: para editar el producto o poner su cantidad, elija arriba el almacén.</p>}
          {almacen && compartido && <p className="mt-3 text-xs text-muted">También lo usa <b>{otros}</b>: si cambia nombre, unidad, categoría o foto, el cambio se ve en los dos negocios. El stock y el mínimo son de cada almacén.</p>}
        </Section>
        <Section icon={ImageIcon} title="Foto">
          {editable ? <FotoProducto productoId={id} url={p.imagen_url ?? null} nombre={p.nombre} />
            : p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} className="mx-auto max-h-48 rounded-lg object-contain" />
            : <p className="text-sm text-muted">Sin foto.</p>}
        </Section>
      </div>
      <Section icon={Warehouse} title="Stock y parámetros por almacén">
        <ParametrosAlmacen productoId={id} filas={filas} soloLectura={!almacen} vencimiento={almacen} />
      </Section>
      {editable && (
        <Section icon={ShieldAlert} title={!p.activo ? 'Producto dado de baja' : compartido ? 'Quitar de mi catálogo' : 'Eliminar o dar de baja'} className="mt-5">
          {p.activo && compartido ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">Si su negocio ya no usa este producto, quítelo de su catálogo: <b>{otros}</b> lo sigue usando y su historial se conserva.
                {stockMio !== 0 && <> Antes su stock debe estar en 0 (hoy: <b>{fmtQty(stockMio)}</b>); regístrelo como salida, ajuste o traspaso.</>}</p>
              <ActionForm action={bajaProducto}><input type="hidden" name="producto_id" value={id} /><input type="hidden" name="activo" value="0" />
                <SubmitButton variant="danger" confirm={`¿Quitar "${p.nombre}" de su catálogo? ${otros} lo seguirá usando.`}>Quitar de mi catálogo</SubmitButton></ActionForm>
            </div>
          ) : !p.activo ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">No aparece en las listas para registrar. Su historial (kardex, compras, precios) se conserva.</p>
              <ActionForm action={bajaProducto}><input type="hidden" name="producto_id" value={id} /><input type="hidden" name="activo" value="1" />
                <SubmitButton variant="outline" confirm="¿Reactivar el producto? Volverá a aparecer en las listas.">Reactivar</SubmitButton></ActionForm>
            </div>
          ) : !tieneHistorial ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">Este producto nunca tuvo movimientos: se puede <b>eliminar</b> del catálogo (por ejemplo, si se creó por error o repetido).</p>
              <ActionForm action={eliminarProducto}><input type="hidden" name="producto_id" value={id} />
                <SubmitButton variant="danger" confirm={`¿Eliminar "${p.nombre}" del catálogo? No se puede deshacer.`}>Eliminar producto</SubmitButton></ActionForm>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">Ya tiene movimientos, así que no se elimina: se <b>da de baja</b> (deja de aparecer y su kardex se conserva).
                {stockMio !== 0 && <> Para darlo de baja su stock debe estar en 0 (hoy: <b>{fmtQty(stockMio)}</b>); regístrelo antes como salida o ajuste.</>}</p>
              <ActionForm action={bajaProducto}><input type="hidden" name="producto_id" value={id} /><input type="hidden" name="activo" value="0" />
                <SubmitButton variant="danger" confirm={`¿Dar de baja "${p.nombre}"? Dejará de aparecer en las listas; su historial se conserva.`}>Dar de baja</SubmitButton></ActionForm>
            </div>
          )}
        </Section>
      )}
    </>
  )
}
