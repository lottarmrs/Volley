# Ficha do atleta — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quem tem conta preenche e cuida da própria ficha (pedida no cadastro), ninguém mais a altera, e a tela de edição de atleta dá lugar a Gestão → Convidados para atletas sem conta.

**Architecture:** o servidor decide quando a ficha está completa (`ensure_account_ready` devolve `needs_athlete_profile`), grava pela RPC `update_my_athlete_profile` e recusa na policy de `update` qualquer alteração de ficha com conta por outra conta. O cliente ganha o estado `athlete_profile` na máquina de sessão, a rota `/completar-ficha`, um formulário único (`AthleteProfileForm`) usado no cadastro, em "Minha ficha" e em Convidados, e remove a `PlayerEditView` com todas as suas entradas.

**Tech Stack:** PostgreSQL/Supabase (plpgsql, RLS), React 19 + Vite 6 + TypeScript, react-router 7, daisyUI, Node test runner (`.test.ts`), Vitest + RTL (`.spec.tsx`), harness de Postgres real (`.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-ficha-do-atleta-design.md`

## Global Constraints

- Uma migration: `supabase/migrations/20260928120000_ficha_do_atleta.sql`, construída nas Tasks 1–3. Não aplicar em produção antes da Task 12.
- Toda função redefinida parte da **última** definição e repete `security definer` e `search_path`. Conferir a última com `grep -ln "create or replace function public.<nome>\|create function public.<nome>" supabase/migrations/*.sql` antes de copiar.
- Gênero aceito pela RPC: `M`, `F`. Posições: `levantador`, `oposto`, `ponteiro`, `central`, `libero`, `all-rounder`. Mão: `direita`, `esquerda`. Altura: 120 a 230 cm.
- Nível sem nuvem: 1 a 5; `atributos = buildLevelAttributes(nivel)` (`src/application/quickStart.ts`), gravado só quando o nível mudou.
- "Sem nuvem" = a comunidade não tem `cloudId` **ou** `auth.isSupabaseConfigured` é falso.
- UI em pt-BR. Sem comentários novos no código-fonte TS/TSX. Prettier: aspas simples, 100 colunas. Imports por alias.
- `tsc` aqui não pega prop desconhecida em componente: todo componente novo tem `.spec.tsx` que fixa as props. Componentes renderizados com `key` usam `FC<…>`.
- Banco: `VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55500/volley_test"` (container `volley_test_pg2`). Um arquivo: `node --import tsx --test src/test/db/<arquivo>.dbtest.ts`.
- Trabalhar numa worktree própria (padrão da sessão anterior): `git worktree add C:/Volley-ficha -b exec/ficha-do-atleta main`, e ligar `node_modules` por junção (`New-Item -ItemType Junction`); ao remover, desfazer a junção com `cmd /c rmdir` **antes** de `git worktree remove`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git add` só por caminho. **Sem push** e sem migration em produção antes do ok do usuário.

## Emenda da spec

A verificação para o plano achou que o envio de foto do atleta (`AvatarUpload`, fluxo de aprovação) só existe dentro da `PlayerEditView`. "Minha ficha" passa a hospedá-lo (Task 8). A Task 11 registra a emenda na spec.

---

### Task 1: Ficha completa e o estado da conta

**Files:**
- Create: `supabase/migrations/20260928120000_ficha_do_atleta.sql`
- Create: `src/test/db/fichaDoAtleta.dbtest.ts`

**Interfaces:**
- Produces: `app_private.athlete_profile_complete(p_player_id uuid) returns boolean`; `ensure_account_ready` devolvendo `state = 'needs_athlete_profile'`. Helpers de teste `conta()`, `como()`, `recusa()`, `estado()`, `fichaDe()` usados pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260928120000_ficha_do_atleta.sql';

if (!isTestDatabaseConfigured()) {
  test(`ficha do atleta requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(result.failures.filter(({ migration }) => migration === MIGRATION).length, 0);
  });

  test.after(async () => {
    await client?.end();
  });

  async function como<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function recusa(actor: string, sql: string, args: unknown[], codigo: string, mensagem?: RegExp) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, codigo);
      if (mensagem) assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  async function conta(rotulo: string, username: string | null = `u${randomUUID().slice(0, 8)}`) {
    const email = `ficha-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id',
      [email],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [username]);
    return id;
  }

  async function estado(userId: string): Promise<string> {
    const { rows } = await como<{ state: string }>(
      userId,
      'select state from public.ensure_account_ready(null)',
    );
    return rows[0].state;
  }

  async function fichaDe(userId: string) {
    const { rows } = await client.query<{
      id: string;
      gender: string | null;
      primary_position: string | null;
      height: string | null;
      dominant_hand: string | null;
      nickname: string | null;
      secondary_positions: string[];
      status: Record<string, unknown>;
      owner_id: string;
    }>('select * from public.players where user_id = $1 and deleted_at is null', [userId]);
    return rows[0];
  }

  async function completa(userId: string) {
    await client.query(
      `update public.players
          set gender = 'F', primary_position = 'levantador', height = 170, dominant_hand = 'direita'
        where user_id = $1`,
      [userId],
    );
  }

  test('sem nome de usuario, needs_username vem antes de tudo', async () => {
    const id = await conta('sem-username', null);
    assert.equal(await estado(id), 'needs_username');
  });

  test('com nome de usuario e ficha vazia, needs_athlete_profile', async () => {
    const id = await conta('vazia');
    assert.equal(await estado(id), 'needs_athlete_profile');
  });

  test('faltando qualquer um dos quatro obrigatorios, continua needs_athlete_profile', async () => {
    for (const coluna of ['gender', 'primary_position', 'height', 'dominant_hand']) {
      const id = await conta(`falta-${coluna}`);
      await completa(id);
      await client.query(`update public.players set ${coluna} = null where user_id = $1`, [id]);
      assert.equal(await estado(id), 'needs_athlete_profile', `sem ${coluna}`);
    }
  });

  test('com os quatro obrigatorios, ready', async () => {
    const id = await conta('completa');
    await completa(id);
    assert.equal(await estado(id), 'ready');
  });
}
```

(`conta()` insere `email_confirmed_at` porque `handle_new_user` e o harness criam o perfil e a ficha a partir de `auth.users`; se a coluna não existir no `auth.users` do harness, remover do `insert` — conferir em `src/test/db/harness.ts`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: FAIL — `com nome de usuario e ficha vazia` recebe `'ready'`.

- [ ] **Step 3: Escrever a migration**

```sql
-- Ficha do atleta (spec 2026-09-28-ficha-do-atleta-design.md).
--
-- Decisao do usuario em 2026-09-28: quem tem conta preenche a propria ficha no cadastro,
-- com genero, posicao principal, altura e mao dominante obrigatorios; ninguem alem da conta
-- altera essa ficha. Em producao, as 6 fichas com conta tinham so o nome.

create or replace function app_private.athlete_profile_complete(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.players p
     where p.id = p_player_id
       and p.gender is not null
       and p.primary_position is not null
       and p.height is not null
       and p.dominant_hand is not null
  );
$$;

revoke all on function app_private.athlete_profile_complete(uuid) from public, anon, authenticated;
```

Depois, copiar para o fim da migration o bloco `create or replace function public.ensure_account_ready(p_username text default null) … $$;` **inteiro** da última definição (`20260726110000_mandatory_mfa_and_aal2_enforcement.sql`, conferir com o grep da Global Constraints). Na cópia, trocar o ramo `else` final:

```sql
  else
    return query select
      case
        when app_private.athlete_profile_complete(v_player.id) then 'ready'
        else 'needs_athlete_profile'
      end::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username,
      public.account_requires_aal2(v_uid);
  end if;
```

Não copiar o `drop function` que abre aquele trecho no arquivo de origem: a assinatura não muda, e `create or replace` preserva os grants.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Rodar as suítes de conta**

Run: `for f in accountIdentity accountBootstrap mandatoryMfa; do [ -f src/test/db/$f.dbtest.ts ] && node --import tsx --test src/test/db/$f.dbtest.ts 2>&1 | grep -E "^ℹ (pass|fail)"; done` e `grep -rln "ensure_account_ready" src/test/db` para achar as demais; rodar cada uma.
Expected: sem falha, exceto assertivas que esperam `'ready'` de uma conta com ficha vazia — essas mudam para completar a ficha antes (usar o `update` de `completa()`), e o commit diz quais.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260928120000_ficha_do_atleta.sql src/test/db/fichaDoAtleta.dbtest.ts
git commit -m "feat(db): conta sem ficha completa responde needs_athlete_profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Incluir no `git add` qualquer suíte ajustada no Step 5.)

---

### Task 2: A RPC que grava a própria ficha

**Files:**
- Modify: `supabase/migrations/20260928120000_ficha_do_atleta.sql` (acrescentar ao fim)
- Modify: `src/test/db/fichaDoAtleta.dbtest.ts`

**Interfaces:**
- Produces: `public.update_my_athlete_profile(p_gender text, p_primary_position text, p_height_cm numeric, p_dominant_hand text, p_nickname text, p_secondary_positions text[], p_injured boolean, p_physical_limitation text) returns text` (novo estado da conta).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar dentro do `else`:

```ts
  const GRAVA = 'select public.update_my_athlete_profile($1,$2,$3,$4,$5,$6,$7,$8) as estado';
  const valido = ['M', 'ponteiro', 182, 'direita', 'Zé', ['oposto'], null, null];

  test('grava a propria ficha e devolve ready', async () => {
    const id = await conta('grava');
    const { rows } = await como<{ estado: string }>(id, GRAVA, valido);
    assert.equal(rows[0].estado, 'ready');
    const ficha = await fichaDe(id);
    assert.equal(ficha.gender, 'M');
    assert.equal(ficha.primary_position, 'ponteiro');
    assert.equal(Number(ficha.height), 182);
    assert.equal(ficha.dominant_hand, 'direita');
    assert.equal(ficha.nickname, 'Zé');
    assert.deepEqual(ficha.secondary_positions, ['oposto']);
  });

  test('cada campo invalido e recusado com a propria mensagem', async () => {
    const id = await conta('invalido');
    const casos: Array<[number, unknown, RegExp]> = [
      [0, 'X', /gender/i],
      [0, null, /gender/i],
      [1, 'goleiro', /primary position/i],
      [1, null, /primary position/i],
      [2, 119, /height/i],
      [2, 231, /height/i],
      [2, null, /height/i],
      [3, 'ambas', /dominant hand/i],
      [3, null, /dominant hand/i],
      [5, ['goleiro'], /secondary/i],
      [5, ['oposto', 'oposto'], /secondary/i],
      [5, ['ponteiro'], /secondary/i],
    ];
    for (const [indice, valor, mensagem] of casos) {
      const args = [...valido];
      args[indice] = valor;
      await recusa(id, GRAVA, args, '23514', mensagem);
    }
  });

  test('apelido e limitacao em branco viram null; nulos preservam lesionado e presenca', async () => {
    const id = await conta('branco');
    await client.query(
      `update public.players
          set status = '{"lesionado": true, "limitacaoFisica": "joelho", "presencaFrequente": true}'
        where user_id = $1`,
      [id],
    );
    await como(id, GRAVA, ['F', 'central', 175, 'esquerda', '  ', [], null, null]);
    let ficha = await fichaDe(id);
    assert.equal(ficha.nickname, null);
    assert.deepEqual(ficha.status, {
      lesionado: true,
      limitacaoFisica: 'joelho',
      presencaFrequente: true,
    });

    await como(id, GRAVA, ['F', 'central', 175, 'esquerda', null, [], false, '  ']);
    ficha = await fichaDe(id);
    assert.deepEqual(ficha.status, {
      lesionado: false,
      limitacaoFisica: null,
      presencaFrequente: true,
    });
  });

  test('a RPC nunca grava em outra ficha', async () => {
    const a = await conta('a');
    const b = await conta('b');
    await como(a, GRAVA, valido);
    assert.equal((await fichaDe(b)).gender, null);
  });

  test('sem ficha para a conta, P0002', async () => {
    const id = await conta('sem-ficha');
    await client.query('delete from public.players where user_id = $1', [id]).catch(async () => {
      await client.query(
        'update public.players set deleted_at = now() where user_id = $1',
        [id],
      );
    });
    await recusa(id, GRAVA, valido, 'P0002');
  });
```

(O `delete` pode ser barrado pelo `guard_player_account_identity_delete`; o `catch` cai no apagamento lógico. Se o harness rodar como superusuário e o gatilho recusar os dois, trocar por `set session_replication_role = replica` no teste — conferir como `playerAccountLink.dbtest.ts` simula uma conta sem ficha.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: FAIL — `function public.update_my_athlete_profile(...) does not exist`.

- [ ] **Step 3: Acrescentar a RPC à migration**

```sql
create or replace function public.update_my_athlete_profile(
  p_gender text,
  p_primary_position text,
  p_height_cm numeric,
  p_dominant_hand text,
  p_nickname text,
  p_secondary_positions text[],
  p_injured boolean,
  p_physical_limitation text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player public.players%rowtype;
  v_positions constant text[] := array['levantador','oposto','ponteiro','central','libero','all-rounder'];
  v_secondary text[] := coalesce(p_secondary_positions, array[]::text[]);
  v_status jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;
  if v_player.id is null then
    raise exception 'Athlete profile not found for this account' using errcode = 'P0002';
  end if;

  if p_gender is null or p_gender not in ('M', 'F') then
    raise exception 'Gender must be M or F' using errcode = '23514';
  end if;
  if p_primary_position is null or not (p_primary_position = any (v_positions)) then
    raise exception 'Primary position is not valid' using errcode = '23514';
  end if;
  if p_height_cm is null or p_height_cm < 120 or p_height_cm > 230 then
    raise exception 'Height must be between 120 and 230 cm' using errcode = '23514';
  end if;
  if p_dominant_hand is null or p_dominant_hand not in ('direita', 'esquerda') then
    raise exception 'Dominant hand must be direita or esquerda' using errcode = '23514';
  end if;
  if exists (select 1 from pg_catalog.unnest(v_secondary) s where not (s = any (v_positions)))
     or pg_catalog.cardinality(v_secondary) <> (select pg_catalog.count(distinct s) from pg_catalog.unnest(v_secondary) s)
     or p_primary_position = any (v_secondary) then
    raise exception 'Secondary positions must be valid, distinct and different from the primary'
      using errcode = '23514';
  end if;

  v_status := coalesce(v_player.status, '{}'::jsonb);
  if p_injured is not null then
    v_status := v_status || pg_catalog.jsonb_build_object('lesionado', p_injured);
  end if;
  if p_physical_limitation is not null then
    v_status := v_status || pg_catalog.jsonb_build_object(
      'limitacaoFisica', nullif(pg_catalog.btrim(p_physical_limitation), '')
    );
  end if;

  update public.players
     set gender = p_gender,
         primary_position = p_primary_position,
         height = p_height_cm,
         dominant_hand = p_dominant_hand,
         nickname = nullif(pg_catalog.btrim(coalesce(p_nickname, '')), ''),
         secondary_positions = v_secondary,
         status = v_status,
         updated_at = pg_catalog.now()
   where id = v_player.id;

  return case
    when v_player.username is null then 'needs_username'
    when app_private.athlete_profile_complete(v_player.id) then 'ready'
    else 'needs_athlete_profile'
  end;
end;
$$;

revoke all on function public.update_my_athlete_profile(text, text, numeric, text, text, text[], boolean, text)
  from public, anon;
grant execute on function public.update_my_athlete_profile(text, text, numeric, text, text, text[], boolean, text)
  to authenticated;
```

Observação para o teste "branco": `p_physical_limitation = '  '` não é nulo, então grava `null` (branco vira `null`); `null` preserva.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260928120000_ficha_do_atleta.sql src/test/db/fichaDoAtleta.dbtest.ts
git commit -m "feat(db): o atleta grava a propria ficha pela RPC update_my_athlete_profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ninguém além da conta altera ficha com conta

**Files:**
- Modify: `supabase/migrations/20260928120000_ficha_do_atleta.sql`
- Modify: `src/test/db/fichaDoAtleta.dbtest.ts`
- Modify: as suítes que falharem no Step 5

**Interfaces:**
- Produces: policy "Account owner or player admins can update players" em `public.players`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
  async function comunidadeCom(atletaUserId: string) {
    const dono = await conta('dono-com');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Ficha ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const ficha = await fichaDe(atletaUserId);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, ficha.id, dono],
    );
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active') on conflict do nothing`,
      [comunidade, dono],
    );
    return { comunidade, dono, fichaId: ficha.id };
  }

  test('dono da comunidade nao altera nenhuma coluna de ficha com conta', async () => {
    const atleta = await conta('atleta-com');
    const c = await comunidadeCom(atleta);
    for (const sql of [
      "update public.players set gender = 'F' where id = $1",
      "update public.players set status = '{\"lesionado\": true}' where id = $1",
      'update public.players set active = false where id = $1',
    ]) {
      const { rowCount } = await como(c.dono, sql, [c.fichaId]);
      assert.equal(rowCount, 0, sql);
    }
  });

  test('o atleta altera a propria ficha, mesmo quando outra conta e o owner_id', async () => {
    const atleta = await conta('dono-outro');
    const organizador = await conta('organizador');
    const { id } = await fichaDe(atleta);
    await client.query('update public.players set owner_id = $1 where id = $2', [organizador, id]);
    const { rowCount } = await como(atleta, "update public.players set nickname = 'Eu' where id = $1", [id]);
    assert.equal(rowCount, 1);
    const { rowCount: doOrganizador } = await como(
      organizador,
      "update public.players set nickname = 'Outro' where id = $1",
      [id],
    );
    assert.equal(doOrganizador, 0, 'owner_id nao basta quando a ficha tem conta');
  });

  test('ficha sem conta continua editavel por dono da comunidade e pelo owner_id', async () => {
    const dono = await conta('dono-sem');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Sem conta ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const criador = await conta('criador');
    const fichaId = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [fichaId, criador],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, fichaId, dono],
    );
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active') on conflict do nothing`,
      [comunidade, dono],
    );
    assert.equal((await como(criador, "update public.players set gender = 'F' where id = $1", [fichaId])).rowCount, 1);
    assert.equal((await como(dono, "update public.players set gender = 'M' where id = $1", [fichaId])).rowCount, 1);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: FAIL — o dono altera (`rowCount` 1) e o organizador-owner altera a ficha com conta.

- [ ] **Step 3: Acrescentar a policy à migration**

```sql
-- Ficha com conta: so a propria conta altera, em qualquer coluna. Sem conta: a regra de antes.
-- As funcoes security definer que escrevem em players nao passam por aqui.
create or replace function app_private.player_has_account(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.players p where p.id = p_player_id and p.user_id is not null)
      or exists (
        select 1 from public.player_account_links l
         where l.player_id = p_player_id and l.status = 'ACTIVE'
      );
$$;

revoke all on function app_private.player_has_account(uuid) from public, anon;
grant execute on function app_private.player_has_account(uuid) to authenticated;

drop policy if exists "Player admins can update players" on public.players;
create policy "Account owner or player admins can update players" on public.players
  for update to authenticated
  using (
    case
      when app_private.player_has_account(id) then public.player_is_linked_to_current_user(id)
      else owner_id = (select auth.uid()) or public.current_user_is_player_admin(id)
    end
  )
  with check (
    case
      when app_private.player_has_account(id) then public.player_is_linked_to_current_user(id)
      else owner_id = (select auth.uid()) or public.current_user_is_player_admin(id)
    end
  );
```

(O `grant` a `authenticated` é necessário porque a policy roda com o papel de quem consulta; conferir que `app_private` tem `usage` para `authenticated` — `grep -n "grant usage on schema app_private" supabase/migrations/*.sql`. Se não tiver, mover a função para `public` com o mesmo nome e manter o `revoke` de `anon`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/fichaDoAtleta.dbtest.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Rodar a bateria de banco inteira**

Run: `VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db`
Expected: 0 falhas. Suítes que contam com dono/admin alterando ficha com conta (candidatas: `playerAccountLink`, `registrationJoin`, `registrationJourney`, `registrationFinalize`, `balanceInputSnapshots`) mudam para alterar a ficha como o próprio atleta, ou como superusuário no `client.query` sem identidade quando o teste só prepara dados. O commit diz quais assertivas mudaram e por quê. Também rodar `schemaSecurity` e `advisorSecurityFindings`; se tiverem lista fechada de policies de `players`, acrescentar a nova.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260928120000_ficha_do_atleta.sql src/test/db/fichaDoAtleta.dbtest.ts
git commit -m "feat(db): ficha com conta so muda pela propria conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Incluir as suítes ajustadas no Step 5.)

---

### Task 4: O estado `athlete_profile` na sessão e a rota

**Files:**
- Modify: `src/application/accountUseCases.ts` (`AccountReadiness`)
- Modify: `src/application/authSession.ts`
- Modify: `src/app/auth/authRoutes.ts`
- Test: `src/application/authSession.test.ts` (criar se não existir), `src/app/auth/authRoutes.test.ts`

**Interfaces:**
- Produces: `AccountReadiness = 'needs_username' | 'needs_athlete_profile' | 'ready'`; `AuthSessionState` com `{ kind: 'athlete_profile'; userId: string; account: AccountSnapshot }`; `routeForAuthState` → `'/completar-ficha'`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthSessionState } from './authSession';
import type { AccountSnapshot } from './accountUseCases';

const account = (state: AccountSnapshot['state'], requiresAal2 = false): AccountSnapshot => ({
  state,
  profile: { id: 'u', name: 'U', email: 'u@x', role: 'user', createdAt: '', updatedAt: '' },
  playerId: 'p',
  username: state === 'needs_username' ? null : 'u',
  requiresAal2,
});
const session = { userId: 'u', emailConfirmed: true };

test('ficha incompleta vira athlete_profile, depois do nome de usuario e antes do MFA', () => {
  assert.equal(resolveAuthSessionState({ session, account: account('needs_username') }).kind, 'onboarding');
  assert.equal(
    resolveAuthSessionState({ session, account: account('needs_athlete_profile', true) }).kind,
    'athlete_profile',
  );
  assert.equal(
    resolveAuthSessionState({ session, account: account('ready', true), aal: { current: 'aal1', next: 'aal1' } }).kind,
    'mfa_setup_required',
  );
  assert.equal(resolveAuthSessionState({ session, account: account('ready') }).kind, 'ready');
});
```

Em `src/app/auth/authRoutes.test.ts`, acrescentar:

```ts
test('a ficha incompleta prende em /completar-ficha, que e rota de autenticacao', () => {
  assert.equal(
    routeForAuthState({ kind: 'athlete_profile', userId: 'u', account: {} as never }),
    '/completar-ficha',
  );
  assert.equal(isAuthOnlyPath('/completar-ficha'), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/authSession.test.ts src/app/auth/authRoutes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`accountUseCases.ts`: `export type AccountReadiness = 'needs_username' | 'needs_athlete_profile' | 'ready';`

`authSession.ts`: acrescentar `| { kind: 'athlete_profile'; userId: string; account: AccountSnapshot }` ao tipo e, logo depois do bloco `onboarding`:

```ts
  if (input.account.state === 'needs_athlete_profile') {
    return { kind: 'athlete_profile', userId: input.session.userId, account: input.account };
  }
```

`authRoutes.ts`: no `switch`, `case 'athlete_profile': return '/completar-ficha';`, e `'/completar-ficha'` em `AUTH_ONLY_PATH_PREFIXES`.

`resolveAccessLevel` não muda: todo estado que não é `ready` nem `anonymous` já é `blocked`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/application/authSession.test.ts src/app/auth/authRoutes.test.ts && npm run lint`
Expected: PASS e `tsc` sem erro (o `switch` de `routeForAuthState` é exaustivo; qualquer outro `switch` exaustivo sobre `state.kind` que o `tsc` apontar ganha o caso).

- [ ] **Step 5: Commit**

```bash
git add src/application/accountUseCases.ts src/application/authSession.ts src/app/auth/authRoutes.ts src/application/authSession.test.ts src/app/auth/authRoutes.test.ts
git commit -m "feat: a sessao prende em /completar-ficha quando falta a ficha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Regras da ficha no cliente — validação, nível e o caso de uso

**Files:**
- Create: `src/domain/athleteProfile.ts`, `src/domain/athleteProfile.test.ts`
- Create: `src/infra/supabase/athleteProfileCloudService.ts`
- Create: `src/application/athleteProfileUseCases.ts`, `src/application/athleteProfileUseCases.test.ts`

**Interfaces:**
- Produces:
  - `type AthleteProfileDraft = { genero: Gender | null; posicaoPrincipal: Position | null; alturaCm: number | null; maoDominante: 'direita' | 'esquerda' | null; apelido: string; posicoesSecundarias: Position[]; lesionado?: boolean; limitacaoFisica?: string | null }`
  - `validateAthleteProfile(draft): Record<string, string>` (vazio = válido; chaves `genero`, `posicaoPrincipal`, `alturaCm`, `maoDominante`, `posicoesSecundarias`)
  - `draftFromPlayer(player: Player): AthleteProfileDraft`
  - `levelFromAttributes(atributos: Attributes): 1|2|3|4|5` e `ATHLETE_POSITIONS: Position[]`
  - `updateMyAthleteProfile(draft, gateway?): Promise<AppResult<AccountReadiness>>`

- [ ] **Step 1: Escrever os testes que falham**

`src/domain/athleteProfile.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelFromAttributes, validateAthleteProfile } from './athleteProfile';
import { buildLevelAttributes } from '../application/quickStart';

const valido = {
  genero: 'F' as const,
  posicaoPrincipal: 'levantador' as const,
  alturaCm: 170,
  maoDominante: 'direita' as const,
  apelido: '',
  posicoesSecundarias: [],
};

test('os quatro obrigatorios', () => {
  assert.deepEqual(validateAthleteProfile(valido), {});
  const vazio = validateAthleteProfile({ ...valido, genero: null, posicaoPrincipal: null, alturaCm: null, maoDominante: null });
  assert.deepEqual(Object.keys(vazio).sort(), ['alturaCm', 'genero', 'maoDominante', 'posicaoPrincipal']);
});

test('altura de 120 a 230, e secundarias validas, distintas e diferentes da principal', () => {
  assert.ok(validateAthleteProfile({ ...valido, alturaCm: 119 }).alturaCm);
  assert.ok(validateAthleteProfile({ ...valido, alturaCm: 231 }).alturaCm);
  assert.ok(validateAthleteProfile({ ...valido, posicoesSecundarias: ['levantador'] }).posicoesSecundarias);
  assert.ok(validateAthleteProfile({ ...valido, posicoesSecundarias: ['oposto', 'oposto'] }).posicoesSecundarias);
  assert.deepEqual(validateAthleteProfile({ ...valido, posicoesSecundarias: ['oposto'] }), {});
});

test('o nivel lido dos atributos e o inverso de buildLevelAttributes', () => {
  for (const nivel of [1, 2, 3, 4, 5] as const) {
    assert.equal(levelFromAttributes(buildLevelAttributes(nivel)), nivel);
  }
});
```

`src/application/athleteProfileUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMyAthleteProfile } from './athleteProfileUseCases';

const draft = {
  genero: 'M' as const,
  posicaoPrincipal: 'ponteiro' as const,
  alturaCm: 182,
  maoDominante: 'direita' as const,
  apelido: 'Zé',
  posicoesSecundarias: [],
};

test('valida antes de chamar o servidor', async () => {
  let chamou = false;
  const gateway = { update: async () => { chamou = true; return 'ready' as const; } };
  const result = await updateMyAthleteProfile({ ...draft, alturaCm: null }, gateway);
  assert.equal(result.ok, false);
  assert.equal(chamou, false);
});

test('devolve o novo estado da conta', async () => {
  const gateway = { update: async () => 'ready' as const };
  assert.deepEqual(await updateMyAthleteProfile(draft, gateway), { ok: true, value: 'ready' });
});

test('a recusa do servidor aponta o campo', async () => {
  const gateway = {
    update: async () => {
      throw { code: '23514', message: 'Height must be between 120 and 230 cm' };
    },
  };
  const result = await updateMyAthleteProfile(draft, gateway);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /altura/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/domain/athleteProfile.test.ts src/application/athleteProfileUseCases.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

`src/domain/athleteProfile.ts`:

```ts
import type { Attributes, Gender, Player, Position } from '../types';

export const ATHLETE_POSITIONS: Position[] = [
  'levantador',
  'oposto',
  'ponteiro',
  'central',
  'libero',
  'all-rounder',
];

export interface AthleteProfileDraft {
  genero: Gender | null;
  posicaoPrincipal: Position | null;
  alturaCm: number | null;
  maoDominante: 'direita' | 'esquerda' | null;
  apelido: string;
  posicoesSecundarias: Position[];
  lesionado?: boolean;
  limitacaoFisica?: string | null;
}

export function validateAthleteProfile(draft: AthleteProfileDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.genero !== 'M' && draft.genero !== 'F') errors.genero = 'Escolha o gênero.';
  if (!draft.posicaoPrincipal || !ATHLETE_POSITIONS.includes(draft.posicaoPrincipal))
    errors.posicaoPrincipal = 'Escolha a posição principal.';
  if (draft.alturaCm === null || !Number.isFinite(draft.alturaCm))
    errors.alturaCm = 'Informe a altura em centímetros.';
  else if (draft.alturaCm < 120 || draft.alturaCm > 230)
    errors.alturaCm = 'A altura precisa estar entre 120 e 230 cm.';
  if (draft.maoDominante !== 'direita' && draft.maoDominante !== 'esquerda')
    errors.maoDominante = 'Escolha a mão dominante.';
  const secundarias = draft.posicoesSecundarias;
  if (
    secundarias.some((p) => !ATHLETE_POSITIONS.includes(p)) ||
    new Set(secundarias).size !== secundarias.length ||
    (draft.posicaoPrincipal !== null && secundarias.includes(draft.posicaoPrincipal))
  )
    errors.posicoesSecundarias = 'As posições secundárias não podem repetir a principal.';
  return errors;
}

export function draftFromPlayer(player: Player): AthleteProfileDraft {
  return {
    genero: player.genero ?? null,
    posicaoPrincipal: player.posicaoPrincipal ?? null,
    alturaCm: player.alturaCm ?? null,
    maoDominante: player.maoDominante ?? null,
    apelido: player.apelido && player.apelido !== player.nome ? player.apelido : '',
    posicoesSecundarias: player.posicoesSecundarias ?? [],
    lesionado: player.status?.lesionado ?? false,
    limitacaoFisica: player.status?.limitacaoFisica ?? null,
  };
}

export function levelFromAttributes(atributos: Attributes): 1 | 2 | 3 | 4 | 5 {
  const valores = Object.values(atributos).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 5;
  return Math.min(5, Math.max(1, Math.round(media / 2))) as 1 | 2 | 3 | 4 | 5;
}
```

(Se `Gender`/`Position`/`Attributes` não forem exportados por `../types`, importar de `@shared/types`; o `tsc` confirma.)

`src/infra/supabase/athleteProfileCloudService.ts`:

```ts
import type { AthleteProfileDraft } from '@domain/athleteProfile';
import type { AccountReadiness } from '@app/accountUseCases';
import { isSupabaseConfigured, supabase as client } from '../../lib/supabaseClient';

export const athleteProfileCloudService = {
  async update(draft: AthleteProfileDraft): Promise<AccountReadiness> {
    if (!isSupabaseConfigured)
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    const { data, error } = await client.rpc('update_my_athlete_profile', {
      p_gender: draft.genero,
      p_primary_position: draft.posicaoPrincipal,
      p_height_cm: draft.alturaCm,
      p_dominant_hand: draft.maoDominante,
      p_nickname: draft.apelido,
      p_secondary_positions: draft.posicoesSecundarias,
      p_injured: draft.lesionado ?? null,
      p_physical_limitation: draft.limitacaoFisica === undefined ? null : (draft.limitacaoFisica ?? ''),
    });
    if (error) throw error;
    return String(data) as AccountReadiness;
  },
};
```

`src/application/athleteProfileUseCases.ts`:

```ts
import { validateAthleteProfile, type AthleteProfileDraft } from '@domain/athleteProfile';
import { athleteProfileCloudService } from '@infra/supabase/athleteProfileCloudService';
import type { AccountReadiness } from './accountUseCases';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface AthleteProfileGateway {
  update(draft: AthleteProfileDraft): Promise<AccountReadiness>;
}

const MENSAGENS: Array<[RegExp, string]> = [
  [/gender/i, 'Escolha o gênero.'],
  [/primary position/i, 'Escolha uma posição principal válida.'],
  [/height/i, 'A altura precisa estar entre 120 e 230 cm.'],
  [/dominant hand/i, 'Escolha a mão dominante.'],
  [/secondary/i, 'As posições secundárias não podem repetir a principal.'],
];

export async function updateMyAthleteProfile(
  draft: AthleteProfileDraft,
  gateway: AthleteProfileGateway = athleteProfileCloudService,
): Promise<AppResult<AccountReadiness>> {
  const errors = validateAthleteProfile(draft);
  const primeiro = Object.values(errors)[0];
  if (primeiro) return productError('invalid_input', primeiro);
  try {
    return appOk(await gateway.update(draft));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (code === '23514') {
      const achado = MENSAGENS.find(([padrao]) => padrao.test(message));
      return productError('invalid_input', achado ? achado[1] : 'Confira os dados da ficha.');
    }
    if (code === 'CLOUD_UNAVAILABLE')
      return productError('cloud_unavailable', 'Precisamos de conexão para salvar sua ficha.');
    return technicalError('Não foi possível salvar sua ficha. Verifique a conexão.', error);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/domain/athleteProfile.test.ts src/application/athleteProfileUseCases.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/athleteProfile.ts src/domain/athleteProfile.test.ts src/infra/supabase/athleteProfileCloudService.ts src/application/athleteProfileUseCases.ts src/application/athleteProfileUseCases.test.ts
git commit -m "feat: regras da ficha no cliente, espelhando o servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: O formulário — `/impeccable shape` e `AthleteProfileForm`

**Files:**
- Create: `src/components/player/AthleteProfileForm.tsx`, `src/components/player/AthleteProfileForm.spec.tsx`

**Interfaces:**
- Consumes: `AthleteProfileDraft`, `validateAthleteProfile`, `ATHLETE_POSITIONS` (Task 5).
- Produces: `AthleteProfileForm` com props `{ value: AthleteProfileDraft; onChange: (next: AthleteProfileDraft) => void; showCondition?: boolean; level?: { value: 1|2|3|4|5; onChange: (n: 1|2|3|4|5) => void } | null; serverError?: string | null; disabled?: boolean }`. Não tem botão de enviar: quem monta decide ("Continuar", "Salvar").

- [ ] **Step 1: `/impeccable shape`** para o formulário nos três contextos (cadastro, Minha ficha, convidado), com o brief da spec 2.2. Decidir a forma de gênero, posição, altura, mão, secundárias e nível. Os rótulos acessíveis do Step 2 são fixos.

- [ ] **Step 2: Escrever o spec que falha**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AthleteProfileDraft } from '@domain/athleteProfile';
import { AthleteProfileForm } from './AthleteProfileForm';

const vazio: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
};

function Montado(props: { showCondition?: boolean; level?: boolean; onChange?: (d: AthleteProfileDraft) => void }) {
  const [value, setValue] = useState(vazio);
  const [nivel, setNivel] = useState<1 | 2 | 3 | 4 | 5>(3);
  return (
    <AthleteProfileForm
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      showCondition={props.showCondition}
      level={props.level ? { value: nivel, onChange: setNivel } : null}
    />
  );
}

describe('AthleteProfileForm', () => {
  it('preenche os quatro obrigatorios', () => {
    const onChange = vi.fn();
    render(<Montado onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Feminino' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Levantador' }));
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Destro' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ genero: 'F', posicaoPrincipal: 'levantador', alturaCm: 170, maoDominante: 'direita' }),
    );
  });

  it('apelido e secundarias sao opcionais e aparecem como tal', () => {
    render(<Montado />);
    expect(screen.getByLabelText(/apelido \(opcional\)/i)).toBeTruthy();
    expect(screen.getByRole('group', { name: /posições secundárias \(opcional\)/i })).toBeTruthy();
  });

  it('condicao fisica so quando pedida', () => {
    const { unmount } = render(<Montado />);
    expect(screen.queryByLabelText('Lesionado')).toBeNull();
    unmount();
    render(<Montado showCondition />);
    expect(screen.getByLabelText('Lesionado')).toBeTruthy();
    expect(screen.getByLabelText('Limitação física')).toBeTruthy();
  });

  it('nivel so quando pedido', () => {
    const { unmount } = render(<Montado />);
    expect(screen.queryByRole('group', { name: /nível/i })).toBeNull();
    unmount();
    render(<Montado level />);
    expect(screen.getByRole('group', { name: /nível/i })).toBeTruthy();
  });

  it('mostra o erro do servidor', () => {
    render(<AthleteProfileForm value={vazio} onChange={vi.fn()} serverError="A altura precisa estar entre 120 e 230 cm." />);
    expect(screen.getByRole('alert').textContent).toContain('120 e 230');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run src/components/player/AthleteProfileForm.spec.tsx` (import não resolve).

- [ ] **Step 4: Implementar** `AthleteProfileForm.tsx` com: `fieldset` "Gênero" com rádios "Masculino"/"Feminino"; `fieldset` "Posição principal" com um rádio por posição (rótulos: Levantador, Oposto, Ponteiro, Central, Líbero, Versátil); `input type="number"` com `aria-label="Altura (cm)"`, `min=120 max=230 inputMode="numeric"`; `fieldset` "Mão dominante" com rádios "Destro"/"Canhoto" (valores `direita`/`esquerda`); `input` "Apelido (opcional)"; `fieldset` "Posições secundárias (opcional)" com checkboxes (a principal fica desabilitada); com `showCondition`, checkbox "Lesionado" e `input` "Limitação física"; com `level`, `fieldset` "Nível" com rádios 1–5 ("1 — iniciante" … "5 — forte"); `serverError` num `role="alert"`; erros locais de `validateAthleteProfile` mostrados por campo **só depois** do primeiro toque no campo. Alvos de 44px; visual conforme o shape.

- [ ] **Step 5: Rodar e ver passar** — o spec e `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/components/player/AthleteProfileForm.tsx src/components/player/AthleteProfileForm.spec.tsx
git commit -m "feat: formulario unico da ficha do atleta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `/completar-ficha`

**Files:**
- Create: `src/app/auth/CompleteAthleteProfilePage.tsx`, `src/app/auth/CompleteAthleteProfilePage.spec.tsx`
- Modify: `src/app/AppRouter.tsx` (rota junto de `/escolher-username`)

**Interfaces:**
- Consumes: `updateMyAthleteProfile` (Task 5), `AthleteProfileForm` (Task 6), `useAuthSession().retry`.

- [ ] **Step 1: Spec que falha**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import { CompleteAthleteProfilePage } from './CompleteAthleteProfilePage';

vi.mock('@app/athleteProfileUseCases', () => ({ updateMyAthleteProfile: vi.fn() }));
const retry = vi.fn();
vi.mock('./useAuthSession', () => ({ useAuthSession: () => ({ retry }) }));

function preencher() {
  fireEvent.click(screen.getByRole('radio', { name: 'Masculino' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Ponteiro' }));
  fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '182' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Destro' }));
}

function renderAt(from?: string) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/completar-ficha', state: from ? { from: { pathname: from } } : null }]}>
      <Routes>
        <Route path="/completar-ficha" element={<CompleteAthleteProfilePage />} />
        <Route path="/convite/:c" element={<p>Convite</p>} />
        <Route path="/" element={<p>Início</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CompleteAthleteProfilePage', () => {
  beforeEach(() => {
    vi.mocked(updateMyAthleteProfile).mockReset();
    retry.mockReset();
  });

  it('continuar fica desabilitado ate os quatro obrigatorios', () => {
    renderAt();
    const continuar = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
    preencher();
    expect(continuar.disabled).toBe(false);
    expect(screen.getByText(/é com isso que o sorteio monta times equilibrados/i)).toBeTruthy();
    expect(screen.queryByLabelText('Lesionado')).toBeNull();
  });

  it('salva, atualiza a sessao e segue para o destino guardado', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({ ok: true, value: 'ready' });
    renderAt('/convite/ABC');
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(await screen.findByText('Convite')).toBeTruthy();
  });

  it('a falha fica na tela e mantem o que foi preenchido', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({
      ok: false,
      error: { kind: 'product', code: 'cloud_unavailable', recoverable: true, message: 'Precisamos de conexão para salvar sua ficha.' },
    } as never);
    renderAt();
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Altura (cm)') as HTMLInputElement).value).toBe('182');
    expect(retry).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```tsx
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import { validateAthleteProfile, type AthleteProfileDraft } from '@domain/athleteProfile';
import { AthleteProfileForm } from '../../components/player/AthleteProfileForm';
import { useAuthSession } from './useAuthSession';

const VAZIO: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
};

export function CompleteAthleteProfilePage() {
  const { retry } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const completo = Object.keys(validateAthleteProfile(draft)).length === 0;

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center p-4">
      <div className="w-full max-w-md space-y-6 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-black text-base-content">Sua ficha de atleta</h1>
          <p className="text-sm text-base-content/70">
            É com isso que o sorteio monta times equilibrados.
          </p>
        </header>
        <AthleteProfileForm value={draft} onChange={setDraft} serverError={erro} disabled={salvando} />
        <button
          type="button"
          className="btn btn-primary w-full min-h-[48px]"
          disabled={!completo || salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            const result = await updateMyAthleteProfile(draft);
            if (!result.ok) {
              setErro(result.error.message);
              setSalvando(false);
              return;
            }
            await retry();
            const from = (location.state as { from?: { pathname?: string } } | null)?.from;
            navigate(from ?? '/', { replace: true });
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
```

Em `AppRouter.tsx`, junto de `<Route path="/escolher-username" …/>`: `<Route path="/completar-ficha" element={<CompleteAthleteProfilePage />} />`.

- [ ] **Step 4: Rodar e ver passar** — o spec, `npx vitest run src/app/AppRouter.spec.tsx` e `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/CompleteAthleteProfilePage.tsx src/app/auth/CompleteAthleteProfilePage.spec.tsx src/app/AppRouter.tsx
git commit -m "feat: /completar-ficha no cadastro, preservando o destino

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: "Minha ficha" em `/perfil` (com o envio de foto)

**Files:**
- Create: `src/components/account/MyAthleteProfile.tsx`, `src/components/account/MyAthleteProfile.spec.tsx`
- Modify: `src/app/routes/globalRoutes.tsx` (`PerfilRoute`)

**Interfaces:**
- Consumes: `AthleteProfileForm`, `draftFromPlayer`, `updateMyAthleteProfile`, `AvatarUpload` (`src/components/player/AvatarUpload.tsx`, props como em `PlayerEditView.tsx:443-455`).
- Produces: `MyAthleteProfile` com props `{ player: Player | null; onSaved: (draft: AthleteProfileDraft) => void }`.

- [ ] **Step 1: Spec que falha** — `MyAthleteProfile.spec.tsx`: (a) com `player=null` mostra "Carregando sua ficha…" e nenhum formulário; (b) com a ficha, os campos vêm preenchidos por `draftFromPlayer`, "Lesionado" aparece, e "Salvar" chama `updateMyAthleteProfile` com o draft e depois `onSaved`; (c) erro fica em `role="alert"`; (d) o envio de foto aparece (`screen.getByText(/foto/i)` ou o rótulo que o `AvatarUpload` já usa — conferir no componente).

Em `src/app/routes/globalRoutes.tsx` / spec de rota existente (`AppRouter.spec.tsx`), um teste: com `play.players` contendo só fichas de **outras** contas, `/perfil` **não** mostra o nome de nenhuma delas.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `MyAthleteProfile`: estado `draft` iniciado com `draftFromPlayer(player)`; `AthleteProfileForm` com `showCondition`; botão "Salvar" (desabilitado se inválido ou salvando); `AvatarUpload` acima do formulário, com `playerId`/`currentAvatarUrl` da ficha, como em `PlayerEditView`.
  - `PerfilRoute`: trocar `play.players.find((p) => p.userId === auth.user?.id) || play.players[0] || null` por só o `find`; quando `undefined` e há conta, buscar `playerCloudService.fetchLinkedToUser(auth.user.id)` num `useEffect` e usar o resultado. Montar `<MyAthleteProfile player={minha} onSaved={…} />` abaixo do `UserProfileView`. Em `onSaved`, `play.setPlayers` atualiza a ficha da conta com o draft e `syncStatus: 'synced'` (o servidor já tem o dado).

- [ ] **Step 4: Rodar e ver passar** — os specs e `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/account/MyAthleteProfile.tsx src/components/account/MyAthleteProfile.spec.tsx src/app/routes/globalRoutes.tsx
git commit -m "feat: Minha ficha em /perfil, so com a ficha da conta e o envio de foto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Incluir o spec de rota ajustado.)

---

### Task 9: `usePlayers` sem edição de terceiros, e o sync

**Files:**
- Modify: `src/application/localPlayerUseCases.ts`, `src/application/localPlayerUseCases.test.ts`
- Modify: `src/hooks/usePlayers.ts`
- Modify: `src/infra/supabase/syncService.ts` (laço de upload de atletas, ~linha 1049)
- Test: `src/infra/supabase/syncService.test.ts` (ou o teste existente do laço de atletas — `grep -ln "isSharedPlayer\|playerCloudService.upsert" src/infra/supabase/*.test.ts`)

**Interfaces:**
- Produces:
  - `isForeignAccountPlayer(player: Player, currentUserId: string | null): boolean` — `!!player.userId && player.userId !== currentUserId`
  - `applyGuestProfileSave(input: { players: Player[]; playerId: string | null; draft: AthleteProfileDraft; nome: string; communityId: string; level: 1|2|3|4|5 | null; now: string; createId: () => string }): AppResult<{ players: Player[]; savedPlayer: Player }>`
  - hook: `saveGuestPlayer(input: { playerId: string | null; nome: string; draft: AthleteProfileDraft; communityId: string; level: 1|2|3|4|5 | null; canEdit: boolean; currentUserId: string | null }): AppResult<Player>` e `removeGuestPlayer(input: { playerId: string; canEdit: boolean; currentUserId: string | null }): AppResult<'removed' | 'deactivated'>`

- [ ] **Step 1: Testes que falham** em `localPlayerUseCases.test.ts`:

```ts
test('salvar convidado grava a ficha e, sem nuvem, o nivel vira atributos', () => {
  const now = '2026-09-28T12:00:00.000Z';
  const draft = { genero: 'F' as const, posicaoPrincipal: 'central' as const, alturaCm: 180, maoDominante: 'esquerda' as const, apelido: 'Bia', posicoesSecundarias: [] };
  const result = applyGuestProfileSave({ players: [], playerId: null, draft, nome: 'Beatriz', communityId: 'c1', level: 4, now, createId: () => 'g1' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const g = result.value.savedPlayer;
  assert.equal(g.nome, 'Beatriz');
  assert.equal(g.apelido, 'Bia');
  assert.equal(g.genero, 'F');
  assert.deepEqual(g.atributos, buildLevelAttributes(4));
  assert.deepEqual(g.communityIds, ['c1']);
  assert.equal(g.userId ?? null, null);
});

test('salvar sem mudar o nivel preserva os atributos (a progressao)', () => {
  const now = '2026-09-28T12:00:00.000Z';
  const existente = { ...makeGuest('g1'), atributos: { ...buildLevelAttributes(3), saque: 9 } };
  const draft = draftFromPlayer(existente);
  const result = applyGuestProfileSave({ players: [existente], playerId: 'g1', draft, nome: existente.nome, communityId: 'c1', level: levelFromAttributes(existente.atributos), now, createId: () => 'x' });
  assert.ok(result.ok && result.value.savedPlayer.atributos.saque === 9);
});

test('nao salva ficha com conta nem sem nome, e nao inventa genero', () => {
  const comConta = { ...makeGuest('p1'), userId: 'u9' };
  const draft = draftFromPlayer(comConta);
  assert.equal(applyGuestProfileSave({ players: [comConta], playerId: 'p1', draft, nome: 'X', communityId: 'c1', level: null, now: '', createId: () => '' }).ok, false);
  assert.equal(applyGuestProfileSave({ players: [], playerId: null, draft: { ...draft, genero: null }, nome: 'X', communityId: 'c1', level: null, now: '', createId: () => '' }).ok, false);
  assert.equal(applyGuestProfileSave({ players: [], playerId: null, draft, nome: '  ', communityId: 'c1', level: null, now: '', createId: () => '' }).ok, false);
});

test('isForeignAccountPlayer', () => {
  assert.equal(isForeignAccountPlayer({ ...makeGuest('a'), userId: 'u1' }, 'u2'), true);
  assert.equal(isForeignAccountPlayer({ ...makeGuest('a'), userId: 'u1' }, 'u1'), false);
  assert.equal(isForeignAccountPlayer(makeGuest('a'), 'u1'), false);
});
```

(`makeGuest(id)` = `makePlayer(id, { userId: null, communityIds: ['c1'] })` de `src/test/fixtures`.)

No teste do sync: um atleta local com `userId: 'outra-conta'`, `cloudOwnerId` igual ao `ownerId` do sync e `syncStatus: 'pending'` **não** chama `playerCloudService.upsert` e sai marcado como sincronizado.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `localPlayerUseCases.ts`: `isForeignAccountPlayer`; `applyGuestProfileSave` — recusa (`productError('permission_denied', …)`) se a ficha existente tem `userId`; valida `validateAthleteProfile(draft)` e `nome.trim()`; cria com `buildDefaultCommunityPlayer({ id: createId(), name: nome, communityId, now })` e **sobrescreve** gênero/posição/altura/mão/apelido/secundárias/status pelo draft (os padrões inventados nunca sobrevivem); `atributos = buildLevelAttributes(level)` quando `level !== null` e (ficha nova ou `level !== levelFromAttributes(atual)`); `syncStatus: 'pending'`, `updatedAt: now`.
  - `buildDefaultCommunityPlayer`: continua existindo (é base), mas nenhum chamador a devolve sem passar pelo draft — `applyPlayerCreationForCommunity` sai junto com a Task 11 (ela só servia ao "adicionar pelo nome").
  - `usePlayers.ts`: acrescentar `saveGuestPlayer` e `removeGuestPlayer` (este usa `applyLocalPlayerDeletion` e `getPlayerHistoryUsage`; recusa ficha com conta e `canEdit` falso). **Remover** `editingPlayer`, `setEditingPlayer`, `validationErrors`, `setValidationErrors`, `showDeleteConfirm`, `setShowDeleteConfirm`, `handleSavePlayer`, `handleDeletePlayer`, `handleEditPlayer`, `handleAddPlayer` e o import de `applyLocalPlayerSave`/`validateLocalPlayerSave` — o `tsc` aponta os chamadores, todos removidos na Task 11. Se a Task 11 ainda não rodou, manter os antigos e removê-los lá (preferível executar as Tasks 9 e 11 em sequência).
  - `syncService.ts`, no laço de atletas, antes do `isSharedPlayer`:

```ts
        if (playerForUpload.userId && playerForUpload.userId !== ownerId) {
          updatedPlayers.push(markSynced(playerForUpload, playerForUpload.cloudId, syncedAt));
          continue;
        }
```

(`ownerId` ali é a conta que sincroniza. A progressão e a avaliação antiga podem mudar a cópia local de outro atleta com conta; ela nunca sobe e é substituída no próximo download — é assim que a P5 fica fechada.)

- [ ] **Step 4: Rodar e ver passar** — os testes, `npm run lint` e `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/application/localPlayerUseCases.ts src/application/localPlayerUseCases.test.ts src/hooks/usePlayers.ts src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git commit -m "feat: salvar e remover so convidado; o sync nunca sobe ficha com conta de outra pessoa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gestão → Convidados

**Files:**
- Create: `src/components/community/areas/CommunityGuestsArea.tsx`, `src/components/community/areas/CommunityGuestsArea.spec.tsx`
- Modify: `src/app/routes/communityRoutes.tsx` (`GestaoTabs`, nova `CommunityGuestsRoute`), `src/app/AppRouter.tsx`, `src/application/appRoutes.ts` (`paths.convidados`, título), `src/application/appRoutes.test.ts`

**Interfaces:**
- Consumes: `saveGuestPlayer`, `removeGuestPlayer` (Task 9), `AthleteProfileForm` (Task 6), `levelFromAttributes`, `draftFromPlayer` (Task 5), `AthleteUsernameSearch` (já existe em `CommunityRosterTools`).
- Produces: `paths.convidados(communityId)` → `/comunidades/${communityId}/gestao/convidados`; `CommunityGuestsArea` com props `{ guests: Player[]; noCloud: boolean; onSave: (input: { playerId: string | null; nome: string; draft: AthleteProfileDraft; level: 1|2|3|4|5 | null }) => AppResult<Player>; onRemove: (playerId: string) => AppResult<'removed' | 'deactivated'>; hasHistory: (playerId: string) => boolean; searchSlot?: ReactNode; initialEditingId?: string | null }`.

- [ ] **Step 1: Testes que falham**
  - `appRoutes.test.ts`: `paths.convidados('c1') === '/comunidades/c1/gestao/convidados'`; `getPageTitleForPath('/comunidades/c1/gestao/convidados') === 'Convidados'`.
  - `CommunityGuestsArea.spec.tsx`: (a) lista só os convidados recebidos, com "Cadastrar convidado"; (b) "Cadastrar convidado" abre o formulário com campo "Nome" e o `AthleteProfileForm`; "Salvar" chama `onSave` com `playerId: null`; (c) tocar num convidado abre o formulário preenchido; (d) "Nível" aparece só com `noCloud`; (e) "Excluir" quando `hasHistory` é falso, "Desativar" quando verdadeiro, com confirmação, chamando `onRemove`; (f) o erro de `onSave` aparece em `role="alert"`; (g) com `initialEditingId`, abre direto a edição daquele convidado.
  - Rota (em `AppRouter.spec.tsx` ou spec de `communityRoutes`): o moderador e o membro não veem a aba "Convidados" e a rota redireciona para a comunidade; dono e admin veem.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `appRoutes.ts`: `convidados: (communityId: string) => \`/comunidades/${communityId}/gestao/convidados\``; em `getPageTitleForPath`, no `case 'gestao'`: `if (segments[3] === 'convidados') return 'Convidados';`.
  - `GestaoTabs`: acrescentar `{ to: paths.convidados(communityId), label: 'Convidados', active: ativa === 'convidados' }` **só quando** `permissions.canEditPlayerProfile` (passar a flag para `GestaoTabs`).
  - `CommunityGuestsRoute`: usa `useGestaoContext()`; se `!permissions.membersResolved` → `null`; se `!permissions.canEditPlayerProfile` → `<Navigate to={paths.comunidade(community.id)} replace />`; `guests = getCommunityPlayers(community.id, play.players).filter((p) => !p.userId)`; `noCloud = !community.cloudId || !auth.isSupabaseConfigured`; `onSave`/`onRemove` chamam `play.saveGuestPlayer`/`play.removeGuestPlayer` com `canEdit: permissions.canEditPlayerProfile`, `currentUserId: auth.user?.id ?? null`, `communityId: community.id`; `searchSlot = <AthleteUsernameSearch … />` (mesmas props de `CommunityRosterTools`) quando `permissions.canManageMembers`; `initialEditingId` vem de `useSearchParams().get('editar')`.
  - `AppRouter.tsx`: `<Route path="gestao/convidados" element={<CommunityGuestsRoute />} />` junto das outras rotas de gestão.
  - `CommunityGuestsArea`: lista (nome/apelido, posição, "sem ficha completa" quando `validateAthleteProfile(draftFromPlayer(g))` tem erro), botão "Cadastrar convidado", e o editor (campo "Nome" + `AthleteProfileForm` com `showCondition` e `level` quando `noCloud`, "Salvar", "Excluir"/"Desativar"). O `searchSlot` aparece numa seção "Trazer atleta com conta pelo @".

- [ ] **Step 4: Rodar e ver passar** — specs, `npm run lint`, `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/components/community/areas/CommunityGuestsArea.tsx src/components/community/areas/CommunityGuestsArea.spec.tsx src/app/routes/communityRoutes.tsx src/app/AppRouter.tsx src/application/appRoutes.ts src/application/appRoutes.test.ts
git commit -m "feat: Gestao, Convidados, para dono e admin editarem atleta sem conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A tela de edição de atleta sai

**Files:**
- Delete: `src/components/player/PlayerEditView.tsx`, `src/components/player/PlayerEditView.spec.tsx`, `src/application/screens/playerEditView/` (contrato, modelo, intents e testes), `src/application/selfEvaluationUseCases.ts` (e teste), `src/infra/supabase/selfEvaluationCloudService.ts` (e teste)
- Modify: `src/app/routes/communityRoutes.tsx` (`PlayerEditRoute`, `CommunityPeopleRoute`), `src/app/AppRouter.tsx`, `src/application/appRoutes.ts` (+ teste), `src/app/AppShell.tsx` (`applyGuestPlayer`), `src/components/player/PlayersView.tsx` (+ contrato e spec), `src/components/community/areas/CommunityRosterTools.tsx`, `src/domain/communityPermissions.ts` (+ teste), `src/shared/types/player.ts` (`selfEvaluation`), `src/architecture/currentStateLedger.ts`, `docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md`, `src/application/localPlayerUseCases.ts` (`applyPlayerCreationForCommunity`)

- [ ] **Step 1: Testes que falham**
  - `appRoutes.test.ts`: `paths` não tem mais `atleta`; `pathForLegacyPage('player-edit', 'c1')` devolve `paths.pessoas('c1')`; `/comunidades/c1/pessoas/editar-atleta/x` resolve para Pessoas (`resolveLegacyQueryRoute` ou a regra de rota que já trata `editar-atleta`, linha ~324).
  - `AppRouter.spec.tsx`: abrir `/comunidades/c1/pessoas/editar-atleta/p1` cai em Pessoas.
  - `PlayersView.spec.tsx`: não há botões "Cadastrar" nem "Convidado"; tocar num atleta (com ou sem conta) abre a carta VUT e não navega.
  - `CommunityDrawRoute`/`sessionRoutes`/`AppShell`: "editar detalhes" do convidado recém-adicionado navega para `paths.convidados(c) + '?editar=' + id` quando `canEditPlayerProfile`; sem a permissão, o modal não oferece "editar detalhes" (`GuestPlayerModal` recebe `canEditDetails`).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Remover e religar**
  - Apagar os arquivos listados; remover `PlayerEditRoute` e a rota `pessoas/editar-atleta/:playerId`; em `appRoutes.ts`, remover `atleta`, `NEW_PLAYER_ID`, `resolvePlayerRoute`, `resolvePlayerEditAction`, o título "Perfil do Atleta" (Pessoas fica "Pessoas") e fazer `case 'player-edit'` devolver `paths.pessoas`; a regra que já leva `editar-atleta` a Pessoas (linha ~324) fica.
  - Um link antigo `…/pessoas/editar-atleta/:id`: `<Route path="pessoas/editar-atleta/*" element={<Navigate to=".." relative="path" replace />} />` — ou, se o `resolveLegacyQueryRoute` já cobrir, apenas remover a rota; o teste do Step 1 decide.
  - `CommunityPeopleRoute`/`PlayersView`: remover `onAddPlayer`, `onEditPlayer`, `onRestoreDemoPlayers`, `onAddGuestPlayer`, `onCreatePlayerInCommunity` do contrato e da view; tocar num atleta chama o `setSelectedVutPlayer` que a view já tem; `CommunityRosterTools` fica só com filtros e compartilhar (o formulário "adicionar pelo nome" e o `AthleteUsernameSearch` saem — este foi para Convidados na Task 10).
  - `applyPlayerCreationForCommunity` e `AppShell.createPlayerForCommunity` saem (só serviam ao "adicionar pelo nome").
  - `AppShell.applyGuestPlayer`: com `editDetails`, `navigate(\`${paths.convidados(communityId)}?editar=${result.selectedPlayer.id}\`)` em vez de `paths.atleta`.
  - `GuestPlayerModal`: nova prop `canEditDetails` (padrão `false`); a opção "editar detalhes" só aparece com ela. Os três chamadores passam `permissions.canEditPlayerProfile`.
  - `communityPermissions.ts`: remover `canEvaluatePlayer` (e seu comentário) de `CommunityPermissions`, `permissionsForRole` e dos ramos especiais; ajustar `communityPermissions.test.ts` (`assertWritePermissions` perde `evaluate`).
  - `Player.selfEvaluation` sai do tipo; `usePlayers`/`syncService` param de ler/escrever autoavaliação (o `tsc` aponta).
  - Ledger: nas três entradas, trocar `'components/player/PlayerEditView.tsx'` por `'components/community/areas/CommunityGuestsArea.tsx'` na identidade do atleta (linha ~114), removê-lo de `remainingSurfaces` das avaliações (linha ~501) e da autoavaliação (linha ~518; a entrada de autoavaliação passa a `migrationClass: 'RETIRE'`, sem leitores nem escritores, com `notes: 'Descontinuada em 2026-09-28 (spec ficha-do-atleta); a tabela self_evaluations fica sem escrita.'`), e no avatar trocar o leitor por `'components/account/MyAthleteProfile.tsx'` (linha ~548).
  - Regenerar o documento do ledger: `node --import tsx -e "import('./src/architecture/currentStateLedgerDoc.ts').then(({ renderCurrentStateLedgerMarkdown }) => require('node:fs').writeFileSync('docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md', renderCurrentStateLedgerMarkdown()))"` (conferir o nome do export em `currentStateLedgerDoc.ts`).
  - `CommunitySkillProfilePanel` fica no código, sem montagem (parte 2).

- [ ] **Step 4: Rodar e ver passar** — `npm run lint && npm test` (inclui `currentStateLedger.test.ts` e `importAliases.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A src/components/player src/application/screens src/application/selfEvaluationUseCases.ts src/infra/supabase/selfEvaluationCloudService.ts
git add src/app/routes/communityRoutes.tsx src/app/AppRouter.tsx src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/AppShell.tsx src/components/player/PlayersView.tsx src/components/community/areas/CommunityRosterTools.tsx src/domain/communityPermissions.ts src/domain/communityPermissions.test.ts src/shared/types/player.ts src/architecture/currentStateLedger.ts docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md src/application/localPlayerUseCases.ts
git commit -m "feat: a tela de edicao de atleta sai; Pessoas so le, convidado se edita em Gestao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -A` só nos diretórios desta task, para registrar as remoções; conferir `git status` antes — a árvore é compartilhada.)

---

### Task 12: Bancada, documentos, verificação e publicação

**Files:**
- Create: `preview/ficha.html`, `preview/ficha.tsx` (padrão de `preview/avaliacao.*`)
- Modify: `docs/JORNADA.md`, `docs/PERMISSOES.md`, `docs/superpowers/specs/2026-09-28-ficha-do-atleta-design.md` (emenda do avatar), `docs/superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md` (nota do link)

- [ ] **Step 1: Bancada** com o `AthleteProfileForm` no cadastro (vazio, com erro do servidor), em "Minha ficha" (preenchido, com condição física) e em Convidados (com e sem nível), mais a `CommunityGuestsArea` (lista vazia, com convidados, editando). Subir o Vite **da worktree** numa porta própria (`npx vite --port 3102 --strictPort` em segundo plano, porque o `preview_start` lê a configuração de `C:\Volley`) e conferir em 375px e desktop; parar o servidor ao fim.

- [ ] **Step 2: Documentos**
  - `JORNADA.md`, Etapa 1: perguntas "O que a conta pede além do nome de usuário?" (a ficha: quatro obrigatórios), "E as contas antigas?" (mesma tela no próximo acesso), "O destino sobrevive?" (sim, provado em `CompleteAthleteProfilePage.spec.tsx`), "Quem edita a ficha?" (só a conta; `fichaDoAtleta.dbtest.ts`). Fechar a pergunta aberta sobre a autoavaliação: descontinuada.
  - `PERMISSOES.md`, seção E: parte 3 feita; o que sobra para a parte 2.
  - Spec da ficha: emenda do `AvatarUpload` em "Minha ficha".
  - Spec da avaliação: "O link 'Avaliar atleta' saiu com a tela de edição em 2026-09-28; a entrada é só pela área de Avaliação."

- [ ] **Step 3: Verificação completa** — `npm run lint`, `npx eslint` nos arquivos tocados (só erros), `npx prettier --check`, `npm test`, `npm run build`, e `npm run test:db` inteiro.

- [ ] **Step 4: Commit**

```bash
git add preview/ficha.html preview/ficha.tsx docs/JORNADA.md docs/PERMISSOES.md docs/superpowers/specs/2026-09-28-ficha-do-atleta-design.md docs/superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md
git commit -m "docs: a ficha do atleta na jornada, e a bancada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Publicação (só com ok do usuário)** — migration e app com minutos de diferença:
  1. Conferir `schema_migrations` (última: `avaliacao_da_comunidade`) e que `ensure_account_ready` e a policy de `update` de `players` em produção são as do repositório (hash de `prosrc`, como na sessão de 2026-09-27).
  2. `apply_migration` com o arquivo exato; conferir os hashes dos corpos novos contra o arquivo.
  3. Leitura: as 6 contas respondem `needs_athlete_profile` (`select state from … ensure_account_ready` não roda por outra conta — conferir por `app_private.athlete_profile_complete` nas 6 fichas); `pg_policies` de `players` com a policy nova; advisors sem categoria nova.
  4. Merge fast-forward em `main`, testes no resultado, push, e deploy da Vercel `READY`.
