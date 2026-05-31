// playwright/support/macro-reply.spec.ts
//
// Smoke: support opens an inbox conversation, types a macro slash
// command, selects it from autocomplete, sends, and confirms the
// rendered message lands in the thread. Skipped unless a seeded
// test environment is active.

import { test, expect } from '@playwright/test'
import {
  SUPPORT_AGENT,
  SEEDED_CONVERSATION,
  BASE_URL,
  SKIP,
} from './fixtures'

test.describe('macro-reply', () => {
  test.skip(SKIP, 'SKIP_SUPPORT_SMOKES=1 — set to 0 once seeded env exists')

  test('support sends a macro reply into a conversation', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.getByLabel(/email/i).fill(SUPPORT_AGENT.email)
    await page.getByLabel(/password/i).fill(SUPPORT_AGENT.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard|\/inbox/)

    await page.goto(`${BASE_URL}/inbox`)
    await page
      .getByRole('link', {
        name: new RegExp(SEEDED_CONVERSATION.shortId, 'i'),
      })
      .first()
      .click()

    const composer = page.getByRole('textbox', { name: /message|reply/i })
    await composer.fill(SEEDED_CONVERSATION.macroSlashCommand)

    // Autocomplete should surface a matching macro — click the first item.
    await page.getByRole('option').first().click()

    await page.getByRole('button', { name: /send/i }).click()

    await expect(
      page.getByRole('listitem').filter({ hasText: /welcome/i })
    ).toBeVisible()
  })
})
