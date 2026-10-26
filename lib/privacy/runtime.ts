import 'server-only'
import { verifyToken } from '@clerk/nextjs/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createLinkRuntime } from './link-runtime.mjs'
import { handleLinkRequest } from './link-api.mjs'
import { linkResponse } from './link-wire.mjs'

export async function handleRuntimePrivacy(request: Request, action: string) {
  try {
    let binding
    try {
      const { env } = await getCloudflareContext({ async: true })
      binding = (env as unknown as Record<string, unknown>).Q02_CHECKPOINTS
    } catch { /* Local runtime has no external checkpoint; stage stays denied. */ }
    const runtime = createLinkRuntime({ site: 'support', env: process.env, verifyToken, checkpointBinding: binding })
    return handleLinkRequest(request, action === 'redeem' ? 'consume' : action, runtime)
  } catch { return linkResponse({ error: 'Privacy dependencies unavailable', derivedUse: false }, 503) }
}
