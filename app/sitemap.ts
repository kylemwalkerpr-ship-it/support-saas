import type { MetadataRoute } from 'next'

/**
 * Support is the authenticated members dashboard — every URL is noindex
 * via root layout metadata. Sitemaps should list only indexable URLs, so
 * this one is empty. Ahrefs and GSC flag "noindex page in sitemap" when
 * the homepage is included as a discovery anchor.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
