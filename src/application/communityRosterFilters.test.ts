import assert from 'node:assert/strict';
import test from 'node:test';
import type { Player, Session } from '@shared/types';
import { makePlayer, makeSession } from '../test/fixtures';
import { COMMUNITY_ROSTER_FILTERS, matchesCommunityRosterFilter } from './communityRosterFilters';

function atleta(overrides: Partial<Player>): Player {
  return makePlayer(overrides.id ?? 'p1', overrides);
}

test('os dez filtros do elenco continuam disponíveis, com Todos primeiro', () => {
  assert.equal(COMMUNITY_ROSTER_FILTERS.length, 10);
  assert.equal(COMMUNITY_ROSTER_FILTERS[0].value, 'all');
  assert.deepEqual(
    COMMUNITY_ROSTER_FILTERS.map((item) => item.value),
    [
      'all',
      'active',
      'inactive',
      'frequent',
      'absent',
      'setters',
      'central',
      'wing',
      'libero',
      'limited',
    ],
  );
});

test('atividade, frequência e limitação saem do próprio atleta', () => {
  const ativo = atleta({ id: 'a', ativo: true });
  const inativo = atleta({ id: 'b', ativo: false });
  assert.equal(matchesCommunityRosterFilter(ativo, 'active', []), true);
  assert.equal(matchesCommunityRosterFilter(ativo, 'inactive', []), false);
  assert.equal(matchesCommunityRosterFilter(inativo, 'inactive', []), true);

  const frequente = atleta({ id: 'c', status: { presencaFrequente: true } as Player['status'] });
  const raro = atleta({ id: 'c2', status: { presencaFrequente: false } as Player['status'] });
  assert.equal(matchesCommunityRosterFilter(frequente, 'frequent', []), true);
  assert.equal(matchesCommunityRosterFilter(raro, 'frequent', []), false);

  const lesionado = atleta({ id: 'd', status: { lesionado: true } as Player['status'] });
  assert.equal(matchesCommunityRosterFilter(lesionado, 'limited', []), true);
  assert.equal(matchesCommunityRosterFilter(ativo, 'limited', []), false);
});

test('posição separa levantadores, centrais, pontas e líberos', () => {
  const levantador = atleta({ id: 'e', posicaoPrincipal: 'levantador' });
  const central = atleta({ id: 'f', posicaoPrincipal: 'central' });
  const ponteiro = atleta({ id: 'g', posicaoPrincipal: 'ponteiro' });
  const oposto = atleta({ id: 'h', posicaoPrincipal: 'oposto' });
  const libero = atleta({ id: 'i', posicaoPrincipal: 'libero' });

  assert.equal(matchesCommunityRosterFilter(levantador, 'setters', []), true);
  assert.equal(matchesCommunityRosterFilter(central, 'central', []), true);
  assert.equal(matchesCommunityRosterFilter(ponteiro, 'wing', []), true);
  assert.equal(matchesCommunityRosterFilter(oposto, 'wing', []), true);
  assert.equal(matchesCommunityRosterFilter(libero, 'libero', []), true);
  assert.equal(matchesCommunityRosterFilter(libero, 'wing', []), false);
});

test('ausente recente olha a frequência nas sessões da comunidade', () => {
  const jogador = atleta({ id: 'j' });
  const sessoes: Session[] = [];
  assert.equal(matchesCommunityRosterFilter(jogador, 'absent', sessoes), true);

  const presente = makeSession('s1', { selectedPlayerIds: ['j'], status: 'finished' });
  assert.equal(matchesCommunityRosterFilter(jogador, 'absent', [presente]), false);
});

test('todos aceita qualquer atleta vinculado', () => {
  assert.equal(matchesCommunityRosterFilter(atleta({ id: 'k', ativo: false }), 'all', []), true);
});
