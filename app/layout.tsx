import './globals.css'
import './portal-themes.css'
import type { Viewport } from 'next'
import { headers } from 'next/headers'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerChatWidget } from '@/components/chat/customer-chat-widget'
import { TranslationProvider } from '@/components/translation-provider'

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
  'pk_live_Y2xlcmsucG9ydGFsLnlvdXNhZmVjb25zdWx0YW5jeS5jb20k'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-FTKZCVNW4B'
const GA_LINKER_DOMAINS = [
  'yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
  'support.yousafeconsultancy.com',
] as const

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
  // The public Support home page is indexable for branded discovery. Auth
  // utility routes define their own noindex metadata; private application
  // routes remain protected by middleware and robots rules.
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
  const gaLinkerDomains = JSON.stringify(GA_LINKER_DOMAINS)

  return (
    <html lang={lang}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              linker: {
                domains: ${gaLinkerDomains},
                accept_incoming: true
              }
            });
          `}
        </Script>
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
