import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getDisputeTriageBundle } from '@/lib/actions/support-disputes'
import { SupportActionError } from '@/lib/errors'
import { Header } from '@/components/dashboard/header'
import { DisputeTriagePane } from '@/components/support/DisputeTriagePane'
import { DisputeDecisionBar } from '@/components/support/DisputeDecisionBar'
import { AdminCoSignBar } from '@/components/support/AdminCoSignBar'

type Params = Promise<{ disputeId: string }>

export default async function DisputeTriagePage({ params }: { params: Params }) {
  const viewer = await getOrCreateProfile()
  if (!viewer || !['support', 'admin'].includes(viewer.role)) {
    redirect('/sign-in')
  }

  const { disputeId } = await params

  let bundle
  try {
    bundle = await getDisputeTriageBundle(disputeId)
  } catch (err) {
    if (err instanceof SupportActionError && err.code === 'not_found') {
      notFound()
    }
    throw err
  }

  const { dispute, order } = bundle
  const metadata = (dispute.metadata ?? {}) as Record<string, unknown>
  const proposalDecision =
    typeof metadata.proposed_decision === 'string'
      ? (metadata.proposed_decision as string)
      : null
  const hasProposal = proposalDecision !== null

  return (
    <div>
      <Header
        title={`Dispute ${dispute.id.slice(0, 8)}`}
        subtitle={`Order ${order.order_number ?? order.id.slice(0, 8)} · ${dispute.status}`}
      />

      <div className="space-y-4 p-6">
        <Link
          href="/disputes"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" /> Back to queue
        </Link>

        {viewer.role === 'admin' && hasProposal && (
          <AdminCoSignBar
            disputeId={dispute.id}
            proposalDecision={proposalDecision}
            proposalAmountCents={
              typeof metadata.proposed_amount_cents === 'number'
                ? metadata.proposed_amount_cents
                : undefined
            }
            proposalReleaseCents={
              typeof metadata.proposed_release_cents === 'number'
                ? metadata.proposed_release_cents
                : undefined
            }
            proposalNotes={
              typeof metadata.proposed_notes === 'string'
                ? metadata.proposed_notes
                : undefined
            }
          />
        )}

        <DisputeTriagePane bundle={bundle} />

        <DisputeDecisionBar
          disputeId={dispute.id}
          orderTotalDollars={order.total_amount}
          viewerRole={viewer.role}
          disputeStatus={dispute.status}
          hasProposal={hasProposal}
        />
      </div>
    </div>
  )
}
