import test from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONE_PRESENTATION, describeMilestone } from './careerMilestones';

const SLUGS_FROM_SQL = [
  'first_session', 'first_win',
  'games_10', 'games_50', 'games_100',
  'points_100', 'points_500', 'points_1000',
  'streak_3', 'streak_5',
];

test('presentation covers every slug the database can emit', () => {
  // Os limiares vivem no SQL; aqui so existe apresentacao. Este teste e o que impede as
  // duas listas de divergirem.
  for (const slug of SLUGS_FROM_SQL) {
    assert.ok(MILESTONE_PRESENTATION[slug as keyof typeof MILESTONE_PRESENTATION], `missing ${slug}`);
  }
  assert.equal(Object.keys(MILESTONE_PRESENTATION).length, SLUGS_FROM_SQL.length);
});

test('describeMilestone degrades gracefully for an unknown slug', () => {
  // Um slug novo no banco nao pode derrubar a tela — a licao do card de atleta.
  const described = describeMilestone('slug_que_nao_existe');
  assert.equal(typeof described.label, 'string');
  assert.ok(described.label.length > 0);
});
