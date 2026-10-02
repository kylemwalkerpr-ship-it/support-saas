import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support workspace access | YouSafe Consultancy',
  robots: { index: false, follow: false },
}

const PORTAL_DASHBOARD_URL = 'https://portal.yousafeconsultancy.com/dashboard'

/**
 * Terminal page for signed-in people who are not approved support staff.
 * Deliberately static: it never redirects (no sign-in <-> dashboard loop) and
 * never touches the shared profiles table. Support access is granted by an
 * administrator; nobody self-assigns the support role.
 */
export default function NoAccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Use your portal dashboard</h1>
        <p className="text-gray-500 leading-relaxed mb-6">
          This workspace is only for approved YouSafe support staff, and access is granted by an
          administrator. Your account is unchanged; continue in the portal.
        </p>
        <a
          href={PORTAL_DASHBOARD_URL}
          className="inline-flex rounded-lg bg-[#3C3B6E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Open portal dashboard
        </a>
      </div>
    </div>
  )
}
