import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Cierra la sesión y vuelve al login (usado cuando la cuenta no tiene perfil en el sistema). */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = request.nextUrl.searchParams.get('error') ? `?error=${request.nextUrl.searchParams.get('error')}` : ''
  return NextResponse.redirect(url)
}
