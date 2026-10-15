import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPanel, getAlmacenActivo } from '@/lib/session'
import { PageHeader } from '@/components/ui'
import { Separador, type FilaSeparar } from './separador'

export const metadata = { title: 'Separar productos' }

/**
 * El Almacén 01 («arriba») y el Almacén 02 («abajo», cocina) son lugares distintos y no se pasan mercadería:
 * cada producto es de uno u otro. El responsable los separa aquí una sola vez (los que ya tienen cantidad no se mueven).
 */
export default async function SepararPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const [{ desde }, panel, sel, supabase] = await Promise.all([searchParams, getPanel(), getAlmacenActivo(), createClient()])
  if (panel !== 'almacen' || sel.lista.length < 2) redirect('/productos')
  const origen = sel.lista.find((a) => a.id === desde) ?? sel.lista[0]
  const destino = sel.lista.find((a) => a.id !== origen.id)!
  // productos del almacén de origen, con su código y si ya tienen cantidad (esos no se mueven)
  const { data } = await supabase.from('producto_almacen')
    .select('codigo, producto:producto_id!inner(id, nombre, activo, categoria:categoria_id(nombre), st:stock(almacen_id))')
    .eq('almacen_id', origen.id).eq('producto.activo', true).eq('producto.st.almacen_id', origen.id)
    .order('codigo').limit(5000)
  type Row = { codigo: number | null; producto: { id: string; nombre: string; categoria: { nombre: string } | null; st: { almacen_id: string }[] } }
  const filas: FilaSeparar[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.producto.id, codigo: r.codigo, nombre: r.producto.nombre, categoria: r.producto.categoria?.nombre ?? 'Sin categoría', conStock: r.producto.st.length > 0,
  }))
  return (
    <>
      <PageHeader title="Separar productos" back={{ href: '/productos', label: 'Productos' }}
        description="Marque los productos que no son de este almacén y páselos al otro. Se hace una sola vez, antes de poner las cantidades: los que ya tienen cantidad no se mueven." />
      <Separador origen={origen} destino={destino} filas={filas} almacenes={sel.lista} />
    </>
  )
}
