import { Header } from '@/components/dashboard/header'

/**
 * Generic loading skeleton for any list page in the dashboard.
 * Renders the page header (with a placeholder subtitle) and a
 * column of pulsing rows that mimics a table/list layout.
 *
 * Used by `loading.tsx` files in every `(dashboard)/<list>` route
 * so server-rendered pages get a streaming fallback for free.
 */
export function ListSkeleton({
  title,
  rows = 8,
}: {
  title: string
  rows?: number
}) {
  return (
    <div>
      <Header title={title} subtitle="Loading…" />
      <div className="space-y-3 p-6">
        <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-gray-100" />
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-14 w-full animate-pulse rounded-lg bg-gray-100"
          />
        ))}
      </div>
    </div>
  )
}
