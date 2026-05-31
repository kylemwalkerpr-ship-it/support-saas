'use client'

import { useState } from 'react'
import {
  CircleDollarSign,
  Split,
  SendHorizonal,
  Slice,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DisputeDecisionDialog,
  type DecisionKind,
} from './DisputeDecisionDialog'
import type { Role, DisputeStatus } from '@/lib/types'

interface DisputeDecisionBarProps {
  disputeId: string
  orderTotalDollars: number | null
  viewerRole: Role
  disputeStatus: DisputeStatus
  hasProposal: boolean
}

const BUTTONS: Array<{
  decision: DecisionKind
  label: string
  icon: typeof CircleDollarSign
  variant: 'default' | 'outline' | 'destructive'
}> = [
  { decision: 'refund_full', label: 'Refund buyer fully', icon: CircleDollarSign, variant: 'default' },
  { decision: 'refund_partial', label: 'Refund partially', icon: Slice, variant: 'outline' },
  { decision: 'release', label: 'Release to seller', icon: SendHorizonal, variant: 'outline' },
  { decision: 'split', label: 'Split (custom)', icon: Split, variant: 'outline' },
  { decision: 'reject', label: 'Reject dispute', icon: XCircle, variant: 'destructive' },
]

export function DisputeDecisionBar({
  disputeId,
  orderTotalDollars,
  viewerRole,
  disputeStatus,
  hasProposal,
}: DisputeDecisionBarProps) {
  const [active, setActive] = useState<DecisionKind | null>(null)

  // Once a proposal is pending co-sign OR the dispute is resolved, lock the bar.
  const locked =
    hasProposal ||
    (disputeStatus !== 'open' && disputeStatus !== 'triage') ||
    // Support can't act on a triage-pending-co-sign dispute that isn't theirs;
    // disable all entry points. Admin uses the AdminCoSignBar instead.
    (disputeStatus === 'triage' && hasProposal)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Decision
      </p>
      {locked ? (
        <p className="text-xs text-gray-500">
          {hasProposal
            ? 'A decision is awaiting admin co-sign — see the co-sign panel above.'
            : `Dispute is ${disputeStatus}; no further action available.`}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {BUTTONS.map((b) => (
            <Button
              key={b.decision}
              size="sm"
              variant={b.variant}
              onClick={() => setActive(b.decision)}
            >
              <b.icon className="mr-2 h-4 w-4" />
              {b.label}
            </Button>
          ))}
        </div>
      )}

      {active && (
        <DisputeDecisionDialog
          disputeId={disputeId}
          orderTotalDollars={orderTotalDollars}
          decision={active}
          open={!!active}
          onOpenChange={(o) => {
            if (!o) setActive(null)
          }}
          viewerRole={viewerRole}
        />
      )}
    </div>
  )
}
