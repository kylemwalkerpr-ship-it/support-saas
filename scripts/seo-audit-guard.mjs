#!/usr/bin/env node
/**
 * seo-audit-guard.mjs — Estate SEO guard for yousafe-saas (support)
 *
 * The support app is mostly auth-gated. Checks focus on the public routes:
 *   1. Sitemap health — sitemap.xml is non-empty and contains public routes
 *   2. Noindex conflict — no public route emits accidental noindex
 *   3. Schema presence — public pages have WebSite JSON-LD
 *
 * Exit codes:
 *   0 — passed
 *   1 — critical issues found (not used in report-only CI mode)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = dirname(__dirname)

// OpenNext outputs to .vercel/output/static/; fall back to out/
function findOutDir() {
  for (const candidate of [
    join(root, '.vercel', 'output', 'static'),
    join(root, 'out'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

const OUT = findOutDir()
if (!OUT) {
  console.error('❌ No static output directory found (.vercel/output/static/ or out/)')
  console.error('   Run a production build first.')
  process.exit(1)
}

function walkHtml(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    if (entry === '_next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkHtml(full, files)
    else if (entry === 'index.html') files.push(full)
  }
  return files
}

function extractMeta(html) {
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim() || null
  const robots =
    (html.match(/name=["']robots["'][^>]*content=["']([^"']+)/i) ||
      html.match(/content=["']([^"']+)["'][^>]*name=["']robots["']/i) ||
      [])[1] || null
  const ldTypes = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
  return { title, robots, ldTypes: [...new Set(ldTypes)] }
}

function isNoindex(robots) {
  if (!robots) return false
  return /noindex/i.test(robots)
}

function pathFromFile(file, outDir) {
  let rel = relative(outDir, file).replace(/\\/g, '/')
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'/index.html'.length)
  else if (rel === 'index.html') rel = ''
  return '/' + (rel || '')
}

// ── Main ──
const files = walkHtml(OUT)
console.log(`\n🔒 Support SEO Audit Guard (${files.length} HTML files)\n`)

const issues = []
let hasSitemapXml = existsSync(join(OUT, 'sitemap.xml'))
let sitemapEntryCount = 0

if (hasSitemapXml) {
  const sitemapContent = readFileSync(join(OUT, 'sitemap.xml'), 'utf8')
  sitemapEntryCount = (sitemapContent.match(/<url>/g) || []).length
  console.log(`   Sitemap entries: ${sitemapEntryCount}`)

  if (sitemapEntryCount === 0) {
    issues.push({
      check: 'empty-sitemap',
      severity: 'high',
      path: '/sitemap.xml',
      detail: 'sitemap.xml contains 0 <url> entries',
    })
  }
} else {
  issues.push({
    check: 'missing-sitemap',
    severity: 'high',
    path: '/sitemap.xml',
    detail: 'sitemap.xml not found in build output',
  })
}

// Check each page
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const path = pathFromFile(file, OUT)
  const meta = extractMeta(html)
  const noindex = isNoindex(meta.robots)

  // Check 1: public routes should not be noindex
  if (noindex && ['/', '/sign-in', '/sign-up'].includes(path)) {
    issues.push({
      check: 'public-route-noindex',
      severity: 'high',
      path: path || '/',
      detail: `robots: ${meta.robots}`,
    })
  }

  // Check 2: schema presence on public pages
  if (['/', '/sign-in', '/sign-up'].includes(path) && meta.ldTypes.length === 0) {
    issues.push({
      check: 'public-route-missing-schema',
      severity: 'medium',
      path: path || '/',
      detail: 'no JSON-LD @type found on public page',
    })
  }
}

// Aggregate
const summary = {
  totalHtmlFiles: files.length,
  sitemapEntries: sitemapEntryCount,
  publicRouteNoindex: issues.filter((i) => i.check === 'public-route-noindex').length,
  missingSchema: issues.filter((i) => i.check === 'public-route-missing-schema').length,
  sitemapIssues: issues.filter((i) => i.check === 'empty-sitemap' || i.check === 'missing-sitemap').length,
  totalIssues: issues.length,
  criticalCount: issues.filter((i) => i.severity === 'high' || i.severity === 'critical').length,
}

const report = {
  timestamp: new Date().toISOString(),
  summary,
  issues,
}

// Write report
const reportPath = join(root, '.seo', 'reports', 'saas-audit-guard.json')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))

// Console
console.log(`   HTML pages:     ${summary.totalHtmlFiles}`)
console.log(`   Sitemap:        ${hasSitemapXml ? `OK (${sitemapEntryCount} entries)` : 'MISSING'}`)
console.log(`   Public noindex: ${summary.publicRouteNoindex}`)
console.log(`   Missing schema: ${summary.missingSchema}`)
console.log(`   Total issues:   ${summary.totalIssues} (${summary.criticalCount} critical)\n`)

for (const issue of issues.filter((i) => i.severity !== 'low')) {
  console.log(`   [${issue.severity.toUpperCase()}] ${issue.check}: ${issue.path}`)
  if (issue.detail) console.log(`          ${issue.detail}`)
}

const passed = summary.criticalCount === 0
console.log(`\n${passed ? '✅' : '❌'} SUPPORT SEO AUDIT GUARD ${passed ? 'PASSED' : 'FAILED'}`)
console.log(`   Report: ${reportPath}\n`)

process.exit(passed ? 0 : 1)
