import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  getVerificationBundle,
  type VerificationType,
} from '@/lib/actions/support-verifications'
import { SupportActionError } from '@/lib/errors'
import { Header } from '@/components/dashboard/header'
import { VerificationApplicantPanel } from '@/components/support/VerificationApplicantPanel'
import { VerificationDocViewer } from '@/components/support/VerificationDocViewer'
import { VerificationDecisionBar } from '@/components/support/VerificationDecisionBar'

const VALID_TYPES: VerificationType[] = ['attorney', 'consultant', 'id', 'bar']

type Params = Promise<{ applicationId: string }>
type SearchParams = Promise<{ type?: string }>

export default async function VerificationReviewPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const viewer = await getOrCreateProfile()
  if (!viewer || !['support', 'admin'].includes(viewer.role)) {
    redirect('/sign-in')
  }

  const { applicationId } = await params
  const sp = await searchParams
  const typeRaw = sp.type
  if (!typeRaw || !(VALID_TYPES as string[]).includes(typeRaw)) {
    redirect('/verifications')
  }
  const type = typeRaw as VerificationType

  let bundle
  try {
    bundle = await getVerificationBundle({ id: applicationId, type })
  } catch (err) {
    if (err instanceof SupportActionError) {
      if (err.code === 'not_found' || err.code === 'not_supported') {
        notFound()
      }
    }
    throw err
  }

  return (
    <div>
      <Header
        title={bundle.full_name ?? bundle.email ?? bundle.id.slice(0, 8)}
        subtitle={`${type} · ${bundle.status}`}
      />

      <div className="space-y-4 p-6">
        <Link
          href={`/verifications?type=${type}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" /> Back to queue
        </Link>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Applicant
            </p>
            <VerificationApplicantPanel fields={bundle.fields} />
            {bundle.decision_notes && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                <p className="mb-1 font-semibold text-gray-500">
                  Last decision notes
                </p>
                <p className="whitespace-pre-wrap">{bundle.decision_notes}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Documents
            </p>
            <VerificationDocViewer documents={bundle.documents} />
          </div>
        </div>

        <VerificationDecisionBar
          verificationId={bundle.id}
          verificationType={type}
          applicantName={bundle.full_name ?? bundle.email}
          status={bundle.status}
        />
      </div>
    </div>
  )
}
