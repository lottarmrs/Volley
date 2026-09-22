# Tela de Inscrição da Pelada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar tela à inscrição — o organizador abre dias antes, os atletas se inscrevem sozinhos, quem passa da capacidade entra na reserva, e o sorteio usa a lista que nasceu daí.

**Architecture:** O servidor já tem a onda W4 inteira; falta leitura e interface. Uma migration acrescenta duas leituras autorizadas para membro ativo (`read_registration_board` por janela e `read_session_registration` por sessão), que devolvem janela, entradas, posição na reserva e o que o próprio leitor pode fazer. No cliente, um serviço de nuvem novo, casos de uso com id de comando guardado antes do envio (o padrão da XS-W6-08c), um hook que mantém o quadro, e uma área de rota por sessão com dois modos. Por fim a cadeia do sorteio passa a adotar a janela existente.

**Tech Stack:** PostgreSQL 15 / Supabase RPC, TypeScript, React 19, react-router 7, Node test runner (`.test.ts`), Vitest + Testing Library (`.spec.tsx`), suítes de banco contra PostgreSQL real (`.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-22-registration-screen-design.md`

## Global Constraints

- Worktree `C:\Volley-inscricao`, branch `exec/registration-screen`; nunca editar `C:\Volley`.
- Migration única: `supabase/migrations/20260922120000_registration_board.sql`. Funções `security definer`, `set search_path = ''`, nomes qualificados, `revoke ... from public, anon` e `grant execute ... to authenticated`.
- Leitura autorizada por `app_private.current_user_can_read_target_session(session_id)` — membro ativo da comunidade basta. Escrita continua com as autorizações que cada comando já tem.
- `read_registration_window` **não muda**: a cadeia do sorteio depende dela.
- Comandos existentes, com as assinaturas atuais: `create_registration_window(p_command_id, p_window_id, p_session_id, p_capacity, p_closes_at)`, `open/close/lock/reopen_registration(p_command_id, p_window_id, p_expected_revision)`, `join_registration(p_command_id, p_entry_id, p_window_id)`, `leave_registration(p_command_id, p_window_id)`, `add_registration_entry(p_command_id, p_entry_id, p_window_id, p_player_id)`, `remove_registration_entry(p_command_id, p_window_id, p_player_id, p_reason)`, `change_registration_capacity(p_command_id, p_window_id, p_capacity)`.
- Estados de entrada: `CONFIRMED`, `WAITLISTED`, `WITHDRAWN`, `REMOVED`. A tela mostra só os dois primeiros.
- Texto em pt-BR. `.rpc(` só em `src/infra/supabase` (AF-FREEZE-004). Sem comentário em código novo, salvo decisão não óbvia.
- **Tela nova passa pela skill `/impeccable shape` antes de o componente ser escrito** (Tarefa 6, Passo 1).
- Sem internet não se inscreve: nada de marcação local para subir depois.
- DB tests: `VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs <arquivo>.dbtest.ts` (container `volley_test_pg2`).

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/20260922120000_registration_board.sql` | As duas leituras e o construtor comum do quadro |
| `src/test/db/registrationBoard.dbtest.ts` | Leitura e autorização contra PostgreSQL real |
| `src/test/db/registrationFlow.dbtest.ts` | Abrir, inscrever, encher, reserva, sair, promover, fechar, finalizar |
| `src/shared/types/registrationBoard.ts` | `RegistrationBoard`, `RegistrationBoardEntry`, `RegistrationEntryStatus` |
| `src/infra/supabase/registrationBoardCloudService.ts` (+ `.test.ts`) | Leituras e os dois comandos do atleta |
| `src/application/registrationBoardGateway.ts` | Contrato que o caso de uso consome |
| `src/application/registrationUseCases.ts` (+ `.test.ts`) | Abrir, inscrever, desistir, incluir, tirar, capacidade, fechar, reabrir |
| `src/hooks/useRegistrationBoard.ts` (+ `.spec.tsx`) | Carrega o quadro, executa a ação, recarrega |
| `src/components/session/RegistrationBoard.tsx` (+ `.spec.tsx`) | A tela, nos dois modos |
| `src/app/routes/sessionRoutes.tsx` | Rota da área |
| `src/application/appRoutes.ts` | `paths.inscricao(communityId, sessionId)` e título |
| `src/components/agenda/AgendaView.tsx`, `src/components/dashboard/Dashboard.tsx` | As portas |
| `src/application/authorizedTeamFormationUseCases.ts` | O sorteio adota a janela |

---

### Task 1: Leitura do quadro de inscrição

**Files:**

- Create: `supabase/migrations/20260922120000_registration_board.sql`
- Test: `src/test/db/registrationBoard.dbtest.ts`

**Interfaces:**

- Consumes: `public.registration_windows`, `public.registration_entries`, `app_private.current_user_can_read_target_session(uuid)`, `app_private.current_user_has_valid_target_session_organizer_assignment(uuid)`, `public.players`.
- Produces:
  - `app_private.build_registration_board(p_window public.registration_windows) returns jsonb`;
  - `public.read_registration_board(p_window_id uuid) returns jsonb`;
  - `public.read_session_registration(p_session_id uuid) returns jsonb` — devolve `null` quando a sessão ainda não tem janela.

O formato devolvido, usado pelas três:

```json
{
  "window_id": "uuid",
  "session_id": "uuid",
  "status": "OPEN",
  "revision": 3,
  "capacity": 12,
  "opened_at": "timestamptz",
  "closed_at": null,
  "locked_at": null,
  "confirmed_count": 12,
  "waitlisted_count": 2,
  "viewer_can_manage": true,
  "viewer_player_id": "uuid ou null",
  "viewer_entry_status": "CONFIRMED | WAITLISTED | null",
  "viewer_queue_position": 2,
  "entries": [
    {
      "entry_id": "uuid",
      "player_id": "uuid",
      "status": "CONFIRMED",
      "queue_position": null,
      "source": "SELF_JOIN",
      "joined_at": "timestamptz"
    }
  ]
}
```

- [ ] **Step 1: Escrever a suíte que falha**

Criar `src/test/db/registrationBoard.dbtest.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260922120000_registration_board.sql';

interface BoardEntry {
  entry_id: string;
  player_id: string;
  status: string;
  queue_position: number | null;
  source: string;
  joined_at: string;
}

interface Board {
  window_id: string;
  session_id: string;
  status: string;
  revision: number;
  capacity: number;
  confirmed_count: number;
  waitlisted_count: number;
  viewer_can_manage: boolean;
  viewer_player_id: string | null;
  viewer_entry_status: string | null;
  viewer_queue_position: number | null;
  entries: BoardEntry[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration board requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newPlayer(
    ownerId: string,
    communityId: string,
    name: string,
    userId: string | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, user_id, name, has_account_identity_history)
       values ($1, $2, $3, $4, false)`,
      [id, ownerId, userId, name],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function membership(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function fixture() {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Inscricao ${randomUUID()}`,
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
        2,
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

  async function board(actorId: string | null, windowId: string): Promise<Board> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ board: Board }>('select public.read_registration_board($1) as board', [
        windowId,
      ]),
    );
    return rows[0].board;
  }

  test('o quadro traz janela, confirmados, reserva em ordem e o que o leitor pode fazer', async () => {
    const f = await fixture();
    const primeiro = await newUser('atleta1');
    const segundo = await newUser('atleta2');
    const terceiro = await newUser('atleta3');
    for (const userId of [primeiro, segundo, terceiro]) {
      await membership(f.communityId, userId);
      await newPlayer(f.ownerId, f.communityId, `Atleta ${userId.slice(0, 4)}`, userId);
    }

    for (const userId of [primeiro, segundo, terceiro]) {
      await asIdentityCommitting(client, userId, () =>
        client.query('select * from public.join_registration($1,$2,$3)', [
          randomUUID(),
          randomUUID(),
          f.windowId,
        ]),
      );
    }

    const doOrganizador = await board(f.ownerId, f.windowId);
    assert.equal(doOrganizador.capacity, 2);
    assert.equal(doOrganizador.confirmed_count, 2);
    assert.equal(doOrganizador.waitlisted_count, 1);
    assert.equal(doOrganizador.viewer_can_manage, true);
    assert.equal(doOrganizador.entries.length, 3);
    assert.deepEqual(
      doOrganizador.entries.map((entry) => entry.status),
      ['CONFIRMED', 'CONFIRMED', 'WAITLISTED'],
    );
    assert.equal(doOrganizador.entries[2].queue_position, 1);
    assert.equal(doOrganizador.entries[0].source, 'SELF_JOIN');

    const doTerceiro = await board(terceiro, f.windowId);
    assert.equal(doTerceiro.viewer_can_manage, false);
    assert.equal(doTerceiro.viewer_entry_status, 'WAITLISTED');
    assert.equal(doTerceiro.viewer_queue_position, 1);

    const doPrimeiro = await board(primeiro, f.windowId);
    assert.equal(doPrimeiro.viewer_entry_status, 'CONFIRMED');
    assert.equal(doPrimeiro.viewer_queue_position, null);
  });

  test('quem saiu ou foi tirado não aparece na lista', async () => {
    const f = await fixture();
    const atleta = await newUser('sai');
    await membership(f.communityId, atleta);
    await newPlayer(f.ownerId, f.communityId, 'Quem sai', atleta);
    await asIdentityCommitting(client, atleta, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        f.windowId,
      ]),
    );
    await asIdentityCommitting(client, atleta, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    const quadro = await board(f.ownerId, f.windowId);
    assert.deepEqual(quadro.entries, []);
    assert.equal(quadro.confirmed_count, 0);

    const doAtleta = await board(atleta, f.windowId);
    assert.equal(doAtleta.viewer_entry_status, null);
  });

  test('membro lê; estranho e anônimo recebem 42501', async () => {
    const f = await fixture();
    const estranho = await newUser('estranho');
    for (const actor of [estranho, null]) {
      const erro = await asIdentity(client, actor, () =>
        client.query('select public.read_registration_board($1)', [f.windowId]),
      ).catch((thrown: Error) => thrown);
      assert.equal((erro as { code?: string }).code, '42501', `ator ${actor ?? 'anonimo'}`);
    }
  });

  test('a leitura por sessão devolve o mesmo quadro, e nada antes da janela existir', async () => {
    const f = await fixture();
    const { rows } = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ board: Board | null }>(
        'select public.read_session_registration($1) as board',
        [f.sessionId],
      ),
    );
    assert.equal(rows[0].board?.window_id, f.windowId);

    const outraSessao = randomUUID();
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [outraSessao, f.communityId, 'Sem inscricao'],
      ),
    );
    const vazio = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ board: Board | null }>(
        'select public.read_session_registration($1) as board',
        [outraSessao],
      ),
    );
    assert.equal(vazio.rows[0].board, null);
  });

  test('janela inexistente é P0002', async () => {
    const f = await fixture();
    const erro = await asIdentity(client, f.ownerId, () =>
      client.query('select public.read_registration_board($1)', [randomUUID()]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, 'P0002');
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs registrationBoard.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|does not exist" | head -5
```

Esperado: todas falham com `function public.read_registration_board(...) does not exist`.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260922120000_registration_board.sql`:

```sql
-- A leitura que a XS-W6-08c criou serve a quem organiza e traz só os confirmados. A tela de
-- inscrição precisa da reserva, da ordem e de quem esta lendo -- e precisa que um membro comum
-- consiga ler.

create function app_private.build_registration_board(p_window public.registration_windows)
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
begin
  select p.id into v_player_id
    from public.players p
   where p.user_id = v_uid
     and p.deleted_at is null
   limit 1;

  with ordenadas as (
    select e.id,
           e.player_id,
           e.status,
           e.source,
           e.joined_at,
           case
             when e.status = 'WAITLISTED'
               then pg_catalog.row_number() over (
                 partition by e.status order by e.queue_sequence
               )
             else null
           end as queue_position,
           case when e.status = 'CONFIRMED' then 0 else 1 end as ordem_grupo,
           e.queue_sequence
      from public.registration_entries e
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
               'joined_at', o.joined_at
             )
             order by o.ordem_grupo, o.queue_sequence, o.joined_at
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
           'viewer_queue_position', (
             select entry ->> 'queue_position'
               from pg_catalog.jsonb_array_elements(v_entries) as entry
              where (entry ->> 'player_id')::uuid = v_player_id
                and entry ->> 'status' = 'WAITLISTED'
              limit 1
           )
         )
    into v_viewer;

  return pg_catalog.jsonb_build_object(
    'window_id', p_window.id,
    'session_id', p_window.session_id,
    'status', p_window.status,
    'revision', p_window.revision,
    'capacity', p_window.capacity,
    'opened_at', p_window.opened_at,
    'closed_at', p_window.closed_at,
    'locked_at', p_window.locked_at,
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
    'viewer_can_manage',
      app_private.current_user_has_valid_target_session_organizer_assignment(p_window.session_id),
    'viewer_player_id', v_player_id,
    'viewer_entry_status', v_viewer ->> 'viewer_entry_status',
    'viewer_queue_position', (v_viewer ->> 'viewer_queue_position')::integer,
    'entries', v_entries
  );
end;
$$;

revoke all on function app_private.build_registration_board(public.registration_windows)
  from public, anon, authenticated;

create function public.read_registration_board(p_window_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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

  if not app_private.current_user_can_read_target_session(v_window.session_id) then
    raise exception 'Not authorized to read this Registration Window' using errcode = '42501';
  end if;

  return app_private.build_registration_board(v_window);
end;
$$;

revoke all on function public.read_registration_board(uuid) from public, anon;
grant execute on function public.read_registration_board(uuid) to authenticated;

create function public.read_session_registration(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'session_id is required' using errcode = '23514';
  end if;

  if not app_private.current_user_can_read_target_session(p_session_id) then
    raise exception 'Not authorized to read this Session' using errcode = '42501';
  end if;

  select * into v_window
    from public.registration_windows w
   where w.session_id = p_session_id;
  if not found then
    return null;
  end if;

  return app_private.build_registration_board(v_window);
end;
$$;

revoke all on function public.read_session_registration(uuid) from public, anon;
grant execute on function public.read_session_registration(uuid) to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /c/Volley-inscricao && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs registrationBoard.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" | head -8
```

Esperado: `ℹ pass 5`, `ℹ fail 0`. Se a contagem de `queue_position` vier errada, olhe a janela do `row_number`: ela numera dentro do grupo `WAITLISTED`, ordenando por `queue_sequence`.

- [ ] **Step 5: Formatar, lintar e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/test/db/registrationBoard.dbtest.ts > /dev/null && npx eslint --quiet src/test/db/registrationBoard.dbtest.ts && git add -- supabase/migrations/20260922120000_registration_board.sql src/test/db/registrationBoard.dbtest.ts && git commit -q -F - <<'EOF'
feat: leitura do quadro de inscricao para membro da comunidade

read_registration_board e read_session_registration devolvem janela,
confirmados, reserva com posicao e o que quem le pode fazer. A leitura que a
XS-W6-08c criou continua intacta, porque a cadeia do sorteio depende dela, mas
ela so serve a quem organiza e nao traz a reserva.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: O fluxo inteiro contra o banco real

**Files:**

- Test: `src/test/db/registrationFlow.dbtest.ts` (criar)

**Interfaces:**

- Consumes: os comandos da W4 e `public.read_registration_board` (Tarefa 1).
- Produces: nada de código; prova que o fluxo da tela funciona ponta a ponta no servidor.

- [ ] **Step 1: Escrever a suíte**

Criar `src/test/db/registrationFlow.dbtest.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface Board {
  status: string;
  capacity: number;
  revision: number;
  confirmed_count: number;
  waitlisted_count: number;
  entries: { player_id: string; status: string; queue_position: number | null }[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration flow requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
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

  async function cenario(capacidade: number) {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Fluxo ${randomUUID()}`,
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
        [sessionId, communityId, 'Pelada'],
      ),
    );
    const windowId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        windowId,
        sessionId,
        capacidade,
      ]),
    );
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [randomUUID(), windowId, 1]),
    );
    return { ownerId, communityId, sessionId, windowId };
  }

  async function atleta(cenarioAtual: { ownerId: string; communityId: string }, nome: string) {
    const userId = await newUser(nome);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [cenarioAtual.communityId, userId],
    );
    const playerId = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, user_id, name, has_account_identity_history)
       values ($1, $2, $3, $4, false)`,
      [playerId, cenarioAtual.ownerId, userId, nome],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [cenarioAtual.communityId, playerId, cenarioAtual.ownerId],
    );
    return { userId, playerId };
  }

  const board = async (actorId: string, windowId: string): Promise<Board> =>
    (
      await asIdentityCommitting(client, actorId, () =>
        client.query<{ board: Board }>('select public.read_registration_board($1) as board', [
          windowId,
        ]),
      )
    ).rows[0].board;

  const entrar = (userId: string, windowId: string) =>
    asIdentityCommitting(client, userId, () =>
      client.query<{ entry_status: string }>(
        'select * from public.join_registration($1,$2,$3)',
        [randomUUID(), randomUUID(), windowId],
      ),
    );

  test('enche a capacidade, manda para a reserva e promove quem fica quando alguém sai', async () => {
    const c = await cenario(2);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    const caio = await atleta(c, 'Caio');

    assert.equal((await entrar(ana.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
    assert.equal((await entrar(bia.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
    assert.equal((await entrar(caio.userId, c.windowId)).rows[0].entry_status, 'WAITLISTED');

    await asIdentityCommitting(client, ana.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), c.windowId]),
    );

    const depois = await board(c.ownerId, c.windowId);
    assert.equal(depois.confirmed_count, 2);
    assert.equal(depois.waitlisted_count, 0);
    assert.deepEqual(
      depois.entries.map((entry) => entry.player_id).sort(),
      [bia.playerId, caio.playerId].sort(),
    );
  });

  test('o organizador inclui e tira quem precisar', async () => {
    const c = await cenario(4);
    const duda = await atleta(c, 'Duda');

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.add_registration_entry($1,$2,$3,$4)', [
        randomUUID(),
        randomUUID(),
        c.windowId,
        duda.playerId,
      ]),
    );
    const comDuda = await board(c.ownerId, c.windowId);
    assert.equal(comDuda.confirmed_count, 1);
    assert.equal(comDuda.entries[0].status, 'CONFIRMED');

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.remove_registration_entry($1,$2,$3,$4)', [
        randomUUID(),
        c.windowId,
        duda.playerId,
        'ORGANIZER_DESELECTED',
      ]),
    );
    assert.equal((await board(c.ownerId, c.windowId)).confirmed_count, 0);
  });

  test('capacidade abaixo do confirmado é recusada, e acima libera a reserva', async () => {
    const c = await cenario(1);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);
    await entrar(bia.userId, c.windowId);

    const recusa = await asIdentity(client, c.ownerId, () =>
      client.query('select * from public.change_registration_capacity($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        0,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.ok((recusa as { code?: string }).code);

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.change_registration_capacity($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        2,
      ]),
    );
    const depois = await board(c.ownerId, c.windowId);
    assert.equal(depois.capacity, 2);
    assert.equal(depois.confirmed_count, 2);
    assert.equal(depois.waitlisted_count, 0);
  });

  test('fechada não aceita inscrição, e reabrir volta a aceitar', async () => {
    const c = await cenario(3);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);

    const revisao = (await board(c.ownerId, c.windowId)).revision;
    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.close_registration($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        revisao,
      ]),
    );

    const recusa = await asIdentity(client, bia.userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        c.windowId,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((recusa as { code?: string }).code, '23514');

    const fechada = await board(c.ownerId, c.windowId);
    assert.equal(fechada.status, 'CLOSED');
    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.reopen_registration($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        fechada.revision,
      ]),
    );
    assert.equal((await entrar(bia.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
  });

  test('o elenco finalizado sai dos confirmados da inscrição', async () => {
    const c = await cenario(2);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);
    await entrar(bia.userId, c.windowId);

    let revisao = (await board(c.ownerId, c.windowId)).revision;
    for (const comando of ['close_registration', 'lock_registration']) {
      revisao = (
        await asIdentityCommitting(client, c.ownerId, () =>
          client.query<{ window_revision: number }>(
            `select * from public.${comando}($1,$2,$3)`,
            [randomUUID(), c.windowId, revisao],
          ),
        )
      ).rows[0].window_revision;
    }
    const finalizado = await asIdentityCommitting(client, c.ownerId, () =>
      client.query<{ roster_revision_id: string }>(
        'select * from public.finalize_session_roster($1,$2,$3)',
        [randomUUID(), c.windowId, revisao],
      ),
    );

    const elenco = await asIdentityCommitting(client, c.ownerId, () =>
      client.query<{ entries: { player_id: string }[] }>(
        'select * from public.read_target_roster_revision($1)',
        [finalizado.rows[0].roster_revision_id],
      ),
    );
    assert.deepEqual(
      elenco.rows[0].entries.map((entry) => entry.player_id).sort(),
      [ana.playerId, bia.playerId].sort(),
    );
  });
}
```

- [ ] **Step 2: Rodar**

```bash
cd /c/Volley-inscricao && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs registrationFlow.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" | head -8
```

Esperado: `ℹ pass 5`, `ℹ fail 0`. Esta suíte não deve precisar de código novo — ela prova o que o servidor já faz. Se algum caso falhar, o achado vale mais que o teste: registre no commit o que o servidor faz de diferente do que a spec assumiu, e ajuste a spec antes de seguir.

- [ ] **Step 3: Formatar, lintar e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/test/db/registrationFlow.dbtest.ts > /dev/null && npx eslint --quiet src/test/db/registrationFlow.dbtest.ts && git add -- src/test/db/registrationFlow.dbtest.ts && git commit -q -F - <<'EOF'
test: o fluxo da inscricao ponta a ponta no banco real

Encher a capacidade, mandar para a reserva, promover quem fica quando alguem
sai, incluir e tirar pelo organizador, mudar capacidade, fechar, reabrir e
finalizar o elenco a partir dos confirmados.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Tipos, serviço de nuvem e contrato

**Files:**

- Create: `src/shared/types/registrationBoard.ts`
- Modify: `src/types.ts`
- Create: `src/infra/supabase/registrationBoardCloudService.ts`
- Test: `src/infra/supabase/registrationBoardCloudService.test.ts`
- Create: `src/application/registrationBoardGateway.ts`

**Interfaces:**

- Consumes: `RpcClient` de `src/infra/supabase/sessionCohortCloudService.ts`; as funções da Tarefa 1; os comandos `join_registration` e `leave_registration`.
- Produces:
  - tipos `RegistrationEntryStatus`, `RegistrationBoardEntry`, `RegistrationBoard` exportados de `@shared/types`;
  - `createRegistrationBoardCloudService(client: RpcClient): RegistrationBoardService` com `readBoard(windowId): Promise<RegistrationBoard>`, `readSessionBoard(sessionId): Promise<RegistrationBoard | null>`, `join(input: { commandId: string; entryId: string; windowId: string }): Promise<RegistrationEntryStatus>` e `leave(input: { commandId: string; windowId: string }): Promise<void>`; singleton `registrationBoardCloudService`;
  - `interface RegistrationBoardGateway` em `src/application/registrationBoardGateway.ts`, reunindo o serviço acima com o `RegistrationGateway` que a XS-W6-08c já definiu e com `ensureTargetSession`.

- [ ] **Step 1: Criar os tipos**

Criar `src/shared/types/registrationBoard.ts`:

```ts
export type RegistrationEntryStatus = 'CONFIRMED' | 'WAITLISTED';

export type RegistrationBoardStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED';

export interface RegistrationBoardEntry {
  readonly entryId: string;
  readonly playerId: string;
  readonly status: RegistrationEntryStatus;
  readonly queuePosition: number | null;
  readonly source: string;
  readonly joinedAt: string;
}

export interface RegistrationBoard {
  readonly windowId: string;
  readonly sessionId: string;
  readonly status: RegistrationBoardStatus;
  readonly revision: number;
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly waitlistedCount: number;
  readonly viewerCanManage: boolean;
  readonly viewerPlayerId: string | null;
  readonly viewerEntryStatus: RegistrationEntryStatus | null;
  readonly viewerQueuePosition: number | null;
  readonly entries: readonly RegistrationBoardEntry[];
}
```

Em `src/types.ts`, logo depois do bloco que exporta `./shared/types/teamCandidateSet`, acrescentar:

```ts
export type {
  RegistrationBoard,
  RegistrationBoardEntry,
  RegistrationBoardStatus,
  RegistrationEntryStatus,
} from './shared/types/registrationBoard';
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/infra/supabase/registrationBoardCloudService.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistrationBoardCloudService } from './registrationBoardCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createRegistrationBoardCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

const RAW = {
  window_id: 'w-1',
  session_id: 's-1',
  status: 'OPEN',
  revision: 4,
  capacity: 12,
  confirmed_count: 2,
  waitlisted_count: 1,
  viewer_can_manage: false,
  viewer_player_id: 'p-2',
  viewer_entry_status: 'WAITLISTED',
  viewer_queue_position: 1,
  entries: [
    {
      entry_id: 'e-1',
      player_id: 'p-1',
      status: 'CONFIRMED',
      queue_position: null,
      source: 'SELF_JOIN',
      joined_at: '2026-09-22T12:00:00.000Z',
    },
    {
      entry_id: 'e-2',
      player_id: 'p-2',
      status: 'WAITLISTED',
      queue_position: 1,
      source: 'SELF_JOIN',
      joined_at: '2026-09-22T12:05:00.000Z',
    },
  ],
};

test('readBoard traduz o quadro para os nomes do app', async () => {
  const { service, calls } = recording(RAW);
  const board = await service.readBoard('w-1');
  assert.deepEqual(calls, [['read_registration_board', { p_window_id: 'w-1' }]]);
  assert.equal(board.windowId, 'w-1');
  assert.equal(board.capacity, 12);
  assert.equal(board.viewerEntryStatus, 'WAITLISTED');
  assert.equal(board.viewerQueuePosition, 1);
  assert.equal(board.entries.length, 2);
  assert.deepEqual(board.entries[1], {
    entryId: 'e-2',
    playerId: 'p-2',
    status: 'WAITLISTED',
    queuePosition: 1,
    source: 'SELF_JOIN',
    joinedAt: '2026-09-22T12:05:00.000Z',
  });
});

test('readSessionBoard devolve nulo quando a sessão ainda não tem janela', async () => {
  const { service, calls } = recording(null);
  assert.equal(await service.readSessionBoard('s-1'), null);
  assert.deepEqual(calls, [['read_session_registration', { p_session_id: 's-1' }]]);
});

test('join devolve se a pessoa entrou confirmada ou na reserva', async () => {
  const { service, calls } = recording([{ entry_status: 'WAITLISTED', window_revision: 5 }]);
  const status = await service.join({ commandId: 'c-1', entryId: 'e-9', windowId: 'w-1' });
  assert.equal(status, 'WAITLISTED');
  assert.deepEqual(calls, [
    ['join_registration', { p_command_id: 'c-1', p_entry_id: 'e-9', p_window_id: 'w-1' }],
  ]);
});

test('leave envia comando e janela, e o erro do servidor sobe como veio', async () => {
  const { service, calls } = recording([{ entry_status: 'WITHDRAWN', window_revision: 6 }]);
  await service.leave({ commandId: 'c-2', windowId: 'w-1' });
  assert.deepEqual(calls, [['leave_registration', { p_command_id: 'c-2', p_window_id: 'w-1' }]]);

  const falha = recording(null, { code: '23514', message: 'closed' });
  await assert.rejects(falha.service.leave({ commandId: 'c-3', windowId: 'w-1' }), {
    code: '23514',
  });
});

test('resposta fora do formato é recusada', async () => {
  const { service } = recording({ window_id: 'w-1' });
  await assert.rejects(service.readBoard('w-1'), /Invalid read_registration_board response/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && node --import tsx --test src/infra/supabase/registrationBoardCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Esperado: `Cannot find module './registrationBoardCloudService'`.

- [ ] **Step 4: Implementar o serviço e o contrato**

Criar `src/infra/supabase/registrationBoardCloudService.ts`:

```ts
import type {
  RegistrationBoard,
  RegistrationBoardEntry,
  RegistrationBoardStatus,
  RegistrationEntryStatus,
} from '@shared/types';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface RegistrationBoardService {
  readBoard(windowId: string): Promise<RegistrationBoard>;
  readSessionBoard(sessionId: string): Promise<RegistrationBoard | null>;
  join(input: {
    commandId: string;
    entryId: string;
    windowId: string;
  }): Promise<RegistrationEntryStatus>;
  leave(input: { commandId: string; windowId: string }): Promise<void>;
}

const WINDOW_STATUSES = new Set<string>(['DRAFT', 'OPEN', 'CLOSED', 'LOCKED']);
const ENTRY_STATUSES = new Set<string>(['CONFIRMED', 'WAITLISTED']);

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function entry(value: unknown, label: string): RegistrationBoardEntry {
  const row = record(value, label);
  const status = text(row.status, label);
  if (!ENTRY_STATUSES.has(status)) throw invalid(label);
  const position = row.queue_position;
  if (position !== null && typeof position !== 'number') throw invalid(label);
  return {
    entryId: text(row.entry_id, label),
    playerId: text(row.player_id, label),
    status: status as RegistrationEntryStatus,
    queuePosition: position as number | null,
    source: text(row.source, label),
    joinedAt: text(row.joined_at, label),
  };
}

function board(value: unknown, label: string): RegistrationBoard {
  const row = record(value, label);
  const status = text(row.status, label);
  if (!WINDOW_STATUSES.has(status)) throw invalid(label);
  if (!Array.isArray(row.entries)) throw invalid(label);
  const viewerStatus = row.viewer_entry_status;
  if (viewerStatus !== null && typeof viewerStatus !== 'string') throw invalid(label);
  return {
    windowId: text(row.window_id, label),
    sessionId: text(row.session_id, label),
    status: status as RegistrationBoardStatus,
    revision: integer(row.revision, label),
    capacity: integer(row.capacity, label),
    confirmedCount: integer(row.confirmed_count, label),
    waitlistedCount: integer(row.waitlisted_count, label),
    viewerCanManage: row.viewer_can_manage === true,
    viewerPlayerId: typeof row.viewer_player_id === 'string' ? row.viewer_player_id : null,
    viewerEntryStatus: (viewerStatus as RegistrationEntryStatus | null) ?? null,
    viewerQueuePosition:
      typeof row.viewer_queue_position === 'number' ? row.viewer_queue_position : null,
    entries: row.entries.map((item) => entry(item, label)),
  };
}

export function createRegistrationBoardCloudService(client: RpcClient): RegistrationBoardService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  return {
    async readBoard(windowId) {
      const label = 'read_registration_board';
      return board(await call(label, { p_window_id: windowId }), label);
    },
    async readSessionBoard(sessionId) {
      const label = 'read_session_registration';
      const data = await call(label, { p_session_id: sessionId });
      return data === null || data === undefined ? null : board(data, label);
    },
    async join(input) {
      const label = 'join_registration';
      const data = await call(label, {
        p_command_id: input.commandId,
        p_entry_id: input.entryId,
        p_window_id: input.windowId,
      });
      const row = record(Array.isArray(data) ? data[0] : data, label);
      const status = text(row.entry_status, label);
      if (!ENTRY_STATUSES.has(status)) throw invalid(label);
      return status as RegistrationEntryStatus;
    },
    async leave(input) {
      await call('leave_registration', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
      });
    },
  };
}

export const registrationBoardCloudService: RegistrationBoardService = isSupabaseConfigured
  ? createRegistrationBoardCloudService(supabase)
  : createRegistrationBoardCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
```

Criar `src/application/registrationBoardGateway.ts`:

```ts
import type { RegistrationBoard, RegistrationEntryStatus } from '@shared/types';
import type { RegistrationGateway } from './authorizedFormationGateways';
import type { CreateTargetSessionInput } from '@infra/supabase/sessionCohortCutover';

export interface RegistrationBoardGateway {
  readSessionBoard(sessionId: string): Promise<RegistrationBoard | null>;
  readBoard(windowId: string): Promise<RegistrationBoard>;
  join(input: {
    commandId: string;
    entryId: string;
    windowId: string;
  }): Promise<RegistrationEntryStatus>;
  leave(input: { commandId: string; windowId: string }): Promise<void>;
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  readTargetSession(sessionId: string): Promise<{ id: string }>;
  readonly registration: RegistrationGateway;
}
```

Se o caminho `@infra/supabase/sessionCohortCutover` não existir, importar `CreateTargetSessionInput` de onde `src/application/authorizedFormationGateways.ts` já o importa — rodar `grep -n "CreateTargetSessionInput" src/application/authorizedFormationGateways.ts` e copiar o caminho de lá.

- [ ] **Step 5: Rodar, tipar e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/shared/types/registrationBoard.ts src/types.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts src/application/registrationBoardGateway.ts > /dev/null && node --import tsx --test src/infra/supabase/registrationBoardCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/shared/types/registrationBoard.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts src/application/registrationBoardGateway.ts
```

Esperado: `ℹ pass 5`, `ℹ fail 0`; typecheck silencioso; sem erro de ESLint.

```bash
cd /c/Volley-inscricao && git add -- src/shared/types/registrationBoard.ts src/types.ts src/infra/supabase/registrationBoardCloudService.ts src/infra/supabase/registrationBoardCloudService.test.ts src/application/registrationBoardGateway.ts && git commit -q -F - <<'EOF'
feat: servico de nuvem do quadro de inscricao

Le o quadro por janela e por sessao, e leva os dois comandos do atleta: entrar,
que devolve se ficou confirmado ou na reserva, e sair. O contrato reune essas
leituras com os comandos de organizador que a XS-W6-08c ja definiu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Casos de uso da inscrição

**Files:**

- Create: `src/application/registrationUseCases.ts`
- Test: `src/application/registrationUseCases.test.ts`

**Interfaces:**

- Consumes: `RegistrationBoardGateway` (Tarefa 3); `AuthorizedFormationFailure` e `classifyAuthorizedFormationFailure` de `src/application/authorizedTeamFormationRules.ts`; `appOk`, `productError`, `AppResult` de `src/application/appResult.ts`.
- Produces, todos devolvendo `Promise<AppResult<RegistrationBoard>>` e recebendo `commandId` de fora, para que repetir a ação repita o mesmo comando:
  - `openRegistration({ session, communityCloudId, capacity, commandId, windowId, onSessionChange }, gateway?)`
  - `joinRegistration({ windowId, commandId, entryId }, gateway?)`
  - `leaveRegistration({ windowId, commandId }, gateway?)`
  - `addAthleteToRegistration({ windowId, playerCloudId, commandId, entryId }, gateway?)`
  - `removeAthleteFromRegistration({ windowId, playerCloudId, commandId }, gateway?)`
  - `changeRegistrationCapacity({ windowId, capacity, commandId }, gateway?)`
  - `setRegistrationOpen({ windowId, open, expectedRevision, commandId }, gateway?)` — fecha quando `open` é falso, reabre quando é verdadeiro;
  - `defaultRegistrationBoardGateway`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/application/registrationUseCases.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegistrationBoard, Session } from '@shared/types';
import { makeSession } from '../test/fixtures';
import type { RegistrationBoardGateway } from './registrationBoardGateway';
import {
  addAthleteToRegistration,
  changeRegistrationCapacity,
  joinRegistration,
  leaveRegistration,
  openRegistration,
  removeAthleteFromRegistration,
  setRegistrationOpen,
} from './registrationUseCases';

const coded = (code: string) => Object.assign(new Error(code), { code });

function quadro(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-session',
    status: 'OPEN',
    revision: 2,
    capacity: 12,
    confirmedCount: 1,
    waitlistedCount: 0,
    viewerCanManage: true,
    viewerPlayerId: 'p-1',
    viewerEntryStatus: 'CONFIRMED',
    viewerQueuePosition: null,
    entries: [],
    ...overrides,
  };
}

function fakeGateway(options: { sessionExists?: boolean; falhas?: unknown[] } = {}) {
  const chamadas: string[] = [];
  const falhas = options.falhas ?? [];
  const registrar = (nome: string) => {
    chamadas.push(nome);
    if (falhas.length > 0) throw falhas.shift();
  };
  const gateway: RegistrationBoardGateway = {
    async readSessionBoard() {
      registrar('readSessionBoard');
      return quadro();
    },
    async readBoard() {
      registrar('readBoard');
      return quadro();
    },
    async join(input) {
      registrar(`join:${input.commandId}`);
      return 'WAITLISTED';
    },
    async leave(input) {
      registrar(`leave:${input.commandId}`);
    },
    async createTargetSession() {
      registrar('createTargetSession');
      if (options.sessionExists) throw coded('23505');
      return { id: 'cloud-session' };
    },
    async readTargetSession() {
      registrar('readTargetSession');
      return { id: 'cloud-session' };
    },
    registration: {
      async createWindow(input) {
        registrar(`createWindow:${input.capacity}`);
        return 1;
      },
      async openWindow() {
        registrar('openWindow');
        return 2;
      },
      async reopenWindow() {
        registrar('reopenWindow');
        return 3;
      },
      async closeWindow() {
        registrar('closeWindow');
        return 3;
      },
      async lockWindow() {
        registrar('lockWindow');
        return 4;
      },
      async changeCapacity(input) {
        registrar(`changeCapacity:${input.capacity}`);
        return 3;
      },
      async addEntry(input) {
        registrar(`addEntry:${input.playerId}`);
        return 3;
      },
      async removeEntry(input) {
        registrar(`removeEntry:${input.playerId}`);
        return 3;
      },
      async finalizeRoster() {
        registrar('finalizeRoster');
        return { rosterRevisionId: 'r-1', rosterRevisionNumber: 1 };
      },
      async readWindow() {
        registrar('readWindow');
        throw coded('P0002');
      },
    },
  };
  return { gateway, chamadas };
}

function sessao(overrides: Partial<Session> = {}): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    ...overrides,
  });
}

test('abrir a inscrição cria a Session no servidor, cria a janela e abre', async () => {
  const { gateway, chamadas } = fakeGateway();
  const mudancas: Session[] = [];
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: 'cloud-community',
      capacity: 14,
      commandId: 'c-1',
      windowId: 'w-1',
      onSessionChange: (next) => mudancas.push(next),
    },
    gateway,
  );

  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, [
    'createTargetSession',
    'createWindow:14',
    'openWindow',
    'readBoard',
  ]);
  assert.equal(mudancas.at(-1)?.authorizedFormation?.windowId, 'w-1');
  assert.equal(mudancas.at(-1)?.cloudId, 'cloud-session');
});

test('Session já criada no servidor é adotada, não recriada', async () => {
  const { gateway, chamadas } = fakeGateway({ sessionExists: true });
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: 'cloud-community',
      capacity: 12,
      commandId: 'c-2',
      windowId: 'w-2',
    },
    gateway,
  );
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas.slice(0, 2), ['createTargetSession', 'readTargetSession']);
});

test('sem comunidade sincronizada não há o que abrir', async () => {
  const { gateway, chamadas } = fakeGateway();
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: null,
      capacity: 12,
      commandId: 'c-3',
      windowId: 'w-3',
    },
    gateway,
  );
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.equal(
      resultado.error.message,
      'Esta comunidade ainda não está na nuvem. Sincronize antes de abrir a inscrição.',
    );
  }
  assert.deepEqual(chamadas, []);
});

test('entrar e sair usam o comando que veio de fora, então repetir não duplica', async () => {
  const { gateway, chamadas } = fakeGateway();
  await joinRegistration({ windowId: 'w-1', commandId: 'c-9', entryId: 'e-9' }, gateway);
  await joinRegistration({ windowId: 'w-1', commandId: 'c-9', entryId: 'e-9' }, gateway);
  await leaveRegistration({ windowId: 'w-1', commandId: 'c-10' }, gateway);
  assert.deepEqual(
    chamadas.filter((chamada) => chamada.startsWith('join') || chamada.startsWith('leave')),
    ['join:c-9', 'join:c-9', 'leave:c-10'],
  );
});

test('o organizador inclui, tira, muda a capacidade, fecha e reabre', async () => {
  const { gateway, chamadas } = fakeGateway();
  await addAthleteToRegistration(
    { windowId: 'w-1', playerCloudId: 'cloud-p1', commandId: 'c-11', entryId: 'e-11' },
    gateway,
  );
  await removeAthleteFromRegistration(
    { windowId: 'w-1', playerCloudId: 'cloud-p1', commandId: 'c-12' },
    gateway,
  );
  await changeRegistrationCapacity({ windowId: 'w-1', capacity: 16, commandId: 'c-13' }, gateway);
  await setRegistrationOpen(
    { windowId: 'w-1', open: false, expectedRevision: 3, commandId: 'c-14' },
    gateway,
  );
  await setRegistrationOpen(
    { windowId: 'w-1', open: true, expectedRevision: 4, commandId: 'c-15' },
    gateway,
  );

  assert.deepEqual(
    chamadas.filter((chamada) => chamada !== 'readBoard'),
    [
      'addEntry:cloud-p1',
      'removeEntry:cloud-p1',
      'changeCapacity:16',
      'closeWindow',
      'reopenWindow',
    ],
  );
});

test('as recusas do servidor viram frases do produto', async () => {
  const semPermissao = fakeGateway({ falhas: [coded('42501')] });
  const recusa = await joinRegistration(
    { windowId: 'w-1', commandId: 'c-16', entryId: 'e-16' },
    semPermissao.gateway,
  );
  assert.equal(recusa.ok, false);
  if (!recusa.ok) {
    assert.equal(
      recusa.error.message,
      'Você precisa ser membro ativo desta comunidade para se inscrever.',
    );
  }

  const fechada = fakeGateway({ falhas: [coded('23514')] });
  const bloqueada = await joinRegistration(
    { windowId: 'w-1', commandId: 'c-17', entryId: 'e-17' },
    fechada.gateway,
  );
  assert.equal(bloqueada.ok, false);
  if (!bloqueada.ok) {
    assert.equal(bloqueada.error.message, 'A inscrição está fechada. Fale com quem organiza.');
  }

  const desatualizada = fakeGateway({ falhas: [coded('40001')] });
  const conflito = await changeRegistrationCapacity(
    { windowId: 'w-1', capacity: 10, commandId: 'c-18' },
    desatualizada.gateway,
  );
  assert.equal(conflito.ok, false);
  if (!conflito.ok) {
    assert.equal(conflito.error.message, 'A lista mudou enquanto você olhava. Atualize e tente de novo.');
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && node --import tsx --test src/application/registrationUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Esperado: `Cannot find module './registrationUseCases'`.

- [ ] **Step 3: Implementar**

Criar `src/application/registrationUseCases.ts`:

```ts
import type { RegistrationBoard, Session } from '@shared/types';
import { registrationCloudService } from '@infra/supabase/registrationCloudService';
import { registrationBoardCloudService } from '@infra/supabase/registrationBoardCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { appOk, productError, type AppResult } from './appResult';
import type { RegistrationBoardGateway } from './registrationBoardGateway';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
} from './authorizedTeamFormationRules';

export const defaultRegistrationBoardGateway: RegistrationBoardGateway = {
  readSessionBoard: (sessionId) => registrationBoardCloudService.readSessionBoard(sessionId),
  readBoard: (windowId) => registrationBoardCloudService.readBoard(windowId),
  join: (input) => registrationBoardCloudService.join(input),
  leave: (input) => registrationBoardCloudService.leave(input),
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  readTargetSession: (sessionId) => sessionCohortCloudService.readTargetSession(sessionId),
  registration: registrationCloudService,
};

function codeOf(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function classify(step: string, error: unknown): AppResult<RegistrationBoard> {
  const code = codeOf(error);
  if (code === '42501' && (step === 'join' || step === 'leave')) {
    return productError(
      'permission_denied',
      'Você precisa ser membro ativo desta comunidade para se inscrever.',
    );
  }
  if (code === '23514') {
    return productError('invalid_input', 'A inscrição está fechada. Fale com quem organiza.');
  }
  if (code === '40001') {
    return productError(
      'invalid_input',
      'A lista mudou enquanto você olhava. Atualize e tente de novo.',
    );
  }
  return classifyAuthorizedFormationFailure(new AuthorizedFormationFailure(step, error));
}

async function comQuadro(
  step: string,
  windowId: string,
  gateway: RegistrationBoardGateway,
  acao: () => Promise<unknown>,
): Promise<AppResult<RegistrationBoard>> {
  try {
    await acao();
    return appOk(await gateway.readBoard(windowId));
  } catch (error) {
    return classify(step, error);
  }
}

export async function openRegistration(
  input: {
    session: Session;
    communityCloudId: string | null;
    capacity: number;
    commandId: string;
    windowId: string;
    onSessionChange?: (session: Session) => void;
  },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  if (!input.communityCloudId) {
    return productError(
      'invalid_input',
      'Esta comunidade ainda não está na nuvem. Sincronize antes de abrir a inscrição.',
    );
  }

  let session = input.session;
  try {
    let cloudId = session.authorityModel === 'target' ? session.cloudId : undefined;
    if (!cloudId) {
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
        if (codeOf(error) !== '23505') throw error;
        cloudId = (await gateway.readTargetSession(session.id)).id;
      }
      session = { ...session, cloudId, authorityModel: 'target' };
      input.onSessionChange?.(session);
    }

    const progress = session.authorizedFormation ?? { pendingCommandIds: {} };
    session = {
      ...session,
      authorizedFormation: { ...progress, windowId: input.windowId },
    };
    input.onSessionChange?.(session);

    const revision = await gateway.registration.createWindow({
      commandId: input.commandId,
      windowId: input.windowId,
      sessionId: cloudId,
      capacity: input.capacity,
    });
    await gateway.registration.openWindow({
      commandId: `${input.commandId}-open`,
      windowId: input.windowId,
      expectedRevision: revision,
    });
    return appOk(await gateway.readBoard(input.windowId));
  } catch (error) {
    return classify('openRegistration', error);
  }
}

export function joinRegistration(
  input: { windowId: string; commandId: string; entryId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('join', input.windowId, gateway, () =>
    gateway.join({ commandId: input.commandId, entryId: input.entryId, windowId: input.windowId }),
  );
}

export function leaveRegistration(
  input: { windowId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('leave', input.windowId, gateway, () =>
    gateway.leave({ commandId: input.commandId, windowId: input.windowId }),
  );
}

export function addAthleteToRegistration(
  input: { windowId: string; playerCloudId: string; commandId: string; entryId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('addEntry', input.windowId, gateway, () =>
    gateway.registration.addEntry({
      commandId: input.commandId,
      entryId: input.entryId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
    }),
  );
}

export function removeAthleteFromRegistration(
  input: { windowId: string; playerCloudId: string; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('removeEntry', input.windowId, gateway, () =>
    gateway.registration.removeEntry({
      commandId: input.commandId,
      windowId: input.windowId,
      playerId: input.playerCloudId,
      reason: 'ORGANIZER_DESELECTED',
    }),
  );
}

export function changeRegistrationCapacity(
  input: { windowId: string; capacity: number; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  return comQuadro('changeCapacity', input.windowId, gateway, () =>
    gateway.registration.changeCapacity({
      commandId: input.commandId,
      windowId: input.windowId,
      capacity: input.capacity,
    }),
  );
}

export function setRegistrationOpen(
  input: { windowId: string; open: boolean; expectedRevision: number; commandId: string },
  gateway: RegistrationBoardGateway = defaultRegistrationBoardGateway,
): Promise<AppResult<RegistrationBoard>> {
  const command = {
    commandId: input.commandId,
    windowId: input.windowId,
    expectedRevision: input.expectedRevision,
  };
  return comQuadro(input.open ? 'reopenWindow' : 'closeWindow', input.windowId, gateway, () =>
    input.open
      ? gateway.registration.reopenWindow(command)
      : gateway.registration.closeWindow(command),
  );
}
```

- [ ] **Step 4: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts > /dev/null && node --import tsx --test src/application/registrationUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts && git add -- src/application/registrationUseCases.ts src/application/registrationUseCases.test.ts && git commit -q -F - <<'EOF'
feat: casos de uso da inscricao

Abrir cria a Session no servidor quando preciso, cria a janela e abre; entrar,
sair, incluir, tirar, mudar capacidade, fechar e reabrir devolvem o quadro
atualizado. O id do comando vem de fora, entao repetir a acao repete o mesmo
comando e o recibo do servidor evita duplicar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `ℹ pass 6`, `ℹ fail 0`.

---

### Task 5: O hook que mantém o quadro

**Files:**

- Create: `src/hooks/useRegistrationBoard.ts`
- Test: `src/hooks/useRegistrationBoard.spec.tsx`

**Interfaces:**

- Consumes: os casos de uso da Tarefa 4; `generateUUID` de `src/logic/uuid.ts`.
- Produces: `useRegistrationBoard(input: UseRegistrationBoardInput): RegistrationBoardApi`, com

```ts
export interface UseRegistrationBoardInput {
  session: Session | null;
  communityCloudId: string | null;
  defaultCapacity: number;
  onSessionChange?: (session: Session) => void;
}

export interface RegistrationBoardApi {
  board: RegistrationBoard | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  open: () => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  addAthlete: (playerCloudId: string) => Promise<void>;
  removeAthlete: (playerCloudId: string) => Promise<void>;
  changeCapacity: (capacity: number) => Promise<void>;
  setOpen: (open: boolean) => Promise<void>;
}
```

O hook guarda o id do comando da ação em curso numa `ref`: se a mesma ação for repetida depois de um erro, ela reenvia o mesmo id, e o recibo do servidor faz o resto.

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/hooks/useRegistrationBoard.spec.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationBoard } from '../types';
import { makeSession } from '../test/fixtures';
import { useRegistrationBoard } from './useRegistrationBoard';

const casos = vi.hoisted(() => ({
  readSessionBoard: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  open: vi.fn(),
}));

vi.mock('../application/registrationUseCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../application/registrationUseCases')>();
  return {
    ...actual,
    defaultRegistrationBoardGateway: {
      ...actual.defaultRegistrationBoardGateway,
      readSessionBoard: casos.readSessionBoard,
    },
    joinRegistration: casos.join,
    leaveRegistration: casos.leave,
    openRegistration: casos.open,
  };
});

const quadro: RegistrationBoard = {
  windowId: 'w-1',
  sessionId: 'cloud-session',
  status: 'OPEN',
  revision: 2,
  capacity: 12,
  confirmedCount: 1,
  waitlistedCount: 0,
  viewerCanManage: false,
  viewerPlayerId: 'p-1',
  viewerEntryStatus: null,
  viewerQueuePosition: null,
  entries: [],
};

function render(sessionOverrides = {}) {
  const session = makeSession('session-1', {
    communityId: 'community-1',
    cloudId: 'cloud-session',
    authorityModel: 'target',
    ...sessionOverrides,
  });
  return renderHook(() =>
    useRegistrationBoard({
      session,
      communityCloudId: 'cloud-community',
      defaultCapacity: 12,
    }),
  );
}

describe('useRegistrationBoard', () => {
  beforeEach(() => {
    casos.readSessionBoard.mockReset();
    casos.join.mockReset();
    casos.leave.mockReset();
    casos.open.mockReset();
    casos.readSessionBoard.mockResolvedValue(quadro);
  });

  it('carrega o quadro da sessão ao montar', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board?.windowId).toBe('w-1');
    expect(casos.readSessionBoard).toHaveBeenCalledWith('cloud-session');
  });

  it('inscrever-se troca o quadro pelo que o servidor devolveu', async () => {
    casos.join.mockResolvedValue({
      ok: true,
      value: { ...quadro, viewerEntryStatus: 'WAITLISTED', viewerQueuePosition: 2 },
    });
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join();
    });

    expect(result.current.board?.viewerEntryStatus).toBe('WAITLISTED');
    expect(result.current.board?.viewerQueuePosition).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('repetir a ação depois de um erro reenvia o mesmo comando', async () => {
    casos.join
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'technical', message: 'Sem conexão.', recoverable: true },
      })
      .mockResolvedValueOnce({ ok: true, value: quadro });
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join();
    });
    expect(result.current.error).toBe('Sem conexão.');

    await act(async () => {
      await result.current.join();
    });
    expect(result.current.error).toBeNull();
    expect(casos.join.mock.calls[0][0].commandId).toBe(casos.join.mock.calls[1][0].commandId);
  });

  it('sem sessão na nuvem, não tenta ler', async () => {
    casos.readSessionBoard.mockClear();
    const { result } = render({ cloudId: undefined, authorityModel: 'legacy' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(casos.readSessionBoard).not.toHaveBeenCalled();
    expect(result.current.board).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && npx vitest run src/hooks/useRegistrationBoard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Esperado: `Failed to resolve import "./useRegistrationBoard"`.

- [ ] **Step 3: Implementar o hook**

Criar `src/hooks/useRegistrationBoard.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegistrationBoard, Session } from '../types';
import type { AppResult } from '../application/appResult';
import {
  addAthleteToRegistration,
  changeRegistrationCapacity,
  defaultRegistrationBoardGateway,
  joinRegistration,
  leaveRegistration,
  openRegistration,
  removeAthleteFromRegistration,
  setRegistrationOpen,
} from '../application/registrationUseCases';
import { generateUUID } from '../logic/uuid';

export interface UseRegistrationBoardInput {
  session: Session | null;
  communityCloudId: string | null;
  defaultCapacity: number;
  onSessionChange?: (session: Session) => void;
}

export interface RegistrationBoardApi {
  board: RegistrationBoard | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  open: () => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  addAthlete: (playerCloudId: string) => Promise<void>;
  removeAthlete: (playerCloudId: string) => Promise<void>;
  changeCapacity: (capacity: number) => Promise<void>;
  setOpen: (open: boolean) => Promise<void>;
}

export function useRegistrationBoard(input: UseRegistrationBoardInput): RegistrationBoardApi {
  const sessionCloudId =
    input.session?.authorityModel === 'target' ? (input.session.cloudId ?? null) : null;
  const [board, setBoard] = useState<RegistrationBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Record<string, { commandId: string; entryId: string }>>({});

  useEffect(() => {
    let active = true;
    if (!sessionCloudId) {
      setBoard(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    defaultRegistrationBoardGateway
      .readSessionBoard(sessionCloudId)
      .then((next) => {
        if (active) setBoard(next);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar a inscrição. Tente de novo.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionCloudId]);

  const comando = (chave: string) => {
    const atual = pending.current[chave];
    if (atual) return atual;
    const novo = { commandId: generateUUID(), entryId: generateUUID() };
    pending.current[chave] = novo;
    return novo;
  };

  const executar = useCallback(
    async (chave: string, acao: (ids: { commandId: string; entryId: string }) => Promise<AppResult<RegistrationBoard>>) => {
      setBusy(true);
      setError(null);
      const ids = comando(chave);
      const resultado = await acao(ids);
      setBusy(false);
      if (resultado.ok) {
        delete pending.current[chave];
        setBoard(resultado.value);
        return;
      }
      setError(resultado.error.message);
    },
    [],
  );

  const exigirJanela = (): string | null => board?.windowId ?? null;

  return {
    board,
    loading,
    busy,
    error,
    open: () =>
      executar('open', (ids) =>
        openRegistration({
          session: input.session as Session,
          communityCloudId: input.communityCloudId,
          capacity: input.defaultCapacity,
          commandId: ids.commandId,
          windowId: ids.entryId,
          onSessionChange: input.onSessionChange,
        }),
      ),
    join: () =>
      executar('join', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return joinRegistration({ windowId, commandId: ids.commandId, entryId: ids.entryId });
      }),
    leave: () =>
      executar('leave', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return leaveRegistration({ windowId, commandId: ids.commandId });
      }),
    addAthlete: (playerCloudId) =>
      executar(`add:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return addAthleteToRegistration({
          windowId,
          playerCloudId,
          commandId: ids.commandId,
          entryId: ids.entryId,
        });
      }),
    removeAthlete: (playerCloudId) =>
      executar(`remove:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return removeAthleteFromRegistration({
          windowId,
          playerCloudId,
          commandId: ids.commandId,
        });
      }),
    changeCapacity: (capacity) =>
      executar(`capacity:${capacity}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return changeRegistrationCapacity({ windowId, capacity, commandId: ids.commandId });
      }),
    setOpen: (open) =>
      executar(`setOpen:${open}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId || !board) throw new Error('Sem janela de inscrição');
        return setRegistrationOpen({
          windowId,
          open,
          expectedRevision: board.revision,
          commandId: ids.commandId,
        });
      }),
  };
}
```

- [ ] **Step 4: Rodar, tipar, lintar e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx > /dev/null && npx vitest run src/hooks/useRegistrationBoard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx && git add -- src/hooks/useRegistrationBoard.ts src/hooks/useRegistrationBoard.spec.tsx && git commit -q -F - <<'EOF'
feat: hook do quadro de inscricao

Carrega o quadro da sessao, executa a acao e troca o quadro pelo que o servidor
devolveu. O id do comando fica guardado por acao: repetir depois de um erro
reenvia o mesmo, e o recibo do servidor evita duplicar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `Tests  4 passed (4)`.

---

### Task 6: A tela

**Files:**

- Create: `src/components/session/RegistrationBoardView.tsx`
- Test: `src/components/session/RegistrationBoardView.spec.tsx`

**Interfaces:**

- Consumes: `RegistrationBoardApi` (Tarefa 5); `Player` e `getPlayerDisplayName` de `@logic/community`; `calculateGeneralOverall` de `@logic/calculations`.
- Produces: `RegistrationBoardView({ api, players, sessionName, sessionDate })`, onde `players` são os atletas da comunidade já carregados pelo app.

- [ ] **Step 1: Dar forma à tela antes de escrevê-la**

Invocar a skill `/impeccable shape` com este resumo, e seguir o que ela devolver:

> Tela de inscrição de uma pelada marcada, em pt-BR, dentro de um app de vôlei local-first que usa
> Tailwind e daisyUI. Dois modos na mesma tela. **Atleta:** precisa saber, em um olhar, se está
> dentro, na reserva (com a posição) ou fora, quantas vagas restam, e ter um botão só para entrar
> ou sair. **Organizador:** o mesmo, mais capacidade editável, as duas listas com nome, posição,
> overall e presença recente, e as ações de incluir, tirar, fechar e reabrir. Estados a desenhar:
> sem janela ainda (o organizador vê o convite para abrir), aberta, cheia com reserva, fechada,
> travada, sem conexão e erro de ação. A lista é a parte gamificada: ela mostra quem já está,
> com o overall, e deve dar vontade de entrar.

O que a skill decidir sobre forma vale; o comportamento abaixo é o contrato e não muda.

- [ ] **Step 2: Escrever o spec que falha**

Criar `src/components/session/RegistrationBoardView.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistrationBoard } from '../../types';
import { makePlayer } from '../../test/fixtures';
import type { RegistrationBoardApi } from '../../hooks/useRegistrationBoard';
import { RegistrationBoardView } from './RegistrationBoardView';

const players = [
  makePlayer('a', { cloudId: 'cloud-a', nome: 'Ana' }),
  makePlayer('b', { cloudId: 'cloud-b', nome: 'Bia' }),
  makePlayer('c', { cloudId: 'cloud-c', nome: 'Caio' }),
];

function board(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-session',
    status: 'OPEN',
    revision: 2,
    capacity: 2,
    confirmedCount: 2,
    waitlistedCount: 1,
    viewerCanManage: false,
    viewerPlayerId: 'cloud-c',
    viewerEntryStatus: 'WAITLISTED',
    viewerQueuePosition: 1,
    entries: [
      {
        entryId: 'e-a',
        playerId: 'cloud-a',
        status: 'CONFIRMED',
        queuePosition: null,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:00:00.000Z',
      },
      {
        entryId: 'e-b',
        playerId: 'cloud-b',
        status: 'CONFIRMED',
        queuePosition: null,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:01:00.000Z',
      },
      {
        entryId: 'e-c',
        playerId: 'cloud-c',
        status: 'WAITLISTED',
        queuePosition: 1,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:02:00.000Z',
      },
    ],
    ...overrides,
  };
}

function api(overrides: Partial<RegistrationBoardApi> = {}): RegistrationBoardApi {
  return {
    board: board(),
    loading: false,
    busy: false,
    error: null,
    open: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    addAthlete: vi.fn(),
    removeAthlete: vi.fn(),
    changeCapacity: vi.fn(),
    setOpen: vi.fn(),
    ...overrides,
  };
}

function renderView(overrides: Partial<RegistrationBoardApi> = {}) {
  const contrato = api(overrides);
  render(
    <RegistrationBoardView
      api={contrato}
      players={players}
      sessionName="Pelada de quinta"
      sessionDate="2026-09-24"
    />,
  );
  return contrato;
}

describe('RegistrationBoardView', () => {
  it('mostra os confirmados e a reserva com a posição', () => {
    renderView();
    expect(screen.getByText('Ana')).toBeDefined();
    expect(screen.getByText('Bia')).toBeDefined();
    const reserva = screen.getByRole('list', { name: /reserva/i });
    expect(reserva.textContent).toContain('Caio');
    expect(reserva.textContent).toContain('1');
  });

  it('diz ao atleta que ele está na reserva e oferece sair', () => {
    const contrato = renderView();
    expect(screen.getByRole('status').textContent).toMatch(/reserva/i);
    fireEvent.click(screen.getByRole('button', { name: /sair da lista/i }));
    expect(contrato.leave).toHaveBeenCalledTimes(1);
  });

  it('oferece entrar para quem está fora, e mostra as vagas', () => {
    const contrato = renderView({
      board: board({ viewerEntryStatus: null, viewerQueuePosition: null, capacity: 4, confirmedCount: 2, waitlistedCount: 0 }),
    });
    expect(screen.getByText(/2 vagas/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /quero jogar/i }));
    expect(contrato.join).toHaveBeenCalledTimes(1);
  });

  it('para quem organiza, mostra capacidade editável e as ações da janela', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    fireEvent.change(screen.getByLabelText(/vagas/i), { target: { value: '6' } });
    fireEvent.blur(screen.getByLabelText(/vagas/i));
    expect(contrato.changeCapacity).toHaveBeenCalledWith(6);

    fireEvent.click(screen.getByRole('button', { name: /fechar inscri/i }));
    expect(contrato.setOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getAllByRole('button', { name: /tirar da lista/i })[0]);
    expect(contrato.removeAthlete).toHaveBeenCalledWith('cloud-a');
  });

  it('sem janela, quem organiza vê o convite para abrir e o atleta vê a espera', () => {
    const doOrganizador = renderView({ board: null });
    expect(screen.queryByRole('button', { name: /abrir inscri/i })).toBeNull();

    render(
      <RegistrationBoardView
        api={api({ board: null })}
        players={players}
        sessionName="Pelada de quinta"
        sessionDate="2026-09-24"
        canOpen
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir inscri/i }));
    expect(doOrganizador.open).not.toHaveBeenCalled();
  });

  it('mostra o erro da última ação', () => {
    renderView({ error: 'A inscrição está fechada. Fale com quem organiza.' });
    expect(screen.getByRole('alert').textContent).toContain('A inscrição está fechada');
  });

  it('inscrição fechada não oferece entrar', () => {
    renderView({ board: board({ status: 'CLOSED', viewerEntryStatus: null }) });
    expect(screen.queryByRole('button', { name: /quero jogar/i })).toBeNull();
    expect(screen.getByText(/fechada/i)).toBeDefined();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && npx vitest run src/components/session/RegistrationBoardView.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Esperado: `Failed to resolve import "./RegistrationBoardView"`.

- [ ] **Step 4: Escrever o componente**

Escrever `src/components/session/RegistrationBoardView.tsx` seguindo a forma que a skill devolveu no Passo 1 e satisfazendo o spec do Passo 2. O contrato de propriedades:

```tsx
interface RegistrationBoardViewProps {
  api: RegistrationBoardApi;
  players: Player[];
  sessionName: string;
  sessionDate: string;
  canOpen?: boolean;
}
```

Regras de comportamento que os testes fixam:

- cada entrada vira uma linha com o nome do atleta (`getPlayerDisplayName`), a posição principal, o overall (`calculateGeneralOverall`) e a presença recente; atleta sem correspondência local aparece com o nome "Atleta da comunidade";
- a lista de reserva é um `role="list"` com nome acessível contendo "reserva", e cada linha mostra a posição;
- a situação de quem olha fica num `role="status"`;
- um botão só alterna: "Quero jogar" quando `viewerEntryStatus` é nulo e a janela está `OPEN`; "Sair da lista" quando já está dentro ou na reserva;
- `viewerCanManage` liga o campo de vagas (rótulo contendo "vagas", que dispara `changeCapacity` no `blur`), os botões "Tirar da lista" por linha, "Fechar inscrição" e, quando `status` é `CLOSED`, "Reabrir inscrição";
- `error` aparece num `role="alert"`;
- `busy` desabilita os botões;
- sem quadro e com `canOpen`, aparece "Abrir inscrição"; sem `canOpen`, uma frase dizendo que quem organiza ainda não abriu.

- [ ] **Step 5: Rodar até passar, e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx > /dev/null && npx vitest run src/components/session/RegistrationBoardView.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx && git add -- src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx && git commit -q -F - <<'EOF'
feat: tela da inscricao com as duas listas

Confirmados e reserva com posicao, nome, posicao em quadra, overall e presenca
recente. O atleta ve a propria situacao e tem um botao que alterna entre entrar
e sair; quem organiza edita as vagas, tira alguem, fecha e reabre. Forma dada
pela skill impeccable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `Tests  7 passed (7)`.

---

### Task 7: A rota e as portas

**Files:**

- Modify: `src/application/appRoutes.ts`, `src/application/appRoutes.test.ts`
- Modify: `src/app/routes/sessionRoutes.tsx`, `src/app/AppRouter.tsx`
- Modify: `src/application/agendaViewModel.ts` e `src/app/routes/globalRoutes.tsx` (Agenda)
- Modify: `src/application/screens/dashboard/dashboardModel.ts`, `dashboardContract.ts`, `src/components/dashboard/Dashboard.tsx` (cartão da próxima pelada)
- Test: `src/app/AppRouter.spec.tsx`

**Interfaces:**

- Consumes: `RegistrationBoardView` (Tarefa 6), `useRegistrationBoard` (Tarefa 5).
- Produces: `paths.inscricao(communityId, sessionId)`; rota `CommunityRegistrationRoute`; item de agenda levando à inscrição; campo `proximaPelada` no modelo do painel.

- [ ] **Step 1: Endereço e título, com teste**

Em `src/application/appRoutes.test.ts`, acrescentar ao teste `paths das areas novas da comunidade`:

```ts
  assert.equal(
    paths.inscricao('c1', 's9'),
    '/comunidades/c1/sessoes/s9/inscricao',
  );
```

e ao teste de títulos:

```ts
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/s9/inscricao'), 'Inscrição');
```

Rodar `node --import tsx --test src/application/appRoutes.test.ts` e ver falhar.

Em `src/application/appRoutes.ts`, acrescentar ao objeto `paths`:

```ts
  inscricao: (communityId: string, sessionId: string) =>
    `/comunidades/${communityId}/sessoes/${sessionId}/inscricao`,
```

e, em `getPageTitleForPath`, dentro do `case 'sessoes':`, antes do `return 'Detalhe da Sessão';`:

```ts
      if (segments[4] === 'inscricao') return 'Inscrição';
```

- [ ] **Step 2: A rota**

Em `src/app/routes/sessionRoutes.tsx`, acrescentar:

```tsx
export function CommunityRegistrationRoute() {
  const shell = useCommunityShell();
  const { sessionId } = useParams();
  const { community, play, sess, comm } = shell;
  const permissions = useCommunityPermissions(community);
  const session = sess.sessions.find((item) => item.id === sessionId) ?? null;
  const communityCloudId = comm.communities.find((item) => item.id === community.id)?.cloudId ?? null;
  const api = useRegistrationBoard({
    session,
    communityCloudId,
    defaultCapacity: session?.config?.teamCount ? session.config.teamCount * 6 : 12,
    onSessionChange: (next) =>
      sess.setSessions((prev) => prev.map((item) => (item.id === next.id ? next : item))),
  });

  if (!session) return <Navigate to={paths.sessoes(community.id)} replace />;

  return (
    <RegistrationBoardView
      api={api}
      players={getCommunityPlayers(community.id, play.players)}
      sessionName={session.name}
      sessionDate={session.date}
      canOpen={permissions.canCreateSession}
    />
  );
}
```

Importar `useParams` de `react-router` se ainda não estiver importado no arquivo, `useRegistrationBoard` de `../../hooks/useRegistrationBoard`, `RegistrationBoardView` de `../../components/session/RegistrationBoardView` e `useCommunityPermissions` de `../../hooks/useCommunityPermissions`.

Em `src/app/AppRouter.tsx`, **antes** da rota `sessoes/:sessionId`:

```tsx
              <Route path="sessoes/:sessionId/inscricao" element={<CommunityRegistrationRoute />} />
```

e incluir `CommunityRegistrationRoute` na importação de `./routes/sessionRoutes`.

- [ ] **Step 3: As portas, com teste de rota**

Em `src/app/routes/globalRoutes.tsx`, na `AgendaRoute`, trocar o destino de sessão:

```tsx
            ? paths.inscricao(item.communityId, item.refId)
```

Em `src/components/dashboard/Dashboard.tsx`, o cartão da próxima pelada entra logo abaixo do bloco de alerta de sessão ativa, alimentado pelo modelo:

```tsx
      {model.proximaPelada && (
        <Link
          to={model.proximaPelada.to}
          className="card card-border bg-base-200 hover:bg-base-300 transition-colors"
        >
          <div className="card-body gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Próxima pelada
            </span>
            <p className="font-black">{model.proximaPelada.title}</p>
            <p className="text-xs text-base-content/70">{model.proximaPelada.subtitle}</p>
          </div>
        </Link>
      )}
```

Em `src/application/screens/dashboard/dashboardModel.ts`, acrescentar ao modelo:

```ts
  proximaPelada: { to: string; title: string; subtitle: string } | null;
```

e, no contrato do painel, derivar do mesmo cálculo que a Agenda usa: a primeira sessão futura não encerrada, com `to` apontando para `paths.inscricao(communityId, sessionId)`, `title` com o nome da pelada e `subtitle` com a data formatada por `formatLocalDateInput`. Quando não houver sessão futura, `null`.

Em `src/app/AppRouter.spec.tsx`, acrescentar:

```tsx
  it('a agenda leva à inscrição da pelada marcada', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    seedLocalDb({
      communities: [{ id: 'c1', name: 'Panelinha' }],
      sessions: [
        { id: 's1', name: 'Pelada de quinta', date: amanha, status: 'configured', communityId: 'c1' } as Partial<Session>,
      ],
    });
    renderApp('/comunidades/c1/sessoes/s1/inscricao');
    expect(await screen.findByRole('heading', { name: /inscri/i })).toBeTruthy();
  });
```

- [ ] **Step 4: Verificar e commitar**

```bash
cd /c/Volley-inscricao && F="src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/routes/sessionRoutes.tsx src/app/AppRouter.tsx src/app/routes/globalRoutes.tsx src/application/screens/dashboard/dashboardModel.ts src/components/dashboard/Dashboard.tsx src/app/AppRouter.spec.tsx" && npx prettier --write $F > /dev/null && node --import tsx --test src/application/appRoutes.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npx vitest run src/app src/components 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet $F && git add -A -- src && git commit -q -F - <<'EOF'
feat: rota e portas da inscricao

A inscricao ganha endereco proprio por sessao, a agenda passa a levar ate ela
em vez da sessao sem contexto, e o painel ganha o cartao da proxima pelada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: O sorteio adota a janela

**Files:**

- Modify: `src/application/authorizedTeamFormationUseCases.ts`
- Test: `src/application/authorizedTeamFormationUseCases.test.ts`

**Interfaces:**

- Consumes: `RegistrationGateway.readWindow` (já existe), `AuthorizedFormationProgress.windowId`.
- Produces: comportamento novo de `prepareAuthorizedTeamFormation` — quando a janela já existe e tem confirmados, o elenco sai dela.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/application/authorizedTeamFormationUseCases.test.ts`, acrescentar ao final:

```ts
test('com inscrição aberta, o elenco sai dos confirmados e a seleção local não manda', async () => {
  const { gateway, windows, calls } = fakeGateway({ sessionExists: true });
  const windowId = 'janela-existente';
  windows.set(windowId, {
    sessionId: CLOUD,
    status: 'OPEN',
    revision: 4,
    capacity: 4,
    confirmed: ['cloud-a', 'cloud-b'],
    finalized: new Map(),
  });

  const session = makeSession('session-1', {
    communityId: 'community-1',
    cloudId: CLOUD,
    authorityModel: 'target',
    authorizedFormation: { windowId, pendingCommandIds: {} },
  });

  const output = await prepareAuthorizedTeamFormation(
    {
      session,
      communityCloudId: CLOUD,
      players: [makePlayer('a', { cloudId: 'cloud-a' }), makePlayer('c', { cloudId: 'cloud-c' })],
      teamCount: 2,
      config: makeFreePlayConfig(),
      createId: () => 'c-novo',
    },
    gateway,
  );

  assert.equal(output.result?.ok, true);
  assert.equal(
    calls.some((call) => call.startsWith('addEntry')),
    false,
    'não inscreve de novo quem a janela já confirmou',
  );
  assert.equal(
    calls.some((call) => call.startsWith('removeEntry')),
    false,
    'não tira quem a inscrição confirmou só porque o wizard não o selecionou',
  );
});
```

Se o `fakeGateway` do arquivo ainda não expuser `windows`, acrescente `windows` ao seu retorno: ele já mantém esse mapa internamente.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-inscricao && node --import tsx --test src/application/authorizedTeamFormationUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" | head -3
```

Esperado: o caso novo falha — hoje a cadeia sincroniza a janela pela seleção local, então ela chamaria `removeEntry` para `cloud-b` e `addEntry` para `cloud-c`.

- [ ] **Step 3: Implementar**

Em `src/application/authorizedTeamFormationUseCases.ts`, dentro de `syncRegistration`, logo depois de a janela ser lida e antes do bloco que compara `confirmed` com `playerCloudIds`, acrescentar:

```ts
    const inscricaoAberta =
      window.status === 'OPEN' && window.confirmedPlayerIds.length > 0 && !!progress.windowId;
    if (inscricaoAberta) {
      let revisaoAtual = window.revision;
      revisaoAtual = await lifecycle('closeWindow', (c) => gateway.registration.closeWindow(c));
      revisaoAtual = await lifecycle('lockWindow', (c) => gateway.registration.lockWindow(c));
      const finalizada = await command('finalizeRoster', (commandId) =>
        gateway.registration.finalizeRoster({
          commandId,
          windowId: id,
          expectedRevision: revisaoAtual,
        }),
      );
      commit({
        finalizedRosterRevisionId: finalizada.rosterRevisionId,
        finalizedPlayerCloudIds: window.confirmedPlayerIds,
      });
      return finalizada.rosterRevisionId;
    }
```

O `lifecycle` e o `command` já existem na função; `id` é o identificador da janela que ela já resolveu.

- [ ] **Step 4: Rodar tudo e commitar**

```bash
cd /c/Volley-inscricao && npx prettier --write src/application/authorizedTeamFormationUseCases.ts src/application/authorizedTeamFormationUseCases.test.ts > /dev/null && node --import tsx --test src/application/authorizedTeamFormationUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/authorizedTeamFormationUseCases.ts src/application/authorizedTeamFormationUseCases.test.ts && git add -- src/application/authorizedTeamFormationUseCases.ts src/application/authorizedTeamFormationUseCases.test.ts && git commit -q -F - <<'EOF'
feat: o sorteio adota a inscricao aberta

Quando a sessao ja tem janela com confirmados, a cadeia fecha, trava e finaliza
o elenco a partir deles, em vez de sincronizar pela selecao do wizard. Sessao
sem inscricao segue pelo caminho de antes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

Esperado: `ℹ fail 0`.

---

### Task 9: Documentação e gates

**Files:**

- Modify: `HANDOFF.md`, `docs/architecture/execution/C6-REACHABILITY-MAP.md`, `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`

**Interfaces:**

- Consumes: Tarefas 1 a 8.
- Produces: documentação.

- [ ] **Step 1: Mapa de alcançabilidade**

Na tabela `### Alcançável`, acrescentar uma linha depois da linha que começa com `| Publicar candidatos`:

`| Inscrição da pelada | tela | \`RegistrationBoardView\` → \`useRegistrationBoard\` → \`registrationUseCases\` → \`create_registration_window\`, \`open_registration\`, \`close_registration\`, \`reopen_registration\`, \`join_registration\`, \`leave_registration\`, \`add_registration_entry\`, \`remove_registration_entry\`, \`change_registration_capacity\`, \`read_registration_board\`, \`read_session_registration\` |`

Na tabela `### Não alcançável`, na linha `**W4 (restante)**`, remover `join/leave_registration`, deixando `inspect_registration_introduction` e `introduce_registration_from_legacy_roster`. Se a linha ficar só com esses dois, mantenha-a.

Trocar "**22 são alcançáveis**" por "**24 são alcançáveis**" e acrescentar, depois da frase que termina em "pelo botão Publicar.", esta: "A tela de inscrição somou as duas leituras novas e trouxe `join_registration` e `leave_registration` para o alcance do atleta, que até aqui não tinha comando nenhum."

Rodar `npx prettier --write docs/architecture/execution/C6-REACHABILITY-MAP.md`.

- [ ] **Step 2: C6.02**

Em `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, no fim da seção `## XS-W4-03 — JoinRegistration authoritative transaction`, acrescentar:

```markdown
### Reachable since 2026-09-22

A tela de inscrição (`docs/superpowers/specs/2026-09-22-registration-screen-design.md`) deu caminho
a `join_registration` e `leave_registration`: o atleta membro entra e sai pela própria mão, e o
servidor decide entre confirmado e reserva. `read_registration_board` e `read_session_registration`
acrescentaram a leitura que faltava, autorizada por membro ativo em vez de organizador.
```

- [ ] **Step 3: HANDOFF**

Inserir, antes da linha `### Navegação da comunidade unificada — 2026-09-21`:

```markdown
### A inscrição ganhou tela — 2026-09-22

Branch `exec/registration-screen`, worktree `C:\Volley-inscricao`. Ver a
[spec](docs/superpowers/specs/2026-09-22-registration-screen-design.md) e o
[plano](docs/superpowers/plans/2026-09-22-registration-screen.md).

A onda W4 inteira rodava escondida atrás do botão de gerar times. Agora a inscrição pertence à
sessão marcada: o organizador abre dias antes, os atletas se inscrevem sozinhos, quem passa da
capacidade entra na reserva, e quem desiste libera a vaga para o primeiro da fila.

- `20260922120000_registration_board.sql`: `read_registration_board` e `read_session_registration`,
  autorizadas por membro ativo da comunidade, com a reserva, as posições e o que quem lê pode fazer.
  A leitura da XS-W6-08c continua intacta, porque a cadeia do sorteio depende dela.
- Tela em `/comunidades/:id/sessoes/:sessionId/inscricao`, com dois modos; portas pela Agenda e pelo
  cartão da próxima pelada no painel.
- O sorteio passou a adotar a janela aberta: o elenco sai dos confirmados, e a seleção do wizard
  deixou de competir com a inscrição.

**Próxima fatia, já decidida com o usuário:** a vaga se confirma pelo **pagamento**. O organizador
marca cada atleta como pago, a reserva passa a ser ordenada por quem pagou primeiro, o organizador
pode ajustar essa ordem, e a lista só fecha para o sorteio com o pagamento em dia. Isso reabre
`OPEN-REG-004` (fila estritamente por chegada) e `OPEN-REG-005` (pagamento fora do V1).

**Migration não aplicada no Panelinha e sem push**: ambos esperam o ok do usuário.
```

- [ ] **Step 4: Todos os gates**

```bash
cd /c/Volley-inscricao && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& npx prettier --write HANDOFF.md docs/architecture/execution/C6-REACHABILITY-MAP.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md > /dev/null \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues'; \
npm test > /tmp/insc-test.log 2>&1; grep -E "^ℹ (pass|fail)|Tests +[0-9]|Test Files" /tmp/insc-test.log; \
npm run check:architecture > /dev/null && echo ARCH ok && npm run build > /tmp/insc-build.log 2>&1 && echo BUILD ok
```

Depois a suíte de banco completa:

```bash
cd /c/Volley-inscricao && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db > /tmp/insc-db.log 2>&1; grep -E "^ℹ (tests|pass|fail)" /tmp/insc-db.log; grep -A25 "✖ failing" /tmp/insc-db.log | head -60
```

Esperado: tudo verde; `ℹ fail 0` com os 741 de antes mais os 10 das Tarefas 1 e 2.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-inscricao && git add -- HANDOFF.md docs/architecture/execution && git commit -q -F - <<'EOF'
docs: registra a tela de inscricao

Mapa de alcancabilidade soma as leituras novas e o alcance do atleta, C6.02
registra que join e leave viraram alcancaveis, e o HANDOFF descreve a fatia e a
proxima, do pagamento, que reabre OPEN-REG-004 e OPEN-REG-005.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -10 && git status --short
```
