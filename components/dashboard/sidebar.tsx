'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Briefcase,
  Users,
  Settings,
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
  client: [
    { label: 'Overview', href: '/client', icon: LayoutDashboard },
    { label: 'Services', href: '/client/services', icon: ShoppingCart },
    { label: 'My Orders', href: '/client/orders', icon: ClipboardList },
  ],
  consultant: [
    { label: 'Overview', href: '/consultant', icon: LayoutDashboard },
    { label: 'Available Orders', href: '/consultant/available', icon: Briefcase },
    { label: 'My Work', href: '/consultant/my-orders', icon: ClipboardList },
  ],
  admin: [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'All Orders', href: '/admin/orders', icon: ClipboardList },
    { label: 'Users', href: '/admin/users', icon: Users },
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
    client: 'bg-blue-500/20 text-blue-200',
    consultant: 'bg-purple-500/20 text-purple-200',
    admin: 'bg-amber-500/20 text-amber-200',
  }[role]

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <span className="text-sm font-bold text-white">Y</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Yousafe</p>
          <p className="text-xs text-slate-400">Consultancy</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {active && <ChevronRight className="ml-auto h-4 w-4 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 shrink-0">
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
