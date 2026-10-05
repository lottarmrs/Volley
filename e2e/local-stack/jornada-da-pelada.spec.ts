import { expect, test, type Page } from '@playwright/test';
import { api, entrarPelaTela, rpc } from './atores';

const ORGANIZA = 'http://localhost:3300';
const MEMBRO = 'http://127.0.0.1:3300';

interface Quadro {
  window_id: string;
  confirmed_count: number;
  waitlisted_count: number;
  entries: { player_id: string; status: string }[];
}

async function quadroDa(sessionId: string): Promise<Quadro> {
  return rpc<Quadro>('Organizador', 'read_session_registration', { p_session_id: sessionId });
}

async function marcarPonto(page: Page, vezes: number) {
  for (let i = 0; i < vezes; i += 1) {
    await page.getByRole('button', { name: /\+1/ }).first().click();
    await page.waitForTimeout(600);
  }
}

test('pelada com varias contas: lista, reserva, sorteio, placar ao vivo e historico', async ({
  browser,
}) => {
  const org = await api('Organizador');
  const { data: comunidade } = await org
    .from('communities')
    .select('id, local_id')
    .eq('name', 'Pelada Local')
    .single();
  const comunidadeId = comunidade!.local_id ?? comunidade!.id;

  const ctxOrg = await browser.newContext({ baseURL: ORGANIZA });
  const ctxAna = await browser.newContext({ baseURL: MEMBRO });
  const pOrg = await ctxOrg.newPage();
  const pAna = await ctxAna.newPage();

  await test.step('quem organiza marca a pelada com 9 vagas e a lista abre junto', async () => {
    await entrarPelaTela(pOrg, 'Organizador');
    await pOrg.goto(`/comunidades/${comunidadeId}/sessoes/nova`);
    await pOrg.getByLabel('Vagas na lista').fill('9');
    await pOrg.getByRole('button', { name: /marcar e abrir a lista/i }).click();
    await pOrg.waitForURL(/\/inscricao$/, { timeout: 30_000 });
    await expect(pOrg.getByText(/Lista aberta · 0 de 9 confirmados/)).toBeVisible();
  });
  const sessionId = pOrg.url().split('/sessoes/')[1].split('/')[0];
  const urlPelada = `/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`;

  await test.step('a Ana entra pela tela', async () => {
    await entrarPelaTela(pAna, 'Ana');
    await pAna.goto(urlPelada);
    await pAna.waitForLoadState('networkidle');
    expect(new URL(pAna.url()).pathname).toBe(urlPelada);
    await pAna.getByRole('button', { name: /quero jogar/i }).click();
    await expect(pAna.getByText(/1\/9/)).toBeVisible({ timeout: 15_000 });
  });

  const { window_id: windowId } = await quadroDa(sessionId);
  await test.step('mais dez entram pelo celular deles: oito confirmam, dois vao para a reserva', async () => {
    for (const nome of [
      'Bia',
      'Caio',
      'Duda',
      'Eva',
      'Fabio',
      'Gil',
      'Hugo',
      'Iris',
      'Joao',
      'Kika',
    ]) {
      await rpc(nome, 'join_registration', {
        p_command_id: crypto.randomUUID(),
        p_entry_id: crypto.randomUUID(),
        p_window_id: windowId,
      });
    }
    const quadro = await quadroDa(sessionId);
    expect([quadro.confirmed_count, quadro.waitlisted_count]).toEqual([9, 2]);
    await expect(pAna.getByText(/2 na reserva/i)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('a Bia sai e o primeiro da reserva sobe, e a tela da Ana acompanha', async () => {
    await rpc('Bia', 'leave_registration', {
      p_command_id: crypto.randomUUID(),
      p_window_id: windowId,
    });
    const quadro = await quadroDa(sessionId);
    expect([quadro.confirmed_count, quadro.waitlisted_count]).toEqual([9, 1]);
    await expect(pAna.getByText(/1 na reserva/i)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('quem organiza marca o pagamento da Kika, na reserva', async () => {
    await pOrg.reload();
    await pOrg.getByRole('button', { name: 'Marcar como pago Kika Teste' }).click();
    await expect(
      pOrg.getByRole('button', { name: 'Desmarcar pagamento de Kika Teste' }),
    ).toBeVisible();
  });

  await test.step('fechar com pagamento pendente explica o que falta, sem oferecer o sorteio', async () => {
    pOrg.once('dialog', (d) => void d.accept());
    await pOrg
      .getByRole('button', { name: /fechar a lista/i })
      .first()
      .click();
    await expect(pOrg.getByText(/Lista fechada · 9 sem pagamento/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(pOrg.getByRole('button', { name: /sortear os times/i })).toHaveCount(0);
  });

  await test.step('quem organiza marca quem pagou e o sorteio volta', async () => {
    for (let i = 0; i < 9; i += 1) {
      await pOrg
        .getByRole('button', { name: /^Marcar como pago / })
        .first()
        .click();
      await pOrg.waitForTimeout(700);
    }
    await expect(pOrg.getByText(/Lista fechada · 9 jogam/)).toBeVisible({ timeout: 20_000 });
  });

  await test.step('sorteia e comeca', async () => {
    await pOrg
      .getByRole('button', { name: /sortear os times/i })
      .first()
      .click();
    await pOrg.waitForURL(/\/sortear$/);
    await pOrg.getByRole('heading', { name: /jogo livre/i }).click();
    await pOrg.getByRole('button', { name: /^revisar$/i }).click();
    await pOrg.getByRole('button', { name: /gerar times equilibrados/i }).click();
    await pOrg.getByRole('button', { name: /começar a pelada/i }).click({ timeout: 30_000 });
    await pOrg.waitForURL(/\/sessoes\/ativa$/, { timeout: 30_000 });
    await pOrg.getByRole('button', { name: /começar primeira partida/i }).click();
    await expect(pOrg.getByText(/jogo 1 — em andamento/i)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('a Ana abre o placar para acompanhar, sem poder marcar', async () => {
    await pAna.reload();
    await pAna.getByRole('button', { name: /acompanhar o placar/i }).click();
    await pAna.waitForURL(/\/sessoes\/ativa$/);
    await expect(
      pAna
        .getByRole('status')
        .filter({ hasText: 'Você está acompanhando ao vivo. Só quem organiza marca o placar.' }),
    ).toBeVisible();
    for (const botao of await pAna.getByRole('button', { name: /\+1/ }).all()) {
      await expect(botao).toBeDisabled();
    }
  });

  await test.step('quem organiza marca 3 pontos e a Ana ve o placar mudar sozinho', async () => {
    await marcarPonto(pOrg, 3);
    await expect(pOrg.getByText(/Time \d+ 3, Time \d+ 0/)).toBeVisible();
    await expect(pAna.getByText(/Time \d+ 3, Time \d+ 0/)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('o jogo vai a 15 e a pelada encerra', async () => {
    await marcarPonto(pOrg, 12);
    await expect(pOrg.getByText(/jogo 1 — finalizado/i)).toBeVisible({ timeout: 15_000 });
    await pOrg
      .getByRole('button', { name: /encerrar pelada/i })
      .first()
      .click();
    await pOrg.getByRole('button', { name: /confirmar & encerrar/i }).click();
    await pOrg.waitForURL(/\/sessoes$/, { timeout: 30_000 });
  });

  await test.step('a Ana ve a pelada no historico e quem jogou ganha carreira', async () => {
    await pAna.goto(urlPelada);
    await expect(pAna.getByText(/encerrada/i).first()).toBeVisible({ timeout: 15_000 });
    const ana = await api('Ana');
    const { data: sessao } = await ana
      .from('sessions')
      .select('status')
      .eq('id', sessionId)
      .single();
    expect(sessao!.status).toBe('finished');
    const { data: jogos } = await ana
      .from('games')
      .select('score_a, score_b, status')
      .eq('session_id', sessionId);
    expect(jogos).toEqual([expect.objectContaining({ status: 'finished' })]);
    const { data: carreira } = await org
      .from('career_events')
      .select('player_id')
      .eq('session_id', sessionId)
      .eq('type', 'session_played');
    expect((carreira ?? []).length).toBe(6);
  });

  await ctxOrg.close();
  await ctxAna.close();
});
