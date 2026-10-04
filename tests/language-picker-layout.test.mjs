// The global language picker must never cover the public chat launcher
// (it used to sit at bottom-4 right-4 on top of the launcher's lower half).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
const remPx = (cls, prefix) => {
  const arbitrary = cls.match(new RegExp(`\\b${prefix}-\\[(\\d+(?:\\.\\d+)?)rem\\]`))
  if (arbitrary) return Number(arbitrary[1]) * 16
  const scale = cls.match(new RegExp(`\\b${prefix}-(\\d+(?:\\.\\d+)?)\\b`))
  return scale ? Number(scale[1]) * 4 : null
}

test('language picker is stacked above the chat launcher, below the open chat panel', () => {
  const picker = src('../components/language-selector.tsx').match(/className="(fixed [^"]+)"/)[1]
  const widget = src('../components/chat/customer-chat-widget.tsx')
  const launcher = widget.match(/'(fixed bottom-\S+ right-\S+ z-50 flex h-14 w-14[^']*)'/)[1]

  const launcherTop = remPx(launcher, 'bottom') + 56 // h-14
  assert.equal(launcherTop, 76)
  assert.ok(remPx(picker, 'bottom') >= launcherTop + 8, `picker bottom ${remPx(picker, 'bottom')}px must clear launcher top ${launcherTop}px`)
  assert.match(picker, /\bright-/, 'stays in the bottom-right corner where visitors expect it')
  assert.match(picker, /\bz-40\b/, 'open chat panel (z-50) must sit above the picker')
  assert.doesNotMatch(picker, /\bleft-/, 'bottom-left belongs to the Cookie settings pill')
  assert.match(widget, /fixed bottom-5 right-5 z-50 flex h-\[620px\]/)
})
