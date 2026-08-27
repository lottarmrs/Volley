# Plano 3 — Career Events, Global VUT & Achievements (Sync Foundation expandido)

Data: 2026-07-27
Projeto: Volley / Panelinha Team Balancer
Status: design aprovado em brainstorm, aguardando revisão do usuário antes do plano de implementação
Spec base: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (seções 9 e 11)

## 1. Contexto

O Plano 3 fecha a "Fase 2: domínio social e carreira" do Scalable Product Program.
Originalmente previsto para entregar apenas "eventos de carreira, VUT e conquistas
determinísticas e recalculáveis", uma investigação systematic-debugging da superfície
de sincronização existente revelou 13 problemas latentes agrupados em 6 classes
(resolução de FKs, idempotência parcial, concorrência, offline ausente, cache
staleness, classificação de erros). Em conversa com o usuário, decidiu-se **resolver
todos** esses problemas neste plano, antecipando trabalhos originalmente atribuídos aos
Planos 4 e 5. O programa-mestre foi anotado com esse desvio (sem renomear planos).

A arquitetura escolhida particiona o trabalho em três blocos sequenciais com gates
próprios: **Sync Foundation** (resolve Classes C/D/E/F), **Career Engine** (resolve
Classes A/B + adiciona VUT global), e **Retrofit UI** (mantém UI congelada).

## 2. Objetivos

- Construir um outbox idempotente (uma linha por operação de domínio) que substitua o
  best-effort sync atual e torne falhas recuperáveis observáveis.
- Particionar o cache local por `(auth_user_id, community_id)` com namespace em
  localStorage e validação de dono antes de aplicar qualquer result.
- Substituir o guard de reentrância em `useRef` por um guard persistente com TTL
  que sobrevive a remount de componente.
- Tipificar erros de sync em `validation | authorization | conflict |
  offline_unavailable | recoverable | unexpected` para classificação visível.
- Criar scaffold de reset de produção (RPC + sequência referencial) sem aplicá-lo
  automaticamente — pronto para uso manual quando o Plano 5 cortar produção.
- Introduzir persistência de VUT/achievements via `career_events`,
  `player_career_snapshots`, `player_achievements` em vez de derivar tudo em tempo
  de leitura no client (v1 do VUT em `futCards.ts`).
- Derivar VUT global combinando a projeção objetiva de `point_events` (peso 50%) com
  a agregação existente de `aggregatePlayerEvaluations` (peso 50%), usando a mesma
  curva `toFut(v)` existente para normalização 0-100.
- Gerar `career_event` automaticamente quando uma `session` muda para `status =
  'finished'` e é confirmada na nuvem — sem ações manuais do usuário.
- Recalcular `player_career_snapshots` e detectar achievements recém-desbloqueadas
  ao final de cada sync com novas sessions confirmadas.
- Permitir que o claim importe point_events históricos e dispare recalculo do VUT
  do jogador (idempotente via `unique(player_id, session_id)`).
- Retrofitar `FutCard` / `FutCardModal` / `VutRevealModal` para consumir
  `player_career_snapshot` + `player_achievements` em vez de calcular local-fly,
  preservando todo o chrome visual existente.
- Manter a UI visível congelada (regra do programa): nenhuma rota, tela ou
  componente novo. O único acréscimo visual é um toggle opcional "Filtrar por
  comunidade" dentro do `FutCardModal` existente.

## 3. Não objetivos

- Redesenhar telas, trocar a navegação visível ou iniciar esqueumorfismo (Plano 5).
- Implementar contratos formais `ScreenContract<Model, Intent>` (Plano 5).
- Aplicar reset em produção — apenas scaffold pronto para execução manual (Plano 5).
- Implementar pacote offline completo para operar sem rede de comunidades não
  baixadas (parcialmente coberto pelo outbox; download inicial exige rede).
- Transferência explícita de owner/device da sessão (parcialmente coberto pelo
  outbox com `auth_user_id` por operação; transferência explícita fica no Plano 4).
- Agregação de avaliações por comunidade (continua global, como definido no Plano 2).
- Catálogo de achievements novo ou redesenhado — reutiliza exatamente os 75 entries
  em `ACHIEVEMENT_CATALOG` (`futCards.ts:460-1258`) sem modificação.
- Modificar `aggregatePlayerEvaluations`, `applyEvaluationAggregate`,
  `simulateLocalConsensus` (`playerEvaluations.ts`) — seu comportamento e
  assinaturas ficam inalterados, como já garantido pelo Plano 2.

## 4. Decisões de design aprovadas

- **Persistência nova**: sim. Cria-se `career_events`, `player_career_snapshots`,
  `player_achievements` (tabelas) e `outbox_entries` (fila). Diferente do VUT v1
  (que explicitamente não persistia nada).
- **Gerador de career_event**: automático ao confirmar session na nuvem. Cada
  jogador participante ganha um evento. Sem ação humana extra.
- **VUT global**: combina projeção objetiva (50%) + avaliações oficiais agregadas
  (50%). Não usa autoavaliação (mantém regra do spec base seção 8.1).
- **Curva de projeção objetiva**: reutiliza exatamente `toFut(v)` de `futCards.ts:
  149-154` para normalizar estatísticas de carreira em 0-100 (depois converte para
  0-10 para combinar com `Attributes`).
- **UI**: sem tela nova. Retrofit dos componentes existentes; único acréscimo é um
  toggle opcional "Filtrar por comunidade" no `FutCardModal`.
- **Outbox granularity**: uma linha por operação de domínio (não por batch). Cada
  operação sensível enfileira entrada com `idempotency_key` único.
- **Cache particionado**: namespace por `(auth_user_id, community_id)` em
  localStorage com keys `vpg_cache_<userId>_<communityId>_*`. Validação de dono
  antes de aplicar result.
- **Abordagem arquitetural**: Blocos Sequenciais (Sync Foundation → Career
  Engine → Retrofit UI), cada um com gate próprio e testes isolados.

## 5. Bloco Sync Foundation

### 5.1 Outbox (`outbox_entries`)

```sql
create table public.outbox_entries (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null references auth.users(id) on delete cascade,
  community_id    uuid references public.communities(id) on delete cascade,
  operation       text not null,
  payload         jsonb not null,
  idempotency_key text not null unique,
  status          text not null default 'pending_upload'
                  check (status in ('pending_upload', 'syncing', 'cloud_confirmed',
                                    'recoverable_error')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.outbox_entries enable row level security;
-- RLS: only entries where auth_user_id = auth.uid() are visible to that user
create index outbox_entries_pending_idx on public.outbox_entries (auth_user_id, status)
  where status in ('pending_upload', 'syncing');
```

`payload` é validado por um `validatePayload(operation, payload): AppResult<void>`
que checa tipos do domínio antes de enfileirar. `idempotency_key` é
`sha256(operation + JSON.stringify(payload) + auth_user_id)`, garantindo que
operações repetidas (claim re-tentado, session concluída duas vezes) não
dupliquem entradas — a constraint unique rejeita a segunda inserção.

### 5.2 Estados de outbox e consumo

```
pending_upload → syncing → cloud_confirmed (entrada deletada)
                         ↘ recoverable_error (attempts++, backoff limitado)
```

- O `useCloudSync.run` agora consome do outbox: lê `pending_upload` onde
  `attempts < 5` e tentativa anterior foi há mais de `backoff(attempts)` segundos.
- Em sucesso, a entrada é **deletada** (não há razão para retê-la; a nuvem é
  autoritativa e o idempotency_key impede duplicação futura).
- Em falha recoverable (timeout, rede), `attempts++` e volta para `pending_upload`.
- Em falha estrutural (validation/authorization/conflict), status =
  `recoverable_error` e fica visível no `syncIssueLedger` sem retry automático.
- Não há retry storm: `attempts >= 5` congela a entrada em `recoverable_error`.

### 5.3 Cache particionado

Keys de localStorage mudam de `vpg_state` para o padrão `vpg_cache_<userId>_<communityId>_<entityKind>`:
- `vpg_cache_<userId>_<communityId>_sessions`
- `vpg_cache_<userId>_<communityId>_players`
- (etc — uma por entidade já sincronizada)

Global-only entities (próprio perfil do usuário, Comunidades das quais é membro)
ficam em `vpg_cache_<userId>__<entityKind>` (sem `communityId`).

`AuthSessionProvider` expõe `{ currentUserId, currentCommunityId }`.
`loadInitialState` valida `markLocalCacheOwner(userId)` antes de aplicar qualquer
snapshot; em mismatch, descarta e recarrega. Trocar de comunidade ativa via
rota não monta a UI até que o cache daquela comunidade esteja loaded.

### 5.4 Reentrância persistente

Substitui `inFlight = useRef(false)` em `useCloudSync` por um guard em localStorage:
`vpg_sync_inflight_<userId>` contendo `{ startedAt: ISO-8601, ttlMs: 300000 }`.

`useCloudSync.run` lê o guard antes de iniciar; se existir e não expirou, exibe
toast "sync em andamento" e aborta. Em sucesso/falha, remove o guard. Se o guard
expirou (TTL = 5min), assume que o sync anterior morreu (browser fechou, crash)
e reassume. O TTL evita deadlock permanente após crash.

### 5.5 Erros tipados (`AppError`)

```typescript
export type AppError =
  | { kind: 'validation'; field: string; message: string }
  | { kind: 'authorization'; required?: 'owner' | 'admin' | 'aal2'; message: string }
  | { kind: 'conflict'; resource: string; message: string }
  | { kind: 'offline_unavailable'; message: string }
  | { kind: 'recoverable'; cause?: string; message: string }
  | { kind: 'unexpected'; correlationId: string; message: string };
```

Cada `*CloudService.upsert/softDelete/bulkUpsert` retorna `Promise<AppResult<T>>`
em vez de `throw new Error`. O `syncService` envolve o resultado e propaga para o
`syncIssueLedger` com o `kind` visível. UI exibe `recoverable` com retry,
`validation/authorization/conflict` como "ação necessária" sem retry automático.

### 5.6 Reset scaffold

RPC `reset_product_data(target_account_uuid text)` que executa em uma transação
a deleção em ordem referencial:

```
point_events → games → teams → sessions
championship_rounds → championship_teams → championships
player_achievements → player_career_snapshots → career_events
player_evaluations → self_evaluations
community_players
outbox_entries
whatsapp_list_drafts → community_presence → game_reports → session_reports
players (owned pelo target) → communities (owned pelo target)
```

`SECURITY DEFINER`, `set search_path = public`, requis AAL2, restringido a
`master`/`programmer` via `has_capability('reset_product_data')`. Não toca
`auth.users`. NÃO é chamado automaticamente por nenhuma aplicação neste plano —
o scaffold existe para uso manual futuro (Plano 5).

## 6. Bloco Career Engine

### 6.1 Migration: 3 tabelas novas

`career_events` — linha de fato imutável (uma por jogador por session confirmada):

```sql
create table public.career_events (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  event_type  text not null default 'session_completed',
  stats       jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (player_id, session_id)
);
alter table public.career_events enable row level security;
-- RLS: leitura pelo dono da session (is_app_staff) ou pelo próprio jogador (player_id.userId = auth.uid())
--      + membros da community_id
create index career_events_player_idx on public.career_events (player_id, occurred_at);
create index career_events_community_idx on public.career_events (community_id, occurred_at);
```

`player_career_snapshots` — uma linha por jogador:

```sql
create table public.player_career_snapshots (
  player_id        uuid primary key references public.players(id) on delete cascade,
  overall          numeric(4,1) not null,
  attributes       jsonb not null,
  achievement_count int not null default 0,
  last_session_id  uuid references public.sessions(id),
  recalc_version    text not null default 'v1',
  dirty             boolean not null default true,
  updated_at        timestamptz not null default now()
);
alter table public.player_career_snapshots enable row level security;
-- RLS: leitura pública (perfil do atleta é global); escrita só pelo sync worker
```

`player_achievements`:

```sql
create table public.player_achievements (
  player_id      uuid not null references public.players(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  primary key (player_id, achievement_id)
);
alter table public.player_achievements enable row level security;
-- RLS: leitura pública; escrita só pelo sync worker (service role ou RPC SECURITY DEFINER)
```

### 6.2 Módulos de domínio TypeScript (puros)

1. **`src/logic/careerProjection.ts`** —
   `projectObjectiveAttributes(pointEvents: PointEvent[], playerId: string): Attributes`.
   Acumula estatísticas de carreira (pontos, aces, bloqueios, assists, destaques,
   rating, presenças, etc) de todos os `point_events` do jogador já sincronizados.
   Converte cada dimensão para 0-100 usando a MESMA curva `toFut(v)` de
   `futCards.ts:149-154` e depois degrada para 0-10 (divisão por 10). Cacheável
   por `player_id`. Sem dependência de UI/sync.

2. **`src/logic/careerVut.ts`** —
   `calculateGlobalVut(objectiveAttrs: Attributes, evaluationAggregate: Aggregate | null):
   { overall: number; attributes: Attributes }`. Combina projeção objetiva (peso 0.5)
   + `aggregatePlayerEvaluations` existente (peso 0.5) em cada um dos 11 atributos,
   somando e arredondando a 1 decimal. OVR via `calculatePositionOverall` existente
   em `calculations.ts`. Se `evaluationAggregate` for null (jogador sem avaliações),
   usa só a projeção objetiva (peso 1.0).

3. **`src/logic/careerAggregator.ts`** —
   `recalcCareerSnapshot(playerId: string, allCareerEvents: CareerEvent[],
   allEvaluations: PlayerEvaluation[], existingAchievements: PlayerAchievement[]):
   { snapshot: CareerSnapshot; newlyUnlocked: PlayerAchievement[] }`.
   Orquestra: projection → calculateGlobalVut → reutiliza `resolveAchievements`
   (`futCards.ts:1366-1390`) sem modificação → compara resultado com
   `existingAchievements` para detectar novos unlocks → retorna snapshot + novos.
   Snapshot carrega `dirty: false` e `last_session_id` da última session confirmada
   do jogador.

4. **`src/logic/careerEventFactory.ts`** —
   `createCareerEventFromSession(session: Session, pointEvents: PointEvent[],
   players: Player[]): CareerEvent[]`. Deriva um career_event por jogador que
   participou da session (presente em ao menos um `Team.playerIds` de alguma
   `session.teams`). `stats` blob é determinístico: `{ pontos, aces, bloqueios,
   assists, destaques, cortadas, defesas, passos, erros, jogos, vitorias, derrotas,
   ratingAvg }`. Inclui `session_id`, `community_id`, `player_id`. Idempotente via
   `unique(player_id, session_id)` — chamar de novo para o mesmo par não duplica.

### 6.3 Orquestração no sync

Após o estágio atual (`... → sessions → teams → games → point_events`), o sync
adiciona:

```
detect newly-finished sessions (cloud_sessions where status='finished'
  and not exists career_events for that session_id)
  ↓
createCareerEventFromSession per new session
  ↓
resolve FKs (player_id, community_id, session_id) via resolveCloudId
  ↓
upsert career_events (idempotente via unique constraint)
  ↓
for each player_id afetado: marca player_career_snapshots.dirty = true
  ↓
for each dirty snapshot: recalcCareerSnapshot
  ↓
upsert player_career_snapshots (dirty=false, last_session_id updated)
upsert newly-detected player_achievements
```

Uma instância falsa de `resolveCloudId` em qualquer uma das três FKs (player,
community, session) recriaria o bug A1 — o plano inclui um teste regressivo
explícito para cada uma, no estilo do teste em `syncService.test.ts:75-174`.

### 6.4 Claim recalcula

Ao confirmar o claim (que importa `point_events` históricos e reponta o
`player.id` canônico), o sync:

1. Identifica as sessions recém-importadas (point_events com session_id que ainda
   não tem career_event para esse player).
2. Chama `createCareerEventFromSession` para cada uma.
3. Marca `player_career_snapshots[player_id].dirty = true`.
4. O próximo recalc processa TODOS os career_events do jogador (não só os novos),
   garantindo que o snapshot reflita a carreira completa pós-claim.

Idempotência: se o claim for re-tentado, as mesmas inserções de career_events são
rejeitadas pela constraint unique; nenhum estado é duplicado.

## 7. Bloco Retrofit UI

### 7.1 Adapter de visualização

Novo `src/application/careerViewAdapter.ts` —

```typescript
export interface PlayerVutView {
  vutCard: VutCard;
  achievements: Achievement[];
  snapshot: CareerSnapshot;
  communityFilteredEvents?: CareerEvent[];  // quando filtro está ativo
}

export async function loadPlayerVutView(
  playerId: string,
  activeCommunityId?: string,
): Promise<AppResult<PlayerVutView>> { ... }
```

Lê `player_career_snapshot` + `player_achievements` e monta o `VutCard`
consumindo o resultado. Internamente chama `resolvePlayerEdition` e
`buildAchievementContext` existentes — preserva a lógica visual do cartão (fundo,
moldura, raridade) que é UI chrome, não dados.

### 7.2 Componentes existentes retrofitados

**`FutCard.tsx`** e **`FutCardModal.tsx`** (sem mudanças visuais): recebem `VutCard`
pré-construído do adapter em vez de chamar `buildVutCard` inline. O contrato do
componente (props) é mantido; só a fonte de dados muda.

**`VutRevealModal.tsx`** (sem mudanças): continua recebendo `RevealItem[]` que
carregam pares `before/after` de `VutCard`. O `vutRevealUseCases.ts` existente
produz o mesmo diff — apenas o ponto de origem do VutCard muda.

**`PlayersView.tsx` / `PlayerComponents.tsx` / `PlayerEditView.tsx`**: suspendem o
botão "Ver Carta VUT" até que o snapshot esteja carregado (estado `loading` ou
`unavailable` se não há dados ainda). Nenhum novo botão, modal ou rota.

### 7.3 Filtro por comunidade (único novo elemento visual)

`FutCardModal` ganha um botão toggle opcional: "Filtrar por comunidade". Só
aparece se o jogador tiver career_events em mais de uma comunidade. Ativado,
filtrar faz uma nova query (`career_events where player_id = ? and community_id
= ?`) e regera a projeção dentro da modal — usa o mesmo adapter, com
`activeCommunityId` setado.

Sem rota, sem modal separado, sem drawer. Apenas um botão dentro do modal
existente.

## 8. Testes

### 8.1 Sync Foundation

- `outbox.test.ts`: enqueue idempotente (mesma operação duas vezes → 1 entrada);
  payload inválido rejeitado; transição de estados conforme success/failure;
  attempts limitados; backoff respeitado.
- `cachePartition.test.ts`: keys seguir namespace `<userId>_<communityId>_`;
  `markLocalCacheOwner` rejeita resultado de outro userId; trocar conta descarta
  cache do anterior.
- `syncReentrancy.test.ts`: guard persistente bloqueia sync concorrente; TTL
  expirado reassume; remount do componente não reseta o guard.
- `appError.test.ts`: cada `*CloudService` retorna `AppError` tipado; sync
  propaga `kind` para o ledger.
- `resetScaffold.test.ts`: `reset_product_data` executa em ordem referencial e
  respeita AAL2 + capability `reset_product_data`.

### 8.2 Career Engine

- `careerProjection.test.ts`: stats acumuladas corretamente; normalização 0-100
  via `toFut` passa (snapshot de testes); cache por playerId funciona.
- `careerVut.test.ts`: combinacao 50/50 sem evaluation_aggregate; 50/50 com
  evaluation_aggregate; OVR equals result of `calculatePositionOverall`.
- `careerAggregator.test.ts`: snapshot produzido tem `dirty=false`;
  `last_session_id` é o mais recente; achievements recém-desbloqueados detectados
  diff com `existingAchievements`; conjunto de achievements corresponde ao
  `resolveAchievements` para o catálogo aplicado ao jogador.
- `careerEventFactory.test.ts`: 1 event por jogador participante; `stats` blob
  determinístico (mesma entrada → mesmo blob); idempotência via unique(player, session).
- `syncService.career.test.ts`: integra inserção de career_events na cadeia de
  sync; resolve ALL three FKs (player, community, session); defere quando qualquer
  referência falta; teste regressivo estilo championship_rounds.session_id (syncService.test.ts:176-267).
- `syncService.claimRecalc.test.ts`: claim importa sessions → insere career_events
  → marca snapshot dirty → recalc reprocessa TODOS os career_events do jogador.
- RLS_matrix: positive/negative tests para `career_events`, `player_career_snapshots`,
  `player_achievements` por papel (anon, user, member, moderator, admin, owner,
  programmer, master) — seguindo a matriz do spec base seção 16.

### 8.3 Retrofit UI

- `careerViewAdapter.test.ts`: monta VutCard a partir de snapshot + achievements;
  falha gracefully se snapshot não existe (jogador sem dados confirmados).
- `FutCardModal.spec.tsx`: toggle "Filtrar por comunidade" só aparece quando
  >1 community; ativado regera query com filtro.
- `VutRevealModal.spec.tsx`: continua consumindo `RevealItem[]` sem regression.

### 8.4 Regressão

- Suite atual (518 unitários + 99 UI) passa inalterada.
- `tsc --noEmit` limpo.
- ESLint conforme baseline (381 erros pré-existentes; nenhum novo).

## 9. Gates de conclusão do Plano 3

- Outbox persistente funciona: enqueue idempotente; status transitions corretas;
  falhas recoverable viram `recoverable_error` visível; retry com backoff.
- Cache particionado por `(auth_user_id, community_id)` valida dono antes de
  aplicar resultados; trocar de conta descarta cache anterior.
- Reentrância persistente sobrevive a remount de componente; TTL expirado reassume.
- Erros tipificados em todos os cloud services; `syncIssueLedger` mostra `kind`.
- Scaffold de reset de produção testado localmente, sem aplicação em produção.
- Persistência de VUT/achievements existente: 3 tabelas; sync insere career_events
  por session confirmada; recalcula snapshots + achievements.
- VUT global combina projeção objetiva + aggregatePlayerEvaluations via mesma
  curva `toFut(v)`.
- `career_events` são filtráveis por comunidade (FK community_id indexada).
- Claim recalcula VUT do jogador a partir de TODOS os career_events pós-claim.
- `FutCard`/`FutCardModal`/`VutRevealModal` consumindo snapshots/achievements
  sem novo componente visual além do toggle de filtro por comunidade.
- `aggregatePlayerEvaluations`, `applyEvaluationAggregate`, `simulateLocalConsensus`
  não modificados (suas tests passam inalteradas).
- Catálogo de 75 achievements em `ACHIEVEMENT_CATALOG` não modificado.
- Matriz RLS completa para as 3 novas tabelas.
- Suite + typecheck + lint + build aprovados.
- Programa-mestre anotado com desvio do escopo (Plano 3 cobre trabalho dos
  Planos 4 e 5).

## 10. Fora do escopo (delegado ou adiada)

- UI Experiência / Interface, esqueumorfismo, nova navegação (Plano 5).
- Aplicação manual do reset em produção (Plano 5).
- Contratos formais `ScreenContract` (Plano 5).
- Transferência explícita de owner/device (parcialmente coberto pelo outbox que
  registra `auth_user_id` por operação; transferência explícita fica posterior).
- Agregação de avaliações isolada por comunidade (permanece global, como no Plano 2).

## 11. Referências

- Spec base: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`
  (seções 9, 11, 14, 16, 17).
- Programa: `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
  (será anotado com desvio do Plano 3).
- VUT v1: `src/logic/futCards.ts:1-6` (comentário: "tudo é DERIVADO em tempo de leitura;
  nenhuma persistência nova no v1").
- VUT v1 deferral: `docs/archive/PLANO_VUT_CARTAS.md` lines 240, 262 (edições
  conquistadas -> persistent — adiada para v2, este plano).
- Outbox target state: spec base seção 11.4.
- Cache partition target: spec base seção 11.3.
- Reset sequence: spec base seção 17.
- Erros tipados: spec base seção 14.
- Bug A1 histórico (FK resolution): commits `220ab15`, `3d0e32c`, `c132219`.
- Sync original (Plano 2 divergences): `docs/superpowers/specs/2026-07-24-plano-2-avaliacoes-design.md:79-83, 140-145`.
