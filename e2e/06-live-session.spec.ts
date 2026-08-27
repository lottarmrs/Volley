import { test, expect } from './fixtures/auth';
import { seedLocalStorage } from './fixtures/seed';

test.describe('Live Session & Match Scoring Flow', () => {
  const communityId = 'comm_live_test';
  const sessionId = 'session_live_1';

  test.beforeEach(async ({ page }) => {
    const activeSession = {
      id: sessionId,
      name: 'Pelada de Quarta',
      communityId,
      date: new Date().toISOString().split('T')[0],
      status: 'active',
      format: 'quadra',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await seedLocalStorage(page, {
      communities: [
        {
          id: communityId,
          name: 'Comunidade Ao Vivo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeSession,
      activeCommunityId: communityId,
    });
  });

  test('renders active session score board', async ({ page }) => {
    await page.goto(`/comunidades/${communityId}/sessao/ativa`);

    await expect(page.locator('body')).toContainText(/Pelada de Quarta|Jogo|Placar|Partida/i);
  });
});
