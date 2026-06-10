import './globals.css'
import './portal-themes.css'
import type { Viewport } from 'next'
import { headers } from 'next/headers'
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerChatWidget } from '@/components/chat/customer-chat-widget'
import { TranslationProvider } from '@/components/translation-provider'

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
  'pk_live_Y2xlcmsucG9ydGFsLnlvdXNhZmVjb25zdWx0YW5jeS5jb20k'

export const metadata = {
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  metadataBase: new URL('https://support.yousafeconsultancy.com'),
  title: 'YouSafe Support — Customer Service & Live Chat',
  description: 'Customer support inbox and live chat management for YouSafe Consultancy.',
  // Support dashboard is an internal members area — keep it OUT of indexes.
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'YouSafe Support — Customer Service & Live Chat',
    description: 'Support inbox and live chat for YouSafe Consultancy clients.',
    type: 'website',
    siteName: 'YouSafe Support',
    locale: 'en_US',
    url: 'https://support.yousafeconsultancy.com',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouSafe Support — Customer Service & Live Chat',
    description: 'Customer support for YouSafe Consultancy.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B3B78',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  const lang = h.get('x-lang') || 'en'
  return (
    <html lang={lang}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'YouSafe Support',
              url: 'https://support.yousafeconsultancy.com',
            }),
          }}
        />
      </head>
      <body style={{ overflowX: 'hidden' }}>
        <a href="#main" className="yousafe-skip-link">Skip to main content</a>
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
        >
          <TranslationProvider>
            {children}
            <CustomerChatWidget />
          </TranslationProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
