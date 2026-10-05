# Placar sem sinal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o placar ao vivo de uma pelada online continua marcando sem sinal, guarda as gravações
numa fila no aparelho e as envia quando o sinal volta, perguntando antes se outra pessoa mexeu no
placar nesse meio-tempo.

**Architecture:** o `writeField` do `useSessions` já calcula, a cada toque, o bundle anterior e o
novo. Quando a mudança é só do placar da pelada ativa (jogos, pontos, relatórios de jogo e o
rodízio na raiz) e não há sinal — ou já há fila, ou a gravação falhou por rede — a diferença vira
uma entrada da fila (`src/application/scoreQueue.ts`), guardada por conta no aparelho
(`src/storage/scoreQueueStore.ts`). O cache é sempre "banco + fila": toda leitura aplica a fila
por cima. Ao voltar o sinal, `drainScoreQueue` confere o banco (controle e pontos alheios) e envia
as entradas em ordem pelo mesmo `persistSessionBundleChanges`.

**Tech Stack:** React 19, TanStack Query 5, Supabase JS, Vitest + RTL (`.spec.tsx`), Node test
runner + tsx (`.test.ts`), Playwright contra a pilha local (`e2e/local-stack`).

**Spec:** `docs/superpowers/specs/2026-10-05-placar-sem-sinal-design.md`

## Global Constraints

- Sem migration e sem RPC nova.
- Textos da interface em pt-BR, exatamente como na spec:
  - "Sem sinal · N pontos guardados no aparelho" (N com plural: "1 ponto guardado", "N pontos
    guardados")
  - "Enviando…"
  - "Encerre quando o sinal voltar e os pontos forem enviados."
  - "Enquanto você estava sem sinal, {nome} assumiu o placar e marcou {n} pontos. Você tem {m}
    pontos guardados."
  - Botões: "Enviar os meus mesmo assim" e "Descartar os meus"
  - "Último ponto há N min — quem marca pode estar sem sinal" (a partir de 3 min)
- Encerrar a pelada pede sinal e fica travado enquanto houver fila.
- Nenhum comentário novo em TS/TSX (regra do repositório).
- `localStorage` só dentro de `src/storage/` (regra AF-FREEZE-007); chave nova fora de
  `STORAGE_KEYS`: `volley.placar.<userId>`. Não acrescentar nada a `FROZEN_STORAGE_KEYS`.
- Supabase só em `src/infra/supabase/` (AF-FREEZE-004).
- Imports por alias (`@app`, `@infra`, `@shared/types`, `@storage`…).
- Commits em português sem acentos, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage por caminho explícito; nunca
  `git stash`.
- Verificação final: `npm run lint`, `npm run lint:eslint` (0 erros), `npm run format:check` nos
  arquivos tocados, `npm test`, `npm run build`, e a suíte da pilha local.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/application/scoreQueue.ts` (novo) | Tipos da fila, `isScoringChange`, `entryFromChange`, `bundlesForEntry`, `applyQueue`, `startScoreQueue`, `pushEntry`, `detectQueueConflict`, `conflictMessage`, `pendingLabel` |
| `src/application/scoreQueue.test.ts` (novo) | Testes puros |
| `src/application/scoreQueueDrain.ts` (novo) | `drainScoreQueue`: confere conflito e envia em ordem |
| `src/application/scoreQueueDrain.test.ts` (novo) | Testes puros com dublês |
| `src/storage/scoreQueueStore.ts` (novo) | `loadScoreQueue`, `saveScoreQueue`, `clearScoreQueue` |
| `src/storage/scoreQueueStore.spec.ts` (novo) | jsdom |
| `src/infra/supabase/liveScoreCloudService.ts` (novo) | `fetchLiveScoreState` |
| `src/infra/supabase/liveScoreCloudService.test.ts` (novo) | Cliente falso |
| `src/hooks/useSessions.ts` | Fila no `writeField`, leitura "banco + fila", envio ao voltar o sinal, `scoreQueue` exposto |
| `src/hooks/useSessions.spec.tsx` | Cenários com fila |
| `src/application/scoringLock.ts` | Textos novos, `staleScoreNotice` |
| `src/application/scoringLock.test.ts` | testes de `staleScoreNotice` |
| `src/application/screens/sessionActiveView/sessionActiveViewContract.ts` | Campo `scoreQueue` |
| `src/components/live/SessionActiveView.tsx` | Faixa, encerrar travado, pergunta de conflito, aviso de placar parado |
| `src/components/live/SessionActiveView.spec.tsx` | Cenários da tela |
| `src/app/routes/sessionRoutes.tsx`, `src/app/routes/globalRoutes.tsx` | Passam `scoreQueue` ao contrato |
| `PRODUCT.md` | Princípio 2 |
| `e2e/local-stack/sem-sinal.spec.ts` (novo) | Pilha local |

---

### Task 1: Fila pura (`scoreQueue.ts`)

**Files:**
- Create: `src/application/scoreQueue.ts`
- Test: `src/application/scoreQueue.test.ts`

**Interfaces:**
- Consumes: `SessionBundle` de `src/application/sessionDataQueries.ts`; `diffById` de
  `src/application/rowDiff.ts`.
- Produces (usados nas tasks 2–6):
  ```ts
  export interface ScoreRows { games: Game[]; pointEvents: PointEvent[]; gameReports: GameReport[] }
  export interface ScoreQueueEntry {
    seq: number; at: string; sessionId: string;
    sessionBefore: Session; sessionAfter: Session | null;
    upserts: ScoreRows; removals: ScoreRows;
  }
  export interface ScoreQueueState {
    userId: string; sessionId: string; base: SessionBundle;
    knownPointIds: string[]; entries: ScoreQueueEntry[];
  }
  export interface LiveScoreState { controlledByUserId: string | null; controllerName: string | null; pointIds: string[] }
  export interface ScoreQueueConflict { takenOverBy: string | null; foreignPoints: number; myPoints: number }
  export function sliceForSession(bundle: SessionBundle, sessionId: string): SessionBundle
  export function isScoringChange(prev: SessionBundle, next: SessionBundle, sessionId: string): boolean
  export function entryFromChange(prev: SessionBundle, next: SessionBundle, sessionId: string, seq: number, at: string): ScoreQueueEntry
  export function bundlesForEntry(entry: ScoreQueueEntry): { prev: SessionBundle; next: SessionBundle }
  export function applyQueue(bundle: SessionBundle, entries: ScoreQueueEntry[]): SessionBundle
  export function startScoreQueue(input: { userId: string; sessionId: string; base: SessionBundle }): ScoreQueueState
  export function pushEntry(state: ScoreQueueState, entry: ScoreQueueEntry): ScoreQueueState
  export function nextSeq(state: ScoreQueueState | null): number
  export function queuedPointCount(state: ScoreQueueState | null): number
  export function detectQueueConflict(input: { state: ScoreQueueState; live: LiveScoreState }): ScoreQueueConflict | null
  export function conflictMessage(conflict: ScoreQueueConflict): string
  export function pendingLabel(count: number): string
  ```

Regras:
- **Por que `upserts`/`removals` e não o bundle inteiro:** a fila vai para o `localStorage` e volta
  por `JSON.parse`; `diffById` compara por referência, então linhas iguais virariam "mudadas" e
  seriam regravadas com dado velho. A entrada guarda só o que mudou no toque.
- `isScoringChange`: verdadeiro só se a sessão existe em `prev`; `teams` e `sessionReports` sem
  diferença; em `sessions`, nada removido e a única linha mudada é a da pelada com o **mesmo
  `status`** (rodízio do próximo jogo; encerrar muda o status e não entra); em `games`,
  `pointEvents` e `gameReports`, toda linha mudada ou removida é desta pelada.
- `queuedPointCount`: pontos (`eventKind !== 'highlight'`, sem `deletedAt`) que aparecem em
  `upserts.pointEvents` de alguma entrada e ainda não desfeitos na última versão — conte os ids
  distintos da última versão de cada ponto.
- `detectQueueConflict`: `foreignPoints` = ids em `live.pointIds` que não estão em
  `state.knownPointIds` nem em nenhum `upserts.pointEvents` da fila; `takenOverBy` =
  `live.controllerName ?? 'outra pessoa'` quando `live.controlledByUserId` existe e é diferente de
  `state.userId`, senão `null`. Sem os dois, `null`.
- `conflictMessage`: "Enquanto você estava sem sinal, {quem} assumiu o placar e marcou {n}
  pontos. Você tem {m} pontos guardados." Variações: sem troca de controle, "{quem}" vira
  "outra pessoa"; `n` com plural ("1 ponto"/"N pontos"), e com `foreignPoints === 0` a frase do
  meio é "assumiu o placar"; `m` com plural ("1 ponto guardado"/"N pontos guardados").
- `pendingLabel(n)`: "Sem sinal · 1 ponto guardado no aparelho" / "Sem sinal · N pontos guardados
  no aparelho".

- [ ] **Step 1: Escrever os testes que falham**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeSession } from '../test/fixtures';
import type { PointEvent } from '@shared/types';
import { emptySessionBundle, type SessionBundle } from './sessionDataQueries';
import {
  applyQueue,
  bundlesForEntry,
  conflictMessage,
  detectQueueConflict,
  entryFromChange,
  isScoringChange,
  pendingLabel,
  pushEntry,
  queuedPointCount,
  startScoreQueue,
} from './scoreQueue';

const pelada = makeSession('s1', { status: 'active', controlledByUserId: 'u1' });
const outra = makeSession('s2', { status: 'active' });
const jogo = makeGame('g1', 's1');

function ponto(id: string, antes: number, extra: Partial<PointEvent> = {}): PointEvent {
  return {
    id,
    sessionId: 's1',
    gameId: 'g1',
    sequenceNumber: antes + 1,
    scoringTeamId: 'team-a',
    concedingTeamId: 'team-b',
    scoreBefore: { teamA: antes, teamB: 0 },
    scoreAfter: { teamA: antes + 1, teamB: 0 },
    timestamp: `2026-10-05T20:00:0${antes}.000Z`,
    ...extra,
  };
}

function bundle(over: Partial<SessionBundle> = {}): SessionBundle {
  return { ...emptySessionBundle(), sessions: [pelada, outra], games: [jogo], ...over };
}

function marcar(antes: SessionBundle, p: PointEvent): SessionBundle {
  return {
    ...antes,
    pointEvents: [...antes.pointEvents, p],
    games: antes.games.map((g) =>
      g.id === 'g1' ? { ...g, scoreA: p.scoreAfter.teamA, pointIds: [...g.pointIds, p.id] } : g,
    ),
  };
}

const roundtrip = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

test('ponto e jogo da pelada ativa sao mudanca do placar', () => {
  const antes = bundle();
  assert.equal(isScoringChange(antes, marcar(antes, ponto('p1', 0)), 's1'), true);
});

test('encerrar, mexer em times ou em outra pelada nao entra na fila', () => {
  const antes = bundle();
  const encerrada = { ...antes, sessions: [{ ...pelada, status: 'finished' as const }, outra] };
  assert.equal(isScoringChange(antes, encerrada, 's1'), false);
  const times = { ...antes, teams: [{ id: 't', sessionId: 's1', name: 'T', playerIds: [] }] };
  assert.equal(isScoringChange(antes, times as SessionBundle, 's1'), false);
  const alheio = { ...antes, games: [...antes.games, makeGame('g9', 's2')] };
  assert.equal(isScoringChange(antes, alheio, 's1'), false);
});

test('rodizio na raiz, com o mesmo status, entra na fila', () => {
  const antes = bundle();
  const rodizio = {
    ...antes,
    sessions: [{ ...pelada, config: { ...pelada.config!, initialQueue: ['x'] } }, outra],
  } as SessionBundle;
  assert.equal(isScoringChange(antes, rodizio, 's1'), true);
});

test('a entrada guarda so o que mudou e sobrevive ao JSON', () => {
  const antes = bundle();
  const depois = marcar(antes, ponto('p1', 0));
  const entrada = roundtrip(entryFromChange(antes, depois, 's1', 1, 'agora'));
  assert.deepEqual(entrada.upserts.pointEvents.map((p) => p.id), ['p1']);
  assert.deepEqual(entrada.upserts.games.map((g) => g.id), ['g1']);
  assert.equal(entrada.sessionAfter, null);
  const { prev, next } = bundlesForEntry(entrada);
  assert.equal(prev.sessions[0], next.sessions[0]);
  assert.deepEqual(prev.pointEvents, []);
  assert.deepEqual(next.pointEvents.map((p) => p.id), ['p1']);
});

test('a releitura do banco com a fila por cima nao volta o placar', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const dois = marcar(um, ponto('p2', 1));
  const entradas = roundtrip([
    entryFromChange(base, um, 's1', 1, 'a'),
    entryFromChange(um, dois, 's1', 2, 'b'),
  ]);
  const visto = applyQueue(base, entradas);
  assert.equal(visto.games.find((g) => g.id === 'g1')?.scoreA, 2);
  assert.deepEqual(visto.pointEvents.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(visto.sessions.map((s) => s.id), ['s1', 's2']);
});

test('desfazer depois de marcar, os dois na fila, termina com o ponto marcado como desfeito', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const desfeito = {
    ...um,
    pointEvents: um.pointEvents.map((p) => ({ ...p, deletedAt: 'x' })),
    games: um.games.map((g) => ({ ...g, scoreA: 0, pointIds: [] })),
  };
  const entradas = [
    entryFromChange(base, um, 's1', 1, 'a'),
    entryFromChange(um, desfeito, 's1', 2, 'b'),
  ];
  const visto = applyQueue(base, entradas);
  assert.equal(visto.games[0].scoreA, 0);
  assert.equal(visto.pointEvents[0].deletedAt, 'x');
});

test('conta os pontos guardados sem os desfeitos', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const dois = marcar(um, ponto('p2', 1));
  const desfeito = {
    ...dois,
    pointEvents: dois.pointEvents.map((p) => (p.id === 'p2' ? { ...p, deletedAt: 'x' } : p)),
  };
  let fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base });
  fila = pushEntry(fila, entryFromChange(base, um, 's1', 1, 'a'));
  fila = pushEntry(fila, entryFromChange(um, dois, 's1', 2, 'b'));
  fila = pushEntry(fila, entryFromChange(dois, desfeito, 's1', 3, 'c'));
  assert.equal(queuedPointCount(fila), 1);
});

test('conflito quando outra pessoa assumiu ou marcou; sem conflito com so os meus', () => {
  const base = bundle({ pointEvents: [ponto('p0', 0)] });
  const um = marcar(base, ponto('p1', 1));
  let fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base });
  fila = pushEntry(fila, entryFromChange(base, um, 's1', 1, 'a'));

  assert.equal(
    detectQueueConflict({
      state: fila,
      live: { controlledByUserId: 'u1', controllerName: null, pointIds: ['p0', 'p1'] },
    }),
    null,
  );
  assert.deepEqual(
    detectQueueConflict({
      state: fila,
      live: { controlledByUserId: 'u2', controllerName: 'Bia', pointIds: ['p0', 'x1', 'x2', 'x3'] },
    }),
    { takenOverBy: 'Bia', foreignPoints: 3, myPoints: 1 },
  );
  assert.deepEqual(
    detectQueueConflict({
      state: fila,
      live: { controlledByUserId: 'u1', controllerName: null, pointIds: ['p0', 'x1'] },
    }),
    { takenOverBy: null, foreignPoints: 1, myPoints: 1 },
  );
});

test('textos da pergunta e da faixa', () => {
  assert.equal(
    conflictMessage({ takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4 }),
    'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
  );
  assert.equal(
    conflictMessage({ takenOverBy: null, foreignPoints: 1, myPoints: 1 }),
    'Enquanto você estava sem sinal, outra pessoa marcou 1 ponto. Você tem 1 ponto guardado.',
  );
  assert.equal(
    conflictMessage({ takenOverBy: 'Bia', foreignPoints: 0, myPoints: 2 }),
    'Enquanto você estava sem sinal, Bia assumiu o placar. Você tem 2 pontos guardados.',
  );
  assert.equal(pendingLabel(1), 'Sem sinal · 1 ponto guardado no aparelho');
  assert.equal(pendingLabel(4), 'Sem sinal · 4 pontos guardados no aparelho');
});
```

Nota sobre o texto sem troca de controle: com `takenOverBy === null` a frase é "outra pessoa
marcou N pontos" (sem "assumiu o placar"). A spec traz o caso com troca; esta é a variação.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/scoreQueue.test.ts`
Expected: FAIL — `Cannot find module './scoreQueue'`.

- [ ] **Step 3: Implementar**

```ts
import type { Game, GameReport, PointEvent, Session } from '@shared/types';
import type { SessionBundle } from './sessionDataQueries';
import { diffById } from './rowDiff';

export interface ScoreRows {
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
}

export interface ScoreQueueEntry {
  seq: number;
  at: string;
  sessionId: string;
  sessionBefore: Session;
  sessionAfter: Session | null;
  upserts: ScoreRows;
  removals: ScoreRows;
}

export interface ScoreQueueState {
  userId: string;
  sessionId: string;
  base: SessionBundle;
  knownPointIds: string[];
  entries: ScoreQueueEntry[];
}

export interface LiveScoreState {
  controlledByUserId: string | null;
  controllerName: string | null;
  pointIds: string[];
}

export interface ScoreQueueConflict {
  takenOverBy: string | null;
  foreignPoints: number;
  myPoints: number;
}

const SCORE_FIELDS = ['games', 'pointEvents', 'gameReports'] as const;
type ScoreField = (typeof SCORE_FIELDS)[number];

function emptyRows(): ScoreRows {
  return { games: [], pointEvents: [], gameReports: [] };
}

export function sliceForSession(bundle: SessionBundle, sessionId: string): SessionBundle {
  return {
    sessions: bundle.sessions.filter((row) => row.id === sessionId),
    teams: bundle.teams.filter((row) => row.sessionId === sessionId),
    games: bundle.games.filter((row) => row.sessionId === sessionId),
    pointEvents: bundle.pointEvents.filter((row) => row.sessionId === sessionId),
    gameReports: bundle.gameReports.filter((row) => row.sessionId === sessionId),
    sessionReports: [],
  };
}

function changed<T extends { id: string }>(prev: T[], next: T[]) {
  const { upserted, removed } = diffById(prev, next);
  return { upserted, removed, any: upserted.length > 0 || removed.length > 0 };
}

export function isScoringChange(
  prev: SessionBundle,
  next: SessionBundle,
  sessionId: string,
): boolean {
  const session = prev.sessions.find((row) => row.id === sessionId);
  if (!session) return false;
  if (changed(prev.teams, next.teams).any) return false;
  if (changed(prev.sessionReports, next.sessionReports).any) return false;
  const roots = changed(prev.sessions, next.sessions);
  if (roots.removed.length > 0) return false;
  if (roots.upserted.some((row) => row.id !== sessionId || row.status !== session.status)) {
    return false;
  }
  return SCORE_FIELDS.every((field) => {
    const diff = changed<{ id: string; sessionId: string }>(prev[field], next[field]);
    return [...diff.upserted, ...diff.removed].every((row) => row.sessionId === sessionId);
  });
}

export function entryFromChange(
  prev: SessionBundle,
  next: SessionBundle,
  sessionId: string,
  seq: number,
  at: string,
): ScoreQueueEntry {
  const sessionBefore = prev.sessions.find((row) => row.id === sessionId)!;
  const sessionNow = next.sessions.find((row) => row.id === sessionId) ?? sessionBefore;
  const upserts = emptyRows();
  const removals = emptyRows();
  for (const field of SCORE_FIELDS) {
    const before = prev[field].filter((row) => row.sessionId === sessionId);
    const after = next[field].filter((row) => row.sessionId === sessionId);
    const diff = diffById<{ id: string }>(before, after);
    (upserts[field] as { id: string }[]) = diff.upserted;
    (removals[field] as { id: string }[]) = diff.removed;
  }
  return {
    seq,
    at,
    sessionId,
    sessionBefore,
    sessionAfter: sessionNow === sessionBefore ? null : sessionNow,
    upserts,
    removals,
  };
}

export function bundlesForEntry(entry: ScoreQueueEntry): {
  prev: SessionBundle;
  next: SessionBundle;
} {
  const before = entry.sessionBefore;
  return {
    prev: {
      sessions: [before],
      teams: [],
      games: entry.removals.games,
      pointEvents: entry.removals.pointEvents,
      gameReports: entry.removals.gameReports,
      sessionReports: [],
    },
    next: {
      sessions: [entry.sessionAfter ?? before],
      teams: [],
      games: entry.upserts.games,
      pointEvents: entry.upserts.pointEvents,
      gameReports: entry.upserts.gameReports,
      sessionReports: [],
    },
  };
}

function overlay<T extends { id: string }>(rows: T[], upserts: T[], removals: T[]): T[] {
  if (upserts.length === 0 && removals.length === 0) return rows;
  const gone = new Set(removals.map((row) => row.id));
  const replaced = new Map(upserts.map((row) => [row.id, row]));
  const kept = rows
    .filter((row) => !gone.has(row.id))
    .map((row) => replaced.get(row.id) ?? row);
  const present = new Set(rows.map((row) => row.id));
  return [...kept, ...upserts.filter((row) => !present.has(row.id))];
}

export function applyQueue(bundle: SessionBundle, entries: ScoreQueueEntry[]): SessionBundle {
  return entries.reduce<SessionBundle>((acc, entry) => {
    const next = { ...acc };
    for (const field of SCORE_FIELDS) {
      (next[field] as { id: string }[]) = overlay<{ id: string }>(
        acc[field],
        entry.upserts[field],
        entry.removals[field],
      );
    }
    if (entry.sessionAfter) {
      next.sessions = overlay(acc.sessions, [entry.sessionAfter], []);
    }
    return next;
  }, bundle);
}

export function startScoreQueue(input: {
  userId: string;
  sessionId: string;
  base: SessionBundle;
}): ScoreQueueState {
  return {
    userId: input.userId,
    sessionId: input.sessionId,
    base: input.base,
    knownPointIds: input.base.pointEvents.map((row) => row.id),
    entries: [],
  };
}

export function pushEntry(state: ScoreQueueState, entry: ScoreQueueEntry): ScoreQueueState {
  return { ...state, entries: [...state.entries, entry] };
}

export function nextSeq(state: ScoreQueueState | null): number {
  if (!state || state.entries.length === 0) return 1;
  return state.entries[state.entries.length - 1].seq + 1;
}

function latestQueuedPoints(state: ScoreQueueState): Map<string, PointEvent> {
  const latest = new Map<string, PointEvent>();
  for (const entry of state.entries) {
    for (const point of entry.upserts.pointEvents) latest.set(point.id, point);
  }
  return latest;
}

export function queuedPointCount(state: ScoreQueueState | null): number {
  if (!state) return 0;
  let count = 0;
  for (const point of latestQueuedPoints(state).values()) {
    if (point.eventKind !== 'highlight' && !point.deletedAt) count += 1;
  }
  return count;
}

export function detectQueueConflict(input: {
  state: ScoreQueueState;
  live: LiveScoreState;
}): ScoreQueueConflict | null {
  const { state, live } = input;
  const mine = latestQueuedPoints(state);
  const known = new Set(state.knownPointIds);
  const foreignPoints = live.pointIds.filter((id) => !known.has(id) && !mine.has(id)).length;
  const tookOver = !!live.controlledByUserId && live.controlledByUserId !== state.userId;
  if (!tookOver && foreignPoints === 0) return null;
  return {
    takenOverBy: tookOver ? (live.controllerName ?? 'outra pessoa') : null,
    foreignPoints,
    myPoints: queuedPointCount(state),
  };
}

function pontos(n: number): string {
  return n === 1 ? '1 ponto' : `${n} pontos`;
}

function guardados(n: number): string {
  return n === 1 ? '1 ponto guardado' : `${n} pontos guardados`;
}

export function conflictMessage(conflict: ScoreQueueConflict): string {
  const quem = conflict.takenOverBy ?? 'outra pessoa';
  const feito = conflict.takenOverBy
    ? conflict.foreignPoints > 0
      ? `assumiu o placar e marcou ${pontos(conflict.foreignPoints)}`
      : 'assumiu o placar'
    : `marcou ${pontos(conflict.foreignPoints)}`;
  return `Enquanto você estava sem sinal, ${quem} ${feito}. Você tem ${guardados(conflict.myPoints)}.`;
}

export function pendingLabel(count: number): string {
  return `Sem sinal · ${guardados(count)} no aparelho`;
}
```

Se o `tsc` reclamar das atribuições com cast em `upserts[field]`, troque por um `switch` nos três
campos; o comportamento é o mesmo.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/application/scoreQueue.test.ts` → PASS (9 testes).
Run: `npm run lint` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/application/scoreQueue.ts src/application/scoreQueue.test.ts
git commit -m "feat: fila pura do placar sem sinal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guardar no aparelho e ler o estado ao vivo

**Files:**
- Create: `src/storage/scoreQueueStore.ts`, `src/storage/scoreQueueStore.spec.ts`
- Create: `src/infra/supabase/liveScoreCloudService.ts`,
  `src/infra/supabase/liveScoreCloudService.test.ts`

**Interfaces:**
- Consumes: `ScoreQueueState`, `LiveScoreState` (task 1); `fetchProfilesByUserIds` de
  `src/infra/supabase/membershipCloudService.ts`; `supabase` de `src/lib/supabaseClient`.
- Produces:
  ```ts
  export function loadScoreQueue(userId: string): ScoreQueueState | null
  export function saveScoreQueue(state: ScoreQueueState): void
  export function clearScoreQueue(userId: string): void
  export async function fetchLiveScoreState(sessionCloudId: string, client?: LiveScoreClient): Promise<LiveScoreState>
  ```

- [ ] **Step 1: Testes que falham**

`src/storage/scoreQueueStore.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySessionBundle } from '@app/sessionDataQueries';
import { startScoreQueue } from '@app/scoreQueue';
import { clearScoreQueue, loadScoreQueue, saveScoreQueue } from './scoreQueueStore';

describe('scoreQueueStore', () => {
  beforeEach(() => localStorage.clear());

  it('guarda por conta e devolve igual', () => {
    const fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() });
    saveScoreQueue(fila);
    expect(loadScoreQueue('u1')).toEqual(fila);
    expect(loadScoreQueue('u2')).toBeNull();
    expect(localStorage.getItem('volley.placar.u1')).not.toBeNull();
  });

  it('limpa e ignora conteudo estragado', () => {
    localStorage.setItem('volley.placar.u1', '{nao e json');
    expect(loadScoreQueue('u1')).toBeNull();
    saveScoreQueue(startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() }));
    clearScoreQueue('u1');
    expect(loadScoreQueue('u1')).toBeNull();
  });

  it('nao quebra quando o armazenamento recusa', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    expect(() =>
      saveScoreQueue(startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() })),
    ).not.toThrow();
    setItem.mockRestore();
  });
});
```

`src/infra/supabase/liveScoreCloudService.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveScoreState } from './liveScoreCloudService';

function cliente(respostas: { sessao: unknown; pontos: unknown[]; perfis?: unknown[] }) {
  const consultas: string[] = [];
  const builder = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    const fim = () => {
      if (tabela === 'sessions') return Promise.resolve({ data: respostas.sessao, error: null });
      if (tabela === 'point_events') return Promise.resolve({ data: respostas.pontos, error: null });
      return Promise.resolve({ data: respostas.perfis ?? [], error: null });
    };
    for (const nome of ['select', 'eq', 'in']) chain[nome] = () => chain;
    chain.is = () => fim();
    chain.maybeSingle = () => fim();
    chain.then = (ok: (v: unknown) => unknown) => fim().then(ok);
    consultas.push(tabela);
    return chain;
  };
  return { client: { from: builder, rpc: async () => ({ data: [], error: null }) }, consultas };
}

test('devolve quem controla, o nome e os ids locais dos pontos vivos', async () => {
  const { client } = cliente({
    sessao: { controlled_by_user_id: 'u2' },
    pontos: [{ id: 'c1', local_id: 'p1' }, { id: 'c2', local_id: null }],
    perfis: [{ id: 'u2', name: 'Bia', email: null }],
  });
  const estado = await fetchLiveScoreState('s1', client as never);
  assert.deepEqual(estado, { controlledByUserId: 'u2', controllerName: 'Bia', pointIds: ['p1', 'c2'] });
});

test('sem controle nao busca nome', async () => {
  const { client, consultas } = cliente({ sessao: { controlled_by_user_id: null }, pontos: [] });
  const estado = await fetchLiveScoreState('s1', client as never);
  assert.deepEqual(estado, { controlledByUserId: null, controllerName: null, pointIds: [] });
  assert.ok(!consultas.includes('profiles'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/storage/scoreQueueStore.spec.ts` → FAIL (módulo não existe).
Run: `node --import tsx --test src/infra/supabase/liveScoreCloudService.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/storage/scoreQueueStore.ts`:

```ts
import type { ScoreQueueState } from '@app/scoreQueue';

const PREFIX = 'volley.placar.';

export function loadScoreQueue(userId: string): ScoreQueueState | null {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoreQueueState;
    if (parsed?.userId !== userId || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveScoreQueue(state: ScoreQueueState): void {
  try {
    localStorage.setItem(PREFIX + state.userId, JSON.stringify(state));
  } catch {
    return;
  }
}

export function clearScoreQueue(userId: string): void {
  try {
    localStorage.removeItem(PREFIX + userId);
  } catch {
    return;
  }
}
```

`src/infra/supabase/liveScoreCloudService.ts`:

```ts
import { supabase } from '../../lib/supabaseClient';
import type { LiveScoreState } from '@app/scoreQueue';
import { fetchProfilesByUserIds } from './membershipCloudService';

export type LiveScoreClient = typeof supabase;

export async function fetchLiveScoreState(
  sessionCloudId: string,
  client: LiveScoreClient = supabase,
): Promise<LiveScoreState> {
  const [sessao, pontos] = await Promise.all([
    client
      .from('sessions')
      .select('controlled_by_user_id')
      .eq('id', sessionCloudId)
      .maybeSingle(),
    client
      .from('point_events')
      .select('id, local_id')
      .eq('session_id', sessionCloudId)
      .is('deleted_at', null),
  ]);
  if (sessao.error) throw sessao.error;
  if (pontos.error) throw pontos.error;
  const controlledByUserId =
    (sessao.data as { controlled_by_user_id: string | null } | null)?.controlled_by_user_id ??
    null;
  const perfis = controlledByUserId
    ? await fetchProfilesByUserIds([controlledByUserId], client)
    : new Map();
  return {
    controlledByUserId,
    controllerName: controlledByUserId ? (perfis.get(controlledByUserId)?.name ?? null) : null,
    pointIds: ((pontos.data ?? []) as { id: string; local_id: string | null }[]).map(
      (row) => row.local_id || row.id,
    ),
  };
}
```

Se o import de `../../lib/supabaseClient` não for o caminho usado pelos outros serviços de
`src/infra/supabase/`, use o mesmo que `sessionOwnershipCloudService.ts` usa. Se
`src/architecture/importAliases.test.ts` exigir aliases dentro de `src/infra`, siga o que o teste
pedir.

- [ ] **Step 4: Rodar e ver passar**

Run os dois comandos do Step 2 → PASS. `npm run test:unit` → sem regressão (inclui
`legacyExpansionGuard.test.ts`, que precisa continuar verde).

- [ ] **Step 5: Commit**

```bash
git add src/storage/scoreQueueStore.ts src/storage/scoreQueueStore.spec.ts src/infra/supabase/liveScoreCloudService.ts src/infra/supabase/liveScoreCloudService.test.ts
git commit -m "feat: fila do placar guardada no aparelho e leitura do placar no banco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Envio da fila (`drainScoreQueue`)

**Files:**
- Create: `src/application/scoreQueueDrain.ts`, `src/application/scoreQueueDrain.test.ts`

**Interfaces:**
- Consumes: `ScoreQueueState`, `ScoreQueueEntry`, `LiveScoreState`, `ScoreQueueConflict`,
  `detectQueueConflict` (task 1); `isNetworkError` de `src/application/onlineErrors.ts`.
- Produces:
  ```ts
  export type DrainResult =
    | { kind: 'done' }
    | { kind: 'conflict'; conflict: ScoreQueueConflict }
    | { kind: 'stopped'; network: boolean; error: unknown };
  export async function drainScoreQueue(input: {
    state: ScoreQueueState;
    force: boolean;
    sessionCloudId: string;
    fetchLive: (sessionCloudId: string) => Promise<LiveScoreState>;
    send: (entry: ScoreQueueEntry) => Promise<void>;
    onProgress: (state: ScoreQueueState | null) => void;
  }): Promise<DrainResult>
  ```

Regras: com `force: false`, busca o estado ao vivo antes; conflito para tudo e devolve a
pergunta. Envia as entradas em ordem; depois de cada envio chama `onProgress` com a fila sem
aquela entrada e com `knownPointIds` acrescido dos ids de `upserts.pointEvents` dela (ou `null`
quando zerou). Uma falha para o envio e devolve `stopped` com `network: isNetworkError(error)`.
Falha da conferência também devolve `stopped`.

- [ ] **Step 1: Testes que falham**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionBundle } from './sessionDataQueries';
import { makeSession } from '../test/fixtures';
import type { ScoreQueueEntry, ScoreQueueState } from './scoreQueue';
import { drainScoreQueue } from './scoreQueueDrain';

const pelada = makeSession('s1');

function entrada(seq: number, pontoId: string): ScoreQueueEntry {
  return {
    seq,
    at: 'x',
    sessionId: 's1',
    sessionBefore: pelada,
    sessionAfter: null,
    upserts: {
      games: [],
      pointEvents: [{ id: pontoId, sessionId: 's1', gameId: 'g1' } as never],
      gameReports: [],
    },
    removals: { games: [], pointEvents: [], gameReports: [] },
  };
}

function fila(...entries: ScoreQueueEntry[]): ScoreQueueState {
  return {
    userId: 'u1',
    sessionId: 's1',
    base: emptySessionBundle(),
    knownPointIds: [],
    entries,
  };
}

const semConflito = async () => ({ controlledByUserId: 'u1', controllerName: null, pointIds: [] });

test('envia em ordem e zera', async () => {
  const enviados: number[] = [];
  const progresso: (ScoreQueueState | null)[] = [];
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1'), entrada(2, 'p2')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async (e) => void enviados.push(e.seq),
    onProgress: (s) => progresso.push(s),
  });
  assert.deepEqual(r, { kind: 'done' });
  assert.deepEqual(enviados, [1, 2]);
  assert.deepEqual(progresso[0]?.knownPointIds, ['p1']);
  assert.equal(progresso[1], null);
});

test('conflito nao envia nada; com force envia sem conferir', async () => {
  let conferiu = false;
  const enviados: number[] = [];
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: async () => ({ controlledByUserId: 'u2', controllerName: 'Bia', pointIds: ['x'] }),
    send: async (e) => void enviados.push(e.seq),
    onProgress: () => {},
  });
  assert.equal(r.kind, 'conflict');
  assert.deepEqual(enviados, []);

  const forcado = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: true,
    sessionCloudId: 's1',
    fetchLive: async () => {
      conferiu = true;
      return semConflito();
    },
    send: async (e) => void enviados.push(e.seq),
    onProgress: () => {},
  });
  assert.deepEqual(forcado, { kind: 'done' });
  assert.equal(conferiu, false);
  assert.deepEqual(enviados, [1]);
});

test('falha de rede no meio para e guarda o resto', async () => {
  const progresso: (ScoreQueueState | null)[] = [];
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1'), entrada(2, 'p2')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async (e) => {
      if (e.seq === 2) throw new TypeError('Failed to fetch');
    },
    onProgress: (s) => progresso.push(s),
  });
  assert.equal(r.kind, 'stopped');
  assert.equal((r as { network: boolean }).network, true);
  assert.deepEqual(progresso.at(-1)?.entries.map((e) => e.seq), [2]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/scoreQueueDrain.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
import { detectQueueConflict } from './scoreQueue';
import type {
  LiveScoreState,
  ScoreQueueConflict,
  ScoreQueueEntry,
  ScoreQueueState,
} from './scoreQueue';
import { isNetworkError } from './onlineErrors';

export type DrainResult =
  | { kind: 'done' }
  | { kind: 'conflict'; conflict: ScoreQueueConflict }
  | { kind: 'stopped'; network: boolean; error: unknown };

export async function drainScoreQueue(input: {
  state: ScoreQueueState;
  force: boolean;
  sessionCloudId: string;
  fetchLive: (sessionCloudId: string) => Promise<LiveScoreState>;
  send: (entry: ScoreQueueEntry) => Promise<void>;
  onProgress: (state: ScoreQueueState | null) => void;
}): Promise<DrainResult> {
  let state = input.state;
  if (!input.force) {
    try {
      const live = await input.fetchLive(input.sessionCloudId);
      const conflict = detectQueueConflict({ state, live });
      if (conflict) return { kind: 'conflict', conflict };
    } catch (error) {
      return { kind: 'stopped', network: isNetworkError(error), error };
    }
  }
  while (state.entries.length > 0) {
    const [entry, ...rest] = state.entries;
    try {
      await input.send(entry);
    } catch (error) {
      return { kind: 'stopped', network: isNetworkError(error), error };
    }
    state = {
      ...state,
      knownPointIds: [...state.knownPointIds, ...entry.upserts.pointEvents.map((p) => p.id)],
      entries: rest,
    };
    input.onProgress(rest.length > 0 ? state : null);
  }
  return { kind: 'done' };
}
```

Antes de implementar, confira em `src/application/onlineErrors.ts` que `isNetworkError(new
TypeError('Failed to fetch'))` é `true`; se a assinatura de erro de rede usada lá for outra, use
no teste o erro que ela reconhece.

- [ ] **Step 4: Rodar e ver passar** → PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/application/scoreQueueDrain.ts src/application/scoreQueueDrain.test.ts
git commit -m "feat: envio da fila do placar confere conflito antes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useSessions` com a fila

**Files:**
- Modify: `src/hooks/useSessions.ts` (o `writeField` em ~153–184, o `queryFn` em ~104–118, o
  retorno em ~383–408)
- Test: `src/hooks/useSessions.spec.tsx`

**Interfaces:**
- Consumes: tasks 1–3; `useConnectivity` (`src/hooks/useConnectivity.ts`, campo `onlineAt`);
  `isNetworkError` (`src/application/onlineErrors.ts`).
- Produces (no retorno de `useSessions()`):
  ```ts
  scoreQueue: {
    pending: number;           // queuedPointCount
    queued: boolean;           // há entradas
    sending: boolean;
    conflict: ScoreQueueConflict | null;
    sendAnyway: () => void;
    discard: () => void;
  }
  ```

Comportamento:
1. `queueRef` (`useRef<ScoreQueueState | null>`) e `queue` (estado React) carregados de
   `loadScoreQueue(userId)` quando `userId` muda.
2. `liveSessionIdRef.current = online ? (onlineActive?.id ?? null) : null` a cada render (logo
   depois de `onlineActive` ser calculado).
3. `queryFn`: o resultado de `readAfterWrites(...)` passa por
   `queueRef.current ? applyQueue(resultado, queueRef.current.entries) : resultado`. Se a leitura
   lançar erro de rede e houver fila salva, devolve
   `applyQueue(fila.base, fila.entries)` (o placar reabre sem sinal); senão relança.
4. `writeField(field, value)`:
   - calcula `prev`, `nextField`, `next` como hoje;
   - `sessionId = liveSessionIdRef.current`; `scoring = !!sessionId &&
     (!queueRef.current || queueRef.current.sessionId === sessionId) &&
     isScoringChange(prev, next, sessionId)`;
   - sem sinal e não é placar: recusa como hoje (`report(offlineError(...))` e `return`);
   - aplica no cache (`writeVersion += 1`, `cancelQueries`, `setQueryData`);
   - encadeia no `writeChain`: se `scoring && (queueRef.current || navigator.onLine === false)`,
     `enqueue(prev, next, sessionId)`; senão grava como hoje. No `catch`, se `scoring &&
     isNetworkError(error)`, `enqueue(prev, next, sessionId)` em vez de reportar e invalidar.
5. `enqueue`: cria a fila com `startScoreQueue({ userId, sessionId, base: sliceForSession(prev,
   sessionId) })` se não houver, `pushEntry` com `entryFromChange(prev, next, sessionId,
   nextSeq(fila), new Date().toISOString())`, atualiza ref, `saveScoreQueue`, `setQueue`.
6. Envio: `useEffect` com dependências `[onlineAt, queue?.entries.length, online, conflict]` —
   se `online`, `navigator.onLine !== false`, há fila, sem conflito e sem envio em andamento,
   chama `drain(false)`.
7. `drain(force)`: `sending = true`; dentro do `writeChain`, roda `drainScoreQueue` com
   `sessionCloudId` = `cloudId ?? id` da sessão em `queue.base.sessions[0]`,
   `fetchLive: fetchLiveScoreState`, `send: (entry) => { const { prev, next } =
   bundlesForEntry(entry); return persistSessionBundleChanges(prev, next, { userId,
   communityCloudId }, defaultSessionWriteGateway); }`, `onProgress` que salva/limpa a fila
   (ref + store + estado). Resultado: `done` → `clearScoreQueue`, ref `null`, `invalidateQueries`;
   `conflict` → `setConflict`; `stopped` com `network: false` → `report(toOnlineError(error))`.
   Sempre `sending = false` no fim.
8. `sendAnyway` → `setConflict(null)` e `drain(true)`. `discard` → limpa fila (ref, store,
   estado), `setConflict(null)`, `invalidateQueries({ queryKey: key })`.

- [ ] **Step 1: Testes que falham** — acrescentar ao `describe('useSessions com conta')` de
  `src/hooks/useSessions.spec.tsx`. O mock de `../application/sessionWrites` continua; acrescente
  o mock do serviço ao vivo:

```ts
vi.mock('../infra/supabase/liveScoreCloudService', () => ({
  fetchLiveScoreState: vi.fn(async () => ({
    controlledByUserId: 'u1',
    controllerName: null,
    pointIds: [],
  })),
}));
```

(importe `fetchLiveScoreState` de `'../infra/supabase/liveScoreCloudService'` no topo do spec.)

```ts
  describe('sem sinal', () => {
    const ponto = (id: string) => ({ id, sessionId: 's1', gameId: 'g1' }) as PointEvent;
    let semRede: { mockRestore(): void };

    beforeEach(() => {
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    });
    afterEach(() => semRede.mockRestore());

    function cairSinal() {
      semRede.mockRestore();
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    }
    function voltarSinal() {
      semRede.mockRestore();
      semRede = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    }

    it('o ponto entra na fila, aparece na tela e fica guardado no aparelho', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1']));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      expect(localStorage.getItem('volley.placar.u1')).toContain('p1');
    });

    it('ao voltar o sinal envia em ordem, zera e rele', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p2')]));
      await waitFor(() => expect(result.current.scoreQueue.pending).toBe(2));
      vi.mocked(fetchMySessions).mockResolvedValue({
        ...emptySessionBundle(),
        sessions: [emAndamento],
        pointEvents: [ponto('p1'), ponto('p2')],
      });
      act(() => voltarSinal());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      const enviados = vi
        .mocked(persistSessionBundleChanges)
        .mock.calls.map(([, depois]) => depois.pointEvents.map((p) => p.id));
      expect(enviados).toEqual([['p1'], ['p2']]);
      expect(localStorage.getItem('volley.placar.u1')).toBeNull();
      expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('releitura com fila pendente nao volta o placar', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.pointEvents.map((p) => p.id)).toEqual(['p1']);
    });

    it('conflito pergunta; descartar limpa a fila e rele', async () => {
      vi.mocked(fetchLiveScoreState).mockResolvedValueOnce({
        controlledByUserId: 'u2',
        controllerName: 'Bia',
        pointIds: ['x1'],
      });
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      act(() => voltarSinal());
      await waitFor(() =>
        expect(result.current.scoreQueue.conflict).toEqual({
          takenOverBy: 'Bia',
          foreignPoints: 1,
          myPoints: 1,
        }),
      );
      expect(persistSessionBundleChanges).not.toHaveBeenCalled();
      act(() => result.current.scoreQueue.discard());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      await waitFor(() => expect(result.current.pointEvents).toEqual([]));
    });

    it('conflito; enviar mesmo assim grava os meus', async () => {
      vi.mocked(fetchLiveScoreState).mockResolvedValueOnce({
        controlledByUserId: 'u2',
        controllerName: 'Bia',
        pointIds: [],
      });
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(true));
      act(() => voltarSinal());
      await waitFor(() => expect(result.current.scoreQueue.conflict).not.toBeNull());
      act(() => result.current.scoreQueue.sendAnyway());
      await waitFor(() => expect(result.current.scoreQueue.queued).toBe(false));
      expect(persistSessionBundleChanges).toHaveBeenCalledTimes(1);
    });

    it('com fila guardada, recarregar sem sinal reabre o placar', async () => {
      const { result, unmount } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setPointEvents((prev) => [...prev, ponto('p1')]));
      await waitFor(() => expect(localStorage.getItem('volley.placar.u1')).toContain('p1'));
      unmount();
      vi.mocked(fetchMySessions).mockRejectedValue(new TypeError('Failed to fetch'));
      const outra = render();
      await waitFor(() => expect(outra.result.current.activeSession?.id).toBe('s1'));
      expect(outra.result.current.pointEvents.map((p) => p.id)).toEqual(['p1']);
    });

    it('sem sinal, mudanca que nao e do placar continua recusada', async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.activeSession?.id).toBe('s1'));
      cairSinal();
      act(() => result.current.setSessions((prev) => prev.map((s) => ({ ...s, name: 'x' }))));
      await waitFor(() => expect(result.current.status.offline).toBe(true));
      expect(result.current.scoreQueue.queued).toBe(false);
    });
  });
```

Ajustes que o executor deve fazer se preciso: importar `afterEach`; se o teste "ao voltar o sinal"
receber chamadas extras de `persistSessionBundleChanges` vindas de outra coisa, filtre as chamadas
pelas que têm `pointEvents` não vazio.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/hooks/useSessions.spec.tsx` → os 7 novos falham (`scoreQueue`
indefinido).

- [ ] **Step 3: Implementar** em `src/hooks/useSessions.ts`

Imports novos:

```ts
import {
  applyQueue,
  entryFromChange,
  isScoringChange,
  nextSeq,
  pushEntry,
  queuedPointCount,
  sliceForSession,
  startScoreQueue,
  type ScoreQueueConflict,
  type ScoreQueueState,
} from '../application/scoreQueue';
import { drainScoreQueue } from '../application/scoreQueueDrain';
import { bundlesForEntry } from '../application/scoreQueue';
import { isNetworkError } from '../application/onlineErrors';
import { clearScoreQueue, loadScoreQueue, saveScoreQueue } from '../storage/scoreQueueStore';
import { fetchLiveScoreState } from '../infra/supabase/liveScoreCloudService';
import { useConnectivity } from './useConnectivity';
```

(junte os dois imports de `scoreQueue` num só; `isNetworkError` vem do mesmo módulo de
`toOnlineError` — junte também.)

Estado e refs (logo depois de `writeVersion`):

```ts
  const queueRef = useRef<ScoreQueueState | null>(null);
  const [queue, setQueue] = useState<ScoreQueueState | null>(null);
  const [conflict, setConflict] = useState<ScoreQueueConflict | null>(null);
  const [sending, setSending] = useState(false);
  const liveSessionIdRef = useRef<string | null>(null);
  const { onlineAt } = useConnectivity();

  useEffect(() => {
    const saved = userId ? loadScoreQueue(userId) : null;
    queueRef.current = saved;
    setQueue(saved);
  }, [userId]);

  const keepQueue = useCallback((state: ScoreQueueState | null) => {
    queueRef.current = state;
    if (state) saveScoreQueue(state);
    else if (userId) clearScoreQueue(userId);
    setQueue(state);
  }, [userId]);
```

O `useEffect` de carga roda depois do primeiro render; para o caso "recarregar sem sinal", a
`queryFn` lê o armazenamento diretamente (abaixo), então não depende desse efeito.

`queryFn`:

```ts
    queryFn: async () => {
      try {
        const communities = await queryClient.ensureQueryData<Community[]>({
          queryKey: queryKeys.comunidades(userId ?? ''),
          queryFn: fetchMyCommunities,
        });
        const bundle = await readAfterWrites({
          fetch: () => fetchMySessions(communities),
          settled: () => writeChain.current,
          version: () => writeVersion.current,
        });
        const pending = queueRef.current ?? (userId ? loadScoreQueue(userId) : null);
        return pending ? applyQueue(bundle, pending.entries) : bundle;
      } catch (error) {
        const saved = userId ? loadScoreQueue(userId) : null;
        if (saved && isNetworkError(error)) return applyQueue(saved.base, saved.entries);
        throw error;
      }
    },
```

Se `ensureQueryData` das comunidades falhar sem sinal, o `catch` cobre: a foto já traz a sessão.

`enqueue` (antes do `writeField`):

```ts
  const enqueue = useCallback(
    (prev: SessionBundle, next: SessionBundle, sessionId: string) => {
      if (!userId) return;
      const current =
        queueRef.current ??
        startScoreQueue({ userId, sessionId, base: sliceForSession(prev, sessionId) });
      keepQueue(
        pushEntry(
          current,
          entryFromChange(prev, next, sessionId, nextSeq(current), new Date().toISOString()),
        ),
      );
    },
    [keepQueue, userId],
  );
```

`writeField` (substitui o corpo atual):

```ts
  const writeField = useCallback(
    <K extends BundleField>(field: K, value: SetStateAction<SessionBundle[K]>) => {
      const semSinal = typeof navigator !== 'undefined' && navigator.onLine === false;
      const prev = queryClient.getQueryData<SessionBundle>(key) ?? emptySessionBundle();
      const nextField = resolve(value, prev[field]);
      if (nextField === prev[field]) return;
      const next = { ...prev, [field]: nextField } as SessionBundle;
      const sessionId = liveSessionIdRef.current;
      const scoring =
        !!sessionId &&
        (!queueRef.current || queueRef.current.sessionId === sessionId) &&
        isScoringChange(prev, next, sessionId);
      if (semSinal && !scoring) {
        report(offlineError(OFFLINE_MESSAGE).error);
        return;
      }
      writeVersion.current += 1;
      void queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, next);
      writeChain.current = writeChain.current
        .then(async () => {
          const offlineAgora = typeof navigator !== 'undefined' && navigator.onLine === false;
          if (scoring && sessionId && (queueRef.current || offlineAgora)) {
            enqueue(prev, next, sessionId);
            return;
          }
          await persistSessionBundleChanges(
            prev,
            next,
            { userId: userId ?? '', communityCloudId },
            defaultSessionWriteGateway,
          );
          setWriteError(null);
          conferir.current.add([key]);
        })
        .catch((error) => {
          if (scoring && sessionId && isNetworkError(error)) {
            enqueue(prev, next, sessionId);
            return;
          }
          report(toOnlineError(error));
          void queryClient.invalidateQueries({ queryKey: key });
        });
    },
    [communityCloudId, enqueue, key, queryClient, report, userId],
  );
```

Logo depois do cálculo de `onlineActive` (perto da linha 233):

```ts
  liveSessionIdRef.current = online ? (onlineActive?.id ?? null) : null;
```

Envio (depois de `setActiveSession`):

```ts
  const drain = useCallback(
    (force: boolean) => {
      const state = queueRef.current;
      if (!state || !userId) return;
      const root = state.base.sessions[0];
      if (!root) return;
      setSending(true);
      writeChain.current = writeChain.current
        .then(async () => {
          const result = await drainScoreQueue({
            state: queueRef.current ?? state,
            force,
            sessionCloudId: root.cloudId ?? root.id,
            fetchLive: (id) => fetchLiveScoreState(id),
            send: (entry) => {
              const { prev, next } = bundlesForEntry(entry);
              return persistSessionBundleChanges(
                prev,
                next,
                { userId, communityCloudId },
                defaultSessionWriteGateway,
              );
            },
            onProgress: keepQueue,
          });
          if (result.kind === 'done') {
            keepQueue(null);
            void queryClient.invalidateQueries({ queryKey: key });
          } else if (result.kind === 'conflict') {
            setConflict(result.conflict);
          } else if (!result.network) {
            report(toOnlineError(result.error));
          }
        })
        .finally(() => setSending(false));
    },
    [communityCloudId, keepQueue, key, queryClient, report, userId],
  );

  const queued = (queue?.entries.length ?? 0) > 0;
  const lastAttempt = useRef<string | null>(null);
  useEffect(() => {
    if (!online || !queued || conflict || sending) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const attempt = `${onlineAt}:${queue?.entries.length ?? 0}`;
    if (lastAttempt.current === attempt) return;
    lastAttempt.current = attempt;
    drain(false);
  }, [online, queued, conflict, onlineAt, drain, sending, queue?.entries.length]);
```

A chave `onlineAt:tamanho` evita o laço: se o envio parar por rede, só tenta de novo quando a
rede voltar outra vez (`onlineAt` muda) ou quando a fila crescer.

Retorno de `useSessions` (acrescentar):

```ts
    scoreQueue: {
      pending: queuedPointCount(queue),
      queued,
      sending,
      conflict,
      sendAnyway: () => {
        setConflict(null);
        drain(true);
      },
      discard: () => {
        setConflict(null);
        keepQueue(null);
        void queryClient.invalidateQueries({ queryKey: key });
      },
    },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/hooks/useSessions.spec.tsx` → todos passam (antigos e novos).
Run: `npx vitest run src/app/AppShell.spec.tsx src/app/AppRouter.spec.tsx` — se o mock de
`useSessions` nesses specs não tiver `scoreQueue`, não quebra nada nesta task (o campo só é lido
na task 5).
Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSessions.ts src/hooks/useSessions.spec.tsx
git commit -m "feat: placar guarda pontos sem sinal e envia quando o sinal volta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tela de quem marca

**Files:**
- Modify: `src/application/scoringLock.ts`
- Modify: `src/application/screens/sessionActiveView/sessionActiveViewContract.ts`
- Modify: `src/components/live/SessionActiveView.tsx` (~246–262 faixa e travas; botões
  "Encerrar pelada" ~377 e ~502; `onFinishSession` ~291; modal no fim do componente)
- Modify: `src/app/routes/sessionRoutes.tsx` (~606–620), `src/app/routes/globalRoutes.tsx`
  (~398–410)
- Test: `src/components/live/SessionActiveView.spec.tsx`

**Interfaces:**
- Consumes: `useSessions().scoreQueue` (task 4); `conflictMessage`, `pendingLabel` (task 1).
- Produces: no contrato, campo opcional
  ```ts
  scoreQueue?: {
    pending: number;
    queued: boolean;
    sending: boolean;
    conflict: ScoreQueueConflict | null;
    sendAnyway: () => void;
    discard: () => void;
  };
  ```
  e em `scoringLock.ts`:
  ```ts
  export const SCORING_SENDING_MESSAGE = 'Enviando…';
  export const FINISH_NEEDS_SIGNAL_MESSAGE =
    'Encerre quando o sinal voltar e os pontos forem enviados.';
  ```

Regras na tela (só quando `readOnly` é falso):
- `locked = readOnly` (sem sinal não trava mais ponto, desfazer, próximo jogo, W.O., pausar,
  reabrir, cancelar ou corrigir placar).
- `finishLocked = readOnly || offline || !!scoreQueue?.queued`. Os dois botões "Encerrar pelada"
  usam `disabled={finishLocked}`. O `onFinishSession` passado ao `TournamentActiveView` vira
  `() => { if (!finishLocked) dispatch({ kind: 'finishSession' }); }`.
- Faixa (`role="status"`, classe `alert alert-warning alert-soft text-sm font-bold`):
  - `offline` → `pendingLabel(scoreQueue?.pending ?? 0)`;
  - com sinal, `scoreQueue?.queued` → `SCORING_SENDING_MESSAGE`;
  - e, se `finishLocked` por fila ou sinal, uma segunda linha `FINISH_NEEDS_SIGNAL_MESSAGE`.
  - `readOnly` continua com a faixa de leitura atual.
- `blockedReason` passado aos placares: `readOnly ? SCORING_READ_ONLY_MESSAGE :
  control.message` (sem o caso offline).
- Pergunta de conflito: com `scoreQueue?.conflict`, um modal (`div.modal.modal-open`,
  `role="dialog"`, `aria-labelledby="fila-conflito-titulo"`) com título "Pontos guardados no
  aparelho", o texto `conflictMessage(conflict)` e dois botões: "Enviar os meus mesmo assim"
  (`btn btn-primary`, chama `sendAnyway`) e "Descartar os meus" (`btn btn-ghost text-error`,
  chama `discard`).
- `SCORING_OFFLINE_MESSAGE` deixa de ser usado no placar com conta; mantenha a constante se outro
  arquivo a importar (confira com `grep -rn SCORING_OFFLINE_MESSAGE src`) e remova-a se ficar sem
  uso.

- [ ] **Step 1: Testes que falham** — em `src/components/live/SessionActiveView.spec.tsx`, troque
  `renderPlacar` para aceitar um objeto de opções e reescreva o `describe('SessionActiveView sem
  sinal')`:

```tsx
function renderPlacar(
  offline: boolean,
  readOnly = false,
  pointEvents: PointEvent[] = [],
  scoreQueue?: Parameters<typeof buildSessionActiveViewContract>[0]['scoreQueue'],
) {
  const noop = () => {};
  return render(
    <MemoryRouter>
      <SessionActiveView
        contract={buildSessionActiveViewContract({
          activeSession: pelada,
          games: [jogo],
          pointEvents,
          players: [],
          sessionTeams: [teamA, teamB],
          gameReports: [],
          currentDeviceId: 'aparelho',
          offline,
          readOnly,
          scoreQueue,
          setGames: noop,
          setPointEvents: noop,
          setGameReports: noop,
          setActiveSession: noop,
          onExit: noop,
          onFinishSession: noop,
        })}
      />
    </MemoryRouter>,
  );
}

const fila = (over: Partial<NonNullable<Parameters<typeof renderPlacar>[3]>> = {}) => ({
  pending: 0,
  queued: false,
  sending: false,
  conflict: null,
  sendAnyway: vi.fn(),
  discard: vi.fn(),
  ...over,
});

describe('SessionActiveView sem sinal', () => {
  it('marca e desfaz sem sinal, mostra quantos pontos estao guardados e trava so o encerrar', () => {
    renderPlacar(true, false, [], fila({ pending: 4, queued: true }));
    expect(screen.getByText('Sem sinal · 4 pontos guardados no aparelho')).toBeTruthy();
    expect(
      screen.getByText('Encerre quando o sinal voltar e os pontos forem enviados.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /desfazer ponto/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('com sinal e fila, mostra Enviando e ainda trava o encerrar', () => {
    renderPlacar(false, false, [], fila({ pending: 2, queued: true, sending: true }));
    expect(screen.getByText('Enviando…')).toBeTruthy();
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('com sinal e sem fila, nada trava', () => {
    renderPlacar(false, false, [], fila());
    expect(screen.queryByText(/sem sinal/i)).toBeNull();
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('conflito pergunta e cada botao faz o que diz', () => {
    const q = fila({
      pending: 4,
      queued: true,
      conflict: { takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4 },
    });
    renderPlacar(false, false, [], q);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).toContain(
      'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar os meus mesmo assim' }));
    expect(q.sendAnyway).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar os meus' }));
    expect(q.discard).toHaveBeenCalledTimes(1);
  });
});
```

O teste existente "membro ve o placar sem os botoes de marcar, e sabe por que" continua como
está. Os testes antigos de `describe('SessionActiveView sem sinal')` ("trava desfazer e encerrar
e diz por que", "com sinal, nada trava por conexao") são substituídos pelos acima. Importe
`fireEvent` de `@testing-library/react`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/live/SessionActiveView.spec.tsx` → falham (texto não existe,
desfazer travado).

- [ ] **Step 3: Implementar**

`scoringLock.ts`: acrescente as duas constantes da seção Interfaces.

Contrato (`sessionActiveViewContract.ts`): acrescente `scoreQueue?:` (tipo da seção Interfaces,
importando `ScoreQueueConflict` de `@app/scoreQueue`) ao tipo de entrada e ao `model`
(`scoreQueue: input.scoreQueue`).

Rotas: em `sessionRoutes.tsx` e `globalRoutes.tsx`, no `buildSessionActiveViewContract({...})`,
acrescente `scoreQueue: sess.scoreQueue,`. Se `AppShell.spec.tsx` ou `AppRouter.spec.tsx`
montarem um `sess` falso que passa por essas rotas, acrescente `scoreQueue: undefined` (ou um
objeto `fila()`) onde o tipo exigir.

`SessionActiveView.tsx`, no lugar do bloco de ~246–262:

```tsx
  const fila = model.scoreQueue;
  const locked = readOnly;
  const finishLocked = readOnly || offline || !!fila?.queued;
  const offlineNotice = readOnly ? (
    <div role="status" className="alert alert-info alert-soft text-sm font-bold">
      {SCORING_READ_ONLY_MESSAGE}
    </div>
  ) : offline || fila?.queued ? (
    <div role="status" className="alert alert-warning alert-soft text-sm font-bold flex-col items-start gap-1">
      <span>{offline ? pendingLabel(fila?.pending ?? 0) : SCORING_SENDING_MESSAGE}</span>
      <span className="font-medium">{FINISH_NEEDS_SIGNAL_MESSAGE}</span>
    </div>
  ) : null;
  const canScore = control.canScore && !locked;
  const blockedReason = readOnly ? SCORING_READ_ONLY_MESSAGE : control.message;
```

(`model` é o nome do objeto desestruturado do contrato no topo do componente; se o nome for
outro, use o mesmo.) Troque `disabled={locked}` por `disabled={finishLocked}` nos dois botões
"Encerrar pelada"; troque `onFinishSession={() => dispatch({ kind: 'finishSession' })}` por
`onFinishSession={() => { if (!finishLocked) dispatch({ kind: 'finishSession' }); }}`. Antes do
fechamento do JSX principal (junto dos outros modais), acrescente:

```tsx
      {fila?.conflict && (
        <div className="modal modal-open" role="dialog" aria-labelledby="fila-conflito-titulo">
          <div className="modal-box max-w-md space-y-5">
            <h3 id="fila-conflito-titulo" className="text-lg font-black text-base-content">
              Pontos guardados no aparelho
            </h3>
            <p className="text-sm leading-relaxed text-base-content/70">
              {conflictMessage(fila.conflict)}
            </p>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost text-error" onClick={fila.discard}>
                Descartar os meus
              </button>
              <button type="button" className="btn btn-primary" onClick={fila.sendAnyway}>
                Enviar os meus mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
```

O modal precisa aparecer nos dois ramos (torneio e free_play): coloque-o num `const
conflictDialog = (...)` e renderize `{conflictDialog}` dentro dos dois `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/live src/app` → passam.
Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/application/scoringLock.ts src/application/screens/sessionActiveView/sessionActiveViewContract.ts src/components/live/SessionActiveView.tsx src/components/live/SessionActiveView.spec.tsx src/app/routes/sessionRoutes.tsx src/app/routes/globalRoutes.tsx
git commit -m "feat: placar marca sem sinal, mostra a fila e pergunta no conflito

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Acrescente ao `git add` os specs de `src/app` que precisaram de `scoreQueue`.)

---

### Task 6: Aviso de placar parado para quem acompanha

**Files:**
- Modify: `src/application/scoringLock.ts`
- Test: `src/application/scoringLock.test.ts` (já existe: acrescentar os testes, sem repetir os imports)
- Modify: `src/components/live/SessionActiveView.tsx`, `src/components/live/SessionActiveView.spec.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function staleScoreNotice(input: {
    readOnly: boolean;
    gameActive: boolean;
    lastPointAt: string | null;
    now: number;
  }): string | null
  ```
  Devolve `Último ponto há N min — quem marca pode estar sem sinal` quando `readOnly`,
  `gameActive`, `lastPointAt` existe e `now - lastPointAt >= 3 min`; N = minutos inteiros
  (`Math.floor`). Senão `null`.

- [ ] **Step 1: Testes que falham**

`src/application/scoringLock.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { staleScoreNotice } from './scoringLock';

const base = Date.UTC(2026, 9, 5, 20, 0, 0);
const ultimo = new Date(base).toISOString();

test('quem acompanha ve o aviso a partir de 3 min sem ponto', () => {
  assert.equal(
    staleScoreNotice({ readOnly: true, gameActive: true, lastPointAt: ultimo, now: base + 179_000 }),
    null,
  );
  assert.equal(
    staleScoreNotice({ readOnly: true, gameActive: true, lastPointAt: ultimo, now: base + 245_000 }),
    'Último ponto há 4 min — quem marca pode estar sem sinal',
  );
});

test('quem marca, jogo parado ou jogo sem ponto nao mostram aviso', () => {
  const tarde = base + 600_000;
  assert.equal(staleScoreNotice({ readOnly: false, gameActive: true, lastPointAt: ultimo, now: tarde }), null);
  assert.equal(staleScoreNotice({ readOnly: true, gameActive: false, lastPointAt: ultimo, now: tarde }), null);
  assert.equal(staleScoreNotice({ readOnly: true, gameActive: true, lastPointAt: null, now: tarde }), null);
});
```

Em `SessionActiveView.spec.tsx`:

```tsx
describe('SessionActiveView quem acompanha', () => {
  it('avisa quando o placar para por mais de 3 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T20:05:00.000Z'));
    const ultimo: PointEvent = {
      id: 'p1',
      sessionId: 's1',
      gameId: 'g1',
      sequenceNumber: 1,
      scoringTeamId: 'ta',
      concedingTeamId: 'tb',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 1, teamB: 0 },
      timestamp: '2026-10-05T20:00:00.000Z',
    };
    renderPlacar(false, true, [ultimo]);
    expect(
      screen.getByText('Último ponto há 5 min — quem marca pode estar sem sinal'),
    ).toBeTruthy();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/scoringLock.test.ts` → FAIL.
Run: `npx vitest run src/components/live/SessionActiveView.spec.tsx` → o novo falha.

- [ ] **Step 3: Implementar**

`scoringLock.ts`:

```ts
const STALE_AFTER_MS = 3 * 60_000;

export function staleScoreNotice(input: {
  readOnly: boolean;
  gameActive: boolean;
  lastPointAt: string | null;
  now: number;
}): string | null {
  if (!input.readOnly || !input.gameActive || !input.lastPointAt) return null;
  const decorrido = input.now - new Date(input.lastPointAt).getTime();
  if (decorrido < STALE_AFTER_MS) return null;
  return `Último ponto há ${Math.floor(decorrido / 60_000)} min — quem marca pode estar sem sinal`;
}
```

`SessionActiveView.tsx`: um relógio de 30 s e o aviso, logo depois de `offlineNotice`:

```tsx
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!readOnly) return;
    const id = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [readOnly]);
  const ultimoPonto = currentGame
    ? sessionPoints
        .filter((p) => p.gameId === currentGame.id)
        .reduce<string | null>((max, p) => (!max || p.timestamp > max ? p.timestamp : max), null)
    : null;
  const parado = staleScoreNotice({
    readOnly,
    gameActive: currentGame?.status === 'active',
    lastPointAt: ultimoPonto,
    now: agora,
  });
  const staleNotice = parado ? (
    <p role="status" className="text-xs font-bold text-warning">
      {parado}
    </p>
  ) : null;
```

Renderize `{staleNotice}` logo abaixo de `{offlineNotice}` nos dois `return`. Os hooks precisam
ficar antes de qualquer `return` antecipado do componente; se houver `return` antes da linha 246,
mova o bloco para antes dele.

- [ ] **Step 4: Rodar e ver passar** — os dois comandos do Step 2 → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/scoringLock.ts src/application/scoringLock.test.ts src/components/live/SessionActiveView.tsx src/components/live/SessionActiveView.spec.tsx
git commit -m "feat: quem acompanha sabe quando o placar parou

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pilha local, PRODUCT.md e verificação final

**Files:**
- Create: `e2e/local-stack/sem-sinal.spec.ts`
- Modify: `PRODUCT.md` (princípio 2, linha ~61, e a frase da linha ~24 "a operação em quadra
  continua funcionando sem sinal" — manter, ela continua verdadeira)
- Modify: `e2e/local-stack/README.md` (listar o cenário novo)

**Interfaces:**
- Consumes: `e2e/local-stack/pelada.ts` (`peladaComecada(browser, { jogam, times, rotacao })`
  devolve `{ ctx, page, sessionId, comunidadeId }`; `elencoDaComunidade()`; `encerrarPelaApi`;
  `ORGANIZA`, `MEMBRO`); `e2e/local-stack/atores.ts` (`entrarPelaTela`, `api`, `rpc`).

- [ ] **Step 1: Escrever o cenário**

```ts
import { expect, test } from '@playwright/test';
import { entrarPelaTela, api } from './atores';
import { MEMBRO, ORGANIZA, elencoDaComunidade, encerrarPelaApi, peladaComecada } from './pelada';

function placar(a: number, b: number) {
  return new RegExp(`Time \\d+ ${a}, Time \\d+ ${b}`);
}

test('sem sinal o placar segue, guarda os pontos e envia quando volta', async ({ browser }) => {
  const { atletas } = await elencoDaComunidade();
  const jogam = atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 9);
  const { ctx, page: marca, sessionId, comunidadeId } = await peladaComecada(browser, {
    jogam,
    times: 3,
    rotacao: '6x0',
  });
  const urlPelada = `/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`;
  const ctxAna = await browser.newContext({ baseURL: MEMBRO });
  const ana = await ctxAna.newPage();

  await test.step('abre o placar e a membro acompanha', async () => {
    await marca.getByRole('button', { name: /começar primeira partida/i }).click();
    await entrarPelaTela(ana, 'Ana');
    await ana.goto(urlPelada);
    await ana.getByRole('button', { name: /acompanhar o placar/i }).click();
    await expect(ana.getByText(/jogo 1 — em andamento/i)).toBeVisible();
  });

  await test.step('sem sinal, marca tres pontos e desfaz um', async () => {
    await ctx.setOffline(true);
    for (let i = 0; i < 3; i += 1) {
      await marca.getByRole('button', { name: /\+1/ }).first().click();
      await marca.waitForTimeout(300);
    }
    await marca.getByRole('button', { name: /desfazer ponto/i }).click();
    await expect(marca.getByText(placar(2, 0)).first()).toBeVisible();
    await expect(marca.getByText('Sem sinal · 2 pontos guardados no aparelho')).toBeVisible();
    await expect(
      marca.getByRole('button', { name: /encerrar pelada/i }).first(),
    ).toBeDisabled();
    await expect(ana.getByText(placar(0, 0)).first()).toBeVisible();
  });

  await test.step('recarrega sem sinal e o placar volta do aparelho', async () => {
    await marca.reload();
    await expect(marca.getByText(placar(2, 0)).first()).toBeVisible({ timeout: 15_000 });
  });

  await test.step('o sinal volta, a fila vai e a membro ve', async () => {
    await ctx.setOffline(false);
    await expect(marca.getByText(/sem sinal|enviando/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(ana.getByText(placar(2, 0)).first()).toBeVisible({ timeout: 20_000 });
    const org = await api('Organizador');
    const { data: pontos } = await org
      .from('point_events')
      .select('id, deleted_at')
      .eq('session_id', sessionId);
    expect((pontos ?? []).filter((p) => !p.deleted_at)).toHaveLength(2);
    expect((pontos ?? []).filter((p) => p.deleted_at)).toHaveLength(1);
    await expect(
      marca.getByRole('button', { name: /encerrar pelada/i }).first(),
    ).toBeEnabled();
  });

  await encerrarPelaApi(sessionId);
  await ctx.close();
  await ctxAna.close();
});

test('conflito: outra tela de quem organiza marca enquanto este aparelho esta sem sinal', async ({
  browser,
}) => {
  const { atletas } = await elencoDaComunidade();
  const jogam = atletas.filter((a) => a.nome.startsWith('Atleta ')).slice(0, 9);
  const { ctx, page: marca, sessionId, comunidadeId } = await peladaComecada(browser, {
    jogam,
    times: 3,
    rotacao: '6x0',
  });
  await marca.getByRole('button', { name: /começar primeira partida/i }).click();

  await ctx.setOffline(true);
  await marca.getByRole('button', { name: /\+1/ }).first().click();
  await expect(marca.getByText('Sem sinal · 1 ponto guardado no aparelho')).toBeVisible();

  const ctxOutra = await browser.newContext({ baseURL: ORGANIZA });
  const outra = await ctxOutra.newPage();
  await entrarPelaTela(outra, 'Organizador').catch(async () => {
    await outra.waitForTimeout(31_000);
    await entrarPelaTela(outra, 'Organizador');
  });
  await outra.goto(`/comunidades/${comunidadeId}/sessoes/${sessionId}/inscricao`);
  await outra.getByRole('button', { name: /abrir o placar/i }).click();
  await outra.getByRole('button', { name: /\+1/ }).nth(1).click();
  await outra.waitForTimeout(1_500);

  await ctx.setOffline(false);
  const dialogo = marca.getByRole('dialog');
  await expect(dialogo).toContainText('Você tem 1 ponto guardado', { timeout: 20_000 });
  await marca.getByRole('button', { name: 'Descartar os meus' }).click();
  await expect(marca.getByText(placar(0, 1)).first()).toBeVisible({ timeout: 20_000 });

  await encerrarPelaApi(sessionId);
  await ctx.close();
  await ctxOutra.close();
});
```

Notas para o executor:
- A segunda tela de quem organiza é a mesma conta: por isso o conflito aqui vem de **ponto
  alheio** (`foreignPoints`), não de troca de controle. Se a tela "abrir o placar" na outra aba
  reivindicar o controle (`claim_session_ownership` com outro aparelho), o texto passa a ter
  "assumiu o placar"; o teste só confere "Você tem 1 ponto guardado", que vale nos dois casos.
- `marca.getByText(placar(a, b))` usa o mesmo formato de `ao-vivo.spec.ts`; se a ordem dos times
  na tela mudar, ajuste como lá.
- `ctx.setOffline(true)` faz `navigator.onLine` virar `false` e dispara o evento `offline` — é o
  que o app observa.

- [ ] **Step 2: Rodar a pilha local**

Pré-requisitos (receita em `e2e/local-stack/README.md`): `docker ps` mostra o projeto
`volley-local`; o Vite sobe com `npx vite --port 3300 --strictPort --host 0.0.0.0` a partir da
raiz da worktree (em segundo plano). Então:

Run: `npx playwright test -c e2e/local-stack/playwright.config.ts`
Expected: 7 passed (os 5 antigos e os 2 novos). Pare o Vite depois.

- [ ] **Step 3: PRODUCT.md**

Troque o princípio 2 por:

```markdown
2. **O Placar Não Para Sem Sinal**: A quadra não tem internet confiável. Com conta, o placar ao vivo continua marcando sem sinal, guarda os pontos no aparelho e envia quando o sinal volta; se alguém mexeu no placar nesse meio-tempo, quem marcou decide antes de enviar. O resto do app pede conexão. Sem conta, a pelada rápida roda inteira no aparelho.
```

- [ ] **Step 4: Verificação completa**

```bash
npm run lint
npm run lint:eslint
npx prettier --check $(git diff --name-only main)
npm test
npm run build
```

Expected: tipos ok; eslint com 0 erros; prettier ok nos arquivos tocados; `npm test` verde;
build ok.

- [ ] **Step 5: Commit**

```bash
git add e2e/local-stack/sem-sinal.spec.ts e2e/local-stack/README.md PRODUCT.md
git commit -m "test: placar sem sinal na pilha local; PRODUCT.md com o principio novo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
