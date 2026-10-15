import { redirect } from 'next/navigation'

/** La compra con boleta ahora se registra en «Entradas» (cada entrada con su número E-). */
export default function NuevoIngresoPage() {
  redirect('/entradas/nueva?tipo=compra')
}
