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
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))
      return NextResponse.next()
    }

    if (isPublicRoute(req)) return NextResponse.next()

    if (!userId) {
      const signIn = new URL('/sign-in', req.url)
      const returnPath = pathname.startsWith('/admin')
        ? '/dashboard'
        : `${pathname}${req.nextUrl.search}`
      signIn.searchParams.set('redirect_url', returnPath)
      return NextResponse.redirect(signIn)
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
