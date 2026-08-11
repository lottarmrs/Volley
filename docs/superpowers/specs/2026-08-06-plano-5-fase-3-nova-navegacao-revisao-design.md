# Plano 5 — Fase 3 (Nova Navegação): Design da IA Revisada

> **Spec de design.** Revisa a arquitetura de informação da Fase 3 do Plano 5 em resposta ao
> `impeccable critique` de 2026-08-05 (score 24/40, 3 P0s — snapshot em
> `.impeccable/critique/2026-08-05T17-04-53Z__lano-5-screen-contracts-reset-navigation-design-md.md`).
> Substitui a IA da seção 6 (`2026-07-31-plano-5-screen-contracts-reset-navigation-design.md`
> §6.1–6.8) onde conflitar. A spec base do produto (`2026-07-22-scalable-product-restructure-design.md`
> §12) continua como autoridade da IA aprovada; esta spec a implementa **com URLs aninhadas**
> (deep-link full), corrigindo o carve-out state-driven da spec original do Plano 5.

## Contexto

- **Fase 2 (Screen Contracts)** concluída (PR #17): 9 telas em `ScreenContract<Model, Intent>`,
  views isoladas das props do shell.
- **Spike A1** (PR #20 draft): `SessionContext` elevado à raiz (`main.tsx`) — a sessão ativa
  sobrevive a remontagem da árvore (`AppRouter` v7 fará `<App/>` remontar ao navegar). Gate de
  infra da Fase 3 satisfeito.
- **Critique da Fase 3** (score 24/40): 3 P0s — Agenda (divergência da base §12), Gestão (erro
  de categoria: admin global dentro de comunidade), deep-linkability (§6.1 promete URLs mas
  carve-out o interior da comunidade como state-driven).
- Produto está pós-reset (2026-08-03), pré-adoção. A IA reconciliada aquí assume
  **community-centric** (base §12) — não "flat" — porque a regra de produto
  *comunidade-scoped vs usuário-scoped* é clara e resolve os P0s por construction.

## Decisões estruturais

1. **IA community-centric com URLs aninhadas** (base §12 feita direito). Comunidade é a
   unidade organizadora; `/perfil` é a única âncora global de info pessoal. Não há carve-out
   state-driven — todas as áreas são rotas URL.
2. **Page vira rota aninhada** (deep-link full). Back/refresh/bookmark/share funcionam em tudo.
   Resolve P0-3 por construction.
3. **Comunidades é top-level** (`/comunidades`), não sub-page de `/jogadores`. `CommunitiesView`
   é autossuficiente.
4. **Migração: router-in-parallel + cutover único.** Novo `AppRouterV7` atrás de feature flag;
   validado contra as 136 specs UI; corta num commit com rollback trivial.

## 1. Arquitetura e rotas

Regra: comunidade-scoped dentro de `/comunidades/:id/*`; usuário-scoped e cross-comunidade
ficam globais.

```
AppRouter.tsx
├── /entrar, /cadastro, /recuperar-senha, /auth/* (público — intocado)
├── <AuthGuard>
│   └── <AppShell>                        ← extrato de App.tsx (sidebar/header/toast/motion)
│       ├── /  → Navigate to /painel
│       │
│       │  ── Globais (não escopo de comunidade) ──
│       ├── /painel                       ← Dashboard (resumo inter-comunidades)
│       ├── /agenda                       ← próximas sessões cross-comunidades (base §12 linha 289)
│       ├── /comunidades                 ← lista + descoberta + criar
│       ├── /comunidades/:id             ← CommunityShell
│       │   ├── /comunidades/:id         ← Visão geral (index/default)
│       │   ├── /comunidades/:id/sessoes ← Sessões: wizard, ativa, lista, torneios/campeonatos
│       │   │   ├── /comunidades/:id/sessoes/nova        ← session-wizard
│       │   │   ├── /comunidades/:id/sessoes/ativa        ← session-active (transitória)
│       │   │   ├── /comunidades/:id/sessoes/:sessionId   ← ver sessão/histórico
│       │   │   └── /comunidades/:id/sessoes/torneios/* ← torneios/campeonatos (sub-rotas detalhadas no plano de implementação)
│       │   ├── /comunidades/:id/pessoas  ← Pessoas: jogadores + membros + convites
│       │   │   └── /comunidades/:id/pessoas/editar-atleta/:playerId ← player-edit
│       │   ├── /comunidades/:id/desempenho ← Ranking + Histórico + estatísticas + exportadores
│       │   └── /comunidades/:id/gestao   ← settings DA comunidade: regras, WhatsApp, membership
│       │
│       ├── /perfil                      ← Meu perfil: atleta, FUT card, carreira, sync
│       │   └── /perfil/sync             ← conflitos/repair (AccountSyncView) — first-class sub-rota
│       ├── /admin                       ← Gestão GLOBAL staff-only (roles de usuário)
│       └── * → Navigate to /painel
```

### Mapeamento Modules/Pages atuais → rotas

| Atual | Novo |
|------|-----|
| `dashboard` | `/painel` |
| `torneios` | `/comunidades/:id/sessoes/torneios/...` (dobrado em Sessões) |
| `players` | `/comunidades/:id/pessoas` |
| `player-edit` (de `players` e de `wizard`) | `/comunidades/:id/pessoas/editar-atleta/:playerId` (rota única; `onBack` via `navigate(-1)`) |
| `session-wizard` | `/comunidades/:id/sessoes/nova` |
| `session-active` | `/comunidades/:id/sessoes/ativa` (transitória) |
| `ranking` | `/comunidades/:id/desempenho` (tab Ranking) |
| `historico`/`history` | `/comunidades/:id/desempenho` (tab Histórico) |
| `communities` (page) | `/comunidades` (top-level) |
| `conta` (Nuvem & Conta) | `/perfil/sync` |
| `configuracoes` | `/comunidades/:id/gestao` |
| `gestao` (admin global) | `/admin` (staff-only, rota global) |

### P0s/P1s resolvidos

- **P0-1 Agenda:** restaurado a área global `/agenda` (base §12 linha 289), não sub-seção de
  Início. ✓
- **P0-2 Gestão:** split — settings da comunidade em `/comunidades/:id/gestao`; admin de
  plataforma (roles) vira `/admin` global. Erro de categoria extinto. ✓
- **P0-3 deep-linkability:** URLs aninhadas — back/refresh/bookmark/share em tudo. ✓
- **P1-1 Sessões sobrecarregada:** Sessões vira rota-pai com sub-rotas (router = sub-estrutura). ✓
- **P1-2 badge de sync:** `SessionContext` + `/perfil/sync` globais; badge no header (`AppShell`)
  persistente, visível de qualquer rota. ✓
- **P1-3 courtside:** badge no header → `navigate('/comunidades/:id/sessoes/ativa')`, one-tap
  de qualquer rota. ✓
- **P1-4 orientação:** URL carrega comunidade+área; `getCurrentPageTitle` deriva de
  `useLocation()`. Breadcrumb natural do path. ✓

### Decisões pendentes / micro (polish futuro, fora desta spec)

- **Default `/`:** `/` → `/painel` por ora. Atalho "auto-enter last community" (P2-3 critique)
  fica como polish. Sem custo single-comunidade real (`/painel` mostra a única comunidade).
- **Empty states** (`/painel` sem comunidades, áreas de comunidade sem dados): UI, detalhados no
  plano de implementação, não na spec de IA.
- **Split "Agora vs Ligas" dentro de `/sessoes/torneios/`**: detalhe interno de sub-rotas de
  torneio, refinado no plano de implementação.

## 2. Estratégia de migração (router-in-parallel + cutover)

### Ponto de substituição

Hoje `AppRouter.tsx:29` → `<Route path="/*" element={<App />} />` dentro de `<AuthGuard>`. O
`<App/>` é o monólito de 1213 linhas (sidebar + header + `<Suspense>{renderActiveContent()}</Suspense>`).
Fase 3: substituir `/*` → `<App/>` por `/*` → `<AppShell/>` renderizando `<Outlet/>`; as rotas
filhas (árvore da Seção 1) viram `<Route>` aninhadas. `AppRouter.tsx` é o único entrypoint que
muda no cutover.

### Coexistência

Dois `AppRouter` coexistem atrás de feature flag durante a janela de paralelo:

1. `src/app/AppRouter.tsx` (atual) — `/*` → `<App/>` switch. Intocado.
2. `src/app/AppRouterV7.tsx` (novo) — `/*` → `<AppShell/>` + rotas URL aninhadas.

`main.tsx` seleciona qual montar baseado em feature flag (`VITE_NAV_V3` env ou `?nav=v3` query
pra teste manual). Em produção, flag off até o cutover.

> `ponytail:` a flag é var local de entrypoint, não config de runtime persistida — no cutover,
> `AppRouterV7` vira `AppRouter`, o velho é deletado e a flag removida no mesmo commit. A flag
> existe só pela janela de paralelo.

### AppShell (extrato do App.tsx)

Componente novo `src/app/AppShell.tsx` contém **tudo do `App.tsx` que não é rota**: sidebar
(drawer), header, `<AnimatePresence>`+`<motion.div>` keyed por `location.pathname`+`location.search`
(hoje keyed por `activeModule + '_' + page` — `App.tsx:1120`), `<Suspense>` com `<Outlet/>`,
`VutRevealModal` global, e é envolvido pelos `ToastProvider`/`SessionProvider` existentes.

- Sidebar reage ao contexto: globais (`/painel`, `/agenda`, `/comunidades`, `/perfil`, `/admin`
  staff) quando fora de comunidade; as 5 áreas internas (`sessoes`/`pessoas`/`desempenho`/
  `gestao`/Visão geral) + "Voltar" quando dentro de `/comunidades/:id/*`. Active-state via
  `useMatch`/`useLocation`, não `activeModule` state. **É a única mudança de UI visível da
  Fase 3.**
- `getCurrentPageTitle` deriva de `useLocation()`, não de `page`/`activeModule` state.

### Cutover (commit único)

Quando `AppRouterV7` tem tudo verde contra as 136 specs UI (flag on) + suite completa
(`lint`/`test:unit`/`test:ui`/`build`):

1. Um commit: `AppRouterV7.tsx` → sobre `AppRouter.tsx`; o velho (switch) deletado; `<App/>`
   reduzido a nada; flag removida do `main.tsx`; `AppRouter.spec.tsx` atualizada.
2. Rollback = `git revert`.

### Fora de escopo do cutover

TS estrito, code splitting agressivo, polimento de animação. Fase 3 é decompor + URL.

### Ordem de construção (pré-cutover, branch `feature/fase-3-navegacao`)

1. `AppShell` — extrai sidebar+header+motion+Suspense+Outlet do `App.tsx`, sem rotas. Spec
   `AppRouter.spec.tsx` ajustada.
2. Rotas globais: `/painel`, `/agenda`, `/comunidades`, `/perfil`, `/admin` — cada `lazy()` do
   componente existente (já em `ScreenContract`).
3. Rotas de comunidade: `/comunidades/:id` CommunityShell + 5 áreas.
4. Sub-rotas de sessões e pessoas.
5. Rewire dos `ScreenContract` inputs (Seção 3).
6. Gate completo com flag on → cutover.

## 3. Mudanças no ScreenContract input

A migração **não** reescreve cada contract. O codebase já tem uma camada declarativa de
navegação (`ShellNavigationTarget` + helpers `get*NavigationTarget()` em `appShellViewModel.ts`,
testados). A Fase 3 **refatora essa camada pra emitir paths URL**.

### Mudança central: ShellNavigationTarget → path

```ts
// antes
export interface ShellNavigationTarget { activeModule: Module; page?: Page; selectedHistorySessionId?: string | null; }
// depois (Fase 3)
export type ShellNavigationTarget = string; // path URL
```

Helpers trocam o retorno (precisam de `communityId` no input, que a navegação flat omite):

| Helper (antes) | Path (depois) |
|---|---|
| `getDashboardNavigationTarget()` | `'/painel'` |
| `getPlayersNavigationTarget()` | `'/comunidades/:communityId/pessoas'` |
| `getCommunitiesNavigationTarget()` | `'/comunidades'` |
| `getLiveSessionNavigationTarget()` | `'/comunidades/:communityId/sessoes/ativa'` |
| `getHistoryNavigationTarget()` | `'/comunidades/:communityId/desempenho'` |
| `getHistorySessionNavigationTarget(sessionId)` | `'/comunidades/:communityId/desempenho?sessao=sessionId'` |

`applyShellNavigationTarget` vira `navigate(target)`. `selectedHistorySessionId` vira query param
`?sessao=` (deep-linkable).

### onBack por origem (resolve cross-cutting do player-edit)

`player-edit` é renderizado de **dois** lugares (wizard e players). Hoje `onBack` é closure
distinta por ponto de montagem. Com router: **`onBack: () => navigate(-1)`** — a rota anterior
já é o pai certo. Elimina a bifurcação; `buildPlayerEditViewContract` deixa de precisar de
`onBack` distintos.

### applyGuestPlayer (costura no shell)

Hoje no `App.tsx` `applyGuestPlayer` toca `setPlayers`, `updateSession`, `setPage('player-edit')`.
Fase 3: `setPage('player-edit')` → `navigate('/comunidades/:id/pessoas/editar-atleta/:playerId')`.
A closure continua no shell (`AppShell`), passada pro `buildSessionWizardContract` — o contract
não sabe que é URL.

### useSessionWizard (setPage interno)

`useSessionWizard.ts:320,335,344,353` chamam `setPage(result.nextPage)` em 4 pontos. Fase 3: o
hook recebe `navigate` em vez de `setPage`, e `result.nextPage` traduz pra path num `switch`.
Pequena: 4 `setPage` → 4 `navigate`.

### Resumo por camada

| Camada | Mudança |
|---|---|
| `appShellViewModel.ts` | `ShellNavigationTarget` vira `string`; 6 helpers trocam retorno p/ path; recebem `communityId`. |
| `appShellViewModel.test.ts` | Assertions atualizadas (target = path). |
| `App.tsx` → `AppShell` | `applyShellNavigationTarget` vira `navigate`; closures usam `navigate`/`navigate(-1)`; 24 `setPage`/`handleNav` somem. |
| `useSessionWizard.ts` | 4 `setPage(result.nextPage)` → `navigate(path)`. |
| `ScreenContract` de cada tela | **Intocado.** Contracts recebem os mesmos callbacks; só a implementação deles (no shell) muda. |
| Views (`.tsx`) | **Intocadas.** |

> A Fase 2 (`ScreenContract`) e o spike A1 (`SessionContext`) já isolaram views e state de
> sessão. **A Fase 3 é quase inteiramente shell-nível + camada de navegação.** Nenhuma view
> muda. Por isso o cutover é seguro e as 136 specs UI são regressão direta.

### Edge cases cobertos pela IA

- **Rota `:id` inválida (comunidade inexistente/sem permissão):** `<CommunityShell>` valida o
  `id` em `communities[]`; se não existe, `<Navigate to="/comunidades">`.
- **`session-active` sem sessão ativa:** rota checa `activeSession` no `SessionContext`; se
  nenhuma, `<Navigate to="/comunidades/:id/sessoes">`. Badge no header só aparece se há sessão.
- **`/admin` sem `isStaff`:** guard dedicado → `<Navigate to="/painel">`.
- **Zero comunidades:** `/painel` mostra empty state → "criar comunidade" (`/comunidades`).

## Gates (Fase 3 → Fase 4)

- Rotas URL globais funcionando (`/painel`, `/agenda`, `/comunidades`, `/comunidades/:id/*`, `/perfil`, `/admin`).
- `App.tsx` decomposto — `renderActiveContent()` removido; shell encolhe de 1213 linhas.
- 5 áreas internas de comunidade navegáveis como URLs aninhadas.
- Sessão ativa não interrompida ao navegar (`SessionContext`, spike A1).
- Badge de sync pendente no header (visível de qualquer rota).
- `typecheck → test:unit → test:ui → build` verde.
- `AppRouter.spec.tsx` não envolve mais `<App/>` num harness livre de `<AppShell>`.

## Próximo passo

Invocar `superpowers:writing-plans` para criar o plano de implementação detalhado da Fase 3,
seguindo a ordem de construção (Seção 2) com TDD por rota/sub-rota. Gate §6.9 (critique antes de
refatorar) satisfeito — este doc é a revisão.
