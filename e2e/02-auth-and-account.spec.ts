import { test, expect } from './fixtures/auth';
import { clearLocalStorage } from './fixtures/seed';

test.describe('Auth, User Profile & Account Gate Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearLocalStorage(page);
  });

  test('displays AccountRequiredView when guest accesses /perfil', async ({ page }) => {
    await page.goto('/perfil');

    // AccountGate renders AccountRequiredView for guests
    await expect(page.getByRole('link', { name: /Criar conta grátis/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Já tenho conta/i })).toBeVisible();
  });

  test('navigates to /entrar login page when clicking login button', async ({ page }) => {
    await page.goto('/perfil');

    const loginLink = page.getByRole('link', { name: /Já tenho conta/i });
    await expect(loginLink).toBeVisible();
    await loginLink.click();

    await page.waitForURL('**/entrar');
    await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible();
  });
});
