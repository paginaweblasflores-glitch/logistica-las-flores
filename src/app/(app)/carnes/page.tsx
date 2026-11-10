import { redirect } from 'next/navigation'

/** «Carnes y viandas» ahora es el panel de Producción: Logística revisa sus reportes. */
export default function CarnesPage() {
  redirect('/produccion/reportes')
}
