import { test, expect } from './fixtures/auth';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Player Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('AccountGate protects community roster /comunidades/:id/pessoas for guests', async ({ page }) => {
    await page.goto('/comunidades/comm_test_1/pessoas');

    // AccountGate renders AccountRequiredView for guests
    await expect(page.getByRole('link', { name: /Criar conta grátis/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Já tenho conta/i })).toBeVisible();
  });
});
