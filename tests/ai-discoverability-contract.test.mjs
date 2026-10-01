import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const robots = readFileSync(join(root, 'app/robots.ts'), 'utf8')
const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8')
const sitemap = readFileSync(join(root, 'app/sitemap.ts'), 'utf8')

const privatePaths = ['/api/', '/admin', '/dashboard', '/onboarding']

assert.equal(robots.includes('/_next/static/'), false)
assert.equal(robots.includes('GPTBot'), false)
assert.match(robots, /rules:\s*\[/)
assert.match(robots, /userAgent:\s*'\*'\s*,/)
assert.match(
  robots,
  /userAgent:\s*\[\s*'OAI-SearchBot'\s*,\s*'ChatGPT-User'\s*\]/,
)
assert.match(robots, /allow:\s*'\/'/)
for (const path of privatePaths) {
  assert.equal(robots.includes(`'${path}'`), true, `robots missing ${path}`)
}
assert.equal(robots.includes('disallow: PRIVATE_DISALLOW'), true)

const orgId = 'https://support.yousafeconsultancy.com/#organization'
const siteId = 'https://support.yousafeconsultancy.com/#website'
assert.match(layout, /'@graph':\s*\[/)
assert.equal(layout.includes("'@type': 'Organization'"), true)
assert.equal(layout.includes(`'@id': '${orgId}'`), true)
assert.equal(layout.includes("name: 'YouSafe Consultancy'"), true)
assert.equal(layout.includes("url: 'https://yousafeconsultancy.com'"), true)
assert.equal(layout.includes("'@type': 'WebSite'"), true)
assert.equal(layout.includes(`'@id': '${siteId}'`), true)
assert.equal(layout.includes("name: 'YouSafe Support'"), true)
assert.equal(
  layout.includes("url: 'https://support.yousafeconsultancy.com'"),
  true,
)
assert.match(
  layout,
  /publisher:\s*\{\s*'@id':\s*'https:\/\/support\.yousafeconsultancy\.com\/#organization'\s*,?\s*\}/,
)
assert.equal(layout.includes('streetAddress'), false)
assert.equal(layout.includes('telephone'), false)
assert.equal(layout.includes('email'), false)

assert.match(sitemap, /return \[\s*\{\s*url:\s*SITE_URL,/)
assert.equal(sitemap.includes("url: SITE_URL"), true)
assert.equal((sitemap.match(/url:/g) || []).length, 1)
assert.equal(sitemap.includes('https://support.yousafeconsultancy.com'), true)
for (const path of privatePaths) {
  assert.equal(sitemap.includes(path), false, `sitemap contains ${path}`)
}
assert.equal(sitemap.includes('/sign-in'), false)
assert.equal(sitemap.includes('/sign-up'), false)
assert.equal(sitemap.includes('/_next/'), false)

const graphStart = layout.indexOf("'@graph'")
const graphSlice = layout.slice(graphStart)
assert.equal(graphSlice.includes("'@type': 'Organization'"), true)
assert.ok(graphSlice.indexOf("'@type': 'Organization'") < graphSlice.indexOf("'@type': 'WebSite'"))
assert.ok(graphSlice.indexOf(orgId) < graphSlice.indexOf(siteId))
