#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const source = readFileSync('app/sitemap.ts', 'utf8')
if (source.includes('/sign-in') || source.includes('/sign-up')) {
  throw new Error('Support authentication routes must not be included in the sitemap source.')
}
if (source.includes('lastModified: new Date()')) {
  throw new Error('Support sitemap must not synthesize lastModified with the current build/request time.')
}
if (!source.includes("url: SITE_URL")) {
  throw new Error('Support home page is missing from sitemap source.')
}
console.log('Support sitemap source check passed.')
