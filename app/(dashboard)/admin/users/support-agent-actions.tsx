'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, XCircle, RotateCcw, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setSupportStatus, updateUserRole, deleteProfile } from '@/lib/actions/profiles'
import type { Role, ProfileStatus } from '@/lib/types'

export function SupportAgentActions({
  profileId,
  role,
  status,
}: {
  profileId: string
  role: Role
  status: ProfileStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (role === 'admin') return <span className="text-xs text-gray-400">-</span>

  function approve() {
    startTransition(async () => {
      await updateUserRole(profileId, 'support')
      await setSupportStatus(profileId, 'active')
      toast.success('Support access approved')
      router.refresh()
    })
  }

  function suspend() {
    startTransition(async () => {
      await setSupportStatus(profileId, 'suspended')
      toast.success('Support user suspended')
      router.refresh()
    })
  }

  function reactivate() {
    startTransition(async () => {
      await setSupportStatus(profileId, 'active')
      toast.success('Support user reactivated')
      router.refresh()
    })
  }

  function makeSupport() {
    startTransition(async () => {
      await updateUserRole(profileId, 'support')
      toast.success('Role changed to support')
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Permanently remove this user? This cannot be undone.')) return
    startTransition(async () => {
      await deleteProfile(profileId)
      toast.success('User removed')
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === 'pending' && (
        <Button
          size="sm"
          onClick={approve}
          disabled={isPending}
          className="h-8 bg-green-600 text-xs hover:bg-green-700"
        >
          <CheckCircle className="mr-1 h-3.5 w-3.5" />
          Approve
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending} className="h-8">
            More <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Manage support user</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {status === 'pending' && (
            <DropdownMenuItem onClick={approve}>
              <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
              Approve access
            </DropdownMenuItem>
          )}
          {status === 'active' && (
            <DropdownMenuItem onClick={suspend} className="text-red-600">
              <XCircle className="mr-2 h-4 w-4" />
              Suspend access
            </DropdownMenuItem>
          )}
          {status === 'suspended' && (
            <DropdownMenuItem onClick={reactivate}>
              <RotateCcw className="mr-2 h-4 w-4 text-green-600" />
              Reactivate access
            </DropdownMenuItem>
          )}

          {role !== 'support' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={makeSupport}>Make support</DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={remove} className="text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Remove user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
