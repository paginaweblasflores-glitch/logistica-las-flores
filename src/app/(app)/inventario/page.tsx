import Link from 'next/link'
import { Boxes, ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo } from '@/lib/session'
import { getAlmacenes, getCategorias } from '@/lib/queries'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, EstadoBadge, FilterBar, FilterField, Pagination, EmptyState, LocalBadge, Note, LinkButton } from '@/components/ui'
import { ProductoFoto } from '@/components/producto-foto'
import { Select } from '@/components/select'

export const metadata = { title: 'Stock actual' }

// un solo filtro de estado (antes «Estado» y «Mostrar» por separado; «Exceso» dependía del stock máximo, que ya no se pide)
const ESTADOS = [{ id: 'con_stock', nombre: 'Con stock' }, { id: 'critico', nombre: 'Por reponer' }, { id: 'agotado', nombre: 'Agotado' }, { id: 'normal', nombre: 'Normal' }]

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  // sesión (una sola llamada cacheada): negocio, panel y almacén elegido arriba
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const { from, to } = paginar(params)
  const q = sp(params, 'q'), almacen = sp(params, 'almacen') || sel.id || '', estado = sp(params, 'estado'), categoria = sp(params, 'categoria')
  // costo y valor del inventario: solo Logística. El almacén trabaja con cantidades; sus precios reales están en Entradas
  const conCosto = panel !== 'almacen'

  let query = supabase.from('v_stock')
    .select('producto_id, almacen_id, codigo, codigo_almacen, nombre, producto_tipo, categoria, unidad, local_codigo, almacen_nombre, cantidad, costo_promedio, valor, stock_minimo, stock_maximo, stock_objetivo, estado, ultimo_movimiento, imagen_url', { count: 'exact' })
  if (local) query = query.eq('local_id', local.id)
  if (almacen) query = query.eq('almacen_id', almacen)
  const alerta = sp(params, 'alerta') === '1'   // desde la campanita: por acabarse + agotados con mínimo
  if (alerta && !estado) query = query.in('estado', ['critico', 'agotado']).gt('stock_minimo', 0)
  else if (estado === 'con_stock') query = query.gt('cantidad', 0)
  else if (estado) query = query.eq('estado', estado)
  // la misma categoría que en el Catálogo
  if (categoria) query = query.eq('categoria', categoria)
  if (q) query = query.or(`nombre.ilike.%${q.replace(/[,()]/g, ' ')}%,codigo.ilike.%${q.replace(/[,()]/g, ' ')}%`)
  // la lista, los totales (agregados en la base, sin descargar filas) y los almacenes: al mismo tiempo
  const [{ data, count }, { data: tot }, almacenes, categorias] = await Promise.all([
    query.order('nombre').range(from, to),
    supabase.rpc('fn_stock_totales', { p_local: local?.id ?? null, p_almacen: almacen || null, p_tipo: null }),
    getAlmacenes(local?.id),
    getCategorias(),
  ])
  const valor = Number(tot?.[0]?.valor ?? 0)
  const criticos = Number(tot?.[0]?.criticos ?? 0)

  type Row = { producto_id: string; almacen_id: string; codigo: string; codigo_almacen: number | null; nombre: string; imagen_url: string | null; categoria: string | null; unidad: string; local_codigo: string
    almacen_nombre: string; cantidad: number; costo_promedio: number; valor: number; stock_minimo: number | null; stock_maximo: number | null
    stock_objetivo: number | null; estado: string; ultimo_movimiento: string | null }

  return (
    <>
      {/* entradas y salidas se registran en sus propios módulos */}
      <PageHeader title={`Stock actual${sel.actual ? ` · ${sel.actual.corto}` : ''}`} />

      {alerta && !estado && (
        <div className="mb-4"><Note tone="warn">Mostrando solo los productos que llegaron a su <b>stock mínimo</b> (por acabarse o agotados). El mínimo se cambia en la ficha de cada producto (haga clic en su nombre). <Link href="/inventario" className="enlace">Ver todo el stock</Link></Note></div>
      )}
      <FilterBar>
        {alerta && <input type="hidden" name="alerta" value="1" />}
        <FilterField label="Buscar" className="min-w-60"><input name="q" defaultValue={q} placeholder="Nombre o código" className="field" /></FilterField>
        {!sel.lista.length && <FilterField label="Almacén"><Select name="almacen" options={almacenes} defaultValue={almacen} placeholder="Todos" /></FilterField>}
        <FilterField label="Categoría" className="min-w-56"><Select name="categoria" options={categorias.map((c) => ({ id: c.nombre, nombre: c.nombre }))} defaultValue={categoria} placeholder="Todas" /></FilterField>
        <FilterField label="Estado"><Select name="estado" options={ESTADOS} defaultValue={estado} placeholder="Todos" /></FilterField>
      </FilterBar>
      {conCosto && <p className="-mt-2 mb-3 text-xs text-muted">Costo unit. promedio = promedio de lo que costó cada unidad en todas las compras · Valor total = cantidad × costo promedio. Los precios reales de cada boleta están en <Link href="/precios" className="enlace">Trazabilidad de precios</Link>.</p>}

      <Section icon={Boxes} title="Existencias" bodyClassName="p-0"
        stats={[...(conCosto ? [{ label: 'Valor total', value: fmtSoles(valor) }] : []), { label: 'Registros', value: count ?? 0 }, { label: 'Críticos', value: criticos }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr>
                <Th>Producto</Th><Th>Almacén</Th><Th right>Stock</Th><Th right>Mín.</Th>{conCosto && <><Th right>Costo unit. promedio</Th><Th right>Valor total</Th></>}<Th>Estado</Th><Th>Últ. mov.</Th><Th />
              </tr></thead>
              <tbody>
                {(data as Row[]).map((r) => (
                  <tr key={r.producto_id + r.almacen_id} className="hover:bg-canvas/60">
                    <Td>
                      {/* el nombre abre la ficha del Catálogo: ahí se corrige el nombre, la unidad o el mínimo */}
                      <Link href={`/productos/${r.producto_id}`} title="Abrir la ficha del producto (Catálogo)" className="group flex items-center gap-3">
                        <ProductoFoto src={r.imagen_url} alt={r.nombre} />
                        <span className="min-w-0">
                          <span className="block font-medium group-hover:text-brand-600 group-hover:underline">{r.nombre}</span>
                          <span className="text-xs text-muted">{panel === 'almacen' ? `Cód. ${r.codigo_almacen ?? '—'}` : r.codigo}{r.categoria ? ` · ${r.categoria}` : ''}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td><span className="block">{r.almacen_nombre}</span><LocalBadge codigo={r.local_codigo} /></Td>
                    <Td right className="font-semibold">{fmtQty(r.cantidad)} <span className="text-xs font-normal text-muted">{r.unidad}</span></Td>
                    <Td right className="text-muted">{fmtQty(r.stock_minimo)}</Td>
                    {conCosto && <>
                      <Td right>{fmtSoles(r.costo_promedio)}</Td>
                      <Td right className="font-semibold">{fmtSoles(r.valor)}</Td>
                    </>}
                    <Td><EstadoBadge estado={r.estado} /></Td>
                    <Td className="text-xs text-muted tabular">{fmtDate(r.ultimo_movimiento)}</Td>
                    <Td>
                      {/* historial del producto en este almacén (Kardex): qué entró, qué salió y cómo quedó la cantidad */}
                      <Link href={`/inventario/kardex?producto=${r.producto_id}&almacen=${r.almacen_id}`} title="Ver el Kardex de este producto"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs font-semibold whitespace-nowrap text-ink-700 hover:border-brand-600 hover:text-brand-600">
                        <ScrollText className="size-3.5" /> Kardex
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : q || estado || categoria || alerta
          ? <EmptyState title="Sin resultados" description="Ajuste los filtros." />
          : <EmptyState title="Aún no hay stock" description="Registre el stock inicial de cada producto en el Catálogo."
              action={panel === 'almacen' ? <LinkButton href="/productos" variant="outline">Ir al Catálogo</LinkButton> : undefined} />}
      </Section>
    </>
  )
}
