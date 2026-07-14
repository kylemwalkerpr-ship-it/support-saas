import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

/**
 * Support is fully noindex via root layout metadata. Sitemap is empty by
 * design. Do not emit the non-standard `host:` field (estate policy
 * 2026-07-14 — caseworks/marketing apps already omit it).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/dashboard',
        '/onboarding',
        '/_next/static/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
