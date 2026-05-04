import Link from 'next/link'
import { ArrowRight, Users, MessagesSquare, Shield } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: '#E8E8E8' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-stone-400/40 bg-stone-300/80 backdrop-blur supports-[backdrop-filter]:bg-stone-300/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: '#3C3B6E' }}>
            <span className="text-sm font-bold text-white">Y</span>
          </div>
          <span className="text-lg font-bold" style={{ color: '#1F2937' }}>
            Yousafe <span style={{ color: '#3C3B6E' }}>Consultancy</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 bg-white/80 hover:bg-white transition-colors"
            style={{ color: '#374151' }}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
            style={{ background: '#3C3B6E' }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="px-8 pt-16 pb-24 text-center max-w-4xl mx-auto">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider mb-8 border"
          style={{ color: '#3C3B6E', borderColor: 'rgba(60,59,110,0.25)', background: 'rgba(60,59,110,0.06)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3C3B6E' }} />
          Support Operations Platform
        </div>
        <h1 className="text-5xl font-bold leading-tight mb-6" style={{ color: '#1F2937' }}>
          Student support,<br />
          <span style={{ color: '#3C3B6E' }}>always within reach.</span>
        </h1>
        <p className="text-xl leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: '#4B5563' }}>
          Monitor live website chats, respond to students and visitors, and
          manage your support team from one focused console.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity shadow-lg"
            style={{ background: '#3C3B6E', boxShadow: '0 8px 24px rgba(60,59,110,0.25)' }}
          >
            Start for free <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl border px-8 py-3.5 text-base font-semibold hover:bg-white/60 transition-colors"
            style={{ borderColor: 'rgba(60,59,110,0.4)', color: '#3C3B6E' }}
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="border-t px-8 py-20" style={{ borderColor: '#D1D5DB', background: '#F3F4F6' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-3xl font-bold mb-4" style={{ color: '#1F2937' }}>
            Built for support teams
          </h2>
          <p className="text-center mb-16 max-w-xl mx-auto" style={{ color: '#6B7280' }}>
            A focused workspace for live chat operations and support access control.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: 'Live Chat Inbox',
                description:
                  'See conversations from the website chat bubble, assign requests, reply, and resolve chats.',
                iconColor: '#3C3B6E',
                iconBg: 'rgba(60,59,110,0.1)',
              },
              {
                icon: MessagesSquare,
                title: 'For Support Agents',
                description:
                  'Support members only see the chat console after admin approval.',
                iconColor: '#B22234',
                iconBg: 'rgba(178,34,52,0.1)',
              },
              {
                icon: Shield,
                title: 'For Admins',
                description:
                  'Admins can approve, suspend, reactivate, and remove support agents.',
                iconColor: '#D97706',
                iconBg: 'rgba(217,119,6,0.1)',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border p-8 bg-white shadow-sm hover:shadow-md transition-shadow"
                style={{ borderColor: '#E5E7EB' }}
              >
                <div className="inline-flex rounded-xl p-3 mb-5" style={{ background: f.iconBg }}>
                  <f.icon className="h-6 w-6" style={{ color: f.iconColor }} />
                </div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: '#1F2937' }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 text-center" style={{ borderColor: '#D1D5DB', background: '#E8E8E8' }}>
        <p className="text-sm" style={{ color: '#6B7280' }}>
          &copy; {new Date().getFullYear()} Yousafe Consultancy. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
