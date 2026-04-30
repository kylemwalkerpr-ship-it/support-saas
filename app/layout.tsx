import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'

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
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  )
}
