import { expect, test } from '@playwright/test';
import { entrarPelaTela } from './atores';
import { ORGANIZA, api, elencoDaComunidade, encerrarTudoEmAndamento } from './pelada';

test('liga de 6 times de 6 em pontos corridos gera as 15 partidas', async ({ browser }) => {
  await encerrarTudoEmAndamento();
  const { atletas } = await elencoDaComunidade();
  const elenco = atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 36);
  expect(elenco).toHaveLength(36);
  const nomeDaLiga = `Liga 6x6 ${Date.now()}`;
  let urlDaLiga = '';

  const ctx = await browser.newContext({ baseURL: ORGANIZA });
  const page = await ctx.newPage();
  await entrarPelaTela(page, 'Organizador');
  await page.goto('/ligas/nova');

  await test.step('passo 1: nome, comunidade e turno unico', async () => {
    await page.getByPlaceholder('Ex: Liga da Primavera 2026').fill(nomeDaLiga);
    const selects = page.locator('select');
    await selects.nth(0).selectOption({ label: 'Pelada Local' });
    await selects.nth(1).selectOption('round_robin');
    await page.getByRole('button', { name: /próximo: pontuação/i }).click();
    await page.getByRole('button', { name: /próximo: times & capitães/i }).click();
  });

  await test.step('passo 3: seis equipes de seis, cada uma com capitao', async () => {
    for (const nome of ['Time C', 'Time D', 'Time E', 'Time F']) {
      await page.getByPlaceholder('Nome da nova equipe...').fill(nome);
      await page.getByRole('button', { name: /adicionar equipe/i }).click();
    }
    const cartoes = page.locator('.card.bg-base-100').filter({ hasText: /Equipe \d+:/ });
    await expect(cartoes).toHaveCount(6);
    for (let t = 0; t < 6; t += 1) {
      const cartao = cartoes.nth(t);
      const doTime = elenco.slice(t * 6, t * 6 + 6);
      for (const atleta of doTime) {
        await cartao.getByRole('button', { name: atleta.nome, exact: true }).click();
      }
      await cartao
        .getByRole('button', { name: new RegExp(`^Definir ${doTime[0].nome} como capitão`) })
        .click();
    }
    await page.getByRole('button', { name: /próximo: revisão & calendário/i }).click();
  });

  await test.step('passo 4: lanca a liga', async () => {
    await page.getByRole('button', { name: /lançar liga e gerar rodadas/i }).click();
    await page.waitForURL(/\/ligas\/[^/]+$/, { timeout: 20_000 });
    urlDaLiga = new URL(page.url()).pathname;
    await expect(page.getByText(nomeDaLiga).first()).toBeVisible();
  });

  await test.step('as 15 partidas de turno unico chegam ao banco', async () => {
    const org = await api('Organizador');
    await expect
      .poll(
        async () => {
          const { data: liga } = await org
            .from('championships')
            .select('id')
            .eq('name', nomeDaLiga)
            .maybeSingle();
          if (!liga) return 'liga nao sincronizada';
          const { count: times } = await org
            .from('championship_teams')
            .select('id', { count: 'exact', head: true })
            .eq('championship_id', liga.id);
          const { count: partidas } = await org
            .from('championship_rounds')
            .select('id', { count: 'exact', head: true })
            .eq('championship_id', liga.id);
          return `${times} times, ${partidas} partidas`;
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe('6 times, 15 partidas');
  });

  await test.step('a primeira partida vira pelada, e jogada ate o fim e entra na classificacao', async () => {
    const jogar = page.getByRole('button', { name: /jogar esta partida/i }).first();
    if (!(await jogar.isVisible())) {
      await page
        .getByRole('button', { name: /rodadas|calendário|jogos|partidas/i })
        .first()
        .click();
    }
    await jogar.click();
    await page.waitForURL(/\/sessoes\/ativa$/, { timeout: 15_000 }).catch(async () => {
      await page
        .getByRole('button', { name: /ver pelada/i })
        .first()
        .click();
      await page.waitForURL(/\/sessoes\/ativa$/, { timeout: 30_000 });
    });
    await page.getByRole('button', { name: /começar o torneio/i }).click();
    for (let ponto = 0; ponto < 15; ponto += 1) {
      await page.getByRole('button', { name: /\+1/ }).first().click();
      await page.waitForTimeout(500);
    }
    const org = await api('Organizador');
    const { data: liga } = await org
      .from('championships')
      .select('id')
      .eq('name', nomeDaLiga)
      .single();
    await expect
      .poll(
        async () => {
          const { data: partida } = await org
            .from('championship_rounds')
            .select('session_id')
            .eq('championship_id', liga!.id)
            .not('session_id', 'is', null)
            .maybeSingle();
          if (!partida?.session_id) return 'sem pelada';
          const { data: jogos } = await org
            .from('games')
            .select('score_a, score_b, status')
            .eq('session_id', partida.session_id);
          return JSON.stringify(jogos);
        },
        { timeout: 30_000, intervals: [2_000] },
      )
      .toContain('"status":"finished"');
    await page
      .getByRole('button', { name: /^encerrar$/i })
      .first()
      .click();
    const confirmar = page
      .getByRole('button', { name: /confirmar|encerrar torneio|encerrar pelada/i })
      .last();
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
    await page.waitForTimeout(3_000);
    await page.goto(urlDaLiga);
    const tabela = page.locator('table').first();
    const linhaA = tabela.getByRole('row').filter({ hasText: 'Time A' });
    const linhaB = tabela.getByRole('row').filter({ hasText: 'Time B' });
    console.log('CLASSIFICACAO', (await tabela.innerText()).slice(0, 500));
    await expect(linhaA).toContainText(/1º/);
    await expect(linhaA.getByRole('cell').nth(3)).toHaveText('1');
    await expect(linhaA.getByRole('cell').nth(4)).toHaveText('1');
    await expect(linhaB).toBeVisible();
  });

  await ctx.close();
});
