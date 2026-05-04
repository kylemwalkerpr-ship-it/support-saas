'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  MessagesSquare,
  LogOut,
  ChevronRight,
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
  support: [
    { label: 'Chat Console', href: '/admin', icon: MessagesSquare },
  ],
  admin: [
    { label: 'Chat Console', href: '/admin', icon: MessagesSquare },
    { label: 'Support Agents', href: '/admin/users', icon: Users },
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
    support: 'bg-white/20 text-white',
    admin: 'bg-amber-400/30 text-amber-200',
  }[role]

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col" style={{ background: '#3C3B6E' }}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#B22234' }}>
          <span className="text-sm font-bold text-white">Y</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Yousafe</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Consultancy</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {roleLabel} Portal
        </p>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
              {active && <ChevronRight className="ml-auto h-4 w-4 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
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
