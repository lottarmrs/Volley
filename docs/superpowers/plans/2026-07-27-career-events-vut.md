# Career Events, Global VUT & Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar confiável o VUT que já existe — dando a ele um conjunto de entrada
confirmado (`career_events`), versão de contrato, escopo global sem vazar privacidade e
recálculo determinístico — e depois acrescentar dez marcos de carreira e a aba de
histórico.

**Architecture:** `career_events` é um livro-razão na granularidade de sessão, gerado no
servidor por triggers de statement sobre `point_events`/`games`, com `source_key`
determinística para idempotência. VUT e conquistas continuam derivados (nunca persistidos),
calculados sobre esse livro-razão. Uma view agregada `career_totals` expõe totais globais
de terceiros sem revelar de quais comunidades vieram.

**Tech Stack:** Mesma stack dos planos anteriores — TypeScript, React, Vite, Supabase
(Postgres + RLS). Sem dependência nova.

## Global Constraints

- **Ids locais vs nuvem (a armadilha central deste plano).** `point_events.player_id`,
  `point_events.game_id`, `teams.player_ids`, `games.team_a_id`, `games.team_b_id` e
  `games.winner_team_id` são `text` e sobem **sem remapeamento** — carregam ids
  **locais**. Só `session_id` e `community_id` são resolvidos para id de nuvem no sync
  (`syncService.ts:1198-1300`). Toda resolução no servidor usa
  `coalesce(x.local_id, x.id::text)` e é **escopada por `owner_id`**, porque o índice
  único é `(owner_id, local_id)`, não global.
- **Grants: `revoke` antes do `grant`, e de `anon` E `authenticated`.** O Supabase
  concede `ALL` por padrão em objetos novos do schema `public`; revogar só de `anon` não
  faz nada. Ver `20260726200000_lock_community_profile_summary_readonly.sql`.
- **Triggers são de statement com transition table**, nunca de linha. `point_events`
  chega só em lote no sync (`bulkUpsertRows`); trigger de linha recomputaria o mesmo
  resumo uma vez por ponto.
- **VUT e estado de conquista nunca são persistidos.** Permanecem derivados.
- **Semântica de estatística espelha `src/logic/statistics.ts`**: só `sessions.status =
  'finished'` e `games.status = 'finished'`; `event_kind = 'highlight'` nunca conta como
  ponto nem erro; ponto creditado é `point_type = 'winner'` ou, no legado, `reason in
  ('attack','block','serve_ace','defense_counterattack','tip')`.
- **UI congelada, com uma exceção.** Só a Task 9 (aba de histórico) toca UI visível, por
  decisão explícita do usuário registrada no spec e no doc do programa. Nenhuma outra task
  altera tela.
- Migrations são aplicadas no projeto real `csoslatxjjazrtrtylke` via MCP
  `apply_migration` e verificadas com `execute_sql` + `get_advisors`.
- Runners: `*.test.ts` → `npm run test:unit` (ou `npx tsx --test <path>`);
  `*.spec.tsx` → `npx vitest run <path>`. `vitest.config.ts` inclui **apenas**
  `*.spec.{ts,tsx}`, então rodar um `.test.ts` pelo vitest casa zero arquivos e "passa"
  sem executar nada.

## File Structure

**Fase 3A**
- `supabase/migrations/20260727100000_career_events.sql` — tabela, índices, RLS, grants
- `supabase/migrations/20260727110000_career_events_generation.sql` — função + triggers
- `supabase/migrations/20260727120000_career_totals.sql` — view agregada + grants
- `src/shared/types/career.ts` — `CareerEvent`, `CareerTotals`, `CAREER_CONTRACT_VERSION`
- `src/infra/supabase/careerCloudService.ts` — leitura do livro-razão e dos totais
- `src/logic/career.ts` — agregação pura do livro-razão para o formato que o VUT consome
- `supabase/migrations/schema.sql`, `src/infra/supabase/schema.test.ts` — consolidado

**Fase 3B**
- `supabase/migrations/20260727130000_career_milestones.sql` — geração dos dez marcos
- `src/logic/careerMilestones.ts` — apresentação (slug → rótulo/emoji), sem limiares
- `src/components/player/CareerTimeline.tsx` — aba de histórico

---

### Task 1: Tabela `career_events`

**Files:**
- Create: `supabase/migrations/20260727100000_career_events.sql`
- Modify: `supabase/migrations/schema.sql`
- Test: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `players`, `communities`, `sessions` (existentes).
- Produces: tabela `public.career_events` com colunas `id, player_id, community_id,
  session_id, type, occurred_at, payload, source_key, contract_version, created_at`.
  Tasks 2, 3, 7 dependem dessas colunas e da unicidade de `source_key`.

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/20260727100000_career_events.sql`:

```sql
-- Livro-razao de carreira CONFIRMADA. Gerado exclusivamente pelo servidor a partir de
-- linhas que ja estao no Postgres, entao "confirmado" e verdade por construcao: nao
-- existe evento para dado que nunca chegou na nuvem (spec base secao 9).
-- Ver docs/superpowers/specs/2026-07-27-career-events-vut-design.md.

create table public.career_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  type text not null check (type in ('session_played', 'milestone')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  -- Chave deterministica: 'player:{uuid}|session:{uuid}|session_played' ou
  -- 'player:{uuid}|milestone:{slug}'. E o que torna regeneracao e retry idempotentes
  -- (spec base secao 6: retry nao duplica evento nem conquista).
  source_key text not null unique,
  contract_version integer not null,
  created_at timestamptz not null default now()
);

create index career_events_player_idx on public.career_events (player_id, occurred_at desc);
create index career_events_session_idx on public.career_events (session_id);

alter table public.career_events enable row level security;

-- Ninguem escreve pelo cliente: as linhas nascem do trigger (security definer).
-- revoke ANTES do grant e dos DOIS papeis — o Supabase concede ALL por padrao em
-- objetos novos do schema public, entao revogar so de anon nao faz nada.
revoke all on table public.career_events from anon, authenticated;
grant select on table public.career_events to authenticated;

create policy "Career events readable by owner or shared community"
  on public.career_events
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = career_events.player_id
        and p.user_id = (select auth.uid())
    )
    or public.is_app_staff()
    or (
      community_id is not null
      and public.current_user_has_community_role(community_id)
    )
  );
```

- [ ] **Step 2: Aplicar em produção**

Use o MCP `apply_migration` no projeto `csoslatxjjazrtrtylke`, nome
`career_events`. Verifique com `execute_sql`:

```sql
select
  has_table_privilege('authenticated','public.career_events','SELECT') as sel,
  has_table_privilege('authenticated','public.career_events','INSERT') as ins,
  has_table_privilege('authenticated','public.career_events','DELETE') as del;
```

Esperado: `sel = true`, `ins = false`, `del = false`. Rode `get_advisors` (security) e
confirme nenhuma advertência nova além do conjunto conhecido.

- [ ] **Step 3: Refletir no schema.sql consolidado**

Copie o bloco inteiro acima para `supabase/migrations/schema.sql`, logo após a definição
de `sessions` (a tabela referenciada por `session_id` precisa existir antes).

- [ ] **Step 4: Escrever os testes de schema**

Acrescente a `src/infra/supabase/schema.test.ts`, seguindo o padrão de fixtures do
arquivo (`readFixture` no topo):

```typescript
const careerEventsMigration = readFixture(
  new URL('../../../supabase/migrations/20260727100000_career_events.sql', import.meta.url),
);

test('career_events is server-generated and read-only for clients', () => {
  for (const artifact of [careerEventsMigration, baseSchema]) {
    assert.match(artifact, /create table public\.career_events \(/i);
    assert.match(artifact, /source_key text not null unique/i);
    assert.match(artifact, /contract_version integer not null/i);
    assert.match(artifact, /alter table public\.career_events enable row level security;/i);

    // O revoke precisa citar authenticated E vir antes do grant: o padrao do Supabase
    // concede ALL, entao revogar so de anon deixa INSERT/UPDATE/DELETE abertos.
    const revoke = artifact.match(/revoke all on table public\.career_events from ([^;]*);/i)?.[1];
    assert.ok(revoke, 'missing revoke on career_events');
    assert.match(revoke, /\bauthenticated\b/i);
    assert.match(revoke, /\banon\b/i);

    const revokeAt = artifact.search(/revoke all on table public\.career_events/i);
    const grantAt = artifact.search(/grant select on table public\.career_events/i);
    assert.ok(revokeAt !== -1 && grantAt !== -1);
    assert.ok(revokeAt < grantAt, 'revoke must precede the grant');
  }
});
```

- [ ] **Step 5: Rodar os testes**

Run: `npx tsx --test src/infra/supabase/schema.test.ts`
Expected: PASS, incluindo o novo teste.

- [ ] **Step 6: Mutation-test o teste de grants**

Troque temporariamente `from anon, authenticated` por `from anon` no `schema.sql`, rode o
teste e confirme que ele **falha**. Restaure. Um teste de grants que passa nos dois
estados não protege nada.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260727100000_career_events.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add career_events ledger, server-generated and read-only"
```

---

### Task 2: Geração e regeneração dos resumos de sessão

**Files:**
- Create: `supabase/migrations/20260727110000_career_events_generation.sql`
- Modify: `supabase/migrations/schema.sql`
- Test: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `public.career_events` (Task 1).
- Produces: `public.regenerate_career_events_for_sessions(uuid[])` e
  `public.regenerate_career_events()` (trigger). Task 6 chama a primeira; Task 7 estende a
  mesma migration chain.

- [ ] **Step 1: Ler a semântica que o SQL precisa espelhar**

Leia `src/logic/statistics.ts:39-110` (`calculatePlayerStats`) e `src/logic/match.ts:164-180`
(`isCreditedPoint`, `CREDITED_REASONS`). O SQL abaixo reproduz exatamente essas regras. Não
invente variações: divergência entre as duas implementações é o principal risco desta task.

- [ ] **Step 2: Escrever a migration**

Crie `supabase/migrations/20260727110000_career_events_generation.sql`:

```sql
-- Gera os resumos de sessao do livro-razao. Espelha src/logic/statistics.ts.
--
-- ATENCAO (armadilha central deste plano): point_events.player_id, point_events.game_id,
-- teams.player_ids e games.team_a_id/team_b_id/winner_team_id sao TEXT e carregam ids
-- LOCAIS — o sync so remapeia session_id e community_id. Por isso toda resolucao usa
-- coalesce(x.local_id, x.id::text) e e escopada por owner_id: o indice unico e
-- (owner_id, local_id), nao global.

create or replace function public.regenerate_career_events_for_sessions(target_sessions uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_sessions is null or array_length(target_sessions, 1) is null then
    return;
  end if;

  -- Apagar-e-inserir por sessao afetada: com a source_key unica isso torna a
  -- regeneracao idempotente e auto-corretiva (jogo apagado remove seus eventos).
  delete from public.career_events
   where type = 'session_played'
     and session_id = any(target_sessions);

  insert into public.career_events (
    player_id, community_id, session_id, type, occurred_at, payload, source_key, contract_version
  )
  with player_ref as (
    select p.id as player_uuid, p.owner_id, coalesce(p.local_id, p.id::text) as ref
      from public.players p
     where p.deleted_at is null
  ),
  team_ref as (
    select t.id, t.session_id, t.owner_id, t.player_ids,
           coalesce(t.local_id, t.id::text) as ref
      from public.teams t
     where t.session_id = any(target_sessions) and t.deleted_at is null
  ),
  game_ref as (
    select g.id, g.session_id, g.owner_id, g.team_a_id, g.team_b_id, g.winner_team_id,
           coalesce(g.local_id, g.id::text) as ref
      from public.games g
     where g.session_id = any(target_sessions)
       and g.deleted_at is null
       and g.status = 'finished'
  ),
  -- Times do jogador: teams.player_ids guarda ids LOCAIS de jogador.
  player_teams as (
    select pr.player_uuid, tr.session_id, tr.ref as team_ref
      from team_ref tr
      join player_ref pr on pr.owner_id = tr.owner_id and pr.ref = any(tr.player_ids)
  ),
  player_games as (
    select pt.player_uuid, gr.id as game_uuid, gr.ref as game_ref, gr.session_id,
           (gr.winner_team_id is not null and gr.winner_team_id = pt.team_ref) as won
      from game_ref gr
      join player_teams pt
        on pt.session_id = gr.session_id
       and (gr.team_a_id = pt.team_ref or gr.team_b_id = pt.team_ref)
  ),
  -- point_events.game_id tambem e id LOCAL de jogo.
  scored as (
    select pg.player_uuid, pg.session_id,
           count(*) filter (
             where pe.event_kind is distinct from 'highlight'
               and (
                 case when pe.point_type is not null then pe.point_type = 'winner'
                      else pe.reason in ('attack','block','serve_ace','defense_counterattack','tip')
                 end
               )
           ) as points,
           count(*) filter (
             where pe.event_kind is distinct from 'highlight'
               and pe.point_type = 'error'
           ) as errors,
           count(*) filter (where pe.event_kind = 'highlight') as highlights
      from player_games pg
      join player_ref pr on pr.player_uuid = pg.player_uuid
      join public.point_events pe
        on pe.game_id = pg.game_ref
       and pe.player_id = pr.ref
       and pe.deleted_at is null
     group by pg.player_uuid, pg.session_id
  ),
  rollup as (
    select pg.player_uuid,
           pg.session_id,
           count(*) as games_played,
           count(*) filter (where pg.won) as games_won,
           coalesce(max(s.points), 0) as points,
           coalesce(max(s.errors), 0) as errors,
           coalesce(max(s.highlights), 0) as highlights
      from player_games pg
      left join scored s
        on s.player_uuid = pg.player_uuid and s.session_id = pg.session_id
     group by pg.player_uuid, pg.session_id
  )
  select r.player_uuid,
         se.community_id,
         r.session_id,
         'session_played',
         coalesce(se.date::timestamptz, se.created_at),
         jsonb_build_object(
           'games_played', r.games_played,
           'games_won', r.games_won,
           'points', r.points,
           'errors', r.errors,
           'highlights', r.highlights
         ),
         'player:' || r.player_uuid || '|session:' || r.session_id || '|session_played',
         1
    from rollup r
    join public.sessions se on se.id = r.session_id
   where se.deleted_at is null
     and se.status = 'finished';
end;
$$;

revoke execute on function public.regenerate_career_events_for_sessions(uuid[]) from public, anon;
grant execute on function public.regenerate_career_events_for_sessions(uuid[]) to authenticated;

-- Trigger de STATEMENT com transition table. Um trigger de linha dispararia uma vez por
-- ponto: point_events chega em lote no sync (bulkUpsertRows), entao uma sessao de 100
-- pontos custaria 100 recomputacoes do mesmo resumo.
create or replace function public.regenerate_career_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
begin
  select array_agg(distinct session_id) into affected
    from (
      select session_id from touched_rows where session_id is not null
    ) s;

  perform public.regenerate_career_events_for_sessions(affected);
  return null;
end;
$$;

create trigger regenerate_career_after_point_events_ins
  after insert on public.point_events
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_point_events_upd
  after update on public.point_events
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_point_events_del
  after delete on public.point_events
  referencing old table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_ins
  after insert on public.games
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_upd
  after update on public.games
  referencing new table as touched_rows
  for each statement execute function public.regenerate_career_events();

create trigger regenerate_career_after_games_del
  after delete on public.games
  referencing old table as touched_rows
  for each statement execute function public.regenerate_career_events();
```

- [ ] **Step 3: Aplicar e verificar idempotência em produção**

Aplique via `apply_migration` (nome `career_events_generation`). Como produção está sem
sessões, crie um cenário mínimo com `execute_sql` numa transação e faça rollback, ou
verifique apenas que a função existe e que os seis triggers estão registrados:

```sql
select tgname from pg_trigger
 where tgrelid in ('public.point_events'::regclass, 'public.games'::regclass)
   and not tgisinternal
 order by tgname;
```

Esperado: os seis `regenerate_career_after_*`.

- [ ] **Step 4: Refletir no schema.sql**

Copie função e triggers para `supabase/migrations/schema.sql`, depois da tabela
`career_events` e depois de `games`/`point_events` (os triggers referenciam essas tabelas).

- [ ] **Step 5: Escrever os testes de schema**

```typescript
const careerGenerationMigration = readFixture(
  new URL('../../../supabase/migrations/20260727110000_career_events_generation.sql', import.meta.url),
);

test('career regeneration uses statement triggers, not row triggers', () => {
  // point_events chega em lote no sync; um trigger de linha recomputaria o mesmo
  // resumo uma vez por ponto.
  const triggers = careerGenerationMigration.match(/create trigger regenerate_career_after_[\s\S]*?;/gi) ?? [];
  assert.equal(triggers.length, 6, 'expected 6 triggers (ins/upd/del on point_events and games)');
  for (const trigger of triggers) {
    assert.match(trigger, /for each statement/i, 'trigger must be statement-level');
    assert.match(trigger, /referencing (new|old) table as touched_rows/i);
  }
  assert.doesNotMatch(careerGenerationMigration, /for each row/i);
});

test('career regeneration resolves local ids scoped by owner', () => {
  // point_events.player_id / teams.player_ids carregam ids LOCAIS; o indice unico e
  // (owner_id, local_id), entao o join tem de ser escopado por owner.
  const fn = extractSqlFunction(careerGenerationMigration, 'regenerate_career_events_for_sessions');
  assert.ok(fn, 'missing regenerate_career_events_for_sessions');
  assert.match(fn, /coalesce\(p\.local_id, p\.id::text\)/i);
  assert.match(fn, /pr\.owner_id = tr\.owner_id/i);
  // Apagar-e-inserir e o que torna a regeneracao idempotente.
  assert.match(fn, /delete from public\.career_events/i);
  assert.match(fn, /and session_id = any\(target_sessions\)/i);
  // So sessao e jogo finalizados entram, espelhando statistics.ts.
  assert.match(fn, /se\.status = 'finished'/i);
  assert.match(fn, /g\.status = 'finished'/i);
});

test('career rollup mirrors the credited-point rules of statistics.ts', () => {
  const fn = extractSqlFunction(careerGenerationMigration, 'regenerate_career_events_for_sessions');
  assert.ok(fn);
  assert.match(fn, /'attack','block','serve_ace','defense_counterattack','tip'/i);
  assert.match(fn, /pe\.point_type = 'winner'/i);
  // Destaque nunca conta como ponto nem erro.
  assert.match(fn, /event_kind is distinct from 'highlight'/i);
});
```

- [ ] **Step 6: Rodar os testes**

Run: `npx tsx --test src/infra/supabase/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260727110000_career_events_generation.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): generate career session rollups via statement triggers"
```

---

### Task 3: View `career_totals`

**Files:**
- Create: `supabase/migrations/20260727120000_career_totals.sql`
- Modify: `supabase/migrations/schema.sql`
- Test: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `career_events` (Task 1).
- Produces: view `public.career_totals` com colunas `player_id, sessions_played,
  games_played, games_won, total_points, total_errors, total_highlights, last_played_at`.
  Task 4 lê exatamente esses nomes.

- [ ] **Step 1: Escrever a migration**

```sql
-- Totais globais de carreira SEM atribuicao de comunidade. Resolve o conflito entre
-- "VUT e global" (spec base secao 9) e a privacidade por comunidade: o card de terceiros
-- fica global e correto sem revelar em quais comunidades a pessoa joga.
--
-- Por ser view com GROUP BY, e estruturalmente NAO auto-updatable — diferente de
-- community_profile_summary, que era de tabela unica e por isso virou vetor de escrita
-- (ver 20260726200000_lock_community_profile_summary_readonly.sql). Ainda assim os
-- grants sao fixados explicitamente.

create or replace view public.career_totals as
select
  ce.player_id,
  count(*) filter (where ce.type = 'session_played') as sessions_played,
  coalesce(sum((ce.payload->>'games_played')::int), 0) as games_played,
  coalesce(sum((ce.payload->>'games_won')::int), 0) as games_won,
  coalesce(sum((ce.payload->>'points')::int), 0) as total_points,
  coalesce(sum((ce.payload->>'errors')::int), 0) as total_errors,
  coalesce(sum((ce.payload->>'highlights')::int), 0) as total_highlights,
  max(ce.occurred_at) as last_played_at
from public.career_events ce
where ce.type = 'session_played'
group by ce.player_id;

revoke all on public.career_totals from anon, authenticated;
grant select on public.career_totals to authenticated;
```

- [ ] **Step 2: Aplicar e verificar**

`apply_migration` com nome `career_totals`. Depois:

```sql
select
  has_table_privilege('authenticated','public.career_totals','SELECT') as sel,
  has_table_privilege('authenticated','public.career_totals','DELETE') as del,
  (select is_updatable from information_schema.views
    where table_schema='public' and table_name='career_totals') as updatable;
```

Esperado: `sel = true`, `del = false`, `updatable = 'NO'`.

- [ ] **Step 3: Refletir no schema.sql**

Copie o bloco para `supabase/migrations/schema.sql`, depois de `career_events`.

- [ ] **Step 4: Escrever o teste**

```typescript
const careerTotalsMigration = readFixture(
  new URL('../../../supabase/migrations/20260727120000_career_totals.sql', import.meta.url),
);

test('career_totals aggregates globally without community attribution', () => {
  for (const artifact of [careerTotalsMigration, baseSchema]) {
    const view = artifact.match(/create or replace view public\.career_totals as[\s\S]*?;/i)?.[0];
    assert.ok(view, 'missing career_totals view');
    assert.match(view, /group by ce\.player_id/i);
    // Nunca pode expor a comunidade de origem — e o que torna o total global seguro.
    assert.doesNotMatch(view, /community_id/i);

    const revoke = artifact.match(/revoke all on public\.career_totals from ([^;]*);/i)?.[1];
    assert.ok(revoke);
    assert.match(revoke, /\bauthenticated\b/i);
  }
});
```

- [ ] **Step 5: Rodar e commitar**

```bash
npx tsx --test src/infra/supabase/schema.test.ts
git add supabase/migrations/20260727120000_career_totals.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add career_totals aggregate view"
```

---

### Task 4: Tipos e serviço de leitura no cliente

**Files:**
- Create: `src/shared/types/career.ts`
- Create: `src/infra/supabase/careerCloudService.ts`
- Test: `src/infra/supabase/careerCloudService.test.ts`

**Interfaces:**
- Consumes: `career_events`, `career_totals` (Tasks 1 e 3).
- Produces: `CareerEvent`, `CareerTotals`, `CAREER_CONTRACT_VERSION`,
  `careerCloudService.fetchEventsByPlayer(playerCloudId: string): Promise<CareerEvent[]>`,
  `careerCloudService.fetchTotals(playerCloudId: string): Promise<CareerTotals | null>`.
  Task 5 consome ambos.

- [ ] **Step 1: Criar os tipos**

Crie `src/shared/types/career.ts`:

```typescript
/** Versao do contrato de evento de carreira. Sobe quando muda o SIGNIFICADO de um
 *  evento ou a forma do payload — nao quando muda a formula do VUT, que e recalculada
 *  na hora e nao precisa de migracao. */
export const CAREER_CONTRACT_VERSION = 1;

export interface CareerEventPayload {
  games_played?: number;
  games_won?: number;
  points?: number;
  errors?: number;
  highlights?: number;
}

export interface CareerEvent {
  id: string;
  playerId: string;
  communityId: string | null;
  sessionId: string | null;
  type: 'session_played' | 'milestone';
  occurredAt: string;
  payload: CareerEventPayload & { slug?: string };
  contractVersion: number;
}

export interface CareerTotals {
  playerId: string;
  sessionsPlayed: number;
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  totalErrors: number;
  totalHighlights: number;
  lastPlayedAt: string | null;
}
```

- [ ] **Step 2: Escrever o teste do serviço**

Crie `src/infra/supabase/careerCloudService.test.ts` (runner nativo do Node, como os
outros `*.test.ts` de infra):

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDbToCareerEvent, mapDbToCareerTotals } from './careerCloudService';

test('mapDbToCareerEvent converts snake_case rows and defaults payload', () => {
  const event = mapDbToCareerEvent({
    id: 'e1',
    player_id: 'p1',
    community_id: null,
    session_id: 's1',
    type: 'session_played',
    occurred_at: '2026-07-27T20:00:00Z',
    payload: { points: 12, games_won: 2 },
    contract_version: 1,
  });

  assert.equal(event.playerId, 'p1');
  assert.equal(event.sessionId, 's1');
  assert.equal(event.communityId, null);
  assert.equal(event.payload.points, 12);
  assert.equal(event.contractVersion, 1);
});

test('mapDbToCareerTotals coerces null aggregates to zero', () => {
  // A view usa coalesce, mas um jogador sem linha nenhuma nao aparece na view —
  // o mapper nao pode transformar ausencia em NaN.
  const totals = mapDbToCareerTotals({
    player_id: 'p1',
    sessions_played: 3,
    games_played: 9,
    games_won: 5,
    total_points: 40,
    total_errors: 7,
    total_highlights: 2,
    last_played_at: '2026-07-27T20:00:00Z',
  });

  assert.equal(totals.sessionsPlayed, 3);
  assert.equal(totals.gamesWon, 5);
  assert.equal(totals.totalPoints, 40);
  assert.ok(Number.isFinite(totals.totalErrors));
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npx tsx --test src/infra/supabase/careerCloudService.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o serviço**

Crie `src/infra/supabase/careerCloudService.ts`, seguindo o padrão de
`playerCloudService.ts` (mapper exportado + objeto de serviço):

```typescript
import { supabase } from '../../lib/supabaseClient';
import type { CareerEvent, CareerTotals } from '@shared/types/career';

type DbRecord = Record<string, any>;

export function mapDbToCareerEvent(db: DbRecord): CareerEvent {
  return {
    id: db.id,
    playerId: db.player_id,
    communityId: db.community_id ?? null,
    sessionId: db.session_id ?? null,
    type: db.type,
    occurredAt: db.occurred_at,
    payload: db.payload ?? {},
    contractVersion: db.contract_version,
  };
}

export function mapDbToCareerTotals(db: DbRecord): CareerTotals {
  return {
    playerId: db.player_id,
    sessionsPlayed: Number(db.sessions_played ?? 0),
    gamesPlayed: Number(db.games_played ?? 0),
    gamesWon: Number(db.games_won ?? 0),
    totalPoints: Number(db.total_points ?? 0),
    totalErrors: Number(db.total_errors ?? 0),
    totalHighlights: Number(db.total_highlights ?? 0),
    lastPlayedAt: db.last_played_at ?? null,
  };
}

export const careerCloudService = {
  /** Livro-razao detalhado. A RLS ja limita ao que o leitor pode ver. */
  async fetchEventsByPlayer(playerCloudId: string): Promise<CareerEvent[]> {
    const { data, error } = await supabase
      .from('career_events')
      .select('*')
      .eq('player_id', playerCloudId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDbToCareerEvent);
  },

  /** Totais globais, sem atribuicao de comunidade. */
  async fetchTotals(playerCloudId: string): Promise<CareerTotals | null> {
    const { data, error } = await supabase
      .from('career_totals')
      .select('*')
      .eq('player_id', playerCloudId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapDbToCareerTotals(data) : null;
  },
};
```

- [ ] **Step 5: Rodar para ver passar**

Run: `npx tsx --test src/infra/supabase/careerCloudService.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/career.ts src/infra/supabase/careerCloudService.ts src/infra/supabase/careerCloudService.test.ts
git commit -m "feat(career): add career event types and cloud read service"
```

---

### Task 5: VUT confirmado x provisório

**Files:**
- Create: `src/logic/career.ts`
- Test: `src/logic/career.test.ts`

**Interfaces:**
- Consumes: `CareerTotals` (Task 4); `PlayerStats` de `src/logic/statistics.ts`.
- Produces: `interface CareerStats { gamesPlayed, wins, losses, winRate, totalPoints,
  errors, highlights: number }`, `careerStatsFromTotals(totals: CareerTotals | null):
  CareerStats`, `type CareerConfidence = 'confirmed' | 'provisional'` e
  `resolveCareer(confirmed: CareerTotals | null, local: PlayerStats):
  { stats: CareerStats; confidence: CareerConfidence }`.

- [ ] **Step 1: Escrever os testes**

Crie `src/logic/career.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { careerStatsFromTotals } from './career';
import type { CareerTotals } from '../shared/types/career';

function totals(overrides: Partial<CareerTotals> = {}): CareerTotals {
  return {
    playerId: 'p1',
    sessionsPlayed: 4,
    gamesPlayed: 10,
    gamesWon: 6,
    totalPoints: 55,
    totalErrors: 9,
    totalHighlights: 3,
    lastPlayedAt: '2026-07-27T20:00:00Z',
    ...overrides,
  };
}

test('careerStatsFromTotals derives losses and win rate', () => {
  const stats = careerStatsFromTotals(totals());

  assert.equal(stats.gamesPlayed, 10);
  assert.equal(stats.wins, 6);
  assert.equal(stats.losses, 4);
  assert.equal(stats.winRate, 60);
});

test('careerStatsFromTotals returns a zeroed shape for a player with no career', () => {
  // Jogador sem nenhuma sessao confirmada nao aparece na view: o resultado precisa ser
  // zero, nunca NaN — o valor vai direto para a tela.
  const stats = careerStatsFromTotals(null);

  assert.equal(stats.gamesPlayed, 0);
  assert.equal(stats.winRate, 0);
  assert.ok(Number.isFinite(stats.winRate));
});

test('careerStatsFromTotals never divides by zero', () => {
  const stats = careerStatsFromTotals(totals({ gamesPlayed: 0, gamesWon: 0 }));

  assert.equal(stats.winRate, 0);
  assert.ok(Number.isFinite(stats.winRate));
});

test('resolveCareer prefers the confirmed ledger and says so', () => {
  const resolved = resolveCareer(totals(), localStats());

  assert.equal(resolved.confidence, 'confirmed');
  assert.equal(resolved.stats.gamesPlayed, 10);
});

test('resolveCareer falls back to local data and marks it provisional', () => {
  // Spec base secao 9: eventos offline podem mostrar progresso provisorio, mas VUT e
  // conquista oficiais so mudam apos confirmacao cloud. Sem livro-razao, o numero
  // aparece — rotulado.
  const resolved = resolveCareer(null, localStats());

  assert.equal(resolved.confidence, 'provisional');
  assert.equal(resolved.stats.gamesPlayed, 3);
  assert.equal(resolved.stats.wins, 2);
});
```

Onde `localStats()` monta o `PlayerStats` que `calculatePlayerStats` já produz hoje:

```typescript
import type { PlayerStats } from './statistics';

function localStats(): PlayerStats {
  return {
    gamesPlayed: 3, wins: 2, losses: 1, winRate: 66.7, totalPoints: 12,
    aces: 1, kills: 4, cortadas: 3, tips: 1, defenses: 2, blocks: 1,
    assists: 0, highlights: 1, errors: 2, errorsByType: {}, balance: 10,
    pointsContribution: 25,
  };
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx tsx --test src/logic/career.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Crie `src/logic/career.ts`:

```typescript
import type { CareerTotals } from '@shared/types/career';

/** Carreira confirmada vem do livro-razao (nuvem); provisoria e calculada localmente
 *  sobre dados ainda nao sincronizados. O spec base exige a distincao: conquista e VUT
 *  oficiais so mudam apos confirmacao cloud. */
export type CareerConfidence = 'confirmed' | 'provisional';

export interface CareerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  errors: number;
  highlights: number;
}

const EMPTY: CareerStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  totalPoints: 0,
  errors: 0,
  highlights: 0,
};

export function careerStatsFromTotals(totals: CareerTotals | null): CareerStats {
  if (!totals) return { ...EMPTY };

  const gamesPlayed = totals.gamesPlayed;
  const wins = totals.gamesWon;
  const losses = Math.max(0, gamesPlayed - wins);

  return {
    gamesPlayed,
    wins,
    losses,
    // Sem jogo nenhum a divisao seria 0/0 = NaN, e esse numero vai direto para a tela.
    winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
    totalPoints: totals.totalPoints,
    errors: totals.totalErrors,
    highlights: totals.totalHighlights,
  };
}

/** Escolhe entre carreira confirmada e provisoria, sempre dizendo qual e qual.
 *  Confirmado vem do livro-razao; sem ele, cai para o que o dispositivo calculou
 *  localmente (calculatePlayerStats) e rotula como provisorio. */
export function resolveCareer(
  confirmed: CareerTotals | null,
  local: PlayerStats,
): { stats: CareerStats; confidence: CareerConfidence } {
  if (confirmed) {
    return { stats: careerStatsFromTotals(confirmed), confidence: 'confirmed' };
  }

  return {
    stats: {
      gamesPlayed: local.gamesPlayed,
      wins: local.wins,
      losses: local.losses,
      winRate: local.winRate,
      totalPoints: local.totalPoints,
      errors: local.errors,
      highlights: local.highlights,
    },
    confidence: 'provisional',
  };
}
```

O import correspondente no topo do arquivo:

```typescript
import type { PlayerStats } from './statistics';
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npx tsx --test src/logic/career.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

```bash
npm test
npx tsc --noEmit
```

Esperado: tudo verde. `futCards.test.ts` em especial precisa continuar passando sem
alteração — as 79 conquistas não mudam de comportamento nesta task.

- [ ] **Step 6: Commit**

```bash
git add src/logic/career.ts src/logic/career.test.ts
git commit -m "feat(career): derive career stats from the confirmed ledger"
```

---

### Task 6: Recálculo no claim

**Files:**
- Create: `supabase/migrations/20260727140000_career_recalc_on_claim.sql`
- Modify: `supabase/migrations/schema.sql`
- Test: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `regenerate_career_events_for_sessions(uuid[])` (Task 2).
- Produces: `public.recalculate_player_career(p_player_id uuid)`.

- [ ] **Step 1: Escrever a migration**

O spec base é explícito: "claim importa eventos e recalcula; não copia um cartão
congelado". Como a regeneração é idempotente, isso é só chamar a mesma função para as
sessões daquele jogador.

```sql
-- Recalcula a carreira de um jogador. Usado no claim: reivindicar um jogador historico
-- regenera a carreira dele a partir do dado ja confirmado, em vez de copiar um cartao
-- congelado (spec base secao 9).

create or replace function public.recalculate_player_career(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
begin
  -- Sessoes onde o jogador aparece em algum time. teams.player_ids guarda ids LOCAIS,
  -- resolvidos por (owner_id, local_id).
  select array_agg(distinct t.session_id) into affected
    from public.teams t
    join public.players p
      on p.owner_id = t.owner_id
     and coalesce(p.local_id, p.id::text) = any(t.player_ids)
   where p.id = p_player_id
     and t.deleted_at is null
     and t.session_id is not null;

  perform public.regenerate_career_events_for_sessions(affected);
end;
$$;

revoke execute on function public.recalculate_player_career(uuid) from public, anon;
grant execute on function public.recalculate_player_career(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar e verificar**

`apply_migration` com nome `career_recalc_on_claim`. Verifique:

```sql
select proname, proacl::text from pg_proc p
 join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='recalculate_player_career';
```

Esperado: sem `=X/postgres` solto (PUBLIC) e sem `anon=X`.

- [ ] **Step 3: Refletir no schema.sql e testar**

Copie para `supabase/migrations/schema.sql` e acrescente:

```typescript
test('recalculate_player_career resolves local team ids scoped by owner', () => {
  const fn = extractSqlFunction(baseSchema, 'recalculate_player_career');
  assert.ok(fn, 'consolidated schema missing recalculate_player_career');
  assert.match(fn, /p\.owner_id = t\.owner_id/i);
  assert.match(fn, /coalesce\(p\.local_id, p\.id::text\) = any\(t\.player_ids\)/i);
  assert.match(fn, /perform public\.regenerate_career_events_for_sessions\(affected\)/i);
});
```

- [ ] **Step 4: Rodar e commitar**

```bash
npx tsx --test src/infra/supabase/schema.test.ts
git add supabase/migrations/20260727140000_career_recalc_on_claim.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): recalculate a player's career on claim"
```

---

### Task 7: Os dez marcos de carreira (3B)

**Files:**
- Create: `supabase/migrations/20260727150000_career_milestones.sql`
- Modify: `supabase/migrations/schema.sql`
- Test: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `career_events` e `regenerate_career_events_for_sessions` (Tasks 1-2).
- Produces: `public.regenerate_player_milestones(p_player_id uuid)`, chamada ao final de
  `regenerate_career_events_for_sessions`. Slugs: `first_session`, `first_win`,
  `games_10`, `games_50`, `games_100`, `points_100`, `points_500`, `points_1000`,
  `streak_3`, `streak_5`. Task 8 lê exatamente esses slugs.

- [ ] **Step 1: Escrever a migration**

```sql
-- Dez marcos deterministicos. Conjunto FECHADO — os limiares vivem aqui, uma vez so; o
-- TypeScript apenas apresenta (slug -> rotulo), sem duplicar regra.
--
-- "Sessao vencida" = games_won > games_played - games_won (empate nao conta).
-- Sequencia e contada por SESSAO, nao por jogo: o livro-razao e session-granular e nao
-- guarda ordenacao por jogo, entao uma sequencia por jogo nao seria reconstruivel a
-- partir dele.

create or replace function public.regenerate_player_milestones(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.career_events
   where type = 'milestone' and player_id = p_player_id;

  insert into public.career_events (
    player_id, community_id, session_id, type, occurred_at, payload, source_key, contract_version
  )
  with sessions_ordered as (
    select ce.occurred_at,
           (ce.payload->>'games_played')::int as games_played,
           (ce.payload->>'games_won')::int as games_won,
           (ce.payload->>'points')::int as points,
           row_number() over (order by ce.occurred_at) as seq
      from public.career_events ce
     where ce.player_id = p_player_id and ce.type = 'session_played'
  ),
  running as (
    select so.*,
           (so.games_won > so.games_played - so.games_won) as session_won,
           sum(so.games_played) over (order by so.seq) as cum_games,
           sum(so.points) over (order by so.seq) as cum_points
      from sessions_ordered so
  ),
  -- Ilhas de sessoes vencidas consecutivas: seq menos a contagem de vitorias e
  -- constante dentro de uma sequencia.
  streaks as (
    select r.*,
           case when r.session_won then
             row_number() over (
               partition by (r.seq - sum(case when r.session_won then 1 else 0 end)
                              over (order by r.seq))
               order by r.seq
             )
           else 0 end as streak_len
      from running r
  ),
  hits as (
    select 'first_session' as slug, min(occurred_at) as at from running
    union all
    select 'first_win', min(occurred_at) from running where session_won
    union all
    select 'games_10', min(occurred_at) from running where cum_games >= 10
    union all
    select 'games_50', min(occurred_at) from running where cum_games >= 50
    union all
    select 'games_100', min(occurred_at) from running where cum_games >= 100
    union all
    select 'points_100', min(occurred_at) from running where cum_points >= 100
    union all
    select 'points_500', min(occurred_at) from running where cum_points >= 500
    union all
    select 'points_1000', min(occurred_at) from running where cum_points >= 1000
    union all
    select 'streak_3', min(occurred_at) from streaks where streak_len >= 3
    union all
    select 'streak_5', min(occurred_at) from streaks where streak_len >= 5
  )
  select p_player_id,
         null::uuid,
         null::uuid,
         'milestone',
         h.at,
         jsonb_build_object('slug', h.slug),
         'player:' || p_player_id || '|milestone:' || h.slug,
         1
    from hits h
   where h.at is not null;
end;
$$;

revoke execute on function public.regenerate_player_milestones(uuid) from public, anon;
grant execute on function public.regenerate_player_milestones(uuid) to authenticated;
```

- [ ] **Step 2: Encadear os marcos no wrapper do trigger**

Não recrie `regenerate_career_events_for_sessions` — ela tem ~90 linhas e recopiá-la é
convite a divergência. Recrie apenas o wrapper pequeno `regenerate_career_events()`, na
mesma migration, acrescentando o recálculo de marcos **depois** dos resumos (marcos
dependem dos totais acumulados já gravados):

```sql
create or replace function public.regenerate_career_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
  affected_player uuid;
begin
  select array_agg(distinct session_id) into affected
    from (
      select session_id from touched_rows where session_id is not null
    ) s;

  perform public.regenerate_career_events_for_sessions(affected);

  -- Marcos dependem dos totais acumulados, entao rodam depois que os resumos de sessao
  -- ja estao gravados.
  for affected_player in
    select distinct player_id
      from public.career_events
     where session_id = any(affected) and type = 'session_played'
  loop
    perform public.regenerate_player_milestones(affected_player);
  end loop;

  return null;
end;
$$;
```

Os seis triggers da Task 2 continuam apontando para esta função — não precisam ser
recriados.

- [ ] **Step 3: Aplicar e verificar**

`apply_migration` com nome `career_milestones`. Verifique que os dez slugs estão no corpo:

```sql
select count(*) from (
  select regexp_matches(prosrc, '''(first_session|first_win|games_10|games_50|games_100|points_100|points_500|points_1000|streak_3|streak_5)''', 'g')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='regenerate_player_milestones'
) s;
```

Esperado: 10.

- [ ] **Step 4: Refletir no schema.sql e testar**

```typescript
const careerMilestonesMigration = readFixture(
  new URL('../../../supabase/migrations/20260727150000_career_milestones.sql', import.meta.url),
);

const MILESTONE_SLUGS = [
  'first_session', 'first_win',
  'games_10', 'games_50', 'games_100',
  'points_100', 'points_500', 'points_1000',
  'streak_3', 'streak_5',
];

test('milestone generation covers exactly the ten agreed slugs', () => {
  const fn = extractSqlFunction(careerMilestonesMigration, 'regenerate_player_milestones');
  assert.ok(fn, 'missing regenerate_player_milestones');
  for (const slug of MILESTONE_SLUGS) {
    assert.match(fn, new RegExp(`'${slug}'`), `missing milestone ${slug}`);
  }
  // Marcos sao idempotentes por apagar-e-inserir + source_key unica.
  assert.match(fn, /delete from public\.career_events\s+where type = 'milestone'/i);
  assert.match(fn, /\|milestone:' \|\| h\.slug/i);
});

test('a won session requires more wins than losses', () => {
  // Empate nao conta como vitoria — e o que torna streak_3/streak_5 deterministicos.
  const fn = extractSqlFunction(careerMilestonesMigration, 'regenerate_player_milestones');
  assert.ok(fn);
  assert.match(fn, /games_won > so\.games_played - so\.games_won/i);
});
```

- [ ] **Step 5: Rodar e commitar**

```bash
npx tsx --test src/infra/supabase/schema.test.ts
git add supabase/migrations/20260727150000_career_milestones.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): generate the ten career milestones"
```

---

### Task 8: Apresentação dos marcos

**Files:**
- Create: `src/logic/careerMilestones.ts`
- Test: `src/logic/careerMilestones.test.ts`

**Interfaces:**
- Consumes: slugs da Task 7.
- Produces: `MILESTONE_PRESENTATION: Record<MilestoneSlug, { label: string; emoji: string }>`
  e `describeMilestone(slug: string): { label: string; emoji: string }`. Task 9 consome.

**Decisão de escopo — os dez marcos NÃO entram em `ACHIEVEMENT_CATALOG`.** O spec fala em
"conquistas novas do catálogo"; a leitura literal seria acrescentar dez entradas ao
catálogo das 79. Isso exigiria escrever `condition(stats, ctx)` e `progress(stats, ctx)`
em TypeScript replicando limiares que já vivem no SQL — duas implementações da mesma
regra, que é exatamente o problema que este plano existe para evitar (ver `log_table_changes`,
onde uma cópia manual divergiu da origem e ninguém percebeu). Os marcos são uma superfície
própria, alimentada pelo servidor e exibida na linha do tempo da Task 9. As 79 conquistas
seguem intocadas.

- [ ] **Step 1: Escrever o teste**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONE_PRESENTATION, describeMilestone } from './careerMilestones';

const SLUGS_FROM_SQL = [
  'first_session', 'first_win',
  'games_10', 'games_50', 'games_100',
  'points_100', 'points_500', 'points_1000',
  'streak_3', 'streak_5',
];

test('presentation covers every slug the database can emit', () => {
  // Os limiares vivem no SQL; aqui so existe apresentacao. Este teste e o que impede as
  // duas listas de divergirem.
  for (const slug of SLUGS_FROM_SQL) {
    assert.ok(MILESTONE_PRESENTATION[slug as keyof typeof MILESTONE_PRESENTATION], `missing ${slug}`);
  }
  assert.equal(Object.keys(MILESTONE_PRESENTATION).length, SLUGS_FROM_SQL.length);
});

test('describeMilestone degrades gracefully for an unknown slug', () => {
  // Um slug novo no banco nao pode derrubar a tela — a licao do card de atleta.
  const described = describeMilestone('slug_que_nao_existe');
  assert.equal(typeof described.label, 'string');
  assert.ok(described.label.length > 0);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx tsx --test src/logic/careerMilestones.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```typescript
/** Apresentacao dos marcos. Os LIMIARES vivem no SQL (regenerate_player_milestones),
 *  uma vez so — aqui ha apenas rotulo e emoji, para as duas listas nao divergirem. */
export const MILESTONE_PRESENTATION = {
  first_session: { label: 'Primeira sessao', emoji: '🎬' },
  first_win: { label: 'Primeira vitoria', emoji: '🏆' },
  games_10: { label: '10 jogos', emoji: '🔟' },
  games_50: { label: '50 jogos', emoji: '⭐' },
  games_100: { label: '100 jogos', emoji: '💯' },
  points_100: { label: '100 pontos', emoji: '🎯' },
  points_500: { label: '500 pontos', emoji: '🔥' },
  points_1000: { label: '1000 pontos', emoji: '👑' },
  streak_3: { label: '3 sessoes seguidas vencidas', emoji: '📈' },
  streak_5: { label: '5 sessoes seguidas vencidas', emoji: '🚀' },
} as const;

export type MilestoneSlug = keyof typeof MILESTONE_PRESENTATION;

export function describeMilestone(slug: string): { label: string; emoji: string } {
  return MILESTONE_PRESENTATION[slug as MilestoneSlug] ?? { label: slug, emoji: '🏅' };
}
```

- [ ] **Step 4: Rodar e commitar**

```bash
npx tsx --test src/logic/careerMilestones.test.ts
git add src/logic/careerMilestones.ts src/logic/careerMilestones.test.ts
git commit -m "feat(career): add milestone presentation catalog"
```

---

### Task 9: Aba de histórico de carreira (exceção de UI)

**Files:**
- Create: `src/components/player/CareerTimeline.tsx`
- Test: `src/components/player/CareerTimeline.spec.tsx`

**Interfaces:**
- Consumes: `CareerEvent` (Task 4), `describeMilestone` (Task 8).
- Produces: componente `CareerTimeline({ events }: { events: CareerEvent[] })`.

Esta é a **única** task que toca UI visível. A regra do programa congela a UI até o Plano
5; a exceção foi decidida pelo usuário e está registrada no spec e em
`docs/superpowers/plans/2026-07-22-scalable-product-program.md`. Escopo: uma lista
cronológica de marcos, reusando classes já presentes no projeto. Nenhuma navegação nova.

- [ ] **Step 1: Escrever o teste**

Crie `src/components/player/CareerTimeline.spec.tsx` (vitest, como os outros `.spec.tsx`):

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CareerTimeline } from './CareerTimeline';
import type { CareerEvent } from '../../shared/types/career';

function milestone(slug: string, at: string): CareerEvent {
  return {
    id: `e-${slug}`,
    playerId: 'p1',
    communityId: null,
    sessionId: null,
    type: 'milestone',
    occurredAt: at,
    payload: { slug },
    contractVersion: 1,
  };
}

describe('CareerTimeline', () => {
  it('lists milestones newest first', () => {
    render(
      <CareerTimeline
        events={[
          milestone('first_session', '2026-01-01T00:00:00Z'),
          milestone('first_win', '2026-02-01T00:00:00Z'),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/primeira vitoria/i);
    expect(items[1].textContent).toMatch(/primeira sessao/i);
  });

  it('renders an empty state instead of crashing with no career', () => {
    render(<CareerTimeline events={[]} />);
    expect(screen.getByText(/nenhum marco/i)).toBeTruthy();
  });

  it('ignores session rollups, showing only milestones', () => {
    const rollup: CareerEvent = {
      id: 'e-s1', playerId: 'p1', communityId: null, sessionId: 's1',
      type: 'session_played', occurredAt: '2026-03-01T00:00:00Z',
      payload: { points: 10 }, contractVersion: 1,
    };
    render(<CareerTimeline events={[rollup, milestone('first_win', '2026-02-01T00:00:00Z')]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run src/components/player/CareerTimeline.spec.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar**

```typescript
import type { CareerEvent } from '@shared/types/career';
import { describeMilestone } from '../../logic/careerMilestones';

/** Linha do tempo de marcos. Excecao deliberada ao congelamento de UI do programa —
 *  ver docs/superpowers/specs/2026-07-27-career-events-vut-design.md, secao 3B. */
export function CareerTimeline({ events }: { events: CareerEvent[] }) {
  const milestones = events
    .filter((event) => event.type === 'milestone')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  if (milestones.length === 0) {
    return (
      <p className="text-xs text-base-content/60 py-6 text-center">
        Nenhum marco de carreira ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {milestones.map((event) => {
        const { label, emoji } = describeMilestone(event.payload.slug ?? '');
        return (
          <li
            key={event.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-base-200 border border-base-300"
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="text-sm font-semibold flex-1">{label}</span>
            <span className="text-[10px] font-mono text-base-content/50">
              {new Date(event.occurredAt).toLocaleDateString('pt-BR')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npx vitest run src/components/player/CareerTimeline.spec.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificação final**

```bash
npm test
npx tsc --noEmit
npx eslint src/components/player/CareerTimeline.tsx src/logic/career.ts src/logic/careerMilestones.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/player/CareerTimeline.tsx src/components/player/CareerTimeline.spec.tsx
git commit -m "feat(career): add milestone timeline (deliberate UI-freeze exception)"
```

---

## Completion Gate

- [ ] `career_events` existe em produção com `authenticated` tendo **apenas** `select`,
      verificado por `has_table_privilege`, e o teste de grants foi mutation-testado.
- [ ] Os seis triggers são de **statement** com transition table; nenhum `for each row`.
- [ ] Regenerar a mesma sessão duas vezes produz o mesmo conjunto de linhas
      (idempotência verificada, não apenas ausência de erro).
- [ ] Apagar um jogo remove os eventos daquela sessão em vez de deixá-los órfãos.
- [ ] `career_totals` é `is_updatable = 'NO'` e não expõe `community_id`.
- [ ] Toda resolução de id local no SQL é escopada por `owner_id`.
- [ ] Os dez slugs de marco existem no SQL e todos têm apresentação no TypeScript, com
      teste ligando as duas listas.
- [ ] `futCards.test.ts` continua passando sem alteração — as 79 conquistas não mudaram.
- [ ] Suíte verde (`npm test`), typecheck limpo (`npx tsc --noEmit`), lint limpo nos
      arquivos alterados.
- [ ] `get_advisors` sem advertência nova além do conjunto pré-existente conhecido.
