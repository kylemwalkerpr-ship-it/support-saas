'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import type { Profile, SupportMacro } from '@/lib/types'

// ============================================================
// Phase 5 — Macros (canned replies) CRUD + token rendering
// ============================================================

export interface ListMacrosInput {
  scope?: 'mine' | 'team' | 'all'
  tag?: string | null
  language?: string | null
  search?: string | null
}

export interface CreateMacroInput {
  title: string
  body: string
  tags?: string[]
  language?: string
  isTeamWide?: boolean
}

export interface UpdateMacroInput {
  id: string
  title?: string
  body?: string
  tags?: string[]
  language?: string
  isArchived?: boolean
}

export interface RenderContext {
  customer?: {
    first_name?: string | null
    last_name?: string | null
    full_name?: string | null
    email?: string | null
  } | null
  order?: {
    id?: string | null
    order_number?: string | null
    status?: string | null
  } | null
  agent?: {
    name?: string | null
    email?: string | null
  } | null
}

async function requireSupportOrAdmin(): Promise<Profile> {
  const profile = await getOrCreateProfile()
  if (!profile) {
    throw new SupportActionError('unauthorized', 'No authenticated profile', 401)
  }
  if (profile.role !== 'support' && profile.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      `Role '${profile.role}' is not permitted on this surface`,
      403
    )
  }
  return profile
}

// ============================================================
// Token rendering (server-side)
// ============================================================

const TOKEN_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g
const MAX_TOKEN_VALUE_LEN = 500

function resolveTokenPath(ctx: RenderContext, path: string): string | undefined {
  const parts = path.split('.')
  let cursor: unknown = ctx
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  if (cursor == null) return undefined
  if (typeof cursor === 'string') return cursor
  if (typeof cursor === 'number' || typeof cursor === 'boolean') return String(cursor)
  return undefined
}

export async function renderMacroBody(body: string, ctx: RenderContext): Promise<string> {
  return body.replace(TOKEN_RE, (full, path: string) => {
    const value = resolveTokenPath(ctx, path)
    if (value === undefined) return full
    const trimmed = value.length > MAX_TOKEN_VALUE_LEN
      ? value.slice(0, MAX_TOKEN_VALUE_LEN)
      : value
    return trimmed
  })
}

// renderMacro: convenience that fetches the macro then renders. The PostgREST
// RLS policy already restricts what the caller can see.
export async function renderMacro(macroId: string, ctx: RenderContext): Promise<string> {
  const macro = await getMacroById(macroId)
  return renderMacroBody(macro.body, ctx)
}

// ============================================================
// CRUD
// ============================================================

export async function listMacros(input: ListMacrosInput = {}): Promise<SupportMacro[]> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()

  let qb = db
    .from('support_macros')
    .select('*')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(200)

  const scope = input.scope ?? 'all'
  if (scope === 'mine') {
    qb = qb.eq('owner_id', actor.id)
  } else if (scope === 'team') {
    qb = qb.is('owner_id', null)
  } else {
    // 'all' — team-wide OR own
    qb = qb.or(`owner_id.is.null,owner_id.eq.${actor.id}`)
  }
  if (input.language) qb = qb.eq('language', input.language)
  if (input.tag) qb = qb.contains('tags', [input.tag])
  if (input.search) {
    const safe = input.search.replace(/%/g, '').slice(0, 80)
    qb = qb.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)
  }

  const { data, error } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list macros: ${error.message}`,
      500
    )
  }
  return (data ?? []) as SupportMacro[]
}

export async function getMacroById(id: string): Promise<SupportMacro> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('support_macros')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new SupportActionError('db_error', error.message, 500)
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Macro not found', 404)
  }
  const macro = data as SupportMacro
  if (macro.owner_id && macro.owner_id !== actor.id && actor.role !== 'admin') {
    throw new SupportActionError('forbidden', 'Not your macro', 403)
  }
  return macro
}

export async function createMacro(input: CreateMacroInput): Promise<SupportMacro> {
  const actor = await requireSupportOrAdmin()
  const title = (input.title ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!title) {
    throw new SupportActionError('invalid_input', 'title is required', 400)
  }
  if (!body) {
    throw new SupportActionError('invalid_input', 'body is required', 400)
  }
  const isTeamWide = !!input.isTeamWide
  if (isTeamWide && actor.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      'Only admins can create team-wide macros',
      403
    )
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('support_macros')
    .insert({
      owner_id: isTeamWide ? null : actor.id,
      title: title.slice(0, 160),
      body: body.slice(0, 8000),
      tags: (input.tags ?? []).slice(0, 12).map((t) => t.slice(0, 40)),
      language: (input.language ?? 'en').slice(0, 8),
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to create macro: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  const macro = data as SupportMacro

  await logSupportAction({
    action: 'macro.create',
    targetType: 'macro',
    targetId: macro.id,
    metadata: { is_team_wide: isTeamWide, title: macro.title },
  })

  return macro
}

export async function updateMacro(input: UpdateMacroInput): Promise<SupportMacro> {
  const actor = await requireSupportOrAdmin()
  const existing = await getMacroById(input.id)
  if (existing.owner_id && existing.owner_id !== actor.id && actor.role !== 'admin') {
    throw new SupportActionError('forbidden', 'Cannot edit this macro', 403)
  }
  if (!existing.owner_id && actor.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      'Team-wide macros are admin-only',
      403
    )
  }

  const patch: Record<string, unknown> = {}
  if (typeof input.title === 'string') patch.title = input.title.trim().slice(0, 160)
  if (typeof input.body === 'string') patch.body = input.body.trim().slice(0, 8000)
  if (Array.isArray(input.tags))
    patch.tags = input.tags.slice(0, 12).map((t) => t.slice(0, 40))
  if (typeof input.language === 'string')
    patch.language = input.language.slice(0, 8)
  if (typeof input.isArchived === 'boolean') patch.is_archived = input.isArchived

  if (Object.keys(patch).length === 0) {
    return existing
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('support_macros')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to update macro: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'macro.update',
    targetType: 'macro',
    targetId: input.id,
    metadata: { fields: Object.keys(patch) },
  })

  return data as SupportMacro
}

export async function deleteMacro(id: string): Promise<void> {
  const actor = await requireSupportOrAdmin()
  const existing = await getMacroById(id)
  if (existing.owner_id && existing.owner_id !== actor.id && actor.role !== 'admin') {
    throw new SupportActionError('forbidden', 'Cannot delete this macro', 403)
  }
  if (!existing.owner_id && actor.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      'Team-wide macros are admin-only',
      403
    )
  }

  const db = createSupabaseAdminClient()
  const { error } = await db.from('support_macros').delete().eq('id', id)
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to delete macro: ${error.message}`,
      500
    )
  }

  await logSupportAction({
    action: 'macro.delete',
    targetType: 'macro',
    targetId: id,
    metadata: { title: existing.title },
  })
}
