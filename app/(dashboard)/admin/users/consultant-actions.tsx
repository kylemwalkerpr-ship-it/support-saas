'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, XCircle, RotateCcw, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setConsultantStatus, updateUserRole } from '@/lib/actions/profiles'
import type { Role, ProfileStatus } from '@/lib/types'

export function ConsultantActions({
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

  // Admins can't be managed
  if (role === 'admin') return <span className="text-xs text-gray-400">—</span>

  function approve() {
    startTransition(async () => {
      await setConsultantStatus(profileId, 'active')
      toast.success('Consultant approved — they can now access the dashboard')
      router.refresh()
    })
  }

  function suspend() {
    startTransition(async () => {
      await setConsultantStatus(profileId, 'suspended')
      toast.success('User suspended')
      router.refresh()
    })
  }

  function reactivate() {
    startTransition(async () => {
      await setConsultantStatus(profileId, 'active')
      toast.success('User reactivated')
      router.refresh()
    })
  }

  function changeRole(newRole: Role) {
    startTransition(async () => {
      await updateUserRole(profileId, newRole)
      toast.success(`Role changed to ${newRole}`)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {/* Quick approve button for pending consultants */}
      {status === 'pending' && (
        <Button
          size="sm"
          onClick={approve}
          disabled={isPending}
          className="bg-green-600 hover:bg-green-700 h-8 text-xs"
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1" />
          Approve
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending} className="h-8">
            More <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Manage user</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Status actions */}
          {status === 'pending' && (
            <DropdownMenuItem onClick={approve}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
              Approve consultant
            </DropdownMenuItem>
          )}
          {status === 'active' && (
            <DropdownMenuItem onClick={suspend} className="text-red-600">
              <XCircle className="h-4 w-4 mr-2" />
              Suspend user
            </DropdownMenuItem>
          )}
          {status === 'suspended' && (
            <DropdownMenuItem onClick={reactivate}>
              <RotateCcw className="h-4 w-4 mr-2 text-green-600" />
              Reactivate user
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change role</DropdownMenuLabel>

          {role !== 'client' && (
            <DropdownMenuItem onClick={() => changeRole('client')}>
              Make client
            </DropdownMenuItem>
          )}
          {role !== 'consultant' && (
            <DropdownMenuItem onClick={() => changeRole('consultant')}>
              Make consultant
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
