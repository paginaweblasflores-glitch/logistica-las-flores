/**
 * Zonas sanitarias del almacén (NTS 142-MINSA/2018/DIGESA y RM 066-2015/MINSA): lo que el almacén físico debe tener
 * separado. Cada categoría pertenece a una zona (se cambia en Configuración). El fiscalizador municipal revisa,
 * por ejemplo, que los productos de limpieza no estén junto a los alimentos.
 */
export type ZonaId = 'alimentos' | 'contacto' | 'quimicos' | 'no_alimentarios'

export const ZONAS: { id: ZonaId; nombre: string; recordatorio: string; color: string; fondo: string }[] = [
  { id: 'alimentos', nombre: 'Alimentos y bebidas', recordatorio: 'Sobre tarimas o estantes, nunca en el piso. Primero lo que vence antes.',
    color: '#2f7a2a', fondo: '#eef6ec' },
  { id: 'contacto', nombre: 'Materiales en contacto con alimentos', recordatorio: 'Limpios y tapados, lejos de los químicos.',
    color: '#285580', fondo: '#edf3f9' },
  { id: 'quimicos', nombre: 'Limpieza y químicos', recordatorio: 'En estante o ambiente aparte: nunca encima ni junto a los alimentos.',
    color: '#b42318', fondo: '#fdf0ef' },
  { id: 'no_alimentarios', nombre: 'No alimentarios', recordatorio: 'Fuera de la zona de alimentos.',
    color: '#57534e', fondo: '#f3f1ee' },
]

/** Una categoría nueva queda sin zona hasta que Logística la asigne en Configuración. */
export const SIN_ZONA = { nombre: 'Sin zona asignada', recordatorio: 'Asigne la zona de estas categorías en Configuración.', color: '#b54708', fondo: '#fef6ee' }

export const zonaDe = (id: string | null | undefined) => ZONAS.find((z) => z.id === id) ?? null
