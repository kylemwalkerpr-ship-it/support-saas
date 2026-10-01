import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

const PRIVATE_DISALLOW = ['/api/', '/admin', '/dashboard', '/onboarding']

/**
 * The public Support home page is indexable. Authentication routes emit their
 * own noindex metadata and remain crawlable so bots can observe that directive.
 * Private application surfaces stay disallowed.
 * OAI-SearchBot and ChatGPT-User share the wildcard public allow and the same
 * private exclusions.
 */
export default function robots(): MetadataRoute.Robots {
  const publicRule = {
    allow: '/',
    disallow: PRIVATE_DISALLOW,
  }

  return {
    rules: [
      {
        userAgent: '*',
        ...publicRule,
      },
      {
        userAgent: ['OAI-SearchBot', 'ChatGPT-User'],
        ...publicRule,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
