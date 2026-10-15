import { createBrowserClient } from '@supabase/ssr'

/** Cliente de Supabase para componentes de cliente (búsquedas en vivo, subida de archivos). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
