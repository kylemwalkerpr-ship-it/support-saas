'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import type { Profile } from '@/lib/types'

// ============================================================
// Phase 6 — Unified verification queue
//
// Backs four tabs:
//   - attorney  — portal-owned `attorney_applications`
//   - consultant — portal-owned `profiles` where role='consultant' status='pending'
//   - id        — placeholder (no portal table exists yet)
//   - bar       — placeholder (no portal table exists yet)
//
// Strategy (per discovery in PR report): the portal admin endpoints exist
// only for attorneys and are guarded by a Clerk admin cookie that we can't
// forward from this Worker. Both repos share the same Supabase project,
// so we use the service-role client (RLS bypass, trusted env) and replicate
// the portal's exact write sequence:
//   approve  → set application status='approved' + decided_at/by + decision_notes
//              + profiles.status='active' + attorneys upsert + event log
//   reject   → set application status='declined' + decided_at/by + decision_notes
//              + profiles.status='declined' + event log
//   changes  → set application status remains 'pending' + decision_notes
//              + event log (no profile transition)
//
// All decisions write to support_audit_log via support_log_action so the
// saas side carries its own immutable audit trail.
// ============================================================

export type VerificationType = 'attorney' | 'consultant' | 'id' | 'bar'

export type VerificationAction = 'approve' | 'request_changes' | 'reject'

export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'changes_requested'
  | 'waitlist'

export interface SearchVerificationsInput {
  type: VerificationType
  status?: VerificationStatus
  cursor?: string | null
  limit?: number
}

export interface VerificationQueueRow {
  id: string
  type: VerificationType
  full_name: string | null
  email: string | null
  status: VerificationStatus
  created_at: string
  age_days: number
  // Type-specific summary (badge area on the row)
  summary: string | null
  // Saas-side optimistic assignment (when present)
  assigned_to: string | null
  assigned_label: string | null
}

export interface SearchVerificationsResult {
  rows: VerificationQueueRow[]
  nextCursor: string | null
  total: number
}

export interface VerificationApplicantField {
  label: string
  value: string | null
}

export interface VerificationDoc {
  label: string
  url: string
  kind: 'pdf' | 'image' | 'link'
}

export interface VerificationBundle {
  id: string
  type: VerificationType
  status: VerificationStatus
  full_name: string | null
  email: string | null
  created_at: string
  decided_at: string | null
  decision_notes: string | null
  // Read-only applicant fields rendered on the left pane.
  fields: VerificationApplicantField[]
  // Documents rendered in the right pane.
  documents: VerificationDoc[]
  // Backing profile (when known) — used by the "this will activate <name>" prompt.
  profile: Profile | null
}

export interface DecisionInput {
  id: string
  type: VerificationType
  notes: string
}

export interface BulkAssignInput {
  type: VerificationType
  ids: string[]
}

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const NOTES_MIN = 12

interface CursorPayload {
  created_at: string
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeCursor(input: string | null | undefined): CursorPayload | null {
  if (!input) return null
  try {
    const json = Buffer.from(input, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'created_at' in parsed &&
      'id' in parsed
    ) {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.created_at === 'string' && typeof obj.id === 'string') {
        return { created_at: obj.created_at, id: obj.id }
      }
    }
    return null
  } catch {
    return null
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return SEARCH_DEFAULT_LIMIT
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)))
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

function isValidType(value: string): value is VerificationType {
  return value === 'attorney' || value === 'consultant' || value === 'id' || value === 'bar'
}

function ageDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

function classifyUrl(raw: string | null | undefined): 'pdf' | 'image' | 'link' {
  if (!raw) return 'link'
  const lower = raw.toLowerCase().split('?')[0]
  if (lower.endsWith('.pdf')) return 'pdf'
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    return 'image'
  }
  return 'link'
}

// ============================================================
// searchVerifications — queue listing per tab
// ============================================================

export async function searchVerifications(
  input: SearchVerificationsInput
): Promise<SearchVerificationsResult> {
  await requireSupportOrAdmin()

  if (!isValidType(input.type)) {
    throw new SupportActionError('invalid_input', 'Invalid verification type', 400)
  }
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)
  const db = createSupabaseAdminClient()

  if (input.type === 'attorney') {
    return searchAttorneyApplications(db, input.status ?? 'pending', cursor, limit)
  }
  if (input.type === 'consultant') {
    return searchConsultantIntakes(db, input.status ?? 'pending', cursor, limit)
  }
  // ID and Bar tabs — no portal table exists yet. Return empty queue with
  // total 0 so the UI renders the empty state instead of erroring.
  return { rows: [], nextCursor: null, total: 0 }
}

async function searchAttorneyApplications(
  db: ReturnType<typeof createSupabaseAdminClient>,
  status: VerificationStatus,
  cursor: CursorPayload | null,
  limit: number
): Promise<SearchVerificationsResult> {
  const portalStatus = status === 'changes_requested' ? 'pending' : status
  let qb = db
    .from('attorney_applications')
    .select(
      'id, profile_id, full_name, email, status, created_at, jurisdictions, practice_areas, credential_type, bar_number, assigned_to',
      { count: 'exact' }
    )
    .eq('status', portalStatus)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (cursor) {
    qb = qb.or(
      `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list attorney applications: ${error.message}`,
      500
    )
  }

  const rowsRaw = (data ?? []) as Array<{
    id: string
    profile_id: string | null
    full_name: string | null
    email: string | null
    status: string
    created_at: string
    jurisdictions: string | null
    practice_areas: string | null
    credential_type: string | null
    bar_number: string | null
    assigned_to: string | null
  }>
  const hasMore = rowsRaw.length > limit
  const page = hasMore ? rowsRaw.slice(0, limit) : rowsRaw

  const assigneeIds = Array.from(
    new Set(page.map((r) => r.assigned_to).filter((v): v is string => !!v))
  )
  const labels = await batchLoadProfileLabels(db, assigneeIds)

  const rows: VerificationQueueRow[] = page.map((r) => ({
    id: r.id,
    type: 'attorney',
    full_name: r.full_name,
    email: r.email,
    status: (r.status as VerificationStatus) ?? 'pending',
    created_at: r.created_at,
    age_days: ageDays(r.created_at),
    summary:
      [r.credential_type, r.jurisdictions ? `j: ${r.jurisdictions}` : null]
        .filter(Boolean)
        .join(' · ') || null,
    assigned_to: r.assigned_to,
    assigned_label: r.assigned_to ? labels.get(r.assigned_to) ?? null : null,
  }))

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          created_at: page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return { rows, nextCursor, total: count ?? rows.length }
}

async function searchConsultantIntakes(
  db: ReturnType<typeof createSupabaseAdminClient>,
  status: VerificationStatus,
  cursor: CursorPayload | null,
  limit: number
): Promise<SearchVerificationsResult> {
  // Consultant onboarding gates on profiles.status (see portal's
  // marketplace_consultant_intake.sql). Pending = the consultant has signed
  // up but is not yet activated. We mirror the portal's status vocabulary.
  const profileStatus = status === 'changes_requested' ? 'pending' : status

  let qb = db
    .from('profiles')
    .select(
      'id, full_name, email, status, created_at',
      { count: 'exact' }
    )
    .eq('role', 'consultant')
    .eq('status', profileStatus)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (cursor) {
    qb = qb.or(
      `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list consultant intakes: ${error.message}`,
      500
    )
  }

  const rowsRaw = (data ?? []) as Array<{
    id: string
    full_name: string | null
    email: string | null
    status: string
    created_at: string
  }>
  const hasMore = rowsRaw.length > limit
  const page = hasMore ? rowsRaw.slice(0, limit) : rowsRaw

  // Enrich with rich consultant profile (tagline / starting_price) when present.
  const ids = page.map((r) => r.id)
  const consultantMap = new Map<string, { tagline: string | null; starting_price: number | null }>()
  if (ids.length) {
    const { data: cons } = await db
      .from('consultants')
      .select('profile_id, tagline, starting_price')
      .in('profile_id', ids)
    for (const row of (cons ?? []) as Array<{
      profile_id: string
      tagline: string | null
      starting_price: number | null
    }>) {
      consultantMap.set(row.profile_id, {
        tagline: row.tagline,
        starting_price: row.starting_price,
      })
    }
  }

  const rows: VerificationQueueRow[] = page.map((r) => {
    const extra = consultantMap.get(r.id)
    const summary =
      extra?.tagline ??
      (extra?.starting_price ? `Starting $${(extra.starting_price / 100).toFixed(2)}` : null)
    return {
      id: r.id,
      type: 'consultant' as const,
      full_name: r.full_name,
      email: r.email,
      status: (r.status as VerificationStatus) ?? 'pending',
      created_at: r.created_at,
      age_days: ageDays(r.created_at),
      summary,
      assigned_to: null,
      assigned_label: null,
    }
  })

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          created_at: page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return { rows, nextCursor, total: count ?? rows.length }
}

async function batchLoadProfileLabels(
  db: ReturnType<typeof createSupabaseAdminClient>,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids)
  const out = new Map<string, string>()
  for (const r of (data ?? []) as Array<{
    id: string
    full_name: string | null
    email: string | null
  }>) {
    out.set(r.id, r.full_name ?? r.email ?? r.id.slice(0, 8))
  }
  return out
}

// ============================================================
// getVerificationBundle — single application review bundle
// ============================================================

export async function getVerificationBundle(input: {
  id: string
  type: VerificationType
}): Promise<VerificationBundle> {
  await requireSupportOrAdmin()
  if (!isValidType(input.type)) {
    throw new SupportActionError('invalid_input', 'Invalid verification type', 400)
  }
  if (!input.id) {
    throw new SupportActionError('invalid_input', 'id is required', 400)
  }
  const db = createSupabaseAdminClient()

  if (input.type === 'attorney') return loadAttorneyBundle(db, input.id)
  if (input.type === 'consultant') return loadConsultantBundle(db, input.id)
  throw new SupportActionError(
    'not_supported',
    `No backing table for verification type '${input.type}' yet`,
    404
  )
}

async function loadAttorneyBundle(
  db: ReturnType<typeof createSupabaseAdminClient>,
  id: string
): Promise<VerificationBundle> {
  const { data, error } = await db
    .from('attorney_applications')
    .select(
      'id, profile_id, email, full_name, phone, credential_type, jurisdictions, bar_number, practice_areas, malpractice_insurance, profile_url, capacity, notes, status, decided_at, decision_notes, created_at'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load attorney application: ${error.message}`,
      500
    )
  }
  if (!data) throw new SupportActionError('not_found', 'Application not found', 404)
  const app = data as Record<string, string | null>

  const profile = app.profile_id
    ? await loadProfile(db, app.profile_id as string)
    : null

  const fields: VerificationApplicantField[] = [
    { label: 'Full name', value: app.full_name },
    { label: 'Email', value: app.email },
    { label: 'Phone', value: app.phone },
    { label: 'Credential type', value: app.credential_type },
    { label: 'Jurisdictions', value: app.jurisdictions },
    { label: 'Bar number', value: app.bar_number },
    { label: 'Practice areas', value: app.practice_areas },
    { label: 'Capacity', value: app.capacity },
    { label: 'Applicant notes', value: app.notes },
  ]

  const documents: VerificationDoc[] = []
  if (app.profile_url) {
    documents.push({
      label: 'Public profile URL',
      url: app.profile_url as string,
      kind: classifyUrl(app.profile_url as string),
    })
  }
  if (app.malpractice_insurance) {
    documents.push({
      label: 'Malpractice insurance',
      url: app.malpractice_insurance as string,
      kind: classifyUrl(app.malpractice_insurance as string),
    })
  }

  return {
    id: app.id as string,
    type: 'attorney',
    status: (app.status as VerificationStatus) ?? 'pending',
    full_name: app.full_name,
    email: app.email,
    created_at: app.created_at as string,
    decided_at: app.decided_at,
    decision_notes: app.decision_notes,
    fields,
    documents,
    profile,
  }
}

async function loadConsultantBundle(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string
): Promise<VerificationBundle> {
  const profile = await loadProfile(db, profileId)
  if (!profile) throw new SupportActionError('not_found', 'Profile not found', 404)
  if (profile.role !== 'consultant') {
    throw new SupportActionError(
      'invalid_state',
      `Profile is role '${profile.role}', not 'consultant'`,
      409
    )
  }

  const { data: consultant } = await db
    .from('consultants')
    .select(
      'tagline, intro, jurisdictions, practice_areas, specialties, languages, education, timezone, years_experience, starting_price, offers_free_consult, headshot_url, video_intro_url'
    )
    .eq('profile_id', profileId)
    .maybeSingle()

  const c = (consultant ?? {}) as Record<string, unknown>

  const fields: VerificationApplicantField[] = [
    { label: 'Full name', value: profile.full_name },
    { label: 'Email', value: profile.email },
    { label: 'Tagline', value: (c.tagline as string | null) ?? null },
    { label: 'Intro', value: (c.intro as string | null) ?? null },
    { label: 'Jurisdictions', value: (c.jurisdictions as string | null) ?? null },
    { label: 'Practice areas', value: (c.practice_areas as string | null) ?? null },
    {
      label: 'Specialties',
      value: Array.isArray(c.specialties)
        ? (c.specialties as string[]).join(', ') || null
        : null,
    },
    {
      label: 'Languages',
      value: Array.isArray(c.languages)
        ? (c.languages as string[]).join(', ') || null
        : null,
    },
    { label: 'Education', value: (c.education as string | null) ?? null },
    { label: 'Timezone', value: (c.timezone as string | null) ?? null },
    {
      label: 'Years experience',
      value:
        typeof c.years_experience === 'number'
          ? String(c.years_experience)
          : null,
    },
    {
      label: 'Starting price',
      value:
        typeof c.starting_price === 'number'
          ? `$${(c.starting_price / 100).toFixed(2)}`
          : null,
    },
    {
      label: 'Free intro consult',
      value:
        typeof c.offers_free_consult === 'boolean'
          ? c.offers_free_consult
            ? 'Yes'
            : 'No'
          : null,
    },
  ]

  const documents: VerificationDoc[] = []
  if (typeof c.headshot_url === 'string' && c.headshot_url) {
    documents.push({
      label: 'Headshot',
      url: c.headshot_url,
      kind: classifyUrl(c.headshot_url),
    })
  }
  if (typeof c.video_intro_url === 'string' && c.video_intro_url) {
    documents.push({
      label: 'Video intro',
      url: c.video_intro_url,
      kind: 'link',
    })
  }

  return {
    id: profile.id,
    type: 'consultant',
    status: (profile.status as VerificationStatus) ?? 'pending',
    full_name: profile.full_name,
    email: profile.email,
    created_at: profile.created_at,
    decided_at: null,
    decision_notes: null,
    fields,
    documents,
    profile,
  }
}

async function loadProfile(
  db: ReturnType<typeof createSupabaseAdminClient>,
  id: string
): Promise<Profile | null> {
  const { data } = await db.from('profiles').select('*').eq('id', id).maybeSingle()
  return (data as Profile | null) ?? null
}

// ============================================================
// Decision actions — approve / request_changes / reject
// ============================================================

function validateNotes(notes: string): string {
  const trimmed = (notes ?? '').trim()
  if (trimmed.length < NOTES_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `notes must be at least ${NOTES_MIN} characters`,
      400
    )
  }
  return trimmed.slice(0, 2000)
}

async function decideAttorney(
  db: ReturnType<typeof createSupabaseAdminClient>,
  actor: Profile,
  id: string,
  action: VerificationAction,
  notes: string
): Promise<{ status: VerificationStatus }> {
  const { data: app, error: fetchErr } = await db
    .from('attorney_applications')
    .select(
      'id, profile_id, email, full_name, jurisdictions, practice_areas, status'
    )
    .eq('id', id)
    .single()
  if (fetchErr || !app) {
    throw new SupportActionError('not_found', 'Attorney application not found', 404)
  }
  if (app.status !== 'pending') {
    throw new SupportActionError(
      'invalid_state',
      `Application already ${app.status}`,
      409
    )
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    const { error: updErr } = await db
      .from('attorney_applications')
      .update({
        status: 'approved',
        decided_at: now,
        decided_by: actor.id,
        decision_notes: notes,
        last_reviewed_at: now,
      })
      .eq('id', id)
    if (updErr) {
      throw new SupportActionError('db_error', updErr.message, 500)
    }
    if (app.profile_id) {
      await db.from('profiles').update({ status: 'active' }).eq('id', app.profile_id)
      await db
        .from('attorneys')
        .upsert(
          {
            profile_id: app.profile_id,
            application_id: app.id,
            jurisdictions: app.jurisdictions,
            practice_areas: app.practice_areas,
          },
          { onConflict: 'profile_id' }
        )
    }
    await db
      .from('attorney_application_events')
      .insert({
        application_id: app.id,
        actor_id: actor.id,
        event_type: 'approve',
        from_status: app.status,
        to_status: 'approved',
        notes,
      })
      .then(
        () => null,
        () => null
      )
    return { status: 'approved' }
  }

  if (action === 'reject') {
    const { error: updErr } = await db
      .from('attorney_applications')
      .update({
        status: 'declined',
        decided_at: now,
        decided_by: actor.id,
        decision_notes: notes,
        last_reviewed_at: now,
      })
      .eq('id', id)
    if (updErr) throw new SupportActionError('db_error', updErr.message, 500)
    if (app.profile_id) {
      await db.from('profiles').update({ status: 'declined' }).eq('id', app.profile_id)
    }
    await db
      .from('attorney_application_events')
      .insert({
        application_id: app.id,
        actor_id: actor.id,
        event_type: 'decline',
        from_status: app.status,
        to_status: 'declined',
        notes,
      })
      .then(
        () => null,
        () => null
      )
    return { status: 'declined' }
  }

  // request_changes — keep application 'pending' but record the request and
  // bump last_reviewed_at so it falls off the "aged" view.
  const { error: updErr } = await db
    .from('attorney_applications')
    .update({
      decision_notes: notes,
      last_reviewed_at: now,
    })
    .eq('id', id)
  if (updErr) throw new SupportActionError('db_error', updErr.message, 500)
  await db
    .from('attorney_application_events')
    .insert({
      application_id: app.id,
      actor_id: actor.id,
      event_type: 'request_changes',
      from_status: app.status,
      to_status: app.status,
      notes,
    })
    .then(
      () => null,
      () => null
    )
  return { status: 'changes_requested' }
}

async function decideConsultant(
  db: ReturnType<typeof createSupabaseAdminClient>,
  _actor: Profile,
  id: string,
  action: VerificationAction,
  _notes: string
): Promise<{ status: VerificationStatus }> {
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('id', id)
    .single()
  if (error || !profile) {
    throw new SupportActionError('not_found', 'Profile not found', 404)
  }
  if (profile.role !== 'consultant') {
    throw new SupportActionError(
      'invalid_state',
      `Profile is role '${profile.role}', not 'consultant'`,
      409
    )
  }
  if (profile.status !== 'pending') {
    throw new SupportActionError(
      'invalid_state',
      `Consultant intake already ${profile.status}`,
      409
    )
  }

  if (action === 'approve') {
    const { error: upd } = await db
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', id)
    if (upd) throw new SupportActionError('db_error', upd.message, 500)
    // Ensure backing consultants row exists.
    await db
      .from('consultants')
      .upsert(
        {
          profile_id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
        },
        { onConflict: 'profile_id' }
      )
      .then(
        () => null,
        () => null
      )
    return { status: 'approved' }
  }

  if (action === 'reject') {
    const { error: upd } = await db
      .from('profiles')
      .update({ status: 'declined' })
      .eq('id', id)
    if (upd) throw new SupportActionError('db_error', upd.message, 500)
    return { status: 'declined' }
  }

  // request_changes — leave status pending; the audit log captures the
  // request and the macro-driven email (TODO Phase 8) will go out.
  return { status: 'changes_requested' }
}

async function decideEntry(
  actor: Profile,
  type: VerificationType,
  id: string,
  action: VerificationAction,
  notes: string
): Promise<{ status: VerificationStatus }> {
  if (type === 'id' || type === 'bar') {
    throw new SupportActionError(
      'not_supported',
      `Verification type '${type}' has no backing table yet`,
      400
    )
  }
  const db = createSupabaseAdminClient()
  const result =
    type === 'attorney'
      ? await decideAttorney(db, actor, id, action, notes)
      : await decideConsultant(db, actor, id, action, notes)

  await logSupportAction({
    action: `verification.${action}`,
    targetType: `verification:${type}`,
    targetId: id,
    reason: notes,
    metadata: { type, action, new_status: result.status },
  })

  // TODO (Phase 8): send macro-driven approval / decline / changes email.
  // Hook lives here once the email infra ships:
  //   await sendVerificationEmail({ type, action, applicantEmail, applicantName, notes })

  return result
}

export async function approveVerification(
  input: DecisionInput
): Promise<{ status: VerificationStatus }> {
  const actor = await requireSupportOrAdmin()
  const notes = validateNotes(input.notes)
  return decideEntry(actor, input.type, input.id, 'approve', notes)
}

export async function requestChangesVerification(
  input: DecisionInput
): Promise<{ status: VerificationStatus }> {
  const actor = await requireSupportOrAdmin()
  const notes = validateNotes(input.notes)
  return decideEntry(actor, input.type, input.id, 'request_changes', notes)
}

export async function rejectVerification(
  input: DecisionInput
): Promise<{ status: VerificationStatus }> {
  const actor = await requireSupportOrAdmin()
  const notes = validateNotes(input.notes)
  return decideEntry(actor, input.type, input.id, 'reject', notes)
}

// ============================================================
// Bulk assign — claim ownership of multiple queue rows at once
// ============================================================

export async function bulkAssignToMe(
  input: BulkAssignInput
): Promise<{ assigned: number; skipped: number }> {
  const actor = await requireSupportOrAdmin()
  if (!isValidType(input.type)) {
    throw new SupportActionError('invalid_input', 'Invalid verification type', 400)
  }
  const ids = Array.isArray(input.ids)
    ? input.ids.filter((s) => typeof s === 'string' && s.length > 0).slice(0, 200)
    : []
  if (ids.length === 0) {
    throw new SupportActionError('invalid_input', 'No ids provided', 400)
  }

  if (input.type !== 'attorney') {
    // Only attorney_applications has an assigned_to column today. Other
    // queues silently no-op (UI hides the bulk bar for them).
    return { assigned: 0, skipped: ids.length }
  }

  const db = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('attorney_applications')
    .update({ assigned_to: actor.id, last_reviewed_at: now })
    .in('id', ids)
    .select('id')
  if (error) throw new SupportActionError('db_error', error.message, 500)
  const assigned = (data ?? []).length

  // Audit-trail the bulk action.
  await logSupportAction({
    action: 'verification.bulk_assign',
    targetType: `verification:${input.type}`,
    targetId: ids[0],
    reason: undefined,
    metadata: { type: input.type, ids, assignee_id: actor.id },
  })

  return { assigned, skipped: ids.length - assigned }
}
