// Per-conversation visitor secret for the public chat widget routes
// (/api/chat/widget and /api/chat/widget/[id]).
//
// Why: those routes are public (no Clerk session) and used to return or append
// to any conversation by its UUID alone. Anyone holding a conversation id could
// read the whole transcript (visitor name/email/phone included) or post into it.
//
// Now the POST that creates a conversation mints a random 256-bit token, stores
// only its SHA-256 hash (chat_conversations.visitor_token_hash, migration 013),
// and returns the raw token once as `visitorToken`. The visitor's browser keeps
// it (widget localStorage) and sends it back as the `X-Chat-Token` header. The
// server re-hashes and compares in constant time. Conversations without a hash
// (created before this change) can no longer be opened from the widget; the
// widget starts a fresh chat instead. Staff keep access through the
// Clerk-authenticated /api/support/* and dashboard APIs.
//
// Pure + dependency-injected (db is a supabase-js client) so the access rules
// are unit tested in tests/widget-auth.test.mjs. WebCrypto only, so it runs
// unchanged on Cloudflare Workers and in Node 22.

export const TOKEN_HEADER = 'x-chat-token'
export const TOKEN_HASH_COLUMN = 'visitor_token_hash'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/
// The support site serves the widget itself; the YouSafe Quick Assistance
// Agent (portal /assistant.js) embeds on YouSafe sister sites and polls the
// same routes once it hands a visitor to live support. Never a wildcard, and
// no credentials (the token travels in a header, not a cookie).
const ALLOWED_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*yousafeconsultancy\.com$/
export const DEFAULT_ORIGIN = 'https://support.yousafeconsultancy.com'

export function isConversationId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function toHex(bytes) {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function toBase64Url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 random bytes, base64url (43 chars). */
export function generateVisitorToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/** SHA-256 hex of the token; only this is stored. */
export async function hashVisitorToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)))
  return toHex(new Uint8Array(digest))
}

/** Constant-time string comparison (length is not secret: both are 64-char hex digests). */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** Token from the X-Chat-Token header; null when absent or malformed. */
export function readVisitorToken(request) {
  const raw = request?.headers?.get?.(TOKEN_HEADER)
  if (typeof raw !== 'string') return null
  const token = raw.trim()
  return TOKEN_RE.test(token) ? token : null
}

/** True only when `token` hashes to the conversation's stored hash. Legacy rows (no hash) never match. */
export async function tokenMatches(storedHash, token) {
  if (typeof storedHash !== 'string' || storedHash.length !== 64 || !token) return false
  return constantTimeEqual(await hashVisitorToken(token), storedHash)
}

export function corsHeadersFor(request, methods) {
  const origin = request?.headers?.get?.('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN_RE.test(origin) ? origin : DEFAULT_ORIGIN,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, X-Chat-Token',
    'Access-Control-Max-Age': '600',
  }
}

/** Conversation row safe to send to the visitor (never the token hash). */
export function publicConversation(row) {
  if (!row) return null
  const { [TOKEN_HASH_COLUMN]: _hash, ...rest } = row
  return rest
}

/**
 * The conversation if (and only if) `token` is its visitor token; otherwise null.
 * Unknown id, legacy conversation, wrong token: all null, indistinguishable.
 */
export async function authorizeConversation(db, conversationId, token) {
  if (!isConversationId(conversationId) || !token) return null
  const { data, error } = await db
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (error || !data) return null
  return (await tokenMatches(data[TOKEN_HASH_COLUMN], token)) ? data : null
}

/** Conversation + messages + queue payload returned by both widget routes. */
export async function loadWidgetPayload(db, conversationId, estimateWaitMinutes) {
  const [{ data: conversation }, { data: messages }, { count }] = await Promise.all([
    db.from('chat_conversations').select('*').eq('id', conversationId).single(),
    db
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    db
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting_for_agent'),
  ])
  const position = conversation?.status === 'waiting_for_agent' ? count || 1 : 0
  return {
    conversation: publicConversation(conversation),
    messages: messages ?? [],
    queue: {
      position,
      estimatedWaitMinutes: position ? estimateWaitMinutes(position, 0) : 0,
    },
  }
}

/**
 * GET /api/chat/widget/[id]. 401 without a token, 404 for an unknown id,
 * legacy conversation or wrong token, 200 with the transcript otherwise.
 */
export async function handleWidgetGet({ db, conversationId, token, estimateWaitMinutes }) {
  if (!token) return { status: 401, body: { error: 'Chat token required' } }
  const conversation = await authorizeConversation(db, conversationId, token)
  if (!conversation) return { status: 404, body: { error: 'Conversation not found' } }
  return { status: 200, body: await loadWidgetPayload(db, conversationId, estimateWaitMinutes) }
}
