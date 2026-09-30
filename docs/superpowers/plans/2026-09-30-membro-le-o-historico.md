# O membro lê o histórico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O membro ativo lê toda pelada da comunidade que não é rascunho (com times, jogos, pontos e
relatórios); o sync deixa de devolver à nuvem o histórico de outras contas; apagar histórico e
apagar convidado ficam só com o dono da comunidade, no servidor.

**Architecture:** Uma migration cria `current_user_can_read_community_session`, recria as seis
policies de leitura com ela e acrescenta dois gatilhos de "só o dono apaga". No cliente, o download
guarda o dono (`cloudOwnerId`) das linhas do histórico, e o upload só envia linha de outra conta
quando ela mudou naquele aparelho, com o dono original.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), TypeScript, Node test runner, Postgres real.

**Spec:** `docs/superpowers/specs/2026-09-30-membro-le-o-historico-design.md`

## Global Constraints

- "Não é rascunho": legada `authority_model = 'legacy' and status <> 'draft'`; alvo
  `authority_model = 'target' and lifecycle_status <> 'DRAFT'`; e `deleted_at is null`.
- Membro = linha ativa (`status = 'active'`) em `public.community_members` da comunidade, qualquer
  cargo. Quem já lia (quem criou; `owner`/`admin`/`moderator`) continua lendo tudo, rascunho
  incluído.
- Mensagens dos gatilhos: `Only the Community owner can delete history` e
  `Only the Community owner can delete a guest`, ambas `errcode = '42501'`. Sem usuário
  (`auth.uid()` nulo) os gatilhos deixam passar.
- O sync muda só o necessário (o próximo projeto o remove): linha de outra conta sobe só com
  `syncStatus === 'pending'`, com `owner_id` = dono original; recusa vira um aviso e a linha sai
  sincronizada.
- Sem comentários novos em TS; SQL com comentário curto do porquê. Commits em português sem acento
  com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nada em produção sem ok do usuário.

---

### Task 1: Leitura e "só o dono apaga", no servidor

**Files:**
- Create: `supabase/migrations/20260930120000_membro_le_o_historico.sql`
- Create: `src/test/db/membroLeOHistorico.dbtest.ts`

**Interfaces:**
- Produces: `public.current_user_can_read_community_session(uuid) returns boolean`; policies
  "Community members can read sessions|teams|games|point events|game reports|session reports";
  gatilhos `zz_guard_history_delete_owner_only` (sessions) e `zz_guard_guest_delete_owner_only`
  (players).

- [ ] **Step 1: Conferir as últimas definições**

```bash
grep -rn 'policy "Community members can read \(sessions\|teams\|games\|point events\|game reports\|session reports\)"' supabase/migrations/*.sql
grep -rn "create trigger" supabase/migrations/*.sql | grep -i "on public.sessions\|on public.players" | cut -c1-160
```

Esperado: as leituras vêm de `20260610161203_backend_operational_sync.sql` (e `schema.sql`, aplicado
antes), todas `owner_id = auth.uid() or (community_id is not null and current_user_has_community_role(community_id))`.
Nomes dos gatilhos novos com `zz_` para rodarem depois dos existentes em ordem alfabética.

- [ ] **Step 2: dbtest que falha** — `src/test/db/membroLeOHistorico.dbtest.ts`, no padrão de
  `src/test/db/quemOrganiza.dbtest.ts` (helpers `como`, `conta`, `cena` com
  `create_community_with_owner`). Membros entram em `public.community_members`
  (`community_id, user_id, role, status`) — **é essa tabela que as policies consultam**; confira se
  `create_community_with_owner` já põe o dono lá e, se o espelho exigir, também em
  `community_memberships`. Casos:

  1. membro lê a pelada encerrada (legada, `status = 'finished'`) e um time, um jogo e um ponto dela;
  2. membro não lê a pelada rascunho (`status = 'draft'`) nem o time dela;
  3. quem é de fora não lê a encerrada;
  4. admin e moderador leem o rascunho;
  5. membro suspenso (`status = 'suspended'` em `community_members`) não lê a encerrada;
  6. o dono marca `deleted_at` na encerrada; admin e um membro com cargo `organizador` recebem
     `42501` (`Only the Community owner can delete history`); quem criou marca `deleted_at` no
     próprio rascunho;
  7. o dono marca `deleted_at` num convidado da comunidade; o admin recebe `42501`
     (`Only the Community owner can delete a guest`) e consegue `active = false`.

  Linhas de histórico inseridas direto como superusuário (`client.query`), com `owner_id` do dono e
  `community_id`/`session_id` preenchidos. Leituras com `como(ator, 'select id from public.<t> where id = $1', [id])`
  e `rows.length`. Para `teams`/`games`/`point_events`, veja as colunas obrigatórias em
  `supabase/migrations/schema.sql` (`create table public.teams|games|point_events`) e em
  `authCascadeSafety.dbtest.ts`, que já insere essas linhas.

- [ ] **Step 3: Rodar e ver falhar**

```bash
export VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55500/volley_test"
node --import tsx --test src/test/db/membroLeOHistorico.dbtest.ts
```

Esperado: falham 1, 6 (admin/organizador conseguem apagar) e 7 (admin consegue apagar).

- [ ] **Step 4: Migration**

```sql
-- O membro le o historico (spec 2026-09-30-membro-le-o-historico-design.md).
-- 1. Membro ativo le toda pelada da comunidade que nao e rascunho, com times, jogos, pontos e
--    relatorios. PRIVATE/PUBLISHED e ignorado: nada no app publica sessao.
-- 2. Apagar historico (pelada nao rascunho) e apagar convidado sao so do dono da comunidade.

create or replace function public.current_user_can_read_community_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
     where s.id = p_session_id
       and (
         s.owner_id = (select auth.uid())
         or (
           s.community_id is not null
           and public.current_user_has_community_role(s.community_id)
         )
         or (
           s.community_id is not null
           and s.deleted_at is null
           and (
             (s.authority_model = 'legacy' and s.status is distinct from 'draft')
             or (s.authority_model = 'target' and s.lifecycle_status is distinct from 'DRAFT')
           )
           and exists (
             select 1
               from public.community_members cm
              where cm.community_id = s.community_id
                and cm.user_id = (select auth.uid())
                and cm.status = 'active'
           )
         )
       )
  );
$$;

revoke all on function public.current_user_can_read_community_session(uuid) from public, anon;
grant execute on function public.current_user_can_read_community_session(uuid) to authenticated;

drop policy if exists "Community members can read sessions" on public.sessions;
create policy "Community members can read sessions" on public.sessions
  for select to authenticated
  using (public.current_user_can_read_community_session(id));

drop policy if exists "Community members can read teams" on public.teams;
create policy "Community members can read teams" on public.teams
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read games" on public.games;
create policy "Community members can read games" on public.games
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read point events" on public.point_events;
create policy "Community members can read point events" on public.point_events
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read game reports" on public.game_reports;
create policy "Community members can read game reports" on public.game_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

drop policy if exists "Community members can read session reports" on public.session_reports;
create policy "Community members can read session reports" on public.session_reports
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.current_user_can_read_community_session(session_id));

create or replace function app_private.guard_history_delete_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and new.community_id is not null
     and not (
       (new.authority_model = 'legacy' and new.status = 'draft')
       or (new.authority_model = 'target' and new.lifecycle_status = 'DRAFT')
     )
     and not public.current_user_has_community_role(new.community_id, array['owner']) then
    raise exception 'Only the Community owner can delete history' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_history_delete_owner_only() from public, anon, authenticated;

drop trigger if exists zz_guard_history_delete_owner_only on public.sessions;
create trigger zz_guard_history_delete_owner_only
  before update on public.sessions
  for each row execute function app_private.guard_history_delete_owner_only();

create or replace function app_private.guard_guest_delete_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and not public.player_has_account(new.id)
     and not exists (
       select 1
         from public.community_players cp
        where cp.player_id = new.id
          and cp.deleted_at is null
          and public.current_user_has_community_role(cp.community_id, array['owner'])
     ) then
    raise exception 'Only the Community owner can delete a guest' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_guest_delete_owner_only() from public, anon, authenticated;

drop trigger if exists zz_guard_guest_delete_owner_only on public.players;
create trigger zz_guard_guest_delete_owner_only
  before update on public.players
  for each row execute function app_private.guard_guest_delete_owner_only();
```

  Atenção: o convidado **sem comunidade** (há 2 em produção) só pode ser apagado por superadmin ou
  por função interna — é o efeito da regra; registre no relatório.

- [ ] **Step 5: Rodar e ver passar** — o comando do Step 3, 7/7.

- [ ] **Step 6: Bateria inteira** (em segundo plano, esperando; uma de cada vez). Suítes antigas
  que dependiam de organizador/admin apagarem pelada não rascunho ou de admin apagar convidado:
  ajuste só a assertiva que contradiz a decisão 3 da spec (use o dono como ator) e diga qual.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260930120000_membro_le_o_historico.sql src/test/db/membroLeOHistorico.dbtest.ts
git commit -m "feat(db): membro le o historico da comunidade e so o dono apaga historico e convidado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O sync não devolve o histórico dos outros

**Files:**
- Modify: `src/shared/types/session.ts` (tipos `Session`, `Team`, `Game`, `PointEvent`, `GameReport`,
  `SessionReport`)
- Modify: `src/infra/supabase/operationalCloudService.ts` (`mapDbToSession` ~109, `mapDbToTeam`
  ~158, `mapDbToGame` ~211, `mapDbToPointEvent` ~270, `mapDbToGameReport` ~313,
  `mapDbToSessionReport` ~348)
- Modify: `src/infra/supabase/syncService.ts` (laço de sessões ~1357-1430;
  `bulkUploadSessionChildren` ~968 e as cinco chamadas ~1482-1540)
- Test: `src/infra/supabase/syncService.test.ts`, `src/infra/supabase/operationalCloudService.test.ts`
  (se existir)

**Interfaces:**
- Produces: `cloudOwnerId?: string` nos seis tipos; `bulkUploadSessionChildren` passa a receber
  `ownerId: string` e `bulkUpsertFn: (items: T[], owner: string) => Promise<T[]>`.

- [ ] **Step 1: Testes que falham**
  - Mapeadores: `mapDbToSession({ id: 's', owner_id: 'u9', ... })` devolve `cloudOwnerId: 'u9'`
    (o mesmo para os outros cinco).
  - `syncService.test.ts` (siga os testes existentes de `syncNow`/`uploadLocalDataToCloud` que
    mockam `operationalCloudService`):
    - pelada com `cloudOwnerId: 'outro'`, `syncStatus: 'synced'`, sincronizada por `'eu'`:
      `upsertSession` **não** é chamado e ela sai `synced`; o mesmo para um time dela
      (`bulkUpsertTeams` não recebe o time);
    - a mesma pelada com `syncStatus: 'pending'`: `upsertSession` é chamado com `ownerId = 'outro'`;
    - recusa (`{ code: '42501' }`) no upsert da pelada alheia pendente: um aviso (`onIssue`) e a
      pelada sai `synced`;
    - pelada própria (`cloudOwnerId` igual a quem sincroniza ou ausente): comportamento de hoje.

- [ ] **Step 2: Rodar e ver falhar** — `node --import tsx --test src/infra/supabase/syncService.test.ts src/infra/supabase/operationalCloudService.test.ts`.

- [ ] **Step 3: Implementar**
  - Tipos: `cloudOwnerId?: string;` nos seis.
  - Mapeadores `mapDbTo*`: `cloudOwnerId: db.owner_id ? String(db.owner_id) : undefined,`.
  - Laço de sessões: logo depois do tratamento de `deletedAt` e antes de `isTargetCohortSession`:

```ts
        const alheia = !!session.cloudOwnerId && session.cloudOwnerId !== ownerId;
        if (alheia && session.syncStatus !== 'pending') {
          updatedSessions.push(markSynced(session, session.cloudId, syncedAt));
          continue;
        }
```

    e no upsert legado use `operationalCloudService.upsertSession(sessionForUpload, alheia ? session.cloudOwnerId! : ownerId)`;
    no `catch`, se `alheia && isPermissionRefusal(error)`, `onIssue` uma vez e
    `updatedSessions.push(markSynced(session, session.cloudId, syncedAt))` em vez de manter
    pendente (`isPermissionRefusal` já existe no arquivo).
  - `bulkUploadSessionChildren`: novo parâmetro `ownerId`; um item com `cloudOwnerId` de outra
    conta e `syncStatus !== 'pending'` vai direto para `updated` como `markSynced` (não sobe); os
    que sobem são agrupados por dono (`item.cloudOwnerId && item.cloudOwnerId !== ownerId ? item.cloudOwnerId : ownerId`)
    e `bulkUpsertFn(grupo, dono)` é chamado por grupo. Recusa de um grupo alheio: um `onIssue` e
    os itens do grupo saem `markSynced`. As cinco chamadas passam `ownerId` e trocam o `ownerId`
    capturado pelo parâmetro `owner` da função.
  - Nada mais no sync muda.

- [ ] **Step 4: Rodar e ver passar** — os testes, `npm run lint`, `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/session.ts src/infra/supabase/operationalCloudService.ts src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git commit -m "fix: sync nao devolve a nuvem o historico de outra conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Acrescente `operationalCloudService.test.ts` se tocou.)

---

### Task 3: Documentos, verificação e publicação

- [ ] **Step 1: Documentos**
  - `docs/PERMISSOES.md`: P17 e P18 resolvidas (✅ riscadas); a nota "Pendente antes do plano da
    parte 4" é substituída por "Respondido em 2026-09-30: o membro vê toda pelada da comunidade,
    menos rascunho"; seção E registra "Parte 4b — o membro lê o histórico: ✅ feita em <data>" e,
    a seguir, "Próximo projeto: remover o sync e trabalhar em tempo real; membros acompanham a
    pelada ao vivo".
  - `docs/JORNADA.md`: na Etapa 10, "O membro vê o histórico da comunidade?" (sim, menos
    rascunho; `membroLeOHistorico.dbtest.ts`) e "Quem apaga histórico e convidado?" (o dono); na
    Etapa 9, "O membro acompanha a pelada ao vivo?" (❓ próximo projeto).
- [ ] **Step 2: Verificação** — `npm run lint`, `npx eslint` nos tocados (só erros),
  `npx prettier --check` nos tocados, `npm test`, `npm run build`, `npm run test:db`.
- [ ] **Step 3: Commit** — `docs: o membro le o historico, na jornada e nas permissoes`.
- [ ] **Step 4: Publicação (só com ok do usuário) — o app antes da migration**
  1. Merge fast-forward, testes no resultado, push e deploy `READY` **primeiro**: o ajuste do sync
     (Task 2) funciona com a regra antiga, e assim nenhum aparelho com o app novo tenta devolver o
     histórico dos outros quando a leitura for liberada. (Com a ordem inversa, o app antigo no
     aparelho do membro baixaria o histórico e tentaria regravá-lo a cada sync.)
  2. Produção: última migration `quem_organiza`; as seis policies de leitura com o texto antigo;
     nenhum dos gatilhos novos.
  3. `apply_migration`; conferir as policies em `pg_policies`, os gatilhos em `pg_trigger`, as
     funções (`prosecdef`, `proconfig`, grants) e os advisors.
