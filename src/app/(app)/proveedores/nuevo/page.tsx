import { getCiudades } from '@/lib/queries'
import { hoyLima } from '@/lib/format'
import { PageHeader } from '@/components/ui'
import { ProveedorForm } from '../form'

export const metadata = { title: 'Nuevo proveedor' }

export default async function NuevoProveedorPage() {
  const ciudades = await getCiudades()
  return (
    <>
      <PageHeader title="Nuevo proveedor" back={{ href: '/proveedores', label: 'Proveedores' }} />
      <ProveedorForm ciudades={ciudades} p={{ fecha_registro: hoyLima(), activo: true }} />
    </>
  )
}
