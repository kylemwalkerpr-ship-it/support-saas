"use client"

import { Globe } from "lucide-react"
import { languages, useLanguage } from "@/contexts/language-context"

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  return (
    // Sits in the bottom-right corner, stacked ABOVE the chat launcher
    // (customer-chat-widget: bottom-5 right-5, 56px tall => top edge at 76px),
    // so the two never overlap at any width. Bottom-left is taken by the
    // "Cookie settings" pill (analytics-consent.tsx). z-40 keeps the open chat
    // panel (z-50) above the picker. Below 640px it shrinks to a 40px globe
    // button centred over the launcher column; the native <select> is laid
    // invisibly over it, so a tap still opens the OS language list.
    // tests/language-picker-layout.test.mjs.
    <label
      data-no-translate
      className="fixed bottom-[5.5rem] right-5 z-40 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur max-sm:right-7 max-sm:h-10 max-sm:w-10 max-sm:justify-center max-sm:rounded-full max-sm:p-0"
      title="Language"
    >
      <Globe className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        className="bg-transparent outline-none max-sm:absolute max-sm:inset-0 max-sm:h-full max-sm:w-full max-sm:cursor-pointer max-sm:appearance-none max-sm:opacity-0"
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
