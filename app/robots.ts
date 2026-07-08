import type { MetadataRoute } from 'next'

const SITE_URL = 'https://support.yousafeconsultancy.com'

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
    host: SITE_URL,
  }
}
