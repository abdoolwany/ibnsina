import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const supabaseResponse = await updateSession(request)

  const {
    data: { user },
  } = await (await import('@/lib/supabase/server')).createServerSupabase().then(
    async (supabase) => supabase.auth.getUser()
  )

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/hospital-entry', '/hospital-verifier', '/moh-level1', '/moh-admin']
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
