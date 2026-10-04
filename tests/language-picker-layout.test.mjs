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

test('small screens: picker collapses to a 40px globe button in the launcher column, select still tappable', () => {
  const file = src('../components/language-selector.tsx')
  const picker = file.match(/className="(fixed [^"]+)"/)[1]
  for (const c of ['max-sm:h-10', 'max-sm:w-10', 'max-sm:rounded-full', 'max-sm:p-0', 'max-sm:right-7']) assert.ok(picker.split(/\s+/).includes(c), c)
  const select = file.match(/<select\s+className="([^"]+)"/)[1]
  for (const c of ['max-sm:absolute', 'max-sm:inset-0', 'max-sm:opacity-0']) assert.ok(select.split(/\s+/).includes(c), c)
  assert.match(file, /aria-label="Language"/, 'icon-only control keeps an accessible name')
})

test('small screens: Cookie settings pill steps aside while the chat panel is open', () => {
  const widget = src('../components/chat/customer-chat-widget.tsx')
  assert.match(widget, /toggleAttribute\('data-support-chat-open', panelOpen\)/)
  assert.match(widget, /removeAttribute\('data-support-chat-open'\)/, 'cleared on close/unmount')
  const css = src('../app/globals.css')
  const block = css.match(/@media \(max-width: 639px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(block, /html\[data-support-chat-open\] button\[aria-label="Cookie settings"\]/)
  assert.match(block, /display: none !important/)
  // If the consent component still renders the pill, the selector must match it.
  const consent = src('../components/analytics-consent.tsx')
  if (/Cookie settings/.test(consent) && !/data-cookie-settings/.test(consent)) {
    assert.match(consent, /aria-label="Cookie settings"/)
  }
})
