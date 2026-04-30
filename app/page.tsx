import Link from 'next/link'
import { ArrowRight, CheckCircle, Users, Briefcase, Shield } from 'lucide-react'

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-sm font-bold text-white">Y</span>
          </div>
          <span className="text-lg font-semibold text-white">Yousafe Consultancy</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-slate-300 hover:text-white transition-colors px-4 py-2"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="px-8 pt-20 pb-32 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-300 mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Professional Consultancy Platform
        </div>
        <h1 className="text-5xl font-bold text-white leading-tight mb-6">
          Expert consultancy,<br />
          <span className="text-blue-400">seamlessly managed.</span>
        </h1>
        <p className="text-xl text-slate-400 leading-relaxed mb-10 max-w-2xl mx-auto">
          Connect with specialist consultants, manage projects end-to-end, and
          get expert work delivered — all in one platform.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
          >
            Start for free <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-8 py-3.5 text-base font-semibold text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-slate-800 px-8 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-3xl font-bold text-white mb-4">
            Everything you need
          </h2>
          <p className="text-center text-slate-400 mb-16 max-w-xl mx-auto">
            A complete system for clients, consultants, and administrators.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                icon: Users,
                title: 'For Clients',
                description: 'Browse services, place orders, track progress, and approve delivered work — all from your dashboard.',
                color: 'text-blue-400',
                bg: 'bg-blue-500/10',
              },
              {
                icon: Briefcase,
                title: 'For Consultants',
                description: 'Claim orders that match your expertise, deliver great work, and build your reputation.',
                color: 'text-purple-400',
                bg: 'bg-purple-500/10',
              },
              {
                icon: Shield,
                title: 'For Admins',
                description: 'Full platform oversight — manage users, monitor all orders, and keep everything running smoothly.',
                color: 'text-amber-400',
                bg: 'bg-amber-500/10',
              },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-800/50 p-8">
                <div className={`inline-flex rounded-xl p-3 mb-5 ${f.bg}`}>
                  <f.icon className={`h-6 w-6 ${f.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
