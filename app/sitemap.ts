import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

/**
 * Support is the authenticated members dashboard. Everything is
 * noindex via root layout metadata; the sitemap should list only
 * crawlable, indexable URLs. Since none exist, we ship a minimal
 * homepage entry so search engines have a discovery anchor — they
 * will see it's noindex and respect it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ]
}
