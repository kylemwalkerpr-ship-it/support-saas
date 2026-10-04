import type { NextConfig } from 'next'

// Site-wide security headers — mirrors the policy across the ecosystem.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Phase 5 enforced baseline CSP (https/data/blob only, no plugins, no <base>
  // hijack, no foreign framing, upgrade stray http). Host allowlisting is not
  // enforced because Clerk/Turnstile/GA load from many hosts.
  { key: 'Content-Security-Policy',   value: "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; media-src 'self' data: blob: https:; frame-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https:; frame-ancestors 'self'; upgrade-insecure-requests" },
]

const nextConfig: NextConfig = {
  env: {},
  // Phase 6: do not advertise the framework (X-Powered-By: Next.js).
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
}

export default nextConfig
