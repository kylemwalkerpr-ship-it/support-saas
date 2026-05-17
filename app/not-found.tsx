import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="mb-3 text-3xl font-bold text-foreground">Page not found</h1>
      <p className="mb-8 text-base leading-relaxed text-muted-foreground">
        We couldn&rsquo;t find that page. It may have moved, or the link may be broken.
      </p>
      <Link
        href="/"
        className="inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  )
}
