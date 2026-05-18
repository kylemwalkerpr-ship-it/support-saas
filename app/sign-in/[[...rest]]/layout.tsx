import type { Metadata } from "next"
import type { ReactNode } from "react"

// Self-canonical so Screaming Frog stops flagging the page as
// "Canonicalised" against the homepage. The page is already noindex
// via the root layout — this is purely cosmetic for the SF report.
export const metadata: Metadata = {
  alternates: { canonical: "https://support.yousafeconsultancy.com/sign-in" },
}

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children
}
