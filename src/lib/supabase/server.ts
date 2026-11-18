import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Siempre por solicitud (connection): las consultas llevan la sesión del usuario (RLS) y Supabase revisa la hora
 * del token antes de cada una, así que nunca forman parte del marco que se prerenderiza ni de un caché del servidor.
 */
export async function createClient() {
  await connection()
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el proxy ya refresca la sesión.
          }
        },
      },
    },
  )
}
