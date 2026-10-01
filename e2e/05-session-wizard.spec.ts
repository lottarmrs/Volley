import { test, expect } from './fixtures/auth';

test.describe('Pelada sem conta: da lista colada ao placar', () => {
  test('cola a lista, avalia, sorteia e começa a pelada', async ({ page }) => {
    await page.goto('/comecar');

    await page.getByRole('button', { name: /usar uma pelada de exemplo/i }).click();
    await page.getByRole('button', { name: /continuar com/i }).click();
    await expect(page.getByRole('heading', { name: /como cada um joga\?/i })).toBeVisible();
    await page.getByRole('button', { name: /sortear times equilibrados/i }).click();

    await expect(page.getByRole('heading', { name: 'Nova pelada' })).toBeVisible();
    await page.getByRole('button', { name: /gerar times equilibrados/i }).click();

    const comecar = page.getByRole('button', { name: /começar a pelada/i });
    await expect(comecar).toBeVisible({ timeout: 20_000 });
    await comecar.click();

    await page.waitForURL((url) => url.pathname.endsWith('/sessoes/ativa'));
    await expect(page.getByText(/pelada em andamento/i).first()).toBeVisible();
  });
});
