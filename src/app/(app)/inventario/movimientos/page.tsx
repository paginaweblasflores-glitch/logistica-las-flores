import { redirect } from 'next/navigation'

/** Entradas y salidas ahora van por separado, cada una con su historial. */
export default function MovimientosPage() {
  redirect('/salidas')
}
