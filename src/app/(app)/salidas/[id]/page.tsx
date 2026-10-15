import { DetalleMovimiento } from '../../inventario/movimientos/detalle'

export const metadata = { title: 'Salida' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  return <DetalleMovimiento id={id} sentido="salida" imprimir={sp.imprimir === '1'} />
}
