import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support sign in | YouSafe Consultancy',
  robots: { index: false, follow: true },
}

export default function SignInLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
