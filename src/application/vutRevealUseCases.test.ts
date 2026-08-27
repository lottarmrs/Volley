import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVutRevealItemsFromCards } from './vutRevealUseCases';
import type { VutCard } from '../logic/futCards';

function makeCard(overrides: Partial<VutCard> = {}): VutCard {
  return {
    edition: { kind: 'base', label: 'Base', emoji: '' },
    achievements: [],
    ...overrides,
  } as VutCard;
}

test('buildVutRevealItemsFromCards reveals special editions', () => {
  const [item] = buildVutRevealItemsFromCards([
    {
      before: makeCard(),
      after: makeCard({ edition: { kind: 'mvp', label: 'MVP', emoji: '⭐' } }),
    },
  ]);

  assert.equal(item.reasons[0], '⭐ EDIÇÃO ESPECIAL: MVP');
});

test('buildVutRevealItemsFromCards reveals newly unlocked achievements only', () => {
  const items = buildVutRevealItemsFromCards([
    {
      before: makeCard({
        achievements: [
          { id: 'old', name: 'Veterano', emoji: '🎖️', unlocked: true },
          { id: 'new', name: 'Bloqueador', emoji: '🧱', unlocked: false },
        ] as any,
      }),
      after: makeCard({
        achievements: [
          { id: 'old', name: 'Veterano', emoji: '🎖️', unlocked: true },
          { id: 'new', name: 'Bloqueador', emoji: '🧱', unlocked: true },
        ] as any,
      }),
    },
  ]);

  assert.deepEqual(items[0].reasons, ['🏆 CONQUISTA: BLOQUEADOR (🧱)']);
});

test('buildVutRevealItemsFromCards ignores cards without new reveal reasons', () => {
  const items = buildVutRevealItemsFromCards([
    {
      before: makeCard({ achievements: [{ id: 'old', unlocked: true }] as any }),
      after: makeCard({ achievements: [{ id: 'old', unlocked: true }] as any }),
    },
  ]);

  assert.deepEqual(items, []);
});
