import { redirect } from 'next/navigation'

const ENTRADAS = ['entrada_devolucion', 'ajuste_positivo']

/** Entradas y salidas ahora van por separado: cada una con su formulario y su historial. */
export default async function NuevoMovimientoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  if (tipo && ENTRADAS.includes(tipo)) redirect(`/entradas/nueva?tipo=${tipo}`)
  redirect(tipo ? `/salidas/nueva?tipo=${tipo}` : '/salidas/nueva')
}
