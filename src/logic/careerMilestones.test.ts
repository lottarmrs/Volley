import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MILESTONE_PRESENTATION, describeMilestone } from './careerMilestones';

// Lidos da migration, nao copiados dela: uma lista transcrita a mao passa a valer
// para sempre, entao um slug novo no SQL nunca derrubaria o teste — que e exatamente
// o que ele deveria pegar.
const MIGRATION = readFileSync(
  new URL('../../supabase/migrations/20260727150000_career_milestones.sql', import.meta.url),
  'utf8',
);

const SLUGS_FROM_SQL = [
  ...MIGRATION.matchAll(/select '([a-z0-9_]+)'(?: as slug)?, min\(occurred_at\)/g),
].map((m) => m[1]);

test('presentation covers every slug the database can emit', () => {
  // Os limiares vivem no SQL; aqui so existe apresentacao. Este teste e o que impede as
  // duas listas de divergirem.
  for (const slug of SLUGS_FROM_SQL) {
    assert.ok(
      MILESTONE_PRESENTATION[slug as keyof typeof MILESTONE_PRESENTATION],
      `missing ${slug}`,
    );
  }
  assert.equal(Object.keys(MILESTONE_PRESENTATION).length, SLUGS_FROM_SQL.length);
});

test('describeMilestone degrades gracefully for an unknown slug', () => {
  // Um slug novo no banco nao pode derrubar a tela — a licao do card de atleta.
  const described = describeMilestone('slug_que_nao_existe');
  assert.equal(typeof described.label, 'string');
  assert.ok(described.label.length > 0);
});
