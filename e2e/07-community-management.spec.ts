import { test, expect } from './fixtures/auth';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Community Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('AccountGate protects community hub /comunidades for guests', async ({ page }) => {
    await page.goto('/comunidades');

    // Should render AccountRequiredView for guest user
    await expect(page.getByRole('link', { name: /Criar conta grátis/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Já tenho conta/i })).toBeVisible();
  });
});
