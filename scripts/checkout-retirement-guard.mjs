#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const RETIRED_HOST = 'checkout.yousafeconsultancy.com'
const failures = []

for (const file of ['lib/chat/knowledge.ts', 'components/estate-footer-config.ts']) {
  const source = readFileSync(join(root, file), 'utf8')
  if (source.includes(RETIRED_HOST)) {
    failures.push(`${file} references retired host ${RETIRED_HOST}`)
  }
}

const ai = readFileSync(join(root, 'lib/chat/ai.ts'), 'utf8')
const defaultSitemaps = ai.match(/const DEFAULT_SITEMAPS = \[[\s\S]*?\n\]/)?.[0] || ''
if (defaultSitemaps.includes(RETIRED_HOST)) {
  failures.push(`Support AI default sitemap estate includes retired host ${RETIRED_HOST}`)
}
if (!ai.includes(`const RETIRED_HOSTS = new Set(['${RETIRED_HOST}'])`)) {
  failures.push('Support AI is missing the explicit retired-host denylist')
}
if (!ai.includes('.filter((url) => !isRetiredUrl(url))')) {
  failures.push('Support AI configured sitemap inputs are not filtered through the retired-host denylist')
}

for (const host of [
  'uk.yousafeconsultancy.com/sitemap.xml',
  'au.yousafeconsultancy.com/sitemap.xml',
  'market.yousafeconsultancy.com/sitemap.xml',
]) {
  if (!defaultSitemaps.includes(host)) failures.push(`Support AI sitemap estate is missing ${host}`)
}

const footer = readFileSync(join(root, 'components/estate-footer-config.ts'), 'utf8')
if (footer.includes('portal.yousafeconsultancy.com/marketplace')) {
  failures.push('Support footer still routes public Marketplace discovery through Portal')
}
if (!footer.includes('market.yousafeconsultancy.com/providers')) {
  failures.push('Support footer is missing canonical Marketplace provider discovery')
}
if (!footer.includes('market.yousafeconsultancy.com/shop')) {
  failures.push('Support footer is missing canonical File Shop discovery')
}

if (failures.length) {
  console.error('Checkout retirement regression guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Checkout retirement regression guard passed.')
