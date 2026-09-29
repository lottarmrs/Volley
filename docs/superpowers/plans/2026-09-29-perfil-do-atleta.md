# Perfil do atleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A carta do atleta ganha a aba "Avaliação" (para quem avalia e para o próprio atleta), a
presença frequente passa a ser calculada pelo histórico, e a foto de uma conta só a própria conta
troca, valendo na hora.

**Architecture:** Uma migration redefine `get_community_player_skill_profile` (o atleta lê a própria)
e `propose_player_avatar` (conta troca a própria foto; convidado, quem administra; sempre na hora).
No cliente, uma função pura de frequência substitui a marca `status.presencaFrequente`; a carta
recebe o resultado do perfil de fundamentos já existente; o fluxo de aprovação de foto, sem uso,
sai.

**Tech Stack:** Supabase Postgres (plpgsql), React 19 + Vite 6 + TypeScript, Node test runner,
Vitest + RTL, Postgres real (`*.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-29-perfil-do-atleta-design.md`

## Global Constraints

- UI em pt-BR. Textos exatos: aba "Avaliação"; selo "✓ Frequente"; no quadro de inscrição
  "· Presença frequente"; foto enviada: "Foto atualizada.".
- Frequente = entre as até 6 sessões mais recentes da comunidade com `status === 'finished'`
  (ordem por `date`, empate por `createdAt`), o atleta está em `selectedPlayerIds` de pelo menos
  `ceil(n / 2)`; `n = 0` → não frequente.
- Na carta, `canSeeEvaluation = (quem vê avalia nesta comunidade) || player.userId === conta atual`,
  e só com `community.cloudId` e `player.cloudId`.
- Última definição de `propose_player_avatar`: `20260624133117_player_avatars_approval.sql` (idêntica
  à de `schema.sql`, que é aplicado **antes** das migrations datadas). De
  `get_community_player_skill_profile`: `20260908031027_global_skill_profile.sql`.
- Sem comentários novos em TS/TSX; SQL com comentário curto do porquê.
- Commits em português sem acento, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nada em produção sem ok do usuário.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260929130000_perfil_do_atleta.sql` (novo) | as duas RPCs |
| `src/test/db/perfilDoAtleta.dbtest.ts` (novo) | prova as duas regras |
| `src/logic/community.ts` (+ teste) | `isFrequentInCommunity`, `frequentPlayerIds` |
| `src/application/communityRosterFilters.ts`, `src/application/localCommunityPresenceUseCases.ts` (+ testes) | usam o cálculo |
| `src/components/community/areas/CommunityPresenceArea.tsx`, `src/components/player/PlayerComponents.tsx`, `src/components/player/PlayersView.tsx`, `src/components/session/RegistrationBoardView.tsx`, `src/app/routes/sessionRoutes.tsx` | selo e pré-seleção pelo cálculo |
| `src/shared/types/player.ts`, `src/application/localPlayerUseCases.ts`, `src/components/player/GuestPlayerModal.tsx`, `src/hooks/usePlayers.ts`, `src/data/players/index.ts` | `presencaFrequente` opcional e sem escritores |
| `src/components/player/CommunitySkillProfilePanel.tsx` | exporta o resultado |
| `src/components/player/FutCardModal.tsx` (+ spec) | aba "Avaliação" |
| `src/application/screens/playersView/*`, `src/app/routes/communityRoutes.tsx` | passa quem pode ver |
| `src/components/player/AvatarUpload.tsx`, `src/components/community/areas/CommunityGuestsArea.tsx` (+ specs) | foto na hora; foto no convidado |
| `src/application/avatarUseCases.ts`, `src/infra/supabase/avatarStorageService.ts`, `src/components/player/AvatarApprovalInbox.tsx`, `src/architecture/currentStateLedger.ts` | sai a aprovação |

---

### Task 1: As duas regras no servidor

**Files:**
- Create: `supabase/migrations/20260929130000_perfil_do_atleta.sql`
- Create: `src/test/db/perfilDoAtleta.dbtest.ts`

- [ ] **Step 1: Conferir as últimas definições**

```bash
grep -ln "create or replace function public.get_community_player_skill_profile(" supabase/migrations/*.sql
grep -ln "create or replace function public.propose_player_avatar(" supabase/migrations/*.sql
```

Esperado: a primeira só em `20260908031027_global_skill_profile.sql`; a segunda em `schema.sql` e
`20260624133117_player_avatars_approval.sql` (idênticas). Copie o corpo de
`get_community_player_skill_profile` de `20260908031027…` e os `grant`/`revoke` das duas.

- [ ] **Step 2: Escrever o dbtest que falha**

`src/test/db/perfilDoAtleta.dbtest.ts`:

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

const MIGRATION = '20260929130000_perfil_do_atleta.sql';
const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const PROFILE = 'select public.get_community_player_skill_profile($1,$2,$3) as profile';
const PROPOSE = 'select public.propose_player_avatar($1, $2) as id';

if (!isTestDatabaseConfigured()) {
  test(`perfil do atleta requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function recusa(actor: string, sql: string, args: unknown[]) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string }) => {
      assert.equal(erro.code, '42501');
      return true;
    });
  }

  async function conta(rotulo: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`perfil-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [
      `u${randomUUID().slice(0, 8)}`,
    ]);
    const { rows: fichas } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [id],
    );
    return { userId: id, fichaId: fichas[0].id };
  }

  async function cena() {
    const dono = await conta('dono');
    const { rows } = await como<{ id: string }>(
      dono.userId,
      'select public.create_community_with_owner($1) as id',
      [`Perfil ${randomUUID()}`],
    );
    return { comunidade: rows[0].id, dono };
  }

  async function vincular(comunidade: string, fichaId: string, dono: string) {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active') on conflict (community_id, player_id) do nothing`,
      [comunidade, fichaId, dono],
    );
  }

  async function membroAdmin(comunidade: string) {
    const admin = await conta('admin');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [comunidade, admin.userId],
    );
    return admin;
  }

  async function convidado(comunidade: string, criador: string) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [id, criador],
    );
    await vincular(comunidade, id, criador);
    return id;
  }

  async function fotoDe(fichaId: string) {
    const { rows } = await client.query<{ avatar_url: string | null }>(
      'select avatar_url from public.players where id = $1',
      [fichaId],
    );
    return rows[0].avatar_url;
  }

  test('o atleta le a propria avaliacao e nao a de outro', async () => {
    const c = await cena();
    const atleta = await conta('atleta');
    const outro = await conta('outro');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await vincular(c.comunidade, outro.fichaId, c.dono.userId);
    await como(c.dono.userId, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      atleta.fichaId,
      VERSION,
      { saque: 7 },
    ]);

    const { rows } = await como<{ profile: { contribution_count: number } }>(
      atleta.userId,
      PROFILE,
      [c.comunidade, atleta.fichaId, VERSION],
    );
    assert.equal(rows[0].profile.contribution_count, 1);
    await recusa(atleta.userId, PROFILE, [c.comunidade, outro.fichaId, VERSION]);
  });

  test('quem avalia le a avaliacao de qualquer atleta da comunidade', async () => {
    const c = await cena();
    const atleta = await conta('atleta-2');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    const { rows } = await como<{ profile: { contribution_count: number } }>(
      c.dono.userId,
      PROFILE,
      [c.comunidade, atleta.fichaId, VERSION],
    );
    assert.equal(rows[0].profile.contribution_count, 0);
  });

  test('a conta troca a propria foto e vale na hora, mesmo com outro owner_id', async () => {
    const c = await cena();
    const atleta = await conta('foto');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await client.query('update public.players set owner_id = $1 where id = $2', [
      c.dono.userId,
      atleta.fichaId,
    ]);
    await como(atleta.userId, PROPOSE, [atleta.fichaId, 'https://x.test/eu.png']);
    assert.equal(await fotoDe(atleta.fichaId), 'https://x.test/eu.png');
  });

  test('quem criou a ficha e o admin nao trocam a foto de uma conta', async () => {
    const c = await cena();
    const admin = await membroAdmin(c.comunidade);
    const atleta = await conta('foto-alheia');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await client.query('update public.players set owner_id = $1 where id = $2', [
      c.dono.userId,
      atleta.fichaId,
    ]);
    await recusa(c.dono.userId, PROPOSE, [atleta.fichaId, 'https://x.test/dono.png']);
    await recusa(admin.userId, PROPOSE, [atleta.fichaId, 'https://x.test/admin.png']);
    assert.equal(await fotoDe(atleta.fichaId), null);
  });

  test('o admin troca a foto de um convidado e vale na hora', async () => {
    const c = await cena();
    const admin = await membroAdmin(c.comunidade);
    const g = await convidado(c.comunidade, c.dono.userId);
    await como(admin.userId, PROPOSE, [g, 'https://x.test/convidado.png']);
    assert.equal(await fotoDe(g), 'https://x.test/convidado.png');
  });
}
```

(Se o teste de admin falhar na preparação — nome da tabela de membros ou papel —, confira como
`avaliacaoDaComunidade.dbtest.ts` faz `entra(comunidade, 'admin')` e use o mesmo. Se
`propose_player_avatar` exigir uma URL do bucket de avatares, use o formato que
`avatarStorageService.ts` monta e diga no relatório.)

- [ ] **Step 3: Rodar e ver falhar**

```bash
export VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55500/volley_test"
node --import tsx --test src/test/db/perfilDoAtleta.dbtest.ts
```

Esperado: falham "o atleta le a propria avaliacao…" (42501 na leitura), "a conta troca a propria
foto…" (42501 ou foto pendente), "quem criou a ficha…" (o dono consegue) e "o admin troca a foto de
um convidado…" (fica pendente).

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20260929130000_perfil_do_atleta.sql`:

```sql
-- Perfil do atleta (spec 2026-09-29-perfil-do-atleta-design.md).
--
-- 1. O atleta le a propria avaliacao da comunidade, alem de quem avalia.
-- 2. Foto: ficha com conta, so a propria conta troca; convidado, quem administra. Sempre na
--    hora: em producao, em 2026-09-29, player_avatar_proposals estava vazia, entao o fluxo de
--    aprovacao nunca foi usado.

create or replace function public.get_community_player_skill_profile(
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rubric_version text := pg_catalog.btrim(p_rubric_version);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_community_id is null or p_player_id is null then
    raise exception 'Community and Player are required' using errcode = '23514';
  end if;
  if not public.current_user_has_community_capability(p_community_id, 'player.evaluate')
     and not public.player_is_linked_to_current_user(p_player_id) then
    raise exception 'Not authorized to read skill profiles in this Community'
      using errcode = '42501';
  end if;
  if not app_private.registration_player_standing_alive(p_community_id, p_player_id) then
    raise exception 'Player has no living roster standing in this Community'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.skill_rubric_versions r where r.rubric_version = v_rubric_version
  ) then
    raise exception 'Rubric version is not registered' using errcode = '23514';
  end if;
  return app_private.compute_community_player_skill_profile(
    p_community_id,
    p_player_id,
    v_rubric_version
  );
end;
$$;

create or replace function public.propose_player_avatar(
  p_player_id uuid,
  p_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_proposal uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Athlete not found' using errcode = '22023';
  end if;
  if public.player_has_account(p_player_id) then
    if not public.player_is_linked_to_current_user(p_player_id) then
      raise exception 'Only the athlete can change their own photo' using errcode = '42501';
    end if;
  elsif not public.current_user_is_player_admin(p_player_id) then
    raise exception 'Only owners/admins of this athlete can change the photo'
      using errcode = '42501';
  end if;

  insert into public.player_avatar_proposals (
    player_id, proposed_by, image_url, status, reviewed_by, reviewed_at
  )
  values (p_player_id, v_uid, p_image_url, 'approved', v_uid, now())
  returning id into v_proposal;

  perform set_config('app.allow_avatar_promotion', 'on', true);
  update public.players
     set avatar_url = p_image_url,
         updated_at = now()
   where id = p_player_id;

  update public.player_avatar_proposals
     set status = 'superseded'
   where player_id = p_player_id
     and status = 'pending'
     and id <> v_proposal;

  return v_proposal;
end;
$$;
```

Depois das duas funções, repita **exatamente** os `grant`/`revoke` que as definições anteriores
têm (os de `propose_player_avatar` estão em `schema.sql:3482-3483`; os de
`get_community_player_skill_profile`, em `20260908031027_global_skill_profile.sql` — copie as linhas).

(A policy de `update` de `players` da parte 3 bloqueia quem não é a conta; a função é
`security definer` e roda como dono, então o `update` passa. O gatilho `guard_avatar_url` exige
`app.allow_avatar_promotion = 'on'`, que a função liga.)

- [ ] **Step 5: Rodar e ver passar** — o comando do Step 3. Esperado: 5/5.

- [ ] **Step 6: Bateria inteira** em segundo plano (ver `CONTEXTO.md`/`CLAUDE.md`), esperando.
  Suítes antigas de avatar (`grep -ln "propose_player_avatar" src/test/db`) que esperem proposta
  `pending` ou aprovação do criador: leia o que protegem e ajuste só a assertiva que contradiz a
  decisão 3 da spec; diga no relatório.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260929130000_perfil_do_atleta.sql src/test/db/perfilDoAtleta.dbtest.ts
git commit -m "feat(db): atleta le a propria avaliacao e so a conta troca a propria foto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Acrescente ao `git add` as suítes antigas ajustadas.)

---

### Task 2: Presença frequente calculada

**Files:**
- Modify: `src/logic/community.ts` (junto de `getCommunityFrequency`, ~linha 279), teste em
  `src/logic/community.test.ts` (criar se não existir)
- Modify: `src/application/communityRosterFilters.ts` (~linha 41) + teste
- Modify: `src/application/localCommunityPresenceUseCases.ts` (~linha 125) + teste
- Modify: `src/components/community/areas/CommunityPresenceArea.tsx` (~linha 95) e quem o monta
- Modify: `src/components/player/PlayerComponents.tsx` (~linha 418, `PlayerItem`),
  `src/components/player/PlayersView.tsx` (~linha 114)
- Modify: `src/components/session/RegistrationBoardView.tsx` (~linhas 46, 531, 599),
  `src/app/routes/sessionRoutes.tsx` (onde monta `<RegistrationBoardView`)
- Modify: `src/shared/types/player.ts` (~linha 73), `src/application/localPlayerUseCases.ts` (~linha 48),
  `src/components/player/GuestPlayerModal.tsx` (~linha 170), `src/hooks/usePlayers.ts` (~linha 21),
  `src/data/players/index.ts` (~linha 44), `src/test/fixtures.ts` (~linha 62)

**Interfaces:**
- Produces:
  - `isFrequentInCommunity(playerId: string, sessions: Session[]): boolean`
  - `frequentPlayerIds(sessions: Session[]): Set<string>`
  - `PlayerItem` nova prop `isFrequent?: boolean`
  - `RegistrationBoardView` nova prop `frequentPlayerIds?: ReadonlySet<string>`
  - `CommunityPresenceArea` nova prop `sessions: Session[]`

- [ ] **Step 1: Testes que falham** — em `src/logic/community.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSession } from '../test/fixtures';
import { frequentPlayerIds, isFrequentInCommunity } from './community';

function encerrada(id: string, date: string, ids: string[]) {
  return makeSession(id, { status: 'finished', date, selectedPlayerIds: ids });
}

test('sem pelada encerrada ninguem e frequente', () => {
  assert.equal(isFrequentInCommunity('p1', []), false);
  assert.equal(
    isFrequentInCommunity('p1', [makeSession('s', { status: 'active', selectedPlayerIds: ['p1'] })]),
    false,
  );
});

test('metade arredondada para cima das encerradas', () => {
  const s = [
    encerrada('a', '2026-09-01', ['p1']),
    encerrada('b', '2026-09-08', ['p2']),
    encerrada('c', '2026-09-15', ['p1']),
  ];
  assert.equal(isFrequentInCommunity('p1', s), true);
  assert.equal(isFrequentInCommunity('p2', s), false);
});

test('so as 6 mais recentes contam', () => {
  const antigas = ['01', '02', '03', '04'].map((d, i) =>
    encerrada(`v${i}`, `2026-08-${d}`, ['p1']),
  );
  const recentes = ['01', '02', '03', '04', '05', '06'].map((d, i) =>
    encerrada(`r${i}`, `2026-09-${d}`, i < 2 ? ['p1'] : ['p2']),
  );
  assert.equal(isFrequentInCommunity('p1', [...antigas, ...recentes]), false);
  assert.equal(isFrequentInCommunity('p2', [...antigas, ...recentes]), true);
});

test('frequentPlayerIds junta quem e frequente', () => {
  const s = [encerrada('a', '2026-09-01', ['p1', 'p2']), encerrada('b', '2026-09-08', ['p1'])];
  assert.deepEqual([...frequentPlayerIds(s)].sort(), ['p1', 'p2']);
});
```

(Confira a assinatura de `makeSession` em `src/test/fixtures.ts`; se ela não aceitar `date`/`status`
por override, ajuste o helper local `encerrada`.)

  Em `communityRosterFilters` e `localCommunityPresenceUseCases`: ajustar/acrescentar testes para
  que o filtro `'frequent'` use as sessões (atleta com `status.presencaFrequente: true` e sem
  pelada **não** é frequente; atleta presente em 2 de 3 encerradas é) e para que
  `selectFrequentLocalPresencePlayers` marque presentes **todos os atletas ativos que recebe** (quem
  chama passa só os frequentes).

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --import tsx --test src/logic/community.test.ts src/application/communityRosterFilters.test.ts src/application/localCommunityPresenceUseCases.test.ts
```

(Use os nomes reais dos arquivos de teste existentes; `ls src/application/*Presence*.test.ts src/application/communityRosterFilters*.test.ts`.)

- [ ] **Step 3: Implementar**

`src/logic/community.ts`:

```ts
const FREQUENCY_WINDOW = 6;

function recentFinishedSessions(sessions: Session[]): Session[] {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.status === 'finished')
    .sort(
      (a, b) =>
        (b.date ?? '').localeCompare(a.date ?? '') ||
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    )
    .slice(0, FREQUENCY_WINDOW);
}

export function isFrequentInCommunity(playerId: string, sessions: Session[]): boolean {
  const recent = recentFinishedSessions(sessions);
  if (recent.length === 0) return false;
  const attended = recent.filter((session) =>
    (session.selectedPlayerIds ?? []).includes(playerId),
  ).length;
  return attended >= Math.ceil(recent.length / 2);
}

export function frequentPlayerIds(sessions: Session[]): Set<string> {
  const recent = recentFinishedSessions(sessions);
  const ids = new Set<string>();
  for (const session of recent) for (const id of session.selectedPlayerIds ?? []) ids.add(id);
  return new Set([...ids].filter((id) => isFrequentInCommunity(id, recent)));
}
```

  - `communityRosterFilters.ts`: `case 'frequent': return isFrequentInCommunity(player.id, communitySessions);`
  - `localCommunityPresenceUseCases.ts`: o filtro vira `.filter((player) => player.ativo)`.
  - `CommunityPresenceArea`: prop `sessions: Session[]` (as da comunidade); o botão chama
    `presenceApi.selectFrequentPlayers(community.id, players.filter((p) => isFrequentInCommunity(p.id, sessions)))`.
    Quem monta a área passa `getCommunitySessions(community.id, …sessions)` (siga o `grep -rn "<CommunityPresenceArea" src`).
  - `PlayerItem`: prop `isFrequent?: boolean`; o selo "✓ Frequente" usa `isFrequent`. `PlayersView`
    passa `isFrequent={frequent.has(player.id)}` com `const frequent = useMemo(() => frequentPlayerIds(communitySessions), [communitySessions])`
    (se `useMemo` com array novo a cada render incomodar, calcule sem memo — são no máximo 6 sessões).
  - `RegistrationBoardView`: prop `frequentPlayerIds?: ReadonlySet<string>`, repassada à `Linha`;
    a linha 599 vira `{player && frequentPlayerIds?.has(player.id) && ' · Presença frequente'}`.
    Em `sessionRoutes.tsx`, passe `frequentPlayerIds={frequentPlayerIds(getCommunitySessions(community.id, sess.sessions))}`.
  - Tipo: `presencaFrequente?: boolean` em `Player['status']`. Remova a escrita em
    `localPlayerUseCases.ts`, `GuestPlayerModal.tsx`, `usePlayers.ts`, `src/data/players/index.ts` e
    `src/test/fixtures.ts`. `grep -rn "presencaFrequente" src` depois: só podem sobrar
    `migrations.ts` (importação) e testes que provam que o campo é ignorado.

- [ ] **Step 4: Rodar e ver passar** — os testes do Step 2, `npm run lint`, `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/logic/community.ts src/logic/community.test.ts src/application/communityRosterFilters.ts src/application/localCommunityPresenceUseCases.ts src/components/community/areas/CommunityPresenceArea.tsx src/components/player/PlayerComponents.tsx src/components/player/PlayersView.tsx src/components/session/RegistrationBoardView.tsx src/app/routes/sessionRoutes.tsx src/shared/types/player.ts src/application/localPlayerUseCases.ts src/components/player/GuestPlayerModal.tsx src/hooks/usePlayers.ts src/data/players/index.ts src/test/fixtures.ts
git commit -m "feat: presenca frequente sai do historico da comunidade, nao de uma marca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Inclua os testes ajustados e quem monta `CommunityPresenceArea`.)

---

### Task 3: Aba "Avaliação" na carta

**Files:**
- Modify: `src/components/player/CommunitySkillProfilePanel.tsx` (exportar o resultado)
- Modify: `src/components/player/FutCardModal.tsx` (~linhas 36, 47, 130-137, 1029-1106) + spec
- Modify: `src/application/screens/playersView/playersViewModel.ts` (`CommunityRosterContext`),
  `src/components/player/PlayersView.tsx` (~linha 156), `src/app/routes/communityRoutes.tsx`
  (`CommunityPeopleRoute`, ~linha 375) + `src/components/player/PlayersView.spec.tsx`

**Interfaces:**
- Produces:
  - `export const CommunitySkillProfileResult: React.FC<{ communityId: string; playerId: string }>`
    (o atual `ProfileResult`, renomeado e exportado; `communityId` e `playerId` são os **cloudId**).
  - `FutCardModal` props novas: `communityId?: string | null` (cloudId da comunidade) e
    `canSeeEvaluation?: boolean`.
  - `CommunityRosterContext` ganha `canEvaluate: boolean` e `currentUserId: string | null`.

- [ ] **Step 1: Specs que falham**
  - `FutCardModal.spec.tsx` (criar se não existir; monte a carta com `makePlayer('p1', { cloudId: 'cp1' })`
    e listas vazias; mocke `@app/communitySkillProfileUseCases` com `loadCommunitySkillProfile`
    devolvendo `{ ok: true, value: { contribution_count: 2, dimensions: [], calculated_at: '2026-09-29T00:00:00Z' } }`):
    (a) com `canSeeEvaluation` e `communityId="cc1"` há a aba "Avaliação" e, ao abrir, o texto
    "2 avaliações compõem este perfil."; (b) sem `canSeeEvaluation`, não há a aba; (c) com
    `canSeeEvaluation` mas ficha sem `cloudId`, não há a aba.
  - `PlayersView.spec.tsx`: com `roster.canEvaluate = true`, tocar num atleta com `cloudId` e
    comunidade com `cloudId` mostra a aba; com `canEvaluate = false` e `currentUserId` igual ao
    `userId` do atleta tocado, mostra; com `canEvaluate = false` e outro atleta, não mostra.

- [ ] **Step 2: Rodar e ver falhar** —
  `npx vitest run src/components/player/FutCardModal.spec.tsx src/components/player/PlayersView.spec.tsx`.

- [ ] **Step 3: Implementar**
  - `CommunitySkillProfilePanel.tsx`: `const ProfileResult` vira
    `export const CommunitySkillProfileResult` (o `PanelForPlayer` passa a usá-lo pelo nome novo).
  - `FutCardModal.tsx`: `type MobileTab` ganha `'avaliacao'`; as props novas; `showEvaluation =
    Boolean(canSeeEvaluation && communityId && player.cloudId)`; em `tabItems`, depois de
    "Carreira", `...(showEvaluation ? [{ key: 'avaliacao', label: 'Avaliação', icon: <ClipboardCheck className="w-3.5 h-3.5" /> }] : [])`
    (ícone lucide já usado no app; confira o import); nos dois blocos de conteúdo (mobile ~1055 e
    desktop ~1104), `{mobileTab === 'avaliacao' && showEvaluation && renderEvaluation()}` com:

```tsx
  const renderEvaluation = () => (
    <div className="space-y-3">
      <p className="text-xs text-base-content/70">
        Média por fundamento nesta comunidade. Quem avaliou não aparece.
      </p>
      <CommunitySkillProfileResult communityId={communityId!} playerId={player.cloudId!} />
    </div>
  );
```

  - `playersViewModel.ts`: `CommunityRosterContext` ganha `canEvaluate: boolean; currentUserId: string | null;`.
  - `CommunityPeopleRoute` (`communityRoutes.tsx`): `const { capabilities } = useCommunityCapabilities(community);`
    e `roster: { community, canEvaluate: capabilities.has('player.evaluate'), currentUserId: auth.user?.id ?? null }`
    (confira como o shell expõe `auth` nessa rota).
  - `PlayersView.tsx`, no `<FutCardModal`: `communityId={roster?.community.cloudId ?? null}` e
    `canSeeEvaluation={Boolean(roster && (roster.canEvaluate || (selectedVutPlayer.userId && selectedVutPlayer.userId === roster.currentUserId)))}`.
  - Confira os outros montadores de `CommunityRosterContext` (`grep -rn "roster:" src`) e specs que
    constroem o contrato de Pessoas; acrescente os dois campos.

- [ ] **Step 4: Rodar e ver passar** — os specs, `npm run lint`, `npx vitest run src/app/AppRouter.spec.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/player/CommunitySkillProfilePanel.tsx src/components/player/FutCardModal.tsx src/components/player/FutCardModal.spec.tsx src/application/screens/playersView/playersViewModel.ts src/components/player/PlayersView.tsx src/components/player/PlayersView.spec.tsx src/app/routes/communityRoutes.tsx
git commit -m "feat: carta do atleta mostra a avaliacao da comunidade a quem avalia e ao proprio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Foto na hora, foto do convidado, sai a aprovação

**Files:**
- Modify: `src/components/player/AvatarUpload.tsx` (~linhas 40-52) (+ spec, se existir)
- Modify: `src/components/community/areas/CommunityGuestsArea.tsx` (editor) + spec
- Modify: `src/application/avatarUseCases.ts` (+ `.test.ts`), `src/infra/supabase/avatarStorageService.ts`,
  `src/application/index.ts`
- Delete: `src/components/player/AvatarApprovalInbox.tsx` (+ spec, se existir)
- Modify: `src/architecture/currentStateLedger.ts`, `docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md`

- [ ] **Step 1: Testes que falham**
  - `CommunityGuestsArea.spec.tsx`: editar um convidado com `cloudId` mostra o envio de foto (o
    rótulo/botão que o `AvatarUpload` renderiza — leia o componente); convidado sem `cloudId`, não.
  - `avatarUseCases.test.ts`: remover os testes de fila/aprovar/recusar; o de proposta afirma que
    o resultado aplicado devolve `applied: true`.
  - Spec de `AvatarUpload` (criar `AvatarUpload.spec.tsx` se não existir, com o gateway mockado
    via `vi.mock('@app/avatarUseCases')`): enviar um arquivo mostra "Foto atualizada." e chama
    `onApplied` com a URL.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `AvatarUpload.tsx`: o ramo `pending` sai; com sucesso, sempre `onApplied(imageUrl)` e
    "Foto atualizada."; o tipo `Feedback` perde `'pending'` e o ícone `Clock` sai se ficar sem uso.
    `ProposeResult` em `avatarStorageService.ts` pode continuar trazendo `applied`; se o servidor
    devolver `applied: false` (não deve mais), trate como erro "Não foi possível atualizar a foto.".
  - `CommunityGuestsArea.tsx`: no editor, acima do formulário, para convidado com `cloudId`:

```tsx
<AvatarUpload
  playerCloudId={guest.cloudId}
  currentAvatarUrl={guest.avatarUrl}
  initials={guest.nome.substring(0, 2).toUpperCase()}
  onApplied={(url) => onAvatarApplied?.(guest.id, url)}
/>
```

    com nova prop da área `onAvatarApplied?: (playerId: string, url: string) => void`, que a rota
    (`CommunityGuestsRoute` em `communityRoutes.tsx`) liga a
    `play.setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, avatarUrl: url } : p)))`.
    Confira os nomes reais das variáveis do editor.
  - Saem `listAvatarApprovalQueueQuery`, `reviewPlayerAvatarCommand`, `AvatarApprovalQueueItem`,
    e do gateway `listMyApprovalQueue`/`approve`/`reject` (e as funções correspondentes em
    `avatarStorageService.ts`), o reexport em `src/application/index.ts` e
    `AvatarApprovalInbox.tsx`. `grep -rn "AvatarApprovalInbox\|listMyApprovalQueue\|reviewPlayerAvatarCommand\|approve_player_avatar\|reject_player_avatar" src e2e preview`
    deve voltar vazio (fora de testes de banco).
  - Ledger: em `currentStateLedger.ts`, a entrada de avatar perde `AvatarApprovalInbox` dos
    leitores/escritores e registra `notes` com "Aprovação de foto descontinuada em 2026-09-29 (spec
    perfil-do-atleta): a foto vale na hora." Regenerar o `.md`:

```bash
node --import tsx -e "import('./src/architecture/currentStateLedgerDoc.ts').then(({ renderCurrentStateLedgerMarkdown }) => require('node:fs').writeFileSync('docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md', renderCurrentStateLedgerMarkdown()))"
```

- [ ] **Step 4: Rodar e ver passar** — os testes tocados, `npm run lint`, `npm test`
  (inclui `currentStateLedger.test.ts` e `importAliases.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A src/components/player src/application/avatarUseCases.ts src/application/avatarUseCases.test.ts src/application/index.ts src/infra/supabase/avatarStorageService.ts src/components/community/areas/CommunityGuestsArea.tsx src/components/community/areas/CommunityGuestsArea.spec.tsx src/app/routes/communityRoutes.tsx src/architecture/currentStateLedger.ts docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md
git commit -m "feat: foto vale na hora, convidado ganha foto e a aprovacao sai

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentos, verificação e publicação

**Files:**
- Modify: `docs/PERMISSOES.md`, `docs/JORNADA.md`

- [ ] **Step 1: Documentos**
  - `PERMISSOES.md`, seção E: "Parte 2b — perfil do atleta: ✅ feita em <data>" com o resumo
    (aba Avaliação na carta para quem avalia e para o próprio; presença frequente calculada; foto
    só da conta, na hora; convidado com foto em Convidados). Seção F: P19 resolvida (✅ riscada, no
    padrão das outras).
  - `JORNADA.md`, no formato de banco de perguntas: "O atleta vê a própria avaliação?" (sim, na
    carta; `perfilDoAtleta.dbtest.ts`, `FutCardModal.spec.tsx`), "Quem troca a foto de um atleta?"
    (conta: só ela; convidado: dono/admin; na hora; `perfilDoAtleta.dbtest.ts`), "O que é presença
    frequente?" (calculada; `community.test.ts`), com o limite do membro sem leitura das peladas
    (P17).

- [ ] **Step 2: Verificação** — `npm run lint`, `npx eslint` nos tocados (só erros),
  `npx prettier --check` nos tocados, `npm test`, `npm run build`, `npm run test:db` inteiro.

- [ ] **Step 3: Commit**

```bash
git add docs/PERMISSOES.md docs/JORNADA.md
git commit -m "docs: perfil do atleta na jornada e nas permissoes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Publicação (só com ok do usuário)**
  1. Produção: última migration `convidado_numa_comunidade`; `player_avatar_proposals` ainda vazia;
     corpo atual de `propose_player_avatar` e `get_community_player_skill_profile` igual ao do
     repositório (hash do `prosrc`, espaços normalizados).
  2. `apply_migration` com o arquivo exato; conferir `prosecdef`/`proconfig` e os `grant`s;
     advisors sem categoria nova.
  3. Merge fast-forward em `main`, testes no resultado, push, deploy `READY`.
