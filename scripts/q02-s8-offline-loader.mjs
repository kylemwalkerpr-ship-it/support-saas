// Test-only dependency fallback; never imported by application code. No installs,
// no frozen-source writes, and no production package-resolution changes.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const frozen = createRequire('/Users/phantomdarne/.openhands-platform/yqaa-canonical/validation/q02-v7-frozen-source/package.json')
export async function resolve(specifier,context,nextResolve) {
  try { return await nextResolve(specifier,context) }
  catch (error) {
    if (specifier !== '@clerk/backend' || error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    return {url:pathToFileURL(frozen.resolve(specifier)).href,shortCircuit:true}
  }
}
