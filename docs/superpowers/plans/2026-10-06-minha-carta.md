# Minha carta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba do perfil vira "Minha carta": um baralho com uma carta VUT por comunidade, e abaixo o álbum de conquistas e a coleção de edições da carta em destaque — sem nenhum número inventado.

**Architecture:** Sem servidor novo. Uma função pura (`buildMyCards`) monta cada carta com o motor VUT sobre o histórico daquela comunidade e os números da avaliação (`get_community_card_stats`, buscados por comunidade com `useQueries`). Uma função nova do motor (`editionHistory`) percorre as noites. A tela é um componente novo montado pelo `UserProfileView`, com o estado da carta em destaque no endereço (`?comunidade=`).

**Tech Stack:** React 19, Vite 6, TypeScript, TanStack Query, `motion/react`, react-router, Node test runner (`.test.ts`), Vitest + RTL (`.spec.tsx`), Playwright na pilha local.

**Spec:** `docs/superpowers/specs/2026-10-06-minha-carta-design.md`

## Global Constraints

- UI em pt-BR. Sem comentários no código-fonte. Prettier: aspas simples, largura 100.
- Imports por alias (`@app/*`, `@logic/*`, `@infra/*`, `@shared/types`, `@hooks/*`).
- Nenhum número inventado: sem avaliação → "?"; números ainda não chegaram → esqueleto; nunca padrão 7, 70 ou 12.
- Uma carta por comunidade; álbum e coleção contados só no histórico da comunidade da carta em destaque.
- Coleção: só edições `mvp`, `maestro`, `muralha`; `in_form` fica de fora.
- "Perto de sair": bloqueada com `current > 0` e `target > 0`; barra limitada a 95% (regra da fatia 1).
- Ordem do baralho: última pelada encerrada jogada ali, mais recente primeiro; sem pelada no fim, por nome.
- Endereço: `/perfil?comunidade=<id do app da comunidade>`; trocar de carta usa `replace`.
- Mundo visual herdado (DESIGN.md): sem fonte, paleta ou material novo; `motion/react`; "reduzir movimento" → só opacidade.
- `tsc` não pega prop desconhecida em JSX: o spec protege o contrato do componente.
- Árvore compartilhada: trabalhar só em `C:\Volley-carta` (branch `exec/minha-carta`); stage por caminho explícito.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/logic/futCards.ts` | `EditionEntry`, `editionHistory` |
| `src/logic/futCards.test.ts` | testes de `editionHistory` |
| `src/application/myCards.ts` (novo) | `MyCard`, `buildMyCards` |
| `src/application/myCards.test.ts` (novo) | testes de `buildMyCards` |
| `src/hooks/useCardStatsForCommunities.ts` (novo) | números da avaliação de várias comunidades |
| `src/hooks/useCardStatsForCommunities.spec.tsx` (novo) | spec do hook |
| `src/components/account/MyCardDeck.tsx` (novo) | baralho + álbum + coleção |
| `src/components/account/MyCardDeck.spec.tsx` (novo) | contrato da tela |
| `preview/minhacarta.html`, `preview/minhacarta.tsx`, `preview/minhacartaFixtures.ts` (novos) | bancada de design |
| `src/components/account/UserProfileView.tsx` | troca o miolo inventado por "Minha carta" |
| `src/components/account/UserProfileView.spec.tsx` | nada inventado aparece; aba "Minha carta" |
| `src/app/routes/globalRoutes.tsx` (`PerfilRoute`) | monta as cartas e passa ao perfil |
| `src/app/AppShell.tsx` (+ `.spec.tsx`) | "Ver minha carta" → `/perfil?comunidade=` |
| `src/components/player/FutCardModal.tsx` (+ `.spec.tsx`) | link "Ver em Minha carta" na própria carta |
| `src/application/appRoutes.ts` | `paths.minhaCarta(communityId)` |
| `e2e/local-stack/sua-noite.spec.ts` | "Ver minha carta" abre o perfil na carta certa |
| `docs/JORNADA.md`, `HANDOFF.md` | documentos |

---

### Task 1: Motor — `editionHistory`

**Files:**
- Modify: `src/logic/futCards.ts` (junto de `resolvePlayerEdition`, ~linha 303)
- Test: `src/logic/futCards.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EditionEntry { sessionId: string; date: string; edition: VutEdition }
  export function editionHistory(player: Player, ctx: BuildVutCardContext): EditionEntry[]
  ```

- [ ] **Step 1: Testes que falham** — acrescentar a `src/logic/futCards.test.ts` (usa o `createPlayer` do arquivo; importar `editionHistory`):

```ts
function noite(
  sid: string,
  date: string,
  status: 'finished' | 'active',
  pontosDaAna: number,
  pontosDaBia: number,
) {
  const session = { id: sid, name: sid, date, status, createdAt: `${date}T20:00:00Z` } as unknown as Session;
  const teams = [
    { id: `${sid}-a`, sessionId: sid, name: 'A', playerIds: ['ana'] },
    { id: `${sid}-b`, sessionId: sid, name: 'B', playerIds: ['bia'] },
  ] as unknown as Team[];
  const vencedor = pontosDaAna >= pontosDaBia ? `${sid}-a` : `${sid}-b`;
  const games = [
    {
      id: `${sid}-g`,
      sessionId: sid,
      teamAId: `${sid}-a`,
      teamBId: `${sid}-b`,
      scoreA: pontosDaAna,
      scoreB: pontosDaBia,
      winnerTeamId: vencedor,
      status: 'finished',
    },
  ] as unknown as Game[];
  const ponto = (playerId: string, time: string, outro: string, n: number) =>
    ({
      id: `${sid}-${playerId}-${n}`,
      sessionId: sid,
      gameId: `${sid}-g`,
      sequenceNumber: n,
      pointType: 'winner',
      skill: 'ataque',
      playerId,
      scoringTeamId: time,
      concedingTeamId: outro,
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 0, teamB: 0 },
      timestamp: `${date}T20:00:00.000Z`,
    }) as unknown as PointEvent;
  const pointEvents = [
    ...Array.from({ length: pontosDaAna }, (_, i) => ponto('ana', `${sid}-a`, `${sid}-b`, i + 1)),
    ...Array.from({ length: pontosDaBia }, (_, i) => ponto('bia', `${sid}-b`, `${sid}-a`, 100 + i)),
  ];
  return { session, teams, games, pointEvents };
}

function historicoDe(noites: ReturnType<typeof noite>[]): BuildVutCardContext {
  return {
    sessions: noites.map((n) => n.session),
    teams: noites.flatMap((n) => n.teams),
    games: noites.flatMap((n) => n.games),
    pointEvents: noites.flatMap((n) => n.pointEvents),
    players: [createPlayer('ana', 'ponteiro'), createPlayer('bia', 'ponteiro')],
    sessionReports: [],
  };
}

test('editionHistory: uma entrada por noite de edicao especial, mais recente primeiro', () => {
  const ana = createPlayer('ana', 'ponteiro');
  const ctx = historicoDe([
    noite('s1', '2026-06-01', 'finished', 15, 5),
    noite('s2', '2026-06-08', 'finished', 15, 5),
  ]);
  const hist = editionHistory(ana, ctx);
  assert.deepEqual(
    hist.map((e) => [e.sessionId, e.date]),
    [
      ['s2', '2026-06-08'],
      ['s1', '2026-06-01'],
    ],
  );
  assert.ok(hist.every((e) => ['mvp', 'maestro', 'muralha'].includes(e.edition.kind)));
});

test('editionHistory: noite sem edicao, pelada nao encerrada e in_form nao entram', () => {
  const ana = {
    ...createPlayer('ana', 'ponteiro'),
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [9, 9, 9, 9, 9] },
  } as Player;
  const ctx = historicoDe([
    noite('s1', '2026-06-01', 'finished', 2, 15),
    noite('s2', '2026-06-08', 'active', 15, 2),
  ]);
  assert.deepEqual(editionHistory(ana, ctx), []);
});
```

Se a regra real de `resolvePlayerEdition` não der MVP para quem marcou 15 de 20 pontos e venceu (confira `calculateSessionRating`), ajuste os números das fixtures até a noite de fato produzir uma edição e documente no relatório — não mude a regra do motor.

- [ ] **Step 2: Rodar e ver falhar** — `node --import tsx --test src/logic/futCards.test.ts` → FAIL (`editionHistory` não existe).

- [ ] **Step 3: Implementar** em `src/logic/futCards.ts`, depois de `resolvePlayerEdition`:

```ts
export interface EditionEntry {
  sessionId: string;
  date: string;
  edition: VutEdition;
}

const COLECIONAVEIS = new Set<VutEditionKind>(['mvp', 'maestro', 'muralha']);

export function editionHistory(player: Player, ctx: BuildVutCardContext): EditionEntry[] {
  const encerradas = ctx.sessions
    .filter((session) => session.status === 'finished')
    .sort((a, b) =>
      a.date === b.date
        ? String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
        : String(b.date).localeCompare(String(a.date)),
    );
  const entradas: EditionEntry[] = [];
  for (const session of encerradas) {
    const teams = ctx.teams.filter((team) => team.sessionId === session.id);
    if (!teams.some((team) => team.playerIds.includes(player.id))) continue;
    const participantes = new Set(teams.flatMap((team) => team.playerIds));
    const edition = resolvePlayerEdition(player, {
      lastSessionPoints: ctx.pointEvents.filter((point) => point.sessionId === session.id),
      lastSessionGames: ctx.games.filter(
        (game) => game.sessionId === session.id && game.status === 'finished',
      ),
      lastSessionTeams: teams,
      participants: ctx.players.filter((candidate) => participantes.has(candidate.id)),
    });
    if (COLECIONAVEIS.has(edition.kind)) {
      entradas.push({ sessionId: session.id, date: session.date, edition });
    }
  }
  return entradas;
}
```

- [ ] **Step 4: Rodar e ver passar** — o mesmo comando, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/logic/futCards.ts src/logic/futCards.test.ts
git add src/logic/futCards.ts src/logic/futCards.test.ts
git commit -m "feat: historico de edicoes especiais do atleta, noite a noite"
```

---

### Task 2: `buildMyCards`

**Files:**
- Create: `src/application/myCards.ts`, `src/application/myCards.test.ts`

**Interfaces:**
- Consumes: `buildVutCard`, `BuildVutCardContext`, `VutCard`, `Achievement`, `editionHistory`, `EditionEntry` (`@logic/futCards`).
- Produces:
  ```ts
  export interface MyCard {
    community: Community;
    card: VutCard;
    achievements: { unlocked: Achievement[]; near: Achievement[]; locked: Achievement[] };
    editions: EditionEntry[];
    lastPlayedAt: string | null;
    loading: boolean;
  }
  export function buildMyCards(input: {
    player: Player;
    communities: Community[];
    history: Omit<BuildVutCardContext, 'skillValues' | 'partnershipMatrix'>;
    skillValuesByCommunity: Map<string, Map<string, Partial<Attributes>> | undefined>;
  }): MyCard[];
  ```

- [ ] **Step 1: Testes que falham** — `src/application/myCards.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Community, Game, Player, Session, Team } from '@shared/types';
import { buildMyCards } from './myCards';

const ana = {
  id: 'ana',
  nome: 'Ana',
  apelido: 'Ana',
  genero: 'F',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: [],
  maoDominante: 'direita',
  atributos: {},
  perfil: { nivel: 3, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
  metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  communityIds: ['c1', 'c2', 'c3'],
} as unknown as Player;

const comunidades = [
  { id: 'c1', name: 'Terça' },
  { id: 'c2', name: 'Quinta' },
  { id: 'c3', name: 'Aberta' },
  { id: 'c4', name: 'De outra pessoa' },
] as unknown as Community[];

function pelada(sid: string, communityId: string, date: string) {
  return {
    session: { id: sid, communityId, name: sid, date, status: 'finished' } as unknown as Session,
    teams: [
      { id: `${sid}-a`, sessionId: sid, name: 'A', playerIds: ['ana'] },
      { id: `${sid}-b`, sessionId: sid, name: 'B', playerIds: ['bia'] },
    ] as unknown as Team[],
    games: [
      {
        id: `${sid}-g`,
        sessionId: sid,
        teamAId: `${sid}-a`,
        teamBId: `${sid}-b`,
        scoreA: 15,
        scoreB: 10,
        winnerTeamId: `${sid}-a`,
        status: 'finished',
      },
    ] as unknown as Game[],
  };
}

const peladas = [pelada('s1', 'c1', '2026-09-01'), pelada('s2', 'c2', '2026-09-20')];
const history = {
  sessions: peladas.map((p) => p.session),
  teams: peladas.flatMap((p) => p.teams),
  games: peladas.flatMap((p) => p.games),
  pointEvents: [],
  players: [ana],
  sessionReports: [],
};

test('uma carta por comunidade do elenco, ordenada pela ultima pelada jogada', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map([['ana', { ataque: 8 }]])],
      ['c2', new Map([['ana', { ataque: 6 }]])],
      ['c3', new Map()],
    ]),
  });
  assert.deepEqual(
    cartas.map((c) => c.community.id),
    ['c2', 'c1', 'c3'],
  );
  assert.equal(cartas[0].lastPlayedAt, '2026-09-20');
  assert.equal(cartas[2].lastPlayedAt, null);
});

test('o historico de uma carta nao vaza para outra', () => {
  const [c2, c1] = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map()],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  assert.equal(c1.community.id, 'c1');
  assert.equal(c2.community.id, 'c2');
  assert.equal(c1.lastPlayedAt, '2026-09-01');
  assert.equal(c2.lastPlayedAt, '2026-09-20');
  assert.deepEqual(
    [c1, c2].map(
      (c) =>
        c.achievements.unlocked.length + c.achievements.near.length + c.achievements.locked.length,
    ),
    [c1.card.achievements.length, c2.card.achievements.length],
  );
});

test('comunidade sem pelada: album sem desbloqueadas e sem perto; sem avaliacao: carta "?"', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map()],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  const aberta = cartas.find((c) => c.community.id === 'c3')!;
  assert.equal(aberta.achievements.unlocked.length, 0);
  assert.equal(aberta.achievements.near.length, 0);
  assert.equal(aberta.editions.length, 0);
  assert.equal(aberta.card.stats.rated, false);
  assert.equal(aberta.loading, false);
});

test('numeros ainda nao chegaram: carta carregando', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([['c1', undefined]]),
  });
  assert.equal(cartas.find((c) => c.community.id === 'c1')!.loading, true);
});
```

O segundo teste prova o não-vazamento pela data da última pelada: se o histórico de c2 vazasse para c1, `c1.lastPlayedAt` seria `2026-09-20`.

- [ ] **Step 2: Rodar e ver falhar** — `node --import tsx --test src/application/myCards.test.ts` → FAIL (módulo ausente).

- [ ] **Step 3: Implementar** `src/application/myCards.ts`:

```ts
import type { Attributes, Community, Player } from '@shared/types';
import {
  buildVutCard,
  editionHistory,
  type Achievement,
  type BuildVutCardContext,
  type EditionEntry,
  type VutCard,
} from '@logic/futCards';

export interface MyCard {
  community: Community;
  card: VutCard;
  achievements: { unlocked: Achievement[]; near: Achievement[]; locked: Achievement[] };
  editions: EditionEntry[];
  lastPlayedAt: string | null;
  loading: boolean;
}

type History = Omit<BuildVutCardContext, 'skillValues' | 'partnershipMatrix'>;

function daComunidade(history: History, communityId: string): History {
  const sessions = history.sessions.filter((s) => s.communityId === communityId);
  const ids = new Set(sessions.map((s) => s.id));
  return {
    ...history,
    sessions,
    teams: history.teams.filter((t) => ids.has(t.sessionId)),
    games: history.games.filter((g) => ids.has(g.sessionId)),
    pointEvents: history.pointEvents.filter((p) => ids.has(p.sessionId)),
    sessionReports: history.sessionReports.filter((r) => ids.has(r.sessionId)),
  };
}

function ultimaJogada(player: Player, history: History): string | null {
  const datas = history.sessions
    .filter((s) => s.status === 'finished')
    .filter((s) =>
      history.teams.some((t) => t.sessionId === s.id && t.playerIds.includes(player.id)),
    )
    .map((s) => s.date)
    .sort();
  return datas.length ? datas[datas.length - 1] : null;
}

export function buildMyCards(input: {
  player: Player;
  communities: Community[];
  history: History;
  skillValuesByCommunity: Map<string, Map<string, Partial<Attributes>> | undefined>;
}): MyCard[] {
  const { player, communities, history, skillValuesByCommunity } = input;
  const minhas = communities.filter((c) => (player.communityIds ?? []).includes(c.id));
  const cartas = minhas.map((community) => {
    const historico = daComunidade(history, community.id);
    const skillValues = skillValuesByCommunity.get(community.id);
    const card = buildVutCard(player, { ...historico, skillValues: skillValues ?? new Map() });
    const unlocked = card.achievements.filter((a) => a.unlocked);
    const near = card.achievements
      .filter((a) => !a.unlocked && a.target > 0 && a.current > 0)
      .sort((a, b) => b.current / b.target - a.current / a.target);
    const nearIds = new Set(near.map((a) => a.id));
    const locked = card.achievements.filter((a) => !a.unlocked && !nearIds.has(a.id));
    return {
      community,
      card,
      achievements: { unlocked, near, locked },
      editions: editionHistory(player, historico),
      lastPlayedAt: ultimaJogada(player, historico),
      loading: skillValuesByCommunity.has(community.id) && skillValues === undefined,
    };
  });
  return cartas.sort((a, b) => {
    if (a.lastPlayedAt && b.lastPlayedAt) return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    if (a.lastPlayedAt) return -1;
    if (b.lastPlayedAt) return 1;
    return a.community.name.localeCompare(b.community.name, 'pt-BR');
  });
}
```

Atenção à regra de `loading`: comunidade ausente do mapa (sem `cloudId`, sem Supabase) **não** carrega — vira carta "?" com `new Map()`; só `undefined` explícito no mapa é "carregando". O hook da Task 3 garante isso.

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/application/myCards.ts src/application/myCards.test.ts
git add src/application/myCards.ts src/application/myCards.test.ts
git commit -m "feat: monta uma carta por comunidade com album e colecao de edicoes"
```

---

### Task 3: Números de várias comunidades

**Files:**
- Create: `src/hooks/useCardStatsForCommunities.ts`, `src/hooks/useCardStatsForCommunities.spec.tsx`

**Interfaces:**
- Consumes: `queryKeys.numerosDaCarta(cloudId)` (`@app/queryKeys`), `toSkillValuesMap` (`@app/cardStats`), `communitySkillProfileCloudService.fetchCardStats` (`@infra/supabase/communitySkillProfileCloudService`), `isSupabaseConfigured` (`src/lib/supabaseClient`). Mesmo padrão de `src/hooks/useCommunityCardStats.ts`.
- Produces: `useCardStatsForCommunities(communities: Community[], players: Player[]): Map<string, Map<string, Partial<Attributes>> | undefined>` — chave = `community.id` (do app). Com `cloudId` e Supabase: `undefined` enquanto carrega ou em erro, o mapa quando chega. Sem `cloudId` ou sem Supabase: `new Map()`.

- [ ] **Step 1: Spec que falha** — `src/hooks/useCardStatsForCommunities.spec.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCardStatsForCommunities } from './useCardStatsForCommunities';

const fetchCardStats = vi.fn();
vi.mock('@infra/supabase/communitySkillProfileCloudService', () => ({
  communitySkillProfileCloudService: { fetchCardStats: (id: string) => fetchCardStats(id) },
}));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));

const players = [{ id: 'ana', cloudId: 'uuid-ana' }] as never;
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCardStatsForCommunities', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchCardStats.mockReset();
  });

  it('uma consulta por comunidade com cloudId, e o mapa por id do app', async () => {
    fetchCardStats.mockImplementation(async (id: string) =>
      id === 'uuid-c1' ? [{ playerId: 'uuid-ana', dimensionKey: 'ataque', value: 8 }] : [],
    );
    const comunidades = [
      { id: 'c1', cloudId: 'uuid-c1', name: 'Terça' },
      { id: 'c2', cloudId: 'uuid-c2', name: 'Quinta' },
    ] as never;
    const { result } = renderHook(() => useCardStatsForCommunities(comunidades, players), {
      wrapper,
    });
    expect(result.current.get('c1')).toBeUndefined();
    await waitFor(() => expect(result.current.get('c1')?.get('ana')).toEqual({ ataque: 8 }));
    expect(result.current.get('c2')?.size).toBe(0);
    expect(fetchCardStats).toHaveBeenCalledTimes(2);
  });

  it('comunidade sem cloudId vira mapa vazio, sem consulta', () => {
    const { result } = renderHook(
      () => useCardStatsForCommunities([{ id: 'local', name: 'Local' }] as never, players),
      { wrapper },
    );
    expect(result.current.get('local')?.size).toBe(0);
    expect(fetchCardStats).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/hooks/useCardStatsForCommunities.spec.tsx`.

- [ ] **Step 3: Implementar** `src/hooks/useCardStatsForCommunities.ts`:

```ts
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@app/queryKeys';
import { toSkillValuesMap } from '@app/cardStats';
import { communitySkillProfileCloudService } from '@infra/supabase/communitySkillProfileCloudService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import type { Attributes, Community, Player } from '@shared/types';

export function useCardStatsForCommunities(
  communities: Community[],
  players: Player[],
): Map<string, Map<string, Partial<Attributes>> | undefined> {
  const comNuvem = isSupabaseConfigured ? communities.filter((c) => !!c.cloudId) : [];
  const resultados = useQueries({
    queries: comNuvem.map((community) => ({
      queryKey: queryKeys.numerosDaCarta(community.cloudId as string),
      refetchOnWindowFocus: true,
      queryFn: () => communitySkillProfileCloudService.fetchCardStats(community.cloudId as string),
    })),
  });
  const dados = resultados.map((r) => r.data);
  return useMemo(() => {
    const mapa = new Map<string, Map<string, Partial<Attributes>> | undefined>();
    for (const community of communities) mapa.set(community.id, new Map());
    comNuvem.forEach((community, i) => {
      const linhas = dados[i];
      mapa.set(community.id, linhas ? toSkillValuesMap(linhas, players) : undefined);
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communities, players, ...dados]);
}
```

**Sem o comentário `eslint-disable`** (regra do repo): monte as dependências sem espalhar o array — por exemplo, derive uma chave estável `const assinatura = resultados.map((r) => r.dataUpdatedAt).join('|')` e use `[communities, players, assinatura]`, lendo `resultados` dentro do memo. O bloco acima mostra a lógica; a forma final das dependências fica sem comentário.

- [ ] **Step 4: Rodar e ver passar**; `npm run lint`; `npm run lint:eslint` sem erro novo.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/hooks/useCardStatsForCommunities.ts src/hooks/useCardStatsForCommunities.spec.tsx
git add src/hooks/useCardStatsForCommunities.ts src/hooks/useCardStatsForCommunities.spec.tsx
git commit -m "feat: numeros da carta de varias comunidades de uma vez"
```

---

### Task 4: A tela "Minha carta" (design + componente)

**Files:**
- Create: `preview/minhacarta.html`, `preview/minhacarta.tsx`, `preview/minhacartaFixtures.ts`, `src/components/account/MyCardDeck.tsx`, `src/components/account/MyCardDeck.spec.tsx`
- Reference: `src/components/player/FutCard.tsx`, `src/components/player/AthleteNightReveal.tsx` (mundo e movimento da fatia 1), `src/logic/shareCardImage.ts`, `src/ui/EmptyState.tsx`, `preview/noite.*` (formato de bancada), `DESIGN.md`

**Interfaces:**
- Consumes: `MyCard` (Task 2).
- Produces:
  ```ts
  export interface MyCardDeckProps {
    cards: MyCard[];
    selectedCommunityId: string | null;
    onSelect: (communityId: string) => void;
  }
  export function MyCardDeck(props: MyCardDeckProps): JSX.Element;
  ```
  Contrato acessível: região `aria-label="Minha carta"`; botões "Carta anterior", "Próxima carta" (escondidos ou desabilitados nas pontas); cada carta com rótulo do nome da comunidade; link "Abrir comunidade" (`/comunidades/<id>`); botão "Compartilhar"; seção "Álbum de conquistas" com contador "N de M"; seção "Coleção de edições"; vazio "Sua carta nasce quando você entra numa comunidade" com link para `/comunidades`; coleção vazia "Nenhuma edição especial ainda"; carta `loading` → esqueleto com `aria-busy="true"` e nenhum número.

- [ ] **Step 1: Pesquisa, shape e decisão (gate do usuário)**
  1. Pesquisa nas referências do usuário (memória `volley-design-references`; notas da fatia 1 em `C:\Volley-noite\.superpowers\sdd\2026-10-05-sua-noite\referencias.md`) para: baralho/carrossel de cartas, álbum de figurinhas/conquistas, prateleira de coleção.
  2. `/impeccable` — `concept-seed --scope surface --mode experience`, página de decisão com três estruturas, o usuário escolhe.
  3. Direção escrita (primeiro viewport, interação assinatura, gramática de movimento) no workspace da execução.
- [ ] **Step 2: Spec do componente** — `MyCardDeck.spec.tsx` com cartas montadas por `buildMyCards` sobre fixtures (as mesmas da bancada): mostra a carta de `selectedCommunityId`; "Próxima carta" chama `onSelect` com o id seguinte; álbum e coleção mostram os da carta em destaque (trocar `selectedCommunityId` troca o contador "N de M" e a coleção); `cards = []` mostra o vazio com link `/comunidades`; carta `loading` tem `aria-busy` e nenhum OVR; coleção vazia mostra o texto; "Compartilhar" chama `shareCardImage` (mock de `@logic/shareCardImage`). Rodar e ver falhar.
- [ ] **Step 3: Implementar** `MyCardDeck.tsx` e a bancada (`preview/minhacarta.*` com: três comunidades com edições; uma sem pelada; uma sem avaliação; uma carregando; nenhuma comunidade). Ler `C:\Users\mathe\.claude\skills\impeccable\reference\craft-floor.md` antes de escrever UI. Rodar o detector `impeccable detect --json` uma vez no fim.
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/components/account/MyCardDeck.spec.tsx`; `npm run lint`; capturas da bancada em 375×812 e 1280×800, com e sem movimento reduzido.
- [ ] **Step 5: Commit** (caminhos explícitos) `feat: tela Minha carta com baralho, album e colecao`. Mostrar as capturas ao usuário e **esperar o ok visual** antes da Task 5.

---

### Task 5: Ligar no perfil

**Files:**
- Modify: `src/components/account/UserProfileView.tsx`, `src/components/account/UserProfileView.spec.tsx`, `src/app/routes/globalRoutes.tsx` (`PerfilRoute`), `src/application/appRoutes.ts`

**Interfaces:**
- Consumes: `buildMyCards` (Task 2), `useCardStatsForCommunities` (Task 3), `MyCardDeck` (Task 4).
- Produces: `paths.minhaCarta(communityId: string): string` → `` `/perfil?comunidade=${communityId}` ``; `UserProfileView` ganha a prop `myCards?: { cards: MyCard[]; selectedCommunityId: string | null; onSelect: (id: string) => void }`.

- [ ] **Step 1: Specs que falham**
  - `UserProfileView.spec.tsx`: a aba se chama "Minha carta"; com `myCards`, renderiza a região "Minha carta"; **nenhum** destes textos aparece em nenhum caso: "Sacador de Elite", "Rei da Quadra", "Paredão Insuperável", "Minhas comunidades"; não aparece o número "70" como OVR nem a contagem "12" de padrão (afirmar pelos rótulos que saíram).
  - `appRoutes` (no `.test.ts` existente de rotas): `paths.minhaCarta('c1') === '/perfil?comunidade=c1'`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**
  - `UserProfileView`: aba `'perfil'` rotulada "Minha carta"; remover estatísticas rápidas, atributos com padrão, galeria fixa e "Minhas comunidades" (e os helpers que só eles usavam: `defaultAtributos`, `attrs`, `AttributeRow`, `AchievementBadge`/equivalente); renderizar `<MyCardDeck {...myCards} />` quando `myCards` vier.
  - `PerfilRoute`: com `minhaFicha`, montar `history` de `shell.sess` (`sessions`, `teams`, `games`, `pointEvents`, `sessionReports`) e `play.players`; `useCardStatsForCommunities(comm.communities, play.players)`; `buildMyCards` em `useMemo`; `selectedCommunityId` de `useSearchParams().get('comunidade')`, caindo na primeira carta quando ausente ou desconhecido; `onSelect` faz `setSearchParams({ comunidade: id }, { replace: true })`.
  - `paths.minhaCarta` em `appRoutes.ts`.
- [ ] **Step 4: Rodar** os specs tocados, `npm run lint`, `npm test`.
- [ ] **Step 5: Commit** `feat: perfil mostra Minha carta no lugar dos numeros inventados`.

---

### Task 6: Ligações — "Ver minha carta" e a própria carta em Pessoas

**Files:**
- Modify: `src/app/AppShell.tsx`, `src/app/AppShell.spec.tsx`, `src/components/player/FutCardModal.tsx`, `src/components/player/FutCardModal.spec.tsx`, `src/components/player/PlayersView.tsx`

**Interfaces:**
- Consumes: `paths.minhaCarta` (Task 5).
- Produces: `FutCardModal` prop `myCardHref?: string` — quando presente, mostra o link "Ver em Minha carta".

- [ ] **Step 1: Specs que falham**
  - `AppShell.spec.tsx`: com a noite aberta (mock de `useAthleteNight` existente no arquivo), "Ver minha carta" chama `dismiss` e navega para `/perfil?comunidade=<communityId da noite>` (verificar pela rota renderizada ou pelo `location` do `MemoryRouter`).
  - `FutCardModal.spec.tsx`: com `myCardHref="/perfil?comunidade=c1"`, há um link "Ver em Minha carta" com esse `href`; sem a prop, não há.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**
  - `AppShell`: `onViewCard` → `athleteNight.dismiss(); navigate(paths.minhaCarta(communityId))` (o hook já devolve o `communityId` do app — conferir o nome do campo em `useAthleteNight`).
  - `FutCardModal`: prop `myCardHref`; link visível perto do título da carta.
  - `PlayersView`: passa `myCardHref={paths.minhaCarta(roster.community.id)}` só quando `selectedVutPlayer.userId === roster.currentUserId`.
- [ ] **Step 4: Rodar** os specs tocados, `npm run lint`, `npm test`.
- [ ] **Step 5: Commit** `feat: ver minha carta abre o perfil na carta da comunidade`.

---

### Task 7: Documentos, verificação e e2e

**Files:**
- Modify: `docs/JORNADA.md`, `HANDOFF.md`, `e2e/local-stack/sua-noite.spec.ts`

- [ ] **Step 1: Documentos**
  - `docs/JORNADA.md`, etapa 1: "O que o atleta vê no próprio perfil?" → baralho com uma carta por comunidade, álbum e coleção da carta em destaque, nada inventado (`myCards.test.ts`, `MyCardDeck.spec.tsx`). "De onde vêm as edições colecionadas?" → das noites encerradas, pela mesma regra da edição atual; mostradas com os números de hoje e a data da noite (`futCards.test.ts`).
  - `HANDOFF.md`: entrada no topo com a fatia, a branch, sem migration, e a próxima fatia (metas entre peladas).
- [ ] **Step 2: e2e** — em `e2e/local-stack/sua-noite.spec.ts`, depois de "Pular", clicar "Ver minha carta" e afirmar que a URL é `/perfil?comunidade=<id da Pelada Local>` e que a região "Minha carta" mostra "Pelada Local". (A execução do e2e é feita pelo controlador na pilha local.)
- [ ] **Step 3: Verificação na ordem da CI** — `npm run typecheck`, `npm run lint:eslint` (só erros; os de scripts ignorados em `.superpowers/` não contam), `npm run format:check`, `npm test`, `npm run build`.
- [ ] **Step 4: Commit** `docs: Minha carta na jornada e no handoff` (+ o e2e).
