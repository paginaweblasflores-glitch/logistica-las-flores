/** Marcas del diagrama, con los colores de su Excel: OK (completado), PRO (en proceso), NO (no se realizó). */
export type Estado = 'ok' | 'proceso' | 'no'
export const ESTILO: Record<Estado, { texto: string; clase: string }> = {
  ok: { texto: 'OK', clase: 'bg-leaf-500 text-white' },
  proceso: { texto: 'PRO', clase: 'bg-amber-400 text-ink-900' },
  no: { texto: 'NO', clase: 'bg-brand-600 text-white' },
}
