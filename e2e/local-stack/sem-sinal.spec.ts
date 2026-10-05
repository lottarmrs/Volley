import { expect, test } from '@playwright/test';
import { entrarPelaTela, api } from './atores';
import { MEMBRO, ORGANIZA, elencoDaComunidade, encerrarPelaApi, peladaComecada } from './pelada';

function placar(a: number, b: number) {
  return new RegExp(`Time \\d+ ${a}, Time \\d+ ${b}`);
}

test('sem sinal o placar segue, guarda os pontos e envia quando volta', async ({ browser }) => {
  const { atletas } = await elencoDaComunidade();
  const jogam = atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 9);
  const {
    ctx,
    page: marca,
    sessionId,
    comunidadeId,
  } = await peladaComecada(browser, {
    jogam,
    times: 3,
    rotacao: '6x0',
  });
  const urlPelada = `/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`;
  const ctxAna = await browser.newContext({ baseURL: MEMBRO });
  const ana = await ctxAna.newPage();

  await test.step('abre o placar e a membro acompanha', async () => {
    await marca.getByRole('button', { name: /começar primeira partida/i }).click();
    await entrarPelaTela(ana, 'Ana');
    await ana.goto(urlPelada);
    await ana.getByRole('button', { name: /acompanhar o placar/i }).click();
    await expect(ana.getByText(/jogo 1 — em andamento/i)).toBeVisible();
  });

  await test.step('sem sinal, marca tres pontos e desfaz um', async () => {
    await ctx.setOffline(true);
    for (let i = 0; i < 3; i += 1) {
      await marca.getByRole('button', { name: /\+1/ }).first().click();
      await marca.waitForTimeout(300);
    }
    await marca.getByRole('button', { name: /desfazer ponto/i }).click();
    await expect(marca.getByText(placar(2, 0)).first()).toBeVisible();
    await expect(marca.getByText('Sem sinal · 2 pontos guardados no aparelho')).toBeVisible();
    await expect(marca.getByRole('button', { name: /encerrar pelada/i }).first()).toBeDisabled();
    await expect(ana.getByText(placar(0, 0)).first()).toBeVisible();
  });

  await test.step('fecha o app sem sinal e reabre com sinal: os pontos guardados vao', async () => {
    await marca.close();
    await ctx.setOffline(false);
    const reaberta = await ctx.newPage();
    await reaberta.goto(urlPelada);
    await reaberta.getByRole('button', { name: /abrir o placar/i }).click();
    await expect(reaberta.getByText(placar(2, 0)).first()).toBeVisible({ timeout: 20_000 });
    await expect(reaberta.getByText(/sem sinal|enviando/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(ana.getByText(placar(2, 0)).first()).toBeVisible({ timeout: 20_000 });
    const org = await api('Organizador');
    await expect
      .poll(
        async () => {
          const { data: pontos } = await org
            .from('point_events')
            .select('id, deleted_at')
            .eq('session_id', sessionId);
          const lista = pontos ?? [];
          return [
            lista.filter((p) => !p.deleted_at).length,
            lista.filter((p) => p.deleted_at).length,
          ];
        },
        { timeout: 20_000 },
      )
      .toEqual([2, 1]);
    await expect(reaberta.getByRole('button', { name: /encerrar pelada/i }).first()).toBeEnabled();
  });

  await encerrarPelaApi(sessionId);
  await ctx.close();
  await ctxAna.close();
});

test('conflito: outra tela de quem organiza marca enquanto este aparelho esta sem sinal', async ({
  browser,
}) => {
  const { atletas } = await elencoDaComunidade();
  const jogam = atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 9);
  const {
    ctx,
    page: marca,
    sessionId,
    comunidadeId,
  } = await peladaComecada(browser, {
    jogam,
    times: 3,
    rotacao: '6x0',
  });
  await marca.getByRole('button', { name: /começar primeira partida/i }).click();

  await ctx.setOffline(true);
  await marca.getByRole('button', { name: /\+1/ }).first().click();
  await expect(marca.getByText('Sem sinal · 1 ponto guardado no aparelho')).toBeVisible();

  const ctxOutra = await browser.newContext({ baseURL: ORGANIZA });
  const outra = await ctxOutra.newPage();
  await entrarPelaTela(outra, 'Organizador').catch(async () => {
    await outra.waitForTimeout(31_000);
    await entrarPelaTela(outra, 'Organizador');
  });
  await outra.goto(`/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`);
  await outra.getByRole('button', { name: /abrir o placar/i }).click();
  await outra.getByRole('button', { name: /\+1/ }).nth(1).click();
  await outra.waitForTimeout(1_500);

  await ctx.setOffline(false);
  const dialogo = marca.getByRole('dialog');
  await expect(dialogo).toContainText('Você tem 1 ponto guardado', { timeout: 20_000 });
  await marca.getByRole('button', { name: 'Descartar os meus' }).click();
  await expect(marca.getByText(placar(0, 1)).first()).toBeVisible({ timeout: 20_000 });

  await encerrarPelaApi(sessionId);
  await ctx.close();
  await ctxOutra.close();
});
