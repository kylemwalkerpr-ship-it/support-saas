// Shared support authorization rules. Admin accounts are not lifecycle
// suspended through the support-agent workflow; support accounts must remain
// active for every support action, including the audit viewer.
export function canAccessSupportSurface(profile) {
  if (!profile || (profile.role !== 'support' && profile.role !== 'admin')) return false
  return profile.role === 'admin' || profile.status === 'active'
}

export function supportAccessDenial(profile) {
  if (!profile) return { code: 'unauthorized', status: 401, message: 'No authenticated profile' }
  if (profile.role === 'support' && profile.status !== 'active') {
    return { code: 'forbidden', status: 403, message: 'Support account is not active' }
  }
  if (profile.role !== 'support' && profile.role !== 'admin') {
    return { code: 'forbidden', status: 403, message: `Role '${profile.role}' is not permitted on this surface` }
  }
  return null
}
