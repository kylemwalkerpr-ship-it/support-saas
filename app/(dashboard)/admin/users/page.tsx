import { Users } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getAllProfiles } from '@/lib/actions/profiles'
import { formatDate, getInitials } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangeRoleButton } from './change-role-button'

export default async function AdminUsersPage() {
  const profiles = await getAllProfiles()

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: 'bg-amber-100 text-amber-700',
      consultant: 'bg-purple-100 text-purple-700',
      client: 'bg-blue-100 text-blue-700',
    }
    return map[role] ?? 'bg-gray-100 text-gray-700'
  }

  return (
    <div>
      <Header title="Users" subtitle="Manage all users and their roles" />

      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>All Users ({profiles.length})</CardTitle>
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
                        <td className="py-3 text-gray-500">
                          {formatDate(profile.created_at)}
                        </td>
                        <td className="py-3 text-right">
                          <ChangeRoleButton profileId={profile.id} currentRole={profile.role} />
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
