'use client'

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
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
            Welcome back
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>
            Sign in to your Yousafe account
          </p>
        </div>
        <SignIn
          forceRedirectUrl="/dashboard"
          signUpUrl="/sign-up"
          appearance={{ elements: { rootBox: 'w-full' } }}
        />
      </div>
    </div>
  )
}
