import { DetalleMovimiento } from '../../inventario/movimientos/detalle'

export const metadata = { title: 'Entrada' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  return <DetalleMovimiento id={id} sentido="entrada" imprimir={sp.imprimir === '1'} />
}
