// Server-owned adapter. db MUST be the service-only client; never a browser client.
// No direct table access, local state fallback, or consume/redemption capability.
export function createPrivacyStore(db, { session, membership }) {
  const fail = () => { throw new Error('Privacy authorization denied') }
  if (!session?.sid || membership?.subject !== session?.sub) fail()
  const base = { p_site: membership.site, p_tenant: membership.tenant, p_subject: session.sub }
  async function rpc(name, args) {
    const { data, error } = await db.rpc(name, args)
    if (error) fail()
    return data
  }
  async function transition(action, epoch, scopes, extra = {}) {
    if (!['grant', 'withdraw', 'reserve'].includes(action)) fail()
    const result = await rpc('support_privacy_transition', { ...base, p_action: action, p_expected_epoch: epoch, p_scopes: scopes, ...extra })
    if (!Number.isSafeInteger(result) || result !== epoch + (action === 'reserve' ? 0 : 1)) fail()
    return result
  }
  return {
    review: () => rpc('support_privacy_review', base),
    transition: (action, epoch, scopes) => transition(action, epoch, scopes),
    reserve: async p => {
      if (p.sub !== session.sub || p.site !== membership.site || p.tenant !== membership.tenant) fail()
      await transition('reserve', p.epoch, p.scopes, { p_jti: p.jti, p_nonce: p.nonce, p_issued_at: new Date(p.iat * 1000).toISOString(), p_expires_at: new Date(p.exp * 1000).toISOString() })
      return true
    },
  }
}
