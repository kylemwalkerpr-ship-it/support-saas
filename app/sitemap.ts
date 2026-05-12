import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

const routes = [
  { path: '', priority: 0.7, frequency: 'weekly' },
  { path: '/sign-in', priority: 0.3, frequency: 'monthly' },
  { path: '/sign-up', priority: 0.2, frequency: 'monthly' },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.frequency,
    priority: route.priority,
  }))
}
