import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  alternates: { canonical: null },
}

export default function SignUpLayout({ children }: { children: ReactNode }) {
  return children
}
