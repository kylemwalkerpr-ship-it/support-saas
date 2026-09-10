import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support account setup | YouSafe Consultancy',
  robots: { index: false, follow: true },
}

export default function SignUpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
