import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  alternates: { canonical: "https://support.yousafeconsultancy.com/sign-up" },
}

export default function SignUpLayout({ children }: { children: ReactNode }) {
  return children
}
