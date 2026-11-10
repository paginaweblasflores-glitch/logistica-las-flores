import Link from 'next/link'
import { Package, Truck } from 'lucide-react'
import { getCatalogoProduccion } from '@/lib/produccion'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Th, Td, Badge } from '@/components/ui'
import { PagedTable } from '@/components/pager'
import { ProductoForm, ProveedorForm } from './forms'

export const metadata = { title: 'Productos y proveedores' }

export default async function ProductosProduccionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const { productos, proveedores } = await getCatalogoProduccion()
  const editarP = productos.find((p) => p.id === sp(params, 'producto'))
  const editarV = proveedores.find((p) => p.id === sp(params, 'proveedor'))

  return (
    <>
      <PageHeader title="Productos y proveedores" />
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <Section icon={Package} title={editarP ? `Editar ${editarP.nombre}` : 'Nuevo producto'}>
            <ProductoForm key={editarP?.id ?? 'nuevo'} p={editarP} />
          </Section>
          <Section title="Productos" bodyClassName="p-0" stats={[{ label: 'Productos', value: productos.length }]}>
            <PagedTable head={<tr><Th>Producto</Th><Th>Tipo</Th><Th>Unidad</Th><Th>Detalle</Th><Th /></tr>}>
              {productos.map((p) => (
                <tr key={p.id} className={p.activo ? undefined : 'opacity-50'}>
                  <Td className="font-medium">{p.nombre}</Td>
                  <Td>{p.tipo === 'kardex' ? <Badge tone="amber">Kardex</Badge> : <Badge>Compra</Badge>}</Td>
                  <Td>{p.unidad === 'KG' ? 'Kilos' : 'Unidad'}{p.usa_sacos && ' · sacos'}</Td>
                  <Td className="text-xs text-muted">{[p.porcion && `en ${p.porcion}`, p.gramos_porcion && `${Number(p.gramos_porcion)} g c/u`, p.hueso_grasa && 'hueso y grasa', p.merma && 'merma', !p.activo && 'ya no se usa'].filter(Boolean).join(' · ') || '—'}</Td>
                  <Td><Link href={`?producto=${p.id}`} className="text-xs font-semibold text-brand-600">Editar</Link></Td>
                </tr>
              ))}
            </PagedTable>
          </Section>
        </div>
        <div className="space-y-5">
          <Section icon={Truck} title={editarV ? `Editar ${editarV.nombre}` : 'Nuevo proveedor'}>
            <ProveedorForm key={editarV?.id ?? 'nuevo'} p={editarV} />
          </Section>
          <Section title="Proveedores" bodyClassName="p-0" stats={[{ label: 'Proveedores', value: proveedores.length }]}>
            <PagedTable head={<tr><Th>Proveedor</Th><Th>Teléfono</Th><Th /></tr>}
              empty="Aún no hay proveedores. También se registran solos al escribirlos en un ingreso.">
              {proveedores.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.nombre}</Td>
                  <Td className="tabular">{p.telefono ?? '—'}</Td>
                  <Td><Link href={`?proveedor=${p.id}`} className="text-xs font-semibold text-brand-600">Editar</Link></Td>
                </tr>
              ))}
            </PagedTable>
          </Section>
        </div>
      </div>
    </>
  )
}
