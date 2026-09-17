# XS-W6-08c Authorized Team Formation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an organizer generates teams for a synced Community Session, the wizard runs the authorized chain (target Session → W4 Registration → finalized roster → server snapshot) and draws from the authorized snapshot instead of local attributes.

**Architecture:** A migration adds `reopen_registration` and `read_registration_window`. A pure application module classifies authority, prechecks the selection, orchestrates the resumable chain over a gateway and re-keys the authorized request to local Player ids. `useSessionWizard` runs the chain before today's Worker path; a small status component and the results step show stages, provenance and estimated counts.

**Tech Stack:** PostgreSQL (Supabase), Node test runner + `pg`, React 19, Vitest + Testing Library, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-16-xs-w6-08c-authorized-team-formation-design.md`

## Global Constraints

- Work only in `C:\Volley-xs-w6-08`, branch `exec/c6-authorized-team-formation`. Never touch `C:\Volley`. Stage explicit paths only.
- Migration file: `supabase/migrations/20260916120000_reopen_registration.sql`.
- Database: container `volley_test_pg2`; `VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test`. Single suite: `node scripts/db-harness.mjs <file>.dbtest.ts`.
- Authority is decided without any network call; there is no activation lookup (XS-W6-08a activated every Community).
- Guests are not refused; only missing `cloudId` and Community membership are local prechecks.
- pt-BR copy, exactly as in the spec's error table and screen section.
- Organizing-role refusal copy: "Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times."
- Offline copy: "Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times."
- No comments in TypeScript source.
- Commit messages in Portuguese without accents, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Do not apply the migration to Supabase and do not push; both wait for the user.

---

### Task 1: `reopen_registration` and `read_registration_window`

**Files:**

- Create: `supabase/migrations/20260916120000_reopen_registration.sql`
- Test: `src/test/db/registrationReopen.dbtest.ts` (create)

**Interfaces:**

- Produces: `public.reopen_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer) returns table (window_revision integer)`; `public.read_registration_window(p_window_id uuid) returns table (window_id uuid, session_id uuid, status text, revision integer, capacity integer, confirmed_player_ids uuid[])`.

- [ ] **Step 1: Write the failing database suite**

Create `src/test/db/registrationReopen.dbtest.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260916120000_reopen_registration.sql';

interface WindowRow extends QueryResultRow {
  window_id: string;
  session_id: string;
  status: string;
  revision: number;
  capacity: number;
  confirmed_player_ids: string[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration reopen requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  async function call<T extends QueryResultRow = QueryResultRow>(
    userId: string | null,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, userId, () => db.query<T>(sql, params));
    } finally {
      db.release();
    }
  }

  const failing = (userId: string | null, sql: string, params: unknown[] = []) =>
    call(userId, sql, params).catch((error: Error) => error);

  function assertSqlState(error: unknown, code: string) {
    assert.ok(error instanceof Error, 'expected an error');
    assert.equal((error as { code?: string }).code, code);
  }

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

  async function targetCommunity(ownerId: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [`Reopen ${randomUUID()}`],
    );
    return rows[0].id;
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function activeMember(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function communitySession(ownerId: string, communityId: string): Promise<string> {
    await grantOrganizer(communityId, ownerId);
    const sessionId = randomUUID();
    await call(
      ownerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', 'Reabertura', null, null)`,
      [sessionId, communityId],
    );
    return sessionId;
  }

  async function rosterPlayer(communityId: string, ownerId: string, name: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, has_account_identity_history)
       values ($1, $2, $3, true, false)`,
      [id, ownerId, name],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function lifecycle(
    actorId: string,
    command:
      | 'open_registration'
      | 'close_registration'
      | 'lock_registration'
      | 'reopen_registration',
    windowId: string,
    expectedRevision: number,
    commandId = randomUUID(),
  ): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      `select * from public.${command}($1, $2, $3)`,
      [commandId, windowId, expectedRevision],
    );
    return rows[0].window_revision;
  }

  async function addEntry(actorId: string, windowId: string, playerId: string): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      'select * from public.add_registration_entry($1, $2, $3, $4)',
      [randomUUID(), randomUUID(), windowId, playerId],
    );
    return rows[0].window_revision;
  }

  async function removeEntry(actorId: string, windowId: string, playerId: string): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      'select * from public.remove_registration_entry($1, $2, $3, $4)',
      [randomUUID(), windowId, playerId, 'ORGANIZER_DESELECTED'],
    );
    return rows[0].window_revision;
  }

  async function finalize(actorId: string, windowId: string, revision: number): Promise<string> {
    const { rows } = await call<{ roster_revision_id: string }>(
      actorId,
      'select * from public.finalize_session_roster($1, $2, $3)',
      [randomUUID(), windowId, revision],
    );
    return rows[0].roster_revision_id;
  }

  async function readWindow(actorId: string, windowId: string): Promise<WindowRow> {
    const { rows } = await call<WindowRow>(
      actorId,
      'select * from public.read_registration_window($1)',
      [windowId],
    );
    return rows[0];
  }

  async function participants(rosterRevisionId: string): Promise<Map<string, string>> {
    const { rows } = await client.query<{ player_id: string; participant_id: string }>(
      'select player_id, participant_id from public.roster_revision_entries where roster_revision_id = $1',
      [rosterRevisionId],
    );
    return new Map(rows.map((row) => [row.player_id, row.participant_id]));
  }

  async function lockedWindow(playerCount: number) {
    const ownerId = await newUser('owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const players: string[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      players.push(await rosterPlayer(communityId, ownerId, `Atleta ${index}`));
    }
    const windowId = randomUUID();
    const created = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.create_registration_window($1, $2, $3, $4, null)',
      [randomUUID(), windowId, sessionId, playerCount],
    );
    let revision = await lifecycle(
      ownerId,
      'open_registration',
      windowId,
      created.rows[0].window_revision,
    );
    for (const playerId of players) revision = await addEntry(ownerId, windowId, playerId);
    revision = await lifecycle(ownerId, 'close_registration', windowId, revision);
    revision = await lifecycle(ownerId, 'lock_registration', windowId, revision);
    return { ownerId, communityId, sessionId, windowId, players, revision };
  }

  test('reopen moves a LOCKED Window back to OPEN and bumps the revision', async () => {
    const w = await lockedWindow(2);
    const next = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    assert.equal(next, w.revision + 1);
    const read = await readWindow(w.ownerId, w.windowId);
    assert.equal(read.status, 'OPEN');
    assert.equal(read.revision, next);
  });

  test('reopen moves a CLOSED Window back to OPEN', async () => {
    const ownerId = await newUser('closed-owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const playerId = await rosterPlayer(communityId, ownerId, 'Fechada');
    const windowId = randomUUID();
    const created = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.create_registration_window($1, $2, $3, 1, null)',
      [randomUUID(), windowId, sessionId],
    );
    let revision = await lifecycle(ownerId, 'open_registration', windowId, created.rows[0].window_revision);
    revision = await addEntry(ownerId, windowId, playerId);
    revision = await lifecycle(ownerId, 'close_registration', windowId, revision);
    const next = await lifecycle(ownerId, 'reopen_registration', windowId, revision);
    assert.equal((await readWindow(ownerId, windowId)).status, 'OPEN');
    assert.equal(next, revision + 1);
  });

  test('reopen of an OPEN Window is a no-op that returns the current revision', async () => {
    const w = await lockedWindow(1);
    const open = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    const again = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, 0);
    assert.equal(again, open);
  });

  test('reopen refuses a DRAFT Window, a started Session, a non-organizer and a stale revision', async () => {
    const ownerId = await newUser('draft-owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const draftWindow = randomUUID();
    await call(ownerId, 'select * from public.create_registration_window($1, $2, $3, 2, null)', [
      randomUUID(),
      draftWindow,
      sessionId,
    ]);
    assertSqlState(
      await failing(ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        draftWindow,
        1,
      ]),
      '23514',
    );

    const w = await lockedWindow(1);
    assertSqlState(
      await failing(w.ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision - 1,
      ]),
      '40001',
    );

    const stranger = await newUser('member');
    await activeMember(w.communityId, stranger);
    assertSqlState(
      await failing(stranger, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '42501',
    );

    await client.query(
      "update public.sessions set lifecycle_status = 'IN_PROGRESS', actual_started_at = now() where id = $1",
      [w.sessionId],
    );
    assertSqlState(
      await failing(w.ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '23514',
    );
  });

  test('replaying the same reopen command returns its receipt', async () => {
    const w = await lockedWindow(1);
    const commandId = randomUUID();
    const first = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision, commandId);
    const closed = await lifecycle(w.ownerId, 'close_registration', w.windowId, first);
    const replay = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, closed, commandId);
    assert.equal(replay, first);
  });

  test('open_registration still refuses to leave LOCKED', async () => {
    const w = await lockedWindow(1);
    assertSqlState(
      await failing(w.ownerId, 'select * from public.open_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '23514',
    );
  });

  test('a reopen round finalizes revision 2 with reused participants, and capture only accepts it', async () => {
    const w = await lockedWindow(2);
    const first = await finalize(w.ownerId, w.windowId, w.revision);
    const firstParticipants = await participants(first);

    const newcomer = await rosterPlayer(w.communityId, w.ownerId, 'Chegou atrasado');
    let revision = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    revision = await removeEntry(w.ownerId, w.windowId, w.players[1]);
    revision = await addEntry(w.ownerId, w.windowId, newcomer);
    revision = await lifecycle(w.ownerId, 'close_registration', w.windowId, revision);
    revision = await lifecycle(w.ownerId, 'lock_registration', w.windowId, revision);
    const second = await finalize(w.ownerId, w.windowId, revision);

    assert.notEqual(second, first);
    const secondParticipants = await participants(second);
    assert.equal(secondParticipants.get(w.players[0]), firstParticipants.get(w.players[0]));
    assert.equal(secondParticipants.has(w.players[1]), false);
    assert.equal(secondParticipants.has(newcomer), true);

    assertSqlState(
      await failing(w.ownerId, 'select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        w.sessionId,
        first,
      ]),
      '40001',
    );
    const { rows } = await call<{ snapshot: { participants: unknown[] } }>(
      w.ownerId,
      'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
      [randomUUID(), w.sessionId, second],
    );
    assert.equal(rows[0].snapshot.participants.length, 2);
  });

  test('read_registration_window returns confirmed players in order and guards access', async () => {
    const w = await lockedWindow(3);
    const read = await readWindow(w.ownerId, w.windowId);
    assert.deepEqual(
      { status: read.status, capacity: read.capacity, confirmed: read.confirmed_player_ids },
      { status: 'LOCKED', capacity: 3, confirmed: w.players },
    );
    assert.equal(read.session_id, w.sessionId);

    const stranger = await newUser('reader');
    await activeMember(w.communityId, stranger);
    assertSqlState(
      await failing(stranger, 'select * from public.read_registration_window($1)', [w.windowId]),
      '42501',
    );
    assertSqlState(
      await failing(w.ownerId, 'select * from public.read_registration_window($1)', [randomUUID()]),
      'P0002',
    );
  });
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs registrationReopen.dbtest.ts 2>&1 | grep -E "^ℹ (pass|fail)|42883|does not exist" | head
```

Expected: FAIL, with errors naming `reopen_registration` or `read_registration_window` as missing (`42883`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260916120000_reopen_registration.sql`:

```sql
-- XS-W6-08c: closes OPEN-REG-006. Reopen is its own command, allowed only before the Session
-- starts, so open_registration keeps refusing to leave CLOSED or LOCKED.

create function public.reopen_registration(
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

  v_receipt := app_private.find_command_receipt(p_command_id, 'reopen_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to reopen Registration'
      using errcode = '23514';
  end if;

  if v_window.status = 'OPEN' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'reopen_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  if v_window.status not in ('CLOSED', 'LOCKED') then
    raise exception 'Registration Window in status % cannot be reopened', v_window.status
      using errcode = '23514';
  end if;

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'OPEN',
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'reopen_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.reopen_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.reopen_registration(uuid, uuid, integer) to authenticated;

create function public.read_registration_window(p_window_id uuid)
returns table (
  window_id uuid,
  session_id uuid,
  status text,
  revision integer,
  capacity integer,
  confirmed_player_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_window_id is null then
    raise exception 'window_id is required' using errcode = '23514';
  end if;

  select * into v_window from public.registration_windows w where w.id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_session from public.sessions s where s.id = v_window.session_id;
  perform public.assert_target_session_write_authorized(v_session);

  return query
    select v_window.id,
           v_window.session_id,
           v_window.status,
           v_window.revision,
           v_window.capacity,
           coalesce(
             (select pg_catalog.array_agg(e.player_id order by e.joined_at, e.id)
                from public.registration_entries e
               where e.registration_window_id = v_window.id
                 and e.status = 'CONFIRMED'),
             array[]::uuid[]
           );
end;
$$;

revoke all on function public.read_registration_window(uuid) from public, anon;
grant execute on function public.read_registration_window(uuid) to authenticated;
```

- [ ] **Step 4: Run the suite and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs registrationReopen.dbtest.ts > /tmp/w608c-reopen.log 2>&1; grep -E "^ℹ (pass|fail)" /tmp/w608c-reopen.log; grep -A25 "✖ failing" /tmp/w608c-reopen.log | head -60
```

Expected: `ℹ pass 8`, `ℹ fail 0`. On a failure, read the `✖` block in the full output before changing anything.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- supabase/migrations/20260916120000_reopen_registration.sql src/test/db/registrationReopen.dbtest.ts && git commit -q -F - <<'EOF'
feat: reabrir inscricao e ler a janela antes do sorteio autorizado

reopen_registration leva uma janela CLOSED ou LOCKED de volta a OPEN so antes
de a Session comecar, com recibo e revisao esperada, e fecha o OPEN-REG-006.
read_registration_window devolve status, revisao, capacidade e confirmados ao
organizador, para a cadeia do wizard calcular a diferenca pelo servidor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The client's RPC sequence against real SQL

**Files:**

- Test: `src/test/db/authorizedFormationChain.dbtest.ts` (create)

**Interfaces:**

- Consumes: Task 1 RPCs; XS-W3-08 `create_target_session`, `read_target_session`,
  `read_target_roster_revision`; W4 commands; W6-01 `capture_balance_input_snapshot`; the XS-W6-08a
  mirror that gives a legacy owner `ORGANIZER`.
- Produces: no code; it pins the exact order Task 5's orchestrator uses.

- [ ] **Step 1: Write the suite**

Create `src/test/db/authorizedFormationChain.dbtest.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, QueryResultRow } from 'pg';
import { asIdentityCommitting, connect, isTestDatabaseConfigured, rebuildFromMigrations } from './harness';

if (!isTestDatabaseConfigured()) {
  test('authorized formation chain requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });
  test.after(async () => client.end());

  async function user(name: string) {
    const email = `${name}-${randomUUID()}@test.local`.toLowerCase();
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict (id) do nothing',
      [rows[0].id, email, name],
    );
    return rows[0].id;
  }

  async function rpc<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function player(communityId: string, ownerId: string, name: string) {
    const id = randomUUID();
    await client.query(
      'insert into public.players (id, owner_id, name, active, has_account_identity_history) values ($1,$2,$3,true,false)',
      [id, ownerId, name],
    );
    await client.query(
      "insert into public.community_players (community_id, player_id, owner_id, active, status) values ($1,$2,$3,true,'active')",
      [communityId, id, ownerId],
    );
    return id;
  }

  const lifecycle = async (actor: string, name: string, windowId: string, revision: number) =>
    (
      await rpc<{ window_revision: number }>(actor, `select * from public.${name}($1,$2,$3)`, [
        randomUUID(),
        windowId,
        revision,
      ])
    ).rows[0].window_revision;

  test('the wizard chain runs end to end for a legacy owner, then a reopen round', async () => {
    const owner = await user('ChainOwner');
    const { rows: community } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Chain ${randomUUID()}`, owner],
    );
    const communityId = community[0].id;
    const players = [
      await player(communityId, owner, 'Ana'),
      await player(communityId, owner, 'Bia'),
      await player(communityId, owner, 'Caio'),
    ];

    const sessionId = randomUUID();
    await rpc(owner, "select public.create_target_session($1,$2,'COMMUNITY','FREE_PLAY',$3,null,null)", [
      sessionId,
      communityId,
      'Pelada autorizada',
    ]);

    const windowId = randomUUID();
    const created = await rpc<{ window_revision: number }>(
      owner,
      'select * from public.create_registration_window($1,$2,$3,$4,null)',
      [randomUUID(), windowId, sessionId, players.length],
    );
    let revision = await lifecycle(owner, 'open_registration', windowId, created.rows[0].window_revision);
    for (const playerId of players) {
      revision = (
        await rpc<{ window_revision: number }>(
          owner,
          'select * from public.add_registration_entry($1,$2,$3,$4)',
          [randomUUID(), randomUUID(), windowId, playerId],
        )
      ).rows[0].window_revision;
    }
    revision = await lifecycle(owner, 'close_registration', windowId, revision);
    revision = await lifecycle(owner, 'lock_registration', windowId, revision);
    const finalized = await rpc<{ roster_revision_id: string }>(
      owner,
      'select * from public.finalize_session_roster($1,$2,$3)',
      [randomUUID(), windowId, revision],
    );
    const firstRoster = finalized.rows[0].roster_revision_id;

    const window = await rpc<{ status: string; confirmed_player_ids: string[] }>(
      owner,
      'select * from public.read_registration_window($1)',
      [windowId],
    );
    assert.equal(window.rows[0].status, 'LOCKED');
    assert.deepEqual(window.rows[0].confirmed_player_ids, players);

    const roster = await rpc<{ entries: { participant_id: string; player_id: string }[] }>(
      owner,
      'select * from public.read_target_roster_revision($1)',
      [firstRoster],
    );
    assert.deepEqual(
      roster.rows[0].entries.map((entry) => entry.player_id),
      players,
    );

    const captured = await rpc<{ snapshot: { participants: { participant_id: string; is_estimated: boolean }[] } }>(
      owner,
      'select public.capture_balance_input_snapshot($1,$2,$3) as snapshot',
      [randomUUID(), sessionId, firstRoster],
    );
    const snapshotParticipants = captured.rows[0].snapshot.participants;
    assert.deepEqual(
      snapshotParticipants.map((p) => p.participant_id).sort(),
      roster.rows[0].entries.map((entry) => entry.participant_id).sort(),
    );
    assert.equal(snapshotParticipants.every((p) => p.is_estimated), true);

    const latecomer = await player(communityId, owner, 'Duda');
    revision = await lifecycle(owner, 'reopen_registration', windowId, revision);
    revision = (
      await rpc<{ window_revision: number }>(
        owner,
        'select * from public.remove_registration_entry($1,$2,$3,$4)',
        [randomUUID(), windowId, players[2], 'ORGANIZER_DESELECTED'],
      )
    ).rows[0].window_revision;
    revision = (
      await rpc<{ window_revision: number }>(
        owner,
        'select * from public.add_registration_entry($1,$2,$3,$4)',
        [randomUUID(), randomUUID(), windowId, latecomer],
      )
    ).rows[0].window_revision;
    revision = await lifecycle(owner, 'close_registration', windowId, revision);
    revision = await lifecycle(owner, 'lock_registration', windowId, revision);
    const second = await rpc<{ roster_revision_id: string }>(
      owner,
      'select * from public.finalize_session_roster($1,$2,$3)',
      [randomUUID(), windowId, revision],
    );
    const secondRoster = second.rows[0].roster_revision_id;

    const read = await rpc<{ current_roster_revision_id: string }>(
      owner,
      'select * from public.read_target_session($1)',
      [sessionId],
    );
    assert.equal(read.rows[0].current_roster_revision_id, secondRoster);

    const recaptured = await rpc<{ snapshot: { participants: unknown[] } }>(
      owner,
      'select public.capture_balance_input_snapshot($1,$2,$3) as snapshot',
      [randomUUID(), sessionId, secondRoster],
    );
    assert.equal(recaptured.rows[0].snapshot.participants.length, 3);
  });
}
```

- [ ] **Step 2: Run it**

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs authorizedFormationChain.dbtest.ts > /tmp/w608c-chain.log 2>&1; grep -E "^ℹ (pass|fail)" /tmp/w608c-chain.log; grep -A25 "✖ failing" /tmp/w608c-chain.log | head -60
```

Expected: `ℹ pass 1`, `ℹ fail 0`. A failure here means an RPC contract differs from the spec's chain: read the error and correct the order or parameters in this test and in Task 5 before continuing.

- [ ] **Step 3: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/test/db/authorizedFormationChain.dbtest.ts && git commit -q -F - <<'EOF'
test: cadeia do sorteio autorizado contra o banco real

A mesma sequencia de RPCs que o wizard vai rodar, numa comunidade legada cujo
dono tem ORGANIZER pelo espelho: Session target, inscricao, elenco finalizado,
captura com todos estimados, e uma rodada de reabertura ate a revisao 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Gateway contracts and cloud services

**Files:**

- Create: `src/application/authorizedFormationGateways.ts`
- Create: `src/infra/supabase/registrationCloudService.ts`
- Test: `src/infra/supabase/registrationCloudService.test.ts` (create)
- Modify: `src/infra/supabase/sessionCohortCloudService.ts` (imports, a parser, `readRosterRevision`, return type)
- Test: `src/infra/supabase/sessionCohortCloudService.test.ts` (append)

**Interfaces:**

- Consumes: `RpcClient` from `src/infra/supabase/sessionCohortCloudService.ts`; `CreateTargetSessionInput`, `TargetSessionRead` from `src/application/sessionCohortCutover.ts`.
- Produces (`src/application/authorizedFormationGateways.ts`):

```ts
export type RegistrationWindowStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';
export interface RegistrationWindowRead { windowId; sessionId; status; revision; capacity; confirmedPlayerIds }
export interface WindowCommand { commandId; windowId; expectedRevision }
export interface FinalizedRoster { rosterRevisionId; rosterRevisionNumber }
export interface RegistrationGateway { createWindow; openWindow; reopenWindow; closeWindow; lockWindow; changeCapacity; addEntry; removeEntry; finalizeRoster; readWindow }
export interface RosterRevisionRead { rosterRevisionId; sessionId; entries: { participantId; identityKind; playerId }[] }
export interface SessionCohortRosterGateway { readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead> }
export interface AuthorizedFormationGateway { createTargetSession; readTargetSession; readRosterRevision; registration; captureSnapshot; readSnapshot }
```

`registrationCloudService: RegistrationGateway`; `createRegistrationCloudService(client: RpcClient): RegistrationGateway`; `createSessionCohortCloudService` also returns `readRosterRevision`.

- [ ] **Step 1: Write the gateway contracts**

Create `src/application/authorizedFormationGateways.ts`:

```ts
import type { BalanceInputSnapshot, BalanceInputSnapshotCaptureRequest } from '@shared/types';
import type { CreateTargetSessionInput, TargetSessionRead } from './sessionCohortCutover';

export type RegistrationWindowStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';

export interface RegistrationWindowRead {
  readonly windowId: string;
  readonly sessionId: string;
  readonly status: RegistrationWindowStatus;
  readonly revision: number;
  readonly capacity: number;
  readonly confirmedPlayerIds: readonly string[];
}

export interface WindowCommand {
  readonly commandId: string;
  readonly windowId: string;
  readonly expectedRevision: number;
}

export interface FinalizedRoster {
  readonly rosterRevisionId: string;
  readonly rosterRevisionNumber: number;
}

export interface RegistrationGateway {
  createWindow(input: {
    commandId: string;
    windowId: string;
    sessionId: string;
    capacity: number;
  }): Promise<number>;
  openWindow(input: WindowCommand): Promise<number>;
  reopenWindow(input: WindowCommand): Promise<number>;
  closeWindow(input: WindowCommand): Promise<number>;
  lockWindow(input: WindowCommand): Promise<number>;
  changeCapacity(input: { commandId: string; windowId: string; capacity: number }): Promise<number>;
  addEntry(input: {
    commandId: string;
    entryId: string;
    windowId: string;
    playerId: string;
  }): Promise<number>;
  removeEntry(input: {
    commandId: string;
    windowId: string;
    playerId: string;
    reason: string;
  }): Promise<number>;
  finalizeRoster(input: WindowCommand): Promise<FinalizedRoster>;
  readWindow(windowId: string): Promise<RegistrationWindowRead>;
}

export interface RosterRevisionEntryRead {
  readonly participantId: string;
  readonly identityKind: 'PLAYER' | 'GUEST';
  readonly playerId: string | null;
}

export interface RosterRevisionRead {
  readonly rosterRevisionId: string;
  readonly sessionId: string;
  readonly entries: readonly RosterRevisionEntryRead[];
}

export interface SessionCohortRosterGateway {
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
}

export interface AuthorizedFormationGateway {
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  readTargetSession(sessionCloudId: string): Promise<TargetSessionRead>;
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
  readonly registration: RegistrationGateway;
  captureSnapshot(input: BalanceInputSnapshotCaptureRequest): Promise<BalanceInputSnapshot>;
  readSnapshot(snapshotId: string): Promise<BalanceInputSnapshot>;
}
```

- [ ] **Step 2: Write the failing registration service test**

Create `src/infra/supabase/registrationCloudService.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistrationCloudService } from './registrationCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createRegistrationCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

test('createWindow sends the command, window, session and capacity and returns the revision', async () => {
  const { service, calls } = recording([{ window_id: 'w-1', window_revision: 1 }]);
  const revision = await service.createWindow({
    commandId: 'c-1',
    windowId: 'w-1',
    sessionId: 's-1',
    capacity: 4,
  });
  assert.equal(revision, 1);
  assert.deepEqual(calls, [
    [
      'create_registration_window',
      { p_command_id: 'c-1', p_window_id: 'w-1', p_session_id: 's-1', p_capacity: 4, p_closes_at: null },
    ],
  ]);
});

test('lifecycle commands map to their RPCs with the expected revision', async () => {
  for (const [method, rpcName] of [
    ['openWindow', 'open_registration'],
    ['reopenWindow', 'reopen_registration'],
    ['closeWindow', 'close_registration'],
    ['lockWindow', 'lock_registration'],
  ] as const) {
    const { service, calls } = recording([{ window_revision: 7 }]);
    const revision = await service[method]({ commandId: 'c', windowId: 'w', expectedRevision: 6 });
    assert.equal(revision, 7);
    assert.deepEqual(calls, [[rpcName, { p_command_id: 'c', p_window_id: 'w', p_expected_revision: 6 }]]);
  }
});

test('entry and capacity commands send their own parameters', async () => {
  const add = recording([{ entry_status: 'CONFIRMED', window_revision: 3 }]);
  assert.equal(
    await add.service.addEntry({ commandId: 'c', entryId: 'e', windowId: 'w', playerId: 'p' }),
    3,
  );
  assert.deepEqual(add.calls, [
    ['add_registration_entry', { p_command_id: 'c', p_entry_id: 'e', p_window_id: 'w', p_player_id: 'p' }],
  ]);

  const remove = recording([{ entry_status: 'REMOVED', window_revision: 4 }]);
  assert.equal(
    await remove.service.removeEntry({ commandId: 'c', windowId: 'w', playerId: 'p', reason: 'R' }),
    4,
  );
  assert.deepEqual(remove.calls, [
    ['remove_registration_entry', { p_command_id: 'c', p_window_id: 'w', p_player_id: 'p', p_reason: 'R' }],
  ]);

  const capacity = recording([{ window_capacity: 5, window_revision: 5 }]);
  assert.equal(await capacity.service.changeCapacity({ commandId: 'c', windowId: 'w', capacity: 5 }), 5);
  assert.deepEqual(capacity.calls, [
    ['change_registration_capacity', { p_command_id: 'c', p_window_id: 'w', p_capacity: 5 }],
  ]);
});

test('finalizeRoster sends the expected Registration revision and returns the roster revision', async () => {
  const { service, calls } = recording([
    { roster_revision_id: 'r-1', roster_revision_number: 2, source_registration_revision: 9, session_revision: 3 },
  ]);
  assert.deepEqual(await service.finalizeRoster({ commandId: 'c', windowId: 'w', expectedRevision: 9 }), {
    rosterRevisionId: 'r-1',
    rosterRevisionNumber: 2,
  });
  assert.deepEqual(calls, [
    ['finalize_session_roster', { p_command_id: 'c', p_window_id: 'w', p_expected_registration_revision: 9 }],
  ]);
});

test('readWindow maps the row and rejects an unknown status', async () => {
  const { service } = recording([
    {
      window_id: 'w',
      session_id: 's',
      status: 'LOCKED',
      revision: 8,
      capacity: 3,
      confirmed_player_ids: ['a', 'b'],
    },
  ]);
  assert.deepEqual(await service.readWindow('w'), {
    windowId: 'w',
    sessionId: 's',
    status: 'LOCKED',
    revision: 8,
    capacity: 3,
    confirmedPlayerIds: ['a', 'b'],
  });

  const bad = recording([
    { window_id: 'w', session_id: 's', status: 'PAUSED', revision: 1, capacity: 1, confirmed_player_ids: [] },
  ]);
  await assert.rejects(bad.service.readWindow('w'), /Invalid read_registration_window response/);
});

test('RPC errors are rethrown with their code', async () => {
  const { service } = recording(null, { code: '40001', message: 'Stale Registration Window revision' });
  await assert.rejects(service.openWindow({ commandId: 'c', windowId: 'w', expectedRevision: 1 }), {
    code: '40001',
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/infra/supabase/registrationCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL — `Cannot find module './registrationCloudService'`.

- [ ] **Step 4: Implement the registration service**

Create `src/infra/supabase/registrationCloudService.ts`:

```ts
import type {
  RegistrationGateway,
  RegistrationWindowStatus,
  WindowCommand,
} from '@app/authorizedFormationGateways';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

const STATUSES = new Set<string>(['DRAFT', 'OPEN', 'CLOSED', 'LOCKED']);

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function singleRow(data: unknown, label: string): Record<string, unknown> {
  const value = Array.isArray(data) ? (data.length === 1 ? data[0] : undefined) : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

export function createRegistrationCloudService(client: RpcClient): RegistrationGateway {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function windowRevision(name: string, args: Record<string, unknown>): Promise<number> {
    return integer(singleRow(await call(name, args), name).window_revision, name);
  }

  const lifecycle = (name: string) => (input: WindowCommand) =>
    windowRevision(name, {
      p_command_id: input.commandId,
      p_window_id: input.windowId,
      p_expected_revision: input.expectedRevision,
    });

  return {
    createWindow: (input) =>
      windowRevision('create_registration_window', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_session_id: input.sessionId,
        p_capacity: input.capacity,
        p_closes_at: null,
      }),
    openWindow: lifecycle('open_registration'),
    reopenWindow: lifecycle('reopen_registration'),
    closeWindow: lifecycle('close_registration'),
    lockWindow: lifecycle('lock_registration'),
    changeCapacity: (input) =>
      windowRevision('change_registration_capacity', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_capacity: input.capacity,
      }),
    addEntry: (input) =>
      windowRevision('add_registration_entry', {
        p_command_id: input.commandId,
        p_entry_id: input.entryId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
      }),
    removeEntry: (input) =>
      windowRevision('remove_registration_entry', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
        p_reason: input.reason,
      }),
    async finalizeRoster(input) {
      const label = 'finalize_session_roster';
      const row = singleRow(
        await call(label, {
          p_command_id: input.commandId,
          p_window_id: input.windowId,
          p_expected_registration_revision: input.expectedRevision,
        }),
        label,
      );
      return {
        rosterRevisionId: identifier(row.roster_revision_id, label),
        rosterRevisionNumber: integer(row.roster_revision_number, label),
      };
    },
    async readWindow(windowId) {
      const label = 'read_registration_window';
      const row = singleRow(await call(label, { p_window_id: windowId }), label);
      const confirmed = row.confirmed_player_ids;
      if (typeof row.status !== 'string' || !STATUSES.has(row.status)) throw invalid(label);
      if (!Array.isArray(confirmed) || !confirmed.every((id) => typeof id === 'string')) {
        throw invalid(label);
      }
      return {
        windowId: identifier(row.window_id, label),
        sessionId: identifier(row.session_id, label),
        status: row.status as RegistrationWindowStatus,
        revision: integer(row.revision, label),
        capacity: integer(row.capacity, label),
        confirmedPlayerIds: confirmed as string[],
      };
    },
  };
}

export const registrationCloudService: RegistrationGateway = isSupabaseConfigured
  ? createRegistrationCloudService(supabase)
  : createRegistrationCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/infra/supabase/registrationCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 6: Write the failing roster read test**

Append to `src/infra/supabase/sessionCohortCloudService.test.ts`:

```ts
test('roster revision read maps entries and sends only the revision id', async () => {
  const calls: unknown[] = [];
  const service = createSessionCohortCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: [
          {
            roster_revision_id: 'r-1',
            session_id: 's-1',
            entries: [
              { participant_id: 'pa', identity_kind: 'PLAYER', player_id: 'p-1', display_name_at_time: 'Ana' },
              { participant_id: 'pb', identity_kind: 'GUEST', player_id: null, display_name_at_time: 'Bia' },
            ],
          },
        ],
        error: null,
      };
    },
  });

  assert.deepEqual(await service.readRosterRevision('r-1'), {
    rosterRevisionId: 'r-1',
    sessionId: 's-1',
    entries: [
      { participantId: 'pa', identityKind: 'PLAYER', playerId: 'p-1' },
      { participantId: 'pb', identityKind: 'GUEST', playerId: null },
    ],
  });
  assert.deepEqual(calls, [['read_target_roster_revision', { p_roster_revision_id: 'r-1' }]]);
});

test('roster revision read rejects malformed entries', async () => {
  const service = createSessionCohortCloudService({
    rpc: async () => ({
      data: [{ roster_revision_id: 'r', session_id: 's', entries: [{ participant_id: 1 }] }],
      error: null,
    }),
  });
  await assert.rejects(service.readRosterRevision('r'), /Invalid target roster revision response/);
});
```

- [ ] **Step 7: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/infra/supabase/sessionCohortCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|readRosterRevision is not a function" | head -3
```

Expected: FAIL — `service.readRosterRevision is not a function` in the two new tests.

- [ ] **Step 8: Implement `readRosterRevision`**

In `src/infra/supabase/sessionCohortCloudService.ts`, replace:

```ts
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
```

with:

```ts
import type {
  RosterRevisionEntryRead,
  RosterRevisionRead,
  SessionCohortRosterGateway,
} from '@app/authorizedFormationGateways';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
```

Replace:

```ts
const TARGET_SESSION_ID_PATTERN
```

with:

```ts
function rosterRevisionFromResponse(data: unknown): RosterRevisionRead {
  const invalid = () => new Error('Invalid target roster revision response');
  const row = Array.isArray(data) ? (data.length === 1 ? data[0] : undefined) : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid();
  const value = row as Record<string, unknown>;
  if (
    typeof value.roster_revision_id !== 'string' ||
    typeof value.session_id !== 'string' ||
    !Array.isArray(value.entries)
  ) {
    throw invalid();
  }
  const entries: RosterRevisionEntryRead[] = value.entries.map((raw) => {
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.participant_id !== 'string' ||
      (entry.identity_kind !== 'PLAYER' && entry.identity_kind !== 'GUEST') ||
      !isStringOrNull(entry.player_id)
    ) {
      throw invalid();
    }
    return {
      participantId: entry.participant_id,
      identityKind: entry.identity_kind,
      playerId: entry.player_id,
    };
  });
  return { rosterRevisionId: value.roster_revision_id, sessionId: value.session_id, entries };
}

const TARGET_SESSION_ID_PATTERN
```

Replace:

```ts
): SessionCohortInspectionGateway & SessionCohortReadGateway & SessionCohortCreationGateway {
  return {
```

with:

```ts
): SessionCohortInspectionGateway &
  SessionCohortReadGateway &
  SessionCohortCreationGateway &
  SessionCohortRosterGateway {
  return {
    async readRosterRevision(rosterRevisionId) {
      const { data, error } = await client.rpc('read_target_roster_revision', {
        p_roster_revision_id: rosterRevisionId,
      });
      if (error) throw error;
      return rosterRevisionFromResponse(data);
    },
```

- [ ] **Step 9: Run both service tests, typecheck and ESLint**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/infra/supabase/sessionCohortCloudService.test.ts src/infra/supabase/registrationCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/authorizedFormationGateways.ts src/infra/supabase/registrationCloudService.ts src/infra/supabase/registrationCloudService.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts && npm run check:architecture
```

Expected: `ℹ fail 0`; typecheck silent; no ESLint errors; architecture check passes (the `.rpc(` calls live under `src/infra/supabase/`, as AF-FREEZE-004 requires).

- [ ] **Step 10: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/application/authorizedFormationGateways.ts src/infra/supabase/registrationCloudService.ts src/infra/supabase/registrationCloudService.test.ts src/infra/supabase/sessionCohortCloudService.ts src/infra/supabase/sessionCohortCloudService.test.ts && git commit -q -F - <<'EOF'
feat: servicos de nuvem da inscricao e leitura do elenco para o sorteio

Contratos de gateway da cadeia autorizada; registrationCloudService com uma
RPC por comando da W4 (inclusive reabrir e ler a janela) e validacao das
respostas; sessionCohortCloudService passa a ler a revisao de elenco com o par
participante e jogador.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Progress type and pure rules

**Files:**

- Create: `src/shared/types/authorizedFormation.ts`
- Modify: `src/types.ts` (export the new types), `src/shared/types/session.ts` (`Session.authorizedFormation`)
- Create: `src/application/authorizedTeamFormationRules.ts`
- Test: `src/application/authorizedTeamFormationRules.test.ts` (create)

**Interfaces:**

- Consumes: `RosterRevisionRead` (Task 3); `appOk`, `productError`, `offlineError`, `conflictError`, `technicalError`, `unexpectedError` from `src/application/appResult.ts`.
- Produces:
  - `AuthorizedFormationStage = 'session' | 'roster' | 'snapshot'`; `AuthorizedFormationProgress { windowId?; finalizedRosterRevisionId?; finalizedPlayerCloudIds?; snapshotId?; snapshotRosterRevisionId?; pendingCommandIds: Record<string, string> }`; `Session.authorizedFormation?: AuthorizedFormationProgress`.
  - `classifyFormationAuthority(session: Session, communities: readonly Community[]): FormationAuthority` where `FormationAuthority = { kind: 'local' } | { kind: 'authorized'; communityCloudId: string | null }`.
  - `precheckAuthorizedSelection(session: Session, players: readonly Player[]): AppResult<Player[]>`.
  - `rekeyAuthorizedRequest(request: TeamFormationRequest, roster: RosterRevisionRead, players: readonly Player[]): TeamFormationRequest | null`.
  - `class AuthorizedFormationFailure extends Error { step: string; reason: unknown; player?: Player }`.
  - `classifyAuthorizedFormationFailure(failure: AuthorizedFormationFailure): AppErrorResult`.

- [ ] **Step 1: Add the progress type**

Create `src/shared/types/authorizedFormation.ts`:

```ts
export type AuthorizedFormationStage = 'session' | 'roster' | 'snapshot';

export interface AuthorizedFormationProgress {
  readonly windowId?: string;
  readonly finalizedRosterRevisionId?: string;
  readonly finalizedPlayerCloudIds?: readonly string[];
  readonly snapshotId?: string;
  readonly snapshotRosterRevisionId?: string;
  readonly pendingCommandIds: Readonly<Record<string, string>>;
}
```

In `src/types.ts`, replace:

```ts
export {
  TEAM_FORMATION_CONTRACT_VERSION,
  TEAM_FORMATION_OBJECTIVE_POLICY,
} from './shared/types/teamFormation';
```

with:

```ts
export {
  TEAM_FORMATION_CONTRACT_VERSION,
  TEAM_FORMATION_OBJECTIVE_POLICY,
} from './shared/types/teamFormation';
export type {
  AuthorizedFormationProgress,
  AuthorizedFormationStage,
} from './shared/types/authorizedFormation';
```

In `src/shared/types/session.ts`, add `import type { AuthorizedFormationProgress } from './authorizedFormation';` after the file's last existing `import` line, then replace:

```ts
  authorityModel?: 'legacy' | 'target';
}
```

with:

```ts
  authorityModel?: 'legacy' | 'target';
  authorizedFormation?: AuthorizedFormationProgress;
}
```

Run `npm run typecheck` and `npm run check:architecture`: both pass (AF-FREEZE-002 only matches `cloudId`/`localId` field names).

- [ ] **Step 2: Write the failing rules test**

Create `src/application/authorizedTeamFormationRules.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Community, TeamFormationRequest } from '@shared/types';
import { makePlayer, makeSession } from '../test/fixtures';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
  classifyFormationAuthority,
  precheckAuthorizedSelection,
  rekeyAuthorizedRequest,
} from './authorizedTeamFormationRules';

const CLOUD = '11111111-1111-4111-8111-111111111111';
const synced: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: CLOUD,
};
const local: Community = { ...synced, id: 'community-2', cloudId: undefined };

test('authority: target, local-only, legacy-synced and synced Community Sessions', () => {
  assert.deepEqual(
    classifyFormationAuthority(makeSession('s', { communityId: 'community-1', authorityModel: 'target' }), [synced]),
    { kind: 'authorized', communityCloudId: CLOUD },
  );
  assert.deepEqual(classifyFormationAuthority(makeSession('s', { communityId: null }), [synced]), {
    kind: 'local',
  });
  assert.deepEqual(classifyFormationAuthority(makeSession('s', { communityId: 'community-2' }), [local]), {
    kind: 'local',
  });
  assert.deepEqual(
    classifyFormationAuthority(makeSession('s', { communityId: 'community-1', cloudId: 'legacy-row' }), [synced]),
    { kind: 'local' },
  );
  assert.deepEqual(classifyFormationAuthority(makeSession('s', { communityId: 'community-1' }), [synced]), {
    kind: 'authorized',
    communityCloudId: CLOUD,
  });
  assert.deepEqual(
    classifyFormationAuthority(makeSession('s', { communityId: 'gone', authorityModel: 'target' }), [synced]),
    { kind: 'authorized', communityCloudId: null },
  );
});

test('precheck keeps selection order, names unsynced Players and Players outside the Community', () => {
  const inside = { communityIds: ['community-1'] };
  const players = [
    makePlayer('a', { ...inside, cloudId: 'cloud-a' }),
    makePlayer('b', { ...inside }),
    makePlayer('c', { ...inside }),
    makePlayer('d', { communityIds: ['other'], cloudId: 'cloud-d' }),
    makePlayer('g', { ...inside, cloudId: 'cloud-g', isGuest: true }),
  ];
  const session = (ids: string[]) => makeSession('s', { communityId: 'community-1', selectedPlayerIds: ids });

  const missing = precheckAuthorizedSelection(session(['a', 'b', 'c']), players);
  assert.equal(missing.ok, false);
  assert.equal(
    !missing.ok && missing.error.message,
    'Sincronize antes de gerar os times: Atleta b e Atleta c ainda não estão na nuvem.',
  );

  const outside = precheckAuthorizedSelection(session(['a', 'd']), players);
  assert.equal(!outside.ok && outside.error.message, 'Atleta d não fazem parte desta comunidade.');

  const ok = precheckAuthorizedSelection(session(['g', 'a']), players);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.value.map((player) => player.id), ['g', 'a']);
});

test('rekey swaps participant ids for local Player ids and refuses a missing match', () => {
  const players = [makePlayer('a', { cloudId: 'CLOUD-A' }), makePlayer('b', { cloudId: 'cloud-b' })];
  const request = {
    participants: [{ participantId: 'pa' }, { participantId: 'pb' }],
    provenance: { kind: 'AUTHORIZED_SNAPSHOT', snapshotId: 'snap', inputFingerprint: 'fp' },
  } as unknown as TeamFormationRequest;
  const roster = {
    rosterRevisionId: 'r',
    sessionId: 's',
    entries: [
      { participantId: 'pa', identityKind: 'PLAYER' as const, playerId: 'cloud-a' },
      { participantId: 'pb', identityKind: 'PLAYER' as const, playerId: 'cloud-b' },
    ],
  };

  const rekeyed = rekeyAuthorizedRequest(request, roster, players);
  assert.deepEqual(rekeyed?.participants.map((p) => p.participantId), ['a', 'b']);
  assert.deepEqual(rekeyed?.provenance, request.provenance);

  assert.equal(rekeyAuthorizedRequest(request, roster, [players[0]]), null);
});

test('failure classification maps every row of the error table', () => {
  const fail = (step: string, reason: unknown, player?: ReturnType<typeof makePlayer>) =>
    classifyAuthorizedFormationFailure(new AuthorizedFormationFailure(step, reason, player)).error;
  const coded = (code: string, message = code) => Object.assign(new Error(message), { code });

  assert.deepEqual(
    [fail('createSession', coded('CLOUD_UNAVAILABLE')).kind, fail('openWindow', new TypeError('x')).kind],
    ['offline_unavailable', 'offline_unavailable'],
  );
  assert.equal(
    fail('captureSnapshot', { message: 'TypeError: Failed to fetch' }).message,
    'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
  );
  assert.equal(
    fail('createSession', coded('42501')).message,
    'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
  );
  assert.equal(
    fail('addEntry:cloud-b', coded('42501'), makePlayer('b')).message,
    'Atleta b não está no elenco da comunidade na nuvem.',
  );
  assert.equal(fail('closeWindow', coded('40001')).message, 'O elenco mudou em outro aparelho. Tente de novo.');
  assert.equal(
    fail('captureSnapshot', coded('23514', 'Roster entry references a Player without live Community standing')).message,
    'Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.',
  );
  assert.equal(
    fail('finalizeRoster', coded('23514')).message,
    'A sessão ou o elenco não estão prontos para formar times.',
  );
  assert.equal(
    fail('reopenWindow', coded('42883')).message,
    'A formação autorizada ainda não está disponível neste servidor.',
  );
  assert.equal(
    fail('rekey', new Error('x')).message,
    'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
  );
  assert.equal(
    fail('readWindow', coded('XX000')).message,
    'Não foi possível preparar os times. Verifique a conexão e tente novamente.',
  );
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/authorizedTeamFormationRules.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL — `Cannot find module './authorizedTeamFormationRules'`.

- [ ] **Step 4: Implement the rules**

Create `src/application/authorizedTeamFormationRules.ts`:

```ts
import type {
  Community,
  FormationParticipant,
  Player,
  Session,
  TeamFormationRequest,
} from '@shared/types';
import type { RosterRevisionRead } from './authorizedFormationGateways';
import {
  appOk,
  conflictError,
  offlineError,
  productError,
  technicalError,
  unexpectedError,
  type AppErrorResult,
  type AppResult,
} from './appResult';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

export type FormationAuthority =
  | { readonly kind: 'local' }
  | { readonly kind: 'authorized'; readonly communityCloudId: string | null };

export function classifyFormationAuthority(
  session: Session,
  communities: readonly Community[],
): FormationAuthority {
  const community = session.communityId
    ? communities.find((item) => item.id === session.communityId)
    : undefined;
  const communityCloudId =
    community?.cloudId && UUID_PATTERN.test(community.cloudId) ? community.cloudId : null;
  if (session.authorityModel === 'target') return { kind: 'authorized', communityCloudId };
  if (!communityCloudId) return { kind: 'local' };
  if (session.cloudId) return { kind: 'local' };
  return { kind: 'authorized', communityCloudId };
}

function displayName(player: Player): string {
  return player.apelido?.trim() || player.nome;
}

export function formatPlayerNames(players: readonly Player[]): string {
  const names = players.map(displayName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function precheckAuthorizedSelection(
  session: Session,
  players: readonly Player[],
): AppResult<Player[]> {
  const byId = new Map(players.map((player) => [player.id, player]));
  const selected = session.selectedPlayerIds
    .map((id) => byId.get(id))
    .filter((player): player is Player => player !== undefined);

  const unsynced = selected.filter((player) => !player.cloudId);
  if (unsynced.length > 0) {
    return productError(
      'invalid_input',
      `Sincronize antes de gerar os times: ${formatPlayerNames(unsynced)} ainda não estão na nuvem.`,
    );
  }

  const communityId = session.communityId ?? '';
  const outside = selected.filter((player) => !(player.communityIds ?? []).includes(communityId));
  if (outside.length > 0) {
    return productError(
      'invalid_input',
      `${formatPlayerNames(outside)} não fazem parte desta comunidade.`,
    );
  }

  return appOk(selected);
}

export function rekeyAuthorizedRequest(
  request: TeamFormationRequest,
  roster: RosterRevisionRead,
  players: readonly Player[],
): TeamFormationRequest | null {
  const localByCloudId = new Map(
    players
      .filter((player) => player.cloudId)
      .map((player) => [(player.cloudId as string).toLowerCase(), player.id]),
  );
  const localByParticipant = new Map<string, string>();
  for (const entry of roster.entries) {
    const localId = entry.playerId ? localByCloudId.get(entry.playerId.toLowerCase()) : undefined;
    if (localId) localByParticipant.set(entry.participantId, localId);
  }

  const participants: FormationParticipant[] = [];
  for (const participant of request.participants) {
    const localId = localByParticipant.get(participant.participantId);
    if (!localId) return null;
    participants.push({ ...participant, participantId: localId });
  }
  return { ...request, participants };
}

export class AuthorizedFormationFailure extends Error {
  constructor(
    readonly step: string,
    readonly reason: unknown,
    readonly player?: Player,
  ) {
    super(step);
    this.name = 'AuthorizedFormationFailure';
  }
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown };
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export function classifyAuthorizedFormationFailure(
  failure: AuthorizedFormationFailure,
): AppErrorResult {
  const code = errorCode(failure.reason);
  const message = errorMessage(failure.reason);

  if (failure.step === 'rekey') {
    return unexpectedError(
      'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
    );
  }
  if (
    code === 'CLOUD_UNAVAILABLE' ||
    failure.reason instanceof TypeError ||
    NETWORK_FAILURE.test(message)
  ) {
    return offlineError(
      'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
    );
  }
  if (code === '42501') {
    if (failure.step.startsWith('addEntry:') && failure.player) {
      return productError(
        'permission_denied',
        `${formatPlayerNames([failure.player])} não está no elenco da comunidade na nuvem.`,
      );
    }
    return productError(
      'permission_denied',
      'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
    );
  }
  if (code === '40001') {
    return conflictError('roster_revision', 'O elenco mudou em outro aparelho. Tente de novo.');
  }
  if (code === '23514' && message.includes('without live Community standing')) {
    return productError(
      'invalid_input',
      'Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.',
    );
  }
  if (code === '23514') {
    return productError('invalid_input', 'A sessão ou o elenco não estão prontos para formar times.');
  }
  if (code === 'PGRST202' || code === '42883') {
    return technicalError(
      'A formação autorizada ainda não está disponível neste servidor.',
      failure.reason,
    );
  }
  return technicalError(
    'Não foi possível preparar os times. Verifique a conexão e tente novamente.',
    failure.reason,
  );
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/authorizedTeamFormationRules.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/authorizedTeamFormationRules.ts src/application/authorizedTeamFormationRules.test.ts src/shared/types/authorizedFormation.ts src/shared/types/session.ts src/types.ts
```

Expected: `ℹ pass 4`, `ℹ fail 0`; typecheck silent; no ESLint errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/shared/types/authorizedFormation.ts src/shared/types/session.ts src/types.ts src/application/authorizedTeamFormationRules.ts src/application/authorizedTeamFormationRules.test.ts && git commit -q -F - <<'EOF'
feat: regras puras do sorteio autorizado

Progresso da cadeia guardado na Session; decisao de autoridade sem rede (toda
sessao de comunidade sincronizada e autorizada); checagem local de cloudId e
de pertencer a comunidade, sem barrar convidado; troca dos participantes do
snapshot pelos ids locais; classificacao dos erros com as mensagens em pt-BR.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The resumable chain

**Files:**

- Create: `src/application/authorizedTeamFormationUseCases.ts`
- Test: `src/application/authorizedTeamFormationUseCases.test.ts` (create)

**Interfaces:**

- Consumes: `AuthorizedFormationGateway`, `RegistrationWindowRead`, `WindowCommand`, `RosterRevisionRead` (Task 3); `AuthorizedFormationFailure`, `classifyAuthorizedFormationFailure`, `rekeyAuthorizedRequest` (Task 4); `fromAuthorizedSnapshot` from `src/application/teamFormationAdapters.ts`; infra services `sessionCohortCloudService`, `registrationCloudService`, `balanceInputSnapshotCloudService`.
- Produces:

```ts
export interface PrepareAuthorizedFormationInput {
  readonly session: Session;
  readonly communityCloudId: string | null;
  readonly players: readonly Player[];
  readonly teamCount: number;
  readonly config: SessionConfig;
  readonly createId: () => string;
  readonly onStage?: (stage: AuthorizedFormationStage) => void;
  readonly onSessionChange?: (session: Session) => void;
  readonly isCancelled?: () => boolean;
}
export interface AuthorizedFormationDraw {
  readonly request: TeamFormationRequest;
  readonly estimatedCount: number;
  readonly participantCount: number;
}
export interface PrepareAuthorizedFormationOutput {
  readonly session: Session;
  readonly result: AppResult<AuthorizedFormationDraw> | null;
}
export const defaultAuthorizedFormationGateway: AuthorizedFormationGateway;
export function prepareAuthorizedTeamFormation(
  input: PrepareAuthorizedFormationInput,
  gateway?: AuthorizedFormationGateway,
): Promise<PrepareAuthorizedFormationOutput>;
```

`result === null` means cancelled.

- [ ] **Step 1: Write the failing test with an in-memory gateway**

Create `src/application/authorizedTeamFormationUseCases.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceInputSnapshot, Player, Session } from '@shared/types';
import { makeFreePlayConfig, makePlayer, makeSession } from '../test/fixtures';
import type {
  AuthorizedFormationGateway,
  RegistrationWindowStatus,
  RosterRevisionRead,
  WindowCommand,
} from './authorizedFormationGateways';
import { prepareAuthorizedTeamFormation } from './authorizedTeamFormationUseCases';

const CLOUD = '11111111-1111-4111-8111-111111111111';
const DIMENSIONS = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
];

const coded = (code: string) => Object.assign(new Error(code), { code });

interface FakeWindow {
  sessionId: string;
  status: RegistrationWindowStatus;
  revision: number;
  capacity: number;
  confirmed: string[];
  finalized: Map<number, string>;
}

function fakeGateway(options: { sessionExists?: boolean; unknownRosterPlayers?: boolean } = {}) {
  const calls: string[] = [];
  const commandIds: Record<string, string[]> = {};
  const failures: { name: string; error: unknown; after?: boolean }[] = [];
  const receipts = new Map<string, unknown>();
  const windows = new Map<string, FakeWindow>();
  const rosters = new Map<string, RosterRevisionRead>();
  const snapshots = new Map<string, BalanceInputSnapshot>();
  let sessionExists = options.sessionExists ?? false;
  let rosterCount = 0;
  let snapshotCount = 0;

  const take = (name: string, after: boolean) => {
    const index = failures.findIndex((f) => f.name === name && !!f.after === after);
    if (index >= 0) throw failures.splice(index, 1)[0].error;
  };
  const record = (name: string, commandId?: string) => {
    calls.push(name);
    if (commandId) (commandIds[name] ??= []).push(commandId);
    take(name, false);
  };
  const replay = <T>(commandId: string, work: () => T): T => {
    if (!receipts.has(commandId)) receipts.set(commandId, work());
    return receipts.get(commandId) as T;
  };
  const windowOf = (id: string) => {
    const window = windows.get(id);
    if (!window) throw coded('P0002');
    return window;
  };
  const lifecycle =
    (name: string, status: RegistrationWindowStatus) => async (input: WindowCommand) => {
      record(name, input.commandId);
      return replay(input.commandId, () => {
        const window = windowOf(input.windowId);
        if (window.revision !== input.expectedRevision) throw coded('40001');
        window.status = status;
        window.revision += 1;
        return window.revision;
      });
    };

  const gateway: AuthorizedFormationGateway = {
    async createTargetSession(input) {
      record('createTargetSession');
      if (sessionExists) throw coded('23505');
      sessionExists = true;
      return { id: input.sessionId };
    },
    async readTargetSession(id) {
      record('readTargetSession');
      return {
        id,
        communityId: CLOUD,
        name: 'Pelada',
        sessionContext: 'COMMUNITY',
        playMode: 'FREE_PLAY',
        lifecycleStatus: 'DRAFT',
        publicationState: 'PRIVATE',
        revision: 1,
        currentRosterRevisionId: null,
      };
    },
    async readRosterRevision(id) {
      record('readRosterRevision');
      return rosters.get(id) as RosterRevisionRead;
    },
    registration: {
      async createWindow(input) {
        record('createWindow', input.commandId);
        return replay(input.commandId, () => {
          windows.set(input.windowId, {
            sessionId: input.sessionId,
            status: 'DRAFT',
            revision: 1,
            capacity: input.capacity,
            confirmed: [],
            finalized: new Map(),
          });
          return 1;
        });
      },
      openWindow: lifecycle('openWindow', 'OPEN'),
      reopenWindow: lifecycle('reopenWindow', 'OPEN'),
      closeWindow: lifecycle('closeWindow', 'CLOSED'),
      lockWindow: lifecycle('lockWindow', 'LOCKED'),
      async changeCapacity(input) {
        record('changeCapacity', input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.capacity = input.capacity;
          window.revision += 1;
          return window.revision;
        });
      },
      async addEntry(input) {
        record(`addEntry:${input.playerId}`, input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.confirmed.push(input.playerId);
          window.revision += 1;
          return window.revision;
        });
      },
      async removeEntry(input) {
        record(`removeEntry:${input.playerId}`, input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.confirmed = window.confirmed.filter((id) => id !== input.playerId);
          window.revision += 1;
          return window.revision;
        });
      },
      async finalizeRoster(input) {
        record('finalizeRoster', input.commandId);
        const value = replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          if (window.revision !== input.expectedRevision) throw coded('40001');
          const existing = window.finalized.get(window.revision);
          if (existing) return { rosterRevisionId: existing, rosterRevisionNumber: rosterCount };
          rosterCount += 1;
          const rosterRevisionId = `roster-${rosterCount}`;
          rosters.set(rosterRevisionId, {
            rosterRevisionId,
            sessionId: window.sessionId,
            entries: window.confirmed.map((playerId) => ({
              participantId: `participant-${playerId}`,
              identityKind: 'PLAYER' as const,
              playerId: options.unknownRosterPlayers ? `unknown-${playerId}` : playerId,
            })),
          });
          window.finalized.set(window.revision, rosterRevisionId);
          return { rosterRevisionId, rosterRevisionNumber: rosterCount };
        });
        take('finalizeRoster', true);
        return value;
      },
      async readWindow(id) {
        record('readWindow');
        const window = windowOf(id);
        return {
          windowId: id,
          sessionId: window.sessionId,
          status: window.status,
          revision: window.revision,
          capacity: window.capacity,
          confirmedPlayerIds: [...window.confirmed],
        };
      },
    },
    async captureSnapshot(input) {
      record('captureSnapshot', input.commandId);
      return replay(input.commandId, () => {
        snapshotCount += 1;
        const roster = rosters.get(input.rosterRevisionId) as RosterRevisionRead;
        const snapshot: BalanceInputSnapshot = {
          snapshot_id: `snapshot-${snapshotCount}`,
          session_id: input.sessionId,
          roster_revision_id: input.rosterRevisionId,
          rubric_version: 'v0-legacy-11',
          resolver_version: 'v0-global-roster-mean-5',
          global_policy_version: 'v0-equal-community-mean',
          community_policy_version: 'v0-legacy-mad-mean',
          captured_at: '2026-09-17T12:00:00.000Z',
          input_fingerprint: `fp-${snapshotCount}`,
          participants: roster.entries.map((entry) => ({
            participant_id: entry.participantId,
            identity_kind: 'PLAYER',
            display_name_at_time: entry.participantId,
            attribute_vector: Object.fromEntries(DIMENSIONS.map((key) => [key, 5])),
            estimated_dimensions: [...DIMENSIONS],
            is_estimated: true,
            source_profile_revision: null,
            height_cm: null,
            gender: null,
            primary_position: null,
            secondary_positions: [],
            is_injured: false,
          })),
        };
        snapshots.set(snapshot.snapshot_id, snapshot);
        return snapshot;
      });
    },
    async readSnapshot(id) {
      record('readSnapshot');
      return snapshots.get(id) as BalanceInputSnapshot;
    },
  };

  return { gateway, calls, commandIds, failures };
}

function athletes(ids: string[]): Player[] {
  return ids.map((id) => makePlayer(id, { cloudId: `cloud-${id}`, communityIds: ['community-1'] }));
}

function draftSession(ids: string[]): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    status: 'draft' as Session['status'],
    selectedPlayerIds: ids,
    teamIds: [],
  });
}

let idCounter = 0;
const createId = () => `id-${(idCounter += 1)}`;

async function run(
  session: Session,
  players: Player[],
  gateway: AuthorizedFormationGateway,
  extra: { onStage?: (stage: string) => void; isCancelled?: () => boolean; onSessionChange?: (s: Session) => void } = {},
) {
  return prepareAuthorizedTeamFormation(
    {
      session,
      communityCloudId: CLOUD,
      players,
      teamCount: 2,
      config: makeFreePlayConfig(),
      createId,
      ...extra,
    },
    gateway,
  );
}

test('first draw runs the whole chain in order and re-keys to local ids', async () => {
  const fake = fakeGateway();
  const stages: string[] = [];
  const output = await run(draftSession(['a', 'b', 'c', 'd']), athletes(['a', 'b', 'c', 'd']), fake.gateway, {
    onStage: (stage) => stages.push(stage),
  });

  assert.deepEqual(fake.calls, [
    'createTargetSession',
    'createWindow',
    'readWindow',
    'openWindow',
    'addEntry:cloud-a',
    'addEntry:cloud-b',
    'addEntry:cloud-c',
    'addEntry:cloud-d',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.deepEqual(stages, ['session', 'roster', 'snapshot']);
  assert.equal(output.result?.ok, true);
  const draw = output.result?.ok ? output.result.value : null;
  assert.deepEqual(draw?.request.participants.map((p) => p.participantId), ['a', 'b', 'c', 'd']);
  assert.equal(draw?.request.provenance.kind, 'AUTHORIZED_SNAPSHOT');
  assert.deepEqual([draw?.estimatedCount, draw?.participantCount], [4, 4]);
  assert.equal(output.session.cloudId, 'session-1');
  assert.equal(output.session.authorityModel, 'target');
  assert.deepEqual(output.session.authorizedFormation?.pendingCommandIds, {});
  assert.equal(output.session.authorizedFormation?.snapshotRosterRevisionId, 'roster-1');
});

test('a failure keeps the pending command id, and the retry reuses it without repeating done steps', async () => {
  const fake = fakeGateway();
  fake.failures.push({ name: 'closeWindow', error: coded('XX000') });
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  assert.equal(first.result?.ok, false);
  assert.ok(first.session.authorizedFormation?.pendingCommandIds.closeWindow);

  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.equal(fake.commandIds.closeWindow[0], fake.commandIds.closeWindow[1]);
});

test('a finalize whose response was lost is replayed, not repeated', async () => {
  const fake = fakeGateway();
  fake.failures.push({ name: 'finalizeRoster', error: coded('XX000'), after: true });
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  assert.equal(first.result?.ok, false);

  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.equal(second.session.authorizedFormation?.finalizedRosterRevisionId, 'roster-1');
});

test('regenerating with the same roster skips Registration and reuses the snapshot', async () => {
  const fake = fakeGateway();
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), ['readWindow', 'readRosterRevision', 'readSnapshot']);
});

test('changing who plays reopens, applies the diff and captures the new roster', async () => {
  const fake = fakeGateway();
  const first = await run(draftSession(['a', 'b', 'c', 'd']), athletes(['a', 'b', 'c', 'd']), fake.gateway);

  const swapped = { ...first.session, selectedPlayerIds: ['a', 'b', 'c', 'e'] };
  let before = fake.calls.length;
  const second = await run(swapped, athletes(['a', 'b', 'c', 'e']), fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'reopenWindow',
    'removeEntry:cloud-d',
    'addEntry:cloud-e',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);

  const grown = { ...second.session, selectedPlayerIds: ['a', 'b', 'c', 'e', 'f'] };
  before = fake.calls.length;
  await run(grown, athletes(['a', 'b', 'c', 'e', 'f']), fake.gateway);
  const round = fake.calls.slice(before);
  assert.ok(round.indexOf('changeCapacity') > -1);
  assert.ok(round.indexOf('changeCapacity') < round.indexOf('addEntry:cloud-f'));
});

test('one 40001 reruns the chain; a second one returns the conflict message', async () => {
  const once = fakeGateway();
  once.failures.push({ name: 'captureSnapshot', error: coded('40001') });
  const recovered = await run(draftSession(['a', 'b']), athletes(['a', 'b']), once.gateway);
  assert.equal(recovered.result?.ok, true);
  assert.equal(once.calls.filter((call) => call === 'captureSnapshot').length, 2);

  const twice = fakeGateway();
  twice.failures.push(
    { name: 'captureSnapshot', error: coded('40001') },
    { name: 'captureSnapshot', error: coded('40001') },
  );
  const conflicted = await run(draftSession(['a', 'b']), athletes(['a', 'b']), twice.gateway);
  assert.equal(
    conflicted.result?.ok === false && conflicted.result.error.message,
    'O elenco mudou em outro aparelho. Tente de novo.',
  );
});

test('23505 on create adopts the existing target Session', async () => {
  const fake = fakeGateway({ sessionExists: true });
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway);
  assert.equal(output.result?.ok, true);
  assert.deepEqual(fake.calls.slice(0, 3), ['createTargetSession', 'readTargetSession', 'createWindow']);
});

test('a roster the device cannot map is refused as unexpected', async () => {
  const fake = fakeGateway({ unknownRosterPlayers: true });
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway);
  assert.equal(output.result?.ok === false && output.result.error.kind, 'unexpected');
});

test('cancelling stops between steps and returns null with the progress so far', async () => {
  const fake = fakeGateway();
  let cancelled = false;
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway, {
    onStage: (stage) => {
      if (stage === 'roster') cancelled = true;
    },
    isCancelled: () => cancelled,
  });
  assert.equal(output.result, null);
  assert.equal(output.session.authorityModel, 'target');
  assert.deepEqual(fake.calls, ['createTargetSession', 'createWindow']);
});

test('the Window id is reported before create_registration_window runs', async () => {
  const fake = fakeGateway();
  let callsWhenWindowIdAppeared: string[] | null = null;
  await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway, {
    onSessionChange: (session) => {
      if (session.authorizedFormation?.windowId && callsWhenWindowIdAppeared === null) {
        callsWhenWindowIdAppeared = [...fake.calls];
      }
    },
  });
  assert.deepEqual(callsWhenWindowIdAppeared, ['createTargetSession']);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/authorizedTeamFormationUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL — `Cannot find module './authorizedTeamFormationUseCases'`.

- [ ] **Step 3: Implement the chain**

Create `src/application/authorizedTeamFormationUseCases.ts`:

```ts
import type {
  AuthorizedFormationProgress,
  AuthorizedFormationStage,
  BalanceInputSnapshot,
  Player,
  Session,
  SessionConfig,
  TeamFormationRequest,
} from '@shared/types';
import { balanceInputSnapshotCloudService } from '@infra/supabase/balanceInputSnapshotCloudService';
import { registrationCloudService } from '@infra/supabase/registrationCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { appOk, type AppResult } from './appResult';
import type {
  AuthorizedFormationGateway,
  RegistrationWindowRead,
  WindowCommand,
} from './authorizedFormationGateways';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
  rekeyAuthorizedRequest,
} from './authorizedTeamFormationRules';
import { fromAuthorizedSnapshot } from './teamFormationAdapters';

export interface PrepareAuthorizedFormationInput {
  readonly session: Session;
  readonly communityCloudId: string | null;
  readonly players: readonly Player[];
  readonly teamCount: number;
  readonly config: SessionConfig;
  readonly createId: () => string;
  readonly onStage?: (stage: AuthorizedFormationStage) => void;
  readonly onSessionChange?: (session: Session) => void;
  readonly isCancelled?: () => boolean;
}

export interface AuthorizedFormationDraw {
  readonly request: TeamFormationRequest;
  readonly estimatedCount: number;
  readonly participantCount: number;
}

export interface PrepareAuthorizedFormationOutput {
  readonly session: Session;
  readonly result: AppResult<AuthorizedFormationDraw> | null;
}

export const defaultAuthorizedFormationGateway: AuthorizedFormationGateway = {
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  readTargetSession: (id) => sessionCohortCloudService.readTargetSession(id),
  readRosterRevision: (id) => sessionCohortCloudService.readRosterRevision(id),
  registration: registrationCloudService,
  captureSnapshot: (input) => balanceInputSnapshotCloudService.capture(input),
  readSnapshot: (id) => balanceInputSnapshotCloudService.read(id),
};

class ChainCancelled extends Error {}

const EMPTY_PROGRESS: AuthorizedFormationProgress = { pendingCommandIds: {} };

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left.map((id) => id.toLowerCase()));
  const b = new Set(right.map((id) => id.toLowerCase()));
  return a.size === b.size && [...a].every((id) => b.has(id));
}

export async function prepareAuthorizedTeamFormation(
  input: PrepareAuthorizedFormationInput,
  gateway: AuthorizedFormationGateway = defaultAuthorizedFormationGateway,
): Promise<PrepareAuthorizedFormationOutput> {
  let session = input.session;
  let progress: AuthorizedFormationProgress = session.authorizedFormation ?? EMPTY_PROGRESS;
  const playerCloudIds = input.players.map((player) => player.cloudId as string);

  const commit = (next: Partial<AuthorizedFormationProgress>, patch: Partial<Session> = {}) => {
    progress = { ...progress, ...next };
    session = { ...session, ...patch, authorizedFormation: progress };
    input.onSessionChange?.(session);
  };

  const checkCancelled = () => {
    if (input.isCancelled?.()) throw new ChainCancelled();
  };

  const step = async <T>(key: string, work: () => Promise<T>, player?: Player): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ChainCancelled) throw error;
      throw new AuthorizedFormationFailure(key, error, player);
    }
  };

  const command = async <T>(
    key: string,
    work: (commandId: string) => Promise<T>,
    player?: Player,
  ): Promise<T> => {
    const commandId = progress.pendingCommandIds[key] ?? input.createId();
    commit({ pendingCommandIds: { ...progress.pendingCommandIds, [key]: commandId } });
    const value = await step(key, () => work(commandId), player);
    const { [key]: _done, ...pending } = progress.pendingCommandIds;
    commit({ pendingCommandIds: pending });
    checkCancelled();
    return value;
  };

  const ensureTargetSession = async (): Promise<string> => {
    if (session.authorityModel === 'target' && session.cloudId) return session.cloudId;
    if (!input.communityCloudId) {
      throw new AuthorizedFormationFailure('createSession', new Error('Community is not synced'));
    }
    input.onStage?.('session');
    let cloudId: string;
    try {
      cloudId = (
        await gateway.createTargetSession({
          sessionId: session.id,
          communityId: input.communityCloudId,
          name: session.name,
          playMode: session.type === 'tournament' ? 'STRUCTURED_MATCHES' : 'FREE_PLAY',
        })
      ).id;
    } catch (error) {
      if (codeOf(error) !== '23505') throw new AuthorizedFormationFailure('createSession', error);
      cloudId = (await step('createSession', () => gateway.readTargetSession(session.id))).id;
    }
    commit({}, { cloudId, authorityModel: 'target' });
    checkCancelled();
    return cloudId;
  };

  const readWindow = async (windowId: string): Promise<RegistrationWindowRead | null> => {
    try {
      return await gateway.registration.readWindow(windowId);
    } catch (error) {
      if (codeOf(error) === 'P0002') return null;
      throw new AuthorizedFormationFailure('readWindow', error);
    }
  };

  const syncRegistration = async (sessionCloudId: string): Promise<string> => {
    input.onStage?.('roster');
    let windowId = progress.windowId;
    let window: RegistrationWindowRead | null = null;
    if (windowId) {
      window = await readWindow(windowId);
    } else {
      windowId = input.createId();
      commit({ windowId });
    }
    const id = windowId;

    if (!window) {
      await command('createWindow', (commandId) =>
        gateway.registration.createWindow({
          commandId,
          windowId: id,
          sessionId: sessionCloudId,
          capacity: playerCloudIds.length,
        }),
      );
      window = await readWindow(id);
      if (!window) {
        throw new AuthorizedFormationFailure('readWindow', new Error('Registration Window missing'));
      }
    }

    const confirmed = window.confirmedPlayerIds;
    const differs = !sameMembers(confirmed, playerCloudIds);
    if (window.status === 'LOCKED' && !differs && progress.finalizedRosterRevisionId) {
      return progress.finalizedRosterRevisionId;
    }

    let status = window.status;
    let revision = window.revision;
    const lifecycle = <T>(key: string, run: (windowCommand: WindowCommand) => Promise<T>) =>
      command(key, (commandId) => run({ commandId, windowId: id, expectedRevision: revision }));

    if (status === 'DRAFT') {
      revision = await lifecycle('openWindow', (c) => gateway.registration.openWindow(c));
      status = 'OPEN';
    }
    if ((status === 'CLOSED' || status === 'LOCKED') && differs) {
      revision = await lifecycle('reopenWindow', (c) => gateway.registration.reopenWindow(c));
      status = 'OPEN';
    }
    if (status === 'OPEN') {
      const selected = new Set(playerCloudIds.map((cloudId) => cloudId.toLowerCase()));
      const confirmedSet = new Set(confirmed.map((cloudId) => cloudId.toLowerCase()));
      for (const playerId of confirmed.filter((cloudId) => !selected.has(cloudId.toLowerCase()))) {
        revision = await command(`removeEntry:${playerId}`, (commandId) =>
          gateway.registration.removeEntry({
            commandId,
            windowId: id,
            playerId,
            reason: 'ORGANIZER_DESELECTED',
          }),
        );
      }
      if (window.capacity !== playerCloudIds.length) {
        revision = await command('changeCapacity', (commandId) =>
          gateway.registration.changeCapacity({
            commandId,
            windowId: id,
            capacity: playerCloudIds.length,
          }),
        );
      }
      for (const player of input.players) {
        const cloudId = player.cloudId as string;
        if (confirmedSet.has(cloudId.toLowerCase())) continue;
        revision = await command(
          `addEntry:${cloudId}`,
          (commandId) =>
            gateway.registration.addEntry({
              commandId,
              entryId: input.createId(),
              windowId: id,
              playerId: cloudId,
            }),
          player,
        );
      }
      revision = await lifecycle('closeWindow', (c) => gateway.registration.closeWindow(c));
      status = 'CLOSED';
    }
    if (status === 'CLOSED') {
      revision = await lifecycle('lockWindow', (c) => gateway.registration.lockWindow(c));
    }
    const finalized = await lifecycle('finalizeRoster', (c) => gateway.registration.finalizeRoster(c));
    commit({
      finalizedRosterRevisionId: finalized.rosterRevisionId,
      finalizedPlayerCloudIds: playerCloudIds,
    });
    return finalized.rosterRevisionId;
  };

  const capture = async (sessionCloudId: string, rosterRevisionId: string) => {
    input.onStage?.('snapshot');
    const roster = await step('readRoster', () => gateway.readRosterRevision(rosterRevisionId));
    checkCancelled();
    let snapshot: BalanceInputSnapshot;
    if (progress.snapshotId && progress.snapshotRosterRevisionId === rosterRevisionId) {
      const snapshotId = progress.snapshotId;
      snapshot = await step('readSnapshot', () => gateway.readSnapshot(snapshotId));
    } else {
      snapshot = await command('captureSnapshot', (commandId) =>
        gateway.captureSnapshot({ commandId, sessionId: sessionCloudId, rosterRevisionId }),
      );
      commit({ snapshotId: snapshot.snapshot_id, snapshotRosterRevisionId: rosterRevisionId });
    }
    checkCancelled();
    return { roster, snapshot };
  };

  const attempt = async (): Promise<AuthorizedFormationDraw> => {
    checkCancelled();
    const sessionCloudId = await ensureTargetSession();
    const rosterRevisionId = await syncRegistration(sessionCloudId);
    const { roster, snapshot } = await capture(sessionCloudId, rosterRevisionId);
    const request = rekeyAuthorizedRequest(
      fromAuthorizedSnapshot({ snapshot, teamCount: input.teamCount, config: input.config }),
      roster,
      input.players,
    );
    if (!request) {
      throw new AuthorizedFormationFailure('rekey', new Error('Participant without local Player'));
    }
    return {
      request,
      estimatedCount: snapshot.participants.filter((participant) => participant.is_estimated).length,
      participantCount: snapshot.participants.length,
    };
  };

  for (let attemptIndex = 0; ; attemptIndex += 1) {
    try {
      const draw = await attempt();
      return { session, result: appOk(draw) };
    } catch (error) {
      if (error instanceof ChainCancelled) return { session, result: null };
      const failure =
        error instanceof AuthorizedFormationFailure
          ? error
          : new AuthorizedFormationFailure('buildRequest', error);
      if (attemptIndex === 0 && codeOf(failure.reason) === '40001') {
        const { [failure.step]: _stale, ...pending } = progress.pendingCommandIds;
        commit({
          pendingCommandIds: pending,
          finalizedRosterRevisionId: undefined,
          snapshotId: undefined,
          snapshotRosterRevisionId: undefined,
        });
        continue;
      }
      return { session, result: classifyAuthorizedFormationFailure(failure) };
    }
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/authorizedTeamFormationUseCases.test.ts > /tmp/w608c-chain-unit.log 2>&1; grep -E "^ℹ (pass|fail)" /tmp/w608c-chain-unit.log; grep -A20 "✖ failing" /tmp/w608c-chain-unit.log | head -60
```

Expected: `ℹ pass 10`, `ℹ fail 0`.

- [ ] **Step 5: Typecheck, ESLint, architecture**

```bash
cd /c/Volley-xs-w6-08 && npm run typecheck && npx eslint --quiet src/application/authorizedTeamFormationUseCases.ts src/application/authorizedTeamFormationUseCases.test.ts && npm run check:architecture
```

Expected: all pass. If ESLint flags the `_done` / `_stale` rest-destructuring names, follow the pattern `useSessionWizard.ts` already uses (`{ generation: _cleared, ...rest }`) and check `eslint.config.js` for the configured ignore pattern before renaming.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/application/authorizedTeamFormationUseCases.ts src/application/authorizedTeamFormationUseCases.test.ts && git commit -q -F - <<'EOF'
feat: cadeia retomavel do sorteio autorizado

prepareAuthorizedTeamFormation cria ou adota a Session target, sincroniza a
inscricao pela diferenca lida no servidor, finaliza o elenco, captura ou
reaproveita o snapshot e troca os participantes pelos ids locais. Cada comando
guarda o id antes de chamar, entao repetir retoma pelo recibo; 40001 roda a
cadeia de novo uma vez; cancelar devolve null com o progresso salvo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Run the chain from `useSessionWizard`

**Files:**

- Modify: `src/hooks/useSessionWizard.ts` (imports, props, state, `generateDivisions`, `cancelGeneration`, `cancelWizard`, return)
- Modify: `src/app/AppShell.tsx` (pass `communities`)
- Test: `src/hooks/useSessionWizard.spec.tsx` (module mock, `renderWizard` options, new `describe`)

**Interfaces:**

- Consumes: `classifyFormationAuthority`, `precheckAuthorizedSelection` (Task 4); `prepareAuthorizedTeamFormation`, `PrepareAuthorizedFormationOutput` (Task 5); `AuthorizedFormationGateway` (Task 3); `DivisionGenerationPlan`, `buildSessionPatchResult`, `buildDivisionGenerationCancelApplicationResult` from `src/application/sessionLifecycleUseCases.ts`.
- Produces: `useSessionWizard` props `communities?: Community[]` and `authorizedFormationGateway?: AuthorizedFormationGateway`; returned `generationStage: AuthorizedFormationStage | null` and `authorizedDraw: { estimatedCount: number; participantCount: number } | null`.

- [ ] **Step 1: Write the failing hook tests**

In `src/hooks/useSessionWizard.spec.tsx`, replace:

```tsx
import { makePlayer, makeSession } from '../test/fixtures';
import type { Player, Session } from '../types';
import { useSessionWizard } from './useSessionWizard';

const fallbackControl = vi.hoisted(() => ({ error: null as Error | null }));
```

with:

```tsx
import { fromLocalSnapshots } from '../application/teamFormationAdapters';
import { mapPlayersToBalanceSnapshots } from '../logic/balancingCompatibility';
import { makePlayer, makeSession } from '../test/fixtures';
import type { Community, Player, Session } from '../types';
import { useSessionWizard } from './useSessionWizard';

const fallbackControl = vi.hoisted(() => ({ error: null as Error | null }));
const chain = vi.hoisted(() => ({ prepare: vi.fn() }));

vi.mock('../application/authorizedTeamFormationUseCases', () => ({
  prepareAuthorizedTeamFormation: chain.prepare,
}));
```

Replace:

```tsx
function renderWizard(activeSession: Session, players: Player[]) {
  return renderHook(() =>
    useSessionWizard({
      players,
      activeSession,
      setActiveSession: vi.fn(),
```

with:

```tsx
function renderWizard(
  activeSession: Session,
  players: Player[],
  extra: { communities?: Community[]; setActiveSession?: (session: Session | null) => void } = {},
) {
  return renderHook(() =>
    useSessionWizard({
      players,
      activeSession,
      communities: extra.communities,
      setActiveSession: extra.setActiveSession ?? vi.fn(),
```

Append at the end of the file:

```tsx
const COMMUNITY: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: '11111111-1111-4111-8111-111111111111',
};

function syncedPlayers(): Player[] {
  return ['a', 'b', 'c', 'd'].map((id) =>
    makePlayer(id, { cloudId: `cloud-${id}`, communityIds: ['community-1'] }),
  );
}

function communitySession(players: Player[]): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    selectedPlayerIds: players.map((player) => player.id),
    config: { ...makeSession('config-source').config!, balanceSpeed: 'fast' },
  });
}

function authorizedRequest(players: readonly Player[]) {
  return {
    ...fromLocalSnapshots({ snapshots: mapPlayersToBalanceSnapshots([...players], {}), teamCount: 2 }),
    provenance: { kind: 'AUTHORIZED_SNAPSHOT' as const, snapshotId: 'snap', inputFingerprint: 'fp' },
  };
}

describe('useSessionWizard authorized formation', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    fallbackControl.error = null;
    chain.prepare.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a local Session on the synchronous path without calling the chain', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const session = makeSession('session-1', {
      selectedPlayerIds: players.map((player) => player.id),
      config: { ...makeSession('config-source').config!, balanceSpeed: 'fast' },
    });
    const { result } = renderWizard(session, players, { communities: [COMMUNITY] });

    act(() => result.current.generateDivisions());

    expect(FakeWorker.instances[0].postedMessages).toHaveLength(1);
    expect(chain.prepare).not.toHaveBeenCalled();
    expect(result.current.authorizedDraw).toBeNull();
  });

  it('draws a synced Community Session from the authorized request', async () => {
    const players = syncedPlayers();
    const setActiveSession = vi.fn();
    chain.prepare.mockImplementation(async (input) => {
      input.onStage?.('roster');
      return {
        session: { ...input.session, cloudId: 'session-1', authorityModel: 'target' },
        result: {
          ok: true,
          value: { request: authorizedRequest(input.players), estimatedCount: 4, participantCount: 4 },
        },
      };
    });
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
      setActiveSession,
    });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(chain.prepare).toHaveBeenCalledTimes(1);
    expect(chain.prepare.mock.calls[0][0].communityCloudId).toBe(COMMUNITY.cloudId);
    const posted = FakeWorker.instances[0].postedMessages[0];
    expect(posted.request.provenance.kind).toBe('AUTHORIZED_SNAPSHOT');
    expect(result.current.authorizedDraw).toEqual({ estimatedCount: 4, participantCount: 4 });
    expect(result.current.generationStage).toBeNull();
    expect(setActiveSession).toHaveBeenCalled();
  });

  it('shows the chain error and starts no Worker', async () => {
    const players = syncedPlayers();
    chain.prepare.mockImplementation(async (input) => ({
      session: input.session,
      result: {
        ok: false,
        error: {
          kind: 'product',
          code: 'permission_denied',
          message: 'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
          recoverable: false,
        },
      },
    }));
    const { result } = renderWizard(communitySession(players), players, { communities: [COMMUNITY] });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.validationErrors.generation).toBe(
      'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
    );
  });

  it('refuses an unsynced Player before calling the chain', async () => {
    const players = [...syncedPlayers().slice(0, 3), makePlayer('d', { communityIds: ['community-1'] })];
    const { result } = renderWizard(communitySession(players), players, { communities: [COMMUNITY] });

    await act(async () => {
      result.current.generateDivisions();
    });

    expect(chain.prepare).not.toHaveBeenCalled();
    expect(result.current.validationErrors.generation).toBe(
      'Sincronize antes de gerar os times: Atleta d ainda não estão na nuvem.',
    );
  });

  it('cancelling while preparing starts no Worker even if the chain later succeeds', async () => {
    const players = syncedPlayers();
    let resolve!: (value: unknown) => void;
    chain.prepare.mockImplementation(
      (input) =>
        new Promise((done) => {
          resolve = () =>
            done({
              session: input.session,
              result: {
                ok: true,
                value: { request: authorizedRequest(input.players), estimatedCount: 0, participantCount: 4 },
              },
            });
        }),
    );
    const { result } = renderWizard(communitySession(players), players, { communities: [COMMUNITY] });

    act(() => result.current.generateDivisions());
    expect(result.current.isGenerating).toBe(true);
    act(() => result.current.cancelGeneration());
    await act(async () => {
      resolve(undefined);
    });

    expect(FakeWorker.instances).toHaveLength(0);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generationStage).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch the new tests fail**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | head -12
```

Expected: the four authorized/precheck/cancel tests fail (`chain.prepare` never called, `authorizedDraw` undefined); every pre-existing test and the local-Session test pass.

- [ ] **Step 3: Wire the chain into the hook**

In `src/hooks/useSessionWizard.ts`, replace:

```ts
import { Session, Player, Team, Division, Game } from '../types';
```

with:

```ts
import { Session, Player, Team, Division, Game, Community } from '../types';
import type { AuthorizedFormationStage } from '../types';
import type { AuthorizedFormationGateway } from '../application/authorizedFormationGateways';
import {
  classifyFormationAuthority,
  precheckAuthorizedSelection,
} from '../application/authorizedTeamFormationRules';
import { prepareAuthorizedTeamFormation } from '../application/authorizedTeamFormationUseCases';
import type { DivisionGenerationPlan } from '../application/sessionLifecycleUseCases';
```

Replace:

```ts
  sessions: Session[];
  teams: Team[];
}
```

with:

```ts
  sessions: Session[];
  teams: Team[];
  communities?: Community[];
  authorizedFormationGateway?: AuthorizedFormationGateway;
}
```

Replace:

```ts
  sessions,
  teams,
}: UseSessionWizardProps) {
```

with:

```ts
  sessions,
  teams,
  communities = [],
  authorizedFormationGateway,
}: UseSessionWizardProps) {
```

Replace:

```ts
  const workerRef = useRef<Worker | null>(null);
```

with:

```ts
  const workerRef = useRef<Worker | null>(null);
  const [generationStage, setGenerationStage] = useState<AuthorizedFormationStage | null>(null);
  const [authorizedDraw, setAuthorizedDraw] = useState<{
    estimatedCount: number;
    participantCount: number;
  } | null>(null);
  const preparationRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(activeSession?.id ?? null);

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
  }, [activeSession?.id]);
```

Replace:

```ts
  const generateDivisions = (advanceStep = true) => {
    const plan = buildDivisionGenerationPlan({
      activeSession,
      players,
      seed: Math.floor(Math.random() * 1000000),
      partnershipMatrix,
    });
    if (!plan) return;

    // A retry starts clean. Leaving the previous generation error on screen made a
    // successful second attempt still look failed.
    setValidationErrors((current) => {
      if (current.generation === undefined) return current;
      const { generation: _cleared, ...rest } = current;
      return rest;
    });

    updateSession(plan.sessionPatch);

    const finish = (divisions: Division[]) => {
```

with:

```ts
  const clearGenerationError = () =>
    setValidationErrors((current) => {
      if (current.generation === undefined) return current;
      const { generation: _cleared, ...rest } = current;
      return rest;
    });

  const startBalancing = (plan: DivisionGenerationPlan, advanceStep: boolean) => {
    const finish = (divisions: Division[]) => {
```

Replace:

```ts
    worker.postMessage(start.message);
  };

  const cancelGeneration = () => {
    const result = buildDivisionGenerationCancelApplicationResult(workerRef.current);
```

with:

```ts
    worker.postMessage(start.message);
  };

  const stopGenerationWithError = (message: string) => {
    setGenerationStage(null);
    applyGenerationStatusState(
      buildDivisionGenerationCancelApplicationResult(null).generationStatus,
    );
    setValidationErrors((current) => ({ ...current, generation: message }));
  };

  const prepareAndBalance = async (
    plan: DivisionGenerationPlan,
    advanceStep: boolean,
    session: Session,
    communityCloudId: string | null,
    selectedPlayers: Player[],
  ) => {
    const token = preparationRef.current + 1;
    preparationRef.current = token;
    const isCancelled = () => preparationRef.current !== token;
    terminateWorker(workerRef.current);
    applyGenerationStatusState({ nextIsGenerating: true, nextProgress: 0 });
    setGenerationStage('session');

    const output = await prepareAuthorizedTeamFormation(
      {
        session,
        communityCloudId,
        players: selectedPlayers,
        teamCount: plan.updatedConfig.teamCount,
        config: plan.updatedConfig,
        createId: generateUUID,
        onStage: (stage) => {
          if (!isCancelled()) setGenerationStage(stage);
        },
        onSessionChange: (next) => {
          if (activeSessionIdRef.current === next.id) setActiveSession(next);
        },
        isCancelled,
      },
      authorizedFormationGateway,
    );

    if (isCancelled() || output.result === null) return;
    setGenerationStage(null);
    if (!output.result.ok) {
      stopGenerationWithError(output.result.error.message);
      return;
    }
    setAuthorizedDraw({
      estimatedCount: output.result.value.estimatedCount,
      participantCount: output.result.value.participantCount,
    });
    startBalancing(
      { ...plan, request: { ...plan.request, request: output.result.value.request } },
      advanceStep,
    );
  };

  const generateDivisions = (advanceStep = true) => {
    const plan = buildDivisionGenerationPlan({
      activeSession,
      players,
      seed: Math.floor(Math.random() * 1000000),
      partnershipMatrix,
    });
    if (!plan || !activeSession) return;

    clearGenerationError();

    const authority = classifyFormationAuthority(activeSession, communities);
    if (authority.kind === 'local') {
      setAuthorizedDraw(null);
      updateSession(plan.sessionPatch);
      startBalancing(plan, advanceStep);
      return;
    }

    const session =
      buildSessionPatchResult({
        activeSession,
        patch: plan.sessionPatch,
        now: new Date().toISOString(),
      }) ?? activeSession;
    setActiveSession(session);

    const precheck = precheckAuthorizedSelection(session, players);
    if (!precheck.ok) {
      stopGenerationWithError(precheck.error.message);
      return;
    }
    void prepareAndBalance(plan, advanceStep, session, authority.communityCloudId, precheck.value);
  };

  const cancelGeneration = () => {
    preparationRef.current += 1;
    setGenerationStage(null);
    const result = buildDivisionGenerationCancelApplicationResult(workerRef.current);
```

Replace:

```ts
  const cancelWizard = () => {
    const request = buildWizardCancelRequestResult();
```

with:

```ts
  const cancelWizard = () => {
    preparationRef.current += 1;
    const request = buildWizardCancelRequestResult();
```

Replace:

```ts
    isGenerating,
    progress,
    nextStep,
```

with:

```ts
    isGenerating,
    progress,
    generationStage,
    authorizedDraw,
    nextStep,
```

In `src/app/AppShell.tsx`, replace:

```ts
    sessions: sess.sessions,
    teams: sess.teams,
  });
```

with:

```ts
    sessions: sess.sessions,
    teams: sess.teams,
    communities: comm.communities,
  });
```

- [ ] **Step 4: Run the hook spec, typecheck and ESLint**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/hooks/useSessionWizard.ts src/hooks/useSessionWizard.spec.tsx src/app/AppShell.tsx
```

Expected: all hook tests pass; typecheck silent; no ESLint errors. If typecheck reports `SessionWizardHookApi` missing the new fields, that is Task 7's change — add only the two fields to `SessionWizardHookApi` now (`generationStage: AuthorizedFormationStage | null; authorizedDraw: { estimatedCount: number; participantCount: number } | null;`) and leave the model/screen to Task 7.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/hooks/useSessionWizard.ts src/hooks/useSessionWizard.spec.tsx src/app/AppShell.tsx src/application/screens/sessionWizard/sessionWizardContract.ts && git commit -q -F - <<'EOF'
feat: wizard gera times pela cadeia autorizada em sessao de comunidade

Sessao local segue o caminho de hoje, sincrono. Sessao de comunidade
sincronizada passa pela checagem local e pela cadeia autorizada antes do
Worker, que recebe o pedido do snapshot; erro vai para o alerta e nao inicia
Worker; cancelar durante a preparacao descarta o resultado; o progresso da
cadeia so volta para a activeSession se ela ainda for a mesma Session.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Stages, provenance and estimated counts on screen

**Files:**

- Create: `src/components/session/SessionGenerationStatus.tsx`
- Test: `src/components/session/SessionGenerationStatus.spec.tsx` (create)
- Modify: `src/application/screens/sessionWizard/sessionWizardContract.ts`, `src/application/screens/sessionWizard/sessionWizardModel.ts`
- Test: `src/application/screens/sessionWizard/sessionWizardContract.test.ts` (base hook api + one test)
- Modify: `src/components/session/SessionWizard.tsx` (imports, model destructuring, Review-step status block, results step)

**Interfaces:**

- Consumes: hook fields `generationStage`, `authorizedDraw` (Task 6).
- Produces: `SessionGenerationStatus({ stage, progress, onCancel })`; `SessionWizardHookApi` and `SessionWizardModel` gain `generationStage: AuthorizedFormationStage | null` and `authorizedDraw: { estimatedCount: number; participantCount: number } | null`.

- [ ] **Step 1: Write the failing component spec**

Create `src/components/session/SessionGenerationStatus.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionGenerationStatus } from './SessionGenerationStatus';

describe('SessionGenerationStatus', () => {
  it('shows the chain stage with an indeterminate bar and no percentage', () => {
    const { container } = render(
      <SessionGenerationStatus stage="roster" progress={0} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Confirmando o elenco…')).toBeDefined();
    expect(screen.queryByText('0%')).toBeNull();
    expect(container.querySelector('progress')?.hasAttribute('value')).toBe(false);
  });

  it('shows balancing with the percentage once the chain is done', () => {
    const { container } = render(
      <SessionGenerationStatus stage={null} progress={40} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Equilibrando os times…')).toBeDefined();
    expect(screen.getByText('40%')).toBeDefined();
    expect(container.querySelector('progress')?.getAttribute('value')).toBe('40');
  });

  it('cancels', () => {
    const onCancel = vi.fn();
    render(<SessionGenerationStatus stage="session" progress={0} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/session/SessionGenerationStatus.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Expected: FAIL — `Failed to resolve import "./SessionGenerationStatus"`.

- [ ] **Step 3: Implement the component**

Create `src/components/session/SessionGenerationStatus.tsx`:

```tsx
import { Sparkles, X } from 'lucide-react';
import type { AuthorizedFormationStage } from '../../types';

const STAGE_TEXT: Record<AuthorizedFormationStage, string> = {
  session: 'Preparando a sessão na nuvem…',
  roster: 'Confirmando o elenco…',
  snapshot: 'Congelando as notas dos atletas…',
};

interface SessionGenerationStatusProps {
  stage: AuthorizedFormationStage | null;
  progress: number;
  onCancel: () => void;
}

export function SessionGenerationStatus({ stage, progress, onCancel }: SessionGenerationStatusProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" />
          <span>{stage ? STAGE_TEXT[stage] : 'Equilibrando os times…'}</span>
        </p>
        {!stage && (
          <span className="text-[10px] font-mono font-bold text-accent">{progress}%</span>
        )}
      </div>
      {stage ? (
        <progress className="progress progress-accent w-full" aria-label={STAGE_TEXT[stage]} />
      ) : (
        <progress className="progress progress-accent w-full" value={progress} max={100} />
      )}
      <p className="text-[9px] text-text-muted/80 uppercase font-semibold leading-normal mt-1 p-3 bg-neutral/30 rounded-xl border border-base-300">
        {stage
          ? 'Registrando o elenco e as notas autorizadas da comunidade antes do sorteio.'
          : 'ℹ️ Estamos testando milhares de combinações para achar o time mais equilibrado. Isso pode levar alguns segundos — quanto maior o grupo, um pouquinho mais.'}
      </p>
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm w-full text-xs">
        <X className="w-3.5 h-3.5" /> Cancelar
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/session/SessionGenerationStatus.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests "
```

Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Write the failing contract test**

In `src/application/screens/sessionWizard/sessionWizardContract.test.ts`, replace:

```ts
    isGenerating: false,
    progress: 0,
```

with:

```ts
    isGenerating: false,
    progress: 0,
    generationStage: null,
    authorizedDraw: null,
```

Append:

```ts
test('o modelo expoe a etapa da cadeia e as contagens do sorteio autorizado', () => {
  const c = buildSessionWizardContract(
    makeInput(
      makeHookApi({
        generationStage: 'snapshot' as never,
        authorizedDraw: { estimatedCount: 3, participantCount: 8 } as never,
      }),
    ),
  );
  assert.equal(c.model.generationStage, 'snapshot');
  assert.deepEqual(c.model.authorizedDraw, { estimatedCount: 3, participantCount: 8 });
});
```

Run: `cd /c/Volley-xs-w6-08 && node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` — Expected: `ℹ fail 1` (the new test: `undefined !== 'snapshot'`).

- [ ] **Step 6: Carry the fields through the contract and model**

In `src/application/screens/sessionWizard/sessionWizardModel.ts`, replace:

```ts
import type { Community, Division, Player, Session } from '@shared/types';
```

with:

```ts
import type {
  AuthorizedFormationStage,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
```

and replace:

```ts
  generationProgress: number;
```

with:

```ts
  generationProgress: number;
  generationStage: AuthorizedFormationStage | null;
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
```

In `src/application/screens/sessionWizard/sessionWizardContract.ts`, replace:

```ts
import type { Community, Division, Player, Session } from '@shared/types';
```

with:

```ts
import type {
  AuthorizedFormationStage,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
```

replace (skip if Task 6 Step 4 already added these two lines):

```ts
  isGenerating: boolean;
  progress: number;
```

with:

```ts
  isGenerating: boolean;
  progress: number;
  generationStage: AuthorizedFormationStage | null;
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
```

and replace:

```ts
    generationProgress: h.progress,
```

with:

```ts
    generationProgress: h.progress,
    generationStage: h.generationStage,
    authorizedDraw: h.authorizedDraw,
```

Run the contract test again: `ℹ fail 0`.

- [ ] **Step 7: Use them in `SessionWizard.tsx`**

Replace:

```tsx
import { SessionWizardProgress } from './SessionWizardProgress';
```

with:

```tsx
import { SessionGenerationStatus } from './SessionGenerationStatus';
import { SessionWizardProgress } from './SessionWizardProgress';
```

Replace:

```tsx
    isGenerating,
    generationProgress,
    partnershipMatrix,
```

with:

```tsx
    isGenerating,
    generationProgress,
    generationStage,
    authorizedDraw,
    partnershipMatrix,
```

Replace the Review-step status block:

```tsx
            {isGenerating ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" /> Equilibrando os
                    times…
                  </p>
                  <span className="text-[10px] font-mono font-bold text-accent">
                    {generationProgress}%
                  </span>
                </div>
                <progress
                  className="progress progress-accent w-full"
                  value={generationProgress}
                  max={100}
                />
                <p className="text-[9px] text-text-muted/80 uppercase font-semibold leading-normal mt-1 p-3 bg-neutral/30 rounded-xl border border-base-300">
                  ℹ️ Estamos testando milhares de combinações para achar o time mais equilibrado.
                  Isso pode levar alguns segundos — quanto maior o grupo, um pouquinho mais.
                </p>
                <button
                  type="button"
                  onClick={() => dispatch({ kind: 'cancelGeneration' })}
                  className="btn btn-ghost btn-sm w-full text-xs"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            ) : (
```

with:

```tsx
            {isGenerating ? (
              <SessionGenerationStatus
                stage={generationStage}
                progress={generationProgress}
                onCancel={() => dispatch({ kind: 'cancelGeneration' })}
              />
            ) : (
```

In the results step, replace:

```tsx
            {estimatedCount > 0 && (
              <div className="space-y-2">
                <div role="alert" className="alert alert-warning alert-soft p-2 items-start">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                    {estimatedCount} atleta(s) entraram com avaliação estimada pela média da turma.
                  </span>
                </div>
              </div>
            )}
```

with:

```tsx
            {validationErrors.generation && (
              <div role="alert" className="alert alert-error alert-soft text-xs font-semibold">
                {validationErrors.generation}
              </div>
            )}

            {authorizedDraw ? (
              <div className="space-y-2">
                <span className="badge badge-accent badge-soft text-xs font-semibold">
                  Notas autorizadas da comunidade
                </span>
                {authorizedDraw.estimatedCount > 0 && (
                  <div role="alert" className="alert alert-warning alert-soft p-2 items-start">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                      {authorizedDraw.estimatedCount} de {authorizedDraw.participantCount} atletas
                      sem avaliação — sorteio com notas estimadas. Avalie pelo perfil do atleta.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              estimatedCount > 0 && (
                <div className="space-y-2">
                  <div role="alert" className="alert alert-warning alert-soft p-2 items-start">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                      {estimatedCount} atleta(s) entraram com avaliação estimada pela média da turma.
                    </span>
                  </div>
                </div>
              )
            )}
```

If `Sparkles` or `X` is no longer used anywhere else in `SessionWizard.tsx` after the replacement, remove it from the `lucide-react` import (ESLint reports it).

- [ ] **Step 8: Run specs, typecheck, ESLint and Prettier on touched files**

```bash
cd /c/Volley-xs-w6-08 && npx vitest run src/components/session src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/components/session/SessionWizard.tsx src/components/session/SessionGenerationStatus.tsx src/components/session/SessionGenerationStatus.spec.tsx src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardModel.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts && npx prettier --write src/components/session/SessionWizard.tsx src/components/session/SessionGenerationStatus.tsx src/components/session/SessionGenerationStatus.spec.tsx src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardModel.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts > /dev/null
```

Expected: every spec and test passes; typecheck silent; no ESLint errors.

- [ ] **Step 9: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- src/components/session/SessionGenerationStatus.tsx src/components/session/SessionGenerationStatus.spec.tsx src/components/session/SessionWizard.tsx src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardModel.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts && git commit -q -F - <<'EOF'
feat: tela do wizard mostra a cadeia autorizada e as notas estimadas

SessionGenerationStatus mostra a etapa da preparacao (sessao, elenco, notas)
com barra indeterminada e depois o equilibrio com porcentagem. No resultado de
um sorteio autorizado, o selo "Notas autorizadas da comunidade" e quantos
atletas sairam sem avaliacao; o alerta de erro aparece tambem ao regerar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Documentation and full gates

**Files:**

- Modify: `docs/architecture/catalogs/OPEN-DECISIONS.md`, `docs/architecture/catalogs/HYPOTHESES.md`
- Modify: `docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md`, `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`
- Modify: `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, `docs/architecture/execution/C6-REACHABILITY-MAP.md`
- Modify: `HANDOFF.md`

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces: documentation only.

- [ ] **Step 1: Close `OPEN-REG-006`**

In `docs/architecture/catalogs/OPEN-DECISIONS.md`, replace the row:

```markdown
| `OPEN-REG-006` | Exact Reopen semantics after a roster revision exists | Reopen cannot silently preserve downstream artifacts as current; stale/revision behavior required | Product need for reopen + concurrency/design review |
```

with:

```markdown
| `OPEN-REG-006` | Exact Reopen semantics after a roster revision exists | **Closed 2026-09-17 by XS-W6-08c:** `reopen_registration` reopens a CLOSED or LOCKED Window only while the Session is DRAFT or SCHEDULED; earlier roster revisions stay immutable history, finalizing again creates the next revision, and capture refuses a revision that is not current (`40001`) | Closed |
```

and delete the line:

```markdown
- `OPEN-REG-006` before implementing reopen after finalized roster;
```

In `docs/architecture/catalogs/HYPOTHESES.md`, replace:

```markdown
| `HYP-REG-003` | Reopen should exist only before Session start and explicitly stale downstream roster/TeamDraw | Product reopen scenarios + staleness tests | Before `OPEN-REG-006` closes |
```

with:

```markdown
| `HYP-REG-003` | Reopen should exist only before Session start and explicitly stale downstream roster/TeamDraw | **Accepted 2026-09-17 (XS-W6-08c):** reopen is DRAFT/SCHEDULED only; staleness is enforced by roster revision currency (`40001` on capture) | Closed with `OPEN-REG-006` |
```

In `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`, replace:

```markdown
| `ReopenRegistration` | lock Window | expected revision | Session Organizer | OPEN + revision + downstream stale markers | revision event | `OPEN-REG-006` must close before feature implementation |
```

with:

```markdown
| `ReopenRegistration` | lock Session then Window | expected revision | Session Organizer | OPEN + revision; earlier roster revisions become non-current | revision event | Implemented as `reopen_registration` (XS-W6-08c); DRAFT/SCHEDULED Sessions only |
```

In `docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md`, replace `reopen explicit if supported` with `reopen via reopen_registration before Session start` and `explicit Reopen if policy closes \`OPEN-REG-006\`` with `explicit Reopen before Session start (\`OPEN-REG-006\` closed)`. Use `grep -n "OPEN-REG-006\|reopen" docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md` first and change only those two phrases.

- [ ] **Step 2: C6.02 note**

In `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, replace:

```markdown
would record scores nobody gave. Versioned evaluations start empty and come from the editor.
```

with:

```markdown
would record scores nobody gave. Versioned evaluations start empty and come from the editor.

## XS-W6-08c — Authorized team formation reachable from the wizard (inserted)

Implemented per the
[XS-W6-08c spec](../../superpowers/specs/2026-09-16-xs-w6-08c-authorized-team-formation-design.md).
Every synced Community Session now draws from the server-authorized balance input snapshot: the
wizard creates or adopts the target Session, runs W4 Registration behind the organizer's selection
(diff read back through the new `read_registration_window`), finalizes the roster, captures or
reuses the snapshot and re-keys it to local Player ids before the existing Worker. `OPEN-REG-006`
closed with `reopen_registration`. Offline, the draw blocks; Quick Sessions and local-only
Communities keep drawing locally. Candidate publication, voting and TeamDraw authority remain
XS-W6-03 to XS-W6-07.
```

- [ ] **Step 3: Reachability map**

In `docs/architecture/execution/C6-REACHABILITY-MAP.md`:

- In the `### Alcançável` table, add one row after the `Ler Session target por id` row:

  `| Sorteio autorizado | tela | \`SessionWizard\` → \`useSessionWizard.generateDivisions\` → \`prepareAuthorizedTeamFormation\` → \`create_target_session\`, \`create_registration_window\`, \`open_registration\`, \`reopen_registration\`, \`add_registration_entry\`, \`remove_registration_entry\`, \`change_registration_capacity\`, \`close_registration\`, \`lock_registration\`, \`finalize_session_roster\`, \`read_registration_window\`, \`read_target_roster_revision\`, \`capture_balance_input_snapshot\`, \`read_balance_input_snapshot\` |`

- In the `### Não alcançável` table, in the `**W4 inteira**` row, rename the label to `**W4 (restante)**` and keep only `join/leave_registration`, `inspect_registration_introduction` and `introduce_registration_from_legacy_roster`.
- In the `**W6-01, W6-02**` row, remove `capture_balance_input_snapshot` and `read_balance_input_snapshot`; keep the rest.
- In the `### Resultado` paragraph, replace "**8 são alcançáveis**" with "**21 são alcançáveis**" and add after that sentence: "A XS-W6-08c somou 13 pelo sorteio do wizard, incluindo as duas RPCs novas da reabertura e da leitura da janela."

Run `npx prettier --write docs/architecture/execution/C6-REACHABILITY-MAP.md` to realign the tables.

- [ ] **Step 4: HANDOFF**

In `HANDOFF.md`:

- In the slice table, add a row after the `XS-W6-08a` row: `| XS-W6-08c | Sorteio do wizard pelo snapshot autorizado | concluída na branch |`.
- In the `2026-09-16` header note, replace "Próxima: XS-W6-08c (wizard sorteia pelo snapshot autorizado)." with "A XS-W6-08c (wizard sorteia pelo snapshot autorizado) está implementada na branch; ver a seção dela."
- Insert before the line `### O que a XS-W6-08a entregou — modelo de avaliação obrigatório`:

```markdown
### O que a XS-W6-08c entregou — sorteio pelo snapshot autorizado

Branch `exec/c6-authorized-team-formation`, worktree `C:\Volley-xs-w6-08`. Ver a
[spec](docs/superpowers/specs/2026-09-16-xs-w6-08c-authorized-team-formation-design.md) e o
[plano](docs/superpowers/plans/2026-09-17-xs-w6-08c-authorized-team-formation.md).

- `20260916120000_reopen_registration.sql`: `reopen_registration` (fecha o `OPEN-REG-006`, só antes de
  a Session começar) e `read_registration_window` (status, revisão, capacidade e confirmados, só para o
  organizador).
- Toda sessão de comunidade sincronizada passa pela cadeia ao gerar times: Session target criada ou
  adotada, inscrição W4 pela diferença lida no servidor, elenco finalizado, snapshot capturado ou
  reaproveitado, participantes trocados pelos ids locais, e só então o Worker de sempre. Cada comando
  guarda o id antes de chamar, então repetir retoma pelo recibo; `40001` refaz a cadeia uma vez.
- Sem internet, o sorteio de sessão de comunidade bloqueia com mensagem; sessão rápida e comunidade só
  local seguem offline. Convidado sincronizado entra como jogador comum.
- A tela mostra a etapa da preparação, o selo "Notas autorizadas da comunidade" e quantos atletas saíram
  com nota estimada — hoje todos, porque não existe avaliação no modelo novo.

**Migration não aplicada no Panelinha e sem push**: ambos esperam o ok do usuário. Limites conhecidos:
cancelar o wizard depois da preparação deixa a Session target e a janela em `DRAFT` no servidor;
Session target continua invisível em outro aparelho (XS-W3-08).
```

- [ ] **Step 5: Run every gate, including the full database suite**

```bash
cd /c/Volley-xs-w6-08 && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& npx prettier --write HANDOFF.md docs/architecture/catalogs/OPEN-DECISIONS.md docs/architecture/catalogs/HYPOTHESES.md docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md docs/architecture/execution/C6-REACHABILITY-MAP.md > /dev/null \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues'; \
npm test > /tmp/w608c-test.log 2>&1; grep -E "^ℹ (pass|fail)|Tests +[0-9]|Test Files" /tmp/w608c-test.log; \
npm run check:architecture && npm run build > /tmp/w608c-build.log 2>&1 && echo BUILD ok
```

Expected: typecheck silent; no ESLint errors; no Prettier `[warn]` lines; unit and UI `fail 0`; architecture passes; `BUILD ok`.

Then the full database suite (about 10 minutes; run it in the background and wait for it):

```bash
cd /c/Volley-xs-w6-08 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db > /tmp/w608c-db.log 2>&1; grep -E "^ℹ (tests|pass|fail)" /tmp/w608c-db.log; grep -A25 "✖ failing" /tmp/w608c-db.log | head -80
```

Expected: `ℹ fail 0` (702 existing tests plus the 9 of Tasks 1–2). Any failure stops the task: diagnose it before editing an expectation.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-08 && git add -- HANDOFF.md docs/architecture/catalogs/OPEN-DECISIONS.md docs/architecture/catalogs/HYPOTHESES.md docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md docs/architecture/execution/C6-REACHABILITY-MAP.md && git commit -q -F - <<'EOF'
docs: registra a XS-W6-08c e fecha o OPEN-REG-006

OPEN-REG-006 fechado pela reabertura antes do inicio da Session; HYP-REG-003
aceita; matrizes C5.01 e C5.02 atualizadas; nota no C6.02; o mapa de
alcancabilidade soma 13 comandos pelo sorteio do wizard; HANDOFF descreve a
fatia e o que espera o usuario (migration e push).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -9 && git status --short
```

Expected: eight XS-W6-08c commits on top of `8e5e47c` and a clean `git status`.
