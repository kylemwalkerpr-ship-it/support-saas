import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

/**
 * Only substantive public content belongs in the Support sitemap. Authentication
 * routes are utility surfaces and are explicitly noindex in their route layouts.
 * Do not synthesize lastModified with the current request time.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]
}
