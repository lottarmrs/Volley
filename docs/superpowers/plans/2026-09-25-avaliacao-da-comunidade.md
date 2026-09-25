# Avaliação da comunidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar à avaliação por fundamento uma área própria na comunidade, onde dono e admin avaliam pelo cargo e designados avaliam por responsabilidade, sem ninguém se avaliar — salvo o único avaliador, em caráter provisório.

**Architecture:** o servidor passa a derivar `player.evaluate` também do cargo (`community_capabilities`), marca autoavaliações na escrita (`is_self_assessment`) e as tira da média quando existe nota de outra pessoa, num único ponto de cálculo (`compute_community_player_skill_profile`). Uma RPC nova lista o elenco para a tela. O cliente pergunta ao servidor quais capacidades a conta tem (`useCommunityCapabilities`), ganha o item "Avaliação" no menu, uma lista e um formulário que reaproveita a lógica de comando do `CommunityEvaluationEditor`, e move "designar avaliador" para Gestão → Membros.

**Tech Stack:** PostgreSQL/Supabase (plpgsql, RLS, `security definer`), React 19 + Vite 6 + TypeScript, react-router 7, daisyUI, Node test runner (`.test.ts`), Vitest + RTL (`.spec.tsx`), harness de Postgres real (`.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md`

## Global Constraints

- Uma migration só: `supabase/migrations/20260925130000_avaliacao_da_comunidade.sql`, construída ao longo das Tasks 1–3. Não aplicar em produção antes da Task 9.
- Toda função redefinida parte da **última** definição e repete `security definer`/`security invoker` e `search_path` — `create or replace` não herda atributos. Grants existentes são preservados pelo `create or replace`; funções novas precisam de `revoke all ... from public, anon` e `grant execute ... to authenticated`.
- Rubrica fixa: `v0-legacy-11`, 11 fundamentos `saque, recepcao, levantamento, ataque, bloqueio, defesa, velocidade, resistencia, leituraDeJogo, regularidade, controleEmocional`, notas de 0 a 10.
- Mensagem de recusa da autoavaliação no servidor: `Only the sole evaluator of this Community can assess themselves` (`42501`).
- UI em pt-BR. Sem comentários no código-fonte TS/TSX, salvo onde o arquivo já os usa para registrar um porquê. Prettier: aspas simples, 100 colunas.
- Imports por alias (`@app`, `@infra`, `@shared/types`, `@hooks`, `@logic`, `@ui`).
- Banco: `export VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55500/volley_test"` (container `volley_test_pg2`; `docker start volley_test_pg2` se não estiver no ar). Um arquivo: `node --import tsx --test src/test/db/<arquivo>.dbtest.ts`.
- A árvore de trabalho é compartilhada com outras sessões: `git status` antes de commitar e `git add` só por caminho explícito.
- Mensagem de commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push em `main` publica na Vercel: **não fazer push** sem ok explícito do usuário.

---

### Task 1: Dono e admin avaliam pelo cargo

**Files:**
- Create: `supabase/migrations/20260925130000_avaliacao_da_comunidade.sql`
- Create: `src/test/db/avaliacaoDaComunidade.dbtest.ts`
- Modify: `src/test/db/governanceCapabilities.dbtest.ts` (EXIT GATE 2, ~linha 137; dono positivo, ~linha 200; "two axes compose", ~linha 230)
- Modify: `src/test/db/communitySkillProfile.dbtest.ts` (~linhas 320-341)

**Interfaces:**
- Produces: `community_capabilities(community, user)` inclui `'player.evaluate'` para `owner` e `admin` ativos em `community_memberships`. Helpers de teste `cena()`, `como()`, `recusa()`, `avalia()` em `avaliacaoDaComunidade.dbtest.ts`, usados pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/db/avaliacaoDaComunidade.dbtest.ts`:

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

const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const RECORD_EDITOR = 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)';
const PROFILE = 'select public.get_community_player_skill_profile($1,$2,$3) as profile';

if (!isTestDatabaseConfigured()) {
  test(`avaliacao da comunidade requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(
      result.failures.filter(
        ({ migration }) => migration === '20260925130000_avaliacao_da_comunidade.sql',
      ).length,
      0,
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function usuario(rotulo: string): Promise<string> {
    const email = `aval-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email, name) values ($1, $2, $3) on conflict do nothing',
      [rows[0].id, email, rotulo],
    );
    return rows[0].id;
  }

  async function como<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function recusa(actor: string, sql: string, args: unknown[], mensagem?: RegExp) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, '42501');
      if (mensagem) assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  async function atleta(comunidade: string, dono: string, userId: string | null = null) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, user_id, has_account_identity_history)
       values ($1, $2, $3, true, $4, $5)`,
      [id, dono, `Atleta ${id.slice(0, 6)}`, userId, userId !== null],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, id, dono],
    );
    return id;
  }

  async function entra(comunidade: string, papel: 'admin' | 'member') {
    const id = await usuario(papel);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')`,
      [comunidade, id, papel],
    );
    return id;
  }

  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Avaliacao ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const { rows: fichas } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [dono],
    );
    return { comunidade, dono, fichaDoDono: fichas[0].id };
  }

  async function avalia(actor: string, comunidade: string, ficha: string, saque = 6) {
    return como(actor, RECORD, [
      randomUUID(),
      randomUUID(),
      comunidade,
      ficha,
      VERSION,
      { saque },
    ]);
  }

  async function saqueNoPerfil(actor: string, comunidade: string, ficha: string) {
    const { rows } = await como<{ profile: { dimensions: { dimension_key: string; value: number | null }[] } }>(
      actor,
      PROFILE,
      [comunidade, ficha, VERSION],
    );
    return rows[0].profile.dimensions.find((d) => d.dimension_key === 'saque')?.value ?? null;
  }

  test('dono e admin avaliam pelo cargo; membro nao; membro com EVALUATOR sim', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const membro = await entra(c.comunidade, 'member');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(c.dono, c.comunidade, ficha);
    await avalia(admin, c.comunidade, ficha);
    await recusa(membro, RECORD, [randomUUID(), randomUUID(), c.comunidade, ficha, VERSION, { saque: 5 }]);

    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [c.comunidade, membro]);
    await avalia(membro, c.comunidade, ficha);
  });

  test('admin rebaixado a membro deixa de avaliar na mesma hora', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(admin, c.comunidade, ficha);
    await client.query(
      "update public.community_memberships set role = 'member' where community_id = $1 and user_id = $2",
      [c.comunidade, admin],
    );
    await recusa(admin, RECORD, [randomUUID(), randomUUID(), c.comunidade, ficha, VERSION, { saque: 5 }]);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: FAIL — o `test.before` falha porque a migration ainda não existe, ou `dono e admin avaliam` falha com `42501 Not authorized to evaluate Players in this Community` na primeira chamada do dono.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260925130000_avaliacao_da_comunidade.sql`:

```sql
-- Avaliacao da comunidade (spec 2026-09-25-avaliacao-da-comunidade-design.md).
--
-- Decisao do usuario em 2026-09-25: dono e admin avaliam pelo cargo e podem designar outros
-- avaliadores. Isso troca, para player.evaluate, a regra GINV-CAP-002 escrita em
-- 20260905185744 ("a governance rank never confers the right to evaluate a Player"). Em
-- producao ninguem tinha EVALUATOR, entao nenhuma comunidade conseguia avaliar.

-- Ultima definicao: 20260905185744_versioned_player_evaluation_source.sql.
create or replace function public.community_capabilities(
  target_community_id uuid,
  target_user_id uuid
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.capability
    from public.community_memberships m
    cross join lateral (
      select unnest(
        case m.role
          when 'owner' then array[
            'community.members.manage',
            'community.ownership.transfer',
            'community.profile.update',
            'community.archive',
            'player.evaluate'
          ]
          when 'admin' then array[
            'community.members.manage',
            'community.profile.update',
            'player.evaluate'
          ]
          else array[]::text[]
        end
      ) as capability
    ) c
   where m.community_id = target_community_id
     and m.user_id = target_user_id
     and m.status = 'active'

  union

  select 'session.manage'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'ORGANIZER'
     and r.revoked_at is null

  union

  -- player.evaluate vem do cargo de dono ou admin (decisao de 2026-09-25) e tambem de uma
  -- responsabilidade EVALUATOR dada por quem gerencia membros.
  select 'player.evaluate'
    from public.community_responsibilities r
    join public.community_memberships m
      on m.community_id = r.community_id
     and m.user_id = r.user_id
     and m.status = 'active'
   where r.community_id = target_community_id
     and r.user_id = target_user_id
     and r.responsibility = 'EVALUATOR'
     and r.revoked_at is null;

  -- Deliberately absent, and each absence is asserted by the negative matrix:
  --   match.control      per-Match control is leased at Match time (GINV-MATCH-004),
  --                      never derived from a Community rank -- W7 owns it
  --   competition.admin  W8 owns it; an ORGANIZER is not a CompetitionAdmin
$$;
```

Antes de salvar, conferir com `grep -ln "create or replace function public.community_capabilities" supabase/migrations/*.sql` que `20260905185744` continua sendo o último arquivo e que o corpo acima difere dele **só** nos dois `'player.evaluate'` dos arrays e no comentário do terceiro ramo. **Não** acrescentar `grant`: a auditoria A7 (`20260908160000`) tirou o `execute` de `authenticated`, e o `create or replace` preserva essa revogação.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: PASS, 2 testes.

- [ ] **Step 5: Atualizar os testes que guardavam a regra antiga**

Em `src/test/db/governanceCapabilities.dbtest.ts`, trocar o teste `EXIT GATE: an Admin cannot evaluate a Player without an operational capability` inteiro por:

```ts
  // ── EXIT GATE 2 — trocado em 2026-09-25 ──────────────────────────────────
  test('an Admin evaluates by rank since 2026-09-25, and still holds no Owner capability', async () => {
    // GINV-CAP-002 blocked this until the user decided, on 2026-09-25, that owner and admin
    // evaluate by rank (spec 2026-09-25-avaliacao-da-comunidade-design.md). In production
    // nobody held EVALUATOR, so no Community could evaluate at all.
    const owner = await newUser('adm-owner@test.local');
    const admin = await newUser('adm-admin@test.local');
    const community = await newCommunity('AdminEval', owner);
    await governance(community, admin, 'admin');

    assert.deepEqual(await capabilities(community, admin), [
      'community.members.manage',
      'community.profile.update',
      'player.evaluate',
    ]);
  });
```

No teste `an Owner holds governance capabilities including ownership transfer`, o `deepEqual` passa a ser:

```ts
    assert.deepEqual(held, [
      'community.archive',
      'community.members.manage',
      'community.ownership.transfer',
      'community.profile.update',
      'player.evaluate',
    ]);
```

No teste `the two axes compose without either implying the other`, os dois `deepEqual` passam a ser, respectivamente:

```ts
    assert.deepEqual(await capabilities(community, person), [
      'community.members.manage',
      'community.profile.update',
      'player.evaluate',
      'session.manage',
    ]);
```

```ts
    assert.deepEqual(await capabilities(community, person), [
      'community.members.manage',
      'community.profile.update',
      'player.evaluate',
    ]);
```

Rodar a suíte e corrigir **só** outras comparações de conjunto de dono ou admin que falhem pelo mesmo motivo (acrescentar `'player.evaluate'` na ordem alfabética). Nenhuma outra assertiva muda.

Em `src/test/db/communitySkillProfile.dbtest.ts`, no laço `for (const role of ['owner', 'admin', 'member'])` (~linha 321), trocar a lista por `['member']` e acrescentar, logo depois do laço:

```ts
    // Desde 2026-09-25 dono e admin avaliam pelo cargo, e por isso leem o perfil.
    for (const role of ['owner', 'admin']) {
      const actor = role === 'owner' ? c.ownerId : await user();
      if (role !== 'owner') {
        await client.query(
          `insert into public.community_memberships (community_id, user_id, role, status)
           values ($1, $2, $3, 'active')`,
          [c.communityId, actor, role],
        );
      }
      await asIdentityCommitting(client, actor, () =>
        client.query('select public.get_community_player_skill_profile($1,$2,$3)', [
          c.communityId,
          c.playerId,
          VERSION,
        ]),
      );
    }
```

(`asIdentityCommitting` e `user` já estão importados/definidos no arquivo; conferir o nome exato do helper de usuário no topo e usá-lo.)

- [ ] **Step 6: Rodar as suítes afetadas**

Run:
```bash
for f in avaliacaoDaComunidade governanceCapabilities communitySkillProfile communityEvaluationEditor skillRubricContract playerEvaluationContributions balanceInputSnapshots securityAuditRemediation; do node --import tsx --test src/test/db/$f.dbtest.ts 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo " $f"; done
```
Expected: `ℹ fail 0` em todas.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260925130000_avaliacao_da_comunidade.sql src/test/db/avaliacaoDaComunidade.dbtest.ts src/test/db/governanceCapabilities.dbtest.ts src/test/db/communitySkillProfile.dbtest.ts
git commit -m "feat(db): dono e admin avaliam pelo cargo

Troca, para player.evaluate, a regra GINV-CAP-002: o EXIT GATE 2 de
governanceCapabilities afirmava que admin nao avalia, e o laco de
communitySkillProfile esperava recusa de dono e admin ao ler o perfil. As duas
assertivas mudam por decisao do usuario em 2026-09-25.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Autoavaliação só para o único avaliador, e fora da média quando há outra nota

**Files:**
- Modify: `supabase/migrations/20260925130000_avaliacao_da_comunidade.sql` (acrescentar ao fim)
- Modify: `src/test/db/avaliacaoDaComunidade.dbtest.ts` (acrescentar testes dentro do `else`)

**Interfaces:**
- Consumes: `cena()`, `como()`, `recusa()`, `avalia()`, `entra()`, `atleta()`, `saqueNoPerfil()` da Task 1.
- Produces: coluna `player_evaluation_contributions.is_self_assessment boolean not null default false`; função `app_private.community_has_other_evaluator(p_community_id uuid, p_user_id uuid) returns boolean`, usada pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar dentro do bloco `else`, depois dos testes da Task 1:

```ts
  const SOZINHO = /Only the sole evaluator of this Community can assess themselves/;

  test('com dois avaliadores, ninguem grava na propria ficha, por nenhum dos dois caminhos', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');

    await recusa(c.dono, RECORD, [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 9 }], SOZINHO);
    await recusa(
      c.dono,
      RECORD_EDITOR,
      [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 9 }, null],
      SOZINHO,
    );
    await avalia(admin, c.comunidade, c.fichaDoDono);
  });

  test('o unico avaliador se avalia, e a nota entra no perfil marcada como autoavaliacao', async () => {
    const c = await cena();

    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);

    const { rows } = await client.query<{ is_self_assessment: boolean }>(
      `select is_self_assessment from public.player_evaluation_contributions
        where community_id = $1 and player_id = $2 and superseded_at is null`,
      [c.comunidade, c.fichaDoDono],
    );
    assert.deepEqual(rows, [{ is_self_assessment: true }]);
    assert.equal(await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono), 9);
  });

  test('outra nota tira a autoavaliacao da media sem apaga-la; e o dono nao altera mais a sua', async () => {
    const c = await cena();
    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);

    const avaliador = await entra(c.comunidade, 'member');
    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [c.comunidade, avaliador]);

    assert.equal(await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono), 9, 'vale ate alguem avaliar');
    await recusa(c.dono, RECORD, [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 10 }], SOZINHO);

    await avalia(avaliador, c.comunidade, c.fichaDoDono, 4);
    assert.equal(await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono), 4);

    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.player_evaluation_contributions
        where player_id = $1 and is_self_assessment and superseded_at is null`,
      [c.fichaDoDono],
    );
    assert.equal(rows[0].n, 1, 'a autoavaliacao continua registrada');
  });

  test('a autoavaliacao de uma conta anonimizada continua marcada e continua saindo da conta', async () => {
    const c = await cena();
    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);
    await client.query(
      `update public.player_evaluation_contributions set evaluator_user_id = null
        where player_id = $1 and is_self_assessment`,
      [c.fichaDoDono],
    );

    const avaliador = await entra(c.comunidade, 'member');
    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [c.comunidade, avaliador]);
    await avalia(avaliador, c.comunidade, c.fichaDoDono, 3);

    assert.equal(await saqueNoPerfil(avaliador, c.comunidade, c.fichaDoDono), 3);
  });

  test('o reenvio de um comando ja registrado devolve o recibo, mesmo depois de surgir outro avaliador', async () => {
    const c = await cena();
    const args = [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 8 }];
    const primeiro = await como(c.dono, RECORD, args);

    await entra(c.comunidade, 'admin');
    const reenvio = await como(c.dono, RECORD, args);
    assert.deepEqual(reenvio.rows, primeiro.rows);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: FAIL — `com dois avaliadores` não recebe a recusa; `o unico avaliador se avalia` falha com `column "is_self_assessment" does not exist`.

- [ ] **Step 3: Acrescentar à migration a coluna, o helper e a regra de escrita**

Acrescentar ao fim de `20260925130000_avaliacao_da_comunidade.sql`:

```sql
-- A marca e gravada na escrita, nao deduzida depois: quando a conta de quem avaliou e
-- apagada, evaluator_user_id vira null, e uma deducao passaria a contar a autoavaliacao como
-- nota de outra pessoa.
alter table public.player_evaluation_contributions
  add column if not exists is_self_assessment boolean not null default false;

create or replace function app_private.community_has_other_evaluator(
  p_community_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id <> p_user_id
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
  or exists (
    select 1
      from public.community_responsibilities r
      join public.community_memberships m
        on m.community_id = r.community_id
       and m.user_id = r.user_id
       and m.status = 'active'
     where r.community_id = p_community_id
       and r.user_id <> p_user_id
       and r.responsibility = 'EVALUATOR'
       and r.revoked_at is null
  );
$$;

revoke all on function app_private.community_has_other_evaluator(uuid, uuid)
  from public, anon, authenticated;
```

Depois, copiar para o fim da migration o bloco `create or replace function public.record_player_evaluation(...) ... $$;` **inteiro** de `supabase/migrations/20260906130635_skill_rubric_contract.sql` (conferir antes, com `grep -ln "function public.record_player_evaluation(" supabase/migrations/2*`, que esse é o último arquivo). Na cópia, fazer exatamente estas três edições:

1. No bloco `declare`, acrescentar a variável:

```sql
  v_self boolean;
```

2. Logo **depois** do bloco `if v_receipt is not null then ... return; end if;` (o segundo `find_command_receipt`), e antes de `if not app_private.registration_player_standing_alive(...)`, acrescentar:

```sql
  v_self := public.player_is_linked_to_current_user(p_player_id);
  if v_self and app_private.community_has_other_evaluator(p_community_id, v_uid) then
    raise exception 'Only the sole evaluator of this Community can assess themselves'
      using errcode = '42501';
  end if;
```

3. No `insert into public.player_evaluation_contributions (...)`, acrescentar a coluna e o valor:

```sql
  insert into public.player_evaluation_contributions (
    id,
    community_id,
    player_id,
    evaluator_user_id,
    rubric_version,
    command_id,
    is_self_assessment
  ) values (
    p_contribution_id,
    p_community_id,
    p_player_id,
    v_uid,
    pg_catalog.btrim(p_rubric_version),
    p_command_id,
    v_self
  );
```

O reenvio continua devolvendo o recibo antes da regra, porque a regra vem depois do `return` do recibo.

- [ ] **Step 4: Acrescentar à migration a exclusão da autoavaliação no cálculo**

Copiar para o fim da migration o bloco `create function app_private.compute_community_player_skill_profile(...) ... $$;` **inteiro** de `supabase/migrations/20260908031027_global_skill_profile.sql` (linhas 1–86; é a única definição — conferir com `grep -ln`). Na cópia:

1. Trocar `create function` por `create or replace function`.
2. Trocar o CTE `contributions` por:

```sql
  ), contributions as (
    select c.id
      from public.player_evaluation_contributions c
     where c.community_id = p_community_id
       and c.player_id = p_player_id
       and c.rubric_version = p_rubric_version
       and c.superseded_at is null
       and (
         not c.is_self_assessment
         or not exists (
           select 1
             from public.player_evaluation_contributions o
            where o.community_id = p_community_id
              and o.player_id = p_player_id
              and o.rubric_version = p_rubric_version
              and o.superseded_at is null
              and not o.is_self_assessment
         )
       )
  ), scores as (
```

Nada mais muda na função: `language sql`, `stable`, `security invoker`, `set search_path = ''` continuam iguais à original.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: PASS, 7 testes.

- [ ] **Step 6: Rodar as suítes do modelo de avaliação**

Run o mesmo laço do Step 6 da Task 1.
Expected: `ℹ fail 0` em todas.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260925130000_avaliacao_da_comunidade.sql src/test/db/avaliacaoDaComunidade.dbtest.ts
git commit -m "feat(db): autoavaliacao so para o unico avaliador, e fora da media quando ha outra nota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A lista de atletas para a tela de avaliação

**Files:**
- Modify: `supabase/migrations/20260925130000_avaliacao_da_comunidade.sql` (acrescentar ao fim)
- Modify: `src/test/db/avaliacaoDaComunidade.dbtest.ts`

**Interfaces:**
- Consumes: `app_private.community_has_other_evaluator` (Task 2).
- Produces: `public.list_community_evaluation_roster(p_community_id uuid) returns jsonb` — array de `{player_id: uuid, name: text, nickname: text|null, position: text|null, has_account: boolean, my_last_evaluated_at: timestamptz|null, is_self: boolean}`, ordenado por `coalesce(nickname, name)`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar dentro do bloco `else`:

```ts
  const ROSTER = 'select public.list_community_evaluation_roster($1) as roster';

  type Linha = {
    player_id: string;
    has_account: boolean;
    my_last_evaluated_at: string | null;
    is_self: boolean;
  };

  async function lista(actor: string, comunidade: string): Promise<Linha[]> {
    const { rows } = await como<{ roster: Linha[] }>(actor, ROSTER, [comunidade]);
    return rows[0].roster;
  }

  test('a lista recusa quem nao avalia', async () => {
    const c = await cena();
    const membro = await entra(c.comunidade, 'member');
    await recusa(membro, ROSTER, [c.comunidade], /Not authorized to evaluate Players/);
  });

  test('a lista traz o elenco, marca quem eu avaliei, e nao traz nota', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const avaliada = await atleta(c.comunidade, c.dono);
    const pendente = await atleta(c.comunidade, c.dono);
    await avalia(admin, c.comunidade, avaliada);

    const linhas = await lista(admin, c.comunidade);
    const porId = new Map(linhas.map((l) => [l.player_id, l]));

    assert.notEqual(porId.get(avaliada)?.my_last_evaluated_at, null);
    assert.equal(porId.get(pendente)?.my_last_evaluated_at, null);
    assert.equal(porId.get(avaliada)?.has_account, false);
    assert.ok(linhas.every((l) => !('dimensions' in l) && !('value' in l)));
  });

  test('quem pede so aparece na lista quando pode se autoavaliar', async () => {
    const c = await cena();

    const sozinho = await lista(c.dono, c.comunidade);
    assert.deepEqual(
      sozinho.filter((l) => l.is_self).map((l) => l.player_id),
      [c.fichaDoDono],
    );

    const admin = await entra(c.comunidade, 'admin');
    const acompanhado = await lista(c.dono, c.comunidade);
    assert.equal(acompanhado.some((l) => l.player_id === c.fichaDoDono), false);
    assert.equal((await lista(admin, c.comunidade)).some((l) => l.player_id === c.fichaDoDono), true);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: FAIL com `function public.list_community_evaluation_roster(uuid) does not exist`.

- [ ] **Step 3: Acrescentar a função à migration**

```sql
create or replace function public.list_community_evaluation_roster(p_community_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pode_se_avaliar boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_community_id is null
     or not public.current_user_has_community_capability(p_community_id, 'player.evaluate')
  then
    raise exception 'Not authorized to evaluate Players in this Community' using errcode = '42501';
  end if;

  v_pode_se_avaliar := not app_private.community_has_other_evaluator(p_community_id, v_uid);

  return coalesce((
    select pg_catalog.jsonb_agg(linha order by linha->>'sort_key')
      from (
        select pg_catalog.jsonb_build_object(
                 'player_id', p.id,
                 'name', p.name,
                 'nickname', p.nickname,
                 'position', p.primary_position,
                 'has_account', p.user_id is not null or exists (
                   select 1 from public.player_account_links l
                    where l.player_id = p.id and l.status = 'ACTIVE'
                 ),
                 'my_last_evaluated_at', (
                   select pg_catalog.max(c.recorded_at)
                     from public.player_evaluation_contributions c
                    where c.community_id = p_community_id
                      and c.player_id = p.id
                      and c.evaluator_user_id = v_uid
                      and c.superseded_at is null
                 ),
                 'is_self', public.player_is_linked_to_current_user(p.id),
                 'sort_key', pg_catalog.lower(coalesce(nullif(p.nickname, ''), p.name))
               ) as linha
          from public.community_players cp
          join public.players p on p.id = cp.player_id
         where cp.community_id = p_community_id
           and app_private.registration_player_standing_alive(p_community_id, p.id)
           and (v_pode_se_avaliar or not public.player_is_linked_to_current_user(p.id))
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_community_evaluation_roster(uuid) from public, anon;
grant execute on function public.list_community_evaluation_roster(uuid) to authenticated;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/test/db/avaliacaoDaComunidade.dbtest.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Rodar a suíte de segurança de esquema**

Run: `node --import tsx --test src/test/db/schemaSecurity.dbtest.ts && node --import tsx --test src/test/db/advisorSecurityFindings.dbtest.ts`
Expected: PASS. Se `schemaSecurity` tiver uma lista fechada de funções executáveis por `authenticated`, acrescentar `list_community_evaluation_roster` a ela com o comentário `-- avaliacao da comunidade, 2026-09-25`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260925130000_avaliacao_da_comunidade.sql src/test/db/avaliacaoDaComunidade.dbtest.ts
git commit -m "feat(db): lista do elenco para a tela de avaliacao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: O cliente pergunta ao servidor o que a conta pode, e o menu ganha "Avaliação"

**Files:**
- Create: `src/infra/supabase/communityCapabilitiesCloudService.ts`
- Create: `src/application/communityCapabilitiesUseCases.ts`
- Create: `src/application/communityCapabilitiesUseCases.test.ts`
- Create: `src/hooks/useCommunityCapabilities.ts`
- Modify: `src/application/appRoutes.ts` (`paths`, `getPageTitleForPath`, `ShellNavItem.icon`, `getShellNavigationItems`)
- Modify: `src/application/appRoutes.test.ts`
- Modify: `src/app/AppShell.tsx` (mapa de ícones ~linha 86; chamada de `getShellNavigationItems` ~linha 633)

**Interfaces:**
- Por que não `community_capabilities`: a auditoria de 2026-09-08 (A7, `20260908160000`) tirou dela o `execute` de `authenticated`, porque revelava os papéis de qualquer usuário. O caminho do cliente é `current_user_has_community_capability`, que só responde sobre a própria conta.
- Produces:
  - `paths.avaliacao(communityId: string): string` → `/comunidades/${communityId}/avaliacao`
  - `paths.avaliacaoAtleta(communityId: string, playerCloudId: string): string` → `/comunidades/${communityId}/avaliacao/${playerCloudId}`
  - `loadCommunityCapabilities(communityCloudId: string | null | undefined, userId: string | null | undefined, gateway?: CommunityCapabilitiesGateway): Promise<AppResult<string[]>>`
  - `useCommunityCapabilities(community: Community | null): { capabilities: ReadonlySet<string>; resolved: boolean }`
  - `getShellNavigationItems({ ..., showEvaluation?: boolean })` — item `{ id: 'comunidade-avaliacao', label: 'Avaliação', icon: 'evaluation' }` entre Desempenho e Gestão.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/application/communityCapabilitiesUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCommunityCapabilities } from './communityCapabilitiesUseCases';

test('sem comunidade na nuvem ou sem conta, nao ha capacidade e nao chama o servidor', async () => {
  let chamou = false;
  const gateway = {
    has: async () => {
      chamou = true;
      return true;
    },
  };
  assert.deepEqual(await loadCommunityCapabilities(null, 'u1', gateway), { ok: true, value: [] });
  assert.deepEqual(await loadCommunityCapabilities('c1', null, gateway), { ok: true, value: [] });
  assert.equal(chamou, false);
});

test('devolve as capacidades que o servidor confirma, uma a uma', async () => {
  const perguntadas: string[] = [];
  const gateway = {
    has: async (_community: string, capability: string) => {
      perguntadas.push(capability);
      return capability === 'player.evaluate';
    },
  };
  assert.deepEqual(await loadCommunityCapabilities('c1', 'u1', gateway), {
    ok: true,
    value: ['player.evaluate'],
  });
  assert.deepEqual(perguntadas, ['player.evaluate']);

  const nega = { has: async () => false };
  assert.deepEqual(await loadCommunityCapabilities('c1', 'u1', nega), { ok: true, value: [] });
});

test('falha do servidor vira erro tecnico, nunca capacidade', async () => {
  const gateway = {
    has: async () => {
      throw new Error('rede');
    },
  };
  const result = await loadCommunityCapabilities('c1', 'u1', gateway);
  assert.equal(result.ok, false);
});
```

Acrescentar em `src/application/appRoutes.test.ts`:

```ts
test('a Avaliacao so aparece na lateral para quem o servidor deixa avaliar', () => {
  const sem = getShellNavigationItems({
    pathname: '/comunidades/c1',
    isStaff: false,
    pendingChanges: 0,
  });
  assert.ok(!sem.some((item) => item.id === 'comunidade-avaliacao'));

  const com = getShellNavigationItems({
    pathname: '/comunidades/c1/avaliacao/p1',
    isStaff: false,
    pendingChanges: 0,
    showEvaluation: true,
  });
  const labels = com.map((item) => item.label);
  assert.equal(labels.indexOf('Avaliação'), labels.indexOf('Desempenho') + 1);
  assert.deepEqual(
    com.filter((item) => item.active).map((item) => item.id),
    ['comunidade-avaliacao'],
  );
  assert.equal(paths.avaliacao('c1'), '/comunidades/c1/avaliacao');
  assert.equal(paths.avaliacaoAtleta('c1', 'p1'), '/comunidades/c1/avaliacao/p1');
  assert.equal(getPageTitleForPath('/comunidades/c1/avaliacao'), 'Avaliação');
  assert.equal(getPageTitleForPath('/comunidades/c1/avaliacao/p1'), 'Avaliar atleta');
});
```

(Conferir no topo do arquivo que `paths` e `getPageTitleForPath` estão importados de `./appRoutes`; acrescentar se não estiverem.)

O teste existente `a lateral da comunidade lista as seis areas e marca a ativa` continua passando sem mudança, porque sem `showEvaluation` o item não aparece.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/communityCapabilitiesUseCases.test.ts src/application/appRoutes.test.ts`
Expected: FAIL — módulo `./communityCapabilitiesUseCases` não existe; `paths.avaliacao is not a function`.

- [ ] **Step 3: Implementar**

`src/infra/supabase/communityCapabilitiesCloudService.ts`:

```ts
import { isSupabaseConfigured, supabase as client } from '../../lib/supabaseClient';

export const communityCapabilitiesCloudService = {
  async has(communityCloudId: string, capability: string): Promise<boolean> {
    if (!isSupabaseConfigured)
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    const { data, error } = await client.rpc('current_user_has_community_capability', {
      target_community_id: communityCloudId,
      target_capability: capability,
    });
    if (error) throw error;
    return data === true;
  },
};
```

`src/application/communityCapabilitiesUseCases.ts`:

```ts
import { communityCapabilitiesCloudService } from '@infra/supabase/communityCapabilitiesCloudService';
import { appOk, technicalError, type AppResult } from './appResult';

export interface CommunityCapabilitiesGateway {
  has(communityCloudId: string, capability: string): Promise<boolean>;
}

export const CAPABILITIES_OF_INTEREST = ['player.evaluate'] as const;

export async function loadCommunityCapabilities(
  communityCloudId: string | null | undefined,
  userId: string | null | undefined,
  gateway: CommunityCapabilitiesGateway = communityCapabilitiesCloudService,
): Promise<AppResult<string[]>> {
  const community = communityCloudId?.trim();
  const user = userId?.trim();
  if (!community || !user) return appOk([]);
  try {
    const granted = await Promise.all(
      CAPABILITIES_OF_INTEREST.map(async (capability) =>
        (await gateway.has(community, capability)) ? capability : null,
      ),
    );
    return appOk(granted.filter((capability): capability is string => capability !== null));
  } catch (error) {
    return technicalError('Não foi possível conferir suas permissões nesta comunidade.', error);
  }
}
```

`src/hooks/useCommunityCapabilities.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Community } from '@shared/types';
import { loadCommunityCapabilities } from '@app/communityCapabilitiesUseCases';
import { useAuth } from './useAuth';

const EMPTY: ReadonlySet<string> = new Set();

export function useCommunityCapabilities(community: Community | null): {
  capabilities: ReadonlySet<string>;
  resolved: boolean;
} {
  const auth = useAuth();
  const cloudId = community?.cloudId ?? null;
  const userId = auth.user?.id ?? null;
  const key = `${cloudId ?? ''}:${userId ?? ''}`;
  const [state, setState] = useState<{ key: string; capabilities: ReadonlySet<string> }>({
    key: '',
    capabilities: EMPTY,
  });

  useEffect(() => {
    let vivo = true;
    void loadCommunityCapabilities(cloudId, userId).then((result) => {
      if (!vivo) return;
      setState({ key, capabilities: result.ok ? new Set(result.value) : EMPTY });
    });
    return () => {
      vivo = false;
    };
  }, [cloudId, userId, key]);

  return state.key === key
    ? { capabilities: state.capabilities, resolved: true }
    : { capabilities: EMPTY, resolved: false };
}
```

Em `src/application/appRoutes.ts`:

1. Em `paths`, depois de `ligasComunidade`:

```ts
  avaliacao: (communityId: string) => `/comunidades/${communityId}/avaliacao`,
  avaliacaoAtleta: (communityId: string, playerCloudId: string) =>
    `/comunidades/${communityId}/avaliacao/${playerCloudId}`,
```

2. Em `getPageTitleForPath`, antes de `case 'gestao':`:

```ts
    case 'avaliacao':
      return segments[3] ? 'Avaliar atleta' : 'Avaliação';
```

3. Em `ShellNavItem.icon`, acrescentar `| 'evaluation'` antes de `| 'admin'`.

4. Em `getShellNavigationItems`, acrescentar `showEvaluation?: boolean;` à entrada; no array da comunidade, entre o item `comunidade-desempenho` e `comunidade-gestao`:

```ts
      {
        id: 'comunidade-avaliacao',
        label: 'Avaliação',
        icon: 'evaluation',
        to: paths.avaliacao(communityId),
        active: area === 'avaliacao',
      },
```

e o `return` passa a filtrar os dois itens condicionais:

```ts
    return items.filter(
      (item) =>
        (item.id !== 'comunidade-gestao' || input.showManagement !== false) &&
        (item.id !== 'comunidade-avaliacao' || input.showEvaluation === true),
    );
```

Em `src/app/AppShell.tsx`:

1. Importar `ClipboardCheck` de `lucide-react` junto dos outros ícones e acrescentar ao mapa: `evaluation: <ClipboardCheck className="w-5 h-5" />,`.
2. Importar `useCommunityCapabilities` de `'../hooks/useCommunityCapabilities'` e, ao lado de `currentCommunityPermissions`, declarar `const currentCommunityCapabilities = useCommunityCapabilities(currentCommunity);`.
3. Na chamada de `getShellNavigationItems`, acrescentar:

```ts
    showEvaluation:
      currentCommunityCapabilities.resolved &&
      currentCommunityCapabilities.capabilities.has('player.evaluate'),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/application/communityCapabilitiesUseCases.test.ts src/application/appRoutes.test.ts && npm run lint`
Expected: PASS e `tsc --noEmit` sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/infra/supabase/communityCapabilitiesCloudService.ts src/application/communityCapabilitiesUseCases.ts src/application/communityCapabilitiesUseCases.test.ts src/hooks/useCommunityCapabilities.ts src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/AppShell.tsx
git commit -m "feat: o menu mostra Avaliacao a quem o servidor deixa avaliar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A lista — tipo, serviço, caso de uso e modelo da tela

**Files:**
- Modify: `src/shared/types/communityEvaluation.ts`
- Modify: `src/types.ts` (export do tipo novo, junto dos outros de `communityEvaluation`)
- Modify: `src/infra/supabase/communityEvaluationCloudService.ts`
- Modify: `src/application/communityEvaluationUseCases.ts`
- Create: `src/application/evaluationRosterViewModel.ts`
- Create: `src/application/evaluationRosterViewModel.test.ts`
- Modify: `src/application/communityEvaluationUseCases.test.ts`

**Interfaces:**
- Produces:
  - tipo `CommunityEvaluationRosterEntry { playerId: string; name: string; nickname: string | null; position: string | null; hasAccount: boolean; myLastEvaluatedAt: string | null; isSelf: boolean }`
  - `CommunityEvaluationGateway.listRoster(communityId: string): Promise<CommunityEvaluationRosterEntry[]>`
  - `CommunityEvaluationGateway.listEvaluators(communityId: string): Promise<string[]>`
  - `loadCommunityEvaluationRoster(communityCloudId: string | null | undefined, gateway?): Promise<AppResult<CommunityEvaluationRosterEntry[]>>`
  - `listCommunityEvaluators(communityCloudId: string | null | undefined, gateway?): Promise<AppResult<string[]>>`
  - `buildEvaluationRosterView(entries: CommunityEvaluationRosterEntry[]): EvaluationRosterView` com `EvaluationRosterView { self: CommunityEvaluationRosterEntry | null; pending: CommunityEvaluationRosterEntry[]; evaluated: CommunityEvaluationRosterEntry[]; total: number; evaluatedCount: number }`
  - `nextPendingAfter(view: EvaluationRosterView, playerId: string): string | null`
  - `evaluationDisplayName(entry: CommunityEvaluationRosterEntry): string`
  - `classify` passa a traduzir a mensagem da autoavaliação.

- [ ] **Step 1: Escrever os testes que falham**

`src/application/evaluationRosterViewModel.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import { buildEvaluationRosterView, nextPendingAfter } from './evaluationRosterViewModel';

function entry(overrides: Partial<CommunityEvaluationRosterEntry>): CommunityEvaluationRosterEntry {
  return {
    playerId: overrides.playerId ?? 'p',
    name: overrides.name ?? 'Nome',
    nickname: overrides.nickname ?? null,
    position: overrides.position ?? null,
    hasAccount: overrides.hasAccount ?? true,
    myLastEvaluatedAt: overrides.myLastEvaluatedAt ?? null,
    isSelf: overrides.isSelf ?? false,
  };
}

test('pendentes primeiro, por nome; avaliados depois; a propria ficha a parte e fora da contagem', () => {
  const view = buildEvaluationRosterView([
    entry({ playerId: 'b', name: 'Bruna', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
    entry({ playerId: 'eu', name: 'Eu', isSelf: true }),
    entry({ playerId: 'c', name: 'Carla' }),
    entry({ playerId: 'a', name: 'Zé', nickname: 'Ana' }),
  ]);

  assert.equal(view.self?.playerId, 'eu');
  assert.deepEqual(view.pending.map((e) => e.playerId), ['a', 'c']);
  assert.deepEqual(view.evaluated.map((e) => e.playerId), ['b']);
  assert.equal(view.total, 3);
  assert.equal(view.evaluatedCount, 1);
});

test('o proximo pendente e o seguinte na ordem, e volta ao comeco; sem pendentes, nenhum', () => {
  const view = buildEvaluationRosterView([
    entry({ playerId: 'a', name: 'Ana' }),
    entry({ playerId: 'b', name: 'Bia' }),
    entry({ playerId: 'c', name: 'Caio', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
  ]);
  assert.equal(nextPendingAfter(view, 'a'), 'b');
  assert.equal(nextPendingAfter(view, 'b'), 'a');
  assert.equal(nextPendingAfter(view, 'c'), 'a');

  const completo = buildEvaluationRosterView([
    entry({ playerId: 'a', name: 'Ana', myLastEvaluatedAt: '2026-09-20T10:00:00Z' }),
  ]);
  assert.equal(nextPendingAfter(completo, 'a'), null);
});
```

Acrescentar ao fim de `src/application/communityEvaluationUseCases.test.ts` (o arquivo já importa `test` e `assert`; juntar os imports abaixo aos que já existem de `./communityEvaluationUseCases`, e renomear o helper se o nome `gatewayCom` já estiver em uso):

```ts
import { loadCommunityEvaluationRoster, submitCommunityEvaluation } from './communityEvaluationUseCases';

function gatewayCom(overrides: Partial<import('./communityEvaluationUseCases').CommunityEvaluationGateway>) {
  return {
    loadEditor: async () => {
      throw new Error('nao usado');
    },
    record: async () => undefined,
    activatedCommunityIds: async () => [],
    activate: async () => undefined,
    setEvaluator: async () => undefined,
    listRoster: async () => [],
    listEvaluators: async () => [],
    ...overrides,
  };
}

test('sem comunidade na nuvem, a lista pede para sincronizar', async () => {
  const result = await loadCommunityEvaluationRoster(null, gatewayCom({}));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /Sincronize esta comunidade antes de avaliar/);
});

test('a recusa da autoavaliacao chega em portugues', async () => {
  const result = await submitCommunityEvaluation(
    {
      commandId: 'c',
      contributionId: 'k',
      communityId: 'x',
      playerId: 'p',
      rubricVersion: 'v0-legacy-11',
      dimensions: { saque: 5 },
      expectedContributionId: null,
    },
    gatewayCom({
      record: async () => {
        throw Object.assign(
          new Error('Only the sole evaluator of this Community can assess themselves'),
          { code: '42501' },
        );
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.equal(
      result.error.message,
      'Você só pode se avaliar enquanto for a única pessoa que avalia nesta comunidade.',
    );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/application/evaluationRosterViewModel.test.ts src/application/communityEvaluationUseCases.test.ts`
Expected: FAIL — módulo `./evaluationRosterViewModel` não existe; `loadCommunityEvaluationRoster` não exportado.

- [ ] **Step 3: Implementar**

Em `src/shared/types/communityEvaluation.ts`, acrescentar:

```ts
export interface CommunityEvaluationRosterEntry {
  playerId: string;
  name: string;
  nickname: string | null;
  position: string | null;
  hasAccount: boolean;
  myLastEvaluatedAt: string | null;
  isSelf: boolean;
}
```

e em `src/types.ts` acrescentar `CommunityEvaluationRosterEntry,` ao `export type { ... } from './shared/types/communityEvaluation';`.

Em `src/infra/supabase/communityEvaluationCloudService.ts`, acrescentar ao objeto `supabase` (e o import de `CommunityEvaluationRosterEntry`):

```ts
  listRoster: async (communityId: string): Promise<CommunityEvaluationRosterEntry[]> => {
    const rows = await call<
      {
        player_id: string;
        name: string;
        nickname: string | null;
        position: string | null;
        has_account: boolean;
        my_last_evaluated_at: string | null;
        is_self: boolean;
      }[]
    >('list_community_evaluation_roster', { p_community_id: communityId });
    return (rows ?? []).map((row) => ({
      playerId: row.player_id,
      name: row.name,
      nickname: row.nickname,
      position: row.position,
      hasAccount: row.has_account,
      myLastEvaluatedAt: row.my_last_evaluated_at,
      isSelf: row.is_self,
    }));
  },
  listEvaluators: async (communityId: string): Promise<string[]> => {
    if (!isSupabaseConfigured)
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    const { data, error } = await client
      .from('community_responsibilities')
      .select('user_id')
      .eq('community_id', communityId)
      .eq('responsibility', 'EVALUATOR')
      .is('revoked_at', null);
    if (error) throw error;
    return ((data as { user_id: string }[] | null) ?? []).map((row) => row.user_id);
  },
```

Em `src/application/communityEvaluationUseCases.ts`:

1. Acrescentar à interface `CommunityEvaluationGateway`:

```ts
  listRoster(communityId: string): Promise<CommunityEvaluationRosterEntry[]>;
  listEvaluators(communityId: string): Promise<string[]>;
```

(e `type CommunityEvaluationRosterEntry` ao import de `@shared/types`).

2. Em `classify`, antes do `if (code === '42501')`:

```ts
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (code === '42501' && message.includes('Only the sole evaluator'))
    return productError(
      'permission_denied',
      'Você só pode se avaliar enquanto for a única pessoa que avalia nesta comunidade.',
    );
```

3. Acrescentar `'roster'` a `EvaluationAction` e ao `FALLBACK`: `roster: 'Não foi possível carregar os atletas. Verifique a conexão.',`.

4. Acrescentar:

```ts
export async function loadCommunityEvaluationRoster(
  communityCloudId: string | null | undefined,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<CommunityEvaluationRosterEntry[]>> {
  const id = communityCloudId?.trim();
  if (!id) return productError('invalid_input', 'Sincronize esta comunidade antes de avaliar.');
  try {
    return appOk(await gateway.listRoster(id));
  } catch (error) {
    return classify(error, 'roster');
  }
}

export async function listCommunityEvaluators(
  communityCloudId: string | null | undefined,
  gateway: CommunityEvaluationGateway = supabase,
): Promise<AppResult<string[]>> {
  const id = communityCloudId?.trim();
  if (!id) return appOk([]);
  try {
    return appOk(await gateway.listEvaluators(id));
  } catch (error) {
    return classify(error, 'manage');
  }
}
```

`src/application/evaluationRosterViewModel.ts`:

```ts
import type { CommunityEvaluationRosterEntry } from '@shared/types';

export interface EvaluationRosterView {
  self: CommunityEvaluationRosterEntry | null;
  pending: CommunityEvaluationRosterEntry[];
  evaluated: CommunityEvaluationRosterEntry[];
  total: number;
  evaluatedCount: number;
}

export function evaluationDisplayName(entry: CommunityEvaluationRosterEntry): string {
  return entry.nickname?.trim() || entry.name;
}

const byName = (a: CommunityEvaluationRosterEntry, b: CommunityEvaluationRosterEntry) =>
  evaluationDisplayName(a).localeCompare(evaluationDisplayName(b), 'pt-BR', {
    sensitivity: 'base',
  });

export function buildEvaluationRosterView(
  entries: CommunityEvaluationRosterEntry[],
): EvaluationRosterView {
  const others = entries.filter((entry) => !entry.isSelf);
  const pending = others.filter((entry) => !entry.myLastEvaluatedAt).sort(byName);
  const evaluated = others.filter((entry) => !!entry.myLastEvaluatedAt).sort(byName);
  return {
    self: entries.find((entry) => entry.isSelf) ?? null,
    pending,
    evaluated,
    total: others.length,
    evaluatedCount: evaluated.length,
  };
}

export function nextPendingAfter(view: EvaluationRosterView, playerId: string): string | null {
  const candidates = view.pending.filter((entry) => entry.playerId !== playerId);
  if (candidates.length === 0) return null;
  const index = view.pending.findIndex((entry) => entry.playerId === playerId);
  if (index < 0) return candidates[0].playerId;
  const after = view.pending.slice(index + 1).find((entry) => entry.playerId !== playerId);
  return (after ?? candidates[0]).playerId;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/application/evaluationRosterViewModel.test.ts src/application/communityEvaluationUseCases.test.ts && npm run lint`
Expected: PASS e `tsc` sem erro (qualquer gateway de teste existente que implemente `CommunityEvaluationGateway` precisa ganhar `listRoster`/`listEvaluators`; o `tsc` aponta onde).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/communityEvaluation.ts src/types.ts src/infra/supabase/communityEvaluationCloudService.ts src/application/communityEvaluationUseCases.ts src/application/communityEvaluationUseCases.test.ts src/application/evaluationRosterViewModel.ts src/application/evaluationRosterViewModel.test.ts
git commit -m "feat: a lista da avaliacao, do servidor ao modelo da tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: As telas — lista e formulário, depois de `/impeccable shape`

**Files:**
- Create: `src/components/community/evaluation/EvaluationRosterView.tsx`
- Create: `src/components/community/evaluation/EvaluationRosterView.spec.tsx`
- Modify: `src/components/player/CommunityEvaluationEditor.tsx` (tirar a parte de designar avaliador)
- Modify: `src/components/player/CommunityEvaluationEditor.spec.tsx`
- Create: `src/app/routes/evaluationRoutes.tsx`
- Modify: `src/app/AppRouter.tsx`

**Interfaces:**
- Consumes: `useCommunityCapabilities` (Task 4), `paths.avaliacao`/`paths.avaliacaoAtleta` (Task 4), `loadCommunityEvaluationRoster`, `buildEvaluationRosterView`, `nextPendingAfter`, `evaluationDisplayName` (Task 5), `CommunityEvaluationEditor` (existente).
- Produces: `EvaluationRosterView` com props `{ state: 'loading' | 'offline' | 'not_synced' | 'error' | 'ready'; errorMessage?: string; view?: EvaluationRosterView; canDesignate: boolean; managementPath: string; onOpen: (playerCloudId: string) => void; onRetry: () => void }`; rotas `CommunityEvaluationRoute` e `CommunityEvaluationPlayerRoute`.

- [ ] **Step 1: Rodar `/impeccable shape`**

Invocar a skill `impeccable` com `shape` para as duas telas desta task, passando a seção 2.3–2.4 da spec. A forma de dar a nota (número, passos ou deslizante) é decidida ali. As decisões visuais podem mudar classes e disposição do JSX abaixo, **não** os papéis e textos que o spec do Step 2 afirma — se o shape pedir outro texto, mudar o spec junto e dizer no commit.

- [ ] **Step 2: Escrever o spec que falha**

`src/components/community/evaluation/EvaluationRosterView.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { buildEvaluationRosterView } from '@app/evaluationRosterViewModel';
import { EvaluationRosterView } from './EvaluationRosterView';

const base = {
  playerId: 'p',
  name: 'Nome',
  nickname: null,
  position: 'ponteiro',
  hasAccount: true,
  myLastEvaluatedAt: null,
  isSelf: false,
};

function renderView(overrides: Partial<ComponentProps<typeof EvaluationRosterView>> = {}) {
  const onOpen = vi.fn();
  render(
    <MemoryRouter>
      <EvaluationRosterView
        state="ready"
        view={buildEvaluationRosterView([
          { ...base, playerId: 'a', name: 'Ana' },
          { ...base, playerId: 'b', name: 'Bia', hasAccount: false, myLastEvaluatedAt: '2026-09-20T10:00:00Z' },
        ])}
        canDesignate
        managementPath="/comunidades/c1/gestao"
        onOpen={onOpen}
        onRetry={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onOpen };
}

describe('EvaluationRosterView', () => {
  it('mostra o progresso, os pendentes antes dos avaliados e o selo sem conta', () => {
    renderView();
    expect(screen.getByText('Você avaliou 1 de 2 atletas')).toBeTruthy();
    const itens = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(itens[0]).toContain('Ana');
    expect(itens[1]).toContain('Bia');
    expect(itens[1]).toContain('sem conta');
  });

  it('tocar num atleta abre o formulario dele', () => {
    const { onOpen } = renderView();
    fireEvent.click(screen.getByRole('button', { name: /ana/i }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('a propria ficha aparece como autoavaliacao provisoria, com o convite para designar', () => {
    renderView({
      view: buildEvaluationRosterView([{ ...base, playerId: 'eu', name: 'Eu', isSelf: true }]),
    });
    expect(screen.getByText(/autoavaliação provisória/i)).toBeTruthy();
    expect(screen.getByText(/vale até alguém avaliar você/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /deixar alguém avaliar/i }).getAttribute('href')).toBe(
      '/comunidades/c1/gestao',
    );
  });

  it('vazio, completo, sem conexao e sem nuvem dizem o que aconteceu', () => {
    const { unmount } = render(
      <MemoryRouter>
        <EvaluationRosterView
          state="ready"
          view={buildEvaluationRosterView([])}
          canDesignate={false}
          managementPath="/g"
          onOpen={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ninguém no elenco ainda.')).toBeTruthy();
    unmount();

    renderView({
      view: buildEvaluationRosterView([{ ...base, myLastEvaluatedAt: '2026-09-20T10:00:00Z' }]),
    });
    expect(screen.getByText(/todos avaliados/i)).toBeTruthy();
  });

  it('sem conexao', () => {
    renderView({ state: 'offline', view: undefined });
    expect(screen.getByText('A avaliação precisa de conexão.')).toBeTruthy();
  });

  it('comunidade sem nuvem', () => {
    renderView({ state: 'not_synced', view: undefined });
    expect(screen.getByText('Sincronize esta comunidade antes de avaliar.')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/components/community/evaluation/EvaluationRosterView.spec.tsx`
Expected: FAIL — `Failed to resolve import "./EvaluationRosterView"`.

- [ ] **Step 4: Implementar a lista**

`src/components/community/evaluation/EvaluationRosterView.tsx` (classes ajustadas pelo Step 1; papéis e textos fixos):

```tsx
import { Link } from 'react-router';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import {
  evaluationDisplayName,
  type EvaluationRosterView as RosterModel,
} from '@app/evaluationRosterViewModel';

type State = 'loading' | 'offline' | 'not_synced' | 'error' | 'ready';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function Linha({
  entry,
  onOpen,
}: {
  entry: CommunityEvaluationRosterEntry;
  onOpen: (playerId: string) => void;
}) {
  const nome = evaluationDisplayName(entry);
  return (
    <li>
      <button
        type="button"
        aria-label={nome}
        className="flex w-full min-h-[44px] items-center gap-3 px-4 py-3 text-left hover:bg-base-300/40"
        onClick={() => onOpen(entry.playerId)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{nome}</span>
          {entry.position && (
            <span className="block text-[11px] uppercase tracking-wider text-base-content/55">
              {entry.position}
            </span>
          )}
        </span>
        {!entry.hasAccount && <span className="badge badge-ghost badge-sm">sem conta</span>}
        <span className="text-xs text-base-content/60">
          {entry.myLastEvaluatedAt
            ? `avaliado em ${dataCurta.format(new Date(entry.myLastEvaluatedAt))}`
            : 'falta avaliar'}
        </span>
      </button>
    </li>
  );
}

export function EvaluationRosterView({
  state,
  errorMessage,
  view,
  canDesignate,
  managementPath,
  onOpen,
  onRetry,
}: {
  state: State;
  errorMessage?: string;
  view?: RosterModel;
  canDesignate: boolean;
  managementPath: string;
  onOpen: (playerCloudId: string) => void;
  onRetry: () => void;
}) {
  if (state === 'loading')
    return (
      <p role="status" className="py-10 text-center text-sm text-base-content/60">
        Carregando atletas…
      </p>
    );
  if (state === 'offline')
    return <p className="py-10 text-center text-sm">A avaliação precisa de conexão.</p>;
  if (state === 'not_synced')
    return <p className="py-10 text-center text-sm">Sincronize esta comunidade antes de avaliar.</p>;
  if (state === 'error' || !view)
    return (
      <div role="alert" className="space-y-3 py-10 text-center text-sm">
        <p>{errorMessage ?? 'Não foi possível carregar os atletas.'}</p>
        <button type="button" className="btn btn-sm btn-outline" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    );

  return (
    <div className="space-y-5">
      {view.self && (
        <div className="rounded-box border border-warning/40 bg-warning/10 p-4 space-y-2">
          <ul>
            <Linha entry={view.self} onOpen={onOpen} />
          </ul>
          <p className="text-sm">
            <strong>Você — autoavaliação provisória.</strong> Vale até alguém avaliar você.
          </p>
          {canDesignate && (
            <Link to={managementPath} className="btn btn-sm btn-ghost">
              Deixar alguém avaliar
            </Link>
          )}
        </div>
      )}

      {view.total === 0 ? (
        <p className="py-10 text-center text-sm text-base-content/70">Ninguém no elenco ainda.</p>
      ) : (
        <>
          <p className="text-sm font-semibold">
            Você avaliou {view.evaluatedCount} de {view.total} atletas
          </p>
          {view.pending.length === 0 && (
            <p className="text-sm text-base-content/70">
              Todos avaliados — as notas podem ser revistas a qualquer momento.
            </p>
          )}
          <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-200">
            {[...view.pending, ...view.evaluated].map((entry) => (
              <Linha key={entry.playerId} entry={entry} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rodar o spec e ver passar**

Run: `npx vitest run src/components/community/evaluation/EvaluationRosterView.spec.tsx`
Expected: PASS, 6 testes. (Se `getAllByRole('listitem')` contar a linha da própria ficha no primeiro teste, não é o caso: ele não tem `isSelf`.)

- [ ] **Step 6: Tirar a designação de avaliador do formulário**

Em `src/components/player/CommunityEvaluationEditor.tsx`:

1. Remover o import de `setCommunityEvaluator`.
2. Remover os estados `selectedEvaluator`/`setSelectedEvaluator`, `managing`/`setManaging`, a função `manage`, a constante `management`, e as duas ocorrências de `{management}` no JSX.
3. Remover `setSelectedEvaluator('');` do `useEffect`.
4. Trocar `disabled={!!pending || managing || error?.code === 'conflict'}` por `disabled={!!pending || error?.code === 'conflict'}` e, no botão de enviar, `disabled={managing || error?.code === 'conflict' || (!!pending && !error?.recoverable)}` por `disabled={error?.code === 'conflict' || (!!pending && !error?.recoverable)}`.
5. Trocar o texto `'Você ainda não está autorizado a avaliar nesta comunidade.'` por `'Você não avalia nesta comunidade. Quem administra pode deixar você avaliar em Gestão → Membros.'`.

Em `src/components/player/CommunityEvaluationEditor.spec.tsx`, remover os casos que procuram "Autorizar avaliador", "Revogar avaliador" ou o seletor "Avaliador" — essa responsabilidade passa a ser provada no spec de Membros (Task 7) — e trocar qualquer expectativa do texto "Você ainda não está autorizado a avaliar nesta comunidade." pelo texto novo.

Run: `npx vitest run src/components/player` — Expected: PASS.

- [ ] **Step 7: Rotas**

`src/app/routes/evaluationRoutes.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import { paths } from '@app/appRoutes';
import { loadCommunityEvaluationRoster } from '@app/communityEvaluationUseCases';
import {
  buildEvaluationRosterView,
  evaluationDisplayName,
  nextPendingAfter,
} from '@app/evaluationRosterViewModel';
import { useCommunityShell } from '../shellContext';
import { useCommunityCapabilities } from '../../hooks/useCommunityCapabilities';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { EvaluationRosterView } from '../../components/community/evaluation/EvaluationRosterView';
import { CommunityEvaluationEditor } from '../../components/player/CommunityEvaluationEditor';

type Carga =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'not_synced' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: CommunityEvaluationRosterEntry[] };

function useEvaluationRoster(communityCloudId: string | null | undefined) {
  const [carga, setCarga] = useState<Carga>({ kind: 'loading' });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!communityCloudId) {
      setCarga({ kind: 'not_synced' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCarga({ kind: 'offline' });
      return;
    }
    let vivo = true;
    setCarga({ kind: 'loading' });
    void loadCommunityEvaluationRoster(communityCloudId).then((result) => {
      if (!vivo) return;
      setCarga(
        result.ok ? { kind: 'ready', entries: result.value } : { kind: 'error', message: result.error.message },
      );
    });
    return () => {
      vivo = false;
    };
  }, [communityCloudId, versao]);

  return { carga, recarregar: useCallback(() => setVersao((v) => v + 1), []) };
}

export function CommunityEvaluationRoute() {
  const { community } = useCommunityShell();
  const navigate = useNavigate();
  const { capabilities, resolved } = useCommunityCapabilities(community);
  const permissions = useCommunityPermissions(community);
  const { carga, recarregar } = useEvaluationRoster(community.cloudId);

  if (!resolved) return null;
  if (!capabilities.has('player.evaluate')) return <Navigate to={paths.comunidade(community.id)} replace />;

  return (
    <EvaluationRosterView
      state={carga.kind}
      errorMessage={carga.kind === 'error' ? carga.message : undefined}
      view={carga.kind === 'ready' ? buildEvaluationRosterView(carga.entries) : undefined}
      canDesignate={permissions.canManageMembers}
      managementPath={paths.gestao(community.id)}
      onOpen={(playerCloudId) => navigate(paths.avaliacaoAtleta(community.id, playerCloudId))}
      onRetry={recarregar}
    />
  );
}

export function CommunityEvaluationPlayerRoute() {
  const { community, auth } = useCommunityShell();
  const navigate = useNavigate();
  const { playerId } = useParams();
  const { capabilities, resolved } = useCommunityCapabilities(community);
  const { carga } = useEvaluationRoster(community.cloudId);

  if (!resolved) return null;
  if (!capabilities.has('player.evaluate') || !playerId || !community.cloudId)
    return <Navigate to={paths.comunidade(community.id)} replace />;

  const entrada = carga.kind === 'ready' ? carga.entries.find((e) => e.playerId === playerId) : undefined;

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => navigate(paths.avaliacao(community.id))}
      >
        Voltar à lista
      </button>
      {entrada && <h2 className="text-lg font-black">{evaluationDisplayName(entrada)}</h2>}
      <CommunityEvaluationEditor
        currentUserId={auth.user?.id ?? null}
        communityId={community.cloudId}
        playerId={playerId}
        onSaved={() => {
          const proximo =
            carga.kind === 'ready'
              ? nextPendingAfter(buildEvaluationRosterView(carga.entries), playerId)
              : null;
          navigate(proximo ? paths.avaliacaoAtleta(community.id, proximo) : paths.avaliacao(community.id));
        }}
      />
    </div>
  );
}
```

Em `src/app/AppRouter.tsx`, importar as duas rotas de `'./routes/evaluationRoutes'` e, dentro do `<Route element={<AccountGate />}>` da comunidade, depois de `desempenho/historico`:

```tsx
              <Route path="avaliacao" element={<CommunityEvaluationRoute />} />
              <Route path="avaliacao/:playerId" element={<CommunityEvaluationPlayerRoute />} />
```

A spec pede que a média do grupo **não** apareça: estas rotas não montam `CommunitySkillProfilePanel`.

- [ ] **Step 8: Verificar**

Run: `npm run lint && npm test`
Expected: `tsc` sem erro; unitários e UI todos verdes.

- [ ] **Step 9: Commit**

```bash
git add src/components/community/evaluation/EvaluationRosterView.tsx src/components/community/evaluation/EvaluationRosterView.spec.tsx src/components/player/CommunityEvaluationEditor.tsx src/components/player/CommunityEvaluationEditor.spec.tsx src/app/routes/evaluationRoutes.tsx src/app/AppRouter.tsx
git commit -m "feat: a area de Avaliacao da comunidade, lista e formulario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 7: "Deixar avaliar" em Gestão → Membros

**Files:**
- Modify: `src/components/community/CommunityMembersPanel.tsx`
- Modify: `src/components/community/CommunityMembersPanel.spec.tsx`

**Interfaces:**
- Consumes: `listCommunityEvaluators(communityCloudId)` (Task 5), `setCommunityEvaluator(communityId, userId, enabled)` (existente em `@app/communityEvaluationUseCases`).

- [ ] **Step 1: Escrever os testes que falham**

Em `CommunityMembersPanel.spec.tsx`, junto dos outros `vi.hoisted`/`vi.mock`:

```tsx
const { listEvaluatorsMock, setEvaluatorMock } = vi.hoisted(() => ({
  listEvaluatorsMock: vi.fn(),
  setEvaluatorMock: vi.fn(),
}));

vi.mock('@app/communityEvaluationUseCases', () => ({
  listCommunityEvaluators: listEvaluatorsMock,
  setCommunityEvaluator: setEvaluatorMock,
}));
```

No `beforeEach`, acrescentar:

```tsx
  listEvaluatorsMock.mockReset();
  setEvaluatorMock.mockReset();
  listEvaluatorsMock.mockResolvedValue({ ok: true, value: [] });
  setEvaluatorMock.mockResolvedValue({ ok: true, value: undefined });
```

E os testes:

```tsx
  it('dono deixa um membro avaliar, e o servidor recebe enabled verdadeiro', async () => {
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);
    render(<CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />);

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(within(linha).getByRole('button', { name: /deixar avaliar/i }));

    await waitFor(() =>
      expect(setEvaluatorMock).toHaveBeenCalledWith('community-cloud', 'bia', true),
    );
    expect(await within(linha).findByText(/avalia os atletas/i)).toBeTruthy();
  });

  it('tirar a avaliacao chama o servidor com enabled falso', async () => {
    listEvaluatorsMock.mockResolvedValue({ ok: true, value: ['bia'] });
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);
    render(<CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />);

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    fireEvent.click(await within(linha).findByRole('button', { name: /tirar a avaliação/i }));

    await waitFor(() =>
      expect(setEvaluatorMock).toHaveBeenCalledWith('community-cloud', 'bia', false),
    );
  });

  it('dono e admin mostram "Avalia pelo cargo", sem botao', async () => {
    mockUseCommunityMembers([
      member({ id: 'dono', userId: 'dono', role: 'owner', name: 'Ana Prado' }),
      member({ id: 'adm', userId: 'adm', role: 'admin', name: 'Caio Admin' }),
    ]);
    render(<CommunityMembersPanel community={community} currentUserId="dono" isSupabaseConfigured />);

    const linha = await screen.findByRole('listitem', { name: /caio admin/i });
    expect(within(linha).getByText(/avalia pelo cargo/i)).toBeTruthy();
    expect(within(linha).queryByRole('button', { name: /deixar avaliar/i })).toBeNull();
  });

  it('quem nao administra nao ve o botao de avaliar', async () => {
    mockUseCommunityMembers([
      member({ id: 'mod', userId: 'mod', role: 'moderator', name: 'Moderadora' }),
      member({ id: 'bia', userId: 'bia', role: 'member', name: 'Bianca Ferraz' }),
    ]);
    render(<CommunityMembersPanel community={community} currentUserId="mod" isSupabaseConfigured />);

    const linha = await screen.findByRole('listitem', { name: /bianca ferraz/i });
    expect(within(linha).queryByRole('button', { name: /deixar avaliar/i })).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/community/CommunityMembersPanel.spec.tsx`
Expected: FAIL — não há botão "Deixar avaliar".

- [ ] **Step 3: Implementar**

Em `CommunityMembersPanel.tsx`:

1. Importar `listCommunityEvaluators, setCommunityEvaluator` de `@app/communityEvaluationUseCases`.
2. Ao lado dos estados de organização:

```tsx
  const [avaliadores, setAvaliadores] = useState<string[]>([]);
  const [avaliadorEmCurso, setAvaliadorEmCurso] = useState<string | null>(null);
  const [erroDaAvaliacao, setErroDaAvaliacao] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let vivo = true;
    void listCommunityEvaluators(community.cloudId ?? null).then((resultado) => {
      if (vivo && resultado.ok) setAvaliadores(resultado.value);
    });
    return () => {
      vivo = false;
    };
  }, [enabled, community.cloudId]);

  const alternarAvaliacao = async (member: CommunityMember) => {
    const passaAAvaliar = !avaliadores.includes(member.userId);
    setAvaliadorEmCurso(member.userId);
    setErroDaAvaliacao(null);
    const resultado = await setCommunityEvaluator(
      community.cloudId ?? '',
      member.userId,
      passaAAvaliar,
    );
    setAvaliadorEmCurso(null);
    if (!resultado.ok) {
      setErroDaAvaliacao(resultado.error.message);
      return;
    }
    setAvaliadores((atuais) =>
      passaAAvaliar
        ? [...atuais.filter((id) => id !== member.userId), member.userId]
        : atuais.filter((id) => id !== member.userId),
    );
  };
```

3. No card do membro, logo depois do bloco do selo "Organiza as peladas" e do botão de organizar:

```tsx
                      {(member.role === 'owner' || member.role === 'admin') && (
                        <span className="badge badge-sm badge-outline gap-1 mt-1">
                          Avalia pelo cargo
                        </span>
                      )}
                      {member.role !== 'owner' &&
                        member.role !== 'admin' &&
                        avaliadores.includes(member.userId) && (
                          <span className="badge badge-sm badge-secondary badge-outline gap-1 mt-1">
                            Avalia os atletas
                          </span>
                        )}
                      {editable && enabled && member.role !== 'admin' && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs mt-1 px-1 text-primary"
                          disabled={busy || avaliadorEmCurso === member.userId}
                          onClick={() => void alternarAvaliacao(member)}
                        >
                          {avaliadores.includes(member.userId)
                            ? 'Tirar a avaliação'
                            : 'Deixar avaliar'}
                        </button>
                      )}
```

4. Onde `erroDaOrganizacao` é exibido, exibir também `erroDaAvaliacao` com o mesmo markup (`role="alert"`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/community/CommunityMembersPanel.spec.tsx`
Expected: PASS, incluindo os testes antigos.

- [ ] **Step 5: Commit**

```bash
git add src/components/community/CommunityMembersPanel.tsx src/components/community/CommunityMembersPanel.spec.tsx
git commit -m "feat: dono e admin deixam um membro avaliar em Gestao, Membros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A avaliação sai da edição do atleta

**Files:**
- Modify: `src/components/player/PlayerEditView.tsx` (~linhas 350–378)
- Modify: `src/components/player/CommunitySkillProfilePanel.tsx` (botão "Avaliar atleta")
- Modify: `src/components/player/CommunitySkillProfilePanel.spec.tsx`
- Modify: `src/components/player/PlayerEditView.spec.tsx`

**Interfaces:**
- Consumes: `paths.avaliacaoAtleta` (Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Em `CommunitySkillProfilePanel.spec.tsx` (envolvendo o render em `MemoryRouter` se ainda não estiver), afirmar que "Avaliar atleta" é um **link** para o caminho que `evaluationPathFor` devolve; em `PlayerEditView.spec.tsx`, que o link aponta para `/comunidades/<id local>/avaliacao/<cloudId do atleta>` e que a tela não renderiza mais o formulário. Os ids abaixo são os das fixtures de cada spec — trocar pelos que o arquivo já usa:

```tsx
expect(screen.getByRole('link', { name: /avaliar atleta/i }).getAttribute('href')).toBe(
  '/comunidades/community-local/avaliacao/player-cloud',
);
expect(screen.queryByRole('button', { name: /enviar avaliação/i })).toBeNull();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/player/CommunitySkillProfilePanel.spec.tsx src/components/player/PlayerEditView.spec.tsx`
Expected: FAIL — "Avaliar atleta" ainda é botão.

- [ ] **Step 3: Implementar**

1. Em `CommunitySkillProfilePanel`, a prop opcional `onOpenEvaluation?: (communityId: string) => void` (linhas 10 e 109) passa a ser `evaluationPathFor: (communityCloudId: string) => string | null`; o botão "Avaliar atleta" vira `<Link to={path}>` quando `path` não é `null`, e some quando é.
2. Em `PlayerEditView`, importar `paths` de `@app/appRoutes`, remover `selectedEvaluationCommunityId`/`setEvaluationCommunityId`, o bloco `{selectedEvaluationCommunityId && ... <CommunityEvaluationEditor .../>}` e o import de `CommunityEvaluationEditor`. Passar ao painel:

```tsx
        evaluationPathFor={(communityCloudId) => {
          const local = communities.find((c) => c.cloudId === communityCloudId);
          return local && editingPlayer.cloudId
            ? paths.avaliacaoAtleta(local.id, editingPlayer.cloudId)
            : null;
        }}
```

3. Trocar o parágrafo "Os atributos técnicos antigos são somente leitura. Use Avaliar atleta no perfil experimental da comunidade para registrar novas avaliações. O sorteio ainda usa os valores antigos." por "Os atributos técnicos antigos são somente leitura. As avaliações da comunidade ficam na área Avaliação." — a frase antiga sobre o sorteio é falsa desde XS-W6-08c.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run lint && npm test`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/player/PlayerEditView.tsx src/components/player/CommunitySkillProfilePanel.tsx src/components/player/CommunitySkillProfilePanel.spec.tsx src/components/player/PlayerEditView.spec.tsx
git commit -m "feat: avaliar atleta leva a area de Avaliacao

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bancada, documentos e publicação

**Files:**
- Create: `preview/avaliacao.html` e `preview/avaliacao.tsx` (seguir o padrão de `preview/inscricao.html` e `preview/inscricao.tsx`; ler os dois antes)
- Modify: `docs/PERMISSOES.md` (A3), `docs/JORNADA.md` (nova etapa), `docs/superpowers/specs/2026-09-06-community-evaluation-editor-design.md` (nota no topo)

- [ ] **Step 1: Bancada**

Montar em `preview/` a lista (`EvaluationRosterView`) nos estados: carregando, vazio, parcial, completo, com autoavaliação, sem conexão, sem nuvem, erro; e o formulário. Abrir com `preview_start` (configuração do dev server em `.claude/launch.json`) e conferir cada estado em 375px e em desktop, claro e escuro. Anexar uma captura por estado ao relatório.

- [ ] **Step 2: Documentos**

- `docs/PERMISSOES.md`, linha A3: "✅ Resolvido em 2026-09-25: dono e admin avaliam pelo cargo; designados por `EVALUATOR`; o menu pergunta ao servidor (`useCommunityCapabilities`)."
- `docs/JORNADA.md`: nova seção "Etapa 4b — Avaliar o elenco", com a tabela de perguntas nas quatro famílias, respondidas com evidência (`avaliacaoDaComunidade.dbtest.ts`, `EvaluationRosterView.spec.tsx`), incluindo "E se a comunidade tem um avaliador só?" → autoavaliação provisória.
- No topo da spec de 2026-09-06: "> **2026-09-25:** a decisão 'do not automatically grant evaluation capability from governance rank' foi trocada: dono e admin avaliam pelo cargo. Ver `2026-09-25-avaliacao-da-comunidade-design.md`."

- [ ] **Step 3: Verificação completa**

Run: `npm run lint && npm run lint:eslint 2>&1 | grep -E " error " ; npx prettier --check $(git diff --name-only main...HEAD) && npm test && npm run build`
Run: laço do Step 6 da Task 1, mais `avaliacaoDaComunidade`, `schemaSecurity`, `advisorSecurityFindings`.
Expected: nenhum erro; `ℹ fail 0` em todas.

- [ ] **Step 4: Commit**

```bash
git add preview/avaliacao.html preview/avaliacao.tsx docs/PERMISSOES.md docs/JORNADA.md docs/superpowers/specs/2026-09-06-community-evaluation-editor-design.md
git commit -m "docs: a avaliacao da comunidade na jornada, e a bancada das telas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Produção (só com ok do usuário)**

1. Comparar `select version, name from supabase_migrations.schema_migrations order by version desc limit 5` com `supabase/migrations/` — a última aplicada deve ser `admin_nao_mexe_em_admin`.
2. Aplicar `20260925130000_avaliacao_da_comunidade.sql` com `apply_migration`, nome `avaliacao_da_comunidade`.
3. Conferir por leitura:

```sql
select m.role, public.community_capabilities(m.community_id, m.user_id) as cap
  from public.community_memberships m
 where m.status = 'active' and m.role in ('owner', 'admin');
```

Esperado: toda linha de dono e de admin tem uma ocorrência `player.evaluate`.

```sql
select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as config,
       has_function_privilege('anon', p.oid, 'execute') as anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
   ('public','community_capabilities'), ('public','record_player_evaluation'),
   ('public','list_community_evaluation_roster'),
   ('app_private','compute_community_player_skill_profile'),
   ('app_private','community_has_other_evaluator'));
```

Esperado: `prosecdef` verdadeiro, salvo `compute_community_player_skill_profile` (invoker); `config` com `search_path=""`; `anon` falso.

4. `get_advisors` de segurança: nenhuma categoria nova.
5. Push do front só com ok do usuário.
