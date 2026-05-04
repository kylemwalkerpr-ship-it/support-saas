import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerChatWidget } from '@/components/chat/customer-chat-widget'

export const metadata = {
  metadataBase: new URL('https://support.yousafeconsultancy.com'),
  title: 'YouSafe Support',
  description: 'Support and service management for YouSafe Consultancy clients and consultants.',
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
        <ClerkProvider>
          {children}
          <CustomerChatWidget />
        </ClerkProvider>
      </body>
    </html>
  )
}
