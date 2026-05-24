'use client'

import { usePortalTheme } from '@/hooks/usePortalTheme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme] = usePortalTheme()
  return (
    <div data-portal-theme={theme} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
