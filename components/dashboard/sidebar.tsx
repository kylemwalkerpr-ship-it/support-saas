'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  MessagesSquare,
  LogOut,
  ChevronRight,
  Settings,
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import { type Role } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const navByRole: Record<Role, NavItem[]> = {
  client: [],
  consultant: [],
  support: [
    { label: 'Support Inbox', href: '/dashboard', icon: MessagesSquare },
    { label: 'Users', href: '/users', icon: Users },
    { label: 'Inquiries', href: '/inquiries', icon: Inbox },
    { label: 'Settings', href: '/settings', icon: Settings },
  ],
  admin: [
    { label: 'Support Inbox', href: '/dashboard', icon: MessagesSquare },
    { label: 'Users', href: '/users', icon: Users },
    { label: 'Support Agents', href: '/admin/users', icon: Users },
    { label: 'Inquiries', href: '/inquiries', icon: Inbox },
    { label: 'Settings', href: '/settings', icon: Settings },
  ],
}

interface SidebarProps {
  role: Role
  userName: string | null
  userEmail: string
  avatarUrl?: string | null
}

export function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const { signOut } = useClerk()
  const navItems = navByRole[role]

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  const roleBadgeColor = {
    client: 'bg-white/20 text-white',
    consultant: 'bg-white/20 text-white',
    support: 'bg-white/20 text-white',
    admin: 'bg-amber-400/30 text-amber-200',
  }[role]

  return (
    <aside className="sticky top-0 z-40 flex max-h-[70vh] w-full flex-col md:fixed md:inset-y-0 md:left-0 md:max-h-none md:w-64" style={{ background: '#3C3B6E' }}>
      {/* Logo */}
      <a
        href="https://yousafeconsultancy.com"
        aria-label="Back to Yousafe Consultancy"
        className="flex h-16 items-center gap-2.5 px-6 no-underline"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'inherit' }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#B22234' }}>
          <span className="text-sm font-bold text-white">Y</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Yousafe</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Consultancy</p>
        </div>
      </a>

      {/* Nav */}
      <nav className="flex flex-1 gap-2 overflow-x-auto px-3 py-3 md:block md:space-y-1 md:overflow-y-auto md:py-4">
        <p className="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wider md:block" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {roleLabel} Portal
        </p>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'text-white'
                  : 'hover:text-white'
              )}
              style={active
                ? { background: '#B22234' }
                : { color: 'rgba(255,255,255,0.65)' }
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {active && <ChevronRight className="ml-auto hidden h-4 w-4 opacity-60 md:block" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="hidden p-3 space-y-1 md:block" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <span className="text-xs font-semibold text-white">
              {(userName ?? userEmail).slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {userName ?? 'User'}
            </p>
            <span className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium', roleBadgeColor)}>
              {roleLabel}
            </span>
          </div>
        </div>
        <button
          onClick={() => signOut({ redirectUrl: '/' })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:text-white"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
