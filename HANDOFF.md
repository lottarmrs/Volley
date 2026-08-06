# HANDOFF - Panelinha App

> Documento operacional atualizado em 2026-08-05.
> Este arquivo substitui o handoff histórico de 2026-06-24, que continha estado de working tree e pendências já superadas.

## Estado Atual

- Branch local: `feature/session-context-raiz` (spike A1, PR #20 draft). `main` alinhado com `origin/main` após Fase 2 (PR #17) e fix de formato (PR #18).
- Produto: app React + Vite local-first para vôlei amador, com sync opcional via Supabase.
- Prioridade atual do framework: Produto Escalável, depois Experiência.
- Foco imediato: Plano 5 — **Fase 3 (Nova Navegação)**. Spike A1 (SessionContext na raiz — gate de infra da Fase 3) concluído em 2026-08-05 (ver seção Pós-Spike A1 abaixo). `impeccable critique` da IA rodado (score 24/40, 3 P0s) em 2026-08-05 (snapshot em `.impeccable/critique/`). **Brainstorm da revisão da IA em andamento** — decisões e árvore de rotas reconciliada em `docs/superpowers/specs/2026-08-06-plano-5-fase-3-nova-navegacao-revisao-design.md`. Fase 2 (Screen Contracts) concluída em 2026-08-04. Fase 1 (reset + cutover) concluída em 2026-08-03.
- Pré-Fase 3: brainstorm concluiu que a IA adotada é **hierarchy community-centric com URLs aninhadas** (base spec §12 feita direito), não flat. P0-1 Agenda (rota global), P0-2 Gestão split (`/admin` global + `/comunidades/:id/gestao`), P0-3 deep-linkability (rotas aninhadas) — todos resolvidos pela IA reconciliada. Falta detalhar Seções 2 (migração/cutover router-in-parallel) e 3 (changes no `ScreenContract` input: `setPage`→`navigate`), escrever spec final, review do usuário, e invocar `superpowers:writing-plans`.

## Pós-Spike A1 (Plano 5 — gate de infra da Fase 3)

Pré-requisito da Fase 3 (Nova Navegação) satisfeito em **2026-08-05**. O estado da sessão
ativa (`activeSession`/`games`/`pointEvents`/`gameReports`/`teams`/`sessions`/`sessionReports`)
vivia em `useSessions()` chamado no `App.tsx` (ho local do shell). Hoje `App.tsx` nunca
desmonta (`AppRouter` é `/*` catch-all), então o state sobrevive; mas na Fase 3 (rotas URL
react-router v7) a árvore remonta ao navegar e perderia placar/sorteio/heartbeat sem um
contexto acima de `<App/>`.

- **Spike A1 (escopo completo, escolhido pelo usuário):** extrai `SessionContext` que detém o
  state de `useSessions()` e o eleva à raiz (`main.tsx`), acima de `<AppRouter/>`. Padrão
  espelhado em Toast (PR #16): Context + hook consumer no mesmo `use*.ts`, Provider one-liner
  que injeta o store externo — sem reimplementar `useSessions` (já persiste/normaliza/limpa
  órfãos/propaga knockout).
- **Arquivos:** `src/ui/common/useSession.ts` (Context + `SessionContextValue` + `useSession()`
  com guard PT-BR), `src/ui/common/SessionProvider.tsx` (Provider one-liner),
  `src/main.tsx` (`<SessionProvider>` dentro de `<ToastProvider>` envolvendo `<AppRouter/>`),
  `src/App.tsx` (`useSessions()` → `useSession()`, nome `sess` preservado, ~120 refs intocadas),
  `src/app/AppRouter.spec.tsx` (harness envolve `<AppRouter/>` em `<SessionProvider>`).
- **Gate de infra Fase 2 intacto:** views e o novo contexto não importam `@storage`/`@infra`.
- **Verificação:** `lint` (tsc --noEmit) + `test:unit` (699) + `test:ui` (136) + `build` verdes.
- **Prova do gate A1:** Provider acima de `<App/>` detém o state — desmontar/remontar `<App/>`
  (rotas URL Fase 3, StrictMode double-mount, HMR) não destrói a sessão ativa.
- **Não toca em rotas URL (Fase 3);** views continuam via `ScreenContract` (Fase 2 preservada).
  `useCloudSync` sem redesign: `CloudSyncDeps` inalterada, só a origem dos setters.
- **Estado:** spike A1 fechado. Próxima ação = Fase 3 precedida do `impeccable` critique (§6.9).

## Pós-Fase 2 (Plano 5 — Screen Contracts)

Nove telas migradas para `ScreenContract<Model, Intent>` em `src/application/screens/<screen>/`
(Model, Intents, Contract, Contract.test por tela), com a view (`.tsx`) recebendo `{ contract }`
em vez de dezenas de props individuais. Navegação/roteador **não mudaram** — `App.tsx`
continua shell; só a forma de passar props mudou.

- **Telas migradas:** SessionWizard, SessionActiveView, PlayerEditView, CommunitiesView,
  PlayersView, Dashboard, HistoryView, AccountSyncView, GestaoView (9/9).
- **Gate de infra verde:** `grep -rn "from '@infra/\|from '@storage/" src/components/ src/app/`
  → **vazio** (zero views importam infra/storage; a camada auth foi decouplada de @infra via
  porta de domínio `@app/authClient` + context na Task 2.5).
- **Padrão estabelecido:** Model = dados prontos p/ render (read-only); Intent = união
  discriminada de ações; `dispatch` (async) roteia Intents → callbacks do input contract.
  Callbacks com retorno síncrono consumido na view (ex.: `addCommunity` lê `.id`, championship
  `AppResult` lê `.ok`/`.error`) ficam no Model como function refs em vez de rotear pelo async
  `dispatch` (que engoliria o return). Hook interno forte (ex.: `useLiveSession` em
  SessionActiveView, `useProfilesAdmin` em GestaoView) permanece interno — o contract envolve
  só os props externos + navegação.
- **Verificação:** `npm run lint` (tsc) verde, `npm run test:unit` 699 testes passam,
  `npm run test:ui` 136 testes (27 files) passam, `npm run build` verde. `npm run lint:eslint`
  reporta 2 errors **pré-existentes** (`App.tsx:1129` ref-access no `renderActiveContent`,
  `usePlayerCareer.ts` `only-export-components`) e 363 warnings — ambos anteriores à Fase 2
  (confirma via git blame, commits de 2026-06~07); não introduzidos nem agravados pela migração.
- **Estado:** gate de Fase 2 fechado. Próxima ação: Fase 3 (Nova Navegação) — invocar
  skill `impeccable` critique antes, conforme spec do Plano 5 seção 6.9.

## Pós-Cutover Plano 5 (Fase 1)

Reset de produção ensaiado num projeto Supabase isolado e executado em produção
em **2026-08-03**. Conta-alvo: `<master-account-uuid>` (`testeadm`,
role `master`) — a única com comunidade. Detalhes completos em
`docs/operations/reset-cutover-runbook.md`.

- **Data do cutover:** 2026-08-03.
- **Account UUID resetado:** `<master-account-uuid>`.
- **Contagens pré → pós-reset (produção):** communities 1→0, community_players
  2→0, community_members 2→0, players 2→2 (canônicos preservados), auth_users
  2→2 (fora do reset), modification_logs 8→8 (preservados), fk_count 62→62.
- **Advisors:** sem regressão — mesmos ERRORs pré-existentes em views
  `security_definer_view` (`community_profile_summary`, `career_totals`),
  nenhum novo referente ao reset.
- **Defeitos corrigidos durante a operação:** 3 fatais descobertos no ensaio
  (player canônico apagado; guard de último owner no cascade; trigger de
  auditoria quebrando FK) + 1 durante o cutover (defeito 7: bypass BEFORE
  DELETE retornava `new`=NULL e cancelava o cascade). Todos na migration
  `20260801120000_reset_product_data_preserve_canonical.sql`, aplicada em
  produção.
- **Rollback:** snapshot de usernames + backup lógico em
  `docs/operations/snapshots/2026-08-03-*`; `handle_new_user` é idempotente
  (re-login recria o player canônico se preciso).
- **Estado:** produção estável. Fase 1 fechada; Fase 2 (Screen Contracts) é o
  próximo passo.

## Supabase

O projeto usa Supabase apenas para conta, backup/sincronização, comunidades, RBAC, avatar approval, vínculo atleta-conta e auditoria.

Para provisionar ou restaurar ambiente, aplique todos os arquivos em `supabase/migrations` em ordem cronológica de nome:

1. `schema.sql`
2. `20260610161203_backend_operational_sync.sql`
3. `20260610161236_upsert_conflict_targets.sql`
4. `20260610161256_global_athlete_identity.sql`
5. `20260610195250_harden_function_security.sql`
6. `20260615200155_point_event_taxonomy.sql`
7. `20260617180615_community_players_optimization.sql`
8. `20260618154732_point_event_kind_and_assist.sql`
9. `20260623133702_game_multiset_sets_and_targets.sql`
10. `20260623133849_drop_redundant_game_multiset_columns.sql`
11. `20260624133117_player_avatars_approval.sql`
12. `20260624133200_player_evaluations.sql`
13. `20260624133252_link_user_to_player_with_approval.sql`
14. `20260624133328_unlink_player_rpc.sql`
15. `20260624133529_rbac_global_roles_and_hardening.sql`
16. `20260624134502_harden_trigger_functions.sql`
17. `20260624141708_role_management_rpc.sql`
18. `20260624203424_community_model_v2.sql`
19. `20260624204113_community_join_system.sql`
20. `20260625182618_fix_profile_signup_role.sql`
21. `20260625192530_community_discovery.sql`
22. `20260629201136_harden_avatar_storage_update_policy.sql`
23. `20260629212554_linked_player_self_read.sql`
24. `20260707143343_community_member_role_remove_rpc.sql`

Notas:

- Migrations recentes usam RLS, grants, `SECURITY DEFINER` com `set search_path = public`, revokes para `public/anon` e grants para `authenticated` onde necessário.
- Mudanças sensíveis de membros passam por RPCs (`set_community_member_role`, `remove_community_member`), não por update/delete direto de tabela no browser.
- Projetos Supabase novos podem exigir conferência de Data API exposure mesmo quando os grants SQL estão corretos.

## Verificação Atual

Última auditoria local antes desta atualização:

- `npm run lint`: passou.
- `npm run test:unit`: 297 testes passaram.
- `npm run test:ui`: 50 testes passaram.
- `npm run build`: passou.
- `npm run lint:eslint`: 0 errors, 347 warnings.
- `npm run format:check`: passou.
- `npm audit --omit=dev`: apontava Vite/Babel/esbuild; `npm audit fix` atualizou Vite/Babel no lockfile, restando uma vulnerabilidade baixa transitiva de `esbuild`.

## Dívida Técnica Conhecida

- `src/logic/migrations.ts` é grande e concentra muitos `any`, por ser a camada de compatibilidade/importação local.
- `src/components/session/SessionWizard.tsx` segue grande e com muitos casts; é candidato a fatiamento quando voltarmos à Experiência/UX.
- Bundle principal ainda é grande; considerar code splitting antes de polimento de performance.
- `test:unit` agora descobre automaticamente `src/**/*.test.ts`, reduzindo manutenção ao criar testes novos.

## Ordem Recomendada

1. Continuar Produto Escalável com fatias pequenas e verificáveis.
2. Priorizar limites de aplicação, sincronização e observabilidade operacional antes de novas telas.
3. Manter UI atual durante a fase escalável.
4. Deixar UI/esqueumorfismo para a fase Experiência.
