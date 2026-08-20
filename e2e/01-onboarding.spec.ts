import { test, expect } from '@playwright/test';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Onboarding & QuickStart Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('redirects empty state to /comecar', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/comecar');
    await expect(page.getByRole('heading', { name: /Quem vai jogar hoje\?/i })).toBeVisible();
  });

  test('completes quick start using demo pelada list', async ({ page }) => {
    await page.goto('/comecar');

    // Click demo list button
    const demoBtn = page.getByRole('button', { name: /Usar uma pelada de exemplo/i });
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // Verify textarea has roster names
    const textarea = page.locator('#quick-start-roster');
    await expect(textarea).not.toHaveValue('');

    // Click Continue
    const continueBtn = page.getByRole('button', { name: /Continuar com/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Verify Step 2 (Triagem)
    await expect(page.getByRole('heading', { name: /Como cada um joga\?/i })).toBeVisible();

    // Click Sortear times equilibrados
    const sortearBtn = page.getByRole('button', { name: /Sortear times equilibrados/i });
    await expect(sortearBtn).toBeVisible();
    await sortearBtn.click();

    // Verify navigation away from /comecar to active session / wizard / dashboard
    await page.waitForURL((url) => !url.pathname.endsWith('/comecar'));
  });
});
