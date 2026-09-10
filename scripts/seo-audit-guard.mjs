#!/usr/bin/env node
/**
 * seo-audit-guard.mjs — Estate SEO guard for YouSafe Support
 *
 * The support app is mostly auth-gated. Checks focus on the public surface:
 *   1. sitemap.xml exists, is non-empty, and excludes authentication routes
 *   2. the public home page remains indexable
 *   3. authentication routes are noindex utility surfaces
 *   4. the public home page carries JSON-LD
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
  return Boolean(robots && /noindex/i.test(robots))
}

function pathFromFile(file, outDir) {
  let rel = relative(outDir, file).replace(/\\/g, '/')
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'/index.html'.length)
  else if (rel === 'index.html') rel = ''
  return '/' + (rel || '')
}

const files = walkHtml(OUT)
console.log(`\n🔒 Support SEO Audit Guard (${files.length} HTML files)\n`)

const issues = []
const sitemapPath = join(OUT, 'sitemap.xml')
const hasSitemapXml = existsSync(sitemapPath)
let sitemapEntryCount = 0

if (hasSitemapXml) {
  const sitemapContent = readFileSync(sitemapPath, 'utf8')
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
  for (const authPath of ['/sign-in', '/sign-up']) {
    if (sitemapContent.includes(`support.yousafeconsultancy.com${authPath}`)) {
      issues.push({
        check: 'auth-route-in-sitemap',
        severity: 'high',
        path: authPath,
        detail: 'authentication utility route must not be advertised for indexing',
      })
    }
  }
} else {
  issues.push({
    check: 'missing-sitemap',
    severity: 'high',
    path: '/sitemap.xml',
    detail: 'sitemap.xml not found in build output',
  })
}

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const pagePath = pathFromFile(file, OUT)
  const meta = extractMeta(html)
  const noindex = isNoindex(meta.robots)

  if (pagePath === '/' && noindex) {
    issues.push({
      check: 'public-home-noindex',
      severity: 'high',
      path: '/',
      detail: `robots: ${meta.robots}`,
    })
  }

  if (['/sign-in', '/sign-up'].includes(pagePath) && !noindex) {
    issues.push({
      check: 'auth-route-indexable',
      severity: 'high',
      path: pagePath,
      detail: 'authentication utility route must emit noindex, follow',
    })
  }

  if (pagePath === '/' && meta.ldTypes.length === 0) {
    issues.push({
      check: 'public-home-missing-schema',
      severity: 'medium',
      path: '/',
      detail: 'no JSON-LD @type found on public home page',
    })
  }
}

for (const [route, file] of [
  ['/sign-in', 'app/sign-in/layout.tsx'],
  ['/sign-up', 'app/sign-up/layout.tsx'],
]) {
  const sourcePath = join(root, file)
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : ''
  if (!source.includes('index: false') || !source.includes('follow: true')) {
    issues.push({
      check: 'auth-route-source-noindex-missing',
      severity: 'high',
      path: route,
      detail: `${file} must explicitly set robots index:false, follow:true`,
    })
  }
}

const summary = {
  totalHtmlFiles: files.length,
  sitemapEntries: sitemapEntryCount,
  publicHomeNoindex: issues.filter((i) => i.check === 'public-home-noindex').length,
  authIndexabilityIssues: issues.filter((i) => i.check.startsWith('auth-route')).length,
  missingSchema: issues.filter((i) => i.check === 'public-home-missing-schema').length,
  sitemapIssues: issues.filter((i) => i.check === 'empty-sitemap' || i.check === 'missing-sitemap').length,
  totalIssues: issues.length,
  criticalCount: issues.filter((i) => i.severity === 'high' || i.severity === 'critical').length,
}

const report = {
  timestamp: new Date().toISOString(),
  summary,
  issues,
}

const reportPath = join(root, '.seo', 'reports', 'saas-audit-guard.json')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log(`   HTML pages:      ${summary.totalHtmlFiles}`)
console.log(`   Sitemap:         ${hasSitemapXml ? `OK (${sitemapEntryCount} entries)` : 'MISSING'}`)
console.log(`   Auth SEO issues: ${summary.authIndexabilityIssues}`)
console.log(`   Missing schema:  ${summary.missingSchema}`)
console.log(`   Total issues:    ${summary.totalIssues} (${summary.criticalCount} critical)\n`)

for (const issue of issues.filter((i) => i.severity !== 'low')) {
  console.log(`   [${issue.severity.toUpperCase()}] ${issue.check}: ${issue.path}`)
  if (issue.detail) console.log(`          ${issue.detail}`)
}

const passed = summary.criticalCount === 0
console.log(`\n${passed ? '✅' : '❌'} SUPPORT SEO AUDIT GUARD ${passed ? 'PASSED' : 'FAILED'}`)
console.log(`   Report: ${reportPath}\n`)

process.exit(passed ? 0 : 1)
