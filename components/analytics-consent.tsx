'use client'

/**
 * Estate-wide analytics consent for the Support site.
 *
 * Google Analytics is requested only after the visitor accepts on this banner
 * (or already accepted on another YouSafe site). The choice lives in the shared
 * `yousafe-analytics-consent` cookie (accepted | rejected, 180 days,
 * Domain=.yousafeconsultancy.com), the same contract used by Market/Portal,
 * Legal and the country sites, so one choice applies everywhere.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { footerLinkStyle, useFooterSlot } from './useFooterSlot'

const CONSENT_COOKIE = 'yousafe-analytics-consent'
const CONSENT_MAX_AGE = 15552000
const PRIVACY_URL = 'https://legal.yousafeconsultancy.com/privacy/#cookies'

type Choice = 'accepted' | 'rejected' | null

type GaWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

function readConsent(): Choice {
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + CONSENT_COOKIE + '=([^;]+)'))
  const value = match?.[1]
  return value === 'accepted' || value === 'rejected' ? value : null
}

function saveConsent(choice: Exclude<Choice, null>) {
  const domain = window.location.hostname.endsWith('yousafeconsultancy.com')
    ? '; Domain=.yousafeconsultancy.com'
    : ''
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/${domain}; Secure; SameSite=Lax`
}

function loadGoogleAnalytics(measurementId: string, gaSrc: string, linker: Record<string, unknown>) {
  if (document.getElementById('yousafe-google-analytics')) return
  const w = window as GaWindow
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer?.push(arguments)
  }
  w.gtag('js', new Date())
  w.gtag('config', measurementId, { linker })
  const script = document.createElement('script')
  script.id = 'yousafe-google-analytics'
  script.async = true
  script.src = gaSrc + encodeURIComponent(measurementId)
  document.head.appendChild(script)
}

function revokeGoogleAnalytics(measurementId: string) {
  const w = window as GaWindow
  w.gtag?.('consent', 'update', { analytics_storage: 'denied' })
  const suffix = measurementId.replace(/^G-/, '')
  for (const name of ['_ga', `_ga_${suffix}`]) {
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.yousafeconsultancy.com; Secure; SameSite=Lax`
    document.cookie = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`
  }
}

export function AnalyticsConsent({
  measurementId,
  gaSrc,
  linker,
}: {
  measurementId: string
  gaSrc: string
  linker: Record<string, unknown>
}) {
  const [choice, setChoice] = useState<Choice>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const footerSlot = useFooterSlot()

  useEffect(() => {
    const stored = readConsent()
    setChoice(stored)
    if (stored === 'accepted') loadGoogleAnalytics(measurementId, gaSrc, linker)
    else revokeGoogleAnalytics(measurementId)
    setReady(true)
    // linker is a static object from the server layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementId, gaSrc])

  function choose(next: Exclude<Choice, null>) {
    saveConsent(next)
    setChoice(next)
    setOpen(false)
    if (next === 'accepted') loadGoogleAnalytics(measurementId, gaSrc, linker)
    else revokeGoogleAnalytics(measurementId)
  }

  if (!ready) return null

  if (choice && !open) {
    // Narrow screens: a footer link, never a pill floating over the hero.
    if (footerSlot === undefined) return null
    if (footerSlot) {
      return createPortal(
        <button type="button" onClick={() => setOpen(true)} aria-label="Cookie settings" data-cookie-settings="" style={footerLinkStyle}>
          Cookie settings
        </button>,
        footerSlot,
      )
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cookie settings"
        data-cookie-settings=""
        style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9990, borderRadius: 9999, padding: '8px 14px', border: '1px solid #64748b', background: '#fff', color: '#0f172a', fontSize: 13, minHeight: 36 }}
      >
        Cookie settings
      </button>
    )
  }

  return (
    <section
      role="region"
      aria-label="Analytics cookie preferences"
      data-cookie-banner="true"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 9990, maxWidth: 720, margin: '0 auto', padding: 20, border: '1px solid #64748b', borderRadius: 12, background: '#fff', color: '#0f172a', boxShadow: '0 12px 40px rgba(15, 23, 42, .24)' }}
    >
      <p style={{ margin: '0 0 14px', lineHeight: 1.5, fontSize: 15 }}>
        Google Analytics is optional. It stays off unless you accept. Your choice is saved for six months across
        YouSafe sites and can be changed anytime in Cookie settings.{' '}
        <a href={PRIVACY_URL} style={{ color: '#3730a3', fontWeight: 700 }}>Privacy policy</a>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" onClick={() => choose('accepted')} style={{ borderRadius: 8, padding: '9px 14px', border: '1px solid #0f172a', background: '#0f172a', color: '#fff', minHeight: 40 }}>
          Accept optional analytics
        </button>
        <button type="button" onClick={() => choose('rejected')} style={{ borderRadius: 8, padding: '9px 14px', border: '1px solid #64748b', background: '#fff', color: '#0f172a', minHeight: 40 }}>
          Reject optional analytics
        </button>
        {choice && (
          <button type="button" onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', color: '#0f172a', textDecoration: 'underline' }}>
            Close
          </button>
        )}
      </div>
    </section>
  )
}
