import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAccountDisplay,
  getCommunitiesNavigationTarget,
  getCurrentPageTitle,
  getDashboardNavigationTarget,
  getHistorySessionNavigationTarget,
  getLiveSessionNavigationTarget,
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
  assert.deepEqual(getHistorySessionNavigationTarget('session-1'), {
    activeModule: 'historico',
    selectedHistorySessionId: 'session-1',
  });
});
