import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

/**
 * The public Support home page is indexable. Authentication routes emit their
 * own noindex metadata and remain crawlable so bots can observe that directive.
 * Private application surfaces stay disallowed.
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
