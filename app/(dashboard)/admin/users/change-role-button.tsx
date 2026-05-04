'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { updateUserRole } from '@/lib/actions/profiles'
import type { Role } from '@/lib/types'
import { ChevronDown } from 'lucide-react'

const roles: Role[] = ['support', 'admin']

export function ChangeRoleButton({
  profileId,
  currentRole,
}: {
  profileId: string
  currentRole: Role
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          Change Role <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Assign role</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles
          .filter((r) => r !== currentRole)
          .map((role) => (
            <DropdownMenuItem
              key={role}
              onClick={() => {
                startTransition(async () => {
                  await updateUserRole(profileId, role)
                  toast.success(`Role updated to ${role}`)
                  router.refresh()
                })
              }}
            >
              Make {role}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
