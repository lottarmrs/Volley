import { expect, test } from '@playwright/test';
import { api, elencoDaComunidade, encerrarPelaApi, peladaComecada, type Atleta } from './pelada';

async function sorteio36(
  browser: Parameters<typeof peladaComecada>[0],
  rotacao: '6x0' | '5x1',
  escolher: (a: Atleta[]) => Atleta[],
) {
  const { atletas } = await elencoDaComunidade();
  const jogam = escolher(atletas);
  expect(jogam).toHaveLength(36);
  const { ctx, sessionId, sorteioMs } = await peladaComecada(browser, { jogam, times: 6, rotacao });
  const org = await api('Organizador');
  const { data: times } = await org
    .from('teams')
    .select('name, player_ids')
    .eq('session_id', sessionId);
  await encerrarPelaApi(sessionId);
  await ctx.close();
  return { times: times ?? [], jogam, sorteioMs };
}

test('36 atletas em 6 times de 6, rodizio 6x0', async ({ browser }) => {
  const { times, jogam, sorteioMs } = await sorteio36(browser, '6x0', (atletas) =>
    atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 36),
  );
  console.log(`sorteio 6x0 de 36 atletas: ${sorteioMs} ms`);
  expect(times).toHaveLength(6);
  for (const t of times) expect(t.player_ids).toHaveLength(6);
  const todos = new Set(times.flatMap((t) => t.player_ids));
  expect(todos.size).toBe(36);
  for (const a of jogam) expect(todos.has(a.playerId)).toBe(true);
});

test('36 atletas em 6 times de 6, rodizio 5x1: um levantador por time', async ({ browser }) => {
  const { times, jogam, sorteioMs } = await sorteio36(browser, '5x1', (atletas) => {
    const levantadores = atletas.filter((a) => a.posicao === 'levantador').slice(0, 6);
    const outros = atletas.filter((a) => a.posicao !== 'levantador').slice(0, 30);
    return [...levantadores, ...outros];
  });
  console.log(`sorteio 5x1 de 36 atletas: ${sorteioMs} ms`);
  expect(times).toHaveLength(6);
  const posicao = new Map(jogam.map((a) => [a.playerId, a.posicao]));
  for (const t of times) {
    expect(t.player_ids).toHaveLength(6);
    const levantadores = t.player_ids.filter((id: string) => posicao.get(id) === 'levantador');
    expect(levantadores, `${t.name} com ${levantadores.length} levantadores`).toHaveLength(1);
  }
});
