"use client"

import { Globe } from "lucide-react"
import { languages, useLanguage } from "@/contexts/language-context"

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  return (
    <label
      data-no-translate
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur"
    >
      <Globe className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        className="bg-transparent outline-none"
        value={language}
        aria-label="Language"
        onChange={(event) => setLanguage(event.target.value as typeof language)}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}
