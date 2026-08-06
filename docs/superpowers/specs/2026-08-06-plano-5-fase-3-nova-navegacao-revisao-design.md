# Plano 5 — Fase 3 (Nova Navegação): Revisão da IA — Estado do Brainstorm

> **Status: BRAINSTORM EM ANDAMENTO.** Este doc captura as decisões tomadas até 2026-08-06, antes do reset da conversa. A spec final da Fase 3 será escrita a partir destas decisões (Seções 2 e 3 ainda não detalhadas — ver "Falta").
> Contexto: `impeccable critique` da IA da Fase 3 (score 24/40, 3 P0s) em `.impeccable/critique/2026-08-05T17-04-53Z__lano-5-screen-contracts-reset-navigation-design-md.md`. Brainstorm via `superpowers:brainstorming`.

## Decisões tomadas (em ordem)

1. **Premissa structural → revisitada.** Decisão inicial foi "adiar a hierarchy community-centric, manter flat (routes 1:1 com Modules atuais)". **Revisada** pela observação do usuário: jogadores devem ficar **dentro** das comunidades, e o único caminho global é `/perfil` (info pessoal). Isso é a hierarchy community-centric de volta (base spec §12), agora feita **com URLs aninhadas** (não state-driven). Regra de produto limpa: comunidade-scoped vs usuário-scoped.

2. **Page vira rota aninhada (deep-link full).** Não há carve-out state-driven no interior da comunidade. `/comunidades/:id/pessoas` é URL — back/refresh/bookmark/share funcionam. **Resolve P0-3 por construction.**

3. **Comunidades é top-level** (`/comunidades`), não sub-page de `/jogadores`. Hoje `communities` é um `Page` dentro do Module `players` (`appShellViewModel.ts:44`) — acoplamento artefactual. `CommunitiesView` é autossuficiente (championships, presence, WhatsApp, rules).

4. **Estratégia de migração: router-in-parallel + cutover único (Abordagem A).** Constrói o novo `AppRouter` (react-router v7, rotas URL aninhadas) ao lado do `App.tsx` switch, atrás duma flag; valida contra as 136 specs UI; corta num commit de cutover. Espelha Plano 5 Fase 1 (rehearsal/cutover).

## Árvore de rotas final (Seção 1 — aprovada)

Regra: comunidade-scoped dentro de `/comunidades/:id/*`; usuário-scoped e cross-comunidade globais.

```
AppRouter.tsx
├── /entrar, /cadastro, /recuperar-senha, /auth/* (público — intocado)
├── <AuthGuard>
│   └── <AppShell>                        ← extrato de App.tsx (sidebar/header/toast)
│       ├── /  → Navigate to /painel
│       │
│       │  ── Globais (não escopo de comunidade) ──
│       ├── /painel                       ← Dashboard (resumo inter-comunidades)
│       ├── /agenda                       ← próximas sessões cross-comunidades (P0-1 restaurado a área global, base §12 linha 289)
│       ├── /comunidades                 ← lista de comunidades + descoberta + criar
│       ├── /comunidades/:id             ← CommunityShell
│       │   ├── /comunidades/:id         ← Visão geral (index/default)
│       │   ├── /comunidades/:id/sessoes ← Sessões: wizard, ativa, lista, torneios/campeonatos
│       │   │   ├── /comunidades/:id/sessoes/nova        ← session-wizard
│       │   │   ├── /comunidades/:id/sessoes/ativa        ← session-active (transitória)
│       │   │   ├── /comunidades/:id/sessoes/:sessionId   ← ver sessão/histórico
│       │   │   └── /comunidades/:id/sessoes/torneios/... ← torneios/campeonatos
│       │   ├── /comunidades/:id/pessoas  ← Pessoas: jogadores + membros + convites + atletas vinculados
│       │   │   └── /comunidades/:id/pessoas/editar-atleta/:playerId ← player-edit
│       │   ├── /comunidades/:id/desempenho ← Ranking + Histórico + estatísticas + exportadores
│       │   └── /comunidades/:id/gestao   ← settings DA comunidade: regras, WhatsApp templates, membership
│       │
│       ├── /perfil                      ← Meu perfil: dados do atleta, FUT card, carreira, sync nuvem
│       │   └── /perfil/sync             ← conflitos/repair (AccountSyncView workflow) — P1 first-class sub-rota
│       ├── /admin                       ← Gestão GLOBAL staff-only (roles de usuário, saúde da plataforma) — P0-2 resolvido
│       └── * → Navigate to /painel
```

### Mapeamento Modules/Pages atuais → rotas

| Atual | Novo |
|------|-----|
| `dashboard` | `/painel` |
| `torneios` | `/comunidades/:id/sessoes/torneios/...` (dobrado em Sessões) |
| `players` | `/comunidades/:id/pessoas` |
| `player-edit` (de `players` e de `wizard`) | `/comunidades/:id/pessoas/editar-atleta/:playerId` (rota única; `from` determina `onBack`) |
| `session-wizard` | `/comunidades/:id/sessoes/nova` |
| `session-active` | `/comunidades/:id/sessoes/ativa` (transitória) |
| `ranking` | `/comunidades/:id/desempenho` (tab Ranking) |
| `historico`/`history` | `/comunidades/:id/desempenho` (tab Histórico) |
| `communities` (page) | `/comunidades` (top-level) |
| `conta` (Nuvem & Conta) | `/perfil/sync` |
| `configuracoes` | `/comunidades/:id/gestao` |
| `gestao` (admin global) | `/admin` (staff-only, rota global) |

### P0s/P1s resolvidos pela IA reconciliada

- **P0-1 Agenda:** restaurado a área global `/agenda` (base §12 linha 289), não sub-seção de Início. ✓
- **P0-2 Gestão:** split — settings da comunidade ficam em `/comunidades/:id/gestao`; admin de plataforma (roles) vira `/admin` global. Erro de categoria extinto. ✓
- **P0-3 deep-linkability:** URLs aninhadas — back/refresh/bookmark/share em tudo. ✓
- **P1-1 Sessões sobrecarregada:** Sessões vira rota-pai com sub-rotas (router = sub-estrutura). ✓ (split "Agora vs Ligas" é detalhe interno de `torneios/`)
- **P1-2 badge de sync:** `SessionContext` + `/perfil/sync` globais; badge no header (`AppShell`) persistente, visível de qualquer rota. ✓
- **P1-3 courtside:** badge no header → `navigate('/comunidades/:id/sessoes/ativa')`, one-tap de qualquer rota. ✓
- **P1-4 orientação:** URL carrega comunidade+área; `getCurrentPageTitle` deriva de `useLocation()`. Breadcrumb natural do path. ✓

### Decisões pendentes / micro

- **Default `/`:** `/` → `/painel` por ora. Atalho "auto-enter last community" (P2-3 critique) fica como polish futuro. Sem custo single-comunidade real (`/painel` mostra a única comunidade anyway).

## O que SAI do App.tsx

`useState<Module>`, `useState<Page>`, `renderActiveContent()`, ~120 `setPage`/`handleNav` calls. Shell encolhe de 1213 linhas pra `AppShell` + rotas lazy. Views (`ScreenContract` Fase 2) e `SessionContext` (spike A1) ficam intocados na superfície; só a costura de navegação dos contracts muda de `setPage()` pra `navigate()`.

## Falta (Seções 2-3 do brainstorm, a detalhar depois do reset)

- **Seção 2 — Estratégia de migração/cutover (router-in-parallel):** flag/env pra selecionar router antigo vs novo; como o `AppRouter` atual (`/*` → `<App/>`) coexiste com o novo; commit de cutover; rollback. Janela de paralelo e specs UI validando contra o router novo antes de cortar.
- **Seção 3 — O que muda no `ScreenContract` input:** cada `build*Contract` que recebia `onBack`/navigation closures com `setPage` agora recebe `navigate`-based closures (ou o shell passa um `navigate` no input). `applyGuestPlayer` (toca `setPlayers`, `updateSession`, `setPage('player-edit')`) vira `navigate('/comunidades/:id/pessoas/editar-atleta/:id')`. Detalhar por tela.
- **Spec final** escrita em `docs/superpowers/specs/` (provavelmente amend ou novo doc), com self-review, commit, e pedido de review do usuário.
- **Transição pra `superpowers:writing-plans`** para o plano de implementação da Fase 3.

## Estado do branch e commits já feitos (preservados no reset)

- Branch: `feature/session-context-raiz` (PR #20 draft — spike A1).
- Commits neste branch (são preservados por estarem no remote):
  1. `74e5d1d` refactor(session): spike A1 — SessionContext na raiz (gate da Fase 3)
  2. `e7e2fc4` docs(plano-5): registrar spike A1 no HANDOFF + master program
  3. `5252b72`/`088edf1` (PR #18) fix(format): prettier 3.8.4 endOfLine lf — já no main
- Critique persistido: `.impeccable/critique/2026-08-05T17-04-53Z__lano-5-screen-contracts-reset-navigation-design-md.md`
- PR #20 gates verdes: lint + build + test:unit 699 + test:ui 136.
- **Este doc** precisa ser commitado antes do reset.

## Próxima ação (depois do reset)

1. Commitar este doc.
2. Atualizar HANDOFF com o estado do brainstorm da Fase 3 (após spec final escrita).
3. Continuar brainstorm: Seção 2 (migração/cutover) e Seção 3 (ScreenContract input changes).
4. Escrever spec final da Fase 3 → self-review → review do usuário → `superpowers:writing-plans`.
