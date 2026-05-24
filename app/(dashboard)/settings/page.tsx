'use client'

import { usePortalTheme } from '@/hooks/usePortalTheme'
import ThemePicker from '@/components/ThemePicker'

export default function SettingsPage() {
  const [theme, applyTheme] = usePortalTheme()

  return (
    <div style={{ padding: '24px 28px 60px', maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Settings</h1>
        <p style={{ fontSize: 14, color: 'var(--portal-ink-soft)', margin: 0 }}>
          Manage your support workspace preferences.
        </p>
      </div>

      <div
        style={{
          background: 'var(--portal-surface)',
          border: '1px solid var(--portal-rule)',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Appearance</h2>
        <p style={{ fontSize: 13, color: 'var(--portal-ink-soft)', margin: '0 0 18px', lineHeight: 1.5 }}>
          Choose your view — your saved theme follows you on every device.
        </p>
        <ThemePicker currentTheme={theme} onChange={applyTheme} />
      </div>
    </div>
  )
}
