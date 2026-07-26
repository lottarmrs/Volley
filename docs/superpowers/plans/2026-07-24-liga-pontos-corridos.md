# Liga de Pontos Corridos Multi-Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scheduling and aggregation engine for a round-robin championship
that spans weeks or months, with a fixed team roster, weekly-recurring scheduling
(with manual overrides), and season-long standings/awards — reusing the existing
tournament logic in `src/logic/tournament.ts` unchanged.

**Architecture:** A new `Championship`/`ChampionshipTeam`/`ChampionshipRound` data
model, synced the same way every other entity in this app is synced. Each round
materializes into a normal `Session` (with fixed, non-rebalanced `Team` rows bridged
back to their `ChampionshipTeam` via a new `championshipTeamId` field) so all existing
session/game/scoreboard code keeps working unmodified. Season-long standings/awards are
computed by collecting games from every materialized round and remapping each
session's ephemeral `Team.id` to its `championshipTeamId` before calling the existing
pure functions.

**Tech Stack:** Same TypeScript/React/Supabase stack as every prior plan this session.
No new dependencies.

## Global Constraints

- `generateTournamentSchedule`, `generateRoundRobinSchedule`,
  `calculateTournamentStandings`, `calculateTournamentAwards`,
  `calculateTournamentMVP`, `calculateTopScorers` (`src/logic/tournament.ts`) are
  **not modified** by this plan. Every task that touches season-long aggregation must
  call these unchanged, feeding them remapped ids.
- No new screens, routes, or player-facing UI. The only UI surface is a minimal
  addition to an existing admin view (`src/components/community/CommunitiesView.tsx`),
  reusing its existing visual patterns.
- A `Championship` belongs to exactly one community. No cross-community leagues.
- Adding/removing a team mid-season is not supported. No task should build UI or logic
  for it.
- Once a `ChampionshipRound` has a `sessionId` (materialized), changing the
  `recurrenceRule` must never move or regenerate that round's date — only
  not-yet-materialized rounds regenerate.
- Do not add TanStack Query, Dexie, XState, or Zod (carried over from every prior plan
  in this program).
- Every entity gains the same sync fields every other entity in this app has:
  `cloudId`, `syncStatus`, `lastSyncedAt`, `deletedAt`.

---

### Task 1: Domain logic — recurrence engine, position awards, id remap

**Status: ✅ Concluída e revisada** — commit `330aeee`, review Approved (sem findings acima de Minor). Ver `.superpowers/sdd/progress.md` para detalhes.

**Files:**
- Create: `src/logic/championship.ts`
- Create: `src/logic/championship.test.ts`

**Interfaces:**
- Consumes: `Position` (from `../types`), `PointEvent`, `Player`,
  `TournamentStanding`, `AwardWinner` (from `./tournament`), `isCreditedPoint` (from
  `./match`).
- Produces: `generateRoundDates`, `calculateAwardsByPosition`,
  `remapTeamIdsForChampionship` — exact signatures below. Tasks 4 and 6 depend on
  these exact names and shapes.

- [x] **Step 1: Write the failing tests for `generateRoundDates`**

```typescript
// src/logic/championship.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateRoundDates,
  calculateAwardsByPosition,
  remapTeamIdsForChampionship,
} from './championship';
import type { PointEvent, Player } from '../types';

describe('generateRoundDates', () => {
  it('generates dates on a single weekly day at the given time', () => {
    // 2026-08-04 is a Tuesday.
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: null },
      3,
    );
    expect(dates).toEqual(['2026-08-04T20:00', '2026-08-11T20:00', '2026-08-18T20:00']);
  });

  it('alternates between multiple days of the week in calendar order', () => {
    // 2026-08-01 is a Saturday; Tue=2, Thu=4.
    const dates = generateRoundDates(
      { daysOfWeek: [2, 4], time: '19:30', startDate: '2026-08-01', endDate: null },
      4,
    );
    expect(dates).toEqual([
      '2026-08-04T19:30',
      '2026-08-06T19:30',
      '2026-08-11T19:30',
      '2026-08-13T19:30',
    ]);
  });

  it('stops producing dates past endDate even if roundCount is not reached', () => {
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: '2026-08-10' },
      10,
    );
    expect(dates).toEqual(['2026-08-04T20:00']);
  });

  it('starts on startDate itself when startDate already falls on a matching day', () => {
    // 2026-08-04 is already a Tuesday.
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-04', endDate: null },
      1,
    );
    expect(dates).toEqual(['2026-08-04T20:00']);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/logic/championship.test.ts`
Expected: FAIL with "Cannot find module './championship'" (file doesn't exist yet).

- [x] **Step 3: Implement `generateRoundDates`**

```typescript
// src/logic/championship.ts
export interface ChampionshipRecurrenceRule {
  daysOfWeek: number[]; // 0 (Sunday) .. 6 (Saturday)
  time: string; // 'HH:mm'
  startDate: string; // 'YYYY-MM-DD'
  endDate?: string | null; // 'YYYY-MM-DD', inclusive
}

export function generateRoundDates(
  rule: ChampionshipRecurrenceRule,
  roundCount: number,
): string[] {
  const dates: string[] = [];
  const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
  if (sortedDays.length === 0 || roundCount <= 0) return dates;

  const endBoundary = rule.endDate ? new Date(`${rule.endDate}T23:59:59`) : null;
  const cursor = new Date(`${rule.startDate}T00:00:00`);

  while (dates.length < roundCount) {
    if (endBoundary && cursor > endBoundary) break;
    if (sortedDays.includes(cursor.getDay())) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}T${rule.time}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
```

- [x] **Step 4: Run tests to verify `generateRoundDates` passes**

Run: `npx vitest run src/logic/championship.test.ts`
Expected: the 4 `generateRoundDates` tests PASS (the file will still fail to import
`calculateAwardsByPosition`/`remapTeamIdsForChampionship` — write those next before
running the full file again).

- [x] **Step 5: Write the failing tests for `calculateAwardsByPosition`**

```typescript
// append to src/logic/championship.test.ts
describe('calculateAwardsByPosition', () => {
  const players: Player[] = [
    { id: 'p1', nome: 'Ana', posicaoPrincipal: 'ponteiro' } as Player,
    { id: 'p2', nome: 'Bea', posicaoPrincipal: 'ponteiro' } as Player,
    { id: 'p3', nome: 'Cau', posicaoPrincipal: 'libero' } as Player,
  ];

  function point(playerId: string, skill: PointEvent['skill']): PointEvent {
    return {
      id: `pt-${Math.random()}`,
      sessionId: 's1',
      gameId: 'g1',
      sequenceNumber: 1,
      scoringTeamId: 'teamA',
      concedingTeamId: 'teamB',
      playerId,
      skill,
      pointType: 'winner',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 1, teamB: 0 },
    } as PointEvent;
  }

  it('picks the top scorer within each position, not overall', () => {
    const pointEvents = [
      point('p1', 'ataque'),
      point('p1', 'ataque'),
      point('p2', 'ataque'),
      point('p3', 'defesa'),
      point('p3', 'defesa'),
      point('p3', 'defesa'),
    ];

    const awards = calculateAwardsByPosition(pointEvents, players);

    expect(awards.ponteiro?.playerId).toBe('p1');
    expect(awards.ponteiro?.value).toBe(2);
    expect(awards.libero?.playerId).toBe('p3');
    expect(awards.libero?.value).toBe(3);
    expect(awards.central).toBeUndefined();
  });
});

describe('remapTeamIdsForChampionship', () => {
  it('rewrites teamAId/teamBId/winnerTeamId/loserTeamId using the championshipTeamId lookup', () => {
    const games = [
      {
        id: 'g1',
        teamAId: 'session-team-1',
        teamBId: 'session-team-2',
        winnerTeamId: 'session-team-1',
        loserTeamId: 'session-team-2',
      },
      {
        id: 'g2',
        teamAId: 'session-team-2',
        teamBId: 'session-team-1',
        winnerTeamId: 'session-team-1',
        loserTeamId: 'session-team-2',
      },
    ];
    const lookup = new Map([
      ['session-team-1', 'champ-team-A'],
      ['session-team-2', 'champ-team-B'],
    ]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    expect(remapped).toEqual([
      {
        id: 'g1',
        teamAId: 'champ-team-A',
        teamBId: 'champ-team-B',
        winnerTeamId: 'champ-team-A',
        loserTeamId: 'champ-team-B',
      },
      {
        id: 'g2',
        teamAId: 'champ-team-B',
        teamBId: 'champ-team-A',
        winnerTeamId: 'champ-team-A',
        loserTeamId: 'champ-team-B',
      },
    ]);
  });

  it('leaves winnerTeamId/loserTeamId undefined untouched (not every game has a result yet)', () => {
    const games = [
      {
        id: 'g1',
        teamAId: 'session-team-1',
        teamBId: 'session-team-2',
        winnerTeamId: undefined,
        loserTeamId: undefined,
      },
    ];
    const lookup = new Map([
      ['session-team-1', 'champ-team-A'],
      ['session-team-2', 'champ-team-B'],
    ]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    expect(remapped[0].winnerTeamId).toBeUndefined();
    expect(remapped[0].loserTeamId).toBeUndefined();
  });

  it('leaves a game unchanged if its team id has no entry in the lookup', () => {
    const games = [
      { id: 'g1', teamAId: 'unknown-team', teamBId: 'session-team-1', winnerTeamId: undefined, loserTeamId: undefined },
    ];
    const lookup = new Map([['session-team-1', 'champ-team-A']]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    expect(remapped).toEqual([
      { id: 'g1', teamAId: 'unknown-team', teamBId: 'champ-team-A', winnerTeamId: undefined, loserTeamId: undefined },
    ]);
  });
});
```

- [x] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/logic/championship.test.ts`
Expected: FAIL — `calculateAwardsByPosition`/`remapTeamIdsForChampionship` not exported.

- [x] **Step 7: Implement `calculateAwardsByPosition` and `remapTeamIdsForChampionship`**

```typescript
// append to src/logic/championship.ts
import type { PointEvent, Player, Position } from '../types';
import type { AwardWinner } from './tournament';
import { isCreditedPoint } from './match';

const POSITIONS: Position[] = ['levantador', 'oposto', 'ponteiro', 'central', 'libero'];

export function calculateAwardsByPosition(
  pointEvents: PointEvent[],
  players: Player[],
): Partial<Record<Position, AwardWinner>> {
  const counts: Record<string, number> = {};
  const acesByPlayer: Record<string, number> = {};
  const blocksByPlayer: Record<string, number> = {};

  for (const point of pointEvents) {
    if (!point.playerId || !isCreditedPoint(point)) continue;
    counts[point.playerId] = (counts[point.playerId] || 0) + 1;
    if (point.skill === 'saque') acesByPlayer[point.playerId] = (acesByPlayer[point.playerId] || 0) + 1;
    if (point.skill === 'bloqueio') blocksByPlayer[point.playerId] = (blocksByPlayer[point.playerId] || 0) + 1;
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const result: Partial<Record<Position, AwardWinner>> = {};

  for (const position of POSITIONS) {
    const candidates = Object.entries(counts).filter(
      ([playerId]) => playerById.get(playerId)?.posicaoPrincipal === position,
    );
    if (candidates.length === 0) continue;

    const [topPlayerId, topValue] = candidates.sort(
      (a, b) =>
        b[1] - a[1] ||
        (acesByPlayer[b[0]] || 0) - (acesByPlayer[a[0]] || 0) ||
        (blocksByPlayer[b[0]] || 0) - (blocksByPlayer[a[0]] || 0),
    )[0];

    const player = playerById.get(topPlayerId);
    result[position] = {
      playerId: topPlayerId,
      playerName: player?.apelido || player?.nome || 'Atleta',
      value: topValue,
    };
  }

  return result;
}

export function remapTeamIdsForChampionship<
  T extends {
    teamAId: string;
    teamBId: string;
    winnerTeamId?: string | null;
    loserTeamId?: string | null;
  },
>(games: T[], championshipTeamIdByLocal: Map<string, string>): T[] {
  const remap = (id: string | null | undefined) =>
    id ? (championshipTeamIdByLocal.get(id) ?? id) : id;

  return games.map((game) => ({
    ...game,
    teamAId: remap(game.teamAId) as string,
    teamBId: remap(game.teamBId) as string,
    winnerTeamId: remap(game.winnerTeamId),
    loserTeamId: remap(game.loserTeamId),
  }));
}
```

**Crítico:** `calculateTournamentStandings` (`src/logic/tournament.ts:143`) compara
`game.winnerTeamId === game.teamAId` diretamente (linha 190) para decidir o vencedor —
se `winnerTeamId`/`loserTeamId` não forem remapeados junto com `teamAId`/`teamBId`,
essa comparação nunca bate depois do remapeamento e a classificação quebra
silenciosamente (todo jogo passaria a não ter vencedor detectado). Os testes acima
cobrem exatamente isso.

- [x] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/logic/championship.test.ts`
Expected: all tests PASS.

- [x] **Step 9: Run typecheck and lint**

```bash
npx tsc --noEmit
npm run lint:eslint
```

Expected: both clean.

- [x] **Step 10: Commit**

```bash
git add src/logic/championship.ts src/logic/championship.test.ts
git commit -m "feat(logic): add championship recurrence, position awards, and team id remap"
```

---

### Task 2: Database — championships, championship_teams, championship_rounds

**Files:**
- Create: `supabase/migrations/20260725120000_championship_scheduling.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `current_user_has_community_role(uuid, text[])` (already exists, defined in
  `supabase/migrations/20260610161203_backend_operational_sync.sql`, reuse verbatim —
  do not write a new authorization function).
- Produces: three tables with RLS, ready for Task 3's cloud services to read/write.

- [ ] **Step 1: Read the existing modern community-scoped table pattern before writing SQL**

Read `src/infra/supabase/schema.test.ts` and `supabase/migrations/schema.sql` for a
table created **after** RBAC roles existed (e.g. `sessions`, `community_players`, or
Plano 2's `player_evaluations` migration
`20260724150000_evaluation_community_authorization.sql`) — this plan's tables must
follow that modern pattern (`current_user_has_community_role`), **not** the older
`community_rules`/`whatsapp_list_templates` pattern (owner-only, pre-RBAC, no role
check) which predates community roles and is not the convention for new tables.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260725120000_championship_scheduling.sql`:

```sql
-- Championship (liga de pontos corridos multi-data): roster fixo, agendamento
-- recorrente, classificação acumulada entre várias sessões. Ver
-- docs/superpowers/specs/2026-07-24-liga-pontos-corridos-design.md.

create table public.championships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  format text not null check (format in ('round_robin', 'double_round_robin')),
  classification_points jsonb not null default '{"win": 3, "loss": 0}'::jsonb,
  recurrence_days_of_week int[] not null,
  recurrence_time text not null,
  recurrence_start_date date not null,
  recurrence_end_date date,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists championships_community_id_idx
  on public.championships (community_id);

alter table public.championships enable row level security;

create policy "Community members can read championships"
  on public.championships
  for select to authenticated
  using (public.current_user_has_community_role(community_id));

create policy "Community owner or admin can insert championships"
  on public.championships
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.current_user_has_community_role(community_id, array['owner', 'admin'])
  );

create policy "Community owner or admin can update championships"
  on public.championships
  for update to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']))
  with check (public.current_user_has_community_role(community_id, array['owner', 'admin']));

create policy "Community owner or admin can delete championships"
  on public.championships
  for delete to authenticated
  using (public.current_user_has_community_role(community_id, array['owner', 'admin']));

revoke all on table public.championships from public, anon;
grant select, insert, update, delete on public.championships to authenticated;

create table public.championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  name text not null,
  player_ids uuid[] not null default '{}',
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists championship_teams_championship_id_idx
  on public.championship_teams (championship_id);

alter table public.championship_teams enable row level security;

create policy "Community members can read championship teams"
  on public.championship_teams
  for select to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id)
    )
  );

create policy "Community owner or admin can insert championship teams"
  on public.championship_teams
  for insert to authenticated
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community owner or admin can update championship teams"
  on public.championship_teams
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community owner or admin can delete championship teams"
  on public.championship_teams
  for delete to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_teams.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

revoke all on table public.championship_teams from public, anon;
grant select, insert, update, delete on public.championship_teams to authenticated;

create table public.championship_rounds (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references public.championships(id) on delete cascade,
  round integer not null,
  team_a_id uuid not null references public.championship_teams(id) on delete cascade,
  team_b_id uuid not null references public.championship_teams(id) on delete cascade,
  scheduled_date timestamptz not null,
  skipped boolean not null default false,
  session_id uuid references public.sessions(id) on delete set null,
  local_id text,
  sync_version integer default 1 not null,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (championship_id, round)
);

create index if not exists championship_rounds_championship_id_idx
  on public.championship_rounds (championship_id);

alter table public.championship_rounds enable row level security;

create policy "Community members can read championship rounds"
  on public.championship_rounds
  for select to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id)
    )
  );

create policy "Community owner or admin can insert championship rounds"
  on public.championship_rounds
  for insert to authenticated
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community owner or admin can update championship rounds"
  on public.championship_rounds
  for update to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

create policy "Community owner or admin can delete championship rounds"
  on public.championship_rounds
  for delete to authenticated
  using (
    exists (
      select 1 from public.championships c
      where c.id = championship_rounds.championship_id
        and public.current_user_has_community_role(c.community_id, array['owner', 'admin'])
    )
  );

revoke all on table public.championship_rounds from public, anon;
grant select, insert, update, delete on public.championship_rounds to authenticated;
```

Before finalizing, confirm the exact call shape of
`current_user_has_community_role` when called with **no** second argument (used above
for the read policies, matching "any community member" access) — read its actual
definition (`supabase/migrations/20260610161203_backend_operational_sync.sql`) to
confirm it defaults to allowing any role when `allowed_roles` is omitted, the same way
existing read policies on other tables call it. If it does not support a no-argument
call, use the same explicit full-roles-list form the read policies on `sessions` (or
another comparable modern table) actually use instead.

- [ ] **Step 2: Apply the migration to the real Supabase project**

Use the Supabase MCP `apply_migration` tool against project `csoslatxjjazrtrtylke`.
Verify with `list_tables`/`execute_sql` that all three tables exist with RLS enabled
and the expected policies. Run `get_advisors` (security + performance) and confirm no
new advisories beyond an expected unindexed-FK INFO note (consistent with the pattern
already accepted in Plano 2's migration for `player_evaluations.community_id`).

- [ ] **Step 3: Update the consolidated schema.sql**

Append the three table definitions (with their indexes, RLS, policies, grants) to
`supabase/migrations/schema.sql`, placed near other community-scoped tables (e.g. after
`community_players`/`sessions`), matching this file's existing formatting conventions.

- [ ] **Step 4: Update schema.test.ts**

Following this file's existing pattern (see how Plano 2's
`20260724150000_evaluation_community_authorization.sql` test was written — read that
test block first), add:
- A test reading the new migration file, asserting all three `create table` statements,
  the `unique (championship_id, round)` constraint on `championship_rounds`, and all
  write policies checking `current_user_has_community_role(..., array['owner',
  'admin'])`.
- A test asserting the final/consolidated `schema.sql` state includes all three tables
  with RLS enabled.

- [ ] **Step 5: Run the tests**

```bash
npm test
```

Expected: all pass, including new ones. (Two pre-existing, unrelated
player-link-proposal-claim failures in `schema.test.ts` may still appear if the CRLF
checkout artifact recurs in your environment — see this repo's recurring note about
`core.autocrlf`; if you see exactly those two failures and nothing else, restore
affected files from `git show HEAD:<path>` before concluding anything is broken.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260725120000_championship_scheduling.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add championships, championship_teams, championship_rounds tables"
```

---

### Task 3: Types & cloud services

**Files:**
- Modify: `src/shared/types/session.ts`
- Modify: `src/types.ts`
- Create: `src/infra/supabase/championshipCloudService.ts`
- Create: `src/infra/supabase/championshipCloudService.test.ts`

**Interfaces:**
- Consumes: Task 2's tables.
- Produces: `Championship`, `ChampionshipTeam`, `ChampionshipRound` TS types;
  `Team.championshipTeamId?: string`; `championshipCloudService` with `fetchAll`,
  `upsertChampionship`, `upsertTeam`, `upsertRound` methods (exact shapes below). Task 4
  depends on these exact names.

- [ ] **Step 1: Read sibling cloud service files first**

Read `src/infra/supabase/communityRulesCloudService.ts` (mapper + service object
pattern) and one cloud service for a table with a foreign key relationship one level
deep (to see how a related-table lookup is typically handled) before writing this
task's file — match established conventions rather than inventing new ones.

- [ ] **Step 2: Add the TypeScript types**

In `src/shared/types/session.ts`, add (near the existing `Session`/`Team`
definitions):

```ts
export interface ChampionshipRecurrenceRule {
  daysOfWeek: number[];
  time: string;
  startDate: string;
  endDate?: string | null;
}

export interface Championship {
  id: string;
  communityId: string;
  name: string;
  format: 'round_robin' | 'double_round_robin';
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  recurrenceRule: ChampionshipRecurrenceRule;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChampionshipTeam {
  id: string;
  championshipId: string;
  name: string;
  playerIds: string[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface ChampionshipRound {
  id: string;
  championshipId: string;
  round: number;
  teamAId: string; // ChampionshipTeam.id
  teamBId: string; // ChampionshipTeam.id
  scheduledDate: string;
  skipped: boolean;
  sessionId?: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}
```

Add `championshipTeamId?: string;` to the existing `Team` interface, placed near
`generatedByAlgorithm`/`locked`.

Re-export all four new types from `src/types.ts` the same way every other
`shared/types/session.ts` type is already re-exported there (find the existing
`export type { Session, Team, ... } from './shared/types/session';` block and add to
it).

- [ ] **Step 3: Write `championshipCloudService.ts`**

Follow `communityRulesCloudService.ts`'s exact structure (mapper functions + a plain
exported service object, `supabase.from(...)`, throw on `error`, no retry logic beyond
what siblings already do). Cover all three tables:

```typescript
import { supabase } from '../../lib/supabaseClient';
import type { Championship, ChampionshipTeam, ChampionshipRound } from '../../types';

// mapChampionshipToDb / mapDbToChampionship, mapChampionshipTeamToDb /
// mapDbToChampionshipTeam, mapChampionshipRoundToDb / mapDbToChampionshipRound —
// follow communityRulesCloudService.ts's field-by-field mapping style exactly,
// snake_case columns from the Task 2 migration to camelCase TS fields and back.

export const championshipCloudService = {
  async fetchAll(): Promise<Championship[]> { /* select * from championships */ },
  async fetchTeams(championshipCloudId: string): Promise<ChampionshipTeam[]> { /* ... */ },
  async fetchRounds(championshipCloudId: string): Promise<ChampionshipRound[]> { /* ... */ },
  async upsertChampionship(local: Championship, ownerId: string): Promise<Championship> { /* ... */ },
  async upsertTeam(local: ChampionshipTeam, championshipCloudId: string): Promise<ChampionshipTeam> { /* ... */ },
  async upsertRound(local: ChampionshipRound, championshipCloudId: string, teamACloudId: string, teamBCloudId: string): Promise<ChampionshipRound> { /* ... */ },
};
```

Write the actual mapper bodies mapping every field from Task 2's migration columns
(`community_id`, `format`, `classification_points`, `recurrence_days_of_week`,
`recurrence_time`, `recurrence_start_date`, `recurrence_end_date`, `player_ids`,
`round`, `team_a_id`, `team_b_id`, `scheduled_date`, `skipped`, `session_id`) to/from
the camelCase TS fields defined in Step 2 — do not leave any field unmapped.

- [ ] **Step 4: Tests**

Write tests for the mapper functions (round-trip: TS → db → TS produces the original
shape) following the same testing convention Task 2 pointed you to for sibling cloud
services in this session (extract pure mapper functions, test those directly, plus a
source-text regex assertion for the Supabase-calling methods — see
`selfEvaluationCloudService.ts`/its test file from the prior plan in this repo for the
exact pattern to mirror).

- [ ] **Step 5: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/session.ts src/types.ts src/infra/supabase/championshipCloudService.ts src/infra/supabase/championshipCloudService.test.ts
git commit -m "feat(types): add Championship types and cloud service"
```

---

### Task 4: Application layer — create season, materialize round, season stats

**Files:**
- Create: `src/application/championshipUseCases.ts`
- Create: `src/application/championshipUseCases.test.ts`

**Interfaces:**
- Consumes: `generateTournamentSchedule` (`src/logic/tournament.ts`, unmodified),
  `generateRoundDates`/`remapTeamIdsForChampionship`/`calculateAwardsByPosition`
  (Task 1), `Championship`/`ChampionshipTeam`/`ChampionshipRound`/`Team`/`Session`/
  `Game` types (Task 3), `AppResult` convention (`src/application/appResult.ts` — read
  it first, match its exact shape).
- Produces: `createChampionship`, `materializeRound`, `getSeasonStandings`,
  `getSeasonAwards` — exact signatures below. Task 6 (UI) depends on these.

- [ ] **Step 1: Read `appResult.ts` and one existing `*UseCases.ts` file**

Read `src/application/appResult.ts` in full, plus `src/application/localCommunityRulesUseCases.ts`
(or a comparable thin use-case file) to match this codebase's established
input/output/error-wrapping convention exactly — do not invent a different shape.

- [ ] **Step 2: Write the failing test for `createChampionship`**

```typescript
// src/application/championshipUseCases.test.ts
import { describe, it, expect } from 'vitest';
import { createChampionship } from './championshipUseCases';

describe('createChampionship', () => {
  it('generates one round per abstract match from generateTournamentSchedule, each with a real date', () => {
    const result = createChampionship({
      communityId: 'community-1',
      name: 'Liga de Verão',
      format: 'round_robin',
      classificationPoints: { win: 3, loss: 0 },
      recurrenceRule: {
        daysOfWeek: [2],
        time: '20:00',
        startDate: '2026-08-01',
        endDate: null,
      },
      teams: [
        { id: 'team-1', name: 'Time A', playerIds: ['p1', 'p2'] },
        { id: 'team-2', name: 'Time B', playerIds: ['p3', 'p4'] },
        { id: 'team-3', name: 'Time C', playerIds: ['p5', 'p6'] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 teams round_robin = 3 rounds (with a bye each round).
    expect(result.value.rounds).toHaveLength(3);
    expect(result.value.rounds.every((r) => !!r.scheduledDate)).toBe(true);
    expect(result.value.rounds.every((r) => r.round >= 1 && r.round <= 3)).toBe(true);
  });

  it('rejects fewer than 2 teams', () => {
    const result = createChampionship({
      communityId: 'community-1',
      name: 'Liga Curta',
      format: 'round_robin',
      classificationPoints: { win: 3, loss: 0 },
      recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: null },
      teams: [{ id: 'team-1', name: 'Time A', playerIds: ['p1'] }],
    });

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/application/championshipUseCases.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `createChampionship`**

```typescript
// src/application/championshipUseCases.ts
import { generateTournamentSchedule } from '../logic/tournament';
import { generateRoundDates, type ChampionshipRecurrenceRule } from '../logic/championship';
import { productError, technicalError, type AppResult } from './appResult'; // match appResult.ts's actual exported names from Step 1

export interface CreateChampionshipInput {
  communityId: string;
  name: string;
  format: 'round_robin' | 'double_round_robin';
  classificationPoints: { win: number; loss: number; walkoverWin?: number; walkoverLoss?: number };
  recurrenceRule: ChampionshipRecurrenceRule;
  teams: { id: string; name: string; playerIds: string[] }[];
}

export interface CreatedChampionship {
  championship: {
    communityId: string;
    name: string;
    format: 'round_robin' | 'double_round_robin';
    classificationPoints: CreateChampionshipInput['classificationPoints'];
    recurrenceRule: ChampionshipRecurrenceRule;
  };
  teams: CreateChampionshipInput['teams'];
  rounds: { round: number; teamAId: string; teamBId: string; scheduledDate: string; skipped: false }[];
}

export function createChampionship(
  input: CreateChampionshipInput,
): AppResult<CreatedChampionship> {
  if (input.teams.length < 2) {
    return productError('validation', 'Uma liga precisa de pelo menos 2 times.');
  }

  const schedule = generateTournamentSchedule(
    input.teams.map((t) => t.id),
    input.format,
  );
  const roundCount = Math.max(...schedule.map((m) => m.round), 0);
  const dates = generateRoundDates(input.recurrenceRule, roundCount);

  const rounds = schedule.map((match) => ({
    round: match.round,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    scheduledDate: dates[match.round - 1],
    skipped: false as const,
  }));

  return {
    ok: true,
    value: {
      championship: {
        communityId: input.communityId,
        name: input.name,
        format: input.format,
        classificationPoints: input.classificationPoints,
        recurrenceRule: input.recurrenceRule,
      },
      teams: input.teams,
      rounds,
    },
  };
}
```

Adjust the `productError`/`AppResult`/`{ ok: true, value: ... }` shape to exactly match
whatever `appResult.ts` actually exports (Step 1) — this snippet illustrates the logic,
not necessarily the literal helper names.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/application/championshipUseCases.test.ts`
Expected: both tests PASS.

- [ ] **Step 6: Write the failing test for `getSeasonStandings`**

```typescript
// append to src/application/championshipUseCases.test.ts
import { getSeasonStandings } from './championshipUseCases';

describe('getSeasonStandings', () => {
  it('aggregates games across multiple sessions using the championshipTeamId remap', () => {
    const teams = [
      { id: 'session1-teamA', championshipTeamId: 'champ-team-1' },
      { id: 'session1-teamB', championshipTeamId: 'champ-team-2' },
      { id: 'session2-teamA', championshipTeamId: 'champ-team-1' },
      { id: 'session2-teamB', championshipTeamId: 'champ-team-2' },
    ];
    const games = [
      { id: 'g1', teamAId: 'session1-teamA', teamBId: 'session1-teamB', winnerTeamId: 'session1-teamA', loserTeamId: 'session1-teamB' },
      { id: 'g2', teamAId: 'session2-teamA', teamBId: 'session2-teamB', winnerTeamId: 'session2-teamB', loserTeamId: 'session2-teamA' },
    ];

    const standings = getSeasonStandings({
      championshipTeamIds: ['champ-team-1', 'champ-team-2'],
      classificationPoints: { win: 3, loss: 0 },
      sessionTeams: teams,
      games: games as any,
    });

    const team1 = standings.find((s) => s.teamId === 'champ-team-1')!;
    const team2 = standings.find((s) => s.teamId === 'champ-team-2')!;
    expect(team1.wins).toBe(1);
    expect(team1.losses).toBe(1);
    expect(team2.wins).toBe(1);
    expect(team2.losses).toBe(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails, then implement `getSeasonStandings`**

```typescript
// append to src/application/championshipUseCases.ts
import { calculateTournamentStandings, type TournamentStanding } from '../logic/tournament';
import { remapTeamIdsForChampionship } from '../logic/championship';
import type { Game } from '../types';

export function getSeasonStandings(input: {
  championshipTeamIds: string[];
  classificationPoints: { win: number; loss: number; walkoverWin?: number; walkoverLoss?: number };
  sessionTeams: { id: string; championshipTeamId?: string }[];
  games: Game[];
}): TournamentStanding[] {
  const lookup = new Map(
    input.sessionTeams
      .filter((t): t is { id: string; championshipTeamId: string } => !!t.championshipTeamId)
      .map((t) => [t.id, t.championshipTeamId]),
  );
  const remappedGames = remapTeamIdsForChampionship(input.games, lookup);
  return calculateTournamentStandings(
    remappedGames,
    input.championshipTeamIds,
    input.classificationPoints,
  );
}
```

`remapTeamIdsForChampionship` (Task 1) already remaps `winnerTeamId`/`loserTeamId`
alongside `teamAId`/`teamBId` — this is required because
`calculateTournamentStandings` compares `game.winnerTeamId === game.teamAId` directly
(`src/logic/tournament.ts:190`) to determine the winner; without remapping all four
fields together, that comparison silently fails after remapping. This is already
handled by Task 1's implementation — just call it as shown above, no further remapping
logic needed here.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/application/championshipUseCases.test.ts`
Expected: PASS.

- [ ] **Step 9: Write `materializeRound` and `getSeasonAwards`**

`materializeRound(round: ChampionshipRound, teams: ChampionshipTeam[], communityId: string, now: string): { session: Omit<Session, 'id' | 'cloudId' | 'syncStatus' | 'lastSyncedAt' | 'deletedAt'>; teams: Omit<Team, 'id' | 'cloudId' | 'syncStatus' | 'lastSyncedAt' | 'deletedAt'>[]; game: Omit<Game, 'id'> }` —
builds the local (not-yet-persisted) `Session`/`Team`/`Game` objects for a round per
the design doc's "Materialização de rodada → sessão" section (`type: 'tournament'`,
`date: round.scheduledDate`, two `Team`s with `generatedByAlgorithm: false`, `locked:
true`, `championshipTeamId` set, `playerIds` copied from the matching
`ChampionshipTeam`). Write a test proving: skipped rounds are rejected (return an
error `AppResult`, do not materialize), and the two produced `Team`s' `playerIds`
exactly match their source `ChampionshipTeam`s.

`getSeasonAwards(pointEvents: PointEvent[], players: Player[], sessionTeams: {id:
string; championshipTeamId?: string}[], championshipTeamIds: string[],
classificationPoints: {...}, games: Game[]): { awards: TournamentAwards; mvp:
TournamentMVP | null; awardsByPosition: ReturnType<typeof calculateAwardsByPosition>;
topScorers: ReturnType<typeof calculateTopScorers> }` —
computes `getSeasonStandings` internally, then calls `calculateTournamentAwards`,
`calculateTournamentMVP`, `calculateAwardsByPosition`, `calculateTopScorers` with the
already-remapped teams/standings. Write a test proving the MVP/awards reflect players
across two different sessions' point events, not just one.

Write both functions' full implementations and tests following the same TDD steps as
Steps 2-8 above (write failing test, verify fail, implement, verify pass) — do not
skip the RED step for these two functions just because they're later in the task.

- [ ] **Step 10: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 11: Commit**

```bash
git add src/application/championshipUseCases.ts src/application/championshipUseCases.test.ts
git commit -m "feat(app): add championship creation, round materialization, and season stats use cases"
```

---

### Task 5: Sync wiring

**Files:**
- Modify: `src/infra/supabase/syncService.ts`
- Modify: `src/infra/supabase/syncService.test.ts`
- Modify: `src/application/cloudSyncPayload.ts`
- Modify: `src/hooks/useCloudSync.ts`

**Interfaces:**
- Consumes: `championshipCloudService` (Task 3).
- Produces: `LocalSyncPayload` gains `championships`, `championshipTeams`,
  `championshipRounds` fields, synced the same way every other entity list already is.

- [ ] **Step 1: Read the existing sync pattern for one comparable multi-table entity**

Read how `communityRulesCloudService`/`community_rules` (a single related table) AND
how `sessions`/`teams`/`games` (a parent-child chain of three related tables, the
closest structural match to championships/teams/rounds) are threaded through
`uploadLocalDataToCloud`/`downloadCloudDataToLocal` in `syncService.ts` before writing
this task — this is the most sensitive file in this codebase; read the actual current
upload/download flow for the closest structural precedent rather than inventing a new
pattern. `championship_rounds.session_id` needs the same local→cloud id resolution
(`resolveCloudId`) already used for every other cross-entity reference in this file
(e.g. `rule.communityId` at the rules upload call site) — a Critical bug in a prior
plan this session was exactly a missed instance of this same resolution step, so trace
this carefully.

- [ ] **Step 2: Add `championships`/`championshipTeams`/`championshipRounds` to `LocalSyncPayload`**

Add the three optional array fields to `LocalSyncPayload` (defined in
`syncService.ts`), mirroring exactly how `linkProposals` used to be threaded (a
now-removed feature from earlier this session, whose sync wiring pattern is otherwise
identical to what's needed here) or how `rules`/`sessions` currently are.

- [ ] **Step 3: Wire upload and download**

In `uploadLocalDataToCloud`: upsert championships, then teams (each resolving its
`championshipId` to the parent championship's cloud id via `resolveCloudId`), then
rounds (each resolving `championshipId`, `teamAId`, `teamBId`, and — if present —
`sessionId` to their respective cloud ids via `resolveCloudId`, using the same
`communityCloudIds`/`playerCloudIds`-style lookup maps already built earlier in this
function for other entities).

In `downloadCloudDataToLocal`: fetch championships, teams, rounds via
`championshipCloudService`, map cloud ids back to local representations the same way
every other fetched entity already is in this function.

- [ ] **Step 4: Tests**

Write tests in `syncService.test.ts` mirroring the exact test style already used for
another entity's upload/download round-trip in this file, plus a test proving a
`championship_round.session_id` is correctly resolved to its session's cloud id before
upload (the Critical-bug-shaped case named in Step 1).

- [ ] **Step 5: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 6: Commit**

```bash
git add src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts src/application/cloudSyncPayload.ts src/hooks/useCloudSync.ts
git commit -m "feat(sync): thread championships/teams/rounds through cloud sync"
```

---

### Task 6: Admin UI — minimal championship section in CommunitiesView

**Files:**
- Modify: `src/components/community/CommunitiesView.tsx`
- Modify: `src/components/community/CommunitiesView.spec.tsx` (or whatever this
  component's existing test file is actually named — check first)

**Interfaces:**
- Consumes: `createChampionship`, `materializeRound`, `getSeasonStandings`,
  `getSeasonAwards` (Task 4), `championshipCloudService` (Task 3, via whatever hook
  pattern App.tsx/CommunitiesView already uses to reach cloud services — check first).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Read the current component's structure**

Read `CommunitiesView.tsx` in full — it already imports `Trophy` (icon) and several
`logic/community.ts` helpers, suggesting a natural home for a "Ligas" section already
exists structurally (a tab or card-list pattern used for other community-scoped
lists). Identify the closest existing analogous section (e.g. how community rules or
sessions are listed/managed here) to match its visual and state-management pattern
exactly — this plan's Global Constraints forbid new screens/routes; this must be an
addition within the existing view, not a new route.

- [ ] **Step 2: Add a minimal "Ligas" section**

Add a new section (following the exact card/list visual pattern identified in Step 1)
that:
- Lists active championships for the current community (name, format, next
  unmaterialized round's date).
- Shows the current standings table for a selected championship (calling
  `getSeasonStandings` with data already available in this view's existing props/state
  — check what's already threaded into `CommunitiesView` for sessions/games/teams
  before deciding whether new props need threading from `App.tsx`).
- A minimal creation form (name, format, team roster assignment from existing
  community players, recurrence day(s)/time/start date) calling `createChampionship`.

Do not add navigation, routes, or a dedicated page — this is a section within the
existing view, gated behind the same permission check already used for other
admin-only actions in this file (`useCommunityPermissions` is already imported).

- [ ] **Step 3: Tests**

Add component tests for the new section: renders the championship list, renders
standings for a selected championship, creation form calls `createChampionship` with
the expected input shape. Follow this file's existing test file's mocking conventions.

- [ ] **Step 4: Run the full suite, typecheck, lint**

```bash
npm test
npx tsc --noEmit
npm run lint:eslint
```

- [ ] **Step 5: Manual verification**

Per this project's UI verification convention: start the dev server, navigate to a
community's management view, create a test championship, confirm it appears in the
list with generated round dates, and confirm standings render (even if empty/zeroed
before any round is materialized). If authentication blocks reaching this screen in
your environment, say so explicitly rather than claiming visual verification that
didn't happen — this exact limitation was hit and disclosed honestly during this
session's `SessionWizard.tsx` cleanup task.

- [ ] **Step 6: Commit**

```bash
git add src/components/community/CommunitiesView.tsx src/components/community/CommunitiesView.spec.tsx
git commit -m "feat(ui): add minimal championship management section to CommunitiesView"
```

---

## Completion Gate

- [ ] `generateTournamentSchedule`, `generateRoundRobinSchedule`,
      `calculateTournamentStandings`, `calculateTournamentAwards`,
      `calculateTournamentMVP`, `calculateTopScorers` are byte-identical to their state
      before this plan (no diff in `src/logic/tournament.ts`).
- [ ] A championship created with N teams produces exactly the round count
      `generateTournamentSchedule` itself would produce, each with a real calendar
      date respecting the recurrence rule.
- [ ] A materialized round's `Session`/`Team`/`Game` work with the existing
      scoreboard/game UI with zero changes to that UI.
- [ ] Season standings/awards correctly aggregate across multiple materialized rounds'
      sessions via the `championshipTeamId` remap — verified by a test with games from
      at least 2 different sessions.
- [ ] No new screens, routes, or player-facing UI exist anywhere in the diff.
- [ ] Full suite green (`npm test`), typecheck clean (`npx tsc --noEmit`), lint clean
      (`npm run lint:eslint`).
- [ ] The new migration has been applied to and verified against the real Supabase
      project (`csoslatxjjazrtrtylke`).
