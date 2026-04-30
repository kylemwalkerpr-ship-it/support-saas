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
import { adminUpdateStatus } from '@/lib/actions/orders'
import type { OrderStatus } from '@/lib/types'
import { ORDER_STATUS_LABELS } from '@/lib/types'
import { ChevronDown } from 'lucide-react'

const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  queued: ['claimed', 'cancelled'],
  claimed: ['processing', 'queued', 'cancelled'],
  processing: ['submitted', 'cancelled'],
  submitted: ['approved', 'processing'],
  approved: ['delivered'],
}

export function AdminOrderActions({
  orderId,
  currentStatus,
}: {
  orderId: string
  currentStatus: OrderStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const transitions = TRANSITIONS[currentStatus] ?? []

  if (transitions.length === 0) return <span className="text-xs text-gray-400">—</span>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          Move to <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {transitions.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => {
              startTransition(async () => {
                await adminUpdateStatus(orderId, s)
                toast.success(`Order moved to ${ORDER_STATUS_LABELS[s]}`)
                router.refresh()
              })
            }}
          >
            {ORDER_STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
