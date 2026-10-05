import { expect, type Browser } from '@playwright/test';
import { api, contas, entrarPelaTela, rpc } from './atores';

export { api };

export const ORGANIZA = 'http://localhost:3300';
export const MEMBRO = 'http://127.0.0.1:3300';

export interface Atleta {
  nome: string;
  playerId: string;
  posicao: string;
}

export async function elencoDaComunidade(): Promise<{ comunidadeId: string; atletas: Atleta[] }> {
  const org = await api('Organizador');
  const { data: comunidade } = await org
    .from('communities')
    .select('id, local_id')
    .eq('name', 'Pelada Local')
    .single();
  const { data: membros } = await org
    .from('community_members')
    .select('user_id')
    .eq('community_id', comunidade!.id)
    .eq('status', 'active');
  const ids = (membros ?? []).map((m) => m.user_id);
  const { data: perfis } = await org.from('profiles').select('id, email').in('id', ids);
  const { data: jogadores } = await org
    .from('players')
    .select('id, user_id, primary_position')
    .in('user_id', ids);
  const atletas: Atleta[] = [];
  for (const id of ids) {
    const email = (perfis ?? []).find((p) => p.id === id)?.email;
    const conta = contas.contas.find((c) => c.email === email);
    const jogador = (jogadores ?? []).find((j) => j.user_id === id);
    if (!conta || conta.papel !== 'membro' || !jogador) continue;
    atletas.push({ nome: conta.nome, playerId: jogador.id, posicao: jogador.primary_position });
  }
  return { comunidadeId: comunidade!.local_id ?? comunidade!.id, atletas };
}

export function primeiroNomeOuNome(nome: string): string {
  return nome.startsWith('Atleta ') ? nome : nome.split(' ')[0];
}

export async function peladaComecada(
  browser: Browser,
  opcoes: { jogam: Atleta[]; times: number; rotacao: '6x0' | '5x1' },
) {
  const { comunidadeId } = await elencoDaComunidade();
  const { jogam, times, rotacao } = opcoes;
  const n = jogam.length;

  const ctx = await browser.newContext({ baseURL: ORGANIZA });
  const page = await ctx.newPage();
  await entrarPelaTela(page, 'Organizador');
  await page.goto(`/comunidades/${comunidadeId}/sessoes/nova`);
  await page.getByLabel('Vagas na lista').fill(String(n));
  await page.getByRole('button', { name: /marcar e abrir a lista/i }).click();
  await page.waitForURL(/\/inscricao$/, { timeout: 30_000 });
  const sessionId = page.url().split('/sessoes/')[1].split('/')[0];

  const { window_id: windowId } = await rpc<{ window_id: string }>(
    'Organizador',
    'read_session_registration',
    { p_session_id: sessionId },
  );
  for (const a of jogam) {
    await rpc(primeiroNomeOuNome(a.nome), 'join_registration', {
      p_command_id: crypto.randomUUID(),
      p_entry_id: crypto.randomUUID(),
      p_window_id: windowId,
    });
  }
  await page.reload();
  await expect(page.getByText(`Lista aberta · ${n} de ${n} confirmados`)).toBeVisible({
    timeout: 20_000,
  });

  page.once('dialog', (d) => void d.accept());
  await page
    .getByRole('button', { name: /fechar a lista/i })
    .first()
    .click();
  await expect(page.getByText(`Lista fechada · ${n} jogam`)).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole('button', { name: /sortear os times/i })
    .first()
    .click();
  await page.waitForURL(/\/sortear$/);
  await page.getByRole('heading', { name: /jogo livre/i }).click();
  await page.getByRole('button', { name: String(times), exact: true }).click();
  await page.getByRole('button', { name: /^revisar$/i }).click();
  await page.getByRole('button', { name: new RegExp(`^${rotacao}`) }).click();
  const inicio = Date.now();
  await page.getByRole('button', { name: /gerar times equilibrados/i }).click();
  await page.getByRole('button', { name: /começar a pelada/i }).click({ timeout: 60_000 });
  const sorteioMs = Date.now() - inicio;
  await page.waitForURL(/\/sessoes\/ativa$/, { timeout: 30_000 });

  const org = await api('Organizador');
  await expect
    .poll(
      async () =>
        (await org.from('sessions').select('lifecycle_status').eq('id', sessionId).single()).data
          ?.lifecycle_status,
      { timeout: 20_000 },
    )
    .toBe('IN_PROGRESS');
  return { ctx, page, sessionId, comunidadeId, sorteioMs };
}

export async function encerrarPelaApi(sessionId: string) {
  const org = await api('Organizador');
  await org
    .from('games')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .in('status', ['active', 'scheduled', 'paused']);
  await rpc('Organizador', 'finish_target_session', {
    p_command_id: crypto.randomUUID(),
    p_session_id: sessionId,
    p_expected_revision: (
      await org.from('sessions').select('revision').eq('id', sessionId).single()
    ).data!.revision,
  });
}

export async function encerrarTudoEmAndamento() {
  const org = await api('Organizador');
  const { data: abertas } = await org
    .from('sessions')
    .select('id')
    .eq('lifecycle_status', 'IN_PROGRESS');
  for (const s of abertas ?? []) await encerrarPelaApi(s.id);
  return (abertas ?? []).length;
}
