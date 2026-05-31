'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import { addUserNote } from '@/lib/actions/support-users'
import { getMacroById, renderMacroBody } from '@/lib/actions/support-macros'
import { sendSupportEmail } from '@/lib/email'
import type { Profile, SupportAuditLogEntry } from '@/lib/types'

// ============================================================
// Phase 8 — Outbound email to a user (macro-driven)
//
// Renders a Phase 5 macro against the target user, sends it via Resend,
// records audit `user.email_sent`, and appends a copy as a Phase 2 internal
// note so the email is visible from the User 360 Notes tab.
// ============================================================

const SUBJECT_DEFAULT = 'From YouSafe Support'
const SUBJECT_MAX = 200

export interface SendUserEmailInput {
  profileId: string
  macroId: string
  overrides?: {
    subject?: string
    replyTo?: string
  }
}

export interface SendUserEmailResult {
  emailId: string
  audit: SupportAuditLogEntry
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Convert a rendered macro body (plain text with token substitution already
 * applied) into a minimal HTML body Resend will accept. Paragraphs split on
 * blank lines; single newlines become `<br />`.
 */
function plainToHtml(rendered: string): string {
  const trimmed = rendered.trim()
  if (!trimmed) return ''
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

/**
 * Send an email to a YouSafe user using a saved support macro.
 *
 * Side effects:
 *   1. Outbound Resend send (throws if Resend fails).
 *   2. `user.email_sent` audit row attributed to the actor.
 *   3. Internal note appended to the user 360 so the conversation lives in
 *      one place.
 */
export async function sendUserEmail(
  input: SendUserEmailInput
): Promise<SendUserEmailResult> {
  const actor = await requireSupportOrAdmin()

  if (!input.profileId || typeof input.profileId !== 'string') {
    throw new SupportActionError('invalid_input', 'profileId is required', 400)
  }
  if (!input.macroId || typeof input.macroId !== 'string') {
    throw new SupportActionError('invalid_input', 'macroId is required', 400)
  }

  const db = createSupabaseAdminClient()
  const { data: target, error: profileErr } = await db
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', input.profileId)
    .maybeSingle()
  if (profileErr) {
    throw new SupportActionError('db_error', profileErr.message, 500)
  }
  if (!target) {
    throw new SupportActionError('not_found', 'Target profile not found', 404)
  }
  if (!target.email) {
    throw new SupportActionError(
      'invalid_state',
      'Target profile has no email on file',
      422
    )
  }

  // getMacroById enforces RBAC (support/admin + ownership rules) and so does
  // a redundant ACL check beyond the requireSupportOrAdmin gate above.
  const macro = await getMacroById(input.macroId)

  // Build the render context. Token paths supported in Phase 5:
  //   {{customer.first_name}}, {{customer.last_name}}, {{customer.full_name}},
  //   {{customer.email}}, {{agent.name}}, {{agent.email}}.
  const fullName = (target.full_name ?? '').trim()
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : ['']
  const lastName = rest.join(' ') || null
  const renderCtx = {
    customer: {
      first_name: firstName || null,
      last_name: lastName,
      full_name: fullName || null,
      email: target.email,
    },
    agent: {
      name: actor.full_name ?? null,
      email: actor.email ?? null,
    },
  }
  const renderedBody = await renderMacroBody(macro.body, renderCtx)

  const subjectRaw = (input.overrides?.subject ?? '').trim()
  const subject = (subjectRaw || SUBJECT_DEFAULT).slice(0, SUBJECT_MAX)
  const replyTo = input.overrides?.replyTo?.trim() || undefined

  const html = plainToHtml(renderedBody)

  const sent = await sendSupportEmail({
    to: target.email,
    subject,
    html,
    replyTo,
    tags: {
      source: 'support_saas',
      macro_id: macro.id,
    },
  })

  const audit = await logSupportAction({
    action: 'user.email_sent',
    targetType: 'profile',
    targetId: input.profileId,
    reason: subject,
    metadata: {
      macro_id: macro.id,
      macro_title: macro.title,
      email_id: sent.id,
      subject,
      reply_to: replyTo ?? null,
    },
  })

  // Best-effort: drop a copy of the outbound into the user 360 notes tab so
  // future agents see what was sent. Failure here must not unwind the send.
  try {
    const noteBody = [
      `[email sent] ${subject}`,
      `via macro: ${macro.title}`,
      '---',
      renderedBody,
    ].join('\n')
    await addUserNote({ profileId: input.profileId, body: noteBody })
  } catch (err) {
    console.warn('[sendUserEmail] failed to append note', err)
  }

  return { emailId: sent.id, audit }
}
