import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { getCategorias } from '@/lib/queries'
import { fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, Badge, LocalBadge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ExportButton } from '@/components/export-button'
import { ProductoFoto } from '@/components/producto-foto'
import { TablaPorCategoria } from '@/components/tabla-por-categoria'
import { agruparPorCategoria } from '@/lib/categorias'

export const metadata = { title: 'Catálogo' }

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
      // en el almacén se trae TODO su catálogo (sin páginas) para mostrarlo agrupado por categoría, en orden de código
      const filas: { codigo: number | null; p: Record<string, unknown> }[] = []
      let total: number | null = null
      for (let desde = almacen ? 0 : from; ; desde += 1000) {
        const hasta = almacen ? desde + 999 : to
        const r = await o.order('codigo', { ascending: almacen, nullsFirst: false }).order('producto_id').range(desde, hasta)
        if (r.error) throw r.error
        filas.push(...((r.data ?? []) as unknown as { codigo: number | null; p: Record<string, unknown> }[]))
        total = r.count
        if (!almacen || (r.data ?? []).length < 1000) break
      }
      return { data: filas.map((f) => ({ ...f.p, en_almacen: enAlmacen ? [{ codigo: f.codigo }] : undefined })), count: total }
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
    // el resumen por negocio solo lo usa la vista de Logística
    almacen ? Promise.resolve({ data: null }) : supabase.rpc('fn_resumen_productos'),
    // cuántos productos del almacén aún no tienen su cantidad puesta (entrada «Stock inicial»)
    enAlmacen ? supabase.from('producto_almacen').select('producto_id', { count: 'exact', head: true }).eq('almacen_id', sel.id!) : Promise.resolve({ count: 0 }),
    enAlmacen ? supabase.from('stock').select('producto_id', { count: 'exact', head: true }).eq('almacen_id', sel.id!) : Promise.resolve({ count: 0 }),
  ])
  const sinCantidad = Math.max(0, Number(enEsteAlmacen ?? 0) - Number(conCantidad ?? 0))
  type P = { id: string; codigo: string; nombre: string; tipo: string; marca: string | null; costo_referencia: number
    es_perecible: boolean; controla_lote: boolean; activo: boolean; imagen_url: string | null; unidad: { codigo: string }
    categoria: { nombre: string } | null; negocios: { codigo: number | null; local: { codigo: string } }[]; en_almacen?: { codigo: number | null }[]
    st?: { almacen_id: string; cantidad: number }[] }
  const porId = new Map((data as unknown as P[]).map((p) => [p.id, p]))
  // el Catálogo no muestra cantidades (eso es Inventario): solo si ya se puso el stock inicial (fila de stock = puesto, bloqueado)
  const stockInicialListo = (prod: string) => !!porId.get(prod)?.st?.length


  const res = (resumen ?? []) as { local_codigo: string; local_nombre: string; productos: number }[]
  const sin = Number(res.find((r) => r.local_codigo === 'SIN')?.productos ?? 0)
  const stats = almacen ? [{ label: enAlmacen ? `Productos en ${sel.actual?.corto ?? 'su almacén'}` : 'Productos', value: count ?? 0 },
    ...(enAlmacen ? [{ label: 'Stock inicial pendiente', value: sinCantidad }] : [])] : [
    ...res.filter((r) => r.local_codigo !== 'SIN').map((r) => ({ label: r.local_codigo === 'LF' ? 'Las Flores' : r.local_codigo === 'UM' ? 'Umaru' : r.local_nombre, value: Number(r.productos) })),
    { label: sinNegocio ? 'Sin negocio' : local ? `Lista de ${local.codigo === 'LF' ? 'Las Flores' : 'Umaru'}` : 'Mostrados', value: count ?? 0 },
  ]

  // una fila de la tabla (la misma en la vista agrupada del almacén y en la de páginas)
  const fila = (p: P) => (
                <tr key={p.id} className={p.activo ? 'hover:bg-canvas/60' : 'opacity-50'}>
                  {/* en un almacén: SU código; con «Todos»: el de la maestra del negocio */}
                  {almacen && <Td right className="font-mono text-xs font-semibold tabular">{(enAlmacen ? p.en_almacen?.[0]?.codigo : p.negocios[0]?.codigo) ?? '—'}</Td>}
                  <Td><Link href={`/productos/${p.id}`} className="flex items-center gap-3 hover:text-brand-600"><ProductoFoto src={p.imagen_url} alt={p.nombre} />
                    <span className="min-w-0"><span className="block font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted">{almacen ? p.marca : <>{p.codigo}{p.marca ? ` · ${p.marca}` : ''}</>}</span></span></Link></Td>
                  {!almacen && <Td>{p.negocios.length
                    ? <span className="flex flex-col gap-0.5">{p.negocios.map((n) => <span key={n.local.codigo} className="flex items-center gap-1.5"><LocalBadge codigo={n.local.codigo} /><span className="text-xs text-muted tabular">#{n.codigo}</span></span>)}</span>
                    : <Badge tone="amber">Sin asignar</Badge>}</Td>}
                  {/* agrupado por categoría, la columna repetiría el título del grupo */}
                  {!almacen && <Td className="text-xs">{p.categoria?.nombre ?? '—'}</Td>}
                  <Td>{p.unidad.codigo}</Td>
                  {almacen && <Td>{stockInicialListo(p.id)
                    ? <Badge tone="green">Listo</Badge>
                    : <span title="Se pone una sola vez, en la ficha del producto"><Badge tone="amber">Pendiente</Badge></span>}</Td>}
                  <Td right>{fmtSoles(p.costo_referencia)}</Td>
                </tr>
  )

  return (
    <>
      <PageHeader title={almacen ? (sel.actual && sel.lista.length > 1 ? `Catálogo · ${sel.actual.corto}` : 'Catálogo de mi almacén') : 'Catálogo'}
        actions={<>
          {/* el catálogo del almacén elegido (o de todos sus almacenes con «Todos»), con su código en cada almacén */}
          <ExportButton filename={`catalogo_${(sel.actual?.corto ?? local?.codigo ?? 'todos').replace(/\W+/g, '_')}`} table="v_catalogo_almacen" order="codigo_almacen"
            filters={{ almacen_id: sel.id ?? undefined, local_id: !sel.id ? local?.id : undefined, activo: 'true' }}
            columns={{ ...(sel.id ? {} : { almacen: 'Almacén' }), codigo_almacen: 'Cód.', nombre: 'Producto', categoria: 'Categoría', unidad: 'Unidad', marca: 'Marca',
              costo_referencia: 'Último precio', stock_inicial: 'Stock inicial' }} />
          {almacen && !consulta && <LinkButton href="/productos/nuevo"><Plus className="size-4" /> Nuevo producto</LinkButton>}
        </>} />
      {!almacen && sin > 0 && !sinNegocio && (
        <div className="mb-4"><Note>Hay <b>{sin}</b> producto(s) sin negocio asignado: no aparecen en la lista de ningún negocio. <Link href="/productos?negocio=sin" className="enlace">Revisarlos</Link></Note></div>
      )}
      <FilterBar>
        <FilterField label="Buscar" className="min-w-60"><input name="q" defaultValue={q} placeholder={enAlmacen ? 'Nombre o código' : 'Nombre del producto'} className="field" /></FilterField>
        <FilterField label="Categoría" className="min-w-56"><Select name="categoria" options={categorias} defaultValue={categoria} placeholder="Todas" /></FilterField>
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} options={[{ id: 'activos', nombre: 'Activos' }, { id: 'inactivos', nombre: 'Inactivos' }, { id: 'todos', nombre: 'Todos' }]} /></FilterField>
        {sinNegocio && <input type="hidden" name="negocio" value="sin" />}
        {unidadFiltro && <input type="hidden" name="unidad" value={unidadFiltro} />}
      </FilterBar>
      <Section icon={Package} title={sinNegocio ? 'Productos sin negocio asignado' : 'Productos'} bodyClassName="p-0" stats={stats}
        actions={sinNegocio ? <Link href="/productos" className="text-xs enlace">Ver todos</Link> : undefined}>
        {data?.length ? (
          almacen ? (
            // el almacén ve su catálogo organizado por categoría (cada una se abre y se cierra)
            <TablaPorCategoria columnas={5} head={<tr>{almacen && <Th right>Cód.</Th>}<Th>Producto</Th>{!almacen && <Th>Se usa en</Th>}{!almacen && <Th>Categoría</Th>}<Th>Unidad</Th>{almacen && <Th>Stock inicial</Th>}<Th right>Último precio</Th></tr>}
              grupos={agruparPorCategoria(data as unknown as P[], (p) => p.categoria?.nombre).map(([cat, ps]) => ({
                categoria: cat, cantidad: ps.length, filas: ps.map((p) => fila(p)),
              }))} />
          ) : (
          <>
            <Table>
              <thead><tr>{almacen && <Th right>Cód.</Th>}<Th>Producto</Th>{!almacen && <Th>Se usa en</Th>}{!almacen && <Th>Categoría</Th>}<Th>Unidad</Th>{almacen && <Th>Stock inicial</Th>}<Th right>Último precio</Th></tr></thead>
              <tbody>{(data as unknown as P[]).map((p) => fila(p))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
          )
        ) : <EmptyState title="Sin productos" />}
      </Section>
    </>
  )
}
