"use client"

import React from "react"

/**
 * YouSafeLanguageBar — drop-in, standalone language switcher pill.
 *
 * Same visual + UX shape as the portal's GlobalLanguageBar, but self-
 * contained: no context dependency. Mount once from app/layout.tsx and
 * it appears as a fixed pill in the top-right corner of every page.
 *
 *   - Reads current language from `?lang=` query string, falls back to
 *     localStorage('yousafe.lang'), falls back to 'en'.
 *   - On change: writes ?lang=<code> back into the URL, persists to
 *     localStorage, and reloads so server-side translation / hreflang
 *     picks up the new locale immediately.
 *   - `position: fixed` at top:74, right:16 — sits BELOW any 60px-height
 *     sticky topbar so it doesn't collide with avatar buttons.
 *
 * Languages mirror the portal: en, es, fr, ar, zh, hi, pt.
 */

type LangCode = "en" | "es" | "fr" | "ar" | "zh" | "hi" | "pt"

const LANGS: { code: LangCode; native: string; short: string }[] = [
  { code: "en", native: "English",  short: "EN" },
  { code: "es", native: "Español",  short: "ES" },
  { code: "fr", native: "Français", short: "FR" },
  { code: "ar", native: "العربية",  short: "AR" },
  { code: "zh", native: "中文",      short: "ZH" },
  { code: "hi", native: "हिन्दी",     short: "HI" },
  { code: "pt", native: "Português", short: "PT" },
]

function readInitialLang(): LangCode {
  if (typeof window === "undefined") return "en"
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang") as LangCode | null
    if (fromUrl && LANGS.some(l => l.code === fromUrl)) return fromUrl
    const stored = window.localStorage.getItem("yousafe.lang") as LangCode | null
    if (stored && LANGS.some(l => l.code === stored)) return stored
  } catch {/* ignore */}
  return "en"
}

export function YouSafeLanguageBar() {
  const [lang, setLang] = React.useState<LangCode>("en")
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setLang(readInitialLang())
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  const choose = (code: LangCode) => {
    setOpen(false)
    if (code === lang) return
    try { window.localStorage.setItem("yousafe.lang", code) } catch {/* ignore */}
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("lang", code)
      window.location.href = url.toString()
    } catch {
      window.location.reload()
    }
  }

  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  return (
    <div
      ref={wrapRef}
      data-no-translate
      style={{
        position: "relative",
        display: "inline-flex",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}
    >
      <button
        type="button"
        aria-label={`Language: ${current.native}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          border: "1px solid rgba(148,163,184,0.35)",
          borderRadius: 6,
          background: "rgba(255,255,255,0.96)",
          color: "#0f172a",
          boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          lineHeight: 1,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 12 }}>🌐</span>
        <span>{current.short}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose language"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            margin: 0,
            padding: 4,
            listStyle: "none",
            border: "1px solid rgba(148,163,184,0.30)",
            borderRadius: 8,
            background: "#fff",
            boxShadow: "0 12px 28px rgba(15,23,42,0.16)",
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {LANGS.map(item => {
            const active = item.code === lang
            return (
              <li key={item.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => choose(item.code)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "7px 10px",
                    border: "none",
                    background: active ? "rgba(14,124,142,0.10)" : "transparent",
                    color: active ? "#0E7C8E" : "#1A1F2E",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 5,
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span>{item.native}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    color: active ? "#0E7C8E" : "#5C6070",
                    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                  }}>
                    {item.short}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default YouSafeLanguageBar
