import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerChatWidget } from '@/components/chat/customer-chat-widget'
import { TranslationProvider } from '@/components/translation-provider'

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
  'pk_live_Y2xlcmsucG9ydGFsLnlvdXNhZmVjb25zdWx0YW5jeS5jb20k'

export const metadata = {
  metadataBase: new URL('https://support.yousafeconsultancy.com'),
  title: 'YouSafe Support',
  description: 'Customer support inbox and live chat management for YouSafe Consultancy.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
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
