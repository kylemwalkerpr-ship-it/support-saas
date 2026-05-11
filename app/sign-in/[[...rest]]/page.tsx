'use client'

import { SignIn } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

const appearance = {
  variables: {
    colorPrimary: '#3C3B6E',
    colorText: '#1d2433',
    colorTextSecondary: '#4a4f5b',
    colorBackground: '#ffffff',
    colorInputBackground: '#f7f3ea',
    colorInputText: '#1d2433',
    borderRadius: '0.5rem',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'shadow-none border border-[#d8cdb6] rounded-xl overflow-hidden',
    formButtonPrimary: 'bg-[#3C3B6E] hover:bg-[#2d2a5e] text-white rounded-md',
    footerActionLink: 'text-[#3C3B6E] hover:text-[#B22234]',
  },
}

function safePrevious(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.hostname.endsWith('yousafeconsultancy.com') ? url.toString() : ''
  } catch {
    return ''
  }
}

export default function SignInPage() {
  const [previous, setPrevious] = useState('')

  useEffect(() => {
    setPrevious(safePrevious(document.referrer))
  }, [])

  return (
    <div
      className="relative grid min-h-screen items-center gap-8 overflow-hidden bg-[#f3eee5] p-4 text-[#1d2433] md:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] md:p-10"
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_0%_0%,rgba(178,34,52,.08)_0%,transparent_36%),radial-gradient(circle_at_100%_0%,rgba(60,59,110,.10)_0%,transparent_40%),radial-gradient(circle_at_50%_100%,rgba(135,168,106,.12)_0%,transparent_46%)]" />
      <section className="relative mx-auto w-full max-w-xl">
        <a href="https://yousafeconsultancy.com" className="inline-flex items-center gap-3 text-sm font-semibold text-[#1d2433] no-underline">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#3C3B6E] font-serif text-lg text-white">Y</span>
          YouSafe Support
        </a>
        <p className="mt-10 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4f5b]">Support workspace</p>
        <h1 className="mt-3 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">Welcome back.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#4a4f5b]">
          Sign in to manage live support conversations, AI handoffs, queue health, and customer follow-up.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 text-sm">
          <a href={previous || 'https://yousafeconsultancy.com'} className="rounded-md border border-[#d8cdb6] bg-white px-4 py-2 font-semibold text-[#1d2433] shadow-sm no-underline">
            Back to previous page
          </a>
        </div>
      </section>
      <section className="relative mx-auto w-full max-w-md">
        <SignIn
          forceRedirectUrl="/dashboard"
          signUpUrl="/sign-up"
          appearance={appearance}
        />
      </section>
    </div>
  )
}
