import { authorizeConversation } from '../chat/widgetAuth.mjs'

// A stolen visitor capability still grants that chat's access; it never proves
// an account identity. Clerk/provider/staff identity alone cannot use this API.
export async function reviewVisitorPrivacy({ db, conversationId, token }) {
  if (!await authorizeConversation(db, conversationId, token)) return { status: 404, body: { error: 'Conversation not found' } }
  return { status: 200, body: {
    authority: 'this-conversation-only', accountLinked: false,
    memoryLinking: 'unavailable',
    retention: 'Support transcripts and commercial/legal audit records have separate retention. No deletion schedule is approved by this contract.',
    forgetAvailable: false,
  } }
}
// Never delete a transcript, revoke another chat, or infer a portal identity.
export async function forgetVisitorPrivacy(input) {
  const review = await reviewVisitorPrivacy(input)
  if (review.status !== 200) return review
  return { status: 409, body: { error: 'Transcript retention policy required; no records deleted' } }
}
