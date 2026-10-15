import { getCategorias, getUnidades } from '@/lib/queries'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { ElegirAlmacen } from '@/components/elegir-almacen'
import { PageHeader, Section } from '@/components/ui'
import { ProductoForm } from '../form'
import { AltaConSugerencias } from './alta'

export const metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  const [categorias, unidades, { local, locales }, panel] = await Promise.all([getCategorias(), getUnidades(), getAmbito(), getPanel()])
  const opcUnidades = unidades.map((u) => ({ id: u.id, nombre: u.nombre, productos: u.productos, tipo: u.tipo }))

  if (panel === 'almacen' && local) {
    // se crea en el almacén elegido arriba; con «Todos» (solo consulta) hay que elegir uno
    const sel = await getAlmacenActivo()
    if (soloConsulta(sel) || !sel.actual) return <ElegirAlmacen titulo="Nuevo producto" volver={{ href: '/productos', label: 'Productos' }} />
    return (
      <>
        <PageHeader title={sel.lista.length > 1 ? `Nuevo producto · ${sel.actual.corto}` : 'Nuevo producto'} back={{ href: '/productos', label: 'Productos' }}
          description={`Se registra en ${sel.actual.corto} con el siguiente código de ese almacén. Al escribir el nombre le mostramos los parecidos que ya existen, para no duplicarlo.`} />
        <Section title="Datos del producto"><AltaConSugerencias local={local} categorias={categorias} unidades={opcUnidades} almacenId={sel.actual.id} /></Section>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: '/productos', label: 'Productos' }} />
      <Section title="Datos del producto"><ProductoForm categorias={categorias} unidades={opcUnidades}
        negocios={locales} seleccionados={local ? [local.id] : locales.map((l) => l.id)} /></Section>
    </>
  )
}
