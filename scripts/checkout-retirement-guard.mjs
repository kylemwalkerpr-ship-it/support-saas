#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const RETIRED_HOST = 'checkout.yousafeconsultancy.com'
const files = [
  'lib/chat/knowledge.ts',
  'lib/chat/ai.ts',
  'components/estate-footer-config.ts',
]

const failures = []
for (const file of files) {
  const source = readFileSync(join(root, file), 'utf8')
  if (source.includes(RETIRED_HOST)) {
    failures.push(`${file} references retired host ${RETIRED_HOST}`)
  }
}

const ai = readFileSync(join(root, 'lib/chat/ai.ts'), 'utf8')
for (const host of [
  'uk.yousafeconsultancy.com/sitemap.xml',
  'au.yousafeconsultancy.com/sitemap.xml',
  'market.yousafeconsultancy.com/sitemap.xml',
]) {
  if (!ai.includes(host)) failures.push(`Support AI sitemap estate is missing ${host}`)
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
