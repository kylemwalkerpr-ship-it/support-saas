'use client'

import { SignUp } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

const PORTAL_SIGN_UP_URL = 'https://portal.yousafeconsultancy.com/sign-up/student'

export default function SignUpPage() {
  const [hasTicket, setHasTicket] = useState<boolean | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ticket = params.get('__clerk_ticket')
    if (!ticket) {
      window.location.replace(PORTAL_SIGN_UP_URL)
      return
    }
    setHasTicket(true)
  }, [])

  if (hasTicket !== true) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: '#E8E8E8', color: '#1F2937' }}
      >
        Redirecting…
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#E8E8E8' }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4"
            style={{ background: '#3C3B6E' }}
          >
            <span className="text-xl font-bold text-white">Y</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1F2937' }}>
            Accept support invite
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>
            Set up your support account to finish accepting your admin invite.
          </p>
        </div>
        <SignUp
          forceRedirectUrl="/dashboard"
          signInUrl="/sign-in"
          unsafeMetadata={{ requestedRole: 'support' }}
          appearance={{ elements: { rootBox: 'w-full' } }}
        />
      </div>
    </div>
  )
}
