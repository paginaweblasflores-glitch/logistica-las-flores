import { Historial } from '../inventario/movimientos/historial'

export const metadata = { title: 'Entradas' }

export default async function EntradasPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Historial sentido="entrada" params={await searchParams} />
}
