import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_PLAYER_ID,
  extractCommunityId,
  getPageTitleForPath,
  getShellNavigationItems,
  pathForLegacyPage,
  paths,
  resolveAdminRoute,
  resolveBackTarget,
  resolveCommunityRoute,
  resolveLegacyLiveSessionRoute,
  resolveLiveSessionRoute,
  resolveNewSessionPath,
  resolveWizardRoute,
} from './appRoutes';

test('paths monta as rotas globais e as aninhadas de comunidade', () => {
  assert.equal(paths.painel, '/painel');
  assert.equal(paths.agenda, '/agenda');
  assert.equal(paths.comunidades, '/comunidades');
  assert.equal(paths.perfil, '/perfil');
  assert.equal(paths.perfilSync, '/perfil/sync');
  assert.equal(paths.admin, '/admin');
  assert.equal(paths.sessaoAtivaSemComunidade, '/sessao/ativa');
  assert.equal(paths.comunidade('c1'), '/comunidades/c1');
  assert.equal(paths.sessoes('c1'), '/comunidades/c1/sessoes');
  assert.equal(paths.sessaoNova('c1'), '/comunidades/c1/sessoes/nova');
  assert.equal(paths.sessaoNova('c1', 'tournament'), '/comunidades/c1/sessoes/nova?tipo=torneio');
  assert.equal(paths.sessaoAtiva('c1'), '/comunidades/c1/sessoes/ativa');
  assert.equal(paths.torneios('c1'), '/comunidades/c1/sessoes/torneios');
  assert.equal(paths.sessao('c1', 's9'), '/comunidades/c1/sessoes/s9');
  assert.equal(paths.pessoas('c1'), '/comunidades/c1/pessoas');
  assert.equal(paths.atleta('c1', 'p7'), '/comunidades/c1/pessoas/editar-atleta/p7');
  assert.equal(paths.atleta('c1', NEW_PLAYER_ID), '/comunidades/c1/pessoas/editar-atleta/novo');
  assert.equal(paths.gestao('c1'), '/comunidades/c1/gestao');
});

test('desempenho carrega aba e sessão como query deep-linkável', () => {
  assert.equal(paths.desempenho('c1'), '/comunidades/c1/desempenho');
  assert.equal(
    paths.desempenho('c1', { aba: 'historico' }),
    '/comunidades/c1/desempenho?aba=historico',
  );
  assert.equal(
    paths.desempenho('c1', { sessao: 's9' }),
    '/comunidades/c1/desempenho?aba=historico&sessao=s9',
  );
});

test('extractCommunityId só reconhece o id dentro de /comunidades/:id', () => {
  assert.equal(extractCommunityId('/comunidades/c1/pessoas'), 'c1');
  assert.equal(extractCommunityId('/comunidades/c1'), 'c1');
  assert.equal(extractCommunityId('/comunidades'), null);
  assert.equal(extractCommunityId('/painel'), null);
});

test('resolveCommunityRoute manda para a lista quando o id não existe', () => {
  assert.deepEqual(resolveCommunityRoute({ communityId: 'c1', communityIds: ['c1'] }), {
    kind: 'ok',
  });
  assert.deepEqual(resolveCommunityRoute({ communityId: 'c9', communityIds: ['c1'] }), {
    kind: 'redirect',
    to: '/comunidades',
  });
  assert.deepEqual(resolveCommunityRoute({ communityIds: ['c1'] }), {
    kind: 'redirect',
    to: '/comunidades',
  });
});

test('resolveLiveSessionRoute lê a fase operacional, não o status cru', () => {
  const base = { communityId: 'c1', activeSessionCommunityId: 'c1', hasActiveSession: true };
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'em_andamento' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'pausada' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'times_gerados' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'rascunho' }), {
    kind: 'redirect',
    to: '/comunidades/c1/sessoes',
  });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'encerrada' }), {
    kind: 'redirect',
    to: '/comunidades/c1/sessoes',
  });
  assert.deepEqual(
    resolveLiveSessionRoute({ ...base, hasActiveSession: false, phase: 'em_andamento' }),
    { kind: 'redirect', to: '/comunidades/c1/sessoes' },
  );
});

test('resolveLiveSessionRoute reencaminha sessão de outra comunidade e sessão órfã', () => {
  assert.deepEqual(
    resolveLiveSessionRoute({
      communityId: 'c1',
      activeSessionCommunityId: 'c2',
      hasActiveSession: true,
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/comunidades/c2/sessoes/ativa' },
  );
  assert.deepEqual(
    resolveLiveSessionRoute({
      communityId: 'c1',
      activeSessionCommunityId: null,
      hasActiveSession: true,
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/sessao/ativa' },
  );
});

test('resolveLegacyLiveSessionRoute só aceita sessão ativa sem comunidade', () => {
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: true,
      activeSessionCommunityId: null,
      phase: 'em_andamento',
    }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/comunidades/c1/sessoes/ativa' },
  );
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: false,
      activeSessionCommunityId: null,
      phase: 'rascunho',
    }),
    { kind: 'redirect', to: '/painel' },
  );
});

test('resolveAdminRoute é staff-only', () => {
  assert.deepEqual(resolveAdminRoute({ isStaff: true }), { kind: 'ok' });
  assert.deepEqual(resolveAdminRoute({ isStaff: false }), { kind: 'redirect', to: '/painel' });
});

test('resolveWizardRoute cria rascunho, adota sessão órfã e reencaminha a de outra comunidade', () => {
  assert.deepEqual(resolveWizardRoute({ communityId: 'c1', hasActiveSession: false }), {
    kind: 'create',
  });
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: null,
    }),
    { kind: 'adopt' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
    }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c2',
    }),
    { kind: 'redirect', to: '/comunidades/c2/sessoes/nova' },
  );
});

test('resolveNewSessionPath só entra direto quando existe uma única comunidade', () => {
  assert.equal(resolveNewSessionPath({ communityIds: ['c1'] }), '/comunidades/c1/sessoes/nova');
  assert.equal(
    resolveNewSessionPath({ communityIds: ['c1'], type: 'tournament' }),
    '/comunidades/c1/sessoes/nova?tipo=torneio',
  );
  assert.equal(resolveNewSessionPath({ communityIds: [] }), '/comunidades');
  assert.equal(resolveNewSessionPath({ communityIds: ['c1', 'c2'] }), '/comunidades');
});

test('resolveBackTarget não joga o usuário para fora do app em deep link', () => {
  assert.deepEqual(
    resolveBackTarget({ locationKey: 'abc123', fallbackPath: '/comunidades/c1/pessoas' }),
    {
      kind: 'history',
    },
  );
  assert.deepEqual(
    resolveBackTarget({ locationKey: 'default', fallbackPath: '/comunidades/c1/pessoas' }),
    {
      kind: 'path',
      to: '/comunidades/c1/pessoas',
    },
  );
});

test('pathForLegacyPage traduz as páginas que o wizard ainda emite', () => {
  assert.equal(pathForLegacyPage('session-wizard', 'c1'), '/comunidades/c1/sessoes/nova');
  assert.equal(pathForLegacyPage('session-active', 'c1'), '/comunidades/c1/sessoes/ativa');
  assert.equal(pathForLegacyPage('session-active', null), '/sessao/ativa');
  assert.equal(pathForLegacyPage('dashboard', 'c1'), '/painel');
  assert.equal(pathForLegacyPage('players', 'c1'), '/comunidades/c1/pessoas');
  assert.equal(pathForLegacyPage('players', null), '/comunidades');
});

test('getPageTitleForPath deriva o título da URL', () => {
  assert.equal(getPageTitleForPath('/painel'), 'Painel de Controle');
  assert.equal(getPageTitleForPath('/agenda'), 'Agenda');
  assert.equal(getPageTitleForPath('/comunidades'), 'Comunidades');
  assert.equal(getPageTitleForPath('/comunidades/c1'), 'Visão Geral da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes'), 'Sessões');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/nova'), 'Configuração da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/ativa'), 'Sessão em Andamento');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/torneios'), 'Torneios & Campeonatos');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9'), 'Detalhe da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/pessoas'), 'Pessoas');
  assert.equal(getPageTitleForPath('/comunidades/c1/pessoas/editar-atleta/p7'), 'Perfil do Atleta');
  assert.equal(getPageTitleForPath('/comunidades/c1/desempenho'), 'Desempenho');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao'), 'Gestão da Comunidade');
  assert.equal(getPageTitleForPath('/perfil'), 'Meu Perfil');
  assert.equal(getPageTitleForPath('/perfil/sync'), 'Sincronização & Backup Nuvem');
  assert.equal(getPageTitleForPath('/admin'), 'Administração da Plataforma');
  assert.equal(getPageTitleForPath('/sessao/ativa'), 'Sessão em Andamento');
  assert.equal(getPageTitleForPath('/rota/que/nao/existe'), 'Panelinha');
});

test('sidebar global lista as áreas aprovadas e marca a ativa', () => {
  const items = getShellNavigationItems({
    pathname: '/agenda',
    isStaff: false,
    pendingChanges: 3,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, to: item.to, active: item.active, badge: item.badge })),
    [
      { id: 'painel', to: '/painel', active: false, badge: undefined },
      { id: 'agenda', to: '/agenda', active: true, badge: undefined },
      { id: 'comunidades', to: '/comunidades', active: false, badge: undefined },
      { id: 'perfil', to: '/perfil', active: false, badge: 3 },
    ],
  );
});

test('sidebar global expõe administração só para staff', () => {
  const items = getShellNavigationItems({ pathname: '/painel', isStaff: true, pendingChanges: 0 });
  assert.equal(items.at(-1)?.id, 'admin');
  assert.equal(items.at(-1)?.to, '/admin');
});

test('sidebar dentro da comunidade troca para as 5 áreas mais a volta', () => {
  const items = getShellNavigationItems({
    pathname: '/comunidades/c1/pessoas/editar-atleta/p7',
    isStaff: true,
    pendingChanges: 0,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, to: item.to, active: item.active })),
    [
      { id: 'comunidade-visao-geral', to: '/comunidades/c1', active: false },
      { id: 'comunidade-sessoes', to: '/comunidades/c1/sessoes', active: false },
      { id: 'comunidade-pessoas', to: '/comunidades/c1/pessoas', active: true },
      { id: 'comunidade-desempenho', to: '/comunidades/c1/desempenho', active: false },
      { id: 'comunidade-gestao', to: '/comunidades/c1/gestao', active: false },
      { id: 'voltar-comunidades', to: '/comunidades', active: false },
    ],
  );
});
