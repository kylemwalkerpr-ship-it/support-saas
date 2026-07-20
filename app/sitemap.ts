import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

/**
 * Public routes on the support subdomain. Private auth-gated routes
 * (/dashboard, /admin, /onboarding) are excluded — middleware redirects
 * unauthenticated traffic so crawlers can never reach them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]
}
