// playwright/support/refund-partial.spec.ts
//
// Smoke: support opens a paid order, fires a partial refund under
// the support cap, and sees a success toast. Skipped unless a
// seeded test environment is active.

import { test, expect } from '@playwright/test'
import {
  SUPPORT_AGENT,
  SEEDED_ORDER,
  BASE_URL,
  SKIP,
} from './fixtures'

test.describe('refund-partial', () => {
  test.skip(SKIP, 'SKIP_SUPPORT_SMOKES=1 — set to 0 once seeded env exists')

  test('support can issue a partial refund under the cap', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.getByLabel(/email/i).fill(SUPPORT_AGENT.email)
    await page.getByLabel(/password/i).fill(SUPPORT_AGENT.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard|\/inbox/)

    await page.goto(`${BASE_URL}/orders`)
    await page
      .getByPlaceholder(/search/i)
      .fill(SEEDED_ORDER.orderNumber)
    await page.keyboard.press('Enter')

    await page
      .getByRole('link', { name: new RegExp(SEEDED_ORDER.orderNumber, 'i') })
      .first()
      .click()

    await page.getByRole('button', { name: /refund/i }).click()
    await page.getByRole('radio', { name: /partial/i }).check()
    await page
      .getByLabel(/amount/i)
      .fill(String(SEEDED_ORDER.partialRefundDollars))
    await page
      .getByLabel(/reason/i)
      .fill('Smoke test — partial refund happy path')
    await page.getByRole('button', { name: /confirm|process/i }).last().click()

    await expect(page.getByText(/refund.*recorded/i)).toBeVisible()
  })
})
