/**
 * Phase 8 — outbound transactional email via Resend's REST API.
 *
 * Intentionally avoids the Resend SDK so we don't bloat the Worker bundle
 * with another package. The single function exported here is the only seam
 * the rest of the codebase should use to talk to Resend.
 *
 * The sender domain (yousafeconsultancy.com) is already verified in Resend
 * for the portal Worker; the same key + sender is reused here.
 */

import { SupportActionError } from '@/lib/errors'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'YouSafe Support <support@yousafeconsultancy.com>'

export interface SendSupportEmailInput {
  to: string
  subject: string
  html: string
  replyTo?: string
  tags?: Record<string, string>
}

export interface SendSupportEmailResult {
  id: string
}

interface ResendSuccess {
  id: string
}

interface ResendError {
  name?: string
  message?: string
  statusCode?: number
}

function isEmail(value: string): boolean {
  // Conservative — Resend will reject malformed addresses anyway; this guards
  // against blatantly empty input before we burn an outbound call.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normaliseTags(
  tags: Record<string, string> | undefined
): Array<{ name: string; value: string }> | undefined {
  if (!tags) return undefined
  const out: Array<{ name: string; value: string }> = []
  for (const [k, v] of Object.entries(tags)) {
    // Resend tag names must be ASCII letters / digits / underscores; clamp
    // anything weirder so a stray macro id can't trip the API.
    const safeName = k.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32)
    const safeValue = v.replace(/[^a-zA-Z0-9_\-:.]/g, '_').slice(0, 64)
    if (safeName && safeValue) out.push({ name: safeName, value: safeValue })
  }
  return out.length > 0 ? out : undefined
}

/**
 * Send a transactional email via Resend.
 *
 * Throws SupportActionError if `RESEND_API_KEY` is missing or if Resend
 * returns a non-2xx response. Callers that don't want the action to fail on
 * email-send failures should wrap this in their own try/catch.
 */
export async function sendSupportEmail(
  input: SendSupportEmailInput
): Promise<SendSupportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new SupportActionError(
      'config_missing',
      'RESEND_API_KEY is not configured on this Worker',
      500
    )
  }
  if (!input.to || !isEmail(input.to)) {
    throw new SupportActionError('invalid_input', 'to is not a valid email', 400)
  }
  const subject = (input.subject ?? '').trim()
  if (!subject) {
    throw new SupportActionError('invalid_input', 'subject is required', 400)
  }
  const html = (input.html ?? '').trim()
  if (!html) {
    throw new SupportActionError('invalid_input', 'html is required', 400)
  }

  const body: Record<string, unknown> = {
    from: DEFAULT_FROM,
    to: [input.to],
    subject: subject.slice(0, 200),
    html,
  }
  if (input.replyTo && isEmail(input.replyTo)) {
    body.reply_to = input.replyTo
  }
  const tags = normaliseTags(input.tags)
  if (tags) body.tags = tags

  let res: Response
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new SupportActionError(
      'email_provider_unreachable',
      `Resend unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
      502
    )
  }

  const payload = (await res.json().catch(() => ({}))) as
    | ResendSuccess
    | ResendError
    | Record<string, unknown>

  if (!res.ok) {
    const message =
      (payload as ResendError).message ??
      `Resend returned HTTP ${res.status}`
    throw new SupportActionError(
      'email_send_failed',
      message,
      res.status >= 400 && res.status < 600 ? res.status : 502
    )
  }

  const id =
    typeof (payload as ResendSuccess).id === 'string'
      ? (payload as ResendSuccess).id
      : ''
  if (!id) {
    throw new SupportActionError(
      'email_send_failed',
      'Resend response missing id',
      502
    )
  }

  return { id }
}
