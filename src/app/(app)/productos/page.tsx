import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { getCategorias } from '@/lib/queries'
import { fmtQty, fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, Badge, LocalBadge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ExportButton } from '@/components/export-button'
import { ProductoFoto } from '@/components/producto-foto'

export const metadata = { title: 'Productos' }

export default async function ProductosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  // sesión (una sola llamada cacheada): negocio, panel y almacén elegido arriba
  const [supabase, { local }, panel, sel] = await Promise.all([createClient(), getAmbito(), getPanel(), getAlmacenActivo()])
  const almacen = panel === 'almacen'
  const { from, to } = paginar(params)
  const q = sp(params, 'q'), tipo = sp(params, 'tipo'), categoria = sp(params, 'categoria'), estado = sp(params, 'estado', 'activos')
  const unidadFiltro = sp(params, 'unidad')
  // Almacén elegido arriba (Todos · Almacén 01 · Almacén 02 — Cocina): la lista muestra sus productos y su stock
  const enAlmacen = almacen && !!sel.id          // un almacén elegido (o el único que tiene): su lista, su código, editable
  const consulta = almacen && soloConsulta(sel)   // «Todos»: solo para ver
  const sinNegocio = sp(params, 'negocio') === 'sin'
  const almIds = sel.id ? [sel.id] : sel.lista.map((a) => a.id)

  // búsqueda: un número = código; si no, cada palabra en el nombre (sin mayúsculas ni tildes, en cualquier orden)
  const palabras = (q ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[,()%_*\\]/g, ' ').split(/\s+/).filter(Boolean)
  const esCodigo = palabras.length === 1 && /^\d+$/.test(palabras[0])

  // Datos del producto que muestra la tabla (con su stock en los almacenes del panel)
  const CAMPOS = `id, codigo, nombre, tipo, marca, costo_referencia, es_perecible, controla_lote, activo, imagen_url,
    unidad:unidad_id(codigo), categoria:categoria_id(nombre), negocios:producto_local(codigo, local:local_id(codigo))
    ${almacen && almIds.length ? ', st:stock(almacen_id, cantidad)' : ''}${unidadFiltro ? ', und:unidad_id!inner(codigo)' : ''}`

  // Orden por código, del más nuevo al más antiguo (483, 482… 1): el del almacén elegido o el de la maestra del negocio.
  // UNA sola consulta: se pagina la tabla que tiene el código y se trae el producto (y su stock) embebido.
  const base = enAlmacen ? 'producto_almacen' : local && !sinNegocio ? 'producto_local' : null
  const listado = async (): Promise<{ data: unknown[]; count: number | null }> => {
    if (base) {
      let o = supabase.from(base).select(`codigo, p:producto_id!inner(${CAMPOS})`, { count: 'exact' })
      o = enAlmacen ? o.eq('almacen_id', sel.id!) : o.eq('local_id', local!.id)
      if (q) {
        if (esCodigo) o = o.eq('codigo', Number(palabras[0]))
        else for (const w of palabras) o = o.ilike('p.nombre_busqueda', `%${w}%`)
      }
      if (tipo) o = o.eq('p.tipo', tipo)
      if (categoria) o = o.eq('p.categoria_id', categoria)
      if (estado !== 'todos') o = o.eq('p.activo', estado === 'activos')
      if (unidadFiltro) o = o.eq('p.und.codigo', unidadFiltro)
      if (almacen && almIds.length) o = o.in('p.st.almacen_id', almIds)
      const r = await o.order('codigo', { ascending: false, nullsFirst: false }).order('producto_id').range(from, to)
      if (r.error) throw r.error
      const filas = (r.data ?? []) as unknown as { codigo: number | null; p: Record<string, unknown> }[]
      return { data: filas.map((f) => ({ ...f.p, en_almacen: enAlmacen ? [{ codigo: f.codigo }] : undefined })), count: r.count }
    }
    // sin negocio elegido (o productos sin negocio): directo sobre el catálogo
    let query = supabase.from('producto').select(CAMPOS, { count: 'exact' })
    if (sinNegocio) query = query.is('negocios', null)
    // ambos negocios: cada producto una sola vez (el maestro; la copia del otro negocio se junta abajo)
    else query = query.eq('es_maestro', true)
    if (q) for (const w of palabras) query = query.ilike('nombre_busqueda', `%${w}%`)
    if (tipo) query = query.eq('tipo', tipo)
    if (categoria) query = query.eq('categoria_id', categoria)
    if (estado !== 'todos') query = query.eq('activo', estado === 'activos')
    if (unidadFiltro) query = query.eq('und.codigo', unidadFiltro)
    if (almacen && almIds.length) query = query.in('st.almacen_id', almIds)
    const r = await query.order('codigo', { ascending: false }).range(from, to)
    if (r.error) throw r.error
    const filas = (r.data ?? []) as unknown as { id: string; negocios: { codigo: number | null; local: { codigo: string } }[] }[]
    if (sinNegocio || !filas.length) return { data: filas, count: r.count }
    // «Se usa en»: los negocios de todas las copias del producto (unidas por el código maestro)
    const { data: copias } = await supabase.from('producto').select('maestro_id, negocios:producto_local(codigo, local:local_id(codigo))')
      .in('maestro_id', filas.map((f) => f.id)).eq('es_maestro', false)
    for (const c of (copias ?? []) as unknown as { maestro_id: string; negocios: { codigo: number | null; local: { codigo: string } }[] }[]) {
      const f = filas.find((x) => x.id === c.maestro_id)
      if (f) f.negocios = [...f.negocios, ...c.negocios.filter((n) => !f.negocios.some((m) => m.local.codigo === n.local.codigo))]
    }
    return { data: filas, count: r.count }
  }

  // Todo lo que pide la pantalla, AL MISMO TIEMPO (un solo viaje de ida y vuelta a la base)
  const [{ data, count }, categorias, { data: resumen }, { count: enEsteAlmacen }, { count: conCantidad }] = await Promise.all([
    listado(),
    getCategorias(),
    supabase.rpc('fn_resumen_productos'),
    // cuántos productos del almacén aún no tienen su cantidad puesta (entrada «Producto nuevo»)
    enAlmacen ? supabase.from('producto_almacen').select('producto_id', { count: 'exact', head: true }).eq('almacen_id', sel.id!) : Promise.resolve({ count: 0 }),
    enAlmacen ? supabase.from('stock').select('producto_id', { count: 'exact', head: true }).eq('almacen_id', sel.id!) : Promise.resolve({ count: 0 }),
  ])
  const sinCantidad = Math.max(0, Number(enEsteAlmacen ?? 0) - Number(conCantidad ?? 0))
  type P = { id: string; codigo: string; nombre: string; tipo: string; marca: string | null; costo_referencia: number
    es_perecible: boolean; controla_lote: boolean; activo: boolean; imagen_url: string | null; unidad: { codigo: string }
    categoria: { nombre: string } | null; negocios: { codigo: number | null; local: { codigo: string } }[]; en_almacen?: { codigo: number | null }[]
    st?: { almacen_id: string; cantidad: number }[] }
  const porId = new Map((data as unknown as P[]).map((p) => [p.id, p]))
  // stock de cada producto: del almacén elegido, o la suma de sus almacenes con «Todos»
  const stockDe = (prod: string) => (porId.get(prod)?.st ?? []).reduce((x, s) => x + Number(s.cantidad), 0)
  // en el almacén elegido: si hay fila de stock, el producto ya tiene su cantidad puesta (bloqueada)
  const tieneStock = new Map(enAlmacen ? (data as unknown as P[]).filter((p) => p.st?.length).map((p) => [p.id, Number(p.st![0].cantidad)]) : [])


  const res = (resumen ?? []) as { local_codigo: string; local_nombre: string; productos: number }[]
  const sin = Number(res.find((r) => r.local_codigo === 'SIN')?.productos ?? 0)
  const stats = almacen ? [{ label: enAlmacen ? `Productos en ${sel.actual?.corto ?? 'su almacén'}` : 'Productos', value: count ?? 0 },
    ...(enAlmacen ? [{ label: 'Sin cantidad aún', value: sinCantidad }] : [])] : [
    ...res.filter((r) => r.local_codigo !== 'SIN').map((r) => ({ label: r.local_codigo === 'LF' ? 'Las Flores' : r.local_codigo === 'UM' ? 'Umaru' : r.local_nombre, value: Number(r.productos) })),
    { label: sinNegocio ? 'Sin negocio' : local ? `Lista de ${local.codigo === 'LF' ? 'Las Flores' : 'Umaru'}` : 'Mostrados', value: count ?? 0 },
  ]

  return (
    <>
      <PageHeader title={almacen ? (sel.actual && sel.lista.length > 1 ? `Productos · ${sel.actual.corto}` : 'Productos de mi almacén') : 'Productos'}
        description={almacen
          ? consulta
            ? 'Vista de todos sus almacenes (solo consulta). Para registrar productos o cantidades, elija arriba el almacén.'
            : 'Productos de este almacén con su propio código. Haga clic en un producto para ver o cambiar sus datos.'
          : 'Catálogo único de productos. Cada producto se marca en el negocio donde se usa; el stock de cada negocio es independiente.'}
        actions={<>
          <ExportButton filename="productos" table="producto" order="nombre" columns={{ codigo: 'Código', nombre: 'Nombre', marca: 'Marca', presentacion: 'Presentación', costo_referencia: 'Último precio de compra', activo: 'Activo' }} />
          {/* Almacén 01 y 02 del mismo responsable: separar qué producto es de cada uno (una sola vez) */}
          {almacen && sel.lista.length > 1 && <LinkButton href="/productos/separar" variant="outline">Separar Almacén 01 / 02</LinkButton>}
          {almacen && !consulta && <LinkButton href="/productos/nuevo"><Plus className="size-4" /> Nuevo producto</LinkButton>}
        </>} />
      {!almacen && sin > 0 && !sinNegocio && (
        <div className="mb-4"><Note>Hay <b>{sin}</b> producto(s) sin negocio asignado: no aparecen en la lista de ningún negocio. <Link href="/productos?negocio=sin" className="font-semibold text-brand-600">Revisarlos</Link></Note></div>
      )}
      <FilterBar>
        <FilterField label="Buscar" className="min-w-60"><input name="q" defaultValue={q} placeholder={enAlmacen ? 'Nombre o código' : 'Nombre del producto'} className="field" /></FilterField>
        <FilterField label="Categoría" className="min-w-56"><Select name="categoria" options={categorias} defaultValue={categoria} placeholder="Todas" /></FilterField>
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} options={[{ id: 'activos', nombre: 'Activos' }, { id: 'inactivos', nombre: 'Inactivos' }, { id: 'todos', nombre: 'Todos' }]} /></FilterField>
        {sinNegocio && <input type="hidden" name="negocio" value="sin" />}
        {unidadFiltro && <input type="hidden" name="unidad" value={unidadFiltro} />}
      </FilterBar>
      <Section icon={Package} title={sinNegocio ? 'Productos sin negocio asignado' : 'Catálogo'} bodyClassName="p-0" stats={stats}
        actions={sinNegocio ? <Link href="/productos" className="text-xs font-semibold text-brand-600">Ver todos</Link> : undefined}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr>{almacen && <Th right>Cód.</Th>}<Th>Producto</Th>{!almacen && <Th>Se usa en</Th>}<Th>Categoría</Th><Th>Unidad</Th>{almacen && <Th right>Cantidad</Th>}<Th right>Último precio</Th></tr></thead>
              <tbody>{(data as unknown as P[]).map((p) => (
                <tr key={p.id} className={p.activo ? 'hover:bg-canvas/60' : 'opacity-50'}>
                  {/* en un almacén: SU código; con «Todos»: el de la maestra del negocio */}
                  {almacen && <Td right className="font-mono text-xs font-semibold tabular">{(enAlmacen ? p.en_almacen?.[0]?.codigo : p.negocios[0]?.codigo) ?? '—'}</Td>}
                  <Td><Link href={`/productos/${p.id}`} className="flex items-center gap-3 hover:text-brand-600"><ProductoFoto src={p.imagen_url} alt={p.nombre} />
                    <span className="min-w-0"><span className="block font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted">{almacen ? p.marca : <>{p.codigo}{p.marca ? ` · ${p.marca}` : ''}</>}</span></span></Link></Td>
                  {!almacen && <Td>{p.negocios.length
                    ? <span className="flex flex-col gap-0.5">{p.negocios.map((n) => <span key={n.local.codigo} className="flex items-center gap-1.5"><LocalBadge codigo={n.local.codigo} /><span className="text-xs text-muted tabular">#{n.codigo}</span></span>)}</span>
                    : <Badge tone="amber">Sin asignar</Badge>}</Td>}
                  <Td className="text-xs">{p.categoria?.nombre ?? '—'}</Td>
                  <Td>{p.unidad.codigo}</Td>
                  {almacen && <Td right className="tabular">{enAlmacen && !tieneStock.has(p.id)
                    ? <span className="text-xs text-subtle" title="Póngala en Editar (una sola vez)">Sin cantidad</span>
                    : <span className={stockDe(p.id) ? 'font-semibold' : 'text-subtle'}>{fmtQty(stockDe(p.id))}</span>}</Td>}
                  <Td right>{fmtSoles(p.costo_referencia)}</Td>
                </tr>
              ))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin productos" action={almacen && !consulta ? <LinkButton href="/productos/nuevo">Registrar producto</LinkButton> : undefined} />}
      </Section>
    </>
  )
}
