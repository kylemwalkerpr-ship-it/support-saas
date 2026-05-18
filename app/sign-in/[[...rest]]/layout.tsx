import type { Metadata } from "next"
import type { ReactNode } from "react"

// No canonical on noindex pages. Google ignores canonical when noindex
// is set, and emitting one (self or root) makes Screaming Frog flag the
// page as either "Canonicalised" or "Non-Indexable Canonical."
export const metadata: Metadata = {
  alternates: { canonical: null },
}

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children
}
