import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const runtime = 'experimental-edge'

const AUTHORIZED_PARTIES = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Top-level segments that exist in app/ (incl. the (dashboard) route group).
// Anything else has no route: let Next render the branded not-found page with
// a real 404 instead of bouncing anonymous visitors to /sign-in (Phase 6).
// tests/support-known-routes.test.mjs keeps this list in sync with app/.
const KNOWN_TOP_SEGMENTS = new Set([
  'admin', 'api', 'audit', 'dashboard', 'disputes', 'inbox', 'inquiries', 'macros', 'metrics',
  'moderation', 'no-access', 'onboarding', 'orders', 'settings', 'sign-in', 'sign-up', 'users',
  'verifications', 'robots.txt', 'sitemap.xml',
])

function isUnknownPath(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first || first.startsWith('_') || first.startsWith('.')) return false
  return !KNOWN_TOP_SEGMENTS.has(first)
}

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
    if ((req.method === 'GET' || req.method === 'HEAD') && isUnknownPath(pathname)) {
      return NextResponse.next()
    }
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
