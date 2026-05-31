'use client'

import { useState } from 'react'
import { CheckCircle2, MessageSquareWarning, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VerificationDecisionDialog } from './VerificationDecisionDialog'
import type {
  VerificationAction,
  VerificationStatus,
  VerificationType,
} from '@/lib/actions/support-verifications'

interface VerificationDecisionBarProps {
  verificationId: string
  verificationType: VerificationType
  applicantName: string | null
  status: VerificationStatus
}

export function VerificationDecisionBar({
  verificationId,
  verificationType,
  applicantName,
  status,
}: VerificationDecisionBarProps) {
  const [active, setActive] = useState<VerificationAction | null>(null)

  // Lock the bar for any non-pending status. The portal's status check
  // would reject the write anyway; we surface this preemptively.
  const locked = status !== 'pending' && status !== 'changes_requested'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Decision
      </p>
      {locked ? (
        <p className="text-xs text-gray-500">
          This application is {status}; no further action available.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setActive('approve')}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActive('request_changes')}
          >
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            Request changes
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setActive('reject')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
        </div>
      )}

      <VerificationDecisionDialog
        verificationId={verificationId}
        verificationType={verificationType}
        applicantName={applicantName}
        action={active}
        onOpenChange={(o) => {
          if (!o) setActive(null)
        }}
      />
    </div>
  )
}
