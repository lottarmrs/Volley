import { test, expect } from './fixtures/auth';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Roles & Permission Matrix', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('AccountGate blocks guest access to community management', async ({ page }) => {
    await page.goto('/comunidades/comm_test_1/gestao');

    // Should render AccountRequiredView
    await expect(page.getByRole('link', { name: /Criar conta grátis/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Já tenho conta/i })).toBeVisible();
  });
});
