#!/usr/bin/env node
/**
 * seo-audit-guard.mjs — deterministic SEO contract guard for YouSafe Support.
 *
 * This app deploys through Next/OpenNext and does not expose a stable static
 * export directory after `next build`, so the release gate validates the
 * source contracts that generate metadata, sitemap and robots output.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(join(root, file), 'utf8')
const issues = []

function requireFile(file) {
  const full = join(root, file)
  if (!existsSync(full)) {
    issues.push({ severity: 'high', check: 'missing-source', path: file, detail: 'required SEO source file is missing' })
    return ''
  }
  return read(file)
}

const layout = requireFile('app/layout.tsx')
const sitemap = requireFile('app/sitemap.ts')
const robots = requireFile('app/robots.ts')
const signIn = requireFile('app/sign-in/layout.tsx')
const signUp = requireFile('app/sign-up/layout.tsx')

// Public home metadata contract.
for (const needle of [
  "metadataBase: new URL('https://support.yousafeconsultancy.com')",
  "canonical: '/'",
  "'@type': 'WebSite'",
  "url: 'https://support.yousafeconsultancy.com'",
]) {
  if (!layout.includes(needle)) {
    issues.push({ severity: 'high', check: 'public-home-metadata', path: 'app/layout.tsx', detail: `missing ${needle}` })
  }
}
if (/robots\s*:\s*\{[^}]*index\s*:\s*false/s.test(layout)) {
  issues.push({ severity: 'high', check: 'public-home-noindex', path: 'app/layout.tsx', detail: 'root metadata must not noindex the public Support home page' })
}

// Sitemap contract: exactly the substantive public root is advertised. Auth
// utility routes remain crawlable so Google can observe their noindex metadata,
// but they are not sitemap inventory.
if (!sitemap.includes("const SITE_URL = 'https://support.yousafeconsultancy.com'")) {
  issues.push({ severity: 'high', check: 'sitemap-host', path: 'app/sitemap.ts', detail: 'Support sitemap host is missing or changed' })
}
if (!sitemap.includes('url: SITE_URL')) {
  issues.push({ severity: 'high', check: 'sitemap-home-missing', path: 'app/sitemap.ts', detail: 'public Support home is missing from sitemap source' })
}
for (const forbidden of ['/sign-in', '/sign-up', 'lastModified: new Date()', 'checkout.yousafeconsultancy.com']) {
  if (sitemap.includes(forbidden)) {
    issues.push({ severity: 'high', check: 'sitemap-forbidden-entry', path: 'app/sitemap.ts', detail: `sitemap source contains ${forbidden}` })
  }
}

// Authentication routes must explicitly noindex while remaining followable.
for (const [route, file, source] of [
  ['/sign-in', 'app/sign-in/layout.tsx', signIn],
  ['/sign-up', 'app/sign-up/layout.tsx', signUp],
]) {
  if (!source.includes('index: false') || !source.includes('follow: true')) {
    issues.push({ severity: 'high', check: 'auth-route-indexability', path: route, detail: `${file} must set robots index:false, follow:true` })
  }
}

// robots.txt must advertise the Support sitemap while keeping private app/API
// surfaces out of crawl. Do not block sign-in/sign-up: their noindex metadata
// needs to remain observable by search engines.
for (const needle of [
  "sitemap: `${SITE_URL}/sitemap.xml`",
  "'/api/'",
  "'/admin'",
  "'/dashboard'",
  "'/onboarding'",
]) {
  if (!robots.includes(needle)) {
    issues.push({ severity: 'high', check: 'robots-contract', path: 'app/robots.ts', detail: `missing ${needle}` })
  }
}
for (const authPath of ["'/sign-in'", "'/sign-up'"]) {
  if (robots.includes(authPath)) {
    issues.push({ severity: 'high', check: 'robots-auth-block', path: 'app/robots.ts', detail: `${authPath} must not be disallowed because Google needs to see noindex` })
  }
}

// Estate retirement invariant.
for (const [file, source] of [
  ['app/layout.tsx', layout],
  ['app/sitemap.ts', sitemap],
  ['app/robots.ts', robots],
  ['app/sign-in/layout.tsx', signIn],
  ['app/sign-up/layout.tsx', signUp],
]) {
  if (source.includes('checkout.yousafeconsultancy.com')) {
    issues.push({ severity: 'high', check: 'retired-checkout-host', path: file, detail: 'retired checkout host reintroduced into active SEO source' })
  }
}

console.log('\n🔒 Support SEO Contract Guard\n')
if (issues.length) {
  for (const issue of issues) {
    console.error(`   [${issue.severity.toUpperCase()}] ${issue.check}: ${issue.path}`)
    console.error(`          ${issue.detail}`)
  }
  console.error(`\n❌ SUPPORT SEO CONTRACT GUARD FAILED (${issues.length} issue${issues.length === 1 ? '' : 's'})\n`)
  process.exit(1)
}

console.log('   Public home canonical + WebSite schema: OK')
console.log('   Sitemap inventory and retirement rules: OK')
console.log('   Auth noindex contract: OK')
console.log('   robots.txt private-surface contract: OK')
console.log('\n✅ SUPPORT SEO CONTRACT GUARD PASSED\n')
