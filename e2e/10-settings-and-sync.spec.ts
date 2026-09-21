import { test, expect } from './fixtures/auth';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Settings, Admin Panel & Backup Recovery Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('AccountGate protects the platform panel for guests', async ({ page }) => {
    await page.goto('/plataforma');

    await expect(page.getByRole('link', { name: /Criar conta grátis/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Já tenho conta/i })).toBeVisible();
  });
});
