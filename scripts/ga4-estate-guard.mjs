#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const layoutPath = join(root, 'app', 'layout.tsx')
const source = readFileSync(layoutPath, 'utf8')

const required = [
  'G-FTKZCVNW4B',
  'yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
  'support.yousafeconsultancy.com',
  'googletagmanager.com/gtag/js',
  'accept_incoming',
]

const failures = []
for (const marker of required) {
  if (!source.includes(marker)) failures.push(`missing GA4 estate marker: ${marker}`)
}

if (source.includes('checkout.yousafeconsultancy.com')) {
  failures.push('retired checkout host must not be present in Support GA4 wiring')
}

if (!source.includes('NEXT_PUBLIC_GA_MEASUREMENT_ID')) {
  failures.push('Support GA4 wiring must allow NEXT_PUBLIC_GA_MEASUREMENT_ID override')
}

if (failures.length) {
  console.error('Support GA4 estate guard failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Support GA4 estate guard passed: shared property/linker wiring is present and checkout is absent.')
