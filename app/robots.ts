import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

const PRIVATE_DISALLOW = [
  '/api/',
  '/admin',
  '/audit',
  '/dashboard',
  '/disputes',
  '/inbox',
  '/inquiries',
  '/macros',
  '/metrics',
  '/moderation',
  '/onboarding',
  '/orders',
  '/settings',
  '/users',
  '/verifications',
]

const PUBLIC_AI_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
  'Claude-SearchBot',
  'ClaudeBot',
]

/**
 * The Support landing page is public and indexable. Authentication routes emit
 * their own noindex metadata so crawlers can observe that directive. Signed-in
 * application surfaces stay disallowed. Public Next assets remain crawlable.
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
        userAgent: PUBLIC_AI_CRAWLERS,
        ...publicRule,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
