import { handleRuntimePrivacy } from '@/lib/privacy/runtime'

// Uses only established Request/Response and Promise params conventions.
async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  return handleRuntimePrivacy(request, action)
}
export const GET = handle
export const POST = handle
