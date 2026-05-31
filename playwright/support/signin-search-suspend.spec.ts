// playwright/support/signin-search-suspend.spec.ts
//
// Smoke: support agent signs in, finds a user via search, and
// suspends them. Skipped unless a seeded environment is active.
//
// Requires @playwright/test (not installed in package.json yet —
// add when wiring CI). This file is scaffolding so the suite is
// ready the moment the dep lands.

import { test, expect } from '@playwright/test'
import { SUPPORT_AGENT, SEEDED_USER, BASE_URL, SKIP } from './fixtures'

test.describe('signin-search-suspend', () => {
  test.skip(SKIP, 'SKIP_SUPPORT_SMOKES=1 — set to 0 once seeded env exists')

  test('support can search for a user and suspend them', async ({ page }) => {
    await page.goto(`${BASE_URL}/sign-in`)
    await page.getByLabel(/email/i).fill(SUPPORT_AGENT.email)
    await page.getByLabel(/password/i).fill(SUPPORT_AGENT.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForURL(/\/dashboard|\/inbox/)
    await page.goto(`${BASE_URL}/users`)

    await page
      .getByPlaceholder(/search/i)
      .fill(SEEDED_USER.searchQuery)
    await page.keyboard.press('Enter')

    const row = page.getByRole('link', { name: new RegExp(SEEDED_USER.fullName, 'i') })
    await expect(row).toBeVisible()
    await row.first().click()

    await page.getByRole('button', { name: /suspend/i }).click()
    await page
      .getByLabel(/reason/i)
      .fill('Smoke test — automated suspension')
    await page.getByRole('button', { name: /confirm|suspend/i }).last().click()

    await expect(page.getByText(/suspended/i)).toBeVisible()
  })
})
