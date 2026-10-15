/**
 * Colores de gráficos (compartidos entre servidor y cliente).
 * Paleta categórica validada para daltonismo (orden fijo, nunca rotar):
 *   1 rojo = Restaurante Las Flores · 2 azul = Hotel Umaru · 3 ámbar · 4 violeta.
 * Verde y rojo de estado (cumple / no cumple) se reservan para metas.
 */
export const PALETTE = {
  red: '#C8102E', blue: '#3A6EA5', amber: '#B0770A', violet: '#7A5BB5',
  ink: '#1F2228', gray: '#C5C9CF', grid: '#EEF0F2', leaf: '#4C8C12',
}

/** Color fijo de cada negocio: el mismo en todos los gráficos, badges y selector. */
export const COLOR_LOCAL: Record<string, string> = { LF: PALETTE.red, UM: PALETTE.blue }
export const SERIES = [PALETTE.red, PALETTE.blue, PALETTE.amber, PALETTE.violet]
