import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { listMacros } from '@/lib/actions/support-macros'
import { Header } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MacroLibrary } from '@/components/support/MacroLibrary'
import { MacroEditDialog } from '@/components/support/MacroEditDialog'
import { Plus } from 'lucide-react'

type SearchParams = Promise<{
  tab?: string
  tag?: string
  language?: string
}>

export default async function MacrosPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }
  const sp = await searchParams
  const activeTab = sp.tab === 'team' ? 'team' : 'mine'
  const tag = sp.tag ?? null
  const language = sp.language ?? null

  const [mine, team] = await Promise.all([
    listMacros({ scope: 'mine', tag, language }),
    listMacros({ scope: 'team', tag, language }),
  ])

  const allTags = Array.from(
    new Set([...mine, ...team].flatMap((m) => m.tags))
  ).sort()

  return (
    <div>
      <Header
        title="Macros"
        subtitle={`${mine.length + team.length} macros available`}
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Canned replies render tokens like{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5">{'{{customer.first_name}}'}</code>{' '}
            on send. Team-wide macros are admin-only writes.
          </p>
          <MacroEditDialog
            viewerRole={profile.role}
            trigger={
              <Button>
                <Plus className="mr-1.5 h-4 w-4" /> New macro
              </Button>
            }
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-500">Tags:</span>
            <a
              href={`/macros?tab=${activeTab}`}
              className={`rounded-full border px-2 py-0.5 ${tag === null ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              all
            </a>
            {allTags.map((t) => (
              <a
                key={t}
                href={`/macros?tab=${activeTab}&tag=${encodeURIComponent(t)}`}
                className={`rounded-full border px-2 py-0.5 ${tag === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {t}
              </a>
            ))}
          </div>
        )}

        <Tabs defaultValue={activeTab}>
          <TabsList>
            <TabsTrigger value="mine">Personal ({mine.length})</TabsTrigger>
            <TabsTrigger value="team">Team ({team.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-3">
            <MacroLibrary
              macros={mine}
              viewerRole={profile.role}
              viewerId={profile.id}
            />
          </TabsContent>
          <TabsContent value="team" className="mt-3">
            <MacroLibrary
              macros={team}
              viewerRole={profile.role}
              viewerId={profile.id}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
