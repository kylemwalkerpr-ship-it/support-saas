// playwright/support/dispute-decide-refund.spec.ts
//
// Smoke: support opens an open dispute, refunds the buyer fully
// (under-cap), and confirms the dispute moves to resolved_refund.
// Skipped unless a seeded test environment is active.

import { test, expect } from '@playwright/test'
import {
  SUPPORT_AGENT,
  SEEDED_DISPUTE,
  BASE_URL,
  SKIP,
} from './fixtures'

test.describe('dispute-decide-refund', () => {
  test.skip(SKIP, 'SKIP_SUPPORT_SMOKES=1 — set to 0 once seeded env exists')

  test('support refunds buyer fully on an open dispute', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.getByLabel(/email/i).fill(SUPPORT_AGENT.email)
    await page.getByLabel(/password/i).fill(SUPPORT_AGENT.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard|\/inbox/)

    await page.goto(`${BASE_URL}/disputes`)
    await page
      .getByRole('link', {
        name: new RegExp(SEEDED_DISPUTE.shortId, 'i'),
      })
      .first()
      .click()

    await page.getByRole('button', { name: /refund.*buyer.*full/i }).click()
    await page
      .getByLabel(/notes/i)
      .fill('Smoke test — buyer refund full, under cap')
    await page.getByRole('button', { name: /confirm|decide/i }).last().click()

    await expect(page.getByText(/resolved.*refund/i)).toBeVisible()
  })
})
