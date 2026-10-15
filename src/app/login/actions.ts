'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { inicioDe, panelDe } from '@/lib/panel'

export type LoginState = { error?: string } | undefined

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get('usuario') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/')
  if (!usuario || !password) return { error: 'Ingrese usuario y contraseña.' }

  const supabase = await createClient()
  // Se permite ingresar el nombre de usuario ("Logística Las Flores") o el correo interno
  let email = usuario.includes('@') ? usuario : null
  if (!email) {
    const { data, error } = await supabase.rpc('fn_email_por_usuario', { p_username: usuario })
    if (error) return { error: 'No se pudo conectar con la base de datos. Verifique la configuración.' }
    email = data as string | null
  }
  if (!email) return { error: 'Usuario o contraseña incorrectos.' }

  const { data: sesion, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Usuario o contraseña incorrectos.' }

  // Directo a la pantalla de inicio de su panel (Jefe de área → Requerimientos). Si se pasa por «/» y el
  // layout vuelve a redirigir, el navegador se queda recargando la página en blanco.
  const destino = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  if (destino === '/') {
    const { data: u } = await supabase.from('usuario').select('rol').eq('id', sesion.user.id).maybeSingle()
    redirect(inicioDe(panelDe(u?.rol ?? '')))
  }
  redirect(destino)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
