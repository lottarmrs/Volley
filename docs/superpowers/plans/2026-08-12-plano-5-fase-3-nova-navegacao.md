# Plano 5 — Fase 3 (Nova Navegação) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Substituir o shell monolítico `App.tsx` (`activeModule` + `page` + `renderActiveContent()`) por uma árvore de rotas URL community-centric, com deep-link em toda superfície autenticada, sem mudar nenhuma view.

**Architecture:** Router-in-parallel: um `AppRouterV7` novo cresce atrás de uma flag de entrypoint enquanto o `AppRouter` atual continua servindo produção; no fim, um commit único troca um pelo outro e apaga o velho. Toda a decisão de rota (paths, guards, título, itens de sidebar) vive em funções puras em `src/application/appRoutes.ts`, testadas no runner do Node; os componentes de rota são invólucros finos que leem o estado do shell via `useOutletContext`. As telas continuam recebendo os mesmos `ScreenContract` — o que muda é quem constrói o contrato e para onde os callbacks navegam.

**Tech Stack:** React 19, react-router 7.17 (`react-router`, não `react-router-dom`), TypeScript (`strictNullChecks`, sem `strict`), Vite 6, Vitest + jsdom + RTL (`.spec.tsx`), runner nativo do Node + tsx (`.test.ts`), motion/react, DaisyUI/Tailwind.

## Global Constraints

- Node ≥ 20 (22 recomendado). `nvm use` antes de qualquer comando se algo falhar.
- Prettier: aspas simples, largura 100 (`.prettierrc`). **Validar formato só nos arquivos que você tocou:** `npx prettier@3.8.4 --check <arquivos>` — `npm run format:check` acusa ~163 arquivos por `core.autocrlf` e o ruído esconde o erro real.
- **Sem comentários no código-fonte, exceto onde este plano mostra o comentário explicitamente.**
- Idioma da UI é pt-BR: labels, toasts, erros e campos de domínio.
- Imports usam aliases (`@app`, `@domain`, `@ui`, `@shared/types`, …), nunca caminhos relativos profundos.
- Dois runners de teste, separados por glob: `.test.ts` → lógica pura, runner do Node, zero DOM. `.spec.tsx` → UI, Vitest + jsdom + RTL.
- Ordem de verificação do CI: `typecheck → lint:eslint → format:check → test → build`. `lint:eslint` tem ~347 warnings pré-existentes; **corrigir só erros**.
- `python` não existe neste ambiente. Heredoc do PowerShell quebra com aspas: commit multi-linha via `git commit -F <arquivo>`.
- **Estado operacional da sessão vem de `derivePhase()` (`@domain/sessionPhase`), nunca de `session.status` cru.** Isso é o Gate 0 (PR #21) e vale para toda decisão de rota e todo badge.
- Baseline no início do plano: 734 testes unit, 139 UI, `typecheck` e `build` verdes. Nenhuma tarefa pode reduzir esses números.
- Branch de trabalho: `worktree-plano-5-fase-3-navegacao`. Commit por tarefa. Antes de encerrar qualquer sessão: `git log origin/worktree-plano-5-fase-3-navegacao..HEAD` — trabalho local não pushado já se perdeu três vezes neste projeto.
- **`src/App.tsx` está CONGELADO da Task 2 à Task 9.** A Task 1 é a última que o edita; a Task 10 o deleta. Durante a janela de router-in-parallel as closures do shell existem em duas cópias (`App.tsx` servindo produção com a flag desligada, `AppShell.tsx` servindo `?nav=v3`) — isso é o preço escolhido pela spec §2, e só machuca se as cópias divergirem. Por isso: **qualquer defeito encontrado no `App.tsx` durante a janela se corrige no `AppShell`, nunca nos dois.** Se uma correção no `App.tsx` for mesmo inevitável, ela vira uma tarefa própria que replica a mudança nas duas cópias no mesmo commit.

## Decisões de produto já fechadas (não reabrir)

1. **Agenda é rota global `/agenda`** (spec base §12 linha 289; P0-1 da critique de 2026-08-05).
2. **As 4 áreas internas montam as telas globais existentes, filtradas por comunidade; o detalhe da comunidade (10 abas) fica intacto no índice `/comunidades/:communityId`.** Leitura literal da tabela de mapeamento da spec. A duplicação resultante (Atletas/Ranking/Sessões aparecem em dois lugares) é consciente e fica para consolidação na Fase 4.
3. **Sessão exige comunidade.** `buildManualSessionDraft` passa a estampar `communityId`. Sessão ativa legada sem `communityId` é alcançada pela rota global transitória `/sessao/ativa`, que existe só para esse caso.
4. **`/agenda` ganha tela mínima real** (próximas sessões + rodadas de liga cross-comunidades, a partir de dados que já existem). **`/perfil` recebe o `SettingsModule`** (backup/import/restaurar demo — que é user-scoped, não da comunidade) e **`/perfil/sync` recebe o `AccountSyncView`**.

### Consequência da decisão 2+4 sobre `/gestao`

A tabela da spec manda `configuracoes` → `/comunidades/:id/gestao`, mas a decisão 4 move o `SettingsModule` para `/perfil`. Sobra: **`/comunidades/:communityId/gestao` monta o `CommunitiesView` em modo detalhe fixado na aba `rules`**, via um `initialCommunityTab` opcional no modelo — o mesmo padrão que o `HistoryView` já usa com `initialTab`.

## Desvios deliberados da spec de design (§3)

Ambos produzem **menos** código que o texto da spec. Estão aqui para o executor não achar que é descuido:

1. **`useSessionWizard` não muda.** A spec previa trocar `setPage` por `navigate` e um `switch` de tradução dentro do hook. Em vez disso o `AppShell` passa como `setPage` um adaptador `(page) => navigate(pathForLegacyPage(page, communityId))`. O hook e seus testes ficam intocados; a tradução vira uma função pura testada.
2. **Os 6 helpers `get*NavigationTarget()` são apagados, não convertidos.** Com `ShellNavigationTarget` virando `string`, `getDashboardNavigationTarget()` seria um sinônimo de `'/painel'`. Os call sites passam a usar `paths.*` direto e `appShellViewModel.test.ts` perde o teste correspondente (o teste dos paths vive em `appRoutes.test.ts`).

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/application/appRoutes.ts` | Tudo que decide rota, puro: builders de path, guards, título por path, itens de sidebar, tradução `Page` legado → path. |
| `src/application/appRoutes.test.ts` | Testes do acima (runner do Node). |
| `src/application/agendaViewModel.ts` | `buildAgendaItems()` — próximas sessões + rodadas de liga, cross-comunidades. |
| `src/application/agendaViewModel.test.ts` | Testes do acima. |
| `src/components/agenda/AgendaView.tsx` | Tela da Agenda: lista apresentacional por props (padrão `RankingModule`/`TournamentsModule`, sem `ScreenContract`). |
| `src/app/shellContext.ts` | Tipo `ShellApi` + `useShell()` sobre `useOutletContext`. |
| `src/app/AppShell.tsx` | Extrato não-rota do `App.tsx`: hooks de domínio, cloud sync, sidebar, header, motion, `<Suspense>`, `<Outlet context>`, `VutRevealModal`. |
| `src/app/AppRouterV7.tsx` | Árvore de rotas nova. Vira `AppRouter.tsx` no cutover. |
| `src/app/AppRouterV7.spec.tsx` | Specs de rota/guard (Vitest). Vira `AppRouter.spec.tsx` no cutover. |
| `src/app/routes/globalRoutes.tsx` | `/painel`, `/agenda`, `/comunidades`, `/perfil`, `/perfil/sync`, `/admin`, `/sessao/ativa`. |
| `src/app/routes/communityRoutes.tsx` | `CommunityShell`, índice, `/pessoas`, `/pessoas/editar-atleta/:playerId`, `/desempenho`, `/gestao`. |
| `src/app/routes/sessionRoutes.tsx` | `/sessoes`, `/sessoes/nova`, `/sessoes/ativa`, `/sessoes/torneios`, `/sessoes/:sessionId`. |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/main.tsx` | Flag de entrypoint escolhendo `AppRouter` ou `AppRouterV7`; removida no cutover. |
| `src/application/appShellViewModel.ts` | Remove `ShellNavigationTarget` e os 6 helpers; `Page`/`Module`/`getCurrentPageTitle`/`getModuleNavigationTarget`/`getModuleNavigationItems` sobrevivem até o cutover e morrem lá. |
| `src/application/appShellViewModel.test.ts` | Remove o teste dos 6 helpers (tarefa 1) e o resto no cutover. |
| `src/application/sessionLifecycleUseCases.ts` | `buildManualSessionDraft`/`buildManualSessionStartResult` aceitam `communityId`. |
| `src/application/sessionLifecycleUseCases.test.ts` | Teste do `communityId` estampado. |
| `src/application/screens/communitiesView/communitiesViewModel.ts` | `selectedCommunityId: string \| null` e `initialCommunityTab?: CommunityTab`. |
| `src/application/screens/communitiesView/communitiesViewIntents.ts` | `{ kind: 'selectCommunity'; communityId: string \| null }`. |
| `src/application/screens/communitiesView/communitiesViewContract.ts` | Repassa os dois campos novos e a intent nova. |
| `src/components/community/CommunitiesView.tsx` | `selectedCommunityId` deixa de ser `useState` e vem do modelo; aba inicial do detalhe vem do modelo. |
| `src/app/AppRouter.tsx`, `src/App.tsx` | Deletados/substituídos no cutover (tarefa 11). |

---

## Task 1: Camada pura de rotas (`appRoutes.ts`)

**Files:**
- Create: `src/application/appRoutes.ts`
- Create: `src/application/appRoutes.test.ts`
- Modify: `src/application/appShellViewModel.ts` (remove `ShellNavigationTarget` e os 6 helpers)
- Modify: `src/application/appShellViewModel.test.ts` (remove o teste `specific shell navigation targets describe common routes`)
- Modify: `src/App.tsx` (call sites dos helpers removidos passam a usar `paths.*`)

**Interfaces:**
- Produces: `paths` (objeto de builders), `NEW_PLAYER_ID`, `RouteResolution`, `resolveCommunityRoute`, `resolveLiveSessionRoute`, `resolveLegacyLiveSessionRoute`, `resolveAdminRoute`, `resolveWizardRoute`, `resolveNewSessionPath`, `resolveBackTarget`, `pathForLegacyPage`, `getPageTitleForPath`, `getShellNavigationItems`, `extractCommunityId`, `LIVE_SESSION_PHASES`, tipo `ShellNavItem`.
- Consumes: `OperationalPhase` de `@domain/sessionPhase`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/application/appRoutes.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_PLAYER_ID,
  extractCommunityId,
  getPageTitleForPath,
  getShellNavigationItems,
  pathForLegacyPage,
  paths,
  resolveAdminRoute,
  resolveBackTarget,
  resolveCommunityRoute,
  resolveLegacyLiveSessionRoute,
  resolveLiveSessionRoute,
  resolveNewSessionPath,
  resolveWizardRoute,
} from './appRoutes';

test('paths monta as rotas globais e as aninhadas de comunidade', () => {
  assert.equal(paths.painel, '/painel');
  assert.equal(paths.agenda, '/agenda');
  assert.equal(paths.comunidades, '/comunidades');
  assert.equal(paths.perfil, '/perfil');
  assert.equal(paths.perfilSync, '/perfil/sync');
  assert.equal(paths.admin, '/admin');
  assert.equal(paths.sessaoAtivaSemComunidade, '/sessao/ativa');
  assert.equal(paths.comunidade('c1'), '/comunidades/c1');
  assert.equal(paths.sessoes('c1'), '/comunidades/c1/sessoes');
  assert.equal(paths.sessaoNova('c1'), '/comunidades/c1/sessoes/nova');
  assert.equal(paths.sessaoNova('c1', 'tournament'), '/comunidades/c1/sessoes/nova?tipo=torneio');
  assert.equal(paths.sessaoAtiva('c1'), '/comunidades/c1/sessoes/ativa');
  assert.equal(paths.torneios('c1'), '/comunidades/c1/sessoes/torneios');
  assert.equal(paths.sessao('c1', 's9'), '/comunidades/c1/sessoes/s9');
  assert.equal(paths.pessoas('c1'), '/comunidades/c1/pessoas');
  assert.equal(paths.atleta('c1', 'p7'), '/comunidades/c1/pessoas/editar-atleta/p7');
  assert.equal(paths.atleta('c1', NEW_PLAYER_ID), '/comunidades/c1/pessoas/editar-atleta/novo');
  assert.equal(paths.gestao('c1'), '/comunidades/c1/gestao');
});

test('desempenho carrega aba e sessão como query deep-linkável', () => {
  assert.equal(paths.desempenho('c1'), '/comunidades/c1/desempenho');
  assert.equal(paths.desempenho('c1', { aba: 'historico' }), '/comunidades/c1/desempenho?aba=historico');
  assert.equal(
    paths.desempenho('c1', { sessao: 's9' }),
    '/comunidades/c1/desempenho?aba=historico&sessao=s9',
  );
});

test('extractCommunityId só reconhece o id dentro de /comunidades/:id', () => {
  assert.equal(extractCommunityId('/comunidades/c1/pessoas'), 'c1');
  assert.equal(extractCommunityId('/comunidades/c1'), 'c1');
  assert.equal(extractCommunityId('/comunidades'), null);
  assert.equal(extractCommunityId('/painel'), null);
});

test('resolveCommunityRoute manda para a lista quando o id não existe', () => {
  assert.deepEqual(resolveCommunityRoute({ communityId: 'c1', communityIds: ['c1'] }), {
    kind: 'ok',
  });
  assert.deepEqual(resolveCommunityRoute({ communityId: 'c9', communityIds: ['c1'] }), {
    kind: 'redirect',
    to: '/comunidades',
  });
  assert.deepEqual(resolveCommunityRoute({ communityIds: ['c1'] }), {
    kind: 'redirect',
    to: '/comunidades',
  });
});

test('resolveLiveSessionRoute lê a fase operacional, não o status cru', () => {
  const base = { communityId: 'c1', activeSessionCommunityId: 'c1', hasActiveSession: true };
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'em_andamento' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'pausada' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'times_gerados' }), { kind: 'ok' });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'rascunho' }), {
    kind: 'redirect',
    to: '/comunidades/c1/sessoes',
  });
  assert.deepEqual(resolveLiveSessionRoute({ ...base, phase: 'encerrada' }), {
    kind: 'redirect',
    to: '/comunidades/c1/sessoes',
  });
  assert.deepEqual(
    resolveLiveSessionRoute({ ...base, hasActiveSession: false, phase: 'em_andamento' }),
    { kind: 'redirect', to: '/comunidades/c1/sessoes' },
  );
});

test('resolveLiveSessionRoute reencaminha sessão de outra comunidade e sessão órfã', () => {
  assert.deepEqual(
    resolveLiveSessionRoute({
      communityId: 'c1',
      activeSessionCommunityId: 'c2',
      hasActiveSession: true,
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/comunidades/c2/sessoes/ativa' },
  );
  assert.deepEqual(
    resolveLiveSessionRoute({
      communityId: 'c1',
      activeSessionCommunityId: null,
      hasActiveSession: true,
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/sessao/ativa' },
  );
});

test('resolveLegacyLiveSessionRoute só aceita sessão ativa sem comunidade', () => {
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: true,
      activeSessionCommunityId: null,
      phase: 'em_andamento',
    }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
      phase: 'em_andamento',
    }),
    { kind: 'redirect', to: '/comunidades/c1/sessoes/ativa' },
  );
  assert.deepEqual(
    resolveLegacyLiveSessionRoute({
      hasActiveSession: false,
      activeSessionCommunityId: null,
      phase: 'rascunho',
    }),
    { kind: 'redirect', to: '/painel' },
  );
});

test('resolveAdminRoute é staff-only', () => {
  assert.deepEqual(resolveAdminRoute({ isStaff: true }), { kind: 'ok' });
  assert.deepEqual(resolveAdminRoute({ isStaff: false }), { kind: 'redirect', to: '/painel' });
});

test('resolveWizardRoute cria rascunho, adota sessão órfã e reencaminha a de outra comunidade', () => {
  assert.deepEqual(resolveWizardRoute({ communityId: 'c1', hasActiveSession: false }), {
    kind: 'create',
  });
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: null,
    }),
    { kind: 'adopt' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c1',
    }),
    { kind: 'ok' },
  );
  assert.deepEqual(
    resolveWizardRoute({
      communityId: 'c1',
      hasActiveSession: true,
      activeSessionCommunityId: 'c2',
    }),
    { kind: 'redirect', to: '/comunidades/c2/sessoes/nova' },
  );
});

test('resolveNewSessionPath só entra direto quando existe uma única comunidade', () => {
  assert.equal(resolveNewSessionPath({ communityIds: ['c1'] }), '/comunidades/c1/sessoes/nova');
  assert.equal(
    resolveNewSessionPath({ communityIds: ['c1'], type: 'tournament' }),
    '/comunidades/c1/sessoes/nova?tipo=torneio',
  );
  assert.equal(resolveNewSessionPath({ communityIds: [] }), '/comunidades');
  assert.equal(resolveNewSessionPath({ communityIds: ['c1', 'c2'] }), '/comunidades');
});

test('resolveBackTarget não joga o usuário para fora do app em deep link', () => {
  assert.deepEqual(resolveBackTarget({ locationKey: 'abc123', fallbackPath: '/comunidades/c1/pessoas' }), {
    kind: 'history',
  });
  assert.deepEqual(resolveBackTarget({ locationKey: 'default', fallbackPath: '/comunidades/c1/pessoas' }), {
    kind: 'path',
    to: '/comunidades/c1/pessoas',
  });
});

test('pathForLegacyPage traduz as páginas que o wizard ainda emite', () => {
  assert.equal(pathForLegacyPage('session-wizard', 'c1'), '/comunidades/c1/sessoes/nova');
  assert.equal(pathForLegacyPage('session-active', 'c1'), '/comunidades/c1/sessoes/ativa');
  assert.equal(pathForLegacyPage('session-active', null), '/sessao/ativa');
  assert.equal(pathForLegacyPage('dashboard', 'c1'), '/painel');
  assert.equal(pathForLegacyPage('players', 'c1'), '/comunidades/c1/pessoas');
  assert.equal(pathForLegacyPage('players', null), '/comunidades');
});

test('getPageTitleForPath deriva o título da URL', () => {
  assert.equal(getPageTitleForPath('/painel'), 'Painel de Controle');
  assert.equal(getPageTitleForPath('/agenda'), 'Agenda');
  assert.equal(getPageTitleForPath('/comunidades'), 'Comunidades');
  assert.equal(getPageTitleForPath('/comunidades/c1'), 'Visão Geral da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes'), 'Sessões');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/nova'), 'Configuração da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/ativa'), 'Sessão em Andamento');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/torneios'), 'Torneios & Campeonatos');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9'), 'Detalhe da Sessão');
  assert.equal(getPageTitleForPath('/comunidades/c1/pessoas'), 'Pessoas');
  assert.equal(
    getPageTitleForPath('/comunidades/c1/pessoas/editar-atleta/p7'),
    'Perfil do Atleta',
  );
  assert.equal(getPageTitleForPath('/comunidades/c1/desempenho'), 'Desempenho');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao'), 'Gestão da Comunidade');
  assert.equal(getPageTitleForPath('/perfil'), 'Meu Perfil');
  assert.equal(getPageTitleForPath('/perfil/sync'), 'Sincronização & Backup Nuvem');
  assert.equal(getPageTitleForPath('/admin'), 'Administração da Plataforma');
  assert.equal(getPageTitleForPath('/sessao/ativa'), 'Sessão em Andamento');
  assert.equal(getPageTitleForPath('/rota/que/nao/existe'), 'Panelinha');
});

test('sidebar global lista as áreas aprovadas e marca a ativa', () => {
  const items = getShellNavigationItems({
    pathname: '/agenda',
    isStaff: false,
    pendingChanges: 3,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, to: item.to, active: item.active, badge: item.badge })),
    [
      { id: 'painel', to: '/painel', active: false, badge: undefined },
      { id: 'agenda', to: '/agenda', active: true, badge: undefined },
      { id: 'comunidades', to: '/comunidades', active: false, badge: undefined },
      { id: 'perfil', to: '/perfil', active: false, badge: 3 },
    ],
  );
});

test('sidebar global expõe administração só para staff', () => {
  const items = getShellNavigationItems({ pathname: '/painel', isStaff: true, pendingChanges: 0 });
  assert.equal(items.at(-1)?.id, 'admin');
  assert.equal(items.at(-1)?.to, '/admin');
});

test('sidebar dentro da comunidade troca para as 5 áreas mais a volta', () => {
  const items = getShellNavigationItems({
    pathname: '/comunidades/c1/pessoas/editar-atleta/p7',
    isStaff: true,
    pendingChanges: 0,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, to: item.to, active: item.active })),
    [
      { id: 'comunidade-visao-geral', to: '/comunidades/c1', active: false },
      { id: 'comunidade-sessoes', to: '/comunidades/c1/sessoes', active: false },
      { id: 'comunidade-pessoas', to: '/comunidades/c1/pessoas', active: true },
      { id: 'comunidade-desempenho', to: '/comunidades/c1/desempenho', active: false },
      { id: 'comunidade-gestao', to: '/comunidades/c1/gestao', active: false },
      { id: 'voltar-comunidades', to: '/comunidades', active: false },
    ],
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
node --import tsx --test src/application/appRoutes.test.ts
```

Esperado: FAIL — `Cannot find module './appRoutes'`.

- [ ] **Step 3: Implementar `appRoutes.ts`**

Criar `src/application/appRoutes.ts`:

```ts
import type { OperationalPhase } from '@domain/sessionPhase';

export const NEW_PLAYER_ID = 'novo';

export const LIVE_SESSION_PHASES: OperationalPhase[] = [
  'times_gerados',
  'pronta',
  'entre_partidas',
  'em_andamento',
  'pausada',
];

export const paths = {
  painel: '/painel',
  agenda: '/agenda',
  comunidades: '/comunidades',
  perfil: '/perfil',
  perfilSync: '/perfil/sync',
  admin: '/admin',
  sessaoAtivaSemComunidade: '/sessao/ativa',
  comunidade: (communityId: string) => `/comunidades/${communityId}`,
  sessoes: (communityId: string) => `/comunidades/${communityId}/sessoes`,
  sessaoNova: (communityId: string, type?: 'tournament' | 'free_play') =>
    type === 'tournament'
      ? `/comunidades/${communityId}/sessoes/nova?tipo=torneio`
      : `/comunidades/${communityId}/sessoes/nova`,
  sessaoAtiva: (communityId: string) => `/comunidades/${communityId}/sessoes/ativa`,
  torneios: (communityId: string) => `/comunidades/${communityId}/sessoes/torneios`,
  sessao: (communityId: string, sessionId: string) =>
    `/comunidades/${communityId}/sessoes/${sessionId}`,
  pessoas: (communityId: string) => `/comunidades/${communityId}/pessoas`,
  atleta: (communityId: string, playerId: string) =>
    `/comunidades/${communityId}/pessoas/editar-atleta/${playerId}`,
  desempenho: (
    communityId: string,
    options?: { aba?: 'ranking' | 'historico'; sessao?: string },
  ) => {
    const base = `/comunidades/${communityId}/desempenho`;
    const query = new URLSearchParams();
    if (options?.sessao) {
      query.set('aba', 'historico');
      query.set('sessao', options.sessao);
    } else if (options?.aba) {
      query.set('aba', options.aba);
    }
    const suffix = query.toString();
    return suffix ? `${base}?${suffix}` : base;
  },
  gestao: (communityId: string) => `/comunidades/${communityId}/gestao`,
} as const;

export type RouteResolution = { kind: 'ok' } | { kind: 'redirect'; to: string };

function segmentsOf(pathname: string): string[] {
  return pathname.split('?')[0].split('/').filter(Boolean);
}

export function extractCommunityId(pathname: string): string | null {
  const segments = segmentsOf(pathname);
  if (segments[0] !== 'comunidades' || !segments[1]) return null;
  return segments[1];
}

export function resolveCommunityRoute(input: {
  communityId?: string;
  communityIds: string[];
}): RouteResolution {
  if (input.communityId && input.communityIds.includes(input.communityId)) return { kind: 'ok' };
  return { kind: 'redirect', to: paths.comunidades };
}

export function resolveLiveSessionRoute(input: {
  communityId: string;
  activeSessionCommunityId?: string | null;
  hasActiveSession: boolean;
  phase: OperationalPhase;
}): RouteResolution {
  if (!input.hasActiveSession || !LIVE_SESSION_PHASES.includes(input.phase)) {
    return { kind: 'redirect', to: paths.sessoes(input.communityId) };
  }
  const owner = input.activeSessionCommunityId ?? null;
  if (owner === null) return { kind: 'redirect', to: paths.sessaoAtivaSemComunidade };
  if (owner !== input.communityId) return { kind: 'redirect', to: paths.sessaoAtiva(owner) };
  return { kind: 'ok' };
}

export function resolveLegacyLiveSessionRoute(input: {
  activeSessionCommunityId?: string | null;
  hasActiveSession: boolean;
  phase: OperationalPhase;
}): RouteResolution {
  if (!input.hasActiveSession || !LIVE_SESSION_PHASES.includes(input.phase)) {
    return { kind: 'redirect', to: paths.painel };
  }
  const owner = input.activeSessionCommunityId ?? null;
  if (owner !== null) return { kind: 'redirect', to: paths.sessaoAtiva(owner) };
  return { kind: 'ok' };
}

export function resolveAdminRoute(input: { isStaff: boolean }): RouteResolution {
  return input.isStaff ? { kind: 'ok' } : { kind: 'redirect', to: paths.painel };
}

export function resolveWizardRoute(input: {
  communityId: string;
  hasActiveSession: boolean;
  activeSessionCommunityId?: string | null;
}): { kind: 'create' | 'adopt' | 'ok' } | { kind: 'redirect'; to: string } {
  if (!input.hasActiveSession) return { kind: 'create' };
  const owner = input.activeSessionCommunityId ?? null;
  if (owner === null) return { kind: 'adopt' };
  if (owner === input.communityId) return { kind: 'ok' };
  return { kind: 'redirect', to: paths.sessaoNova(owner) };
}

export function resolveNewSessionPath(input: {
  communityIds: string[];
  type?: 'tournament' | 'free_play';
}): string {
  if (input.communityIds.length === 1) return paths.sessaoNova(input.communityIds[0], input.type);
  return paths.comunidades;
}

export function resolveBackTarget(input: {
  locationKey: string;
  fallbackPath: string;
}): { kind: 'history' } | { kind: 'path'; to: string } {
  if (input.locationKey === 'default') return { kind: 'path', to: input.fallbackPath };
  return { kind: 'history' };
}

export type LegacyPage =
  | 'dashboard'
  | 'players'
  | 'player-edit'
  | 'session-wizard'
  | 'session-active'
  | 'history'
  | 'communities';

export function pathForLegacyPage(page: LegacyPage, communityId: string | null): string {
  switch (page) {
    case 'session-wizard':
      return communityId ? paths.sessaoNova(communityId) : paths.comunidades;
    case 'session-active':
      return communityId ? paths.sessaoAtiva(communityId) : paths.sessaoAtivaSemComunidade;
    case 'players':
      return communityId ? paths.pessoas(communityId) : paths.comunidades;
    case 'player-edit':
      return communityId ? paths.atleta(communityId, NEW_PLAYER_ID) : paths.comunidades;
    case 'history':
      return communityId ? paths.desempenho(communityId, { aba: 'historico' }) : paths.painel;
    case 'communities':
      return paths.comunidades;
    case 'dashboard':
    default:
      return paths.painel;
  }
}

export function getPageTitleForPath(pathname: string): string {
  const segments = segmentsOf(pathname);
  if (segments.length === 0 || segments[0] === 'painel') return 'Painel de Controle';
  if (segments[0] === 'agenda') return 'Agenda';
  if (segments[0] === 'perfil') return segments[1] === 'sync' ? 'Sincronização & Backup Nuvem' : 'Meu Perfil';
  if (segments[0] === 'admin') return 'Administração da Plataforma';
  if (segments[0] === 'sessao' && segments[1] === 'ativa') return 'Sessão em Andamento';
  if (segments[0] !== 'comunidades') return 'Panelinha';
  if (segments.length === 1) return 'Comunidades';
  if (segments.length === 2) return 'Visão Geral da Comunidade';

  switch (segments[2]) {
    case 'sessoes':
      if (segments.length === 3) return 'Sessões';
      if (segments[3] === 'nova') return 'Configuração da Sessão';
      if (segments[3] === 'ativa') return 'Sessão em Andamento';
      if (segments[3] === 'torneios') return 'Torneios & Campeonatos';
      return 'Detalhe da Sessão';
    case 'pessoas':
      return segments[3] === 'editar-atleta' ? 'Perfil do Atleta' : 'Pessoas';
    case 'desempenho':
      return 'Desempenho';
    case 'gestao':
      return 'Gestão da Comunidade';
    default:
      return 'Panelinha';
  }
}

export interface ShellNavItem {
  id: string;
  label: string;
  icon: 'dashboard' | 'tournament' | 'players' | 'ranking' | 'history' | 'cloud' | 'settings' | 'admin';
  to: string;
  active: boolean;
  badge?: number;
}

export function getShellNavigationItems(input: {
  pathname: string;
  isStaff: boolean;
  pendingChanges: number;
}): ShellNavItem[] {
  const communityId = extractCommunityId(input.pathname);
  const path = input.pathname.split('?')[0];

  if (communityId) {
    const area = segmentsOf(path)[2] ?? null;
    return [
      {
        id: 'comunidade-visao-geral',
        label: 'Visão geral',
        icon: 'dashboard',
        to: paths.comunidade(communityId),
        active: area === null,
      },
      {
        id: 'comunidade-sessoes',
        label: 'Sessões',
        icon: 'tournament',
        to: paths.sessoes(communityId),
        active: area === 'sessoes',
      },
      {
        id: 'comunidade-pessoas',
        label: 'Pessoas',
        icon: 'players',
        to: paths.pessoas(communityId),
        active: area === 'pessoas',
      },
      {
        id: 'comunidade-desempenho',
        label: 'Desempenho',
        icon: 'ranking',
        to: paths.desempenho(communityId),
        active: area === 'desempenho',
      },
      {
        id: 'comunidade-gestao',
        label: 'Gestão',
        icon: 'settings',
        to: paths.gestao(communityId),
        active: area === 'gestao',
      },
      {
        id: 'voltar-comunidades',
        label: 'Comunidades',
        icon: 'history',
        to: paths.comunidades,
        active: false,
      },
    ];
  }

  const items: ShellNavItem[] = [
    { id: 'painel', label: 'Início', icon: 'dashboard', to: paths.painel, active: path === paths.painel },
    { id: 'agenda', label: 'Agenda', icon: 'history', to: paths.agenda, active: path === paths.agenda },
    {
      id: 'comunidades',
      label: 'Comunidades',
      icon: 'players',
      to: paths.comunidades,
      active: path === paths.comunidades,
    },
    {
      id: 'perfil',
      label: 'Meu perfil',
      icon: 'cloud',
      to: paths.perfil,
      active: path.startsWith(paths.perfil),
      badge: input.pendingChanges > 0 ? input.pendingChanges : undefined,
    },
  ];

  if (input.isStaff) {
    items.push({
      id: 'admin',
      label: 'Administração',
      icon: 'admin',
      to: paths.admin,
      active: path === paths.admin,
    });
  }

  return items;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
node --import tsx --test src/application/appRoutes.test.ts
```

Esperado: PASS, 16 testes.

- [ ] **Step 5: Apagar os 6 helpers antigos e o teste deles**

Em `src/application/appShellViewModel.ts`, remover o bloco de `export interface ShellNavigationTarget` até `getHistorySessionNavigationTarget` inclusive (linhas 118–146). Manter `Page`, `Module`, `getCurrentPageTitle`, `getAccountDisplay`, `getModuleNavigationItems`, `getModuleNavigationTarget` e `buildPendingDeliveryNotice`.

Em `src/application/appShellViewModel.test.ts`, remover o teste `specific shell navigation targets describe common routes` (linhas 80–104) e os imports `getCommunitiesNavigationTarget`, `getDashboardNavigationTarget`, `getHistoryNavigationTarget`, `getHistorySessionNavigationTarget`, `getLiveSessionNavigationTarget`, `getPlayersNavigationTarget`.

Em `src/App.tsx`, remover esses seis nomes do import de `@app/appShellViewModel` e de `ShellNavigationTarget`, importar `paths` de `@app/appRoutes` e substituir os call sites — o `applyShellNavigationTarget` do `App.tsx` continua existindo até o cutover, então ele passa a receber um objeto montado localmente:

```tsx
import { paths } from '@app/appRoutes';
```

Substituições no `App.tsx` (o `App.tsx` legado ainda navega por state; estes call sites só perdem o helper):

| Antes | Depois |
|---|---|
| `applyShellNavigationTarget(getDashboardNavigationTarget())` | `applyShellNavigationTarget({ activeModule: 'dashboard', page: 'dashboard' })` |
| `applyShellNavigationTarget(getPlayersNavigationTarget())` | `applyShellNavigationTarget({ activeModule: 'players', page: 'players' })` |
| `applyShellNavigationTarget(getCommunitiesNavigationTarget())` | `applyShellNavigationTarget({ activeModule: 'players', page: 'communities' })` |
| `applyShellNavigationTarget(getLiveSessionNavigationTarget())` | `applyShellNavigationTarget({ activeModule: 'dashboard', page: 'session-active' })` |
| `applyShellNavigationTarget(getHistoryNavigationTarget())` | `applyShellNavigationTarget({ activeModule: 'historico' })` |
| `applyShellNavigationTarget(getHistorySessionNavigationTarget(sessionId))` | `applyShellNavigationTarget({ activeModule: 'historico', selectedHistorySessionId: sessionId })` |
| `applyShellNavigationTarget(getHistorySessionNavigationTarget(tournament.id))` | `applyShellNavigationTarget({ activeModule: 'historico', selectedHistorySessionId: tournament.id })` |

E o tipo local do `applyShellNavigationTarget` no `App.tsx` deixa de importar `ShellNavigationTarget` e passa a ser inline:

```tsx
  const applyShellNavigationTarget = (target: {
    activeModule: Module;
    page?: Page;
    selectedHistorySessionId?: string | null;
  }) => {
    setActiveModule(target.activeModule);
    if (target.page) setPage(target.page);
    if (target.selectedHistorySessionId !== undefined) {
      setSelectedHistorySessionId(target.selectedHistorySessionId);
    }
  };
```

O import de `paths` no `App.tsx` fica sem uso nesta tarefa — **não adicione ainda**; ele entra na tarefa 11. Remova a linha `import { paths } from '@app/appRoutes';` se você a tiver adicionado.

- [ ] **Step 6: Verificar a suíte inteira**

```bash
npm run lint && npm run test:unit && npm run test:ui
```

Esperado: `tsc --noEmit` sem saída; unit com 16 testes a mais e 1 a menos (net +15) e nenhum falho; UI 139 passando.

- [ ] **Step 7: Formatar e commitar**

```bash
npx prettier@3.8.4 --check src/application/appRoutes.ts src/application/appRoutes.test.ts src/application/appShellViewModel.ts src/application/appShellViewModel.test.ts src/App.tsx
```

```bash
git add src/application/appRoutes.ts src/application/appRoutes.test.ts src/application/appShellViewModel.ts src/application/appShellViewModel.test.ts src/App.tsx && git commit -m "plano-5 fase 3: camada pura de rotas (appRoutes)"
```

---

## Task 2: `AppShell` + `AppRouterV7` atrás da flag (smoke da montagem)

Esta tarefa é o teste de fogo: prova que o shell inteiro (todos os hooks de domínio, cloud sync, sidebar, header) monta sob Vitest. Se explodir, é aqui que se descobre — antes de 9 rotas dependerem disso.

**Files:**
- Create: `src/app/shellContext.ts`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppRouterV7.tsx`
- Create: `src/app/AppRouterV7.spec.tsx`
- Create: `src/app/routes/globalRoutes.tsx` (só `PainelRoute` nesta tarefa)
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `paths`, `getPageTitleForPath`, `getShellNavigationItems`, `pathForLegacyPage`, `resolveNewSessionPath` de `@app/appRoutes` (Task 1).
- Produces: `ShellApi` e `useShell()` (`src/app/shellContext.ts`), `AppShell`, `AppRouterV7`, `PainelRoute`. Todas as tarefas seguintes montam rotas dentro do `<Route element={<AppShell />}>` e leem estado por `useShell()`.

- [ ] **Step 1: Escrever a spec que falha**

Criar `src/app/AppRouterV7.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@app/authClient';
import type { AuthSessionContextValue } from './auth/useAuthSession';
import { ToastProvider } from '@ui/common/ToastProvider';
import { SessionProvider } from '@ui/common/SessionProvider';

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./auth/useAuthSession', () => ({
  useAuthSession: () => authSessionMock.current,
}));

import { AppRouterV7 } from './AppRouterV7';

const stubAuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  linkGoogleIdentity: async () => {},
  requestPasswordRecovery: async () => {},
  updatePassword: async () => {},
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
  signOutOthers: async () => {},
  enrollTotp: async () => ({ factorId: '', qrCode: '', secret: '' }),
  verifyTotp: async () => {},
} as unknown as AuthClient;

export const readyState: AuthSessionState = {
  kind: 'ready',
  userId: 'u1',
  account: {
    state: 'ready',
    profile: {
      id: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'user',
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    },
    playerId: 'p1',
    username: 'ana',
    requiresAal2: false,
  },
};

export function seedLocalDb(input: {
  communities?: Partial<Community>[];
  players?: Partial<Player>[];
  sessions?: Partial<Session>[];
}) {
  localStorage.setItem(
    'vpg_communities',
    JSON.stringify(
      (input.communities ?? []).map((community) => ({
        id: 'c1',
        name: 'Panelinha',
        description: null,
        archived: false,
        defaultFormat: 'free_play',
        defaultDay: null,
        defaultStartTime: null,
        defaultEndTime: null,
        defaultLocation: null,
        ownerId: 'u1',
        recurrenceRule: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...community,
      })),
    ),
  );
  localStorage.setItem('vpg_players', JSON.stringify(input.players ?? []));
  localStorage.setItem('vpg_sessions', JSON.stringify(input.sessions ?? []));
}

afterEach(() => {
  localStorage.clear();
});

export function renderAppV7(path: string, state: AuthSessionState = readyState) {
  authSessionMock.current = {
    state,
    session: null,
    account: null,
    authClient: stubAuthClient,
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SessionProvider>
          <AppRouterV7 />
        </SessionProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('AppRouterV7 — shell', () => {
  it('monta o shell e o painel em /painel', async () => {
    renderAppV7('/painel');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('redireciona a raiz para /painel', async () => {
    renderAppV7('/');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('manda rota desconhecida para /painel', async () => {
    renderAppV7('/rota-que-nao-existe');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('mostra os itens globais da sidebar', async () => {
    renderAppV7('/painel');
    expect(await screen.findByRole('link', { name: /agenda/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /comunidades/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /meu perfil/i })).toBeTruthy();
  });

  it('não monta o app protegido quando a sessão não está pronta', () => {
    renderAppV7('/painel', { kind: 'onboarding', userId: 'u1', playerId: 'p1' });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });
});
```

Imports adicionais no topo do arquivo: `afterEach` de `vitest` e `import type { Community, Player, Session } from '@shared/types';`.

`seedLocalDb` existe porque os hooks de domínio (`useCommunities`, `usePlayers`, `useSessions`) inicializam o state a partir do `localStorage` no mount — semear antes do `render` é o que dá dados às rotas de comunidade nas Tasks 5–9. **Chame sempre `seedLocalDb(...)` antes de `renderAppV7(...)`**, nunca depois. O `afterEach` que limpa o `localStorage` é obrigatório: sem ele um teste vaza comunidade para o seguinte e os guards de "comunidade inexistente" passam a testar outra coisa.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL — `Failed to resolve import "./AppRouterV7"`.

- [ ] **Step 3: Criar `shellContext.ts`**

```ts
import { useOutletContext } from 'react-router';
import type { Community, CommunityRules, Player } from '@shared/types';
import type { AppResult } from '@app/appResult';
import type { SessionContextValue } from '@ui/common/useSession';
import type { usePlayers } from '../hooks/usePlayers';
import type { useCommunities } from '../hooks/useCommunities';
import type { useCommunityPresence } from '../hooks/useCommunityPresence';
import type { useCommunityRules } from '../hooks/useCommunityRules';
import type { useWhatsAppListTemplates } from '../hooks/useWhatsAppListTemplates';
import type { useChampionships } from '../hooks/useChampionships';
import type { useAuth } from '../hooks/useAuth';
import type { useToast } from '@ui/common/useToast';
import type { useCloudSync } from '../hooks/useCloudSync';
import type { useSessionWizard } from '../hooks/useSessionWizard';
import type { SessionDraft } from '../logic/sessionDraft';

export interface ShellApi {
  sess: SessionContextValue;
  play: ReturnType<typeof usePlayers>;
  comm: ReturnType<typeof useCommunities>;
  communityPresence: ReturnType<typeof useCommunityPresence>;
  communityRules: ReturnType<typeof useCommunityRules>;
  whatsAppLists: ReturnType<typeof useWhatsAppListTemplates>;
  championships: ReturnType<typeof useChampionships>;
  auth: ReturnType<typeof useAuth>;
  toasts: ReturnType<typeof useToast>;
  cloudSync: ReturnType<typeof useCloudSync>;
  wizard: ReturnType<typeof useSessionWizard>;
  currentDeviceId: string;
  sessionDraft: SessionDraft | null;
  pendingChanges: number;
  handleExportBackup: () => void;
  handleImportBackup: (file: File) => void;
  handleFinishSession: () => void;
  createSessionFromCommunity: (
    community: Community,
    playerIds: string[],
    rules: CommunityRules,
  ) => void;
  createPlayerForCommunity: (name: string, communityId: string) => void;
  materializeChampionshipRound: (roundId: string) => AppResult<{ sessionId: string }>;
  deleteChampionshipAggregate: (championshipId: string) => void;
  deleteCommunityAggregate: (communityId: string) => void;
  handlePlayerEditActionError: (error: unknown) => void;
  applyGuestPlayer: (player: Player, editDetails: boolean) => void;
}

export function useShell(): ShellApi {
  return useOutletContext<ShellApi>();
}
```

`SessionDraft` é exportado por `src/logic/sessionDraft.ts:5` — importe o tipo de lá.

- [ ] **Step 4: Criar `AppShell.tsx`**

`AppShell` é o `App.tsx` **sem** `page`/`activeModule`/`renderActiveContent`. Copie do `App.tsx` atual, na íntegra e sem reescrever a lógica: os imports de hooks (linhas 19–31), o corpo de `useCloudSync` (213–246), `pendingChanges` (250–286), `pendingDeliveryNotice` (288–292), o `useEffect` de auto-sync (301–313), `handleExportBackup` (317–352), `handleImportBackup` (354–416) **trocando o `setPage('dashboard'); setActiveModule('dashboard')` final por `navigate(paths.painel)`**, `createSessionFromCommunity` (431–447) **trocando o `setPage`/`setActiveModule` finais por `navigate(paths.sessaoNova(community.id))`**, `createPlayerForCommunity`, `materializeChampionshipRound`, `clearChampionshipTeamBridges`, `deleteChampionshipAggregate`, `deleteChampionshipsForCommunity`, o `useEffect` de draft (531–533), `handleFinishSession` (537–598) **trocando os dois setters finais por `navigate(paths.painel)`**, e `handlePlayerEditActionError`.

```tsx
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart3,
  Cloud,
  LayoutDashboard,
  Medal,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

import {
  getPageTitleForPath,
  getShellNavigationItems,
  paths,
  pathForLegacyPage,
  type ShellNavItem,
} from '@app/appRoutes';
import { derivePhase, PHASE_LABEL } from '@domain/sessionPhase';
import { ToastViewport } from '@ui/common/ToastViewport';
import { VutRevealModal, RevealItem } from '../components/player/VutRevealModal';
import type { ShellApi } from './shellContext';
// … demais imports copiados de src/App.tsx (hooks, use cases, storage, tipos)

const navigationIconByKey: Record<ShellNavItem['icon'], ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  tournament: <Trophy className="w-5 h-5" />,
  players: <Users className="w-5 h-5" />,
  ranking: <Medal className="w-5 h-5" />,
  history: <BarChart3 className="w-5 h-5" />,
  cloud: <Cloud className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
  admin: <ShieldCheck className="w-5 h-5" />,
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionDraft, setSessionDraft] = useState(() => loadSessionDraft());
  const [revealQueue, setRevealQueue] = useState<RevealItem[]>([]);

  const auth = useAuth();
  const toasts = useToast();
  const sess = useSession();
  const play = usePlayers(sess.games, sess.pointEvents, sess.teams);
  const comm = useCommunities();
  const communityPresence = useCommunityPresence();
  const communityRules = useCommunityRules();
  const whatsAppLists = useWhatsAppListTemplates();
  const championships = useChampionships();
  const operationalPhase = derivePhase(sess.activeSession, sess.games);
  const [currentDeviceId] = useState(getOrCreateDeviceId);

  const activeCommunityId = sess.activeSession?.communityId ?? null;

  const wizard = useSessionWizard({
    players: play.players,
    activeSession: sess.activeSession,
    setActiveSession: sess.setActiveSession,
    setSessions: sess.setSessions,
    setTeams: sess.setTeams,
    games: sess.games,
    setGames: sess.setGames,
    setPage: (page) => navigate(pathForLegacyPage(page, activeCommunityId)),
    sessions: sess.sessions,
    teams: sess.teams,
  });

  // … cloudSync, pendingChanges, pendingDeliveryNotice, auto-sync effect,
  // handleExportBackup, handleImportBackup, createSessionFromCommunity,
  // createPlayerForCommunity, materializeChampionshipRound,
  // deleteChampionshipAggregate, deleteCommunityAggregate,
  // handleFinishSession, handlePlayerEditActionError, applyGuestPlayer
  // copiados de src/App.tsx conforme descrito acima.

  const navItems = getShellNavigationItems({
    pathname: location.pathname,
    isStaff: auth.isStaff,
    pendingChanges,
  });
  const headerAccount = getAccountDisplay({
    profileName: auth.profile?.name,
    email: auth.user?.email,
    fallbackName: 'Administrador',
    fallbackInitials: 'AD',
  });
  const footerAccount = getAccountDisplay({
    profileName: auth.profile?.name,
    email: auth.user?.email,
    fallbackName: 'Panelinha',
    fallbackInitials: 'PL',
  });
  const liveSessionVisible = operationalPhase !== 'rascunho' && operationalPhase !== 'encerrada';
  const liveSessionPath = activeCommunityId
    ? paths.sessaoAtiva(activeCommunityId)
    : paths.sessaoAtivaSemComunidade;

  const shell: ShellApi = {
    sess,
    play,
    comm,
    communityPresence,
    communityRules,
    whatsAppLists,
    championships,
    auth,
    toasts,
    cloudSync,
    wizard,
    currentDeviceId,
    sessionDraft,
    pendingChanges,
    handleExportBackup,
    handleImportBackup,
    handleFinishSession,
    createSessionFromCommunity,
    createPlayerForCommunity,
    materializeChampionshipRound,
    deleteChampionshipAggregate,
    deleteCommunityAggregate,
    handlePlayerEditActionError,
    applyGuestPlayer,
  };

  return (
    <div className="drawer lg:drawer-open">
      <ToastViewport toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <input id="sidebar-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-h-screen min-w-0 bg-base-100 text-base-content">
        {pendingDeliveryNotice && (
          <button
            type="button"
            onClick={() => navigate(paths.perfilSync)}
            className="w-full bg-warning/20 text-warning-content text-xs font-bold px-4 py-2 text-left"
          >
            {pendingDeliveryNotice.message} Toque para ver os detalhes.
          </button>
        )}
        <header className="h-[72px] bg-base-200 border-b border-base-300 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <label htmlFor="sidebar-drawer" className="btn btn-ghost btn-circle lg:hidden">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block h-5 w-5 stroke-current"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                ></path>
              </svg>
            </label>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-base-content">
                {getPageTitleForPath(location.pathname)}
              </h2>
              {liveSessionVisible && (
                <p className="text-[10px] text-base-content/60 font-medium mt-0.5">
                  Sessão Ativa:{' '}
                  <span className="text-primary font-bold">{sess.activeSession.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {liveSessionVisible && (
              <Link
                to={liveSessionPath}
                className="badge badge-success badge-soft gap-1.5 sm:gap-2 px-2 sm:px-3 py-3 font-black uppercase text-[9px] tracking-wider"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="hidden sm:inline">{PHASE_LABEL[operationalPhase]}</span>
              </Link>
            )}

            <div className="h-4 w-px bg-base-300" />

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-base-content uppercase hidden sm:inline">
                {headerAccount.name}
              </span>
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black uppercase text-xs">
                {headerAccount.initials}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname + location.search}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <Suspense fallback={null}>
                <Outlet context={shell} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {revealQueue.length > 0 && (
        <VutRevealModal
          isOpen={revealQueue.length > 0}
          onClose={() => setRevealQueue([])}
          revealItems={revealQueue}
        />
      )}

      <div className="drawer-side z-30">
        <label htmlFor="sidebar-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
        <aside className="w-64 bg-base-200 border-r border-base-300 h-screen flex flex-col justify-between shrink-0">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-base-content uppercase leading-none">
                  Panelinha
                </h1>
                <p className="text-[9px] text-base-content/60 font-bold tracking-wider uppercase mt-1">
                  Plataforma Esportiva
                </p>
              </div>
            </div>
            <nav className="space-y-1">
              <ul className="menu p-0">
                {navItems.map((item) => (
                  <li key={item.id} className="mb-1">
                    <Link
                      to={item.to}
                      onClick={() => {
                        const checkbox = document.getElementById(
                          'sidebar-drawer',
                        ) as HTMLInputElement;
                        if (checkbox) checkbox.checked = false;
                      }}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                        item.active
                          ? 'bg-primary! text-primary-content! shadow-lg shadow-primary/20'
                          : 'text-base-content/70 hover:text-base-content hover:bg-base-300'
                      }`}
                    >
                      {navigationIconByKey[item.icon]}
                      <span className="flex-1 text-left">{item.label}</span>
                      {!!item.badge && item.badge > 0 && (
                        <span
                          className="badge badge-sm badge-warning font-black"
                          title={`${item.badge} alteração(ões) pendente(s) de sincronização`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="p-6 border-t border-base-300 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-base-300 flex items-center justify-center text-xs font-bold uppercase">
              {footerAccount.initials}
            </div>
            <div>
              <p className="text-xs font-bold text-base-content uppercase leading-none">
                {footerAccount.name}
              </p>
              <span className="text-[9px] text-base-content/40 uppercase">v1.0.0</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

`applyGuestPlayer` no `AppShell` (extraído do `App.tsx:634-647`, agora navegando):

```tsx
  const applyGuestPlayer = (newPlayer: Player, editDetails: boolean) => {
    const result = applyGuestPlayerUpsert(play.rawPlayers, newPlayer);
    play.setPlayers(result.players);
    if (sess.activeSession) {
      const nextSelected = [
        ...new Set([...sess.activeSession.selectedPlayerIds, result.selectedPlayer.id]),
      ];
      wizard.updateSession({ selectedPlayerIds: nextSelected });
    }
    if (editDetails) {
      play.setEditingPlayer(result.selectedPlayer);
      const communityId = activeCommunityId ?? result.selectedPlayer.communityIds?.[0] ?? null;
      if (communityId) navigate(paths.atleta(communityId, result.selectedPlayer.id));
    }
  };
```

`deleteCommunityAggregate` (extraído do `onDeleteCommunity` do `App.tsx:833-851`, agora sem o `window.confirm`, que fica na rota):

```tsx
  const deleteCommunityAggregate = (communityId: string) => {
    const next = applyCommunityDeletion({
      communityId,
      communities: comm.rawCommunities,
      players: play.rawPlayers,
      presenceRecords: communityPresence.presenceRecords,
      templates: whatsAppLists.rawTemplates,
      drafts: whatsAppLists.drafts,
    });
    comm.setCommunities(next.communities);
    play.setPlayers(next.players);
    communityRules.removeRules(communityId);
    communityPresence.setPresenceRecords(next.presenceRecords);
    whatsAppLists.setTemplates(next.templates);
    whatsAppLists.setDrafts(next.drafts);
    deleteChampionshipsForCommunity(communityId);
  };
```

- [ ] **Step 5: Criar `globalRoutes.tsx` com o `PainelRoute`**

```tsx
import { lazy } from 'react';
import { useNavigate } from 'react-router';
import { paths, resolveNewSessionPath } from '@app/appRoutes';
import { buildDashboardContract } from '@app/screens/dashboard/dashboardContract';
import {
  buildActiveSessionClearResult,
  buildDraftClearResult,
} from '@app/sessionLifecycleUseCases';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';

const Dashboard = lazy(() =>
  import('../../components/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);

export function PainelRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, comm, wizard } = shell;
  const communityIds = comm.communities.map((community) => community.id);

  return (
    <Dashboard
      contract={buildDashboardContract({
        activeSession: sess.activeSession,
        sessionDraft: shell.sessionDraft,
        games: sess.games,
        onNewSession: () => navigate(resolveNewSessionPath({ communityIds })),
        onResumeSession: () =>
          navigate(
            sess.activeSession?.communityId
              ? paths.sessaoAtiva(sess.activeSession.communityId)
              : paths.sessaoAtivaSemComunidade,
          ),
        onResumeDraft: (draft) => {
          wizard.resumeDraft(draft);
          navigate(resolveNewSessionPath({ communityIds }));
        },
        onClearDraft: () => {
          if (window.confirm('Deseja realmente descartar o rascunho?')) {
            const result = buildDraftClearResult();
            clearSessionDraft();
            sess.setActiveSession(result.nextActiveSession);
          }
        },
        onClearActiveSession: () => {
          if (
            sess.activeSession &&
            window.confirm(
              'Deseja realmente descartar a sessão ativa? Todo o progresso e jogos gerados serão perdidos permanentemente.',
            )
          ) {
            const result = buildActiveSessionClearResult(sess.activeSession);
            if (!result) return;
            sess.deleteSession(result.sessionIdToDelete);
            sess.setActiveSession(result.nextActiveSession);
            clearSessionDraft();
          }
        },
        onPlayers: () => navigate(paths.comunidades),
        onHistory: () => navigate(paths.agenda),
        onExportBackup: shell.handleExportBackup,
        onImportBackup: shell.handleImportBackup,
        onCommunities: () => navigate(paths.comunidades),
      })}
    />
  );
}
```

> `onClearDraft`/`onClearActiveSession` deixaram de chamar `setSessionDraft` porque o `AppShell` já re-sincroniza o draft pelo `useEffect` existente que observa `wizard.wizardStep` e `sess.activeSession`.

- [ ] **Step 6: Criar `AppRouterV7.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { AuthGuard } from './auth/AuthGuard';
import {
  AuthTransitionPage,
  EmailVerificationPage,
  LoginPage,
  MfaChallengePage,
  MfaSetupPage,
  PasswordRecoveryPage,
  RecoverableSessionPage,
  UsernameOnboardingPage,
} from './auth/AuthPages';
import { PainelRoute } from './routes/globalRoutes';

export function AppRouterV7() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage mode="signin" />} />
      <Route path="/cadastro" element={<LoginPage mode="signup" />} />
      <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
      <Route path="/auth/callback" element={<AuthTransitionPage />} />
      <Route path="/auth/loading" element={<AuthTransitionPage />} />
      <Route path="/auth/recuperar-sessao" element={<RecoverableSessionPage />} />
      <Route path="/verificar-email" element={<EmailVerificationPage />} />
      <Route path="/escolher-username" element={<UsernameOnboardingPage />} />
      <Route path="/configurar-mfa" element={<MfaSetupPage />} />
      <Route path="/confirmar-mfa" element={<MfaChallengePage />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<PainelRoute />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 7: Rodar a spec e confirmar que passa**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: PASS, 5 testes. Se algum hook de domínio quebrar sob jsdom (cloud sync, worker, `matchMedia`), corrija **no harness da spec** (mock pontual) e registre o motivo no commit — não mude a lógica do shell para satisfazer o teste.

- [ ] **Step 8: Ligar a flag no `main.tsx`**

```tsx
import { AppRouter } from './app/AppRouter';
import { AppRouterV7 } from './app/AppRouterV7';

const navParam = new URLSearchParams(window.location.search).get('nav');
if (navParam === 'v3') sessionStorage.setItem('nav_v3', '1');
if (navParam === 'v2') sessionStorage.removeItem('nav_v3');
const useNavV3 =
  import.meta.env.VITE_NAV_V3 === 'true' || sessionStorage.getItem('nav_v3') === '1';
```

E no render: `{useNavV3 ? <AppRouterV7 /> : <AppRouter />}` no lugar de `<AppRouter />`.

- [ ] **Step 9: Verificar a suíte inteira e commitar**

```bash
npm run lint && npm run test:unit && npm run test:ui && npm run build
```

Esperado: tudo verde; UI 144 (139 + 5).

```bash
npx prettier@3.8.4 --check src/app/AppShell.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx src/app/shellContext.ts src/app/routes/globalRoutes.tsx src/main.tsx
```

```bash
git add src/app src/main.tsx && git commit -m "plano-5 fase 3: AppShell e AppRouterV7 atras da flag nav_v3"
```

---

## Task 3: Rotas globais — `/comunidades`, `/perfil`, `/perfil/sync`, `/admin`

**Files:**
- Modify: `src/app/routes/globalRoutes.tsx`
- Modify: `src/app/AppRouterV7.tsx`
- Modify: `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Consumes: `useShell()`, `paths`, `resolveAdminRoute`, `renderAppV7`/`readyState` da spec (Task 2).
- Produces: `ComunidadesRoute`, `PerfilRoute`, `PerfilSyncRoute`, `AdminRoute`.

- [ ] **Step 1: Escrever as specs que falham**

Acrescentar a `src/app/AppRouterV7.spec.tsx`:

```tsx
describe('AppRouterV7 — rotas globais', () => {
  it('monta a lista de comunidades em /comunidades', async () => {
    renderAppV7('/comunidades');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });

  it('monta as configurações do usuário em /perfil', async () => {
    renderAppV7('/perfil');
    expect(await screen.findByText(/backup/i)).toBeTruthy();
  });

  it('monta a sincronização em /perfil/sync', async () => {
    renderAppV7('/perfil/sync');
    expect(
      await screen.findByRole('heading', { name: /sincroniza|nuvem|conta/i }),
    ).toBeTruthy();
  });

  it('expulsa não-staff de /admin para /painel', async () => {
    renderAppV7('/admin');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('deixa staff entrar em /admin', async () => {
    renderAppV7('/admin', {
      ...readyState,
      account: {
        ...readyState.account,
        profile: { ...readyState.account.profile, role: 'master' },
      },
    } as AuthSessionState);
    expect(await screen.findByRole('heading', { name: /gest[aã]o|administra/i })).toBeTruthy();
  });
});
```

Se o `readyState` não for facilmente espalhável por causa do tipo `AuthSessionState`, construa o estado staff por cópia explícita do literal usado em `readyState`, trocando `role: 'user'` por `role: 'master'`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL nas 5 novas — as rotas caem no `*` e renderizam o painel.

- [ ] **Step 3: Implementar as rotas**

Acrescentar a `src/app/routes/globalRoutes.tsx`:

```tsx
import { Navigate, useNavigate } from 'react-router';
import { paths, resolveAdminRoute } from '@app/appRoutes';
import { buildCommunitiesViewContract } from '@app/screens/communitiesView/communitiesViewContract';
import { buildAccountSyncViewContract } from '@app/screens/accountSyncView/accountSyncViewContract';
import { buildGestaoViewContract } from '@app/screens/gestaoView/gestaoViewContract';
import { supabaseAuthClient } from '@infra/supabase/authClient';
import { applyCommunityHistoryClear, applyCommunityMembershipDuplicate, applyLinkedCloudPlayer, applyPlayerCommunityMemberships } from '@app/localCommunityUseCases';

const CommunitiesView = lazy(() =>
  import('../../components/community/CommunitiesView').then((module) => ({
    default: module.CommunitiesView,
  })),
);
const AccountSyncView = lazy(() =>
  import('../../components/account/AccountSyncView').then((module) => ({
    default: module.AccountSyncView,
  })),
);
const GestaoView = lazy(() =>
  import('../../components/admin/GestaoView').then((module) => ({ default: module.GestaoView })),
);
const SettingsModule = lazy(() =>
  import('../../components/settings/SettingsModule').then((module) => ({
    default: module.SettingsModule,
  })),
);

export function useCommunitiesContract(input: {
  selectedCommunityId: string | null;
  initialCommunityTab?: 'summary' | 'rules';
}) {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, play, comm, championships, communityPresence, communityRules, whatsAppLists, auth } =
    shell;

  return buildCommunitiesViewContract({
    communities: comm.communities,
    players: play.players,
    sessions: sess.sessions,
    games: sess.games,
    pointEvents: sess.pointEvents,
    teams: sess.teams,
    sessionReports: sess.sessionReports,
    championships: championships.championships,
    championshipTeams: championships.championshipTeams,
    championshipRounds: championships.championshipRounds,
    presenceApi: communityPresence,
    whatsAppApi: whatsAppLists,
    rulesApi: communityRules,
    currentUserId: auth.user?.id ?? null,
    isSupabaseConfigured: auth.isSupabaseConfigured,
    globalRole: auth.profile?.role ?? null,
    selectedCommunityId: input.selectedCommunityId,
    initialCommunityTab: input.initialCommunityTab,
    onSelectCommunity: (communityId) =>
      navigate(communityId ? paths.comunidade(communityId) : paths.comunidades),
    onBack: () => navigate(paths.painel),
    onAddCommunity: comm.addCommunity,
    onUpdateCommunity: comm.updateCommunity,
    onDeleteCommunity: (communityId) => {
      if (!window.confirm('Excluir esta comunidade? Os atletas continuarao cadastrados.')) return;
      shell.deleteCommunityAggregate(communityId);
      navigate(paths.comunidades);
    },
    onDuplicateCommunity: (communityId, includeAthletes) => {
      const result = comm.duplicateCommunity(communityId, includeAthletes);
      if (result?.includeAthletes) {
        play.setPlayers((prev) =>
          applyCommunityMembershipDuplicate(prev, {
            sourceCommunityId: communityId,
            duplicateCommunityId: result.duplicate.id,
          }),
        );
      }
    },
    onUpdatePlayerCommunities: (communityId, memberPlayerIds) => {
      play.setPlayers((prev) =>
        applyPlayerCommunityMemberships(prev, communityId, memberPlayerIds),
      );
    },
    onCreatePlayer: shell.createPlayerForCommunity,
    onCreateSession: shell.createSessionFromCommunity,
    onViewSession: (sessionId) => {
      const session = sess.sessions.find((item) => item.id === sessionId);
      const communityId = session?.communityId ?? input.selectedCommunityId;
      navigate(communityId ? paths.sessao(communityId, sessionId) : paths.painel);
    },
    onClearCommunityHistory: (communityId) => {
      sess.setSessions((prev) => applyCommunityHistoryClear(prev, communityId));
    },
    onCreateChampionship: championships.create,
    onMaterializeRound: shell.materializeChampionshipRound,
    onDeleteChampionship: shell.deleteChampionshipAggregate,
    onRescheduleRound: championships.rescheduleRound,
    onSetRoundSkipped: championships.setRoundSkipped,
    onUpdateChampionshipRecurrence: championships.updateRecurrence,
    onLinkedCloudPlayer: (player, communityId) => {
      play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId));
    },
  });
}

export function ComunidadesRoute() {
  const contract = useCommunitiesContract({ selectedCommunityId: null });
  return <CommunitiesView contract={contract} />;
}

export function PerfilRoute() {
  const shell = useShell();
  return (
    <SettingsModule
      onExportBackup={shell.handleExportBackup}
      onImportBackup={shell.handleImportBackup}
      onRestoreDemoPlayers={shell.play.handleRestoreDemoPlayers}
    />
  );
}

export function PerfilSyncRoute() {
  const { auth, cloudSync, play } = useShell();
  return (
    <AccountSyncView
      contract={buildAccountSyncViewContract({
        user: auth.user,
        profile: auth.profile,
        loading: auth.loading,
        isSupabaseConfigured: auth.isSupabaseConfigured,
        onSignOut: auth.signOut,
        onLinkGoogleIdentity: supabaseAuthClient.linkGoogleIdentity,
        onSync: cloudSync.sync,
        onRepairDuplicates: cloudSync.repairDuplicateCloudData,
        lastSyncedAt: cloudSync.lastSyncedAt,
        syncLoading: cloudSync.syncLoading,
        players: play.players,
        recoverableSyncActions: cloudSync.recoverableSyncActions,
        syncIssueSummary: cloudSync.syncIssueSummary,
        onRetryPrimarySyncAction: cloudSync.retryPrimarySyncAction,
        onClearResolvedSyncIssues: cloudSync.clearResolvedSyncIssues,
      })}
    />
  );
}

export function AdminRoute() {
  const { auth, toasts } = useShell();
  const resolution = resolveAdminRoute({ isStaff: auth.isStaff });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  return (
    <GestaoView
      contract={buildGestaoViewContract({
        currentUserId: auth.user?.id ?? null,
        isMaster: auth.isMaster,
        onToast: toasts.push,
      })}
    />
  );
}
```

> `useCommunitiesContract` já recebe `selectedCommunityId`/`initialCommunityTab`/`onSelectCommunity`, campos que só passam a existir na Task 5. **Nesta tarefa, remova esses três da chamada e do `ComunidadesRoute`** e reintroduza-os na Task 5. Sem isso o `typecheck` quebra.

- [ ] **Step 4: Registrar as rotas**

Em `src/app/AppRouterV7.tsx`, dentro de `<Route element={<AppShell />}>`, antes do `path="*"`:

```tsx
          <Route path="/comunidades" element={<ComunidadesRoute />} />
          <Route path="/perfil" element={<PerfilRoute />} />
          <Route path="/perfil/sync" element={<PerfilSyncRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
```

E acrescentar ao import: `import { AdminRoute, ComunidadesRoute, PainelRoute, PerfilRoute, PerfilSyncRoute } from './routes/globalRoutes';`

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: PASS, 10 testes.

- [ ] **Step 6: Verificar e commitar**

```bash
npm run lint && npm run test:ui
```

```bash
npx prettier@3.8.4 --check src/app/routes/globalRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/app && git commit -m "plano-5 fase 3: rotas globais comunidades, perfil e admin"
```

---

## Task 4: `/agenda`

**Files:**
- Create: `src/application/agendaViewModel.ts`
- Create: `src/application/agendaViewModel.test.ts`
- Create: `src/components/agenda/AgendaView.tsx`
- Modify: `src/app/routes/globalRoutes.tsx`
- Modify: `src/app/AppRouterV7.tsx`
- Modify: `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Produces: `AgendaItem { id: string; kind: 'session' | 'round'; refId: string; date: string; title: string; communityId: string; communityName: string; }` e `buildAgendaItems(input): AgendaItem[]`; componente `AgendaView({ items, onOpen })` com `onOpen: (item: AgendaItem) => void`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/application/agendaViewModel.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgendaItems } from './agendaViewModel';
import type { Championship, ChampionshipRound, ChampionshipTeam, Community, Session } from '@shared/types';

const community = { id: 'c1', name: 'Panelinha' } as Community;

function session(overrides: Partial<Session>): Session {
  return {
    id: 's1',
    communityId: 'c1',
    name: 'Sessão de quarta',
    date: '2026-08-20',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  } as Session;
}

test('lista sessões futuras e ignora passadas, encerradas e canceladas', () => {
  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [
      session({ id: 's1', date: '2026-08-20' }),
      session({ id: 's2', date: '2026-08-01' }),
      session({ id: 's3', date: '2026-08-25', status: 'finished' }),
      session({ id: 's4', date: '2026-08-26', status: 'cancelled' }),
      session({ id: 's5', date: '2026-08-13', communityId: null }),
    ],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  });

  assert.deepEqual(
    items.map((item) => item.refId),
    ['s1'],
  );
  assert.equal(items[0].communityName, 'Panelinha');
  assert.equal(items[0].kind, 'session');
});

test('inclui a sessão de hoje', () => {
  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [session({ id: 's1', date: '2026-08-12' })],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  });
  assert.equal(items.length, 1);
});

test('lista rodadas de liga pendentes e ordena tudo por data', () => {
  const championship = {
    id: 'ch1',
    communityId: 'c1',
    name: 'Liga de Verão',
  } as Championship;
  const teams = [
    { id: 't1', championshipId: 'ch1', name: 'Time A' },
    { id: 't2', championshipId: 'ch1', name: 'Time B' },
  ] as ChampionshipTeam[];
  const rounds = [
    {
      id: 'r1',
      championshipId: 'ch1',
      round: 1,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-15',
      skipped: false,
    },
    {
      id: 'r2',
      championshipId: 'ch1',
      round: 2,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-18',
      skipped: true,
    },
    {
      id: 'r3',
      championshipId: 'ch1',
      round: 3,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-19',
      skipped: false,
      sessionId: 's9',
    },
  ] as ChampionshipRound[];

  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [session({ id: 's1', date: '2026-08-20' })],
    championships: [championship],
    championshipTeams: teams,
    championshipRounds: rounds,
  });

  assert.deepEqual(
    items.map((item) => item.refId),
    ['r1', 's1'],
  );
  assert.equal(items[0].kind, 'round');
  assert.equal(items[0].title, 'Time A x Time B');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/application/agendaViewModel.test.ts
```

Esperado: FAIL — `Cannot find module './agendaViewModel'`.

- [ ] **Step 3: Implementar `agendaViewModel.ts`**

```ts
import type {
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  Session,
} from '@shared/types';

export interface AgendaItem {
  id: string;
  kind: 'session' | 'round';
  refId: string;
  date: string;
  title: string;
  communityId: string;
  communityName: string;
}

export interface AgendaInput {
  today: string;
  communities: Community[];
  sessions: Session[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
}

const CLOSED_STATUSES = new Set(['finished', 'cancelled']);

export function buildAgendaItems(input: AgendaInput): AgendaItem[] {
  const nameByCommunity = new Map(input.communities.map((c) => [c.id, c.name]));

  const sessionItems: AgendaItem[] = input.sessions
    .filter((session) => !!session && !session.deletedAt)
    .filter((session) => !!session.communityId && nameByCommunity.has(session.communityId))
    .filter((session) => !CLOSED_STATUSES.has(session.status))
    .filter((session) => !!session.date && session.date >= input.today)
    .map((session) => ({
      id: `session:${session.id}`,
      kind: 'session' as const,
      refId: session.id,
      date: session.date,
      title: session.name,
      communityId: session.communityId as string,
      communityName: nameByCommunity.get(session.communityId as string) as string,
    }));

  const championshipById = new Map(input.championships.map((c) => [c.id, c]));
  const teamById = new Map(input.championshipTeams.map((t) => [t.id, t]));

  const roundItems: AgendaItem[] = input.championshipRounds
    .filter((round) => !!round && !round.deletedAt && !round.skipped && !round.sessionId)
    .filter((round) => !!round.scheduledDate && round.scheduledDate >= input.today)
    .map((round) => {
      const championship = championshipById.get(round.championshipId);
      if (!championship || !nameByCommunity.has(championship.communityId)) return null;
      const teamA = teamById.get(round.teamAId)?.name ?? 'Time A';
      const teamB = teamById.get(round.teamBId)?.name ?? 'Time B';
      return {
        id: `round:${round.id}`,
        kind: 'round' as const,
        refId: round.id,
        date: round.scheduledDate,
        title: `${teamA} x ${teamB}`,
        communityId: championship.communityId,
        communityName: nameByCommunity.get(championship.communityId) as string,
      };
    })
    .filter((item): item is AgendaItem => item !== null);

  return [...sessionItems, ...roundItems].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/application/agendaViewModel.test.ts
```

Esperado: PASS, 3 testes.

- [ ] **Step 5: Criar a view**

`src/components/agenda/AgendaView.tsx`:

```tsx
import { CalendarDays } from 'lucide-react';
import type { AgendaItem } from '@app/agendaViewModel';

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  });
}

export function AgendaView({
  items,
  onOpen,
}: {
  items: AgendaItem[];
  onOpen: (item: AgendaItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="card card-border bg-base-200">
        <div className="card-body items-center text-center gap-2">
          <CalendarDays className="w-8 h-8 text-base-content/40" />
          <h2 className="text-base font-black uppercase tracking-tight">Nada agendado</h2>
          <p className="text-sm text-base-content/60">
            Sessões marcadas e rodadas de liga das suas comunidades aparecem aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="w-full card card-border bg-base-200 text-left hover:bg-base-300 transition-colors"
          >
            <div className="card-body py-4 gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-primary">
                  {formatDate(item.date)}
                </span>
                <span className="badge badge-neutral badge-sm">
                  {item.kind === 'round' ? 'Liga' : 'Sessão'}
                </span>
              </div>
              <p className="text-sm font-bold">{item.title}</p>
              <p className="text-xs text-base-content/60">{item.communityName}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Escrever a spec de rota que falha**

Acrescentar a `src/app/AppRouterV7.spec.tsx`:

```tsx
describe('AppRouterV7 — agenda', () => {
  it('monta a agenda vazia em /agenda', async () => {
    renderAppV7('/agenda');
    expect(await screen.findByText(/nada agendado/i)).toBeTruthy();
  });
});
```

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL — cai no `*` e renderiza o painel.

- [ ] **Step 7: Implementar a rota**

Em `src/app/routes/globalRoutes.tsx`:

```tsx
const AgendaView = lazy(() =>
  import('../../components/agenda/AgendaView').then((module) => ({ default: module.AgendaView })),
);

export function AgendaRoute() {
  const { sess, comm, championships } = useShell();
  const navigate = useNavigate();
  const today = formatLocalDateInput(new Date());
  const items = buildAgendaItems({
    today,
    communities: comm.communities,
    sessions: sess.sessions,
    championships: championships.championships,
    championshipTeams: championships.championshipTeams,
    championshipRounds: championships.championshipRounds,
  });

  return (
    <AgendaView
      items={items}
      onOpen={(item) =>
        navigate(
          item.kind === 'session'
            ? paths.sessao(item.communityId, item.refId)
            : paths.torneios(item.communityId),
        )
      }
    />
  );
}
```

Imports novos no arquivo: `import { buildAgendaItems } from '@app/agendaViewModel';` e `import { formatLocalDateInput } from '@logic/date';` (a função vive em `src/logic/date.ts:1` e já usa o fuso local, que é o que a comparação com `session.date` exige).

Registrar em `AppRouterV7.tsx`: `<Route path="/agenda" element={<AgendaRoute />} />`.

- [ ] **Step 8: Rodar, verificar e commitar**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx && npm run lint && npm run test:unit
```

Esperado: UI 11 testes no arquivo; unit +3.

```bash
npx prettier@3.8.4 --check src/application/agendaViewModel.ts src/application/agendaViewModel.test.ts src/components/agenda/AgendaView.tsx src/app/routes/globalRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/application/agendaViewModel.ts src/application/agendaViewModel.test.ts src/components/agenda src/app && git commit -m "plano-5 fase 3: rota global /agenda"
```

---

## Task 5: `CommunityShell` e o índice `/comunidades/:communityId`

**Files:**
- Modify: `src/application/screens/communitiesView/communitiesViewModel.ts`
- Modify: `src/application/screens/communitiesView/communitiesViewIntents.ts`
- Modify: `src/application/screens/communitiesView/communitiesViewContract.ts`
- Modify: `src/components/community/CommunitiesView.tsx`
- Create: `src/app/routes/communityRoutes.tsx`
- Modify: `src/app/routes/globalRoutes.tsx` (reintroduz os 3 campos em `useCommunitiesContract`)
- Modify: `src/app/AppRouterV7.tsx`, `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Produces: `CommunityShell` (valida `:communityId` e repassa `CommunityShellApi = ShellApi & { community: Community }` pelo `Outlet`), `useCommunityShell()`, `CommunityOverviewRoute`, `CommunityGestaoRoute` (a área Gestão, coberta nesta mesma tarefa).
- Model novo: `CommunitiesViewModel.selectedCommunityId: string | null`, `CommunitiesViewModel.initialCommunityTab?: CommunityTab`. Intent nova: `{ kind: 'selectCommunity'; communityId: string | null }`.

- [ ] **Step 1: Escrever as specs que falham**

Acrescentar a `src/app/AppRouterV7.spec.tsx`:

```tsx
describe('AppRouterV7 — comunidade', () => {
  it('expulsa id inexistente para a lista de comunidades', async () => {
    renderAppV7('/comunidades/nao-existe');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });

  it('expulsa id inexistente também nas áreas internas', async () => {
    renderAppV7('/comunidades/nao-existe/pessoas');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });

  it('abre o detalhe da comunidade da URL', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1');
    expect(await screen.findByRole('heading', { name: 'Panelinha' })).toBeTruthy();
  });

  it('abre a gestão da comunidade na aba Regras', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1/gestao');
    expect(await screen.findByRole('tab', { name: 'Regras' })).toHaveClass('tab-active');
  });
});
```

O `toHaveClass` vem do `@testing-library/jest-dom`; se ele não estiver no setup do Vitest (`git grep -n "jest-dom" src/test/`), troque a asserção por
`expect((await screen.findByRole('tab', { name: 'Regras' })).className).toContain('tab-active')`.

O harness não tem comunidade nenhuma no `localStorage`, então o caminho feliz do detalhe é coberto por teste de contrato. Acrescentar a `src/application/screens/communitiesView/communitiesViewContract.test.ts`:

```ts
test('selectedCommunityId e initialCommunityTab chegam ao modelo', () => {
  const c = buildCommunitiesViewContract(
    makeInput({ selectedCommunityId: 'c1', initialCommunityTab: 'rules' }),
  );
  assert.equal(c.model.selectedCommunityId, 'c1');
  assert.equal(c.model.initialCommunityTab, 'rules');
});

test('selectCommunity repassa o id e o nulo de volta para a lista', async () => {
  const onSelectCommunity = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({ onSelectCommunity: onSelectCommunity.fn as never }),
  );
  await c.dispatch({ kind: 'selectCommunity', communityId: 'c1' });
  await c.dispatch({ kind: 'selectCommunity', communityId: null });
  assert.deepEqual(onSelectCommunity.calls, [['c1'], [null]]);
});
```

O `makeInput()` desse arquivo precisa dos campos novos obrigatórios no default, senão o `typecheck` quebra em todos os testes existentes dele:

```ts
    selectedCommunityId: null,
    onSelectCommunity: () => {},
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx && node --import tsx --test src/application/screens/communitiesView/communitiesViewContract.test.ts
```

Esperado: FAIL nos dois — `/comunidades/nao-existe` cai no `*` → painel, não na lista; e o contrato não conhece `selectedCommunityId`.

- [ ] **Step 3: Abrir o `CommunitiesView` para controle por URL**

Em `src/application/screens/communitiesView/communitiesViewModel.ts`, acrescentar ao topo do arquivo:

```ts
export type CommunityTab =
  | 'summary'
  | 'players'
  | 'presence'
  | 'whatsapp'
  | 'sessions'
  | 'championships'
  | 'ranking'
  | 'members'
  | 'rules'
  | 'data';
```

e à interface `CommunitiesViewModel`:

```ts
  selectedCommunityId: string | null;
  initialCommunityTab?: CommunityTab;
```

Em `communitiesViewIntents.ts`, acrescentar ao union:

```ts
  | { kind: 'selectCommunity'; communityId: string | null }
```

Em `communitiesViewContract.ts`: acrescentar `selectedCommunityId`, `initialCommunityTab` e `onSelectCommunity: (communityId: string | null) => void;` ao input, repassar os dois primeiros ao modelo e tratar a intent nova no `dispatch`:

```ts
      case 'selectCommunity':
        input.onSelectCommunity(intent.communityId);
        return;
```

Em `src/components/community/CommunitiesView.tsx`:

1. Trocar o tipo local `type CommunityTab = …` (linhas 94–104) por `import type { CommunityTab } from '@app/screens/communitiesView/communitiesViewModel';` e remover a declaração local.
2. Linha 265: apagar `const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);` e ler do modelo, desestruturando `selectedCommunityId` e `initialCommunityTab` junto com o resto de `model`.
3. Definir o setter como dispatch:

```tsx
  const setSelectedCommunityId = (communityId: string | null) =>
    void dispatch({ kind: 'selectCommunity', communityId });
```

4. Passar a aba inicial ao detalhe: no `<CommunityDetailView …>` acrescentar `initialTab={initialCommunityTab}`; na assinatura de `CommunityDetailView`, acrescentar `initialTab?: CommunityTab` ao tipo de props e trocar a linha 614 por:

```tsx
  const [activeTab, setActiveTab] = useState<CommunityTab>(initialTab ?? 'summary');
```

5. Onde `onDeleteCommunity` chamava `setSelectedCommunityId(null)` logo após o dispatch (linha ~302), remover a chamada — a navegação agora acontece no handler da rota.

- [ ] **Step 4: Criar `communityRoutes.tsx`**

```tsx
import { Navigate, Outlet, useOutletContext, useParams } from 'react-router';
import type { Community } from '@shared/types';
import { resolveCommunityRoute } from '@app/appRoutes';
import { useShell, type ShellApi } from '../shellContext';
import { useCommunitiesContract } from './globalRoutes';

export interface CommunityShellApi extends ShellApi {
  community: Community;
}

export function useCommunityShell(): CommunityShellApi {
  return useOutletContext<CommunityShellApi>();
}

export function CommunityShell() {
  const shell = useShell();
  const { communityId } = useParams();
  const resolution = resolveCommunityRoute({
    communityId,
    communityIds: shell.comm.communities.map((community) => community.id),
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  const community = shell.comm.communities.find(
    (item) => item.id === communityId,
  ) as Community;

  return <Outlet context={{ ...shell, community }} />;
}

export function CommunityOverviewRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({ selectedCommunityId: community.id });
  return <CommunitiesView contract={contract} />;
}

export function CommunityGestaoRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({
    selectedCommunityId: community.id,
    initialCommunityTab: 'rules',
  });
  return <CommunitiesView contract={contract} />;
}
```

`CommunitiesView` precisa estar acessível aqui: exporte o `lazy` de `globalRoutes.tsx` (`export const CommunitiesView = lazy(...)`) e importe-o em `communityRoutes.tsx`.

> `useCommunitiesContract` chama `useShell()`, que lê o contexto do `Outlet` mais próximo. Dentro de `CommunityShell` o contexto foi reemitido com `community` incluído — como `CommunityShellApi` estende `ShellApi`, `useShell()` continua correto.

Reintroduzir em `globalRoutes.tsx` os três campos removidos na Task 3 (`selectedCommunityId`, `initialCommunityTab`, `onSelectCommunity`), exatamente como escritos na Task 3 Step 3.

- [ ] **Step 5: Registrar as rotas**

Em `AppRouterV7.tsx`, dentro do `AppShell`:

```tsx
          <Route path="/comunidades/:communityId" element={<CommunityShell />}>
            <Route index element={<CommunityOverviewRoute />} />
            <Route path="gestao" element={<CommunityGestaoRoute />} />
          </Route>
```

Acrescentar também, como última rota **dentro** do bloco do `CommunityShell`, a rede de segurança para sub-rota inválida dentro de uma comunidade que existe:

```tsx
            <Route path="*" element={<Navigate to="/comunidades" replace />} />
```

Ela é permanente — as áreas das Tasks 6–9 (Pessoas, Desempenho, Sessões) entram antes dela, não no lugar dela. Cobertura correspondente:

```tsx
  it('manda área inexistente de comunidade válida para a lista', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1/area-que-nao-existe');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });
```

- [ ] **Step 6: Rodar, verificar e commitar**

```bash
npm run lint && npm run test:unit && npm run test:ui
```

Esperado: PASS. `CommunitiesView.spec.tsx` (que testa `ChampionshipsTab` isoladamente) continua verde, e o `communitiesViewContract.test.ts` ganha 2 testes.

Confirmação no app real (as specs já cobrem o caminho feliz com `seedLocalDb`; isto pega o que jsdom não pega — foco, drawer, animação, F5 de verdade):

```bash
npm run dev
```

Abrir `http://localhost:3000/comunidades?nav=v3`, criar uma comunidade, confirmar que a URL vira `/comunidades/<id>`, que F5 mantém o detalhe aberto, que "Comunidades" na sidebar volta para a lista e que `/comunidades/<id>/gestao` abre direto na aba Regras. Encerrar o servidor ao terminar.

```bash
npx prettier@3.8.4 --check src/application/screens/communitiesView/communitiesViewModel.ts src/application/screens/communitiesView/communitiesViewIntents.ts src/application/screens/communitiesView/communitiesViewContract.ts src/components/community/CommunitiesView.tsx src/app/routes/communityRoutes.tsx src/app/routes/globalRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/application/screens/communitiesView src/components/community/CommunitiesView.tsx src/app && git commit -m "plano-5 fase 3: CommunityShell e indice da comunidade por URL"
```

---

## Task 6: `/comunidades/:communityId/pessoas` e `/pessoas/editar-atleta/:playerId`

**Files:**
- Modify: `src/app/routes/communityRoutes.tsx`
- Modify: `src/app/AppRouterV7.tsx`, `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Consumes: `useCommunityShell()`, `paths`, `NEW_PLAYER_ID`, `resolveBackTarget`, `getCommunityPlayers` (`@logic/community`).
- Produces: `CommunityPeopleRoute`, `PlayerEditRoute`.

- [ ] **Step 1: Escrever a spec que falha**

```tsx
describe('AppRouterV7 — pessoas', () => {
  const community = { id: 'c1', name: 'Panelinha' };
  const player = {
    id: 'p1',
    nome: 'Ana Souza',
    apelido: 'Ana',
    genero: 'F',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    communityIds: ['c1'],
    metadata: { criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' },
  };

  it('lista só os atletas da comunidade da URL', async () => {
    seedLocalDb({
      communities: [community],
      players: [player, { ...player, id: 'p2', nome: 'Bruno Lima', communityIds: ['c2'] }],
    });
    renderAppV7('/comunidades/c1/pessoas');
    expect(await screen.findByText(/ana souza/i)).toBeTruthy();
    expect(screen.queryByText(/bruno lima/i)).toBeNull();
  });

  it('abre o atleta da URL em modo edição', async () => {
    seedLocalDb({ communities: [community], players: [player] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/p1');
    expect(await screen.findByDisplayValue('Ana Souza')).toBeTruthy();
  });

  it('volta para a lista quando o atleta da URL não existe', async () => {
    seedLocalDb({ communities: [community], players: [player] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/p-inexistente');
    expect(await screen.findByText(/ana souza/i)).toBeTruthy();
  });
});
```

Os seletores (`findByText` do nome, `findByDisplayValue`) valem para o `PlayersView`/`PlayerEditView` atuais; se o nome aparecer noutro papel, ajuste o seletor **sem** afrouxar a asserção para algo que passaria com a tela errada.

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL nos três — as rotas ainda não existem, então tudo cai no `*` interno do `CommunityShell` e volta para a lista de comunidades.

- [ ] **Step 2: Implementar as rotas**

Em `src/app/routes/communityRoutes.tsx`:

```tsx
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { NEW_PLAYER_ID, paths, resolveBackTarget } from '@app/appRoutes';
import { buildPlayersViewContract } from '@app/screens/playersView/playersViewContract';
import { buildPlayerEditViewContract } from '@app/screens/playerEditView/playerEditViewContract';
import { getCommunityPlayers, getCommunitySessions } from '@logic/community';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';

const PlayersView = lazy(() =>
  import('../../components/player/PlayersView').then((module) => ({ default: module.PlayersView })),
);
const PlayerEditView = lazy(() =>
  import('../../components/player/PlayerEditView').then((module) => ({
    default: module.PlayerEditView,
  })),
);

export function CommunityPeopleRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, play, sess, comm } = shell;
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <PlayersView
      contract={buildPlayersViewContract({
        players: communityPlayers,
        communities: comm.communities,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        sessions: getCommunitySessions(community.id, sess.sessions),
        onBack: () => navigate(paths.comunidade(community.id)),
        onAddPlayer: () => {
          play.handleAddPlayer();
          navigate(paths.atleta(community.id, NEW_PLAYER_ID));
        },
        onEditPlayer: (player) => {
          play.handleEditPlayer(player);
          navigate(paths.atleta(community.id, player.id));
        },
        onRestoreDemoPlayers: play.handleRestoreDemoPlayers,
        onAddGuestPlayer: (newPlayer, editDetails) => shell.applyGuestPlayer(newPlayer, editDetails),
      })}
    />
  );
}

export function PlayerEditRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const location = useLocation();
  const { playerId } = useParams();
  const { community, play, sess, comm, auth } = shell;
  const permissions = useCommunityPermissions(community);
  const fallbackPath = paths.pessoas(community.id);

  useEffect(() => {
    if (!playerId) return;
    if (play.editingPlayer?.id === playerId) return;
    if (playerId === NEW_PLAYER_ID) {
      if (!play.editingPlayer) play.handleAddPlayer();
      return;
    }
    const player = play.players.find((item) => item.id === playerId);
    if (player) play.handleEditPlayer(player);
  }, [playerId, play.editingPlayer, play.players]);

  const goBack = () => {
    const target = resolveBackTarget({ locationKey: location.key, fallbackPath });
    if (target.kind === 'history') navigate(-1);
    else navigate(target.to);
  };

  if (!play.editingPlayer) return <Navigate to={fallbackPath} replace />;

  return (
    <PlayerEditView
      contract={buildPlayerEditViewContract({
        editingPlayer: play.editingPlayer,
        setEditingPlayer: play.setEditingPlayer,
        players: play.players,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        communities: comm.communities,
        sessions: sess.sessions,
        validationErrors: play.validationErrors,
        showDeleteConfirm: play.showDeleteConfirm,
        setShowDeleteConfirm: play.setShowDeleteConfirm,
        permissions,
        currentUserId: auth.user?.id ?? null,
        onBack: goBack,
        onSave: () => {
          try {
            if (play.handleSavePlayer(permissions, community.id)) goBack();
          } catch (err) {
            shell.handlePlayerEditActionError(err);
          }
        },
        onDelete: () => {
          try {
            play.handleDeletePlayer(permissions);
            goBack();
          } catch (err) {
            shell.handlePlayerEditActionError(err);
          }
        },
      })}
    />
  );
}
```

> O `App.tsx` calculava `editingPlayerCommunity` procurando a primeira comunidade do atleta e passava o id dela ao `handleSavePlayer`. Na rota, a comunidade correta é a da URL: `community.id`. Isso é intencional e mais preciso — a mesma pessoa pode estar em várias comunidades, e agora a rota diz em qual você está editando.

- [ ] **Step 3: Registrar as rotas**

Dentro do bloco do `CommunityShell`, antes do `path="*"`:

```tsx
            <Route path="pessoas" element={<CommunityPeopleRoute />} />
            <Route path="pessoas/editar-atleta/:playerId" element={<PlayerEditRoute />} />
```

- [ ] **Step 4: Rodar, verificar manualmente e commitar**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx && npm run lint && npm run test:ui
```

Manual (`npm run dev`, `?nav=v3`): na comunidade, abrir Pessoas, criar atleta (URL vira `/pessoas/editar-atleta/novo`), salvar e confirmar a volta para Pessoas; editar um atleta existente e confirmar que a URL leva o id e que F5 nessa URL reabre o mesmo atleta.

```bash
npx prettier@3.8.4 --check src/app/routes/communityRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/app && git commit -m "plano-5 fase 3: area Pessoas e edicao de atleta por URL"
```

---

## Task 7: `/comunidades/:communityId/desempenho`

**Files:**
- Modify: `src/app/routes/communityRoutes.tsx`
- Modify: `src/app/AppRouterV7.tsx`, `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Produces: `CommunityPerformanceRoute`. Lê `?aba=ranking|historico` (default `ranking`) e `?sessao=<id>`; `?sessao` implica aba `historico`.

- [ ] **Step 1: Escrever a spec que falha**

```tsx
describe('AppRouterV7 — desempenho', () => {
  const community = { id: 'c1', name: 'Panelinha' };

  it('abre no Ranking por padrão', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho');
    expect(await screen.findByRole('tab', { name: 'Ranking' })).toHaveClass('tab-active');
  });

  it('abre no Histórico quando a URL pede', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho?aba=historico');
    expect(await screen.findByRole('tab', { name: 'Histórico' })).toHaveClass('tab-active');
  });

  it('?sessao= implica a aba Histórico mesmo sem ?aba=', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho?sessao=s1');
    expect(await screen.findByRole('tab', { name: 'Histórico' })).toHaveClass('tab-active');
  });

  it('expulsa /desempenho de comunidade inexistente', async () => {
    renderAppV7('/comunidades/nao-existe/desempenho?aba=historico&sessao=s1');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });
});
```

As três primeiras asserções batem nas abas **desta rota** (`Ranking`/`Histórico`), não nas abas internas do `HistoryView` (`Sessões`/`Estatísticas`). Se houver colisão de nome acessível, dê `aria-label` distinto às abas da rota em vez de relaxar o seletor.

- [ ] **Step 2: Implementar a rota**

```tsx
import { useSearchParams } from 'react-router';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';

const RankingModule = lazy(() =>
  import('../../components/ranking/RankingModule').then((module) => ({
    default: module.RankingModule,
  })),
);
const HistoryView = lazy(() =>
  import('../../components/history/HistoryView').then((module) => ({ default: module.HistoryView })),
);

export function CommunityPerformanceRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { community, play, sess } = shell;
  const selectedSessionId = searchParams.get('sessao');
  const aba = selectedSessionId ? 'historico' : (searchParams.get('aba') ?? 'ranking');
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <div className="space-y-5">
      <div role="tablist" className="tabs tabs-box overflow-x-auto flex-nowrap justify-start">
        <button
          type="button"
          role="tab"
          className={`tab whitespace-nowrap ${aba === 'ranking' ? 'tab-active' : ''}`}
          onClick={() => navigate(paths.desempenho(community.id, { aba: 'ranking' }))}
        >
          Ranking
        </button>
        <button
          type="button"
          role="tab"
          className={`tab whitespace-nowrap ${aba === 'historico' ? 'tab-active' : ''}`}
          onClick={() => navigate(paths.desempenho(community.id, { aba: 'historico' }))}
        >
          Histórico
        </button>
      </div>

      {aba === 'ranking' ? (
        <RankingModule
          players={communityPlayers}
          games={sess.games}
          pointEvents={sess.pointEvents}
          teams={sess.teams}
          sessions={communitySessions}
        />
      ) : (
        <HistoryView
          contract={buildHistoryViewContract({
            sessions: communitySessions,
            games: sess.games,
            pointEvents: sess.pointEvents,
            teams: sess.teams,
            players: play.players,
            sessionReports: sess.sessionReports,
            selectedHistorySessionId: selectedSessionId,
            setSelectedHistorySessionId: (id) =>
              navigate(
                id
                  ? paths.desempenho(community.id, { sessao: id })
                  : paths.desempenho(community.id, { aba: 'historico' }),
              ),
            onDeleteSession: (sessionId) => {
              sess.deleteSession(sessionId);
              navigate(paths.desempenho(community.id, { aba: 'historico' }));
            },
            onBackToDashboard: () => navigate(paths.comunidade(community.id)),
            initialTab: 'sessions',
            hideTabs: false,
          })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Registrar e verificar**

```tsx
            <Route path="desempenho" element={<CommunityPerformanceRoute />} />
```

```bash
npx vitest run src/app/AppRouterV7.spec.tsx && npm run lint && npm run test:ui
```

Manual: abrir Desempenho, alternar as abas e confirmar que a URL muda (`?aba=historico`); abrir uma sessão do histórico e confirmar `?sessao=<id>`; F5 nessa URL reabre a mesma sessão.

- [ ] **Step 4: Commit**

```bash
npx prettier@3.8.4 --check src/app/routes/communityRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/app && git commit -m "plano-5 fase 3: area Desempenho com aba e sessao na URL"
```

---

## Task 8: `/sessoes`, `/sessoes/torneios` e `/sessoes/:sessionId`

**Files:**
- Create: `src/app/routes/sessionRoutes.tsx`
- Modify: `src/app/AppRouterV7.tsx`, `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- Produces: `CommunitySessionsRoute`, `CommunityTournamentsRoute`, `CommunitySessionDetailRoute`.
- Consumes: `useCommunityShell()` de `./communityRoutes`.

- [ ] **Step 1: Escrever as specs que falham**

```tsx
describe('AppRouterV7 — sessões da comunidade', () => {
  const community = { id: 'c1', name: 'Panelinha' };
  const finished = {
    id: 's1',
    communityId: 'c1',
    name: 'Sessão de quarta',
    date: '2026-08-05',
    status: 'finished',
    type: 'free_play',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };

  it('lista só as sessões da comunidade da URL', async () => {
    seedLocalDb({
      communities: [community],
      sessions: [finished, { ...finished, id: 's2', name: 'Sessão de outra', communityId: 'c2' }],
    });
    renderAppV7('/comunidades/c1/sessoes');
    expect(await screen.findByText(/sessão de quarta/i)).toBeTruthy();
    expect(screen.queryByText(/sessão de outra/i)).toBeNull();
  });

  it('abre o detalhe da sessão da URL', async () => {
    seedLocalDb({ communities: [community], sessions: [finished] });
    renderAppV7('/comunidades/c1/sessoes/s1');
    expect(await screen.findByText(/sessão de quarta/i)).toBeTruthy();
  });

  it('monta os torneios da comunidade', async () => {
    seedLocalDb({ communities: [community], sessions: [{ ...finished, type: 'tournament' }] });
    renderAppV7('/comunidades/c1/sessoes/torneios');
    expect(await screen.findByText(/sessão de quarta/i)).toBeTruthy();
  });

  it('expulsa /sessoes de comunidade inexistente', async () => {
    renderAppV7('/comunidades/nao-existe/sessoes');
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
  });
});
```

O segundo teste ainda não distingue lista de detalhe (o nome aparece nos dois). Ao implementar, aperte a asserção para algo exclusivo do detalhe — o `HistoryView` renderiza o painel de uma sessão selecionada com elementos que a lista não tem; escolha um deles e confirme que o teste falha se `selectedHistorySessionId` for passado como `null`.

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL nos quatro primeiros — as rotas não existem e o `*` interno manda tudo para a lista de comunidades.

- [ ] **Step 2: Implementar `sessionRoutes.tsx`**

```tsx
import { lazy } from 'react';
import { useNavigate, useParams } from 'react-router';
import { paths, resolveNewSessionPath } from '@app/appRoutes';
import { buildHistoryViewContract } from '@app/screens/historyView/historyViewContract';
import { getCommunitySessions } from '@logic/community';
import { useCommunityShell } from './communityRoutes';

const HistoryView = lazy(() =>
  import('../../components/history/HistoryView').then((module) => ({ default: module.HistoryView })),
);
const TournamentsModule = lazy(() =>
  import('../../components/tournaments/TournamentsModule').then((module) => ({
    default: module.TournamentsModule,
  })),
);

export function CommunitySessionsRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <HistoryView
      contract={buildHistoryViewContract({
        sessions: communitySessions,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        players: play.players,
        sessionReports: sess.sessionReports,
        selectedHistorySessionId: null,
        setSelectedHistorySessionId: (id) =>
          navigate(id ? paths.sessao(community.id, id) : paths.sessoes(community.id)),
        onDeleteSession: (sessionId) => {
          sess.deleteSession(sessionId);
          navigate(paths.sessoes(community.id));
        },
        onBackToDashboard: () => navigate(paths.comunidade(community.id)),
        initialTab: 'sessions',
        hideTabs: true,
      })}
    />
  );
}

export function CommunitySessionDetailRoute() {
  const { community, sess, play } = useCommunityShell();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <HistoryView
      contract={buildHistoryViewContract({
        sessions: communitySessions,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        players: play.players,
        sessionReports: sess.sessionReports,
        selectedHistorySessionId: sessionId ?? null,
        setSelectedHistorySessionId: (id) =>
          navigate(id ? paths.sessao(community.id, id) : paths.sessoes(community.id)),
        onDeleteSession: (id) => {
          sess.deleteSession(id);
          navigate(paths.sessoes(community.id));
        },
        onBackToDashboard: () => navigate(paths.sessoes(community.id)),
        initialTab: 'sessions',
        hideTabs: true,
      })}
    />
  );
}

export function CommunityTournamentsRoute() {
  const { community, sess } = useCommunityShell();
  const navigate = useNavigate();

  return (
    <TournamentsModule
      sessions={getCommunitySessions(community.id, sess.sessions)}
      games={sess.games}
      teams={sess.teams}
      sessionReports={sess.sessionReports}
      onNewTournament={() =>
        navigate(resolveNewSessionPath({ communityIds: [community.id], type: 'tournament' }))
      }
      onOpenTournament={(tournament, shouldOpenLive) => {
        if (shouldOpenLive) {
          sess.setActiveSession(tournament);
          navigate(paths.sessaoAtiva(community.id));
        } else {
          navigate(paths.sessao(community.id, tournament.id));
        }
      }}
    />
  );
}
```

- [ ] **Step 3: Registrar as rotas**

Dentro do bloco do `CommunityShell`, **antes** de `sessoes/:sessionId` (a ordem importa: `nova`, `ativa` e `torneios` são literais e precisam preceder o parâmetro):

```tsx
            <Route path="sessoes" element={<CommunitySessionsRoute />} />
            <Route path="sessoes/torneios" element={<CommunityTournamentsRoute />} />
            <Route path="sessoes/:sessionId" element={<CommunitySessionDetailRoute />} />
```

(react-router v7 ranqueia rotas estáticas acima das dinâmicas independentemente da ordem de declaração; a ordem acima é para o leitor humano.)

- [ ] **Step 4: Rodar, verificar e commitar**

```bash
npx vitest run src/app/AppRouterV7.spec.tsx && npm run lint && npm run test:ui
```

Manual: dentro de uma comunidade com histórico, abrir Sessões, clicar numa sessão (URL vira `/sessoes/<id>`), dar F5 e confirmar que o detalhe reabre; abrir Torneios pela sub-rota.

```bash
npx prettier@3.8.4 --check src/app/routes/sessionRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/app && git commit -m "plano-5 fase 3: sub-rotas de sessoes, torneios e detalhe"
```

---

## Task 9: `/sessoes/nova`, `/sessoes/ativa` e a rota legada `/sessao/ativa`

**Files:**
- Modify: `src/application/sessionLifecycleUseCases.ts`
- Modify: `src/application/sessionLifecycleUseCases.test.ts`
- Modify: `src/app/routes/sessionRoutes.tsx`
- Modify: `src/app/routes/globalRoutes.tsx` (rota legada)
- Modify: `src/app/AppRouterV7.tsx`, `src/app/AppRouterV7.spec.tsx`

**Interfaces:**
- `buildManualSessionDraft(input: { type?: Session['type']; communityId?: string | null; now: Date; createId: () => string }): Session` — passa a estampar `communityId`.
- `buildManualSessionStartResult` ganha o mesmo campo opcional e o repassa.
- Produces: `SessionWizardRoute`, `SessionActiveRoute`, `LegacyActiveSessionRoute`.

- [ ] **Step 1: Escrever o teste de unidade que falha**

Acrescentar a `src/application/sessionLifecycleUseCases.test.ts`:

```ts
test('buildManualSessionStartResult estampa a comunidade dona da sessão', () => {
  const result = buildManualSessionStartResult({
    communityId: 'c1',
    now: new Date('2026-08-12T12:00:00Z'),
    createId: () => 'session-1',
  });
  assert.equal(result.session.communityId, 'c1');
});

test('buildManualSessionStartResult sem comunidade mantém communityId nulo', () => {
  const result = buildManualSessionStartResult({
    now: new Date('2026-08-12T12:00:00Z'),
    createId: () => 'session-1',
  });
  assert.equal(result.session.communityId ?? null, null);
});
```

Use `test`/`assert` conforme o cabeçalho já existente do arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: FAIL no primeiro — `communityId` é `undefined`.

- [ ] **Step 3: Implementar**

Em `src/application/sessionLifecycleUseCases.ts`, na assinatura de `buildManualSessionDraft`, acrescentar `communityId?: string | null;` ao input e ao objeto `session`:

```ts
  const session: Session = {
    id: input.createId(),
    communityId: input.communityId ?? null,
    name: `${label} — ${input.now.toLocaleDateString('pt-BR')}`,
```

Em `buildManualSessionStartResult`, acrescentar `communityId?: string | null;` ao input (o `buildManualSessionDraft(input)` já repassa o objeto inteiro).

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: PASS.

- [ ] **Step 4: Escrever a spec de rota que falha**

```tsx
describe('AppRouterV7 — wizard e sessão ativa', () => {
  const community = { id: 'c1', name: 'Panelinha' };

  it('abre o wizard e cria o rascunho já com a comunidade da URL', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/sessoes/nova');
    await screen.findByText(/configuração da sessão/i);
    const stored = JSON.parse(localStorage.getItem('vpg_sessions') ?? '[]');
    expect(stored.some((session) => session.communityId === 'c1')).toBe(true);
  });

  it('manda /sessoes/ativa para a lista de sessões quando não há sessão em fase jogável', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/sessoes/ativa');
    expect(await screen.findByRole('tab', { name: /sess/i })).toBeTruthy();
  });

  it('manda /sessao/ativa para o painel quando não há sessão ativa', async () => {
    renderAppV7('/sessao/ativa');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });
});
```

**O terceiro teste passaria por acidente** enquanto `/sessao/ativa` não existe (cai no `*`, que também leva ao painel). Para ele valer alguma coisa, ancore no comportamento antes de rodar: registre `<Route path="/sessao/ativa" element={<LegacyActiveSessionRoute />} />` com `LegacyActiveSessionRoute` retornando `<div>rota legada</div>`, rode e confirme que o teste **falha por encontrar "rota legada"** — só então implemente o guard.

O primeiro teste depende de onde `useSessions` persiste o rascunho; se ele guardar a sessão ativa noutra chave que não `vpg_sessions`, verifique com `git grep -n "STORAGE_KEYS.activeSession\|setActiveSession" src/hooks/useSessions.ts` e asserte na chave certa. **Não** troque a asserção por "a tela abriu" — o que esta tarefa precisa provar é o `communityId` estampado.

```bash
npx vitest run src/app/AppRouterV7.spec.tsx
```

Esperado: FAIL nos dois primeiros.

- [ ] **Step 5: Implementar as rotas de sessão**

Em `src/app/routes/sessionRoutes.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { derivePhase } from '@domain/sessionPhase';
import { resolveLiveSessionRoute, resolveWizardRoute } from '@app/appRoutes';
import { buildSessionWizardContract } from '@app/screens/sessionWizard/sessionWizardContract';
import { buildSessionActiveViewContract } from '@app/screens/sessionActiveView/sessionActiveViewContract';
import {
  buildManualSessionStartResult,
  selectSessionTeams,
} from '@app/sessionLifecycleUseCases';
import { generateUUID } from '@logic/uuid';

const SessionWizard = lazy(() =>
  import('../../components/session/SessionWizard').then((module) => ({
    default: module.SessionWizard,
  })),
);
const SessionActiveView = lazy(() =>
  import('../../components/live/SessionActiveView').then((module) => ({
    default: module.SessionActiveView,
  })),
);

export function SessionWizardRoute() {
  const shell = useCommunityShell();
  const [searchParams] = useSearchParams();
  const { community, sess, play, comm, wizard } = shell;
  const type = searchParams.get('tipo') === 'torneio' ? 'tournament' : undefined;
  const resolution = resolveWizardRoute({
    communityId: community.id,
    hasActiveSession: !!sess.activeSession,
    activeSessionCommunityId: sess.activeSession?.communityId ?? null,
  });
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    if (resolution.kind === 'create') {
      bootstrapped.current = true;
      const result = buildManualSessionStartResult({
        type,
        communityId: community.id,
        now: new Date(),
        createId: generateUUID,
      });
      sess.setActiveSession(result.session);
      wizard.setWizardStep(result.nextWizardStep);
      return;
    }
    if (resolution.kind === 'adopt') {
      bootstrapped.current = true;
      wizard.updateSession({ communityId: community.id });
    }
  }, [resolution.kind, community.id, type]);

  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  if (!sess.activeSession) return null;

  return (
    <SessionWizard
      contract={buildSessionWizardContract({
        activeSession: sess.activeSession,
        players: play.players,
        communities: comm.communities,
        hookApi: wizard,
        applyGuestPlayer: shell.applyGuestPlayer,
      })}
    />
  );
}

export function SessionActiveRoute() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, sess, play } = shell;
  const phase = derivePhase(sess.activeSession, sess.games);
  const resolution = resolveLiveSessionRoute({
    communityId: community.id,
    activeSessionCommunityId: sess.activeSession?.communityId ?? null,
    hasActiveSession: !!sess.activeSession,
    phase,
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  return (
    <SessionActiveView
      contract={buildSessionActiveViewContract({
        activeSession: sess.activeSession!,
        games: sess.games,
        pointEvents: sess.pointEvents,
        players: play.players,
        sessionTeams: selectSessionTeams(sess.teams, sess.activeSession?.id),
        gameReports: sess.gameReports,
        currentDeviceId: shell.currentDeviceId,
        setGames: sess.setGames,
        setPointEvents: sess.setPointEvents,
        setGameReports: sess.setGameReports,
        setActiveSession: sess.updateActiveSession,
        onExit: () => navigate(paths.comunidade(community.id)),
        onFinishSession: shell.handleFinishSession,
      })}
    />
  );
}
```

Em `src/app/routes/globalRoutes.tsx`, a rota legada:

```tsx
export function LegacyActiveSessionRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, play } = shell;
  const phase = derivePhase(sess.activeSession, sess.games);
  const resolution = resolveLegacyLiveSessionRoute({
    activeSessionCommunityId: sess.activeSession?.communityId ?? null,
    hasActiveSession: !!sess.activeSession,
    phase,
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  return (
    <SessionActiveView
      contract={buildSessionActiveViewContract({
        activeSession: sess.activeSession!,
        games: sess.games,
        pointEvents: sess.pointEvents,
        players: play.players,
        sessionTeams: selectSessionTeams(sess.teams, sess.activeSession?.id),
        gameReports: sess.gameReports,
        currentDeviceId: shell.currentDeviceId,
        setGames: sess.setGames,
        setPointEvents: sess.setPointEvents,
        setGameReports: sess.setGameReports,
        setActiveSession: sess.updateActiveSession,
        onExit: () => navigate(paths.painel),
        onFinishSession: shell.handleFinishSession,
      })}
    />
  );
}
```

`SessionActiveView` precisa do mesmo `lazy` nos dois arquivos — exporte-o de `sessionRoutes.tsx` (`export const SessionActiveView = lazy(...)`) e importe em `globalRoutes.tsx`, ou declare o `lazy` nos dois. Prefira exportar de um só lugar.

- [ ] **Step 6: Registrar**

```tsx
            <Route path="sessoes/nova" element={<SessionWizardRoute />} />
            <Route path="sessoes/ativa" element={<SessionActiveRoute />} />
```

e no nível do `AppShell`:

```tsx
          <Route path="/sessao/ativa" element={<LegacyActiveSessionRoute />} />
```

- [ ] **Step 7: Rodar, verificar e commitar**

```bash
npm run lint && npm run test:unit && npm run test:ui
```

Manual, o fluxo inteiro: comunidade → Sessões → nova sessão (URL `/sessoes/nova`), escolher atletas, gerar times, confirmar divisão e conferir que a URL vira `/sessoes/ativa`; navegar para `/painel` no meio de uma partida e voltar pelo badge do header, confirmando que placar e jogos continuam (prova do `SessionContext`, spike A1); F5 em `/sessoes/ativa` e confirmar que a sessão continua.

```bash
npx prettier@3.8.4 --check src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/app/routes/sessionRoutes.tsx src/app/routes/globalRoutes.tsx src/app/AppRouterV7.tsx src/app/AppRouterV7.spec.tsx
```

```bash
git add src/application src/app && git commit -m "plano-5 fase 3: wizard, sessao ativa e rota legada sem comunidade"
```

---

## Task 10: Cutover

**Files:**
- Delete: `src/App.tsx`
- Delete: `src/app/AppRouter.spec.tsx`
- Rename: `src/app/AppRouterV7.tsx` → `src/app/AppRouter.tsx` (substitui), `src/app/AppRouterV7.spec.tsx` → `src/app/AppRouter.spec.tsx` (substitui)
- Modify: `src/main.tsx` (flag removida)
- Modify: `src/application/appShellViewModel.ts` e `.test.ts` (remove `Page`, `Module`, `getCurrentPageTitle`, `getModuleNavigationTarget`, `getModuleNavigationItems`, `ModuleNavigationItem` e os testes deles)
- Modify: `src/app/appRoutes.ts` — nenhum; `pathForLegacyPage` continua (o `useSessionWizard` ainda emite `Page`).
- Modify: `HANDOFF.md`

- [ ] **Step 1: Confirmar o gate antes de cortar**

```bash
npm run lint && npm run lint:eslint && npm run test:unit && npm run test:ui && npm run build
```

Esperado: typecheck limpo; eslint sem **erros** (warnings pré-existentes ok); unit ≥ 734 + os novos; UI ≥ 139 + os novos; build ok.

Manual com a flag ligada (`?nav=v3`), percorrendo cada rota da árvore: `/painel`, `/agenda`, `/comunidades`, `/comunidades/:id`, `/sessoes`, `/sessoes/nova`, `/sessoes/ativa`, `/sessoes/torneios`, `/sessoes/:id`, `/pessoas`, `/pessoas/editar-atleta/:id`, `/desempenho`, `/gestao`, `/perfil`, `/perfil/sync`, `/admin`. Em cada uma: back do navegador, F5 e link colado numa aba nova.

- [ ] **Step 2: Executar a troca**

```bash
git rm src/App.tsx src/app/AppRouter.spec.tsx && git mv -f src/app/AppRouterV7.tsx src/app/AppRouter.tsx && git mv -f src/app/AppRouterV7.spec.tsx src/app/AppRouter.spec.tsx
```

Em `src/app/AppRouter.tsx`: renomear `export function AppRouterV7()` → `export function AppRouter()`.
Em `src/app/AppRouter.spec.tsx`: trocar o import e as referências `AppRouterV7` → `AppRouter`, e renomear os `describe` de `AppRouterV7 — …` para `AppRouter — …`.

Em `src/main.tsx`: remover o bloco da flag (`navParam`, `sessionStorage`, `useNavV3`) e o import de `AppRouterV7`, deixando `<AppRouter />` puro.

- [ ] **Step 3: Recuperar as asserções da spec antiga**

A `AppRouter.spec.tsx` antiga tinha quatro testes de auth que a nova precisa manter. Acrescentar ao novo arquivo:

```tsx
describe('AppRouter — autenticação', () => {
  it('renders login route without mounting the protected app', () => {
    renderAppV7('/entrar', { kind: 'anonymous' });
    expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
  });

  it('redirects protected route to onboarding and preserves destination', () => {
    renderAppV7('/comunidades', { kind: 'onboarding', userId: 'u1', playerId: 'p1' });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('leaves the login page once the session is signed in', () => {
    renderAppV7('/entrar');
    expect(screen.queryByRole('heading', { name: /entrar no sistema/i })).toBeNull();
  });

  it('navigates away from /auth/loading once the session finishes resolving', () => {
    const { rerender } = renderAppV7('/auth/loading', { kind: 'initializing' });
    expect(screen.getByText(/carregando sess/i)).toBeTruthy();

    authSessionMock.current = { ...authSessionMock.current, state: { kind: 'anonymous' } };
    rerender(
      <MemoryRouter initialEntries={['/auth/loading']}>
        <ToastProvider>
          <SessionProvider>
            <AppRouter />
          </SessionProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
  });
});
```

`authSessionMock` precisa estar acessível no escopo do arquivo (já está, é o `vi.hoisted` do topo). Renomear `renderAppV7` para `renderApp` neste passo, atualizando todas as chamadas.

- [ ] **Step 4: Limpar `appShellViewModel`**

Remover de `src/application/appShellViewModel.ts`: `Page`, `Module`, `ModuleNavigationItem`, `getCurrentPageTitle`, `getModuleNavigationItems`, `getModuleNavigationTarget`. Sobrevivem: `getAccountDisplay` e `buildPendingDeliveryNotice`.

Remover de `src/application/appShellViewModel.test.ts` os testes `getCurrentPageTitle returns contextual module titles`, `getModuleNavigationTarget routes dashboard and players modules with page changes` e `module navigation items expose staff-only management and pending sync badge`, mais os imports correspondentes.

`useSessionWizard.ts` continua com `setPage: (page: any) => void` — o `any` já estava lá e o adaptador do shell tipa o lado de fora. **Não mexer no hook.**

- [ ] **Step 5: Rodar o gate completo**

```bash
npm run lint && npm run lint:eslint && npm run test:unit && npm run test:ui && npm run build
```

Esperado: tudo verde. Se `tsc` reclamar de import órfão de `Page`/`Module` em algum arquivo, o culpado é um call site que ainda existia só para o `App.tsx` — apague-o.

- [ ] **Step 6: Atualizar o HANDOFF**

Em `HANDOFF.md`, seção 2 (Estado do repositório): trocar as linhas sobre `App.tsx` monolítico e "Fase 3: não iniciada" pelo estado real (Fase 3 concluída, `App.tsx` removido, rotas URL em produção). Acrescentar em §14 a referência a este plano.

- [ ] **Step 7: Commit e verificação de push**

```bash
npx prettier@3.8.4 --check src/app/AppRouter.tsx src/app/AppRouter.spec.tsx src/main.tsx src/application/appShellViewModel.ts src/application/appShellViewModel.test.ts HANDOFF.md
```

```bash
git add -A src/app src/main.tsx src/application HANDOFF.md && git commit -m "plano-5 fase 3: cutover para o router de rotas URL"
```

```bash
git log origin/worktree-plano-5-fase-3-navegacao..HEAD --oneline
```

Se listar commits, empurre antes de encerrar a sessão. Rollback do cutover = `git revert` do commit deste passo.

---

## Gates da Fase 3 → Fase 4

- [ ] Rotas URL globais funcionando: `/painel`, `/agenda`, `/comunidades`, `/comunidades/:id/*`, `/perfil`, `/perfil/sync`, `/admin`.
- [ ] `App.tsx` removido; `renderActiveContent()` não existe mais.
- [ ] 5 áreas internas de comunidade navegáveis como URLs aninhadas, com back/refresh/bookmark em todas.
- [ ] Sessão ativa não interrompida ao navegar entre rotas (verificado à mão na Task 9).
- [ ] Badge de sessão ativa no header, derivado de `derivePhase`, levando à sessão de qualquer rota.
- [ ] Aviso de sync pendente no header levando a `/perfil/sync`.
- [ ] `typecheck → lint:eslint → format:check (arquivos tocados) → test:unit → test:ui → build` verdes.
- [ ] `AppRouter.spec.tsx` monta o shell real, não `<App/>` num harness solto.

## Dívida deixada de propósito (Fase 4, não fazer aqui)

- Duplicação entre o detalhe da comunidade (10 abas) e as 4 áreas — consequência aceita da decisão 2. Consolidar depois.
- `/perfil` ainda não tem card de atleta nem carreira; hoje é o `SettingsModule`.
- `getModuleNavigationTarget` e amigos morrem no cutover, mas `pathForLegacyPage` sobrevive porque `useSessionWizard` ainda fala em `Page`. Matar quando o wizard for reescrito.
- `/sessoes/torneios` é **uma** rota (o `TournamentsModule` filtrado), não a árvore `torneios/*` que a spec deixou "detalhada no plano". O split "Agora vs Ligas" que a spec cogitou não foi feito: Ligas continua sendo a aba `championships` do detalhe da comunidade. Fazer o split é mudança de UI, não de navegação.
- Fora de escopo declarado da Fase 3: TS estrito, code splitting agressivo, polimento de animação.
