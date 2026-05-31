// ============================================================
// Shared errors — Phase 10
// ============================================================
//
// Plain module (NOT 'use server') so it can host non-async exports
// like `SupportActionError`. Server-action files (`'use server'`)
// are only allowed to export async functions in Next 16+, so the
// class previously lived in `lib/actions/support-audit.ts` had to
// move out. That file re-exports `SupportActionError` from here for
// backward compatibility.
// ============================================================

/**
 * Typed error thrown by every support action. The HTTP layer
 * (route handlers) maps `httpStatus` to the response status and
 * `code` to a stable machine-readable identifier the UI can key on
 * (e.g. `requires_admin_co_sign`, `forbidden`, `not_found`).
 */
export class SupportActionError extends Error {
  readonly code: string
  readonly httpStatus: number

  constructor(code: string, message: string, httpStatus = 403) {
    super(message)
    this.name = 'SupportActionError'
    this.code = code
    this.httpStatus = httpStatus
  }
}
