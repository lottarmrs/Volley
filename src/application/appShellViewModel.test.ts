import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAccountDisplay,
  getCommunitiesNavigationTarget,
  getCurrentPageTitle,
  getDashboardNavigationTarget,
  getHistoryNavigationTarget,
  getHistorySessionNavigationTarget,
  getLiveSessionNavigationTarget,
  getModuleNavigationItems,
  getModuleNavigationTarget,
  getPlayersNavigationTarget,
} from './appShellViewModel';

test('getCurrentPageTitle returns contextual module titles', () => {
  assert.equal(
    getCurrentPageTitle({ activeModule: 'dashboard', page: 'session-wizard' }),
    'Configuração da Sessão',
  );
  assert.equal(
    getCurrentPageTitle({ activeModule: 'players', page: 'player-edit' }),
    'Perfil do Atleta',
  );
  assert.equal(
    getCurrentPageTitle({ activeModule: 'players', page: 'communities' }),
    'Grupos de Comunidade',
  );
  assert.equal(
    getCurrentPageTitle({ activeModule: 'ranking', page: 'dashboard' }),
    'Líderes & Classificações',
  );
});

test('getAccountDisplay prefers profile name, then email, then fallback', () => {
  assert.deepEqual(
    getAccountDisplay({
      profileName: 'Matheus Silva',
      email: 'matheus@example.com',
      fallbackName: 'Administrador',
      fallbackInitials: 'AD',
    }),
    { name: 'Matheus Silva', initials: 'MA' },
  );
  assert.deepEqual(
    getAccountDisplay({
      email: 'panelinha@example.com',
      fallbackName: 'Administrador',
      fallbackInitials: 'AD',
    }),
    { name: 'panelinha', initials: 'PA' },
  );
  assert.deepEqual(
    getAccountDisplay({
      fallbackName: 'Panelinha',
      fallbackInitials: 'PL',
    }),
    { name: 'Panelinha', initials: 'PL' },
  );
});

test('getModuleNavigationTarget routes dashboard and players modules with page changes', () => {
  assert.deepEqual(
    getModuleNavigationTarget({ module: 'dashboard', activeSessionStatus: 'active' }),
    { activeModule: 'dashboard', page: 'session-active' },
  );
  assert.deepEqual(getModuleNavigationTarget({ module: 'dashboard' }), {
    activeModule: 'dashboard',
    page: 'dashboard',
  });
  assert.deepEqual(getModuleNavigationTarget({ module: 'players' }), {
    activeModule: 'players',
    page: 'players',
  });
  assert.deepEqual(getModuleNavigationTarget({ module: 'ranking' }), {
    activeModule: 'ranking',
  });
});

test('specific shell navigation targets describe common routes', () => {
  assert.deepEqual(getDashboardNavigationTarget(), {
    activeModule: 'dashboard',
    page: 'dashboard',
  });
  assert.deepEqual(getPlayersNavigationTarget(), {
    activeModule: 'players',
    page: 'players',
  });
  assert.deepEqual(getCommunitiesNavigationTarget(), {
    activeModule: 'players',
    page: 'communities',
  });
  assert.deepEqual(getLiveSessionNavigationTarget(), {
    activeModule: 'dashboard',
    page: 'session-active',
  });
  assert.deepEqual(getHistoryNavigationTarget(), {
    activeModule: 'historico',
  });
  assert.deepEqual(getHistorySessionNavigationTarget('session-1'), {
    activeModule: 'historico',
    selectedHistorySessionId: 'session-1',
  });
});

test('module navigation items expose staff-only management and pending sync badge', () => {
  assert.deepEqual(
    getModuleNavigationItems({ isStaff: false, pendingChanges: 3 }).map((item) => ({
      id: item.id,
      badge: item.badge,
    })),
    [
      { id: 'dashboard', badge: undefined },
      { id: 'torneios', badge: undefined },
      { id: 'players', badge: undefined },
      { id: 'ranking', badge: undefined },
      { id: 'historico', badge: undefined },
      { id: 'conta', badge: 3 },
      { id: 'configuracoes', badge: undefined },
    ],
  );

  assert.equal(getModuleNavigationItems({ isStaff: true, pendingChanges: 0 }).at(-1)?.id, 'gestao');
});

import { buildPendingDeliveryNotice } from './appShellViewModel';

test('nao avisa quando nao ha pendente', () => {
  assert.equal(
    buildPendingDeliveryNotice({
      pendingChanges: 0,
      connectivity: 'offline',
      hasOpenFailure: true,
    }),
    null,
  );
});

test('nao avisa quando ha pendente mas tudo esta bem', () => {
  // Pendente com rede e sem falha e so o sync que ainda nao rodou. Avisar aqui
  // treinaria a pessoa a ignorar o aviso.
  assert.equal(
    buildPendingDeliveryNotice({
      pendingChanges: 3,
      connectivity: 'online',
      hasOpenFailure: false,
    }),
    null,
  );
});

test('avisa com pendente e sem rede, dizendo a consequencia', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 3,
    connectivity: 'offline',
    hasOpenFailure: false,
  });
  assert.ok(aviso);
  // "pendentes" descreve uma fila; "nao foram para a nuvem" descreve uma perda possivel.
  assert.match(aviso!.message, /não foram para a nuvem/i);
  assert.match(aviso!.message, /3/);
});

test('avisa com pendente e falha aberta, mesmo com rede', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 1,
    connectivity: 'online',
    hasOpenFailure: true,
  });
  assert.ok(aviso);
  assert.match(aviso!.message, /1 alteração/i);
});
