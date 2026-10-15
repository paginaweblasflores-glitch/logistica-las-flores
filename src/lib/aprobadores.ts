/** Aprobadores de requerimientos por monto (Fernanda, Betsy, Mijaíl); topes editables en Configuración. */
export type Aprobador = { id: string; nombre: string; cargo: string; monto_hasta: number | null }

/** Sugerido por monto: el primero (en orden) cuyo tope cubre el monto; el último no tiene tope. */
export function sugerirAprobador(aprobadores: Aprobador[], monto: number) {
  return aprobadores.find((a) => a.monto_hasta === null || monto <= Number(a.monto_hasta)) ?? aprobadores[aprobadores.length - 1]
}
