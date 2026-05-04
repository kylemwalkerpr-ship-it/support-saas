import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/api/webhooks']
const SUPPORT_ONLY_REDIRECTS = ['/client', '/consultant', '/admin/orders']

function hasSession(req: NextRequest): boolean {
  return !!(
    req.cookies.get('__session') ??
    req.cookies.get('__clerk_db_jwt') ??
    req.headers.get('authorization')
  )
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Redirect signed-in users away from landing page
  if (pathname === '/') {
    if (hasSession(req)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (isPublic) return NextResponse.next()

  if (!hasSession(req)) {
    const signIn = new URL('/sign-in', req.url)
    signIn.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signIn)
  }

  if (SUPPORT_ONLY_REDIRECTS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
