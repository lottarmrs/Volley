# Pagamento na inscrição — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vaga na pelada passa a se confirmar pelo pagamento, com reserva ordenada por quem pagou primeiro e um prazo opcional que rebaixa quem não pagou.

**Architecture:** Pagamento é um segundo eixo sobre a inscrição que já existe: colunas novas em `registration_windows` e `registration_entries`, uma função única que define a ordem da reserva, um corte de prazo que roda dentro de três comandos, e quatro comandos novos. A tela e o hook ganham as ações; nada do sorteio muda além de `lock_registration` passar a exigir pagamento em dia.

**Tech Stack:** PostgreSQL 15 + Supabase (RPC `security definer` com `set search_path = ''`), React 19 + TypeScript, Vitest + Testing Library, Node test runner, testes de banco contra PostgreSQL real.

**Spec:** `docs/superpowers/specs/2026-09-23-registration-payment-design.md`

## Global Constraints

- **UI em pt-BR**, incluindo mensagens de erro e rótulos. Identificadores SQL e TypeScript em inglês.
- **Nenhum valor monetário**: sem preço, sem total arrecadado, sem estorno, sem cancelamento.
- **Só quem organiza marca pagamento.** Autorização por `public.assert_target_session_write_authorized(v_session)`.
- **`queue_sequence` nunca é reescrito.** É o fato auditável de quem chegou quando.
- **A ordem da reserva vive em uma função só**, `app_private.registration_reserve_order`. Promoção e leitura do quadro consomem a mesma.
- **Toda função nova é `security definer` com `set search_path = ''`**, com `revoke all ... from public, anon` e `grant execute ... to authenticated` só nas funções de `public`. As de `app_private` não recebem grant nenhum.
- **Toda função chamada dentro de uma com `search_path = ''` precisa de nome qualificado**: `pg_catalog.now()`, `pg_catalog.count(*)`, `public.registration_entries`.
- **Comandos são idempotentes por `p_command_id`** via `app_private.find_command_receipt` / `app_private.record_command_receipt`, no mesmo formato dos comandos que já existem.
- **`revision` sobe uma vez por mutação lógica** (`REG-INV-013`). Os auxiliares `app_private.promote_waitlist_to_capacity` e `app_private.apply_payment_deadline` **não** tocam `revision`; quem bumpa é o comando.
- **Prettier**: aspas simples, 100 colunas. Rode `npx prettier --write` nos arquivos TypeScript antes de cada commit.
- **Sem comentários em código-fonte TypeScript** a menos que expliquem uma decisão não óbvia.

---

## Estrutura de arquivos

**Criar:**

- `supabase/migrations/20260923120000_registration_payment.sql` — tudo do servidor: colunas, ordem da reserva, promoção com portão de pagamento, corte do prazo, quatro comandos, `lock` com guarda, leitura do quadro.
- `src/test/db/registrationPayment.dbtest.ts` — as regras do servidor contra PostgreSQL real.

**Modificar:**

- `src/shared/types/registrationBoard.ts` — campos de pagamento no quadro e na entrada.
- `src/infra/supabase/registrationBoardCloudService.ts` (+ `.test.ts`) — ler os campos novos e chamar os quatro comandos.
- `src/application/registrationBoardGateway.ts` — as quatro operações novas.
- `src/application/registrationUseCases.ts` (+ `.test.ts`) — casos de uso e as mensagens de erro novas.
- `src/hooks/useRegistrationBoard.ts` (+ `.spec.tsx`) — as quatro ações.
- `src/components/session/RegistrationBoardView.tsx` (+ `.spec.tsx`) — situação de pagamento, marcação, prazo, corte pendente, subir ao topo.
- `preview/inscricao.tsx` — os estados novos na bancada.
- `HANDOFF.md`, `docs/architecture/catalogs/OPEN-DECISIONS.md`, `docs/architecture/execution/C6-REACHABILITY-MAP.md`, `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` — documentação.

**Ordem das tarefas:** 1 a 5 são o servidor, cada uma acrescentando ao mesmo arquivo de migration e fechando com testes verdes. 6 a 9 sobem pela pilha do cliente. 10 fecha documentação e gates.

---

## Como rodar os testes deste plano

- **Banco:** precisa de um PostgreSQL de verdade. Se o container do projeto não estiver de pé:

```bash
docker start volley_test_pg2 || docker run -d --name volley_test_pg2 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=volley_test -p 55500:5432 postgres:15
```

O harness recebe **só o nome do arquivo**, não o caminho: ele já procura dentro de `src/test/db`.
Exporte a URL uma vez na sessão e rode um arquivo assim:

```bash
export DB=postgresql://postgres:postgres@127.0.0.1:55500/volley_test
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts
```

- **Unitário (Node):** `node --import tsx --test src/application/registrationUseCases.test.ts`
- **UI (Vitest):** `npx vitest run src/hooks/useRegistrationBoard.spec.tsx`

---

### Task 1: Colunas, ordem da reserva e promoção que respeita o pagamento

**Files:**

- Create: `supabase/migrations/20260923120000_registration_payment.sql`
- Create: `src/test/db/registrationPayment.dbtest.ts`

**Interfaces:**

- Consumes: `public.registration_windows`, `public.registration_entries`, `app_private.promote_waitlist_to_capacity`, `app_private.registration_entry_still_eligible` — todos de `20260831035934_registration_schema.sql` e `20260902115932_leave_promotion_capacity.sql`.
- Produces:
  - colunas `registration_windows.payment_due_at`, `registration_windows.payment_deadline_applied_at`;
  - colunas `registration_entries.paid_at`, `paid_marked_by_user_id`, `payment_lapsed_at`, `reserve_rank`;
  - `app_private.registration_reserve_order(p_window_id uuid) returns table (entry_id uuid, player_id uuid, posicao bigint, tier integer)`;
  - `app_private.promote_waitlist_to_capacity(p_window_id uuid) returns jsonb` substituída, com portão de pagamento.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/db/registrationPayment.dbtest.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260923120000_registration_payment.sql';

if (!isTestDatabaseConfigured()) {
  test(`registration payment requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function newUser(label: string): Promise<string> {
    const email = `${label}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function newAthlete(
    ownerId: string,
    communityId: string,
    userId: string,
    name: string,
  ): Promise<string> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
    const { rows } = await asIdentityCommitting(client, userId, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    const playerId = rows[0].player_id;
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       select $1, $2, 'ACTIVE', 'SELF_CLAIM', now()
        where not exists (
          select 1 from public.player_account_links where user_id = $2 and status = 'ACTIVE'
        )`,
      [playerId, userId],
    );
    await client.query('update public.players set name = $2 where id = $1', [playerId, name]);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id) do nothing`,
      [communityId, playerId, ownerId],
    );
    return playerId;
  }

  async function fixture(capacity: number) {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Pagamento ${randomUUID()}`,
      ]),
    );
    const communityId = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, ownerId],
    );
    const sessionId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Pelada de quinta'],
      ),
    );
    const windowId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        windowId,
        sessionId,
        capacity,
      ]),
    );
    const revision = (
      await asIdentityCommitting(client, ownerId, () =>
        client.query<{ window_revision: number }>(
          'select * from public.open_registration($1,$2,$3)',
          [randomUUID(), windowId, 1],
        ),
      )
    ).rows[0].window_revision;
    return { ownerId, communityId, sessionId, windowId, revision };
  }

  async function inscrever(
    f: { ownerId: string; communityId: string; windowId: string },
    label: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(label);
    const playerId = await newAthlete(f.ownerId, f.communityId, userId, `Atleta ${label}`);
    await asIdentityCommitting(client, userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        f.windowId,
      ]),
    );
    return { userId, playerId };
  }

  async function marcarPagoDireto(windowId: string, playerId: string): Promise<void> {
    await client.query(
      `update public.registration_entries
          set paid_at = now(), payment_lapsed_at = null
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
  }

  async function reserva(windowId: string): Promise<string[]> {
    const { rows } = await client.query<{ player_id: string }>(
      `select player_id from app_private.registration_reserve_order($1) order by posicao`,
      [windowId],
    );
    return rows.map((row) => row.player_id);
  }

  async function statusDe(windowId: string, playerId: string): Promise<string> {
    const { rows } = await client.query<{ status: string }>(
      `select status from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
    return rows[0].status;
  }

  test('quem pagou vem antes na reserva, e o organizador pode fixar alguém no topo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');
    const d = await inscrever(f, 'd');

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
    assert.deepEqual(await reserva(f.windowId), [b.playerId, c.playerId, d.playerId]);

    await marcarPagoDireto(f.windowId, d.playerId);
    await marcarPagoDireto(f.windowId, c.playerId);
    assert.deepEqual(
      await reserva(f.windowId),
      [d.playerId, c.playerId, b.playerId],
      'pagos primeiro, na ordem em que pagaram',
    );

    await client.query(
      `update public.registration_entries set reserve_rank = 0
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(
      await reserva(f.windowId),
      [b.playerId, d.playerId, c.playerId],
      'quem o organizador fixa vem antes de todo mundo',
    );
  });

  test('quem perdeu o prazo fica no fim da reserva', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_entries set payment_lapsed_at = now()
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(await reserva(f.windowId), [c.playerId, b.playerId]);
  });

  test('passado o prazo, a promoção só sobe quem pagou', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 hour'
        where id = $1`,
      [f.windowId],
    );
    await marcarPagoDireto(f.windowId, c.playerId);

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, c.playerId), 'CONFIRMED', 'o pago sobe');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED', 'o não pago não sobe');
  });

  test('antes do prazo, a promoção segue a ordem da reserva sem exigir pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED');
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|error" | head -5
```

Esperado: falha, porque a migration não existe e `app_private.registration_reserve_order` não existe.

- [ ] **Step 3: Criar a migration com as colunas e a ordem da reserva**

Criar `supabase/migrations/20260923120000_registration_payment.sql`:

```sql
-- C6 — Pagamento na inscrição
--
-- Pagamento é um segundo eixo sobre a inscrição que a W4 já governa: `status` responde "está
-- dentro?", `queue_sequence` responde "chegou quando?", `paid_at` responde "quitou?". Nenhum
-- estado novo entra em registration_entries_status_check, então toda consulta que compara
-- status = 'CONFIRMED' continua correta -- incluindo finalize_session_roster e a cadeia do
-- sorteio da XS-W6-08c.
--
-- Reabre OPEN-REG-004 (FIFO estrito) e OPEN-REG-005 (pagamento fora do V1) por decisão de produto
-- de 2026-09-23. Estorno e cancelamento continuam fora.

alter table public.registration_windows
  add column payment_due_at timestamptz,
  add column payment_deadline_applied_at timestamptz;

comment on column public.registration_windows.payment_due_at is
  'Prazo para pagar. Nulo significa que nada é cortado.';
comment on column public.registration_windows.payment_deadline_applied_at is
  'Quando o corte rodou. Torna o corte idempotente para um dado payment_due_at.';

alter table public.registration_entries
  add column paid_at timestamptz,
  add column payment_lapsed_at timestamptz,
  add column reserve_rank bigint;

comment on column public.registration_entries.payment_lapsed_at is
  'Perdeu o prazo. Separa "ainda não pagou" de "perdeu a vaga por não ter pago".';
comment on column public.registration_entries.reserve_rank is
  'Ajuste manual do organizador. Nulo deixa a ordem derivada decidir.';

create index registration_entries_reserve_order_idx
  on public.registration_entries (registration_window_id, status, reserve_rank, paid_at, queue_sequence);

-- A ordem da reserva vive aqui e em nenhum outro lugar: a promoção e a leitura do quadro consomem
-- esta função. Duas implementações da mesma regra divergiriam no primeiro ajuste.
--
-- Quatro faixas: fixado pelo organizador, pago, ainda não pago, perdeu o prazo. Dentro de cada
-- uma, o desempate é o que aquela faixa significa -- rank, hora do pagamento, ordem de chegada.
create function app_private.registration_reserve_order(p_window_id uuid)
returns table (entry_id uuid, player_id uuid, posicao bigint, tier integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         o.player_id,
         pg_catalog.row_number() over (
           order by o.tier, o.reserve_rank nulls last, o.paid_at nulls last, o.queue_sequence
         ),
         o.tier
    from (
      select e.id,
             e.player_id,
             e.reserve_rank,
             e.paid_at,
             e.queue_sequence,
             case
               when e.reserve_rank is not null then 1
               when e.paid_at is not null then 2
               when e.payment_lapsed_at is null then 3
               else 4
             end as tier
        from public.registration_entries e
       where e.registration_window_id = p_window_id
         and e.status = 'WAITLISTED'
    ) o;
$$;

revoke all on function app_private.registration_reserve_order(uuid)
  from public, anon, authenticated;
```

- [ ] **Step 4: Substituir a promoção**

Acrescentar ao fim do mesmo arquivo:

```sql
-- Substitui a de 20260902115932_leave_promotion_capacity.sql. Duas mudanças: o candidato sai da
-- ordem da reserva em vez de queue_sequence direto, e passado o prazo só sobe quem pagou.
--
-- O portão é um filtro, não um "pular e remover": quem não pagou continua na fila, esperando o
-- organizador marcar. Remover seria confundir "não pagou ainda" com "não pode mais jogar".
--
-- Continua sem tocar `revision`: promover é parte da mutação de quem a chamou (REG-INV-013).
create or replace function app_private.promote_waitlist_to_capacity(p_window_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_confirmed bigint;
  v_candidate public.registration_entries;
  v_promoted integer := 0;
  v_skipped integer := 0;
  v_payment_gate boolean;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  v_payment_gate := v_window.payment_due_at is not null
                    and pg_catalog.now() >= v_window.payment_due_at;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  loop
    exit when v_confirmed >= v_window.capacity;

    select e.* into v_candidate
      from app_private.registration_reserve_order(p_window_id) o
      join public.registration_entries e on e.id = o.entry_id
     where not v_payment_gate or e.paid_at is not null
     order by o.posicao
     limit 1;
    exit when not found;

    if app_private.registration_entry_still_eligible(v_candidate.id) then
      update public.registration_entries
         set status = 'CONFIRMED',
             status_changed_at = pg_catalog.now()
       where id = v_candidate.id;
      v_confirmed := v_confirmed + 1;
      v_promoted := v_promoted + 1;
    else
      -- OPEN-REG-002: pular, mas nunca em silêncio. A entrada guarda o queue_sequence para o
      -- histórico continuar legível, e deixa de ser candidata em vez de ser reavaliada a cada
      -- promoção. RestoreRegistrationEntry é o caminho auditado de volta.
      update public.registration_entries
         set status = 'REMOVED',
             status_changed_at = pg_catalog.now(),
             removed_at = pg_catalog.now(),
             removal_reason = 'INELIGIBLE_AT_PROMOTION'
       where id = v_candidate.id;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end;
$$;

revoke all on function app_private.promote_waitlist_to_capacity(uuid)
  from public, anon, authenticated;
```

- [ ] **Step 5: Rodar até passar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -8
```

Esperado: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-pagamento && git add -- supabase/migrations/20260923120000_registration_payment.sql src/test/db/registrationPayment.dbtest.ts && git commit -q -F - <<'EOF'
feat: ordem da reserva por pagamento

Colunas de pagamento na janela e na inscricao, a ordem da reserva em uma funcao
so -- fixado, pago, nao pago, perdeu o prazo -- e a promocao consumindo essa
ordem. Passado o prazo, so sobe quem pagou.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: O corte do prazo

**Files:**

- Modify: `supabase/migrations/20260923120000_registration_payment.sql` (acrescentar ao fim)
- Modify: `src/test/db/registrationPayment.dbtest.ts` (acrescentar testes)

**Interfaces:**

- Consumes: `app_private.registration_reserve_order`, `app_private.promote_waitlist_to_capacity` (Task 1).
- Produces: `app_private.apply_payment_deadline(p_window_id uuid) returns boolean` — devolve `true` quando cortou, `false` quando não havia o que cortar. **Não toca `revision`**; quem chama bumpa.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar dentro do `else` de `src/test/db/registrationPayment.dbtest.ts`, depois do último `test(...)`:

```ts
  async function venceuOPrazo(windowId: string): Promise<void> {
    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 hour'
        where id = $1`,
      [windowId],
    );
  }

  async function cortar(windowId: string): Promise<boolean> {
    const { rows } = await client.query<{ cortou: boolean }>(
      'select app_private.apply_payment_deadline($1) as cortou',
      [windowId],
    );
    return rows[0].cortou;
  }

  test('o corte rebaixa quem não pagou e sobe quem pagou', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await marcarPagoDireto(f.windowId, a.playerId);
    await marcarPagoDireto(f.windowId, c.playerId);
    await venceuOPrazo(f.windowId);

    assert.equal(await cortar(f.windowId), true);
    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED', 'pago segue dentro');
    assert.equal(await statusDe(f.windowId, c.playerId), 'CONFIRMED', 'pago da reserva sobe');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED', 'não pago cai');

    const { rows } = await client.query<{ payment_lapsed_at: string | null }>(
      `select payment_lapsed_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.notEqual(rows[0].payment_lapsed_at, null);
  });

  test('o corte não roda duas vezes para o mesmo prazo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);

    assert.equal(await cortar(f.windowId), true);
    assert.equal(await cortar(f.windowId), false, 'segunda chamada não faz nada');
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
  });

  test('marcar como pago depois do corte devolve a vaga que ficou vazia', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);
    await cortar(f.windowId);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');

    await marcarPagoDireto(f.windowId, a.playerId);
    await client.query('select app_private.promote_waitlist_to_capacity($1)', [f.windowId]);

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
  });

  test('sem prazo, no futuro, ou com a janela fechada, nada é cortado', async () => {
    const semPrazo = await fixture(1);
    await inscrever(semPrazo, 'a');
    assert.equal(await cortar(semPrazo.windowId), false, 'sem prazo');

    const futuro = await fixture(1);
    await inscrever(futuro, 'b');
    await client.query(
      `update public.registration_windows set payment_due_at = now() + interval '1 day'
        where id = $1`,
      [futuro.windowId],
    );
    assert.equal(await cortar(futuro.windowId), false, 'prazo no futuro');

    const fechada = await fixture(1);
    const c = await inscrever(fechada, 'c');
    await venceuOPrazo(fechada.windowId);
    await client.query(`update public.registration_windows set status = 'CLOSED' where id = $1`, [
      fechada.windowId,
    ]);
    assert.equal(await cortar(fechada.windowId), false, 'janela fechada');
    assert.equal(await statusDe(fechada.windowId, c.playerId), 'CONFIRMED');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|apply_payment_deadline" | head -5
```

Esperado: erro de função inexistente, `ℹ fail 4`.

- [ ] **Step 3: Implementar o corte**

Acrescentar ao fim de `supabase/migrations/20260923120000_registration_payment.sql`:

```sql
-- O corte do prazo.
--
-- Só age com a janela OPEN: depois de fechada ou travada, quem cura a lista é o organizador, e o
-- prazo já fez o que tinha para fazer.
--
-- Não toca `revision` -- quem chama bumpa uma vez, porque corte e ação são uma mutação lógica só
-- (REG-INV-013). Devolve se cortou, para o comando saber se precisa bumpar.
--
-- A idempotência compara com o prazo corrente, não com um booleano: mover o prazo para frente
-- autoriza um corte novo sem precisar limpar nada.
create function app_private.apply_payment_deadline(p_window_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_sem_ordem bigint;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  if v_window.status <> 'OPEN'
     or v_window.payment_due_at is null
     or pg_catalog.now() < v_window.payment_due_at
     or (v_window.payment_deadline_applied_at is not null
         and v_window.payment_deadline_applied_at >= v_window.payment_due_at) then
    return false;
  end if;

  -- registration_entries_waitlisted_has_sequence_check: quem entrou direto na vaga tem
  -- queue_sequence nulo, e a reserva exige um. Cada rebaixado ganha o proximo da janela, na
  -- ordem em que chegou -- e quem ja tinha o seu guarda o que tinha, porque queue_sequence e o
  -- fato de quando a pessoa chegou e nao se reescreve.
  select pg_catalog.count(*) into v_sem_ordem
    from public.registration_entries e
   where e.registration_window_id = p_window_id
     and e.status = 'CONFIRMED'
     and e.paid_at is null
     and e.queue_sequence is null;

  with alvos as (
    select e.id,
           pg_catalog.row_number() over (order by e.joined_at, e.id) as ordem
      from public.registration_entries e
     where e.registration_window_id = p_window_id
       and e.status = 'CONFIRMED'
       and e.paid_at is null
       and e.queue_sequence is null
  )
  update public.registration_entries e
     set queue_sequence = v_window.next_queue_sequence + a.ordem - 1
    from alvos a
   where e.id = a.id;

  update public.registration_entries
     set status = 'WAITLISTED',
         status_changed_at = pg_catalog.now(),
         payment_lapsed_at = pg_catalog.now()
   where registration_window_id = p_window_id
     and status = 'CONFIRMED'
     and paid_at is null;

  update public.registration_windows
     set payment_deadline_applied_at = pg_catalog.now(),
         next_queue_sequence = next_queue_sequence + v_sem_ordem,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  -- Depois do rebaixamento: a promoção lê capacidade e confirmados do estado já cortado, e o
  -- portão de pagamento dela garante que só quem pagou ocupe as vagas que acabaram de abrir.
  perform app_private.promote_waitlist_to_capacity(p_window_id);
  return true;
end;
$$;

revoke all on function app_private.apply_payment_deadline(uuid)
  from public, anon, authenticated;
```

- [ ] **Step 4: Rodar até passar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -8
```

Esperado: `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

Escreva a mensagem num arquivo para o shell não engasgar com o texto:

```bash
cd /c/Volley-pagamento && printf '%s\n' 'feat: o corte do prazo de pagamento' '' 'Rebaixa quem nao pagou, promove quem pagou, e so age com a janela aberta. Nao' 'toca revision: corte e acao sao uma mutacao logica so. A idempotencia compara' 'com o prazo corrente, entao mover o prazo autoriza um corte novo.' '' 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>' > /tmp/msg.txt && git add -- supabase/migrations/20260923120000_registration_payment.sql src/test/db/registrationPayment.dbtest.ts && git commit -q -F /tmp/msg.txt
```

---

### Task 3: Os quatro comandos

**Files:**

- Modify: `supabase/migrations/20260923120000_registration_payment.sql` (acrescentar ao fim)
- Modify: `src/test/db/registrationPayment.dbtest.ts` (acrescentar testes)

**Interfaces:**

- Consumes: `app_private.apply_payment_deadline` (Task 2), `public.assert_target_session_write_authorized`, `app_private.find_command_receipt`, `app_private.record_command_receipt`.
- Produces, todos `returns table (window_revision integer)`:
  - `public.mark_registration_payment(p_command_id uuid, p_window_id uuid, p_player_id uuid, p_paid boolean)`
  - `public.set_registration_payment_due(p_command_id uuid, p_window_id uuid, p_due_at timestamptz)`
  - `public.boost_registration_reserve_entry(p_command_id uuid, p_window_id uuid, p_player_id uuid)`
  - `public.apply_registration_payment_deadline(p_command_id uuid, p_window_id uuid)`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim do `else` em `src/test/db/registrationPayment.dbtest.ts`:

```ts
  async function marcar(
    actorId: string,
    windowId: string,
    playerId: string,
    pago: boolean,
  ): Promise<number> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,$4)',
        [randomUUID(), windowId, playerId, pago],
      ),
    );
    return rows[0].window_revision;
  }

  test('repetir o mesmo comando de pagamento não sobe a revisão de novo', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const comando = randomUUID();

    const primeira = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,true)',
        [comando, f.windowId, a.playerId],
      ),
    );
    const segunda = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,true)',
        [comando, f.windowId, a.playerId],
      ),
    );
    assert.equal(segunda.rows[0].window_revision, primeira.rows[0].window_revision);
  });

  test('marcar pagamento aplica o corte pendente e promove quem acabou de pagar', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await venceuOPrazo(f.windowId);

    await marcar(f.ownerId, f.windowId, b.playerId, true);

    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED', 'o não pago caiu');
    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED', 'o pago ocupou a vaga');
  });

  test('marcar como pago limpa o atraso e devolve a entrada à faixa dos pagos', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await venceuOPrazo(f.windowId);
    await cortar(f.windowId);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');

    await marcar(f.ownerId, f.windowId, a.playerId, true);

    const { rows } = await client.query<{ payment_lapsed_at: string | null }>(
      `select payment_lapsed_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, a.playerId],
    );
    assert.equal(rows[0].payment_lapsed_at, null, 'o atraso foi limpo');
    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED', 'voltou para a vaga vazia');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED');
  });

  test('desmarcar não rebaixa ninguém', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await marcar(f.ownerId, f.windowId, a.playerId, true);
    await marcar(f.ownerId, f.windowId, a.playerId, false);

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
    const { rows } = await client.query<{ paid_at: string | null }>(
      `select paid_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, a.playerId],
    );
    assert.equal(rows[0].paid_at, null);
  });

  test('só quem organiza marca pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');

    const erro = await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.mark_registration_payment($1,$2,$3,true)', [
        randomUUID(),
        f.windowId,
        a.playerId,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, '42501');
  });

  test('o prazo precisa ser no futuro, e limpar é sempre permitido', async () => {
    const f = await fixture(1);

    const erro = await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() - 60000).toISOString(),
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, '23514');

    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() + 86400000).toISOString(),
      ]),
    );
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,null)', [
        randomUUID(),
        f.windowId,
      ]),
    );
    const { rows } = await client.query<{ payment_due_at: string | null }>(
      'select payment_due_at from public.registration_windows where id = $1',
      [f.windowId],
    );
    assert.equal(rows[0].payment_due_at, null);
  });

  test('subir ao topo da reserva passa na frente até de quem pagou', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await marcar(f.ownerId, f.windowId, c.playerId, true);
    assert.deepEqual(await reserva(f.windowId), [c.playerId, b.playerId]);

    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.boost_registration_reserve_entry($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        b.playerId,
      ]),
    );
    assert.deepEqual(await reserva(f.windowId), [b.playerId, c.playerId]);
  });

  test('o comando de aplicar agora corta e devolve a revisão nova', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);

    const antes = (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [f.windowId],
      )
    ).rows[0].revision;

    const { rows } = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.apply_registration_payment_deadline($1,$2)',
        [randomUUID(), f.windowId],
      ),
    );

    assert.equal(rows[0].window_revision, antes + 1);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)" | head -3
```

Esperado: `ℹ fail 8`, por funções inexistentes.

- [ ] **Step 3: Implementar marcar pagamento**

Acrescentar ao fim de `supabase/migrations/20260923120000_registration_payment.sql`:

```sql
-- Marcar pagamento é a única operação de pagamento permitida com a janela CLOSED ou LOCKED:
-- reconciliar quem pagou é trabalho que vai até o último minuto, e travar a lista não deveria
-- obrigar o organizador a reabrir só para corrigir um "pago".
create function public.mark_registration_payment(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_paid boolean
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_entry public.registration_entries;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null or p_paid is null then
    raise exception 'command_id, window_id, player_id and paid are required'
      using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'mark_registration_payment', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to mark Registration payment'
      using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status in ('CONFIRMED', 'WAITLISTED');
  if not found then
    raise exception 'Registration entry not found for this Player' using errcode = 'P0002';
  end if;

  perform app_private.apply_payment_deadline(p_window_id);

  if p_paid then
    -- Limpar o atraso devolve a entrada à faixa dos pagos: quem foi rebaixado por engano não
    -- deve ficar atrás de quem nunca pagou.
    update public.registration_entries
       set paid_at = pg_catalog.now(),
           payment_lapsed_at = null
     where id = v_entry.id;
  else
    update public.registration_entries
       set paid_at = null
     where id = v_entry.id;
  end if;

  -- Marcar pode ter acabado de tornar a entrada promovível, e o corte pode ter aberto vagas.
  perform app_private.promote_waitlist_to_capacity(p_window_id);

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'mark_registration_payment', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.mark_registration_payment(uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.mark_registration_payment(uuid, uuid, uuid, boolean)
  to authenticated;
```

- [ ] **Step 4: Implementar o prazo, o topo da reserva e o aplicar agora**

Acrescentar ao fim do mesmo arquivo:

```sql
-- Definir ou limpar o prazo. Nulo limpa; um instante no passado é recusado, porque um prazo que
-- já venceu ao ser criado cortaria a lista no comando seguinte sem ninguém ter tido chance.
create function public.set_registration_payment_due(
  p_command_id uuid,
  p_window_id uuid,
  p_due_at timestamptz
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'set_registration_payment_due', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  if p_due_at is not null and p_due_at <= pg_catalog.now() then
    raise exception 'Payment due date must be in the future' using errcode = '23514';
  end if;

  update public.registration_windows
     set payment_due_at = p_due_at,
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'set_registration_payment_due', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.set_registration_payment_due(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.set_registration_payment_due(uuid, uuid, timestamptz)
  to authenticated;

-- Subir ao topo da reserva. Uma ação, não uma reordenação: grava um rank menor que todos os
-- outros em vez de renumerar a fila, então nenhuma outra entrada muda de lugar relativo.
create function public.boost_registration_reserve_entry(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_entry public.registration_entries;
  v_min bigint;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null then
    raise exception 'command_id, window_id and player_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'boost_registration_reserve_entry', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status = 'WAITLISTED';
  if not found then
    raise exception 'Waitlisted Registration entry not found for this Player'
      using errcode = 'P0002';
  end if;

  select pg_catalog.min(reserve_rank) into v_min
    from public.registration_entries
   where registration_window_id = p_window_id;

  update public.registration_entries
     set reserve_rank = coalesce(v_min, 1) - 1
   where id = v_entry.id;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'boost_registration_reserve_entry', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.boost_registration_reserve_entry(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.boost_registration_reserve_entry(uuid, uuid, uuid)
  to authenticated;

-- O botão "aplicar agora". Quando não havia o que cortar, devolve a revisão de sempre sem bumpar:
-- um comando que não mudou nada não deveria invalidar o quadro de quem está olhando.
create function public.apply_registration_payment_deadline(
  p_command_id uuid,
  p_window_id uuid
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_cortou boolean;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'apply_registration_payment_deadline', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  v_cortou := app_private.apply_payment_deadline(p_window_id);

  if v_cortou then
    update public.registration_windows
       set revision = revision + 1,
           updated_at = pg_catalog.now()
     where id = p_window_id
    returning revision into v_new_revision;
  else
    v_new_revision := v_window.revision;
  end if;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'apply_registration_payment_deadline', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.apply_registration_payment_deadline(uuid, uuid) from public, anon;
grant execute on function public.apply_registration_payment_deadline(uuid, uuid) to authenticated;
```

- [ ] **Step 5: Rodar até passar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -10
```

Esperado: `ℹ pass 16`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-pagamento && printf '%s\n' 'feat: comandos de pagamento da inscricao' '' 'Marcar e desmarcar pagamento, definir e limpar o prazo, subir ao topo da' 'reserva e aplicar o corte agora. Marcar vale ate com a janela travada, porque' 'reconciliar quem pagou vai ate o ultimo minuto.' '' 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>' > /tmp/msg.txt && git add -- supabase/migrations/20260923120000_registration_payment.sql src/test/db/registrationPayment.dbtest.ts && git commit -q -F /tmp/msg.txt
```

---

### Task 4: Fechar aplica o corte, travar exige pagamento em dia

**Files:**

- Modify: `supabase/migrations/20260923120000_registration_payment.sql` (acrescentar ao fim)
- Modify: `src/test/db/registrationPayment.dbtest.ts` (acrescentar testes)

**Interfaces:**

- Consumes: `app_private.apply_payment_deadline` (Task 2); `app_private.assert_registration_lifecycle_transition` e o corpo de `public.lock_registration`, de `20260831132100_registration_lifecycle_commands.sql`.
- Produces: `public.lock_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer) returns table (window_revision integer)` substituída — mesma assinatura, duas regras novas.

**Por que o corte fica em `close`:** a única transição para `LOCKED` é `CLOSED -> LOCKED`, e o corte só age com a janela `OPEN`. Em `lock` ele seria código morto, porque a janela já teria sido fechada no comando anterior. Fechar é o último instante em que ela ainda está aberta.

**Por que a guarda fica em `lock` e não em `finalize`:** `finalize_session_roster` já exige a janela `LOCKED` desde a XS-W4-05. Sem travar não há elenco, e sem pagamento em dia não há como travar, então a regra alcança o sorteio de qualquer jeito — trocando a reescrita de uma função de 204 linhas pela de uma de 85.

**A armadilha que este passo evita:** se a guarda valesse sempre, toda comunidade que nunca tocou em pagamento pararia de travar a inscrição, e a cadeia do sorteio da XS-W6-08c quebraria inteira. A guarda só vale quando a janela **usa pagamento**: tem prazo definido, ou alguém já foi marcado como pago.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim do `else` em `src/test/db/registrationPayment.dbtest.ts`:

```ts
  async function travar(
    actorId: string,
    windowId: string,
  ): Promise<{ ok: true; revision: number } | { ok: false; code?: string; hint?: string }> {
    const revision = (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [windowId],
      )
    ).rows[0].revision;
    try {
      const { rows } = await asIdentityCommitting(client, actorId, () =>
        client.query<{ window_revision: number }>('select * from public.lock_registration($1,$2,$3)', [
          randomUUID(),
          windowId,
          revision,
        ]),
      );
      return { ok: true, revision: rows[0].window_revision };
    } catch (thrown) {
      const erro = thrown as { code?: string; hint?: string };
      return { ok: false, code: erro.code, hint: erro.hint };
    }
  }

  test('sem pagamento em uso, travar continua funcionando como antes', async () => {
    const f = await fixture(2);
    await inscrever(f, 'a');
    await inscrever(f, 'b');

    const resultado = await travar(f.ownerId, f.windowId);
    assert.equal(resultado.ok, true, 'a cadeia do sorteio nao pode ter quebrado');
  });

  test('com pagamento em uso, travar recusa enquanto faltar alguém', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, a.playerId, true);

    const recusa = await travar(f.ownerId, f.windowId);
    assert.equal(recusa.ok, false);
    assert.equal((recusa as { code?: string }).code, '23514');
    assert.equal((recusa as { hint?: string }).hint, 'REGISTRATION_UNPAID');
  });

  test('com todo mundo pago, travar passa', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, a.playerId, true);
    await marcar(f.ownerId, f.windowId, b.playerId, true);

    const resultado = await travar(f.ownerId, f.windowId);
    assert.equal(resultado.ok, true);
  });

  test('um prazo definido basta para a guarda valer, mesmo sem ninguém pago', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() + 86400000).toISOString(),
      ]),
    );

    const recusa = await travar(f.ownerId, f.windowId);
    assert.equal(recusa.ok, false);
    assert.equal((recusa as { hint?: string }).hint, 'REGISTRATION_UNPAID');
  });

  test('travar aplica o corte pendente antes de decidir', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, b.playerId, true);
    await venceuOPrazo(f.windowId);

    const resultado = await travar(f.ownerId, f.windowId);

    assert.equal(resultado.ok, true, 'depois do corte so sobra o pago, entao trava');
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)" | head -3
```

Esperado: `ℹ fail 4` — os quatro casos com pagamento em uso; o primeiro teste já passa, porque é o comportamento de hoje.

- [ ] **Step 3: Substituir `close_registration` e `lock_registration`**

Acrescentar ao fim de `supabase/migrations/20260923120000_registration_payment.sql`. O corpo é o de `20260831132100_registration_lifecycle_commands.sql` com duas inserções, marcadas nos comentários:

```sql
-- Substitui a de 20260831132100_registration_lifecycle_commands.sql.
--
-- Fechar é o último instante em que a janela ainda está OPEN, e o corte do prazo só age enquanto
-- ela está aberta -- então é aqui que ele roda, não em lock. A transição permitida é
-- OPEN -> CLOSED -> LOCKED: com o corte em lock, ele nunca dispararia, porque a janela já teria
-- sido fechada no comando anterior.
--
-- O corte não toca `revision`, então o p_expected_revision de quem chamou continua válido.
create or replace function public.close_registration(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_revision integer
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(p_command_id, 'close_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'CLOSED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'close_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'CLOSED');

  -- O corte, enquanto a janela ainda está aberta.
  perform app_private.apply_payment_deadline(p_window_id);

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'CLOSED',
         closed_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'close_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.close_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.close_registration(uuid, uuid, integer) to authenticated;

-- Substitui a de 20260831132100_registration_lifecycle_commands.sql.
--
-- Travar é o momento em que a lista para de receber gente, então é onde a regra "a lista só fecha
-- para o sorteio com o pagamento em dia" pertence. finalize_session_roster já exige LOCKED, então
-- a regra alcança o sorteio sem reescrever aquela função de 204 linhas.
--
-- A guarda só vale quando a janela usa pagamento -- prazo definido ou alguém já marcado como pago.
-- Sem isso, toda comunidade que nunca cobrou nada pararia de travar a inscrição, e a cadeia do
-- sorteio da XS-W6-08c quebraria inteira.
create or replace function public.lock_registration(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_revision integer
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_payment_in_use boolean;
  v_unpaid bigint;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(p_command_id, 'lock_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'LOCKED');

  v_payment_in_use := v_window.payment_due_at is not null
    or exists (
      select 1
        from public.registration_entries e
       where e.registration_window_id = p_window_id
         and e.paid_at is not null
    );

  if v_payment_in_use then
    select pg_catalog.count(*) into v_unpaid
      from public.registration_entries e
     where e.registration_window_id = p_window_id
       and e.status = 'CONFIRMED'
       and e.paid_at is null;

    if v_unpaid > 0 then
      raise exception 'Registration has % confirmed entries without payment', v_unpaid
        using errcode = '23514', hint = 'REGISTRATION_UNPAID';
    end if;
  end if;

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'LOCKED',
         locked_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.lock_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.lock_registration(uuid, uuid, integer) to authenticated;
```

- [ ] **Step 4: Rodar até passar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -10
```

Esperado: `ℹ pass 21`, `ℹ fail 0`.

- [ ] **Step 5: Garantir que a cadeia do sorteio continua inteira**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationFlow.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -8
```

Esperado: `ℹ fail 0`. Se algum caso quebrar aqui, a guarda está valendo onde não devia — revise `v_payment_in_use` antes de seguir.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-pagamento && git add -- supabase/migrations/20260923120000_registration_payment.sql src/test/db/registrationPayment.dbtest.ts && git commit -q -F - <<'EOF'
feat: travar a inscricao exige pagamento em dia

A guarda mora em lock, nao em finalize: finalize ja exige LOCKED, entao a regra
alcanca o sorteio do mesmo jeito por uma funcao tres vezes menor. So vale
quando a janela usa pagamento, senao toda comunidade que nunca cobrou nada
pararia de travar a lista.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: A leitura do quadro com pagamento

**Files:**

- Modify: `supabase/migrations/20260923120000_registration_payment.sql` (acrescentar ao fim)
- Modify: `src/test/db/registrationPayment.dbtest.ts` (acrescentar testes)

**Interfaces:**

- Consumes: `app_private.registration_reserve_order` (Task 1); o corpo de `app_private.build_registration_board` de `20260922120000_registration_board.sql`.
- Produces: `app_private.build_registration_board(p_window public.registration_windows) returns jsonb` substituída. `public.read_registration_board` e `public.read_session_registration` não mudam — elas já delegam para esta.
- Campos novos no JSON: `payment_due_at`, `paid_count`, `viewer_paid_at`, `pending_deadline_cut` (`null`, ou `{ demoted: [player_id], promoted: [player_id] }`), e `paid_at` + `payment_lapsed_at` em cada entrada. `queue_position` passa a vir da ordem da reserva.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim do `else` em `src/test/db/registrationPayment.dbtest.ts`:

```ts
  interface Quadro {
    capacity: number;
    payment_due_at: string | null;
    paid_count: number;
    viewer_paid_at: string | null;
    pending_deadline_cut: { demoted: string[]; promoted: string[] } | null;
    entries: {
      player_id: string;
      status: string;
      queue_position: number | null;
      paid_at: string | null;
      payment_lapsed_at: string | null;
    }[];
  }

  async function quadro(actorId: string, windowId: string): Promise<Quadro> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ board: Quadro }>('select public.read_registration_board($1) as board', [
        windowId,
      ]),
    );
    return rows[0].board;
  }

  test('o quadro traz pagamento, contagem e a reserva na ordem do pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await marcar(f.ownerId, f.windowId, a.playerId, true);
    await marcar(f.ownerId, f.windowId, c.playerId, true);

    const q = await quadro(f.ownerId, f.windowId);
    assert.equal(q.paid_count, 1, 'conta os pagos entre os confirmados');
    assert.equal(q.pending_deadline_cut, null, 'sem prazo vencido, nao ha corte pendente');

    const reservaDoQuadro = q.entries.filter((e) => e.status === 'WAITLISTED');
    assert.equal(reservaDoQuadro[0].player_id, c.playerId, 'o pago vem primeiro na reserva');
    assert.equal(reservaDoQuadro[0].queue_position, 1);
    assert.notEqual(reservaDoQuadro[0].paid_at, null);
    assert.equal(reservaDoQuadro[1].queue_position, 2);
  });

  test('o quadro anuncia o corte pendente sem aplicá-lo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, b.playerId, true);
    await venceuOPrazo(f.windowId);

    const q = await quadro(f.ownerId, f.windowId);
    assert.deepEqual(q.pending_deadline_cut, { demoted: [a.playerId], promoted: [b.playerId] });
    assert.equal(
      await statusDe(f.windowId, a.playerId),
      'CONFIRMED',
      'ler nao muda nada no banco',
    );
  });

  test('o atleta vê o próprio pagamento', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    await marcar(f.ownerId, f.windowId, a.playerId, true);

    const q = await quadro(a.userId, f.windowId);
    assert.notEqual(q.viewer_paid_at, null);
    assert.equal(q.payment_due_at, null);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)" | head -3
```

Esperado: `ℹ fail 3` — os campos novos voltam `undefined`.

- [ ] **Step 3: Substituir o construtor do quadro**

Acrescentar ao fim de `supabase/migrations/20260923120000_registration_payment.sql`:

```sql
-- Substitui a de 20260922120000_registration_board.sql. Três mudanças: a posição na reserva passa
-- a vir de app_private.registration_reserve_order em vez de um row_number próprio -- a regra vive
-- em um lugar só --, cada entrada carrega pagamento e atraso, e o quadro anuncia o corte pendente.
--
-- Anunciar sem aplicar é o ponto todo: a função é `stable` e não escreve. A tela mostra quem sai e
-- quem entra, e o banco só muda no próximo comando.
create or replace function app_private.build_registration_board(
  p_window public.registration_windows
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
  v_entries jsonb;
  v_viewer jsonb;
  v_cut jsonb := null;
  v_demoted uuid[];
  v_livres integer;
begin
  select p.id into v_player_id
    from public.players p
   where p.user_id = v_uid
     and p.deleted_at is null
   limit 1;

  with reserva as (
    select * from app_private.registration_reserve_order(p_window.id)
  ),
  ordenadas as (
    select e.id,
           e.player_id,
           e.status,
           e.source,
           e.joined_at,
           e.paid_at,
           e.payment_lapsed_at,
           r.posicao as queue_position,
           case when e.status = 'CONFIRMED' then 0 else 1 end as ordem_grupo,
           e.queue_sequence
      from public.registration_entries e
      left join reserva r on r.entry_id = e.id
     where e.registration_window_id = p_window.id
       and e.status in ('CONFIRMED', 'WAITLISTED')
  )
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_id', o.id,
               'player_id', o.player_id,
               'status', o.status,
               'queue_position', o.queue_position,
               'source', o.source,
               'joined_at', o.joined_at,
               'paid_at', o.paid_at,
               'payment_lapsed_at', o.payment_lapsed_at
             )
             order by o.ordem_grupo, coalesce(o.queue_position, 0), o.queue_sequence, o.joined_at
           ),
           '[]'::jsonb
         )
    into v_entries
    from ordenadas o;

  select pg_catalog.jsonb_build_object(
           'viewer_entry_status', (
             select e.status
               from public.registration_entries e
              where e.registration_window_id = p_window.id
                and e.player_id = v_player_id
                and e.status in ('CONFIRMED', 'WAITLISTED')
              limit 1
           ),
           'viewer_paid_at', (
             select e.paid_at
               from public.registration_entries e
              where e.registration_window_id = p_window.id
                and e.player_id = v_player_id
                and e.status in ('CONFIRMED', 'WAITLISTED')
              limit 1
           ),
           'viewer_queue_position', (
             select entry ->> 'queue_position'
               from pg_catalog.jsonb_array_elements(v_entries) as entry
              where (entry ->> 'player_id')::uuid = v_player_id
                and entry ->> 'status' = 'WAITLISTED'
              limit 1
           )
         )
    into v_viewer;

  if p_window.status = 'OPEN'
     and p_window.payment_due_at is not null
     and pg_catalog.now() >= p_window.payment_due_at
     and (p_window.payment_deadline_applied_at is null
          or p_window.payment_deadline_applied_at < p_window.payment_due_at) then
    select pg_catalog.array_agg(e.player_id order by e.queue_sequence) into v_demoted
      from public.registration_entries e
     where e.registration_window_id = p_window.id
       and e.status = 'CONFIRMED'
       and e.paid_at is null;

    select p_window.capacity - pg_catalog.count(*) into v_livres
      from public.registration_entries e
     where e.registration_window_id = p_window.id
       and e.status = 'CONFIRMED'
       and e.paid_at is not null;

    v_cut := pg_catalog.jsonb_build_object(
      'demoted', coalesce(pg_catalog.to_jsonb(v_demoted), '[]'::jsonb),
      'promoted', coalesce(
        (
          select pg_catalog.jsonb_agg(sobem.player_id order by sobem.posicao)
            from (
              select r.player_id, r.posicao
                from app_private.registration_reserve_order(p_window.id) r
                join public.registration_entries e on e.id = r.entry_id
               where e.paid_at is not null
               order by r.posicao
               -- greatest e construcao da linguagem, nao funcao: nao aceita qualificacao.
               limit greatest(v_livres, 0)
            ) sobem
        ),
        '[]'::jsonb
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'window_id', p_window.id,
    'session_id', p_window.session_id,
    'status', p_window.status,
    'revision', p_window.revision,
    'capacity', p_window.capacity,
    'opened_at', p_window.opened_at,
    'closed_at', p_window.closed_at,
    'locked_at', p_window.locked_at,
    'payment_due_at', p_window.payment_due_at,
    'confirmed_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'CONFIRMED'
    ),
    'waitlisted_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'WAITLISTED'
    ),
    'paid_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'CONFIRMED'
         and entry ->> 'paid_at' is not null
    ),
    'viewer_can_manage',
      app_private.current_user_has_valid_target_session_organizer_assignment(p_window.session_id),
    'viewer_player_id', v_player_id,
    'viewer_entry_status', v_viewer ->> 'viewer_entry_status',
    'viewer_paid_at', v_viewer ->> 'viewer_paid_at',
    'viewer_queue_position', (v_viewer ->> 'viewer_queue_position')::integer,
    'pending_deadline_cut', v_cut,
    'entries', v_entries
  );
end;
$$;

revoke all on function app_private.build_registration_board(public.registration_windows)
  from public, anon, authenticated;
```

- [ ] **Step 4: Rodar até passar**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationPayment.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -10
```

Esperado: `ℹ pass 24`, `ℹ fail 0`.

- [ ] **Step 5: Garantir que a leitura antiga continua verdadeira**

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=$DB node scripts/db-harness.mjs registrationBoard.dbtest.ts 2>&1 | grep -iE "^ℹ (pass|fail)|✖" | head -8
```

Esperado: `ℹ fail 0`. Esses cinco casos são o contrato da fatia anterior; se algum quebrar, a substituição mudou o que não devia.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-pagamento && git add -- supabase/migrations/20260923120000_registration_payment.sql src/test/db/registrationPayment.dbtest.ts && git commit -q -F - <<'EOF'
feat: o quadro mostra pagamento e o corte pendente

A posicao na reserva passa a vir da ordem unica, cada entrada carrega pagamento
e atraso, e o quadro anuncia quem sai e quem entra quando o prazo vence -- sem
aplicar, porque ler nao escreve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Tipos e serviço de nuvem

**Files:**

- Modify: `src/shared/types/registrationBoard.ts`
- Modify: `src/infra/supabase/registrationBoardCloudService.ts`
- Test: `src/infra/supabase/registrationBoardCloudService.test.ts`

**Interfaces:**

- Consumes: os campos novos do JSON da Task 5 e os quatro comandos da Task 3.
- Produces:

```ts
export interface RegistrationPendingCut {
  readonly demoted: readonly string[];
  readonly promoted: readonly string[];
}

export interface RegistrationBoardEntry {
  // ...campos existentes
  readonly paidAt: string | null;
  readonly paymentLapsedAt: string | null;
}

export interface RegistrationBoard {
  // ...campos existentes
  readonly paymentDueAt: string | null;
  readonly paidCount: number;
  readonly viewerPaidAt: string | null;
  readonly pendingDeadlineCut: RegistrationPendingCut | null;
}
```

E quatro métodos em `RegistrationBoardService`:

```ts
  markPayment(input: {
    commandId: string;
    windowId: string;
    playerId: string;
    paid: boolean;
  }): Promise<void>;
  setPaymentDue(input: {
    commandId: string;
    windowId: string;
    dueAt: string | null;
  }): Promise<void>;
  boostReserve(input: { commandId: string; windowId: string; playerId: string }): Promise<void>;
  applyPaymentDeadline(input: { commandId: string; windowId: string }): Promise<void>;
```

- [ ] **Step 1: Escrever o teste que falha**

Em `src/infra/supabase/registrationBoardCloudService.test.ts`, acrescentar os campos novos ao objeto `RAW` (dentro do objeto de topo e dentro de cada entrada):

```ts
// no objeto de topo, junto de viewer_queue_position:
  payment_due_at: '2026-09-24T15:00:00.000Z',
  paid_count: 1,
  viewer_paid_at: null,
  pending_deadline_cut: { demoted: ['p-1'], promoted: ['p-2'] },

// em cada entrada de `entries`:
  paid_at: null,
  payment_lapsed_at: null,
```

Na primeira entrada, troque `paid_at: null` por `paid_at: '2026-09-23T10:00:00.000Z'`.

E acrescentar ao fim do arquivo:

```ts
test('o quadro traz pagamento, prazo e corte pendente', async () => {
  const { service } = recording(RAW);
  const board = await service.readBoard('w-1');

  assert.equal(board.paymentDueAt, '2026-09-24T15:00:00.000Z');
  assert.equal(board.paidCount, 1);
  assert.equal(board.viewerPaidAt, null);
  assert.deepEqual(board.pendingDeadlineCut, { demoted: ['p-1'], promoted: ['p-2'] });
  assert.equal(board.entries[0].paidAt, '2026-09-23T10:00:00.000Z');
  assert.equal(board.entries[1].paymentLapsedAt, null);
});

test('marcar pagamento manda os argumentos do comando', async () => {
  const { service, calls } = recording(null);
  await service.markPayment({ commandId: 'c-1', windowId: 'w-1', playerId: 'p-9', paid: true });

  assert.deepEqual(calls, [
    [
      'mark_registration_payment',
      { p_command_id: 'c-1', p_window_id: 'w-1', p_player_id: 'p-9', p_paid: true },
    ],
  ]);
});

test('limpar o prazo manda nulo', async () => {
  const { service, calls } = recording(null);
  await service.setPaymentDue({ commandId: 'c-2', windowId: 'w-1', dueAt: null });

  assert.deepEqual(calls, [
    ['set_registration_payment_due', { p_command_id: 'c-2', p_window_id: 'w-1', p_due_at: null }],
  ]);
});

test('subir ao topo e aplicar o prazo chamam os comandos certos', async () => {
  const { service, calls } = recording(null);
  await service.boostReserve({ commandId: 'c-3', windowId: 'w-1', playerId: 'p-9' });
  await service.applyPaymentDeadline({ commandId: 'c-4', windowId: 'w-1' });

  assert.deepEqual(calls, [
    [
      'boost_registration_reserve_entry',
      { p_command_id: 'c-3', p_window_id: 'w-1', p_player_id: 'p-9' },
    ],
    ['apply_registration_payment_deadline', { p_command_id: 'c-4', p_window_id: 'w-1' }],
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && node --import tsx --test src/infra/supabase/registrationBoardCloudService.test.ts 2>&1 | grep -iE "^ℹ (pass|fail)" | head -3
```

Esperado: `ℹ fail 4`.

- [ ] **Step 3: Acrescentar os campos aos tipos**

Em `src/shared/types/registrationBoard.ts`, acrescentar a interface nova e os campos:

```ts
export interface RegistrationPendingCut {
  readonly demoted: readonly string[];
  readonly promoted: readonly string[];
}
```

Dentro de `RegistrationBoardEntry`, depois de `joinedAt`:

```ts
  readonly paidAt: string | null;
  readonly paymentLapsedAt: string | null;
```

Dentro de `RegistrationBoard`, depois de `waitlistedCount`:

```ts
  readonly paymentDueAt: string | null;
  readonly paidCount: number;
```

e depois de `viewerQueuePosition`:

```ts
  readonly viewerPaidAt: string | null;
  readonly pendingDeadlineCut: RegistrationPendingCut | null;
```

Conferir que `src/types.ts` reexporta o tipo novo: o barril usa `export * from './shared/types/registrationBoard'`, então `RegistrationPendingCut` já sai junto. Se o arquivo listar nomes um a um, acrescente `RegistrationPendingCut` à lista.

- [ ] **Step 4: Ler os campos e chamar os comandos**

Em `src/infra/supabase/registrationBoardCloudService.ts`:

Acrescentar ao `import type` do topo `RegistrationPendingCut`.

Acrescentar um leitor de texto opcional, junto das outras funções auxiliares:

```ts
function optionalText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function playerIds(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw invalid(label);
  return value.map((item) => text(item, label));
}

function pendingCut(value: unknown, label: string): RegistrationPendingCut | null {
  if (value === null || value === undefined) return null;
  const row = record(value, label);
  return {
    demoted: playerIds(row.demoted, label),
    promoted: playerIds(row.promoted, label),
  };
}
```

Na função `entry`, acrescentar ao objeto devolvido:

```ts
    paidAt: optionalText(row.paid_at, label),
    paymentLapsedAt: optionalText(row.payment_lapsed_at, label),
```

Na função `board`, acrescentar ao objeto devolvido:

```ts
    paymentDueAt: optionalText(row.payment_due_at, label),
    paidCount: integer(row.paid_count, label),
    viewerPaidAt: optionalText(row.viewer_paid_at, label),
    pendingDeadlineCut: pendingCut(row.pending_deadline_cut, label),
```

Na interface `RegistrationBoardService`, acrescentar os quatro métodos declarados no bloco **Interfaces** acima. E em `createRegistrationBoardCloudService`, dentro do objeto devolvido:

```ts
    async markPayment(input) {
      await call('mark_registration_payment', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
        p_paid: input.paid,
      });
    },
    async setPaymentDue(input) {
      await call('set_registration_payment_due', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_due_at: input.dueAt,
      });
    },
    async boostReserve(input) {
      await call('boost_registration_reserve_entry', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
      });
    },
    async applyPaymentDeadline(input) {
      await call('apply_registration_payment_deadline', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
      });
    },
```

- [ ] **Step 5: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-pagamento && npx prettier --write src/shared/types/registrationBoard.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts > /dev/null && node --import tsx --test src/infra/supabase/registrationBoardCloudService.test.ts 2>&1 | grep -iE "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/shared/types/registrationBoard.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts && git add -- src/shared/types/registrationBoard.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts && git commit -q -F - <<'EOF'
feat: tipos e servico de nuvem do pagamento

O quadro passa a carregar prazo, contagem de pagos, o pagamento de quem le e o
corte pendente; cada entrada carrega pagamento e atraso. Quatro comandos novos
no servico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `ℹ fail 0`, typecheck limpo.

---

### Task 7: Casos de uso e as mensagens novas

**Files:**

- Modify: `src/application/registrationBoardGateway.ts`
- Modify: `src/application/registrationUseCases.ts`
- Test: `src/application/registrationUseCases.test.ts`

**Interfaces:**

- Consumes: `RegistrationBoardService` (Task 6).
- Produces, todos devolvendo `Promise<AppResult<RegistrationBoard>>` e recebendo `commandId` de fora:
  - `markRegistrationPayment({ windowId, playerCloudId, paid, commandId }, gateway?)`
  - `setRegistrationPaymentDue({ windowId, dueAt, commandId }, gateway?)` — `dueAt: string | null`
  - `boostRegistrationReserve({ windowId, playerCloudId, commandId }, gateway?)`
  - `applyRegistrationPaymentDeadline({ windowId, commandId }, gateway?)`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/application/registrationUseCases.test.ts`, acrescentar ao fim. O arquivo já tem um gateway falso; reaproveite o mesmo formato dos casos existentes, acrescentando os quatro métodos novos ao objeto falso:

```ts
test('marcar pagamento devolve o quadro relido', async () => {
  const chamadas: string[] = [];
  const gateway = fakeGateway({
    onCall: (nome) => chamadas.push(nome),
  });

  const resultado = await markRegistrationPayment(
    { windowId: 'w-1', playerCloudId: 'p-9', paid: true, commandId: 'c-1' },
    gateway,
  );

  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, ['markPayment', 'readBoard']);
});

test('a recusa por pagamento pendente vira uma frase que diz o que fazer', async () => {
  const gateway = fakeGateway({
    falha: Object.assign(new Error('Registration has 3 confirmed entries without payment'), {
      code: '23514',
      hint: 'REGISTRATION_UNPAID',
    }),
  });

  const resultado = await markRegistrationPayment(
    { windowId: 'w-1', playerCloudId: 'p-9', paid: true, commandId: 'c-1' },
    gateway,
  );

  assert.equal(resultado.ok, false);
  assert.equal(
    resultado.ok === false ? resultado.error.message : '',
    'Ainda falta gente pagar. Marque quem pagou ou tire quem não vai jogar.',
  );
});

test('marcar pagamento sem ser organizador tem frase própria', async () => {
  const gateway = fakeGateway({
    falha: Object.assign(new Error('permission denied'), { code: '42501' }),
  });

  const resultado = await markRegistrationPayment(
    { windowId: 'w-1', playerCloudId: 'p-9', paid: true, commandId: 'c-1' },
    gateway,
  );

  assert.equal(
    resultado.ok === false ? resultado.error.message : '',
    'Só quem organiza marca pagamento.',
  );
});

test('prazo no passado tem frase própria', async () => {
  const gateway = fakeGateway({
    falha: Object.assign(new Error('Payment due date must be in the future'), {
      code: '23514',
      hint: 'PAYMENT_DUE_PAST',
    }),
  });

  const resultado = await setRegistrationPaymentDue(
    { windowId: 'w-1', dueAt: '2020-01-01T00:00:00.000Z', commandId: 'c-2' },
    gateway,
  );

  assert.equal(
    resultado.ok === false ? resultado.error.message : '',
    'O prazo precisa ser depois de agora.',
  );
});
```

Se o `fakeGateway` do arquivo ainda não aceitar `onCall` nem `falha`, acrescente esses dois parâmetros a ele: `onCall` registra o nome de cada método chamado, e `falha`, quando presente, é lançada pelo primeiro método de comando.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && node --import tsx --test src/application/registrationUseCases.test.ts 2>&1 | grep -iE "^ℹ (pass|fail)" | head -3
```

Esperado: `ℹ fail 4`.

- [ ] **Step 3: Marcar o prazo no passado no servidor**

O teste acima espera `hint = 'PAYMENT_DUE_PAST'`. Em `supabase/migrations/20260923120000_registration_payment.sql`, na função `public.set_registration_payment_due`, trocar:

```sql
    raise exception 'Payment due date must be in the future' using errcode = '23514';
```

por:

```sql
    raise exception 'Payment due date must be in the future'
      using errcode = '23514', hint = 'PAYMENT_DUE_PAST';
```

Um `hint` estável é o que deixa o cliente distinguir esta recusa da recusa por janela fechada, que também é `23514`. Sem ele, as duas cairiam na mesma frase.

- [ ] **Step 4: Ampliar o gateway**

Em `src/application/registrationBoardGateway.ts`, acrescentar à interface `RegistrationBoardGateway`:

```ts
  markPayment(input: {
    commandId: string;
    windowId: string;
    playerId: string;
    paid: boolean;
  }): Promise<void>;
  setPaymentDue(input: {
    commandId: string;
    windowId: string;
    dueAt: string | null;
  }): Promise<void>;
  boostReserve(input: { commandId: string; windowId: string; playerId: string }): Promise<void>;
  applyPaymentDeadline(input: { commandId: string; windowId: string }): Promise<void>;
```

- [ ] **Step 5: Implementar os casos de uso**

Em `src/application/registrationUseCases.ts`:

No `defaultRegistrationBoardGateway`, acrescentar:

```ts
  markPayment: (input) => registrationBoardCloudService.markPayment(input),
  setPaymentDue: (input) => registrationBoardCloudService.setPaymentDue(input),
  boostReserve: (input) => registrationBoardCloudService.boostReserve(input),
  applyPaymentDeadline: (input) => registrationBoardCloudService.applyPaymentDeadline(input),
```

Acrescentar um leitor de `hint`, junto de `codeOf`:

```ts
function hintOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'hint' in error) {
    const { hint } = error as { hint?: unknown };
    return typeof hint === 'string' ? hint : undefined;
  }
  return undefined;
}
```

Na função `classify`, **antes** do teste de `23514` que já existe:

```ts
  const hint = hintOf(error);
  if (hint === 'REGISTRATION_UNPAID') {
    return productError(
      'invalid_input',
      'Ainda falta gente pagar. Marque quem pagou ou tire quem não vai jogar.',
    );
  }
  if (hint === 'PAYMENT_DUE_PAST') {
    return productError('invalid_input', 'O prazo precisa ser depois de agora.');
  }
  if (code === '42501' && step === 'markPayment') {
    return productError('permission_denied', 'Só quem organiza marca pagamento.');
  }
```

E, ao fim do arquivo, os quatro casos de uso:

```ts
export function markRegistrationPayment(
  input: { windowId: string; playerCloudId: string; paid: boolean; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('markPayment', input.windowId, gateway, () =>
    gateway.markPayment({
      commandId: input.commandId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
      paid: input.paid,
    }),
  );
}

export function setRegistrationPaymentDue(
  input: { windowId: string; dueAt: string | null; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('setPaymentDue', input.windowId, gateway, () =>
    gateway.setPaymentDue({
      commandId: input.commandId,
      windowId: input.windowId,
      dueAt: input.dueAt,
    }),
  );
}

export function boostRegistrationReserve(
  input: { windowId: string; playerCloudId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('boostReserve', input.windowId, gateway, () =>
    gateway.boostReserve({
      commandId: input.commandId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
    }),
  );
}

export function applyRegistrationPaymentDeadline(
  input: { windowId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('applyDeadline', input.windowId, gateway, () =>
    gateway.applyPaymentDeadline({ commandId: input.commandId, windowId: input.windowId }),
  );
}
```

- [ ] **Step 6: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-pagamento && npx prettier --write src/application/registrationBoardGateway.ts src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts > /dev/null && node --import tsx --test src/application/registrationUseCases.test.ts 2>&1 | grep -iE "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/registrationBoardGateway.ts src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts && git add -- src/application/registrationBoardGateway.ts src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts supabase/migrations/20260923120000_registration_payment.sql && git commit -q -F - <<'EOF'
feat: casos de uso do pagamento

Marcar, definir prazo, subir ao topo e aplicar o corte, cada um devolvendo o
quadro relido. As recusas ganham frase propria via hint estavel: sem ele, a
pendencia de pagamento e a janela fechada cairiam na mesma mensagem.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `ℹ fail 0`.

---

### Task 8: O hook

**Files:**

- Modify: `src/hooks/useRegistrationBoard.ts`
- Test: `src/hooks/useRegistrationBoard.spec.tsx`

**Interfaces:**

- Consumes: os casos de uso da Task 7.
- Produces, acrescentados a `RegistrationBoardApi`:

```ts
  markPaid: (playerCloudId: string, paid: boolean) => Promise<void>;
  setPaymentDue: (dueAt: string | null) => Promise<void>;
  boostReserve: (playerCloudId: string) => Promise<void>;
  applyDeadline: () => Promise<void>;
```

- [ ] **Step 1: Escrever o spec que falha**

Em `src/hooks/useRegistrationBoard.spec.tsx`, acrescentar `markRegistrationPayment` ao mock de `../application/registrationUseCases` (junto de `joinRegistration` e companhia) e este caso ao fim do `describe`:

```tsx
  it('marcar pagamento troca o quadro e reusa o comando depois de um erro', async () => {
    casos.markPayment
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'technical', message: 'Sem conexão.', recoverable: true },
      })
      .mockResolvedValueOnce({ ok: true, value: { ...quadro, paidCount: 1 } });
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markPaid('cloud-x', true);
    });
    expect(result.current.error).toBe('Sem conexão.');

    await act(async () => {
      await result.current.markPaid('cloud-x', true);
    });
    expect(result.current.board?.paidCount).toBe(1);
    expect(casos.markPayment.mock.calls[0][0].commandId).toBe(
      casos.markPayment.mock.calls[1][0].commandId,
    );
  });
```

No bloco `vi.hoisted` do arquivo, acrescentar `markPayment: vi.fn()`, e no `vi.mock` acrescentar `markRegistrationPayment: casos.markPayment`. No `beforeEach`, acrescentar `casos.markPayment.mockReset()`. E acrescentar `paymentDueAt: null, paidCount: 0, viewerPaidAt: null, pendingDeadlineCut: null` ao objeto `quadro` do arquivo, e `paidAt: null, paymentLapsedAt: null` a qualquer entrada que ele tenha.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && npx vitest run src/hooks/useRegistrationBoard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | head -5
```

Esperado: falha em `result.current.markPaid is not a function`.

- [ ] **Step 3: Implementar**

Em `src/hooks/useRegistrationBoard.ts`, acrescentar ao `import` dos casos de uso `applyRegistrationPaymentDeadline`, `boostRegistrationReserve`, `markRegistrationPayment` e `setRegistrationPaymentDue`; acrescentar as quatro assinaturas a `RegistrationBoardApi`; e acrescentar ao objeto devolvido, junto das outras ações:

```ts
    markPaid: (playerCloudId, paid) =>
      executar(`pay:${playerCloudId}:${paid}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return markRegistrationPayment({
          windowId,
          playerCloudId,
          paid,
          commandId: ids.commandId,
        });
      }),
    setPaymentDue: (dueAt) =>
      executar(`due:${dueAt ?? 'nenhum'}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return setRegistrationPaymentDue({ windowId, dueAt, commandId: ids.commandId });
      }),
    boostReserve: (playerCloudId) =>
      executar(`boost:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return boostRegistrationReserve({ windowId, playerCloudId, commandId: ids.commandId });
      }),
    applyDeadline: () =>
      executar('applyDeadline', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return applyRegistrationPaymentDeadline({ windowId, commandId: ids.commandId });
      }),
```

A chave de `markPaid` inclui o `paid`, porque marcar e desmarcar o mesmo atleta são comandos diferentes: com a mesma chave, desmarcar reenviaria o recibo de marcar e não faria nada.

- [ ] **Step 4: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-pagamento && npx prettier --write src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx > /dev/null && npx vitest run src/hooks/useRegistrationBoard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx && git add -- src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx && git commit -q -F - <<'EOF'
feat: acoes de pagamento no hook do quadro

Marcar, prazo, subir ao topo e aplicar o corte. A chave do comando de marcar
inclui o valor: marcar e desmarcar o mesmo atleta sao comandos diferentes, e
com a mesma chave desmarcar reenviaria o recibo de marcar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `Tests 5 passed (5)`.

---

### Task 9: A tela

**Files:**

- Modify: `src/components/session/RegistrationBoardView.tsx`
- Modify: `src/app/routes/sessionRoutes.tsx` (passar a chave PIX)
- Test: `src/components/session/RegistrationBoardView.spec.tsx`

**Interfaces:**

- Consumes: `RegistrationBoardApi` com as quatro ações novas (Task 8); `RegistrationBoard` com `paymentDueAt`, `paidCount`, `viewerPaidAt`, `pendingDeadlineCut` (Task 6).
- Produces: `RegistrationBoardView` ganha uma propriedade opcional `pixKey?: string`.

**A chave PIX já existe no app**, em `WhatsAppListTemplate` (`src/shared/types/session.ts`), junto de `defaultValue`, `paymentDeadline` e `paymentNote` — a versão em texto, para colar no grupo, do que esta fatia está formalizando. A tela lê a chave de lá; não crie campo novo.

- [ ] **Step 1: Dar forma às peças novas antes de escrevê-las**

Invocar a skill `/impeccable shape` com este resumo, e seguir o que ela devolver:

> Acréscimo de pagamento a uma tela de inscrição de pelada que já existe, em pt-BR, com Tailwind e
> daisyUI, tema escuro. A tela hoje tem um painel de situação no topo e uma lista numerada por
> ordem de chegada, cortada por uma faixa de "fim das vagas" que separa quem joga de quem está na
> reserva. Entram quatro coisas: **(1)** a situação de pagamento do próprio atleta no painel —
> em dia, falta pagar com o prazo, ou perdeu o prazo e caiu para a reserva; **(2)** na lista, quem
> está quitado, de um jeito que não transforme a linha num formulário; **(3)** para quem organiza,
> marcar pago por linha, o campo de prazo, o contador "11 de 12 pagos" e "subir ao topo" nas linhas
> da reserva; **(4)** um aviso de corte pendente, quando o prazo venceu e o banco ainda não mudou,
> dizendo quem sai e quem entra, com o botão de aplicar agora. O aviso é o elemento mais delicado:
> ele anuncia uma consequência que ainda não aconteceu, e não pode parecer um erro nem passar
> despercebido.

O que a skill decidir sobre forma vale; o comportamento abaixo é o contrato e não muda.

- [ ] **Step 2: Escrever o spec que falha**

Em `src/components/session/RegistrationBoardView.spec.tsx`, acrescentar `paidAt: null` e `paymentLapsedAt: null` a cada entrada do fixture `board()`, e `paymentDueAt: null`, `paidCount: 0`, `viewerPaidAt: null`, `pendingDeadlineCut: null` ao objeto do quadro. Acrescentar `markPaid: vi.fn(), setPaymentDue: vi.fn(), boostReserve: vi.fn(), applyDeadline: vi.fn()` ao fixture `api()`. Depois, acrescentar ao fim do `describe`:

```tsx
  it('o atleta em dia vê que está quitado', () => {
    renderView({
      board: board({ viewerEntryStatus: 'CONFIRMED', viewerQueuePosition: null, viewerPaidAt: '2026-09-23T10:00:00.000Z' }),
    });
    expect(screen.getByRole('status').textContent).toMatch(/pagamento em dia/i);
  });

  it('o atleta que falta pagar vê o prazo e a chave PIX', () => {
    render(
      <RegistrationBoardView
        api={api({
          board: board({
            viewerEntryStatus: 'CONFIRMED',
            viewerQueuePosition: null,
            viewerPaidAt: null,
            paymentDueAt: '2026-09-24T15:00:00.000Z',
          }),
        })}
        players={players}
        sessionName="Pelada de quinta"
        sessionDate="2026-09-24"
        pixKey="pelada@exemplo.com"
      />,
    );
    expect(screen.getByText(/falta pagar/i)).toBeDefined();
    expect(screen.getByText('pelada@exemplo.com')).toBeDefined();
  });

  it('quem perdeu o prazo é avisado do que aconteceu', () => {
    renderView({
      board: board({
        viewerEntryStatus: 'WAITLISTED',
        viewerQueuePosition: 2,
        viewerPaidAt: null,
        entries: [
          {
            entryId: 'e-c',
            playerId: 'cloud-c',
            status: 'WAITLISTED',
            queuePosition: 2,
            source: 'SELF_JOIN',
            joinedAt: '2026-09-22T12:02:00.000Z',
            paidAt: null,
            paymentLapsedAt: '2026-09-23T12:00:00.000Z',
          },
        ],
      }),
    });
    expect(screen.getByRole('status').textContent).toMatch(/perdeu o prazo/i);
  });

  it('quem organiza marca pagamento e vê o contador', () => {
    const contrato = renderView({
      board: board({ viewerCanManage: true, paidCount: 1 }),
    });
    expect(screen.getByText(/1 de 2 pagos/i)).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: /marcar como pago/i })[0]);
    expect(contrato.markPaid).toHaveBeenCalledWith('cloud-a', true);
  });

  it('o aviso de corte pendente diz quem sai, quem entra, e deixa aplicar agora', () => {
    const contrato = renderView({
      board: board({
        viewerCanManage: true,
        paymentDueAt: '2026-09-23T12:00:00.000Z',
        pendingDeadlineCut: { demoted: ['cloud-a'], promoted: ['cloud-c'] },
      }),
    });

    const aviso = screen.getByRole('status', { name: /corte/i });
    expect(aviso.textContent).toContain('Ana');
    expect(aviso.textContent).toContain('Caio');

    fireEvent.click(screen.getByRole('button', { name: /aplicar agora/i }));
    expect(contrato.applyDeadline).toHaveBeenCalledTimes(1);
  });

  it('quem organiza sobe alguém ao topo da reserva', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    fireEvent.click(screen.getAllByRole('button', { name: /subir ao topo/i })[0]);
    expect(contrato.boostReserve).toHaveBeenCalledWith('cloud-c');
  });

  it('quem organiza define o prazo', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    const campo = screen.getByLabelText(/prazo para pagar/i);
    fireEvent.change(campo, { target: { value: '2026-09-24T15:00' } });
    fireEvent.blur(campo);
    expect(contrato.setPaymentDue).toHaveBeenCalledWith('2026-09-24T15:00');
  });
```

O quadro do fixture tem `capacity: 2` e dois confirmados, então "1 de 2 pagos" é a leitura correta de `paidCount: 1`. O segundo `role="status"` do aviso precisa de nome acessível contendo "corte" — use `aria-label`, porque o painel de situação do atleta já ocupa o `role="status"` sem nome.

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Volley-pagamento && npx vitest run src/components/session/RegistrationBoardView.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | head -10
```

Esperado: 7 falhas novas.

- [ ] **Step 4: Escrever o componente**

Seguir a forma que a skill devolveu no Passo 1, satisfazendo o spec. O contrato de comportamento:

- `pixKey` é opcional; sem ela, nada de PIX aparece.
- A situação de pagamento entra **dentro** do `role="status"` que já existe, como uma segunda frase — não um segundo `role="status"` sem nome, que quebraria `getByRole('status')` dos testes da fatia anterior.
- Prioridade das frases do atleta: perdeu o prazo → falta pagar (com prazo, quando houver) → pagamento em dia.
- `formatarPrazo` recebe o ISO e devolve dia e hora em pt-BR; o campo de prazo é `type="datetime-local"`, com rótulo contendo "Prazo para pagar", e dispara `setPaymentDue` no `blur` com o valor cru do campo (string vazia vira `null`).
- A marcação por linha é um botão com `aria-label` "Marcar como pago {nome}" quando não pago, e "Desmarcar pagamento de {nome}" quando pago; chama `markPaid(playerId, !pago)`.
- "Subir ao topo {nome}" só aparece nas linhas da reserva.
- O aviso de corte pendente resolve os `playerId` em nomes pelo mesmo `players` que a lista usa, e cai para "Atleta da comunidade" quando não achar.
- O contador é "{paidCount} de {confirmedCount} pagos".
- `busy` desabilita tudo, como já faz.

- [ ] **Step 5: Passar a chave PIX na rota**

Em `src/app/routes/sessionRoutes.tsx`, dentro de `CommunityRegistrationRoute`, resolver a chave a partir do primeiro modelo de lista de WhatsApp da comunidade e repassá-la:

```tsx
  const pixKey = whatsAppLists
    .getCommunityTemplates(community.id)
    .find((template) => !!template.pixKey)?.pixKey;
```

`getCommunityTemplates` é o acessador que `useWhatsAppListTemplates` expõe; desestruture `whatsAppLists` do `useCommunityShell()` junto de `community`, `play`, `sess` e `comm`. Depois, passar `pixKey={pixKey}` ao `RegistrationBoardView`.

- [ ] **Step 6: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-pagamento && npx prettier --write src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx src/app/routes/sessionRoutes.tsx > /dev/null && npx vitest run src/components/session/RegistrationBoardView.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx src/app/routes/sessionRoutes.tsx && node "C:/Users/mathe/.claude/skills/impeccable/scripts/detect.mjs" --json src/components/session/RegistrationBoardView.tsx && git add -- src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx src/app/routes/sessionRoutes.tsx && git commit -q -F - <<'EOF'
feat: pagamento na tela da inscricao

O atleta ve a propria situacao de pagamento e a chave PIX quando falta pagar;
quem organiza marca por linha, define o prazo, ve quantos pagaram e sobe
alguem ao topo da reserva. O aviso de corte pendente diz quem sai e quem entra
antes de acontecer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `Tests 17 passed (17)` e detector devolvendo `[]`.

---

### Task 10: Bancada, documentação e gates

**Files:**

- Modify: `preview/inscricao.tsx`
- Modify: `HANDOFF.md`
- Modify: `docs/architecture/catalogs/OPEN-DECISIONS.md`
- Modify: `docs/architecture/execution/C6-REACHABILITY-MAP.md`
- Modify: `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`

**Interfaces:**

- Consumes: tudo das Tarefas 1 a 9.

- [ ] **Step 1: Estados novos na bancada**

Em `preview/inscricao.tsx`, acrescentar `paidAt` e `paymentLapsedAt` à função `entrada` (aceitando-os como parâmetros com padrão `null`), e `paymentDueAt: null, paidCount: 0, viewerPaidAt: null, pendingDeadlineCut: null` ao `quadro`. Acrescentar `markPaid: nada, setPaymentDue: nada, boostReserve: nada, applyDeadline: nada` ao `api`. Depois, acrescentar cinco estados ao array `ESTADOS`:

```tsx
  {
    nome: 'Prazo definido, faltando gente pagar',
    api: api({
      board: quadro({
        viewerCanManage: true,
        paymentDueAt: '2026-09-24T15:00:00.000Z',
        paidCount: 2,
      }),
    }),
  },
  {
    nome: 'Prazo vencido, corte pendente',
    api: api({
      board: quadro({
        viewerCanManage: true,
        paymentDueAt: '2026-09-23T12:00:00.000Z',
        paidCount: 2,
        pendingDeadlineCut: { demoted: ['cloud-c', 'cloud-d'], promoted: ['cloud-e'] },
      }),
    }),
  },
  {
    nome: 'Lista quitada, pronta para o sorteio',
    api: api({
      board: quadro({ viewerCanManage: true, paidCount: 4, paymentDueAt: '2026-09-24T15:00:00.000Z' }),
    }),
  },
  {
    nome: 'Atleta em dia',
    api: api({
      board: quadro({
        viewerPlayerId: 'cloud-a',
        viewerEntryStatus: 'CONFIRMED',
        viewerQueuePosition: null,
        viewerPaidAt: '2026-09-23T10:00:00.000Z',
      }),
    }),
  },
  {
    nome: 'Atleta que perdeu o prazo',
    api: api({
      board: quadro({
        viewerPlayerId: 'cloud-e',
        viewerEntryStatus: 'WAITLISTED',
        viewerQueuePosition: 3,
        paymentDueAt: '2026-09-23T12:00:00.000Z',
      }),
    }),
  },
```

Nos estados que usam `paidCount`, marque as entradas correspondentes com `paid_at` passando o parâmetro novo de `entrada`, senão o contador contradiz a lista.

- [ ] **Step 2: Olhar a tela, uma rodada só**

```bash
cd /c/Volley-pagamento && echo "abra http://localhost:3100/preview/inscricao.html com preview_start no dev-3100"
```

Subir o servidor de desenvolvimento pelo `preview_start` (configuração `dev-3100`), abrir a bancada, e inspecionar **desktop e celular na mesma rodada**. No painel do navegador, mantenha a largura emulada **abaixo de 760px**, senão a captura corta o lado direito. Corrigir tudo o que a rodada mostrar de uma vez, confirmar com no máximo mais uma rodada, e parar.

Verificar nesta rodada: o aviso de corte pendente não parece um erro; a marcação por linha não transforma a linha num formulário; o contador e o prazo cabem no celular; e a situação de pagamento do atleta não briga com a situação de vaga no mesmo painel.

- [ ] **Step 3: Decisões reabertas**

Em `docs/architecture/catalogs/OPEN-DECISIONS.md`, substituir as duas linhas:

```markdown
| `OPEN-REG-004` | Future protected/reserved slot categories | **DECIDED 2026-09-23** — payment orders the waitlist; strict FIFO is no longer the only baseline. See `docs/superpowers/specs/2026-09-23-registration-payment-design.md` | Superseded by the payment slice |
| `OPEN-REG-005` | Future cancellation/refund/payment concepts attached to Registration | **PARTIALLY DECIDED 2026-09-23** — payment is in (mark paid, deadline, waitlist order); refund and cancellation remain out | Refund/cancellation still requires a product decision |
```

- [ ] **Step 4: Mapa de alcançabilidade e C6.02**

Em `docs/architecture/execution/C6-REACHABILITY-MAP.md`, na tabela `### Alcançável`, acrescentar depois da linha `| Inscrição da pelada |`:

```markdown
| Pagamento da inscrição | tela | `RegistrationBoardView` → `useRegistrationBoard` → `registrationUseCases` → `mark_registration_payment`, `set_registration_payment_due`, `boost_registration_reserve_entry`, `apply_registration_payment_deadline` |
```

Atualizar a contagem de `**24 são alcançáveis**` para `**28 são alcançáveis**` e acrescentar à frase que termina em "que até aqui não tinha comando nenhum.": `A fatia do pagamento somou os quatro comandos de pagamento, todos de organizador.`

Em `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, no fim da seção `## XS-W4-03 — JoinRegistration authoritative transaction`, depois do bloco `### Reachable since 2026-09-22`, acrescentar:

```markdown
### Payment since 2026-09-23

A ordem da fila deixou de ser estritamente a de chegada: `app_private.registration_reserve_order`
põe quem pagou à frente, e um prazo opcional rebaixa quem não pagou para o fim da reserva. A
promoção consome essa ordem e, passado o prazo, só sobe quem pagou. `lock_registration` recusa
enquanto houver confirmado sem pagamento, o que alcança o sorteio porque `finalize_session_roster`
já exige `LOCKED`. Ver `docs/superpowers/specs/2026-09-23-registration-payment-design.md`.
```

- [ ] **Step 5: HANDOFF**

Inserir, antes da linha `### A inscrição ganhou tela — 2026-09-22`:

```markdown
### A vaga se confirma pelo pagamento — 2026-09-23

Ver a [spec](docs/superpowers/specs/2026-09-23-registration-payment-design.md) e o
[plano](docs/superpowers/plans/2026-09-23-registration-payment.md).

Pagamento é um segundo eixo sobre a inscrição: `status` diz se está dentro, `queue_sequence` diz
quando chegou, `paid_at` diz se quitou. A reserva passa a ser ordenada por quem pagou primeiro,
com quatro faixas — fixado pelo organizador, pago, não pago, perdeu o prazo.

- `20260923120000_registration_payment.sql`: colunas de pagamento, `registration_reserve_order`,
  `apply_payment_deadline`, quatro comandos, `lock_registration` exigindo pagamento em dia e o
  quadro anunciando o corte pendente.
- O prazo é opcional. Passado ele, o corte roda dentro de marcar pagamento, do botão "aplicar
  agora" e de travar — não num serviço de relógio. `pg_cron` existe no Panelinha e continua
  desinstalado de propósito.
- A guarda de pagamento em `lock` só vale quando a janela usa pagamento, senão toda comunidade que
  nunca cobrou nada pararia de travar a lista.

**Sobreposição conhecida:** `WhatsAppListTemplate` já tem `pixKey`, `defaultValue`,
`paymentDeadline` e `paymentNote` — a versão em texto, para colar no grupo, do que esta fatia
formalizou. A tela lê a chave PIX de lá. Unificar os dois é assunto de uma fatia própria.

**Migration não aplicada no Panelinha e sem push**: ambos esperam o ok do usuário.
```

- [ ] **Step 6: Todos os gates**

```bash
cd /c/Volley-pagamento && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& npx prettier --write HANDOFF.md docs/architecture/catalogs/OPEN-DECISIONS.md docs/architecture/execution/C6-REACHABILITY-MAP.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md preview/inscricao.tsx > /dev/null \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues'; \
npm test 2>&1 | grep -E "^ℹ (pass|fail)|Tests +[0-9]|Test Files"; \
npm run check:architecture > /dev/null && echo ARCH ok && npm run build > /dev/null 2>&1 && echo BUILD ok
```

Depois a suíte de banco completa:

```bash
cd /c/Volley-pagamento && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Esperado: tudo verde; `ℹ fail 0`, com os 741 de antes mais os 24 desta fatia.

- [ ] **Step 7: Commit**

```bash
cd /c/Volley-pagamento && git add -- preview/inscricao.tsx HANDOFF.md docs/architecture && git commit -q -F - <<'EOF'
docs: registra o pagamento na inscricao

Bancada com os estados de pagamento, OPEN-REG-004 decidida e OPEN-REG-005
decidida em parte, mapa de alcancabilidade somando os quatro comandos, e o
HANDOFF descrevendo a fatia e a sobreposicao com o modelo de lista do WhatsApp.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -11 && git status --short
```

---

## Depois do plano

Com as dez tarefas verdes, use a skill `superpowers:finishing-a-development-branch`. A migration
`20260923120000_registration_payment.sql` **não** vai para o Panelinha e o push **não** acontece sem
o ok explícito do usuário — publicar `main` dispara o deploy de produção na Vercel.
