# Dados online, parte 2 — Peladas e histórico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com conta, toda pelada nasce marcada e com a lista aberta (a pelada rápida é a exceção,
com a lista preenchida e fechada na hora), a tela da pelada conduz lista → fechar → sortear →
iniciar → placar → encerrar, e peladas, times, jogos, pontos e relatórios são lidos e gravados
direto no banco (o placar trava sem sinal), com a pelada target avançando pelos comandos do
servidor e o sync deixando de cuidar dessas tabelas.

**Architecture:** Uma consulta `['peladas', userId]` traz o pacote das seis listas; o `useSessions`
mantém o formato e os `set*` passam a gravar comparando a lista nova com a anterior
(`persistSessionBundleChanges`). A raiz legacy grava por upsert; a raiz target só por comandos
(`targetSessionLifecycleCloudService`) e é reconstruída na leitura a partir das regras congeladas e
dos times. A ponte de tempo real passa a invalidar a consulta de peladas.

**Tech Stack:** React 19, TypeScript, `@tanstack/react-query`, Supabase JS, Vitest + RTL, Node test
runner, Postgres real (`volley_test_pg2`).

**Spec:** `docs/superpowers/specs/2026-09-30-peladas-online-design.md` (inclui a "Medição
(2026-09-30)", que fixa a sequência de comandos target usada aqui).

## Global Constraints

- Tudo online já, inclusive cada ponto; **sem fila** (a fila é da parte 3).
- Sem sinal no placar: botões de ponto, desfazer, próximo jogo e encerrar **desabilitados** e a
  faixa "Sem conexão. O placar volta quando o sinal voltar."; nada entra e nada some.
- Fora do placar, mesmo padrão da parte 1: gravação otimista, volta atrás com o toast
  "Sem conexão. Tente de novo quando o sinal voltar." (`OFFLINE_MESSAGE`), leitura com
  `OnlineLoading`/`OnlineReadError`.
- O tempo real **só invalida** consultas (ADR-RT-001).
- Raiz target: **nunca** `update`/`upsert` direto em `public.sessions` (afeta 0 linhas); só
  comandos. Iniciar = congelar regras `SESSION_EXPLICIT` → `schedule_target_session` →
  `start_target_session`. Encerrar = cancelar jogos não terminados → `finish_target_session`.
  Excluir = `cancel_target_session`.
- `scopeOperationalFetch` (filtro `authority_model = 'legacy'` do sync) **continua** como está
  (AF-TARGET-005); a leitura online é outra função.
- Ids: `id = local_id || id` e `cloudId`, como o sync.
- Na troca, com conta: apagar `STORAGE_KEYS.sessions`, `activeSession`, `teams`, `games`,
  `points`, `gameReports`, `sessionReports`. Sem "último envio".
- Sem conta: `localStorage`, como hoje (a pelada rápida no aparelho continua igual).
- **Fluxo** (spec, "Fluxo da pelada"): uma ação "Marcar pelada" com horário obrigatório, que marca
  e abre a lista numa vez; a tela da pelada (`paths.sessao`) é o centro; a pelada rápida escolhe a
  comunidade e usa a mesma pelada target com a lista preenchida e fechada na hora; o assistente de
  7 passos deixa de ser porta de entrada; "pelada" em toda a interface.
- Sem comentários novos em TS/TSX; SQL de migration com comentário curto do porquê; commits em
  português sem acento com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nada em
  produção sem ok do usuário.
- Specs que renderizam hooks online precisam de `QueryClientProvider`.

---

### Task 1: Comandos target como o app vai chamar

**Files:**
- Create: `src/infra/supabase/targetSessionLifecycleCloudService.ts`,
  `src/test/db/peladaTargetNoApp.dbtest.ts`
- Create: `src/application/targetSessionLifecycle.ts` (+ `.test.ts`)

**Interfaces:**
- Produces:
  - `createTargetSessionLifecycleCloudService(client: RpcClient)` →
    `{ readRevision(sessionId): Promise<number>; freezeRules(sessionId, payload: object): Promise<void>; schedule(sessionId): Promise<void>; start(sessionId): Promise<void>; finish(sessionId): Promise<void>; cancel(sessionId, reason: string): Promise<void> }`
    e o singleton `targetSessionLifecycleCloudService`. Cada comando lê `revision` (`select
    revision from public.sessions where id = $1`) imediatamente antes e passa `randomUUID()` como
    `p_command_id`; `freezeRules` chama `freeze_target_session_rules_snapshot(p_snapshot_id,
    p_session_id, p_expected_revision, 1, 'SESSION_EXPLICIT', p_rules_payload)`.
  - `type TargetStep = 'freezeRulesScheduleStart' | 'finish' | 'cancel'` e
    `targetStepFor(prev: Session | undefined, next: Session): TargetStep | null` —
    `status` indo para `'active'` a partir de qualquer outro → `'freezeRulesScheduleStart'`;
    para `'finished'` → `'finish'`; para `'cancelled'` ou `deletedAt` novo → `'cancel'`; resto
    → `null`.
  - `rulesPayloadFor(session: Session): { type: SessionType; config: SessionConfig | null }`.

- [ ] **Step 1: dbtest que falha** — `peladaTargetNoApp.dbtest.ts`, com os helpers de
  `registrationFinalize.dbtest.ts` (`newUser`, `targetCommunity` via
  `create_community_with_owner`, `grantOrganizer`, `createWindow`, `transitionWindow`,
  `addRegistrationEntry`, `finalizeRoster`). Casos:
  1. dono com `ORGANIZER`: `create_target_session(..., 'COMMUNITY', 'FREE_PLAY', nome, now() + 1 day, null)`
     → lista com 4 atletas → `finalize_session_roster` → `freeze_target_session_rules_snapshot`
     `SESSION_EXPLICIT` com `{"type":"free_play","config":{"type":"free_play","teamCount":2}}` →
     `schedule` → `start` → insere time, jogo (`status 'active'`) e ponto → `finish` falha com
     23514 (SES-INV-025) → jogo para `cancelled` → `finish` passa e `lifecycle_status =
     'COMPLETED'`;
  2. `start` sem `freeze` falha com 23514 citando `RULES_INVALID`;
  3. `update public.sessions set status = 'finished'` na target afeta 0 linhas;
  4. membro ativo comum lê `session_rules_snapshots.rules_payload` da pelada e **não** consegue
     `start_target_session` (42501);
  5. `cancel_target_session` numa pelada `SCHEDULED` põe `CANCELLED`;
  6. **marcar e abrir numa vez:** `create_target_session` com `planned_start_at` →
     `create_registration_window` (vagas 12) → `open_registration`; `read_registration_window`
     devolve `OPEN`, e um membro elegível entra com `join_registration`;
  7. **pelada rápida:** `create_target_session` → janela com vagas = 4 → `open_registration` →
     `add_registration_entry` para 4 atletas do elenco → `close_registration` → `lock_registration`
     → `finalize_session_roster` → congelar regras → `schedule` → `start` passam.
- [ ] **Step 2:** rodar (`node scripts/db-harness.mjs peladaTargetNoApp.dbtest.ts`); o caso 1 já
  deve passar (a medição provou) — o arquivo é a prova do contrato. Ajustar só o que o teste
  revelar de diferente da medição.
- [ ] **Step 3: unitários que falham** — `targetSessionLifecycle.test.ts`:
  `targetStepFor` para `teams_generated → active`, `active → finished`, `draft → cancelled`,
  `deletedAt` novo, e `null` para `active → active` e mudança só de `name`;
  `rulesPayloadFor` devolve `type` e `config`.
- [ ] **Step 4:** implementar o serviço (padrão de `sessionOrganizerCloudService.ts`: `call(name,
  args)` que lança o `error`) e as duas funções puras; ver passar.
- [ ] **Step 5: Commit** — `feat: comandos da pelada target como o app vai usar`.

---

### Task 2: Servidor — peladas na publicação de tempo real

**Files:**
- Create: `supabase/migrations/20260930160000_peladas_online.sql`,
  `src/test/db/peladasOnline.dbtest.ts`

- [ ] **Step 1: dbtest que falha** — depois de `rebuildFromMigrations`, `pg_publication_tables`
  de `supabase_realtime` contém `sessions`, `teams`, `games`, `point_events`, `game_reports`,
  `session_reports` e `registration_windows` (padrão de `dadosOnlineComunidade.dbtest.ts`).
- [ ] **Step 2: Migration**

```sql
-- Dados online, parte 2 (spec 2026-09-30-peladas-online-design.md): peladas, times, jogos, pontos
-- e relatorios sao lidos e gravados direto no banco, e o tempo real so avisa "mudou, releia".

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['sessions', 'teams', 'games', 'point_events', 'game_reports', 'session_reports', 'registration_windows']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
```

- [ ] **Step 3:** ver passar; bateria inteira em segundo plano.
- [ ] **Step 4: Commit** — `feat(db): peladas no tempo real`.

---

### Task 3: Leitura das peladas, com a raiz target reconstruída

**Files:**
- Modify: `src/infra/supabase/operationalCloudService.ts` (`mapDbToSession` passa a ler
  `authority_model` → `authorityModel`; nova `fetchOnlineRows(table)` **sem**
  `scopeOperationalFetch`; `fetchRulesSnapshots(sessionIds)` em `session_rules_snapshots`)
- Create: `src/application/sessionDataQueries.ts` (+ `.test.ts`)

**Interfaces:**
- Produces:
  - `interface SessionBundle { sessions: Session[]; teams: Team[]; games: Game[]; pointEvents: PointEvent[]; gameReports: GameReport[]; sessionReports: SessionReport[] }`
  - `assembleSessionBundle(input: { rows: Record<'sessions'|'teams'|'games'|'point_events'|'game_reports'|'session_reports', DbRecord[]>; snapshots: { session_id: string; rules_payload: unknown }[]; communities: Community[] }): SessionBundle`
    — mapeia com os `mapDbTo*` existentes; traduz `communityId` de nuvem para o id do app pela
    lista de comunidades (como `assembleRoster`); para cada sessão `target`: `status` a partir de
    `lifecycle_status` (`DRAFT`/`SCHEDULED` → `teams_generated` se houver times da pelada, senão
    `draft`; `IN_PROGRESS` → `active`; `COMPLETED` → `finished`; `CANCELLED` → `cancelled`),
    `teamIds` = ids dos times da pelada, `selectedPlayerIds` = união dos `playerIds` desses
    times, `config` = `rules_payload.config` do snapshot quando houver.
  - `fetchMySessions(communities: Community[]): Promise<SessionBundle>` — busca as seis tabelas
    com `fetchOnlineRows` e os snapshots das sessões target.
  - `emptySessionBundle(): SessionBundle`.

- [ ] **Step 1: testes que falham** — `sessionDataQueries.test.ts`: sessão legacy passa como veio;
  target `IN_PROGRESS` com 2 times vira `status 'active'`, `teamIds` dos dois e
  `selectedPlayerIds` sem repetição; target `DRAFT` sem times vira `draft`; `COMPLETED` vira
  `finished`; `config` vem do snapshot; `communityId` de nuvem vira o id do app.
- [ ] **Step 2–4:** ver falhar, implementar (mapear `lifecycle_status` com `db.lifecycle_status`
  lido no `assemble`, sem mexer no tipo `Session` além de `authorityModel`, que já existe), ver
  passar; `src/architecture/legacyContracts.transitional.test.ts` (AF-TARGET-005) continua verde.
- [ ] **Step 5: Commit** — `feat: peladas lidas do banco com a raiz target reconstruida`.

---

### Task 4: Gravação por comparação

**Files:**
- Create: `src/application/rowDiff.ts` (+ `.test.ts`), `src/application/sessionWrites.ts`
  (+ `.test.ts`)

**Interfaces:**
- Produces:
  - `diffById<T extends { id: string }>(prev: T[], next: T[]): { upserted: T[]; removed: T[] }`
    — por referência: `upserted` = de `next` cujo objeto não é o mesmo de `prev` (novo ou
    trocado); `removed` = de `prev` cujo id sumiu de `next`.
  - `interface SessionWriteGateway { upsertSession(s: Session, ownerId: string): Promise<unknown>; softDelete(table: OperationalTable, cloudId: string): Promise<void>; bulkUpsertTeams(items: Team[], ownerId: string, communityId: string | null): Promise<unknown>; bulkUpsertGames(...); bulkUpsertPointEvents(...); bulkUpsertGameReports(...); bulkUpsertSessionReports(...); createTargetSession(input: CreateTargetSessionInput): Promise<unknown>; lifecycle: TargetSessionLifecycleService }`
    (as assinaturas `bulkUpsert*` exatas são as de `operationalCloudService`; o gateway real é
    montado a partir dele, de `sessionCohortCloudService.createTargetSession` e da Task 1).
  - `persistSessionBundleChanges(prev: SessionBundle, next: SessionBundle, ctx: { userId: string; communityCloudId(appId: string | null | undefined): string | null; isTargetCommunity(cloudId: string): boolean }, gateway: SessionWriteGateway): Promise<void>`
    — ordem: raízes (nova em comunidade target → `createTargetSession` com `planned_start_at` de
    `date`; legacy nova/alterada → `upsertSession` com dono `cloudOwnerId ?? userId`; target
    alterada → `targetStepFor`: `freezeRulesScheduleStart` (congela `rulesPayloadFor`, agenda,
    inicia), `finish` (antes, `bulkUpsertGames` dos jogos da pelada fora de
    `finished`/`cancelled`/`walkover` com `status 'cancelled'`), `cancel`; outras mudanças da
    raiz target são ignoradas); depois times, jogos, pontos e relatórios alterados por
    `bulkUpsert*` agrupados por pelada (com `community_id` de nuvem); removidos com `cloudId` →
    `softDelete`. Relança o primeiro erro.

- [ ] **Step 1: testes que falham** — `rowDiff.test.ts` (novo, trocado, removido, igual → vazio).
  `sessionWrites.test.ts` com gateway falso que registra chamadas: ponto novo → só
  `bulkUpsertPointEvents` com ele; pelada legacy nova → `upsertSession`; pelada nova em
  comunidade target → `createTargetSession`; target `teams_generated → active` → `freezeRules`,
  `schedule`, `start` nessa ordem; target `active → finished` com um jogo `active` → o jogo vai
  `cancelled` antes de `finish`; target com só `name` trocado → nenhuma chamada; time removido com
  `cloudId` → `softDelete('teams', cloudId)`; erro do gateway é relançado.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar.
- [ ] **Step 5: Commit** — `feat: gravacao das peladas por comparacao, com comandos na target`.

---

### Task 5: `useSessions` online

**Files:**
- Modify: `src/hooks/useSessions.ts` (+ `useSessions.spec.ts`), `src/application/queryKeys.ts`
  (`peladas(userId)`), `src/hooks/useOnlineList.ts` (se preciso, extrair a parte de "escrever
  com volta atrás" para servir a um pacote e não só a uma lista)

**Interfaces:**
- Consumes: `fetchMySessions`, `persistSessionBundleChanges`, `useOnlineAccount`, `queryKeys`,
  `toOnlineError`, `OFFLINE_MESSAGE`.
- Produces: o mesmo retorno de hoje (`sessions`, `rawSessions`, `setSessions`, `deleteSession`,
  `activeSession`, `setActiveSession`, `updateActiveSession`, `teams`, `setTeams`, `games`,
  `setGames`, `pointEvents`, `setPointEvents`, `gameReports`, `setGameReports`, `sessionReports`,
  `setSessionReports`) mais `online`, `status: OnlineStatus`, `refresh()` e
  `replaceLocal(bundle: Partial<SessionBundle> & { activeSession?: Session | null })` (importar
  backup sem conta).
  - Com conta, cada `set*` aceita valor ou função, calcula o pacote novo, aplica no cache
    `['peladas', userId]` na hora e chama `persistSessionBundleChanges(anterior, novo, …)`; na
    recusa, restaura o pacote e mostra o toast; sem conexão (`navigator.onLine === false`), não
    aplica e mostra o toast.
  - `activeSession` com conta: estado em memória com o **id** da pelada ativa; o objeto é
    `sessions.find(id)` quando a pelada já existe no cache, ou o objeto em memória enquanto é
    rascunho do assistente (antes de "Criar"). Sem id escolhido, adota a pelada `active` que a
    pessoa controla (`controlledByUserId === userId`), ou a `active` mais recente da pessoa.
    `updateActiveSession(s)` grava via `setSessions` quando a pelada existe no cache.
  - A limpeza de órfãos e a propagação de mata-mata continuam, operando pelos `set*`.

- [ ] **Step 1: specs que falham** (com `QueryClientProvider` e `vi.mock` de
  `../application/sessionDataQueries` e `../application/sessionWrites`): com conta lê do banco
  (`status.loading` → dados); `setPointEvents((prev) => [...prev, ponto])` mostra o ponto na hora
  e chama `persistSessionBundleChanges` com o pacote novo; recusa volta atrás e põe
  `status.error`; sem conexão não aplica; `activeSession` adota a pelada `active` controlada pela
  pessoa; sem conta lê e grava `localStorage` como hoje (os casos existentes de
  `useSessions.spec.ts` continuam).
- [ ] **Step 2–4:** ver falhar, implementar, ver passar; `npm run lint` lista os chamadores de
  `useSessions` que quebrarem (tratados na Task 7).
- [ ] **Step 5: Commit** — `feat: peladas lidas e gravadas online com conta`.

---

### Task 6: Casos de uso do fluxo — marcar com lista e pelada rápida

**Files:**
- Create: `src/application/peladaFlowUseCases.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `registrationCloudService` (`createWindow`, `openWindow`, `addEntry`, `closeWindow`,
  `lockWindow`, `finalizeRoster`, `readWindow`), `sessionCohortCloudService.createTargetSession`,
  `generateUUID`, `toOnlineError`.
- Produces:
  - `interface PeladaFlowGateway` com exatamente os métodos acima (injetável para teste).
  - `markPelada(input: { communityCloudId: string; name: string; plannedStartAt: string; location: string | null; capacity: number; type: SessionType }, gateway?): Promise<AppResult<{ sessionId: string; windowId: string }>>`
    — cria a pelada target, cria a janela com `capacity` e abre; recusa `invalid_input` sem
    horário ou com vagas < 2; erro de rede vira `offline_unavailable` com `OFFLINE_MESSAGE`.
  - `startQuickPelada(input: { communityCloudId: string; name: string; playerCloudIds: string[]; type: SessionType }, gateway?): Promise<AppResult<{ sessionId: string; windowId: string }>>`
    — cria com `plannedStartAt` = agora, janela com vagas = quantidade de atletas, abre, adiciona
    cada atleta, fecha, trava e finaliza o elenco; recusa com menos de 4 atletas.
  - `closeListAndFinalize(input: { windowId: string }, gateway?): Promise<AppResult<{ rosterRevisionId: string }>>`
    — lê a janela e faz fechar → travar → finalizar com as revisões em cadeia (o "Fechar a lista"
    da tela da pelada).
  - Cada comando usa `commandId` e ids novos (`generateUUID`) e passa a revisão devolvida pelo
    anterior.

- [ ] **Step 1: testes que falham** (`node --import tsx --test`), com gateway falso que registra a
  ordem: `markPelada` chama `createTargetSession` (com `plannedStartAt`), `createWindow`
  (`capacity`), `openWindow`, nessa ordem; sem horário → `invalid_input` sem nenhuma chamada;
  `TypeError('Failed to fetch')` no `openWindow` → `offline_unavailable`. `startQuickPelada` com 4
  atletas → criar, janela 4, abrir, 4 `addEntry`, fechar, travar, finalizar; com 3 →
  `invalid_input`. `closeListAndFinalize` passa as revisões em cadeia.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar.
- [ ] **Step 5: Commit** — `feat: marcar pelada com lista e pelada rapida como casos de uso`.

---

### Task 7: Placar ao vivo — sem sinal trava, quem não controla só lê

**Files:**
- Modify: `src/components/live/SessionActiveView.tsx`, `src/components/live/TournamentActiveView.tsx`,
  `src/application/screens/sessionActiveView/sessionActiveViewContract.ts` e
  `sessionActiveViewModel.ts` (novo campo `scoringLocked: 'offline' | 'not_controller' | null`)
- Create: `src/application/scoringLock.ts` (+ `.test.ts`)
- Test: specs das duas views (existentes) ganham os casos

**Interfaces:**
- Produces: `scoringLockFor(input: { online: boolean; connectivity: 'online' | 'offline' | 'unknown'; lastWriteOffline: boolean; controlledByUserId: string | null | undefined; currentUserId: string | null }): 'offline' | 'not_controller' | null`
  — sem conta (`online === false`) → `null`; `connectivity === 'offline'` ou `lastWriteOffline`
  → `'offline'`; `controlledByUserId` definido e diferente → `'not_controller'`; senão `null`.

- [ ] **Step 1: testes que falham** — `scoringLock.test.ts` com os quatro ramos. Specs das views:
  com `scoringLocked = 'offline'`, os botões de ponto, desfazer, próximo jogo e encerrar estão
  `disabled` e aparece `role="alert"` com "Sem conexão. O placar volta quando o sinal voltar.";
  com `'not_controller'`, os botões não aparecem e a tela diz quem controla (usa
  `controlHolderName` quando houver).
- [ ] **Step 2–4:** ver falhar; implementar (`useConnectivity()` no contrato;
  `lastWriteOffline` vem de `sess.status.offline`; quando a conectividade volta — `onlineAt`
  muda — chamar `sess.refresh()`); ver passar.
- [ ] **Step 5: Commit** — `feat: placar trava sem sinal e so le para quem nao controla`.

---

### Task 8: Chamadores, sync, ponte e limpeza

**Files:**
- Modify: `src/app/AppShell.tsx` (importar backup ~299-315 → `sess.replaceLocal` só sem conta;
  materializar rodada ~406-410 continua pelos `set*`, que agora gravam; encerrar ~500-545 igual),
  `src/app/routes/globalRoutes.tsx`, `src/app/routes/sessionRoutes.tsx`,
  `src/app/routes/communityRoutes.tsx`, `src/app/routes/communitiesContract.ts`,
  `src/app/routes/CommunityDrawRoute.tsx` (conferir que cada `set*` ainda compila e faz sentido
  gravando; limpar histórico → cada pelada da comunidade removida pelos `set*`)
- Modify: `src/hooks/useCloudSync.ts`, `src/infra/supabase/syncService.ts`,
  `src/application/cloudSyncUseCases.ts`, `src/hooks/useCloudSync.spec.tsx`,
  `src/infra/supabase/syncService.test.ts`, `src/architecture/legacyExpansionRules.ts` (baixar
  baselines se a contagem cair)
- Modify: `src/application/realtimeInvalidation.ts` (+ teste), `src/hooks/useCommunityRealtime.ts`
  (+ spec), `src/application/accountStorageCleanup.ts` (+ teste)

- [ ] **Step 1: Sync** — `uploadLocalDataToCloud` e `syncNow` deixam de subir e baixar
  `sessions`, `teams`, `games`, `pointEvents`, `gameReports`, `sessionReports` (passam adiante
  como a parte 1 fez com comunidades); `downloadCloudDataToLocal(ownerId, catalog)` recebe também
  essas seis listas no `catalog` e não as busca; `championship_rounds` continuam traduzindo
  `sessionId` pelas peladas do catálogo. `useCloudSync` deixa de chamar os `set*` de peladas e
  passa as listas do cache no catálogo. Testes: um provando que não sobe peladas (serviços
  proibidos), um provando que o download com catálogo não lê `operationalCloudService` para essas
  tabelas, e os de rodada de liga continuam verdes. Remover os testes de upload de peladas que
  deixaram de fazer sentido, anotando os nomes no commit.
- [ ] **Step 2: Ponte** — `RealtimeTable` ganha as seis tabelas, todas com
  `filterColumn: 'community_id'`, e `invalidationKeysFor` devolve `[peladas(userId)]` para elas;
  `allCommunityKeys` inclui `peladas(userId)`. Testes atualizados.
- [ ] **Step 3: Limpeza** — `clearAccountEntitiesFromStorage` apaga também
  `STORAGE_KEYS.sessions`, `activeSession`, `teams`, `games`, `points`, `gameReports`,
  `sessionReports`. Teste atualizado.
- [ ] **Step 4: Chamadores** — `npm run lint` limpo; `AppShell` monta `pendingChanges` sem as
  seis listas de peladas; `QuickStartRoute` (`onboardingRoutes.tsx`) deixa de usar
  `comm.communities[0]` com conta (a comunidade vem da escolha na tela da Task 9) e, sem conta,
  continua como hoje.
- [ ] **Step 4b: Canal da pelada** — `useSessionRealtime(sessionCloudId, onChange)` em `src/hooks/`
  (padrão de `useCommunityRealtime`): `registration_windows` com `filter: session_id=eq.<id>` →
  chama `onChange` (o `reload` do quadro); spec com canal simulado.
- [ ] **Step 5:** `npm run lint`, `npm test`, `npm run build`.
- [ ] **Step 6: Commit** — `feat: telas gravam peladas online e o sync para de cuidar delas`.

---

### Task 9: Telas — o fluxo novo, os estados online e os textos

**Files (a confirmar no shape):** `src/components/session/MarkPeladaView.tsx` (novo), a pelada
rápida (evolução de `QuickStartView`), `src/components/session/RegistrationBoardView.tsx` (vira a
tela da pelada), `src/app/routes/sessionRoutes.tsx`, `src/app/routes/CommunityDrawRoute.tsx`,
`src/app/routes/onboardingRoutes.tsx`, `src/app/routes/globalRoutes.tsx` (painel e agenda),
`src/components/dashboard/Dashboard.tsx`, `src/components/community/areas/CommunityOverviewArea.tsx`,
a lista de peladas da comunidade, `src/components/session/SessionWizard.tsx` (sai da entrada; os
passos de formato em diante servem ao sortear), `src/components/history/HistoryView.tsx`,
`src/components/live/*`, `src/components/account/AuthForm.tsx`, `src/application/appRoutes.ts`,
`preview/`.

- [ ] **Step 1: `/impeccable shape` do fluxo** — marcar (tela curta: data, horário, local, vagas,
  formato; "Marcar e abrir a lista"; termina na tela da pelada com o link), tela da pelada (lista →
  Fechar a lista → Sortear → Iniciar → placar → Encerrar; estado atual e próximo passo em destaque;
  quem organiza; cancelar pelada), pelada rápida (escolher comunidade quando houver mais de uma,
  escolher do elenco ou colar nomes, "Sortear"), entradas (painel com a próxima pelada e o estado
  da lista, "Marcar pelada" e "Pelada rápida"; agenda com "Marcar pelada" direto; comunidade com as
  duas ações; comunidade nova com "Marcar a primeira pelada" primeiro). Confirmar o brief com o
  usuário.
- [ ] **Step 2: `/impeccable shape` dos estados online** (pode ir no mesmo brief) — histórico,
  agenda e painel com `OnlineLoading`/`OnlineReadError`; placar travado sem sinal; placar em
  leitura para quem não controla; recusas target ("Feche a lista antes de iniciar a pelada.", "Só
  quem organiza esta pelada pode iniciar.").
- [ ] **Step 3: `/impeccable clarify`** — "sessão" → "pelada" em toda a interface; "Setup de sessão
  v1.2", "Média Power", "Over", o texto do painel ("local-first… Web Worker"), "Central local dos
  grupos"; erro de login em português ("E-mail ou senha incorretos."); os que falam de sincronizar
  pelada (`SessionWizard` ~582, `ChampionshipWizardView` no que toca a pelada, título de pendentes
  do `AppShell` ~903); toasts de sync sem ação ("Download da nuvem concluído", "Uma sincronização
  já está em andamento") saem.
- [ ] **Step 4: Specs que falham** — marcar exige horário e chama `markPelada`; a tela da pelada
  mostra o próximo passo certo em cada estado (lista aberta, fechada, sorteada, em andamento,
  encerrada); a pelada rápida chama `startQuickPelada` com a comunidade escolhida; o painel mostra a
  próxima pelada; as entradas antigas ("Nova sessão", "Criar sessão") levam ao marcar; histórico e
  painel esperam o carregamento.
- [ ] **Step 5: Implementar** conforme o brief; `paths.sessaoNova` passa a ser o marcar; a bancada
  em `preview/` ganha marcar, a tela da pelada em cada estado, a pelada rápida, o placar travado e o
  placar em leitura.
- [ ] **Step 6:** specs, `npm run lint`, `npm test`, `npm run build`; bancada em 375px e desktop;
  `impeccable detect` nos arquivos de tela alterados.
- [ ] **Step 7: Commit(s)** — por tela ou grupo, `feat: <tela> da pelada ...`.

---

### Task 10: Documentos, verificação e publicação

- [ ] **Step 1: Documentos** — `docs/JORNADA.md` (etapas 4 a 10 reescritas para o fluxo novo:
  marcar com horário abre a lista, tela da pelada, pelada rápida, o que exige conexão, placar sem
  sinal trava, pelada target avança por comandos), `HANDOFF.md`, `docs/ROADMAP.md` (parte 2
  feita), `AGENTS.md`/`CLAUDE.md` (peladas na camada online; raiz target só por comandos).
- [ ] **Step 2: Verificação** — `npm run lint`, ESLint (erros), `prettier --check`, `npm test`,
  `npm run build`, `npm run test:db`.
- [ ] **Step 3: Publicação (só com ok do usuário)** — migration primeiro; depois merge, push e
  deploy `READY`; conferência no ar no celular: marcar com horário (a lista abre junto), ver na
  agenda e no painel, entrar na lista por outra aba, fechar, sortear, iniciar, marcar pontos,
  encerrar e ver o histórico em outra aba; depois uma pelada rápida colando nomes; e a pelada presa
  da Inimigos do Vôlei aparece e pode ter a lista aberta ou ser cancelada.
