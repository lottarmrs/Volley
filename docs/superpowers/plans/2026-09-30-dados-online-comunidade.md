# Dados online, parte 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com conta, comunidades, membros, elenco e regras passam a ser lidos e gravados direto no
banco (TanStack Query + aviso de tempo real), o sync deixa de cuidar deles, e as telas de
comunidade, painel, perfil e conta ganham estados online e perdem backup/demonstração.

**Architecture:** Um `QueryClient` no topo; consultas por chave; uma ponte de tempo real que só
invalida consultas; os hooks `useCommunities`, `usePlayers` e `useCommunityRules` mantêm o formato
de leitura para as telas, mas trocam os "setters" de lista por operações explícitas que gravam no
banco (com conta) ou no `localStorage` (sem conta).

**Tech Stack:** React 19, TypeScript, `@tanstack/react-query` (nova), Supabase JS (Realtime),
Vitest + RTL, Node test runner, Postgres real.

**Spec:** `docs/superpowers/specs/2026-09-30-dados-online-comunidade-design.md`

## Global Constraints

- O tempo real **só invalida** consultas; o payload do aviso nunca vai para a tela (ADR-RT-001).
- Com conta: tudo nasce online; sem conexão a ação não acontece. Mensagem:
  "Sem conexão. Tente de novo quando o sinal voltar."
- Sem conta: `localStorage`, como hoje.
- Ids: `id = local_id || id` e `cloudId`, como o sync (`playerCloudService.ts` ~36).
- Na troca, com conta: apagar `STORAGE_KEYS.communities`, `STORAGE_KEYS.players`,
  `STORAGE_KEYS.communityRules`. Sem "último envio".
- Com conta: sem exportar/importar backup e sem "restaurar atletas de demonstração".
  `/perfil/sync` fica como está.
- Telas passam por `/impeccable shape` (ou `clarify` para texto) antes do código.
- Sem comentários novos em TS/TSX; commits em português sem acento com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nada em produção sem ok do usuário.
- **Desvio da spec, decidido ao planejar:** o elenco é uma consulta única
  `['atletas', userId]` (todas as comunidades da pessoa), porque o app usa uma lista única de
  atletas (`play.players`); a ponte invalida essa chave.

---

### Task 1: Fundação — dependência, provedor, chaves e erro "sem conexão"

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install @tanstack/react-query`)
- Create: `src/app/queryClient.ts`, `src/application/queryKeys.ts`, `src/application/queryKeys.test.ts`,
  `src/application/onlineErrors.ts`, `src/application/onlineErrors.test.ts`
- Modify: `src/main.tsx` (provedor por dentro do `AuthSessionProvider`)
- Modify (se exigido pelos testes de arquitetura): `src/architecture/importAliases.test.ts`

**Interfaces:**
- Produces:
  - `createQueryClient(): QueryClient` — `defaultOptions.queries`: `refetchOnWindowFocus: true`,
    `retry: (failures, error) => failures < 2 && !isPermissionError(error)`, `staleTime: 30_000`.
  - `queryKeys.comunidades(userId)`, `queryKeys.atletas(userId)`, `queryKeys.regras(userId)`,
    `queryKeys.membros(communityCloudId)` — arrays `readonly`.
  - `toOnlineError(error: unknown): AppError` — rede/`fetch` falhando ou `navigator.onLine === false`
    → `offlineError('Sem conexão. Tente de novo quando o sinal voltar.')`; `42501` →
    `authorizationError(...)` com a mensagem do servidor; resto → `unexpectedError`.

- [ ] **Step 1: Instalar** — `npm install @tanstack/react-query` na worktree. Atualiza o
  `package.json`/`package-lock.json` da worktree e instala no `node_modules` compartilhado (a
  junção para `C:\Volley
ode_modules`); um pacote a mais sem uso não afeta o `main`.
- [ ] **Step 2: Testes que falham** — `queryKeys.test.ts`: as chaves são estáveis e distintas por
  usuário/comunidade. `onlineErrors.test.ts`: `TypeError('Failed to fetch')` → `kind: 'offline_unavailable'`;
  `{ code: '42501', message: 'x' }` → `kind: 'authorization'`; outro → `kind: 'unexpected'`.
  (Confira os helpers e `kind`s reais em `src/application/appResult.ts`.)
- [ ] **Step 3: Rodar e ver falhar** — `node --import tsx --test src/application/queryKeys.test.ts src/application/onlineErrors.test.ts`.
- [ ] **Step 4: Implementar** os três módulos e envolver a árvore em `src/main.tsx` com
  `<QueryClientProvider client={queryClient}>` (um `queryClient` criado uma vez, no módulo).
- [ ] **Step 5: Rodar e ver passar** — os testes, `npm run lint`, `npm run build`, `npm test`.
- [ ] **Step 6: Commit** — `feat: camada de dados online com TanStack Query`.

---

### Task 2: Servidor — tabelas na publicação de tempo real

**Files:**
- Create: `supabase/migrations/20260930140000_dados_online_comunidade.sql`,
  `src/test/db/dadosOnlineComunidade.dbtest.ts`

- [ ] **Step 1: dbtest que falha** — depois de `rebuildFromMigrations`, consulta
  `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`
  e afirma que contém `communities`, `community_members`, `community_players`, `players`,
  `community_rules`. (Padrão de `src/test/db/quemOrganiza.dbtest.ts`.)
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Migration**

```sql
-- Dados online, parte 1 (spec 2026-09-30-dados-online-comunidade-design.md): o app le e grava
-- comunidade, membros, elenco e regras direto no banco, e o tempo real so avisa "mudou, releia".
-- A publicacao existe no Supabase; o Postgres de teste nao a tem.

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
  foreach v_table in array array['communities', 'community_members', 'community_players', 'players', 'community_rules']
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

- [ ] **Step 4: Rodar e ver passar**; bateria inteira em segundo plano.
- [ ] **Step 5: Commit** — `feat(db): comunidade, membros, elenco e regras no tempo real`.

---

### Task 3: A ponte de tempo real

**Files:**
- Create: `src/application/realtimeInvalidation.ts` (+ `.test.ts`), `src/hooks/useCommunityRealtime.ts`
  (+ `.spec.tsx`)

**Interfaces:**
- Produces:
  - `invalidationKeysFor(table: 'communities' | 'community_members' | 'community_players' | 'players' | 'community_rules', ctx: { userId: string; communityCloudId: string }): QueryKey[]`
    — `communities` → `[comunidades(userId)]`; `community_members` → `[membros(communityCloudId), comunidades(userId)]`;
    `community_players` e `players` → `[atletas(userId)]`; `community_rules` → `[regras(userId)]`.
  - `useCommunityRealtime(communityCloudId: string | null): void` — assina
    `supabase.channel('comunidade:' + id)` com `postgres_changes` (`event: '*'`) nas cinco tabelas
    (`filter: community_id=eq.<id>` nas que têm a coluna; `players` sem filtro), chama
    `queryClient.invalidateQueries({ queryKey })` para cada chave de `invalidationKeysFor`; em
    `subscribe` com status `SUBSCRIBED` depois de `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, invalida
    todas as chaves da comunidade; remove o canal na desmontagem. Sem Supabase ou sem usuário, não
    faz nada.

- [ ] **Step 1: Testes que falham** — `realtimeInvalidation.test.ts` com os cinco casos acima.
  `useCommunityRealtime.spec.tsx`: com um `supabase` simulado (`vi.mock('../lib/supabaseClient')`
  devolvendo um `channel()` que guarda os `on(...)` e o callback de `subscribe`), disparar um
  aviso de `players` invalida só `['atletas', userId]` (espione `queryClient.invalidateQueries`);
  o aviso nunca é passado ao cache (`setQueryData` não é chamado); `SUBSCRIBED` depois de
  `CHANNEL_ERROR` invalida as quatro chaves; desmontar chama `removeChannel`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar (+ `npm run lint`).
- [ ] **Step 5: Commit** — `feat: ponte de tempo real que so manda reler`.

---

### Task 4: Leituras — comunidades, elenco e regras vindos do banco

**Files:**
- Create: `src/application/communityDataQueries.ts` (+ `.test.ts`)
- Modify: `src/infra/supabase/syncService.ts` (download usa `assembleRoster` em vez do bloco
  inline ~1822-1845)

**Interfaces:**
- Produces:
  - `assembleRoster(input: { players: Player[]; relations: CommunityPlayerRow[]; evaluations: PlayerEvaluation[]; ownerId?: string }): Player[]`
    — exatamente a lógica de hoje (`playerMemberships` + `applyEvaluationAggregate`), extraída.
    (Tipos reais: veja o que `communityPlayerCloudService.fetchAll` e
    `playerEvaluationCloudService.fetchAll` devolvem.)
  - `fetchMyCommunities(): Promise<Community[]>` (`communityCloudService.fetchAll`),
    `fetchRoster(ownerId: string): Promise<Player[]>` (players + relations + evaluations →
    `assembleRoster`), `fetchRules(): Promise<CommunityRules[]>` (`communityRulesCloudService.fetchAll`).
    Cada uma relança o erro original (quem chama usa `toOnlineError`).

- [ ] **Step 1: Teste que falha** — `assembleRoster`: atleta com duas relações ativas ganha as duas
  comunidades; relação inativa não conta; avaliações aplicam o agregado (use um caso do teste
  existente de `applyEvaluationAggregate`).
- [ ] **Step 2–4:** ver falhar; extrair a função e fazer o `syncService` usá-la (os testes do sync
  continuam verdes); ver passar.
- [ ] **Step 5: Commit** — `refactor: montagem do elenco sai do sync para ser lida online`.

---

### Task 5: `useCommunities` online

**Files:**
- Modify: `src/hooks/useCommunities.ts` (+ `useCommunities.spec.tsx`)

**Interfaces:**
- Consumes: `fetchMyCommunities`, `queryKeys`, `toOnlineError`, `communityCloudService`.
- Produces: mesmo retorno de hoje (`communities`, `rawCommunities`, `addCommunity`,
  `updateCommunity`, `duplicateCommunity`, `handle*`, estados de edição), **sem `setCommunities`**
  no modo com conta; novo `status: { loading: boolean; error: AppError | null; offline: boolean }`.
  Operações de escrita devolvem `Promise<AppResult<Community>>` com conta.

- [ ] **Step 1: Specs que falham** (com um `QueryClientProvider` de teste e
  `vi.mock('../infra/supabase/communityCloudService')`): com conta, lê do serviço; `addCommunity`
  chama `upsert`, mostra a nova na lista antes da resposta e a retira se o serviço rejeitar;
  "sem conexão" vira `status.offline`; sem conta, lê/grava `localStorage` como hoje.
  (Veja como `useAuth` expõe usuário e `isSupabaseConfigured` para decidir o modo.)
- [ ] **Step 2–4:** ver falhar; implementar com `useQuery`/`useMutation` (atualização otimista
  com `onMutate`/`onError`/`onSettled`); ver passar; `npm run lint` aponta chamadores de
  `setCommunities` — tratados na Task 8.
- [ ] **Step 5: Commit** — `feat: comunidades lidas e gravadas online com conta`.

---

### Task 6: `usePlayers` online

**Files:**
- Modify: `src/hooks/usePlayers.ts` (+ spec)

**Interfaces:**
- Consumes: `fetchRoster`, `queryKeys.atletas`, `playerCloudService`, `communityPlayerCloudService`,
  `toOnlineError`.
- Produces: mesmo retorno de leitura (`players`, `rawPlayers`); as operações de hoje
  (`saveGuestPlayer`, `removeGuestPlayer`, `reactivateGuestPlayer`, `deleteGuestPlayer`) viram
  assíncronas com conta; **sai `setPlayers`** e entram operações explícitas:
  - `addPlayers(novos: Player[], communityId: string): Promise<AppResult<Player[]>>` (onboarding);
  - `applyProgression(atualizados: Player[]): Promise<void>` — grava só os que a pessoa pode
    gravar (convidados dela ou de comunidade onde é dono/admin) e ignora recusas, sem aviso;
  - `refreshRoster(): void` — invalida `['atletas', userId]`;
  - `setAvatar(playerId: string, url: string): void` — atualiza o cache (a foto já foi gravada
    pela RPC);
  - `status` como em `useCommunities`.
  Sem conta, as mesmas operações gravam no `localStorage`.

- [ ] **Step 1–5:** specs no mesmo padrão da Task 5 (leitura, guardar convidado otimista e
  volta atrás, sem conexão, sem conta), implementar, commit
  `feat: elenco lido e gravado online com conta`.

---

### Task 7: `useCommunityRules` online

**Files:**
- Modify: `src/hooks/useCommunityRules.ts` (+ spec)

- [ ] Mesmo padrão: `getRules` lê do cache; `saveRules` grava por `communityRulesCloudService.upsert`
  (otimista, volta atrás); `removeRules` some com conta (as regras saem com a comunidade no
  servidor); sem conta, `localStorage`. Commit `feat: regras lidas e gravadas online com conta`.

---

### Task 8: Chamadores, convivência com o sync e limpeza

**Files:**
- Modify: `src/app/AppShell.tsx` (~299-306 importar backup; ~470-480 excluir comunidade; ~540
  progressão; ~559 convidado rápido; montar `useCommunityRealtime` para a comunidade aberta),
  `src/app/routes/communitiesContract.ts` (~73), `src/app/routes/communityRoutes.tsx` (~201, ~275,
  ~283), `src/app/routes/globalRoutes.tsx` (~196), `src/app/routes/onboardingRoutes.tsx` (~46)
- Modify: `src/hooks/useCloudSync.ts` (~239-240), `src/infra/supabase/syncService.ts`
- Create: `src/application/accountStorageCleanup.ts` (+ teste)

- [ ] **Step 1: Chamadores** — cada `setPlayers`/`setCommunities` vira a operação explícita:
  vínculo por @ e Minha ficha → `refreshRoster()`; foto → `setAvatar`; convidado rápido →
  `saveGuestPlayer`; progressão ao encerrar → `applyProgression`; onboarding → `addPlayers`;
  excluir comunidade → operação do `useCommunities` + `refreshRoster()`. O `tsc` lista o que falta.
- [ ] **Step 2: Sync** — com conta, `uploadLocalDataToCloud` e `syncNow` **não** sobem nem baixam
  `communities`, `players`, `rules` (e as relações `community_players`); recebem essas listas do
  cache (`queryClient.getQueryData`) só para `makeCloudIdLookup`. `useCloudSync` deixa de chamar
  `setCommunities`/`setPlayers`/regras. Testes do sync: um caso por entidade provando que não sobe
  nem baixa, e um provando que a tradução de ids de uma pelada ainda usa o `cloudId` do cache.
- [ ] **Step 3: Limpeza na troca** — `clearAccountEntitiesFromStorage()` apaga as três chaves;
  chamada uma vez quando a sessão fica `ready` com conta. Teste: com conta apaga; sem conta não.
- [ ] **Step 4:** `npm run lint`, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** — `feat: telas gravam comunidade e elenco online e o sync para de cuidar deles`.

---

### Task 9: Telas — estados online, painel, perfil, conta e textos

**Files (a confirmar no shape):** `src/components/community/CommunitiesView.tsx`,
`src/components/community/areas/CommunityOverviewArea.tsx`, `src/components/player/PlayersView.tsx`,
`src/components/community/CommunityMembersPanel.tsx`, `src/components/community/areas/CommunityGuestsArea.tsx`,
`src/components/community/areas/CommunityRulesArea.tsx`, `src/components/dashboard/Dashboard.tsx`,
`src/components/account/UserProfileView.tsx`, `src/components/account/AuthForm.tsx`, os
componentes com textos de sync listados na Parte 5 da spec, `preview/`.

- [ ] **Step 1: `/impeccable shape`** das telas de comunidade (lista/visão geral, Pessoas,
  Membros, Convidados, Regras) e do painel/perfil: carregando, erro, sem conexão, gravando e
  gravado. Confirmar o brief com o usuário.
- [ ] **Step 2: `/impeccable clarify`** dos textos que prometem sincronização (AuthForm e os da
  Parte 5 da spec).
- [ ] **Step 3: Specs que falham** — por tela, os estados do brief (`status.loading`,
  `status.offline`, `status.error`); painel e perfil **sem** exportar/importar/demonstração com
  conta e **com** eles sem conta.
- [ ] **Step 4: Implementar** conforme o brief; a bancada em `preview/` ganha os estados.
- [ ] **Step 5:** specs, `npm run lint`, `npm test`, `npm run build`; conferir a bancada no
  navegador (375px e desktop).
- [ ] **Step 6: Commit(s)** — por tela ou grupo, `feat: <tela> online, com carregando, erro e sem conexao`.

---

### Task 10: Documentos, verificação e publicação

- [ ] **Step 1: Documentos** — `docs/JORNADA.md` (o que exige conexão; o que acontece sem sinal
  nesta parte), `docs/ROADMAP.md`/`HANDOFF.md` (projeto tempo real, parte 1 feita),
  `AGENTS.md`/`CLAUDE.md` (a camada de dados online e onde ficam as chaves e a ponte).
- [ ] **Step 2: Verificação** — `npm run lint`, ESLint (erros), `prettier --check`, `npm test`,
  `npm run build`, `npm run test:db`.
- [ ] **Step 3: Publicação (só com ok do usuário)** — migration primeiro (só acrescenta à
  publicação); depois merge, push e deploy `READY`; conferência no ar com a conta do usuário:
  entrar, ver comunidades e elenco, editar um convidado e ver a mudança em outra aba sem recarregar.
