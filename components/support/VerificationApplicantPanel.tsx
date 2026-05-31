import type { VerificationApplicantField } from '@/lib/actions/support-verifications'

interface VerificationApplicantPanelProps {
  fields: VerificationApplicantField[]
}

/**
 * Read-only field renderer for the left pane of the verification review
 * screen. Multi-line values (e.g. practice areas, applicant notes) are
 * preserved via `whitespace-pre-wrap`.
 */
export function VerificationApplicantPanel({
  fields,
}: VerificationApplicantPanelProps) {
  return (
    <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-3 gap-3 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {f.label}
          </dt>
          <dd className="col-span-2 whitespace-pre-wrap break-words text-gray-800">
            {f.value && f.value.length > 0 ? f.value : (
              <span className="text-gray-300">—</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
