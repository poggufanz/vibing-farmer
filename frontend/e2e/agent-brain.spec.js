// frontend/e2e/agent-brain.spec.js
//
// Task 23b (OnboardingGate) landed after this spec's first draft: the brain now
// mounts only after a real ERC-7715 grant via window.ethereum (MetaMask Flask).
// A Playwright browser has no wallet extension, so the deep pipeline flow
// (stage reveal cadence, IQ, council decision toast) cannot be driven headless —
// it requires a human with Flask connected (see Step 3: manual fidelity pass).
// What IS deterministic and worth locking down here: the gate renders correctly
// and fails loud+clear without a wallet, and palette switching repaints cleanly.
import { test, expect } from '@playwright/test'

test('grant gate renders and surfaces a clear error without a wallet', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /izinkan agent/i })).toBeVisible()
  await expect(page.getByText(/grant · erc-7715/i)).toBeVisible()

  const cta = page.getByRole('button', { name: /connect & grant permission/i })
  await expect(cta).toBeVisible()
  await cta.click()

  // no MetaMask Flask in a headless browser -> connectWallet() throws synchronously
  await expect(page.getByText(/metamask flask not found/i)).toBeVisible()
  await expect(cta).toBeEnabled()
})

test('palette switch repaints the gate without layout shift', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /izinkan agent/i })).toBeVisible()
  await page.evaluate(() => document.documentElement.setAttribute('data-palette', 'mono-slate'))
  await expect(page).toHaveScreenshot('onboarding-gate-mono-slate.png', { maxDiffPixelRatio: 0.02 })
})
