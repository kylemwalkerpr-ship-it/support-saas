import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const AUTHORIZED_PARTIES = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/avatar(.*)',
  '/api/webhooks(.*)',
  '/api/chat/widget(.*)',
  '/api/translate(.*)',
])

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl
    const { userId } = await auth()

    if (pathname === '/') {
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.nextUrl.origin))
      return NextResponse.next()
    }

    if (isPublicRoute(req)) return NextResponse.next()

    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', req.nextUrl.origin))
    }

    return NextResponse.next()
  },
  {
    authorizedParties: AUTHORIZED_PARTIES.length > 0 ? AUTHORIZED_PARTIES : undefined,
  },
)

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
