import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Lee un parámetro de búsqueda (Next 16: searchParams es una Promise ya resuelta en la página). */
export function sp(params: Record<string, string | string[] | undefined>, key: string, fallback = ''): string {
  const v = params[key]
  return (Array.isArray(v) ? v[0] : v) ?? fallback
}

export function toNumber(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export const PAGE_SIZE = 50
