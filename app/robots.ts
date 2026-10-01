import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

const PUBLIC_DISALLOW = [
  '/api/',
  '/admin',
  '/dashboard',
  '/onboarding',
  '/_next/static/',
] as const

const NAMED_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
] as const

/**
 * The public Support home page is indexable. Authentication routes emit their
 * own noindex metadata and remain crawlable so bots can observe that directive.
 * Private application surfaces stay disallowed.
 * Named answer-engine crawlers use the same public allow and private exclusions.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PUBLIC_DISALLOW],
      },
      ...NAMED_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: [...PUBLIC_DISALLOW],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
