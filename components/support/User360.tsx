import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, KeyRound } from 'lucide-react'
import { formatDate, formatRelativeDate, getInitials } from '@/lib/utils'
import { SuspensionDialog } from './SuspensionDialog'
import { RoleChangeDialog } from './RoleChangeDialog'
import { AddNoteDialog } from './AddNoteDialog'
import type { User360Bundle } from '@/lib/actions/support-users'
import type { Role } from '@/lib/types'

interface User360Props {
  bundle: User360Bundle
  viewerRole: Role
}

const ROLE_BADGE: Record<Role, string> = {
  client: 'bg-blue-50 text-blue-700 border-blue-200',
  consultant: 'bg-purple-50 text-purple-700 border-purple-200',
  support: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  admin: 'bg-amber-50 text-amber-700 border-amber-200',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
}

function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatAmount(value: number | null, currency = 'USD'): string {
  if (value == null) return '—'
  // Portal orders.total_amount stored historically in cents on most rows; if a
  // row leaks dollars, treat the float as dollars.
  if (Number.isInteger(value) && value >= 100) return formatCents(value, currency)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(value)
}

export function User360({ bundle, viewerRole }: User360Props) {
  const { profile, orders, wallet, conversations, audit, notes } = bundle
  const isAdmin = viewerRole === 'admin'
  // Support cannot suspend/reactivate/change-role another support or admin.
  const canSuspend =
    isAdmin || (profile.role !== 'support' && profile.role !== 'admin')

  const roleBadge = ROLE_BADGE[profile.role] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const statusBadge =
    STATUS_BADGE[profile.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 rounded-full bg-gray-100 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
              {getInitials(profile.full_name ?? profile.email)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">
                {profile.full_name ?? 'Unnamed user'}
              </h2>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadge}`}
              >
                {profile.role}
              </span>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge}`}
              >
                {profile.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{profile.email}</p>
            <p className="mt-1 text-xs text-gray-400">
              Member since {formatDate(profile.created_at)} ·
              {' '}Last updated {formatRelativeDate(profile.updated_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SuspensionDialog
              profileId={profile.id}
              status={profile.status}
              disabled={!canSuspend}
            />
            <RoleChangeDialog
              profileId={profile.id}
              currentRole={profile.role}
              visible={isAdmin}
            />
            <Button variant="outline" size="sm" disabled title="Coming in phase 8">
              <Mail className="mr-2 h-4 w-4" />
              Email (phase 8)
            </Button>
            <Button variant="outline" size="sm" disabled title="Coming in phase 10">
              <KeyRound className="mr-2 h-4 w-4" />
              Reset password (phase 10)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="conversations">
            Conversations ({conversations.length})
          </TabsTrigger>
          <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <Field label="Profile ID" value={profile.id} mono />
              <Field label="Clerk user ID" value={profile.clerk_user_id} mono />
              <Field label="Email" value={profile.email} />
              <Field label="Full name" value={profile.full_name ?? '—'} />
              <Field label="Role" value={profile.role} />
              <Field label="Status" value={profile.status} />
              <Field label="Created" value={formatDate(profile.created_at)} />
              <Field label="Updated" value={formatDate(profile.updated_at)} />
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-400">Bio</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">
                  {profile.bio ?? '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-sm text-gray-500">No orders yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="py-2 pr-3">Order</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Amount</th>
                        <th className="py-2 pr-3">Gateway</th>
                        <th className="py-2 pr-3">Created</th>
                        <th className="py-2 pr-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-700">
                            {o.order_number ?? o.id.slice(0, 8)}
                          </td>
                          <td className="py-2 pr-3 text-gray-700">{o.status ?? '—'}</td>
                          <td className="py-2 pr-3 text-gray-700">
                            {formatAmount(o.total_amount)}
                          </td>
                          <td className="py-2 pr-3 text-gray-500">{o.gateway ?? '—'}</td>
                          <td className="py-2 pr-3 text-gray-500">
                            {formatDate(o.created_at)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button size="sm" variant="ghost" disabled>
                              View (phase 3)
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {wallet ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field
                      label="Balance"
                      value={formatCents(wallet.balance_cents, wallet.currency)}
                    />
                    <Field label="Currency" value={wallet.currency.toUpperCase()} />
                    <Field
                      label="Last updated"
                      value={wallet.updated_at ? formatDate(wallet.updated_at) : '—'}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Wallet ledger and credit/debit tools land in phase 8.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  No wallet exists for this profile yet (will be provisioned on first
                  top-up in phase 8).
                </p>
              )}
              <Button size="sm" variant="outline" disabled>
                Issue credit (phase 8)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations">
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <p className="text-sm text-gray-500">No conversations linked yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                        <th className="py-2 pr-3">Topic</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Priority</th>
                        <th className="py-2 pr-3">Last message</th>
                        <th className="py-2 pr-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {conversations.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 pr-3 text-gray-700">{c.topic}</td>
                          <td className="py-2 pr-3 text-gray-700">{c.status}</td>
                          <td className="py-2 pr-3 text-gray-700">{c.priority}</td>
                          <td className="py-2 pr-3 text-gray-500">
                            {formatRelativeDate(c.last_message_at)}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button size="sm" variant="ghost" disabled>
                              Open (phase 5)
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-gray-500">No audit entries yet.</p>
              ) : (
                <ul className="space-y-3">
                  {audit.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-700">
                          {entry.action}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatRelativeDate(entry.created_at)}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="mt-1 text-gray-700">{entry.reason}</p>
                      )}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-gray-600">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Internal notes</CardTitle>
              <AddNoteDialog profileId={profile.id} />
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No internal notes yet. Add the first one — only other agents will see it.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm"
                    >
                      <p className="whitespace-pre-wrap text-gray-800">{note.body}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {formatRelativeDate(note.created_at)} · by{' '}
                        <span className="font-mono">{note.actor_id.slice(0, 8)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={
          mono
            ? 'mt-1 break-all font-mono text-xs text-gray-700'
            : 'mt-1 text-gray-700'
        }
      >
        {value}
      </p>
    </div>
  )
}
