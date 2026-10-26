import { readVisitorToken, corsHeadersFor, isConversationId, tokenMatches } from '../chat/widgetAuth.mjs'
import { PRIVACY_HEADERS } from './account-api.mjs'

export async function handleVisitorPrivacy(request, conversationId, createDb) {
  const notFound = { status: 404, body: { error: 'Conversation not found' } }
  let result = notFound
  try {
    const token = readVisitorToken(request)
    if (token && isConversationId(conversationId)) {
      const { data, error } = await createDb().from('chat_conversations')
        .select('visitor_token_hash').eq('id', conversationId).maybeSingle()
      if (!error && data && await tokenMatches(data.visitor_token_hash, token)) {
        result = { status: 200, body: {
          authority: 'this-conversation-only', accountLinked: false,
          memoryLinking: 'unavailable', forgetAvailable: false,
          retention: 'Support transcripts and commercial/legal audit records have separate retention. No deletion schedule is approved; no records deleted.',
        } }
      }
    }
  } catch { /* Do not disclose database/configuration errors or conversation existence. */ }
  return new Response(JSON.stringify(result.body), { status: result.status,
    headers: { ...PRIVACY_HEADERS, ...corsHeadersFor(request, 'GET, OPTIONS'), Vary: 'Origin, X-Chat-Token' } })
}

export function visitorPrivacyOptions(request) {
  return new Response(null, { status: 204, headers: { ...PRIVACY_HEADERS,
    ...corsHeadersFor(request, 'GET, OPTIONS') } })
}
