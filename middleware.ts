import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public paths — no session required
const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/api/webhooks']

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (isPublic) return NextResponse.next()

  // Clerk sets __session when the user is authenticated.
  // Full JWT verification happens in every server component and action via auth().
  const session =
    req.cookies.get('__session') ??
    req.cookies.get('__clerk_db_jwt') ??
    req.headers.get('authorization')

  if (!session) {
    const signIn = new URL('/sign-in', req.url)
    signIn.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
