'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react'
import { setProfileRole } from '@/lib/actions/profiles'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'

const roles = [
  {
    value: 'client' as Role,
    label: 'Client',
    description: 'I want to hire consultants and get work done',
    icon: ShoppingBag,
    color: 'border-blue-500 bg-blue-50',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
  },
  {
    value: 'consultant' as Role,
    label: 'Consultant',
    description: 'I want to offer my expertise and take on projects',
    icon: Briefcase,
    color: 'border-purple-500 bg-purple-50',
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Role | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleContinue() {
    if (!selected) return
    startTransition(async () => {
      await setProfileRole(selected)
      router.push(selected === 'client' ? '/client' : '/consultant')
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4" style={{ background: '#3C3B6E' }}>
            <span className="text-2xl font-bold text-white">Y</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">How will you use Yousafe?</h1>
          <p className="mt-2 text-gray-500">
            Choose your role to get the right experience. You can update this later.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          {roles.map((role) => (
            <button
              key={role.value}
              onClick={() => setSelected(role.value)}
              className={cn(
                'w-full flex items-center gap-4 rounded-xl border-2 p-5 text-left transition-all',
                selected === role.value
                  ? role.color
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <div className={cn('rounded-xl p-3 shrink-0', selected === role.value ? role.iconBg : 'bg-gray-100')}>
                <role.icon className={cn('h-6 w-6', selected === role.value ? role.iconColor : 'text-gray-500')} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{role.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{role.description}</p>
              </div>
              <div className={cn(
                'ml-auto h-5 w-5 rounded-full border-2 shrink-0',
                selected === role.value ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
              )}>
                {selected === role.value && (
                  <div className="h-full w-full rounded-full bg-white scale-50" />
                )}
              </div>
            </button>
          ))}
        </div>

        <Button
          onClick={handleContinue}
          disabled={!selected || isPending}
          className="w-full h-11"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continue <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
