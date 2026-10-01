import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const robots = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const llms = readFileSync(new URL('../public/llms.txt', import.meta.url), 'utf8')
const checkout = readFileSync(
  new URL('../docs/CHECKOUT_RETIREMENT_2026-09-10.md', import.meta.url),
  'utf8',
)

const DISALLOW = ["'/api/'", "'/admin'", "'/dashboard'", "'/onboarding'", "'/_next/static/'"]
const AGENTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
]

test('robots keeps the wildcard rule and named crawlers with the same exclusions', () => {
  assert.match(robots, /userAgent:\s*'\*'/) 
  assert.match(robots, /allow:\s*'\/'/)
  for (const path of DISALLOW) assert.ok(robots.includes(path), path)
  for (const agent of AGENTS) assert.ok(robots.includes(`'${agent}'`), agent)
  assert.match(robots, /NAMED_CRAWLERS\.map/)
  assert.ok(robots.includes('https://support.yousafeconsultancy.com/sitemap.xml') || robots.includes('${SITE_URL}/sitemap.xml'))
})

test('layout JSON-LD is an organization and support website graph', () => {
  assert.match(layout, /'@graph'/) 
  assert.ok(layout.includes('https://yousafeconsultancy.com/#organization'))
  assert.ok(layout.includes("name: 'YouSafe Consultancy'"))
  assert.ok(layout.includes("url: 'https://yousafeconsultancy.com'"))
  assert.ok(layout.includes('https://support.yousafeconsultancy.com/#website'))
  assert.ok(layout.includes("name: 'YouSafe Support'"))
  assert.ok(layout.includes("url: 'https://support.yousafeconsultancy.com'"))
  assert.match(layout, /publisher:\s*\{\s*'@id':\s*'https:\/\/yousafeconsultancy\.com\/#organization'/)
})

test('llms.txt states public support scope and retired checkout', () => {
  assert.match(llms, /public customer-support/i)
  assert.match(llms, /study pathways/i)
  assert.match(llms, /billing, orders, and the customer portal/i)
  assert.match(llms, /live agent/i)
  assert.match(llms, /individualized legal advice/i)
  assert.match(llms, /not public sources/i)
  assert.ok(llms.includes('https://market.yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://legal.yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://usa.yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://ca.yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://uk.yousafeconsultancy.com/'))
  assert.ok(llms.includes('https://au.yousafeconsultancy.com/'))
  assert.match(llms, /checkout\.yousafeconsultancy\.com is retired and is not an active/i)
})

test('checkout retirement still points commerce at Market and away from the retired host', () => {
  assert.match(checkout, /checkout\.yousafeconsultancy\.com/) 
  assert.match(checkout, /retired/i)
  assert.ok(checkout.includes('https://market.yousafeconsultancy.com/'))
  assert.ok(checkout.includes('https://portal.yousafeconsultancy.com/'))
  assert.match(checkout, /never crawl the retired checkout host/i)
})
