// Public chat widget access control: a conversation is readable/extendable only
// with its own visitor token (lib/chat/widgetAuth.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  authorizeConversation,
  constantTimeEqual,
  corsHeadersFor,
  generateVisitorToken,
  handleWidgetGet,
  hashVisitorToken,
  publicConversation,
  readVisitorToken,
  tokenMatches,
} from '../lib/chat/widgetAuth.mjs'

const CONV_ID = '12565d9f-1c13-4322-a540-c62e3e0ae153'
const LEGACY_ID = '4f08b7ad-400d-408b-b893-05fbf4bc14ad'
const estimate = (p) => p * 4

// Minimal supabase-js stand-in: from(table).select().eq().order()/maybeSingle()/single()/head count.
function fakeDb(tables) {
  return {
    from(table) {
      const filters = []
      let head = false
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
      const q = {
        select(_cols, opts) { head = !!opts?.head; return q },
        eq(k, v) { filters.push([k, v]); return q },
        order() { return q },
        async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
        async single() { const r = rows()[0]; return r ? { data: r, error: null } : { data: null, error: { message: 'no rows' } } },
        then(resolve, reject) {
          const r = rows()
          return Promise.resolve(head ? { data: null, count: r.length } : { data: r, count: r.length }).then(resolve, reject)
        },
      }
      return q
    },
  }
}

async function seed() {
  const token = generateVisitorToken()
  const db = fakeDb({
    chat_conversations: [
      { id: CONV_ID, status: 'ai_active', visitor_email: 'visitor@example.com', visitor_token_hash: await hashVisitorToken(token) },
      { id: LEGACY_ID, status: 'waiting_for_agent', visitor_email: 'legacy@example.com', visitor_token_hash: null },
    ],
    chat_messages: [
      { id: 'm1', conversation_id: CONV_ID, sender_type: 'visitor', body: 'hello' },
      { id: 'm2', conversation_id: CONV_ID, sender_type: 'ai', body: 'hi there' },
      { id: 'm3', conversation_id: LEGACY_ID, sender_type: 'visitor', body: 'legacy secret' },
    ],
  })
  return { db, token }
}

test('tokens are 256-bit base64url; only the SHA-256 hex is stored', async () => {
  const a = generateVisitorToken()
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, generateVisitorToken())
  const h = await hashVisitorToken(a)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, a)
})

test('constant-time compare and token matching', async () => {
  assert.equal(constantTimeEqual('abc', 'abc'), true)
  assert.equal(constantTimeEqual('abc', 'abd'), false)
  assert.equal(constantTimeEqual('abc', 'abcd'), false)
  assert.equal(constantTimeEqual(null, 'x'), false)
  const t = generateVisitorToken()
  assert.equal(await tokenMatches(await hashVisitorToken(t), t), true)
  assert.equal(await tokenMatches(await hashVisitorToken(t), generateVisitorToken()), false)
  assert.equal(await tokenMatches(null, t), false, 'legacy rows never match')
  assert.equal(await tokenMatches('', t), false)
})

test('X-Chat-Token header parsing rejects malformed values', () => {
  const req = (v) => new Request('https://support.yousafeconsultancy.com/api/chat/widget/x', { headers: v == null ? {} : { 'X-Chat-Token': v } })
  const t = generateVisitorToken()
  assert.equal(readVisitorToken(req(t)), t)
  assert.equal(readVisitorToken(req(null)), null)
  assert.equal(readVisitorToken(req('short')), null)
  assert.equal(readVisitorToken(req('x'.repeat(200))), null)
  assert.equal(readVisitorToken(req('bad token with spaces and more chars!!')), null)
})

test('GET without a token -> 401, no transcript', async () => {
  const { db } = await seed()
  const r = await handleWidgetGet({ db, conversationId: CONV_ID, token: null, estimateWaitMinutes: estimate })
  assert.equal(r.status, 401)
  assert.equal(r.body.messages, undefined)
  assert.equal(r.body.conversation, undefined)
})

test('GET with a wrong token -> 404, no transcript', async () => {
  const { db } = await seed()
  const r = await handleWidgetGet({ db, conversationId: CONV_ID, token: generateVisitorToken(), estimateWaitMinutes: estimate })
  assert.equal(r.status, 404)
  assert.equal(r.body.messages, undefined)
})

test("GET with another conversation's token -> 404", async () => {
  const { db, token } = await seed()
  const r = await handleWidgetGet({ db, conversationId: LEGACY_ID, token, estimateWaitMinutes: estimate })
  assert.equal(r.status, 404)
})

test('GET for a legacy (pre-token) conversation -> 404 whatever token is sent', async () => {
  const { db } = await seed()
  for (const token of [generateVisitorToken(), '0'.repeat(64)]) {
    const r = await handleWidgetGet({ db, conversationId: LEGACY_ID, token, estimateWaitMinutes: estimate })
    assert.equal(r.status, 404)
  }
})

test('GET for an unknown or malformed id -> 404', async () => {
  const { db, token } = await seed()
  for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid', "1' or '1'='1"]) {
    const r = await handleWidgetGet({ db, conversationId: id, token, estimateWaitMinutes: estimate })
    assert.equal(r.status, 404)
  }
})

test('GET with the right token -> 200 with the conversation, minus the token hash', async () => {
  const { db, token } = await seed()
  const r = await handleWidgetGet({ db, conversationId: CONV_ID, token, estimateWaitMinutes: estimate })
  assert.equal(r.status, 200)
  assert.equal(r.body.conversation.id, CONV_ID)
  assert.equal('visitor_token_hash' in r.body.conversation, false)
  assert.deepEqual(r.body.messages.map((m) => m.id), ['m1', 'm2'])
  assert.deepEqual(r.body.queue, { position: 0, estimatedWaitMinutes: 0 })
})

test('POST continuation is only authorized with the matching token', async () => {
  const { db, token } = await seed()
  assert.equal((await authorizeConversation(db, CONV_ID, token))?.id, CONV_ID)
  assert.equal(await authorizeConversation(db, CONV_ID, null), null)
  assert.equal(await authorizeConversation(db, CONV_ID, generateVisitorToken()), null)
  assert.equal(await authorizeConversation(db, LEGACY_ID, token), null)
})

test('publicConversation strips the hash', () => {
  assert.deepEqual(publicConversation({ id: 'a', visitor_token_hash: 'h' }), { id: 'a' })
  assert.equal(publicConversation(null), null)
})

test('CORS: YouSafe origins only, never a wildcard, token header allowed', () => {
  const h = (origin) => corsHeadersFor(new Request('https://support.yousafeconsultancy.com/', { headers: origin ? { origin } : {} }), 'GET, OPTIONS')
  assert.equal(h('https://portal.yousafeconsultancy.com')['Access-Control-Allow-Origin'], 'https://portal.yousafeconsultancy.com')
  assert.equal(h('https://yousafeconsultancy.com')['Access-Control-Allow-Origin'], 'https://yousafeconsultancy.com')
  for (const bad of ['https://evil.com', 'https://yousafeconsultancy.com.evil.com', 'http://portal.yousafeconsultancy.com', 'https://evilyousafeconsultancy.com', null]) {
    assert.equal(h(bad)['Access-Control-Allow-Origin'], 'https://support.yousafeconsultancy.com')
  }
  assert.match(h(null)['Access-Control-Allow-Headers'], /X-Chat-Token/)
  assert.equal(h(null)['Access-Control-Allow-Credentials'], undefined)
})

test('wiring: both widget routes enforce the token; the widget sends it', () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
  const get = src('../app/api/chat/widget/[id]/route.ts')
  assert.match(get, /handleWidgetGet\(/)
  assert.match(get, /readVisitorToken\(request\)/)
  assert.doesNotMatch(get, /from\('chat_messages'\)/, 'GET must not read messages outside handleWidgetGet')
  const post = src('../app/api/chat/widget/route.ts')
  assert.match(post, /authorizeConversation\(db, conversationId, readVisitorToken\(request\)\)/)
  assert.match(post, /visitor_token_hash: await hashVisitorToken\(visitorToken\)/)
  assert.doesNotMatch(post, /\.eq\('id', conversationId\)\s*\.maybeSingle\(\)/, 'no unauthenticated conversation lookup')
  const widget = src('../components/chat/customer-chat-widget.tsx')
  assert.match(widget, /'X-Chat-Token'/)
  assert.match(widget, /data\.visitorToken/)
  assert.match(src('../supabase/migrations/013_widget_visitor_token.sql'), /add column if not exists visitor_token_hash text/)
})
