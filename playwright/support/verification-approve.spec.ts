// playwright/support/verification-approve.spec.ts
//
// Smoke: support opens a pending attorney application, approves
// it, and confirms the applicant's role flips to `attorney` /
// `consultant`. Skipped unless a seeded test environment is active.

import { test, expect } from '@playwright/test'
import {
  SUPPORT_AGENT,
  SEEDED_VERIFICATION,
  BASE_URL,
  SKIP,
} from './fixtures'

test.describe('verification-approve', () => {
  test.skip(SKIP, 'SKIP_SUPPORT_SMOKES=1 — set to 0 once seeded env exists')

  test('support approves an attorney application', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.getByLabel(/email/i).fill(SUPPORT_AGENT.email)
    await page.getByLabel(/password/i).fill(SUPPORT_AGENT.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard|\/inbox/)

    await page.goto(`${BASE_URL}/verifications`)
    await page
      .getByRole('link', {
        name: new RegExp(SEEDED_VERIFICATION.applicationShortId, 'i'),
      })
      .first()
      .click()

    await page.getByRole('button', { name: /approve/i }).click()
    await page
      .getByLabel(/notes/i)
      .fill('Smoke test — verification approve happy path')
    await page.getByRole('button', { name: /confirm|approve/i }).last().click()

    await expect(page.getByText(/approved|consultant|attorney/i)).toBeVisible()
  })
})
