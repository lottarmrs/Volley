import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCommunities,
  normalizeGames,
  normalizeSessionDraft,
  normalizeSessions,
  normalizeTournamentConfig,
} from './migrations';

test('normalizeTournamentConfig fills modern tournament defaults', () => {
  const normalized = normalizeTournamentConfig({ roundTrip: true });

  assert.equal(normalized.type, 'tournament');
  assert.equal(normalized.format, 'double_round_robin');
  assert.equal(normalized.victoryRule, 'direct_3');
  assert.deepEqual(normalized.classificationPoints, {
    win: 3,
    loss: 0,
    walkoverWin: 3,
    walkoverLoss: 0,
  });
});

test('normalizeSessions and normalizeGames migrate legacy championship records', () => {
  const [session] = normalizeSessions([
    {
      id: 'session-1',
      type: 'championship',
      config: { type: 'championship', maxPoints: 21 },
    },
  ]);
  const [game] = normalizeGames([{ id: 'game-1', type: 'championship' }]);

  assert.equal(session.type, 'tournament');
  assert.equal(session.communityId, null);
  assert.equal(session.config?.type, 'tournament');
  assert.equal(session.config?.maxPoints, 21);
  assert.equal(game.type, 'tournament');
});

test('normalizeSessionDraft and normalizeCommunities handle missing legacy fields', () => {
  const draft = normalizeSessionDraft({
    session: {
      id: 'session-draft',
      type: 'tournament',
      config: {},
    },
  });
  const [community] = normalizeCommunities([{ name: 'Terça do Vôlei' }]);

  assert.equal(draft.session.type, 'tournament');
  assert.equal(draft.session.config.format, 'round_robin');
  assert.equal(community.name, 'Terça do Vôlei');
  assert.equal(community.defaultFormat, 'free_play');
  assert.equal(community.archived, false);
});

test('normalizers return empty arrays for invalid collection inputs', () => {
  assert.deepEqual(normalizeSessions(null as unknown as []), []);
  assert.deepEqual(normalizeGames(undefined as unknown as []), []);
  assert.deepEqual(normalizeCommunities('bad' as unknown as []), []);
});
