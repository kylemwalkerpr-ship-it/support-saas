// Only server-owned configuration and a service-role client may enter here.
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)
export function deploymentScope(env) {
  if (env.Q02_SUPPORT_SCOPE_VERSION !== '1' || !id(env.Q02_SUPPORT_SITE) || !id(env.Q02_SUPPORT_TENANT)) return null
  return Object.freeze({ site: env.Q02_SUPPORT_SITE, tenant: env.Q02_SUPPORT_TENANT })
}
export async function lookupMembership(db, scope, session) {
  if (!scope || !session?.sid || !/^user_[A-Za-z0-9_-]{1,123}$/.test(session.sub)) return null
  const { data, error } = await db.rpc('support_privacy_membership', {
    p_site: scope.site, p_tenant: scope.tenant, p_subject: session.sub,
  })
  if (error || !data || data.version !== 1 || data.subject !== session.sub || data.site !== scope.site || data.tenant !== scope.tenant ||
      !['active', 'suspended', 'revoked'].includes(data.status) || typeof data.issuance !== 'boolean' || data.withdrawal !== true) return null
  return Object.freeze(data)
}
