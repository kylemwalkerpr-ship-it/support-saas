import type { NextConfig } from 'next'

// Site-wide security headers — mirrors the policy across the ecosystem.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy',   value: "frame-ancestors 'self'" },
]

const nextConfig: NextConfig = {
  env: {},
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
}

export default nextConfig
