import { Historial } from '../inventario/movimientos/historial'

export const metadata = { title: 'Salidas' }

export default async function SalidasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Historial sentido="salida" params={await searchParams} />
}
