import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { CustomerChatWidget } from '@/components/chat/customer-chat-widget'

export const metadata = {
  title: 'Yousafe Consultancy',
  description: 'Professional consultancy services platform',
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
