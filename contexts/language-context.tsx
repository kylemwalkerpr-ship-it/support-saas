"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

export type Language = "en" | "es" | "fr" | "ar" | "zh" | "hi" | "pt"

export const languages: { code: Language; label: string; flag: string; nativeLabel: string; dir?: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", flag: "US", nativeLabel: "English" },
  { code: "es", label: "Spanish", flag: "ES", nativeLabel: "Espanol" },
  { code: "fr", label: "French", flag: "FR", nativeLabel: "Francais" },
  { code: "ar", label: "Arabic", flag: "SA", nativeLabel: "Arabic", dir: "rtl" },
  { code: "zh", label: "Chinese", flag: "CN", nativeLabel: "Chinese" },
  { code: "hi", label: "Hindi", flag: "IN", nativeLabel: "Hindi" },
  { code: "pt", label: "Portuguese", flag: "BR", nativeLabel: "Portugues" },
]

interface LanguageContextType {
  language: Language
  setLanguage: (language: Language) => void
  languageLabel: string
  languageFlag: string
  direction: "ltr" | "rtl"
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)
const STORAGE_KEY = "preferredLanguage"

function isLanguage(value: string | null): value is Language {
  return !!value && languages.some((language) => language.code === value)
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  // Priority chain:
  //   1. ?lang=             explicit per-request choice (pill, hreflang, links)
  //   2. localStorage       returning-visitor preference
  //   3. yousafe-lang-default cookie  server's geo / Accept-Language inference
  //   4. navigator.language final client-side fallback
  //   5. 'en'               last resort
  useEffect(() => {
    if (typeof window === "undefined") return
    const readCookie = (name: string): string | null => {
      const m = document.cookie.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="))
      return m ? decodeURIComponent(m.slice(name.length + 1)) : null
    }
    const urlLang = new URLSearchParams(window.location.search).get("lang")
    if (isLanguage(urlLang)) { setLanguageState(urlLang); return }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) { setLanguageState(stored); return }
    const cookieLang = readCookie("yousafe-lang-default")
    if (isLanguage(cookieLang)) { setLanguageState(cookieLang); return }
    const navLang = (navigator.language || "").toLowerCase().slice(0, 2)
    if (isLanguage(navLang)) { setLanguageState(navLang); return }
  }, [])

  const setLanguage = useCallback((newLanguage: Language) => {
    setLanguageState(newLanguage)
    localStorage.setItem(STORAGE_KEY, newLanguage)
  }, [])

  const currentLanguage = languages.find((item) => item.code === language) ?? languages[0]
  const direction = currentLanguage.dir ?? "ltr"

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [direction, language])

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        languageLabel: currentLanguage.label,
        languageFlag: currentLanguage.flag,
        direction,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
