import { test, expect } from './fixtures/auth';
import { seedLocalStorage } from './fixtures/seed';

test.describe('Session Wizard & Balancing Flow', () => {
  const communityId = 'comm_wizard_test';

  test.beforeEach(async ({ page }) => {
    // Seed community and 12 players for balancing
    const players = Array.from({ length: 12 }).map((_, i) => ({
      id: `player_w_${i + 1}`,
      nome: `Atleta ${i + 1}`,
      apelido: `P${i + 1}`,
      genero: i % 2 === 0 ? 'M' : 'F',
      posicaoPrincipal: i % 4 === 0 ? 'levantador' : i % 4 === 1 ? 'ponteiro' : i % 4 === 2 ? 'central' : 'oposto',
      ativo: true,
      communityIds: [communityId],
      atributos: { saque: 70 + (i % 20), recepcao: 70 + (i % 20), levantamento: 70, ataque: 75, defesa: 70 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await seedLocalStorage(page, {
      communities: [
        {
          id: communityId,
          name: 'Comunidade Wizard',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      players,
      activeCommunityId: communityId,
    });
  });

  test('navigates through wizard steps', async ({ page }) => {
    await page.goto(`/comunidades/${communityId}/sessao/nova`);

    // Verify Wizard rendered
    await expect(page.locator('body')).toContainText(/Sessão|Atletas Presentes|Presenças/i);
  });
});
