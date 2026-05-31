'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface UserSearchInputProps {
  paramName?: string
  placeholder?: string
  debounceMs?: number
}

/**
 * Debounced search input that syncs into the URL `?q=` param. The page is
 * an RSC, so changing the URL triggers a server re-render via
 * router.replace + scroll:false.
 */
export function UserSearchInput({
  paramName = 'q',
  placeholder = 'Search by name, email, or profile id…',
  debounceMs = 250,
}: UserSearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const [value, setValue] = useState<string>(() => params.get(paramName) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function pushToUrl(next: string) {
    const sp = new URLSearchParams(params.toString())
    if (next) sp.set(paramName, next)
    else sp.delete(paramName)
    // Reset cursor whenever the query changes.
    sp.delete('cursor')

    const query = sp.toString()
    const target = query ? `${pathname}?${query}` : pathname
    startTransition(() => {
      router.replace(target, { scroll: false })
    })
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => pushToUrl(next.trim()), debounceMs)
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={64}
        className="pl-9"
      />
    </div>
  )
}
