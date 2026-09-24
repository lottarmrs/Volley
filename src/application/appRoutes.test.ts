import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SESSION_PHASES,
  NEW_PLAYER_ID,
  extractCommunityId,
  getPageTitleForPath,
  getReturnRouteForPath,
  getShellNavigationItems,
  pathForLegacyPage,
  paths,
  resolveAdminRoute,
  resolveBackTarget,
  resolveCommunityAreaAccess,
  resolveCommunityRoute,
  resolveLegacyQueryRoute,
  resolveLegacyLiveSessionRoute,
  resolveLiveSessionRoute,
  resolveNewSessionPath,
  resolvePlayerEditAction,
  resolvePlayerRoute,
  resolveWizardRoute,
} from './appRoutes';

test('paths monta as rotas globais e as aninhadas de comunidade', () => {
  assert.equal(paths.painel, '/painel');
  assert.equal(paths.agenda, '/agenda');
  assert.equal(paths.comunidades, '/comunidades');
  assert.equal(paths.perfil, '/perfil');
  assert.equal(paths.perfilSync, '/perfil/sync');
  assert.equal(paths.plataforma, '/plataforma');
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
  assert.deepEqual(
    resolveWizardRoute({ communityId: 'c1', hasActiveSession: false, phase: 'rascunho' }),
    {
      kind: 'create',
    },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: null,
      phase: 'rascunho',
    }),
    { kind: 'adopt' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
      phase: 'rascunho',
    }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c2',
      phase: 'rascunho',
    }),
    { kind: 'redirect', to: '/comunidades/c2/sessoes/nova' },
  );
});

test('resolveWizardRoute nunca monta o wizard sobre uma sessão em fase jogável', () => {
  for (const phase of LIVE_SESSION_PHASES) {
    assert.deepEqual(
      resolveWizardRoute({
        communityId: 'c1',
        hasActiveSession: true,
        activeSessionCommunityId: 'c1',
        phase,
      }),
      { kind: 'redirect', to: '/comunidades/c1/sessoes/ativa' },
      `fase ${phase} deveria mandar para a sessão ativa da dona`,
    );
    assert.deepEqual(
      resolveWizardRoute({
        communityId: 'c1',
        hasActiveSession: true,
        activeSessionCommunityId: null,
        phase,
      }),
      { kind: 'redirect', to: '/sessao/ativa' },
      `fase ${phase} não pode adotar uma sessão órfã em jogo`,
    );
  }
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
      phase: 'encerrada',
    }),
    { kind: 'ok' },
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
  assert.equal(getPageTitleForPath('/pelada/resumo'), 'Resumo da Pelada');
  assert.equal(getPageTitleForPath('/comunidades'), 'Comunidades');
  assert.equal(getPageTitleForPath('/comunidades/c1'), 'Visão Geral da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes'), 'Sessões');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/nova'), 'Configuração da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/ativa'), 'Sessão em Andamento');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/torneios'), 'Torneios & Campeonatos');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9'), 'Detalhe da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9/inscricao'), 'Inscrição');
  assert.equal(getPageTitleForPath('/comunidades/c1/pessoas'), 'Pessoas');
  assert.equal(getPageTitleForPath('/comunidades/c1/pessoas/editar-atleta/p7'), 'Perfil do Atleta');
  assert.equal(getPageTitleForPath('/comunidades/c1/desempenho'), 'Desempenho');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao'), 'Gestão da Comunidade');
  assert.equal(getPageTitleForPath('/perfil'), 'Meu Perfil');
  assert.equal(getPageTitleForPath('/perfil/sync'), 'Sincronização & Backup Nuvem');
  assert.equal(getPageTitleForPath('/plataforma'), 'Administração da plataforma');
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
      { id: 'ligas', to: '/ligas', active: false, badge: undefined },
      { id: 'comunidades', to: '/comunidades', active: false, badge: undefined },
      { id: 'perfil', to: '/perfil', active: false, badge: 3 },
    ],
  );
});

test('sidebar do convidado mostra só a pelada de hoje, sem becos de conta', () => {
  const items = getShellNavigationItems({
    pathname: '/painel',
    isStaff: false,
    pendingChanges: 0,
    isGuest: true,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, to: item.to, active: item.active })),
    [{ id: 'painel', to: '/painel', active: true }],
  );
});

test('convidado dentro da comunidade não ganha a sidebar de comunidade', () => {
  const items = getShellNavigationItems({
    pathname: '/comunidades/c1/sessoes/nova',
    isStaff: false,
    pendingChanges: 0,
    isGuest: true,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'painel');
});

test('o começo rápido mantém a pelada de hoje marcada como ativa', () => {
  const items = getShellNavigationItems({
    pathname: '/comecar',
    isStaff: false,
    pendingChanges: 0,
    isGuest: true,
  });
  assert.equal(items[0].active, true);
});

test('sidebar global expõe administração só para staff', () => {
  const items = getShellNavigationItems({ pathname: '/painel', isStaff: true, pendingChanges: 0 });
  assert.equal(items.at(-1)?.id, 'plataforma');
  assert.equal(items.at(-1)?.to, '/plataforma');
});

test('resolvePlayerRoute aceita id, handle e a sentinela de novo atleta', () => {
  const players = [{ id: 'p1', username: 'ana' }, { id: 'p2' }];
  assert.deepEqual(resolvePlayerRoute({ param: 'p1', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'ana', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'ANA', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'p2', players }), { kind: 'ok', playerId: 'p2' });
  assert.deepEqual(resolvePlayerRoute({ param: NEW_PLAYER_ID, players }), { kind: 'new' });
  assert.deepEqual(resolvePlayerRoute({ param: 'nao-existe', players }), { kind: 'not-found' });
  assert.deepEqual(resolvePlayerRoute({ players }), { kind: 'not-found' });
});

test('resolvePlayerRoute prefere id quando um handle colide com um id', () => {
  const players = [
    { id: 'ana', username: 'zeca' },
    { id: 'p2', username: 'ana' },
  ];
  assert.deepEqual(resolvePlayerRoute({ param: 'ana', players }), { kind: 'ok', playerId: 'ana' });
});

test('resolvePlayerEditAction nao recarrega quando o atleta em edicao ja e o alvo resolvido', () => {
  assert.equal(
    resolvePlayerEditAction({
      playerId: 'ana',
      targetPlayerId: 'p1',
      editingPlayerId: 'p1',
      hasEditingPlayer: true,
    }),
    'none',
  );
});

test('resolvePlayerEditAction pede o carregamento do alvo quando o atleta em edicao ainda nao e ele', () => {
  assert.equal(
    resolvePlayerEditAction({
      playerId: 'ana',
      targetPlayerId: 'p1',
      editingPlayerId: undefined,
      hasEditingPlayer: false,
    }),
    'edit-existing',
  );
});

test('resolvePlayerEditAction cria o atleta novo so quando ainda nao ha edicao em curso', () => {
  assert.equal(
    resolvePlayerEditAction({
      playerId: NEW_PLAYER_ID,
      targetPlayerId: undefined,
      editingPlayerId: undefined,
      hasEditingPlayer: false,
    }),
    'add-new',
  );
  assert.equal(
    resolvePlayerEditAction({
      playerId: NEW_PLAYER_ID,
      targetPlayerId: undefined,
      editingPlayerId: 'novo-id',
      hasEditingPlayer: true,
    }),
    'none',
  );
});

test('resolvePlayerEditAction nao faz nada sem playerId ou quando o alvo nao existe', () => {
  assert.equal(
    resolvePlayerEditAction({
      targetPlayerId: undefined,
      editingPlayerId: undefined,
      hasEditingPlayer: false,
    }),
    'none',
  );
  assert.equal(
    resolvePlayerEditAction({
      playerId: 'nao-existe',
      targetPlayerId: undefined,
      editingPlayerId: undefined,
      hasEditingPlayer: false,
    }),
    'none',
  );
});

test('sidebar dentro da comunidade troca para as 6 áreas mais a volta', () => {
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
      { id: 'comunidade-ligas', to: '/comunidades/c1/ligas', active: false },
      { id: 'comunidade-desempenho', to: '/comunidades/c1/desempenho', active: false },
      { id: 'comunidade-gestao', to: '/comunidades/c1/gestao', active: false },
      { id: 'voltar-comunidades', to: '/comunidades', active: false },
    ],
  );
});

test('getReturnRouteForPath calcula o destino padronizado de retorno', () => {
  assert.equal(
    getReturnRouteForPath('/comunidades/c1/pessoas/editar-atleta/p7'),
    '/comunidades/c1/pessoas',
  );
  assert.equal(getReturnRouteForPath('/comunidades/c1/sessoes/nova'), '/comunidades/c1/sessoes');
  assert.equal(getReturnRouteForPath('/comunidades/c1/sessoes/s9'), '/comunidades/c1/sessoes');
  assert.equal(getReturnRouteForPath('/comunidades/c1/pessoas'), '/comunidades/c1');
  assert.equal(getReturnRouteForPath('/comunidades/c1'), '/comunidades');
  assert.equal(getReturnRouteForPath('/perfil/sync'), '/perfil');
  assert.equal(getReturnRouteForPath('/ligas/l1'), '/ligas');
  assert.equal(getReturnRouteForPath('/painel'), null);
});

test('paths das areas novas da comunidade', () => {
  assert.equal(paths.presenca('c1'), '/comunidades/c1/sessoes/presenca');
  assert.equal(paths.listaWhatsapp('c1'), '/comunidades/c1/sessoes/lista-whatsapp');
  assert.equal(paths.ligasComunidade('c1'), '/comunidades/c1/ligas');
  assert.equal(paths.desempenho('c1'), '/comunidades/c1/desempenho');
  assert.equal(paths.historico('c1'), '/comunidades/c1/desempenho/historico');
  assert.equal(
    paths.historico('c1', { sessao: 's1' }),
    '/comunidades/c1/desempenho/historico?sessao=s1',
  );
  assert.equal(paths.gestao('c1'), '/comunidades/c1/gestao');
  assert.equal(paths.regras('c1'), '/comunidades/c1/gestao/regras');
  assert.equal(paths.dados('c1'), '/comunidades/c1/gestao/dados');
  assert.equal(paths.plataforma, '/plataforma');
  assert.equal(paths.inscricao('c1', 's9'), '/comunidades/c1/sessoes/s9/inscricao');
});

test('enderecos antigos redirecionam para os novos', () => {
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?aba=ranking'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?aba=historico'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho/historico',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?sessao=s1'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho/historico?sessao=s1',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/admin', ''), {
    kind: 'redirect',
    to: '/plataforma',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', ''), { kind: 'ok' });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/gestao', ''), { kind: 'ok' });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/sessoes/presenca', ''), { kind: 'ok' });
});

test('gestao exige cargo na comunidade', () => {
  assert.deepEqual(
    resolveCommunityAreaAccess({ area: 'gestao', hasRole: false, communityId: 'c1' }),
    { kind: 'redirect', to: '/comunidades/c1' },
  );
  assert.deepEqual(
    resolveCommunityAreaAccess({ area: 'gestao', hasRole: true, communityId: 'c1' }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveCommunityAreaAccess({ area: 'pessoas', hasRole: false, communityId: 'c1' }),
    { kind: 'ok' },
  );
});

test('a lateral da comunidade lista as seis areas e marca a ativa', () => {
  const items = getShellNavigationItems({
    pathname: '/comunidades/c1/gestao/regras',
    isStaff: false,
    pendingChanges: 0,
  });
  assert.deepEqual(
    items.map((item) => item.label),
    ['Visão geral', 'Sessões', 'Pessoas', 'Ligas', 'Desempenho', 'Gestão', 'Trocar comunidade'],
  );
  assert.deepEqual(
    items.filter((item) => item.active).map((item) => item.id),
    ['comunidade-gestao'],
  );

  const naPresenca = getShellNavigationItems({
    pathname: '/comunidades/c1/sessoes/presenca',
    isStaff: false,
    pendingChanges: 0,
  });
  assert.deepEqual(
    naPresenca.filter((item) => item.active).map((item) => item.id),
    ['comunidade-sessoes'],
  );
});

test('a plataforma substitui a administracao no menu e no titulo', () => {
  const items = getShellNavigationItems({
    pathname: '/plataforma',
    isStaff: true,
    pendingChanges: 0,
  });
  const plataforma = items.find((item) => item.id === 'plataforma');
  assert.equal(plataforma?.label, 'Plataforma');
  assert.equal(plataforma?.to, '/plataforma');
  assert.equal(plataforma?.active, true);
  assert.equal(getPageTitleForPath('/plataforma'), 'Administração da plataforma');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao/regras'), 'Regras da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao/dados'), 'Dados da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/presenca'), 'Presença');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/lista-whatsapp'), 'Lista de WhatsApp');
  assert.equal(getPageTitleForPath('/comunidades/c1/ligas'), 'Ligas da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/desempenho/historico'), 'Histórico');
});

test('o sorteio tem caminho e titulo proprios: e um momento, nao um passo do wizard', () => {
  assert.equal(paths.sortear('c1', 's9'), '/comunidades/c1/sessoes/s9/sortear');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9/sortear'), 'Sortear os Times');
  assert.equal(
    getPageTitleForPath('/comunidades/c1/sessoes/s9'),
    'Detalhe da Sessão',
    'a rota irma nao e afetada',
  );
});
