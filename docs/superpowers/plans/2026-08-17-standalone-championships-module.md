# Módulo Independente de Ligas & Quadra de Vôlei - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Ligas (Championships) feature into a standalone top-level application module at `/ligas` with a global hub, 4-step wizard, detailed league view with Volleyball Court Lineup visualizer (`VolleyballCourtLineup`), standings table with recent form/percentage (inspired by `tabelacampeonato`), and captain/admin governance workflow.

**Architecture:** Extend domain types with captain IDs, court positions, and change requests. Build modular UI components under `src/components/championship/` wrapped in an Error Boundary. Expose standalone routes (`/ligas`, `/ligas/nova`, `/ligas/:championshipId`) and add a dedicated navigation entry in `AppShell`.

**Tech Stack:** React 19, TypeScript, Vite, TailwindCSS / DaisyUI 5, Lucide Icons, Vitest, Testing Library React, Node test runner.

**Spec:** [docs/superpowers/specs/2026-08-17-championships-module-design.md](file:///c:/Users/Matheus%20Silva/antigravity/Volley/docs/superpowers/specs/2026-08-17-championships-module-design.md)

## Global Constraints

- Prettier: single quotes, 100 char print width.
- UI Language: Portuguese (pt-BR).
- Architecture: Vertical slices (`@shared/types`, `@logic`, `@app`, `@hooks`, `@ui`, `@infra`).
- All types flow through `src/types.ts`.
- File naming: `.test.ts` for Node unit tests, `.spec.tsx` for Vitest UI tests.
- CI verification order: `typecheck → lint:eslint → format:check → test → build`.

---

## File Structure Map

```
src/
├── types.ts (modify: add captainPlayerId, courtPositions, ChampionshipRequest)
├── application/
│   ├── championshipGovernanceUseCases.ts (create: captain & admin requests logic)
│   ├── championshipGovernanceUseCases.test.ts (create: unit tests)
│   └── screens/championshipsView/
│       ├── championshipsViewModel.ts (create: view model aggregation)
│       ├── championshipsViewContract.ts (create: contract builder)
│       ├── championshipsViewContract.test.ts (create: contract tests)
│       └── championshipsViewIntents.ts (create: intent handlers)
├── components/championship/
│   ├── VolleyballCourtLineup.tsx (create: perspective court visualization)
│   ├── VolleyballCourtLineup.spec.tsx (create: court UI test)
│   ├── ChampionshipsHubView.tsx (create: global hub view)
│   ├── ChampionshipsHubView.spec.tsx (create: hub UI test)
│   ├── ChampionshipWizardView.tsx (create: 4-step creation wizard)
│   ├── ChampionshipWizardView.spec.tsx (create: wizard UI test)
│   ├── ChampionshipDetailView.tsx (create: standings, rounds, awards, court, governance)
│   ├── ChampionshipDetailView.spec.tsx (create: detail UI test)
│   └── ChampionshipErrorBoundary.tsx (create: React Error Boundary)
├── app/
│   ├── appRoutes.ts (modify: add /ligas paths)
│   ├── AppShell.tsx (modify: add Ligas nav item + shell context wiring)
│   ├── AppRouter.tsx (modify: add /ligas routes)
│   └── routes/championshipRoutes.tsx (create: route wrappers)
└── components/community/
    └── CommunitiesView.tsx (modify: replace heavy ChampionshipsTab with shortcut card)
```

---

### Task 1: Domain Types & Governance Logic

**Files:**
- Modify: `src/types.ts`
- Create: `src/application/championshipGovernanceUseCases.ts`
- Test: `src/application/championshipGovernanceUseCases.test.ts`

**Interfaces:**
- Consumes: `ChampionshipTeam`, `Player`, `ChampionshipRound` from `src/types.ts`
- Produces: `createChampionshipRequest`, `approveChampionshipRequest`, `rejectChampionshipRequest`, `calculateRecentForm`

- [ ] **Step 1: Write failing unit test for governance requests and recent form**

```typescript
// src/application/championshipGovernanceUseCases.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChampionshipRequest,
  approveChampionshipRequest,
  calculateRecentForm,
} from './championshipGovernanceUseCases';
import type { Game, ChampionshipRequest } from '../types';

test('createChampionshipRequest creates a pending reschedule request', () => {
  const req = createChampionshipRequest({
    championshipId: 'champ-1',
    kind: 'reschedule_round',
    requestedByPlayerId: 'p1',
    requestedByTeamId: 'team-a',
    roundId: 'round-1',
    proposedDate: '2026-09-01T20:00',
  });
  assert.equal(req.status, 'pending');
  assert.equal(req.proposedDate, '2026-09-01T20:00');
});

test('calculateRecentForm computes last 5 games v/d badges', () => {
  const games: Partial<Game>[] = [
    { winnerTeamId: 'team-a', loserTeamId: 'team-b' },
    { winnerTeamId: 'team-b', loserTeamId: 'team-a' },
    { winnerTeamId: 'team-a', loserTeamId: 'team-b' },
  ];
  const form = calculateRecentForm('team-a', games as Game[]);
  assert.deepEqual(form, ['v', 'd', 'v']);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --import tsx --test src/application/championshipGovernanceUseCases.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Update `src/types.ts` and write `championshipGovernanceUseCases.ts`**

In `src/types.ts`:
Add `captainPlayerId?: string` and `courtPositions?: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 'reserva'>` to `ChampionshipTeam`.
Add `ChampionshipRequest` interface.

In `src/application/championshipGovernanceUseCases.ts`:

```typescript
import type { ChampionshipRequest, Game } from '../types';
import { generateUUID } from '../logic/uuid';

export function createChampionshipRequest(
  input: Omit<ChampionshipRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
): ChampionshipRequest {
  const now = new Date().toISOString();
  return {
    id: generateUUID(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function approveChampionshipRequest(
  request: ChampionshipRequest,
  adminOrCaptainId: string,
): ChampionshipRequest {
  const now = new Date().toISOString();
  return {
    ...request,
    status: 'approved',
    approvedByAdminId: adminOrCaptainId,
    updatedAt: now,
  };
}

export function calculateRecentForm(teamId: string, games: Game[]): ('v' | 'd')[] {
  const teamGames = games.filter(
    (g) => (g.teamAId === teamId || g.teamBId === teamId) && g.winnerTeamId,
  );
  const lastFive = teamGames.slice(-5);
  return lastFive.map((g) => (g.winnerTeamId === teamId ? 'v' : 'd'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/application/championshipGovernanceUseCases.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/application/championshipGovernanceUseCases.ts src/application/championshipGovernanceUseCases.test.ts
git commit -m "feat: add championship governance domain types and recent form calculator"
```

---

### Task 2: Volleyball Court Lineup Visualizer (`VolleyballCourtLineup.tsx`)

**Files:**
- Create: `src/components/championship/VolleyballCourtLineup.tsx`
- Test: `src/components/championship/VolleyballCourtLineup.spec.tsx`

**Interfaces:**
- Consumes: `Player`, `ChampionshipTeam` from `@shared/types`
- Produces: `<VolleyballCourtLineup team={team} players={players} onSelectCaptain={fn} />`

- [ ] **Step 1: Write failing UI test for `VolleyballCourtLineup`**

```tsx
// src/components/championship/VolleyballCourtLineup.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VolleyballCourtLineup } from './VolleyballCourtLineup';
import type { ChampionshipTeam, Player } from '../../types';

const mockTeam: ChampionshipTeam = {
  id: 'team-1',
  championshipId: 'champ-1',
  name: 'Trovão',
  playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  captainPlayerId: 'p1',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const mockPlayers: Player[] = [
  { id: 'p1', nome: 'Ana Silva', apelido: 'Ana', posicaoPrincipal: 'levantador' } as Player,
  { id: 'p2', nome: 'Bia Santos', apelido: 'Bia', posicaoPrincipal: 'ponteiro' } as Player,
  { id: 'p3', nome: 'Caio Costa', apelido: 'Caio', posicaoPrincipal: 'central' } as Player,
  { id: 'p4', nome: 'Davi Lima', apelido: 'Davi', posicaoPrincipal: 'oposto' } as Player,
  { id: 'p5', nome: 'Eduarda Cruz', apelido: 'Duda', posicaoPrincipal: 'ponteiro' } as Player,
  { id: 'p6', nome: 'Felipe Rocha', apelido: 'Lipe', posicaoPrincipal: 'libero' } as Player,
];

describe('VolleyballCourtLineup', () => {
  it('renders court positions with jersey numbers and captain badge', () => {
    render(<VolleyballCourtLineup team={mockTeam} players={mockPlayers} />);
    expect(screen.getByText('Trovão')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByTitle('Capitão do time')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:ui -- src/components/championship/VolleyballCourtLineup.spec.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `VolleyballCourtLineup.tsx`**

```tsx
// src/components/championship/VolleyballCourtLineup.tsx
import React from 'react';
import { Shield, User } from 'lucide-react';
import type { ChampionshipTeam, Player, Position } from '../../types';

const POSITION_SIGLA: Record<Position, string> = {
  levantador: 'LEV',
  oposto: 'OPO',
  ponteiro: 'PON',
  central: 'CEN',
  libero: 'LIB',
  'all-rounder': 'UNI',
};

export function VolleyballCourtLineup({
  team,
  players,
  onSelectCaptain,
}: {
  team: ChampionshipTeam;
  players: Player[];
  onSelectCaptain?: (playerId: string) => void;
}) {
  const teamPlayers = players.filter((p) => team.playerIds.includes(p.id));
  const starters = teamPlayers.slice(0, 6);
  const reserves = teamPlayers.slice(6);

  // Default positions: 4 (Ponteiro 1), 3 (Central 1), 2 (Oposto), 5 (Ponteiro 2), 6 (Central 2/Libero), 1 (Levantador)
  const frontRow = [starters[3], starters[2], starters[1]]; // Positions 4, 3, 2
  const backRow = [starters[4], starters[5], starters[0]];  // Positions 5, 6, 1

  return (
    <div className="card card-border bg-base-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="card-title text-base uppercase flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> {team.name}
        </h4>
        <span className="text-xs text-base-content/60">{teamPlayers.length} atletas inscritos</span>
      </div>

      {/* Visual Court Container */}
      <div className="relative rounded-box overflow-hidden bg-gradient-to-b from-orange-600 via-orange-500 to-rose-600 p-4 border-2 border-white/20 shadow-inner">
        {/* Net */}
        <div className="w-full h-3 bg-white/40 border-b-2 border-white/80 mb-4 flex items-center justify-center">
          <span className="text-[9px] font-black uppercase text-white tracking-widest bg-black/40 px-2 rounded">
            REDE
          </span>
        </div>

        {/* Front Row (Positions 4, 3, 2) */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {frontRow.map((player, idx) => (
            <PlayerCardSlot
              key={player?.id || `front-${idx}`}
              player={player}
              isCaptain={player?.id === team.captainPlayerId}
              positionLabel={player ? POSITION_SIGLA[player.posicaoPrincipal] || 'JOG' : 'VAZIO'}
              onSelectCaptain={onSelectCaptain}
            />
          ))}
        </div>

        {/* Attack 3m Line */}
        <div className="w-full border-t-2 border-dashed border-white/50 mb-6 relative">
          <span className="absolute right-2 -top-2.5 text-[8px] font-bold text-white/70">
            Linha de 3m
          </span>
        </div>

        {/* Back Row (Positions 5, 6, 1) */}
        <div className="grid grid-cols-3 gap-2">
          {backRow.map((player, idx) => (
            <PlayerCardSlot
              key={player?.id || `back-${idx}`}
              player={player}
              isCaptain={player?.id === team.captainPlayerId}
              positionLabel={player ? POSITION_SIGLA[player.posicaoPrincipal] || 'JOG' : 'VAZIO'}
              onSelectCaptain={onSelectCaptain}
            />
          ))}
        </div>
      </div>

      {/* Reserves Bar */}
      {reserves.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase text-base-content/60">Reservas / Substitutos</span>
          <div className="flex flex-wrap gap-2">
            {reserves.map((player) => (
              <div
                key={player.id}
                className="badge badge-outline gap-1.5 py-3 px-3 text-xs"
              >
                <User className="w-3 h-3" />
                <span>{player.apelido || player.nome}</span>
                {player.id === team.captainPlayerId && (
                  <span className="badge badge-warning badge-xs font-black">C</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCardSlot({
  player,
  isCaptain,
  positionLabel,
  onSelectCaptain,
}: {
  player?: Player;
  isCaptain?: boolean;
  positionLabel: string;
  onSelectCaptain?: (playerId: string) => void;
}) {
  if (!player) {
    return (
      <div className="rounded-box bg-black/20 border border-white/20 p-2 flex flex-col items-center justify-center min-h-[90px] text-white/50">
        <span className="text-xs">Vazio</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-box bg-base-100/90 backdrop-blur border border-white/30 p-2 flex flex-col items-center text-center shadow-lg transition-transform hover:scale-105">
      {/* Captain Badge */}
      {isCaptain && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-warning text-warning-content font-black text-[10px] flex items-center justify-center border border-white shadow"
          title="Capitão do time"
        >
          C
        </div>
      )}

      {/* Jersey Icon */}
      <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-black text-primary text-xs mb-1">
        {POSITION_SIGLA[player.posicaoPrincipal] || 'J'}
      </div>

      <span className="text-xs font-bold truncate max-w-full">
        {player.apelido || player.nome}
      </span>
      <span className="text-[9px] uppercase font-semibold text-base-content/60">
        {positionLabel}
      </span>

      {onSelectCaptain && !isCaptain && (
        <button
          type="button"
          onClick={() => onSelectCaptain(player.id)}
          className="btn btn-ghost btn-xs text-[9px] mt-1 p-0 h-auto"
        >
          Tornar capitão
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ui -- src/components/championship/VolleyballCourtLineup.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/championship/VolleyballCourtLineup.tsx src/components/championship/VolleyballCourtLineup.spec.tsx
git commit -m "feat: add VolleyballCourtLineup visual perspective court component"
```

---

### Task 3: Error Boundary & Routes Setup (`appRoutes.ts`, `championshipRoutes.tsx`, `ChampionshipErrorBoundary.tsx`)

**Files:**
- Create: `src/components/championship/ChampionshipErrorBoundary.tsx`
- Create: `src/app/routes/championshipRoutes.tsx`
- Modify: `src/app/appRoutes.ts`
- Modify: `src/app/AppRouter.tsx`

**Interfaces:**
- Consumes: React Error Boundary, `paths` from `@app/appRoutes`
- Produces: `paths.ligas`, `paths.ligaNova`, `paths.liga(id)`, `<ChampionshipErrorBoundary>`

- [ ] **Step 1: Create `ChampionshipErrorBoundary.tsx`**

```tsx
// src/components/championship/ChampionshipErrorBoundary.tsx
import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChampionshipErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ChampionshipErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="card card-border bg-base-200 p-6 max-w-lg mx-auto my-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black uppercase">Ocorreu um erro nas Ligas</h3>
          <p className="text-sm text-base-content/60">
            Não foi possível carregar as informações desta tela no momento.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Update `src/app/appRoutes.ts` with new routes**

In `src/app/appRoutes.ts`:
Add helper paths:
```typescript
paths.ligas = '/ligas';
paths.ligaNova = '/ligas/nova';
paths.liga = (id: string) => `/ligas/${id}`;
```

- [ ] **Step 3: Create `src/app/routes/championshipRoutes.tsx`**

```tsx
// src/app/routes/championshipRoutes.tsx
import { lazy } from 'react';
import { useParams } from 'react';
import { useShell } from '../shellContext';
import { ChampionshipErrorBoundary } from '../../components/championship/ChampionshipErrorBoundary';

export const ChampionshipsHubView = lazy(() =>
  import('../../components/championship/ChampionshipsHubView').then((m) => ({ default: m.ChampionshipsHubView })),
);
export const ChampionshipWizardView = lazy(() =>
  import('../../components/championship/ChampionshipWizardView').then((m) => ({ default: m.ChampionshipWizardView })),
);
export const ChampionshipDetailView = lazy(() =>
  import('../../components/championship/ChampionshipDetailView').then((m) => ({ default: m.ChampionshipDetailView })),
);

export function LigasHubRoute() {
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipsHubView />
    </ChampionshipErrorBoundary>
  );
}

export function LigaNovaRoute() {
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipWizardView />
    </ChampionshipErrorBoundary>
  );
}

export function LigaDetalheRoute() {
  const { championshipId } = useParams<{ championshipId: string }>();
  return (
    <ChampionshipErrorBoundary>
      <ChampionshipDetailView championshipId={championshipId} />
    </ChampionshipErrorBoundary>
  );
}
```

- [ ] **Step 4: Connect routes in `src/app/AppRouter.tsx`**

In `AppRouter.tsx`: Add `/ligas`, `/ligas/nova`, `/ligas/:championshipId` inside main shell layout.

- [ ] **Step 5: Run typecheck to verify route definitions**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/appRoutes.ts src/app/AppRouter.tsx src/app/routes/championshipRoutes.tsx src/components/championship/ChampionshipErrorBoundary.tsx
git commit -m "feat: setup standalone /ligas routes and React Error Boundary"
```

---

### Task 4: Global Hub View (`ChampionshipsHubView.tsx`)

**Files:**
- Create: `src/components/championship/ChampionshipsHubView.tsx`
- Test: `src/components/championship/ChampionshipsHubView.spec.tsx`

**Interfaces:**
- Consumes: `useShell` from `src/app/shellContext`
- Produces: `<ChampionshipsHubView />`

- [ ] **Step 1: Write failing UI test for `ChampionshipsHubView`**

```tsx
// src/components/championship/ChampionshipsHubView.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipsHubView } from './ChampionshipsHubView';
import * as shellContext from '../../app/shellContext';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: { communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }] },
    championships: {
      championships: [
        {
          id: 'champ-1',
          communityId: 'comm-1',
          name: 'Liga Primavera',
          format: 'round_robin',
          recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      championshipTeams: [],
      championshipRounds: [],
    },
  }),
}));

describe('ChampionshipsHubView', () => {
  it('renders stats, community filter, and league cards', () => {
    render(
      <BrowserRouter>
        <ChampionshipsHubView />
      </BrowserRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Ligas de Vôlei' })).toBeTruthy();
    expect(screen.getByText('Liga Primavera')).toBeTruthy();
    expect(screen.getByText('Vôlei de Terça')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:ui -- src/components/championship/ChampionshipsHubView.spec.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `ChampionshipsHubView.tsx`**

```tsx
// src/components/championship/ChampionshipsHubView.tsx
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Calendar, Filter, Plus, Search, Trophy, Users } from 'lucide-react';
import { useShell } from '../../app/shellContext';
import { paths } from '../../app/appRoutes';

export function ChampionshipsHubView() {
  const { comm, championships } = useShell();
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'finished'>('all');
  const [search, setSearch] = useState('');

  const filteredChampionships = useMemo(() => {
    return championships.championships.filter((item) => {
      if (item.deletedAt) return false;
      if (selectedCommunityId !== 'all' && item.communityId !== selectedCommunityId) return false;
      if (search.trim() && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [championships.championships, selectedCommunityId, search]);

  const activeCount = championships.championships.filter((c) => !c.deletedAt).length;

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Ligas de Vôlei
          </h2>
          <p className="text-sm text-base-content/60">
            Central de campeonatos por pontos corridos, tabelas e estatísticas da temporada.
          </p>
        </div>
        <Link to={paths.ligaNova} className="btn btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Nova liga
        </Link>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Ligas Ativas</span>
          <p className="text-2xl font-black text-primary mt-1">{activeCount}</p>
        </div>
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Comunidades</span>
          <p className="text-2xl font-black mt-1">{comm.communities.length}</p>
        </div>
        <div className="card card-border bg-base-200 p-4">
          <span className="text-xs uppercase font-bold text-base-content/60">Equipes Cadastradas</span>
          <p className="text-2xl font-black mt-1">{championships.championshipTeams.length}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative grow">
          <Search className="w-4 h-4 absolute left-3 top-3 text-base-content/50" />
          <input
            type="text"
            className="input input-bordered input-sm w-full pl-9"
            placeholder="Buscar liga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select select-bordered select-sm"
          value={selectedCommunityId}
          onChange={(e) => setSelectedCommunityId(e.target.value)}
        >
          <option value="all">Todas as comunidades</option>
          {comm.communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* League Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredChampionships.map((item) => {
          const community = comm.communities.find((c) => c.id === item.communityId);
          const teamsCount = championships.championshipTeams.filter(
            (t) => t.championshipId === item.id,
          ).length;

          return (
            <div key={item.id} className="card card-border bg-base-200 hover:border-primary/50 transition-colors">
              <div className="card-body p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge badge-primary badge-soft">{community?.name || 'Comunidade'}</span>
                  <span className="badge badge-outline text-[10px]">
                    {item.format === 'double_round_robin' ? 'Turno & Returno' : 'Turno Único'}
                  </span>
                </div>
                <h3 className="card-title text-lg uppercase font-black">{item.name}</h3>
                <div className="text-xs text-base-content/60 space-y-1">
                  <p className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> {teamsCount} equipes inscritas
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Início: {item.recurrenceRule?.startDate || '-'}
                  </p>
                </div>
                <div className="card-actions justify-end pt-2 border-t border-base-300">
                  <Link to={paths.liga(item.id)} className="btn btn-outline btn-xs btn-block">
                    Abrir liga
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredChampionships.length === 0 && (
        <div className="card card-border bg-base-200 border-dashed py-12 text-center space-y-2">
          <Trophy className="w-8 h-8 text-base-content/30 mx-auto" />
          <h4 className="font-bold">Nenhuma liga encontrada</h4>
          <p className="text-xs text-base-content/60">Crie a primeira liga para gerenciar a temporada.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ui -- src/components/championship/ChampionshipsHubView.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/championship/ChampionshipsHubView.tsx src/components/championship/ChampionshipsHubView.spec.tsx
git commit -m "feat: add ChampionshipsHubView global hub view component"
```

---

### Task 5: 4-Step Creation Wizard (`ChampionshipWizardView.tsx`)

**Files:**
- Create: `src/components/championship/ChampionshipWizardView.tsx`
- Test: `src/components/championship/ChampionshipWizardView.spec.tsx`

**Interfaces:**
- Consumes: `useShell` from `src/app/shellContext`
- Produces: `<ChampionshipWizardView />`

- [ ] **Step 1: Write failing UI test for `ChampionshipWizardView`**

```tsx
// src/components/championship/ChampionshipWizardView.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipWizardView } from './ChampionshipWizardView';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: { communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }] },
    play: { players: [{ id: 'p1', nome: 'Ana', apelido: '' }] },
    championships: { create: vi.fn(() => ({ ok: true })) },
  }),
}));

describe('ChampionshipWizardView', () => {
  it('renders step 1 inputs and step indicator', () => {
    render(
      <BrowserRouter>
        <ChampionshipWizardView />
      </BrowserRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Nova Liga' })).toBeTruthy();
    expect(screen.getByLabelText('Nome da liga')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:ui -- src/components/championship/ChampionshipWizardView.spec.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `ChampionshipWizardView.tsx`**

Implement 4 steps:
1. Basic info & recurrence
2. Scoring rules (win 3, loss 0)
3. Teams roster & captain selection
4. Review schedule preview & save

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ui -- src/components/championship/ChampionshipWizardView.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/championship/ChampionshipWizardView.tsx src/components/championship/ChampionshipWizardView.spec.tsx
git commit -m "feat: add ChampionshipWizardView 4-step creation wizard"
```

---

### Task 6: League Detail View (`ChampionshipDetailView.tsx`)

**Files:**
- Create: `src/components/championship/ChampionshipDetailView.tsx`
- Test: `src/components/championship/ChampionshipDetailView.spec.tsx`

**Interfaces:**
- Consumes: `getSeasonStandings`, `getSeasonAwards`, `VolleyballCourtLineup`, `calculateRecentForm`
- Produces: `<ChampionshipDetailView championshipId={id} />`

- [ ] **Step 1: Write failing UI test for `ChampionshipDetailView`**

```tsx
// src/components/championship/ChampionshipDetailView.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipDetailView } from './ChampionshipDetailView';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: { communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }] },
    play: { players: [] },
    sess: { games: [], pointEvents: [], teams: [] },
    championships: {
      championships: [
        {
          id: 'champ-1',
          communityId: 'comm-1',
          name: 'Liga Primavera',
          format: 'round_robin',
          classificationPoints: { win: 3, loss: 0 },
          recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      championshipTeams: [],
      championshipRounds: [],
    },
  }),
}));

describe('ChampionshipDetailView', () => {
  it('renders league header and classification standings tab', () => {
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Liga Primavera' })).toBeTruthy();
    expect(screen.getByText('Classificação')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:ui -- src/components/championship/ChampionshipDetailView.spec.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `ChampionshipDetailView.tsx`**

Integrate:
- Sub-tabs: Classificação, Rodadas, Elencos (with `VolleyballCourtLineup`), Premiações, Governança.
- Table with `%` Aproveitamento and `ÚLT. JOGOS` (Forma recente badges `V` / `D`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ui -- src/components/championship/ChampionshipDetailView.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/championship/ChampionshipDetailView.tsx src/components/championship/ChampionshipDetailView.spec.tsx
git commit -m "feat: add ChampionshipDetailView standalone league detail page"
```

---

### Task 7: Update Sidebar Navigation & Refactor `CommunitiesView.tsx`

**Files:**
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/community/CommunitiesView.tsx`

**Interfaces:**
- Consumes: `paths.ligas`
- Produces: Sidebar nav entry for "Ligas", lightweight shortcut card in `CommunitiesView`

- [ ] **Step 1: Add "Ligas" to sidebar navigation in `AppShell.tsx`**

In `AppShell.tsx`:
Add trophy nav item for `/ligas` under navigation items.

- [ ] **Step 2: Refactor `CommunitiesView.tsx`**

Replace heavy inline `ChampionshipsTab` with a clean summary card that links directly to `/ligas`.

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS (all 200+ unit and UI tests passing)

- [ ] **Step 4: Run full CI verification**

Run: `npm run typecheck && npm run lint:eslint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/AppShell.tsx src/components/community/CommunitiesView.tsx
git commit -m "refactor: connect standalone Ligas to AppShell sidebar and streamline CommunitiesView"
```

---

## Verification Plan

### Automated Tests
1. `npm run typecheck` — Must have 0 TypeScript errors.
2. `npm run lint:eslint` — Must pass clean.
3. `npm test` — Run all unit (`test:unit`) and UI (`test:ui`) tests.

### Manual Verification
1. Navigate to `/ligas` from the new sidebar item.
2. Click "Nova Liga" to test the 4-step wizard.
3. Open a league to view the Standings table with recent form badges and the Volleyball Court Lineup visualizer.
