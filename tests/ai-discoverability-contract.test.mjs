import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const robots = readFileSync(join(root, 'app/robots.ts'), 'utf8')
const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8')
const sitemap = readFileSync(join(root, 'app/sitemap.ts'), 'utf8')
const llms = readFileSync(join(root, 'public/llms.txt'), 'utf8')

const privatePaths = [
  '/api/', '/admin', '/audit', '/dashboard', '/disputes', '/inbox',
  '/inquiries', '/macros', '/metrics', '/moderation', '/onboarding',
  '/orders', '/settings', '/users', '/verifications',
]
const answerAgents = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'Perplexity-User', 'Claude-User',
  'Claude-SearchBot', 'ClaudeBot',
]

assert.equal(robots.includes('/_next/static/'), false)
assert.ok(robots.includes("userAgent: '*'"))
for (const agent of answerAgents) assert.ok(robots.includes("'" + agent + "'"), 'robots missing ' + agent)
for (const path of privatePaths) assert.ok(robots.includes("'" + path + "'"), 'robots missing ' + path)
assert.ok(robots.includes('disallow: PRIVATE_DISALLOW'))
assert.ok(robots.includes('PUBLIC_AI_CRAWLERS'))

const orgId = 'https://yousafeconsultancy.com/#organization'
const siteId = 'https://support.yousafeconsultancy.com/#website'
assert.ok(layout.includes("'@graph'"))
assert.ok(layout.includes("'@id': '" + orgId + "'"))
assert.ok(layout.includes("'@id': '" + siteId + "'"))
assert.ok(layout.includes("name: 'YouSafe Consultancy'"))
assert.ok(layout.includes("name: 'YouSafe Support'"))
assert.ok(layout.includes("publisher: {"))
assert.ok(layout.includes("'@id': 'https://yousafeconsultancy.com/#organization'"))

assert.ok(sitemap.includes('url: SITE_URL'))
assert.equal((sitemap.match(/url:/g) || []).length, 1)
for (const path of privatePaths) assert.equal(sitemap.includes(path), false, 'sitemap contains ' + path)
assert.equal(sitemap.includes('/sign-in'), false)
assert.equal(sitemap.includes('/sign-up'), false)

assert.match(llms, /public landing page/i)
assert.match(llms, /private operational surfaces/i)
assert.ok(llms.includes('https://support.yousafeconsultancy.com/'))
assert.ok(llms.includes('https://market.yousafeconsultancy.com/'))
assert.ok(llms.includes('https://legal.yousafeconsultancy.com/'))
assert.equal(llms.includes('/dashboard'), false)
assert.equal(llms.includes('/sign-in'), false)
assert.match(llms, /checkout\.yousafeconsultancy\.com is retired/i)
