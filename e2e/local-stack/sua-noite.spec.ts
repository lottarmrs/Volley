import { expect, test, type Page } from '@playwright/test';
import { api, entrarPelaTela } from './atores';
import { elencoDaComunidade, encerrarTudoEmAndamento, MEMBRO, peladaComecada } from './pelada';

const FOTOS = '.superpowers/sdd/2026-10-05-sua-noite/shots/e2e';

async function marcarPonto(page: Page, vezes: number) {
  for (let i = 0; i < vezes; i += 1) {
    await page.getByRole('button', { name: /\+1/ }).first().click();
    await page.waitForTimeout(500);
  }
}

test('a Ana joga, quem organiza encerra e a noite aparece no celular dela uma vez', async ({
  browser,
}) => {
  await encerrarTudoEmAndamento();
  const { atletas } = await elencoDaComunidade();
  const ana = atletas.find((a) => a.nome.startsWith('Ana'));
  expect(ana).toBeDefined();
  const jogam = [ana!, ...atletas.filter((a) => a !== ana).slice(0, 17)];

  const {
    ctx: ctxOrg,
    page: pOrg,
    sessionId,
  } = await peladaComecada(browser, {
    jogam,
    times: 3,
    rotacao: '6x0',
  });

  await test.step('um jogo ate 15 e a pelada encerra', async () => {
    await pOrg.getByRole('button', { name: /começar primeira partida/i }).click();
    await expect(pOrg.getByText(/jogo 1 — em andamento/i)).toBeVisible({ timeout: 15_000 });
    await marcarPonto(pOrg, 15);
    await expect(pOrg.getByText(/jogo 1 — finalizado/i)).toBeVisible({ timeout: 15_000 });
    await pOrg
      .getByRole('button', { name: /encerrar pelada/i })
      .first()
      .click();
    await pOrg.getByRole('button', { name: /confirmar & encerrar/i }).click();
    await pOrg.waitForURL(/\/sessoes$/, { timeout: 30_000 });
  });

  await test.step('o organizador nao ve a fila de cartas de todo mundo', async () => {
    await expect(pOrg.getByRole('dialog', { name: 'Sua noite' })).toHaveCount(0);
    await expect(pOrg.getByText(/abrir pacote/i)).toHaveCount(0);
  });

  const ctxAna = await browser.newContext({
    baseURL: MEMBRO,
    viewport: { width: 390, height: 844 },
  });
  const pAna = await ctxAna.newPage();

  await test.step('a Ana abre o app e a noite aparece', async () => {
    await entrarPelaTela(pAna, 'Ana');
    const noite = pAna.getByRole('dialog', { name: 'Sua noite' });
    await expect(noite).toBeVisible({ timeout: 30_000 });
    await pAna.screenshot({ path: `${FOTOS}/1-pacote.png` });
    await noite.getByRole('button', { name: 'Abrir' }).click();
    await pAna.waitForTimeout(1500);
    await pAna.screenshot({ path: `${FOTOS}/2-carta.png` });
    await noite.getByRole('button', { name: 'Próximo' }).click();
    await pAna.waitForTimeout(1200);
    await pAna.screenshot({ path: `${FOTOS}/3-numeros.png` });
    await noite.getByRole('button', { name: 'Pular' }).click();
    await pAna.waitForTimeout(800);
    await pAna.screenshot({ path: `${FOTOS}/4-fim.png` });
    await expect(noite.getByRole('button', { name: 'Ver minha carta' })).toBeVisible();
  });

  await test.step('abrir o pacote registrou a noite como vista', async () => {
    const cliente = await api('Ana');
    await expect
      .poll(
        async () =>
          (
            await cliente
              .from('athlete_night_views')
              .select('session_id')
              .eq('session_id', sessionId)
          ).data?.length,
        { timeout: 15_000 },
      )
      .toBe(1);
  });

  await test.step('fechar e reabrir o app: a noite nao volta', async () => {
    await pAna
      .getByRole('dialog', { name: 'Sua noite' })
      .getByRole('button', { name: 'Fechar' })
      .click();
    await expect(pAna.getByRole('dialog', { name: 'Sua noite' })).toHaveCount(0);
    await pAna.reload();
    await pAna.waitForLoadState('networkidle');
    await pAna.waitForTimeout(3000);
    await expect(pAna.getByRole('dialog', { name: 'Sua noite' })).toHaveCount(0);
  });

  await ctxOrg.close();
  await ctxAna.close();
});
