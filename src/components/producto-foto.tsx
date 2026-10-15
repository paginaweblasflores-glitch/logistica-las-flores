import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Foto referencial del producto (bucket público "productos"); si no tiene, muestra un ícono. */
export function ProductoFoto({ src, alt = '', size = 'sm', className }: {
  src?: string | null; alt?: string; size?: 'sm' | 'md' | 'lg'; className?: string
}) {
  const dim = size === 'lg' ? 'size-40' : size === 'md' ? 'size-12' : 'size-9'
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white', dim, className)}>
      {src
        ? <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-contain p-0.5" />
        : <Package className={cn('text-subtle', size === 'lg' ? 'size-10' : 'size-4')} aria-hidden />}
    </span>
  )
}
