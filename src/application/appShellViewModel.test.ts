import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountDisplay, getCurrentPageTitle } from './appShellViewModel';

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
