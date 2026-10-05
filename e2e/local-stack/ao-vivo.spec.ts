import { expect, test, type Page } from '@playwright/test';
import { entrarPelaTela } from './atores';
import { ORGANIZA, MEMBRO, elencoDaComunidade, encerrarPelaApi, peladaComecada } from './pelada';

function placar(a: number, b: number) {
  return new RegExp(`Time \\d+ ${a}, Time \\d+ ${b}`);
}

async function esperarPlacar(page: Page, a: number, b: number): Promise<number> {
  const inicio = Date.now();
  await expect(page.getByText(placar(a, b)).first()).toBeVisible({ timeout: 15_000 });
  return Date.now() - inicio;
}

function resumo(ms: number[]) {
  const ordenado = [...ms].sort((x, y) => x - y);
  const meio = ordenado[Math.floor(ordenado.length / 2)];
  return `min ${ordenado[0]} ms · mediana ${meio} ms · max ${ordenado[ordenado.length - 1]} ms`;
}

test('placar ao vivo: quem marca, outra tela de quem organiza e a membro acompanhando', async ({
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
  const urlPelada = `/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`;

  const ctxOutra = await browser.newContext({ baseURL: ORGANIZA });
  const outraTela = await ctxOutra.newPage();
  const ctxAna = await browser.newContext({ baseURL: MEMBRO });
  const ana = await ctxAna.newPage();

  await test.step('as tres telas abrem o placar', async () => {
    await marca.getByRole('button', { name: /começar primeira partida/i }).click();
    await expect(marca.getByText(/jogo 1 — em andamento/i)).toBeVisible();

    await entrarPelaTela(outraTela, 'Organizador').catch(async () => {
      await outraTela.waitForTimeout(31_000);
      await entrarPelaTela(outraTela, 'Organizador');
    });
    await outraTela.goto(urlPelada);
    await outraTela.getByRole('button', { name: /abrir o placar/i }).click();
    await expect(outraTela.getByText(/jogo 1 — em andamento/i)).toBeVisible();

    await entrarPelaTela(ana, 'Ana');
    await ana.goto(urlPelada);
    await ana.getByRole('button', { name: /acompanhar o placar/i }).click();
    await expect(ana.getByText(/jogo 1 — em andamento/i)).toBeVisible();
  });

  const naOutraTela: number[] = [];
  const naAna: number[] = [];
  let a = 0;
  let b = 0;
  let ultimoFoiA = true;

  await test.step('cada ponto aparece nas outras duas telas', async () => {
    for (let ponto = 0; ponto < 8; ponto += 1) {
      const doTimeA = ponto % 3 !== 2;
      await marca
        .getByRole('button', { name: /\+1/ })
        .nth(doTimeA ? 0 : 1)
        .click();
      if (doTimeA) a += 1;
      else b += 1;
      ultimoFoiA = doTimeA;
      const [, outra, membro] = await Promise.all([
        esperarPlacar(marca, a, b),
        esperarPlacar(outraTela, a, b),
        esperarPlacar(ana, a, b),
      ]);
      naOutraTela.push(outra);
      naAna.push(membro);
    }
  });

  await test.step('desfazer tambem chega a quem acompanha', async () => {
    await marca.getByRole('button', { name: /desfazer ponto/i }).click();
    if (ultimoFoiA) a -= 1;
    else b -= 1;
    await esperarPlacar(marca, a, b);
    await esperarPlacar(outraTela, a, b);
    await esperarPlacar(ana, a, b);
  });

  await test.step('a lista de eventos da membro bate com a de quem marca', async () => {
    const rotulo = /Eventos \((\d+)\)/i;
    const deQuemMarca = (await marca.getByText(rotulo).first().innerText()).match(rotulo)?.[1];
    console.log(`eventos na tela de quem marca depois do desfazer: ${deQuemMarca}`);
    await expect(ana.getByText(`Eventos (${deQuemMarca})`).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  console.log(`outra tela de quem organiza: ${resumo(naOutraTela)}`);
  console.log(`membro acompanhando: ${resumo(naAna)}`);
  test
    .info()
    .annotations.push(
      { type: 'latencia-organizador', description: resumo(naOutraTela) },
      { type: 'latencia-membro', description: resumo(naAna) },
    );

  await encerrarPelaApi(sessionId);
  await ctx.close();
  await ctxOutra.close();
  await ctxAna.close();
});
