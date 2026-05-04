import { Users, Clock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Header } from '@/components/dashboard/header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getAllProfiles, getOrCreateProfile, getPendingSupportAgents } from '@/lib/actions/profiles'
import { formatDate, getInitials } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SupportAgentActions } from './support-agent-actions'

export default async function AdminUsersPage() {
  const me = await getOrCreateProfile()
  if (me?.role !== 'admin') redirect('/admin')

  const [profiles, pending] = await Promise.all([
    getAllProfiles(),
    getPendingSupportAgents(),
  ])

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      suspended: 'bg-red-100 text-red-700',
    }
    return map[status] ?? 'bg-gray-100 text-gray-700'
  }

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: 'bg-amber-100 text-amber-700',
      support: 'bg-blue-100 text-blue-700',
    }
    return map[role] ?? 'bg-gray-100 text-gray-700'
  }

  return (
    <div>
      <Header title="Support Agents" subtitle="Manage support team access" />

      <div className="p-6 space-y-6">
        {/* Pending approval alert */}
        {pending.length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800">
                  {pending.length} support agent{pending.length > 1 ? 's' : ''}{' '}
                  waiting for approval
                </p>
                <ul className="mt-2 space-y-1">
                  {pending.map((p) => (
                    <li key={p.id} className="text-sm text-yellow-700">
                      {p.full_name ?? 'Unnamed'} — {p.email}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* All users table */}
        <Card>
          <CardHeader>
            <CardTitle>Support Team ({profiles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No users yet"
                description="Users will appear here once they sign up."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-left font-medium text-gray-500">User</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Role</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Status</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Joined</th>
                      <th className="pb-3 text-right font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {profiles.map((profile) => (
                      <tr key={profile.id}>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm shrink-0">
                              {getInitials(profile.full_name ?? profile.email)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {profile.full_name ?? 'Unnamed'}
                              </p>
                              <p className="text-xs text-gray-500">{profile.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge(profile.role)}`}>
                            {profile.role}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(profile.status)}`}>
                            {profile.status}
                          </span>
                        </td>
                        <td className="py-3 text-gray-500">
                          {formatDate(profile.created_at)}
                        </td>
                        <td className="py-3 text-right">
                          <SupportAgentActions
                            profileId={profile.id}
                            role={profile.role}
                            status={profile.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
