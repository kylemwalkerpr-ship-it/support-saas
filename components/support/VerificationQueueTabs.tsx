'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BadgeCheck, GraduationCap, IdCard, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VerificationType } from '@/lib/actions/support-verifications'

interface VerificationQueueTabsProps {
  active: VerificationType
}

const TABS: Array<{
  type: VerificationType
  label: string
  icon: typeof BadgeCheck
}> = [
  { type: 'attorney', label: 'Attorney applications', icon: Scale },
  { type: 'consultant', label: 'Consultant intakes', icon: GraduationCap },
  { type: 'id', label: 'ID documents', icon: IdCard },
  { type: 'bar', label: 'Bar number checks', icon: BadgeCheck },
]

export function VerificationQueueTabs({ active }: VerificationQueueTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function setType(type: VerificationType) {
    const next = new URLSearchParams(sp.toString())
    next.set('type', type)
    // Reset cursor when switching tabs — different queue.
    next.delete('cursor')
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`)
    })
  }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-2">
      {TABS.map((t) => {
        const isActive = t.type === active
        return (
          <button
            key={t.type}
            onClick={() => setType(t.type)}
            disabled={isPending && isActive}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[#3C3B6E] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
