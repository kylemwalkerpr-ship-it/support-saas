// Q02-V040-REVOCATION
// Anonymous follow-up boundary only: this does not test Q02 membership or reciprocal consent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  authorizeConversation,
  generateVisitorToken,
  handleWidgetGet,
  hashVisitorToken,
  resolveWidgetPostTarget,
} from '../lib/chat/widgetAuth.mjs'

const CONVERSATION_A = '12565d9f-1c13-4322-a540-c62e3e0ae153'
const CONVERSATION_B = '4f08b7ad-400d-408b-b893-05fbf4bc14ad'
const LEGACY_CONVERSATION = '3d4fe1a2-2c31-4810-a8f0-745e0dbb89b7'

// A small supabase-js fixture with observable writes. Each authorization lookup
// and transcript query is scoped exactly as the production helper requests it.
function memoryDb(tables) {
  const writes = []
  return {
    writes,
    __tables: tables,
    from(table) {
      const filters = []
      let head = false
      const matches = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value))
      const query = {
        select(_columns, options) { head = Boolean(options?.head); return query },
        eq(key, value) { filters.push([key, value]); return query },
        order() { return query },
        async maybeSingle() { return { data: matches()[0] ?? null, error: null } },
        async single() {
          const row = matches()[0]
          return row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } }
        },
        update(payload) {
          writes.push({ operation: 'update', table, payload, filters: [...filters] })
          return query
        },
        insert(payload) {
          writes.push({ operation: 'insert', table, payload })
          return query
        },
        then(resolve, reject) {
          const rows = matches()
          return Promise.resolve(head
            ? { data: null, count: rows.length }
            : { data: rows, count: rows.length }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

async function fixture() {
  const tokenA = generateVisitorToken()
  const tokenB = generateVisitorToken()
  const db = memoryDb({
    chat_conversations: [
      { id: CONVERSATION_A, status: 'ai_active', visitor_email: 'a@example.test', visitor_token_hash: await hashVisitorToken(tokenA) },
      { id: CONVERSATION_B, status: 'waiting_for_agent', visitor_email: 'b@example.test', visitor_token_hash: await hashVisitorToken(tokenB) },
      { id: LEGACY_CONVERSATION, status: 'waiting_for_agent', visitor_email: 'legacy@example.test', visitor_token_hash: null },
    ],
    chat_messages: [
      { id: 'a-visitor', conversation_id: CONVERSATION_A, sender_type: 'visitor', body: 'A private transcript' },
      { id: 'a-ai', conversation_id: CONVERSATION_A, sender_type: 'ai', body: 'A private reply' },
      { id: 'b-visitor', conversation_id: CONVERSATION_B, sender_type: 'visitor', body: 'B private transcript' },
      { id: 'legacy-visitor', conversation_id: LEGACY_CONVERSATION, sender_type: 'visitor', body: 'legacy private transcript' },
    ],
  })
  return { db, tokenA, tokenB }
}

const estimateWaitMinutes = (position) => position * 4

test("A's token never exposes B's conversation or transcript", async () => {
  const { db, tokenA } = await fixture()
  const response = await handleWidgetGet({ db, conversationId: CONVERSATION_B, token: tokenA, estimateWaitMinutes })

  assert.equal(response.status, 404)
  assert.equal(response.body.conversation, undefined)
  assert.equal(response.body.messages, undefined)
  assert.equal(JSON.stringify(response.body).includes('B private transcript'), false)
  assert.deepEqual(db.writes, [])
})

test('authorization and GET both fail closed for missing or wrong visitor tokens', async () => {
  const { db, tokenA } = await fixture()

  assert.equal(await authorizeConversation(db, CONVERSATION_A, null), null)
  assert.equal(await authorizeConversation(db, CONVERSATION_A, ''), null)
  assert.equal(await authorizeConversation(db, CONVERSATION_A, generateVisitorToken()), null)
  assert.equal((await handleWidgetGet({ db, conversationId: CONVERSATION_A, token: null, estimateWaitMinutes })).status, 401)
  assert.equal((await handleWidgetGet({ db, conversationId: CONVERSATION_A, token: generateVisitorToken(), estimateWaitMinutes })).status, 404)
  assert.equal((await handleWidgetGet({ db, conversationId: CONVERSATION_A, token: tokenA, estimateWaitMinutes })).status, 200)
})

test('a valid visitor token returns only its own conversation and messages', async () => {
  const { db, tokenA } = await fixture()
  const response = await handleWidgetGet({ db, conversationId: CONVERSATION_A, token: tokenA, estimateWaitMinutes })

  assert.equal(response.status, 200)
  assert.equal(response.body.conversation.id, CONVERSATION_A)
  assert.equal('visitor_token_hash' in response.body.conversation, false)
  assert.deepEqual(response.body.messages.map((message) => message.id), ['a-visitor', 'a-ai'])
  assert.equal(JSON.stringify(response.body).includes('B private transcript'), false)
})

test('pre-token legacy conversations are denied even when a syntactically valid token is supplied', async () => {
  const { db, tokenA } = await fixture()

  assert.equal(await authorizeConversation(db, LEGACY_CONVERSATION, tokenA), null)
  const response = await handleWidgetGet({ db, conversationId: LEGACY_CONVERSATION, token: tokenA, estimateWaitMinutes })
  assert.equal(response.status, 404)
  assert.equal(response.body.messages, undefined)
  assert.equal(db.writes.length, 0)
})

test('an authorization denial performs no write against another visitor conversation', async () => {
  const { db, tokenA } = await fixture()
  const target = await resolveWidgetPostTarget(db, CONVERSATION_B, tokenA)

  assert.deepEqual(target, { conversationId: undefined, existingStatus: null, restarted: true })
  assert.notEqual(target.conversationId, CONVERSATION_B, 'production POST must take its create-new branch')
  assert.deepEqual(db.writes, [])
})

test('cross-user retry starts a fresh conversation; only the owning token continues', async () => {
  const { db, tokenA, tokenB } = await fixture()
  const stolenRetry = await resolveWidgetPostTarget(db, CONVERSATION_B, tokenA)
  const ownerRetry = await resolveWidgetPostTarget(db, CONVERSATION_B, tokenB)

  assert.equal(stolenRetry.restarted, true)
  assert.equal(stolenRetry.conversationId, undefined)
  assert.equal(stolenRetry.existingStatus, null)
  assert.deepEqual(ownerRetry, {
    conversationId: CONVERSATION_B,
    existingStatus: 'waiting_for_agent',
    restarted: false,
  })
  assert.deepEqual(db.writes, [])
})

test('resolved and closed conversations restart even for their former owner', async () => {
  const { db, tokenA } = await fixture()
  const table = db.__tables
  // Status is a live policy input just like the route's database row.
  table.chat_conversations.find((row) => row.id === CONVERSATION_A).status = 'resolved'
  assert.deepEqual(await resolveWidgetPostTarget(db, CONVERSATION_A, tokenA), {
    conversationId: undefined, existingStatus: null, restarted: true,
  })
})
