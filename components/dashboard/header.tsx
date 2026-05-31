'use client'

import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { NotificationBell } from '@/components/support/NotificationBell'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <GlobalLanguageBar />
        <NotificationBell />
      </div>
    </header>
  )
}
