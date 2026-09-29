# Convidado numa comunidade só — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que atleta sem conta (convidado) pertença a uma comunidade só — no servidor, no
cliente e nos dois fluxos que hoje violam isso — e tirar o aviso-ruído da progressão (P21).

**Architecture:** Um gatilho em `community_players` recusa o segundo vínculo ativo de um atleta sem
conta. No cliente, uma regra pura e uma busca de duplicado restrita à comunidade substituem a busca
global; "Duplicar comunidade" deixa de mexer em atletas; o modal do convidado rápido pergunta
"Reativar?" quando o duplicado está desativado.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), React 19 + Vite 6 + TypeScript, Node test runner
(`*.test.ts`), Vitest + RTL (`*.spec.tsx`), Postgres real (`*.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-29-convidado-numa-comunidade-design.md`

## Global Constraints

- UI em pt-BR. Textos exatos: botão "Duplicar comunidade"; aviso do modal "<Nome> está desativado
  nesta comunidade."; ações "Reativar e usar" e "Cadastrar outro"; sem permissão, a linha "Peça a
  quem administra para reativá-lo."
- "Sem conta" = `public.player_has_account(player_id)` falso no servidor; `!player.userId` no
  cliente.
- O gatilho recusa com `errcode = '23514'` e mensagem `Guest athlete already belongs to another community`.
- Sem comentários novos em TS/TSX; SQL de migration com comentário curto do porquê.
- Mensagens de commit em português sem acento, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nada em produção (migration, push) sem ok do usuário.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260929120000_convidado_numa_comunidade.sql` (novo) | função e gatilho da regra |
| `src/test/db/convidadoNumaComunidade.dbtest.ts` (novo) | prova a regra no Postgres |
| `src/logic/playerDuplicates.ts` (+ teste) | `findGuestMatchInCommunity` substitui `findDuplicatePlayerByProfile` |
| `src/application/localPlayerUseCases.ts` (+ teste) | `applyGuestPlayerUpsert` restrito à comunidade |
| `src/components/player/GuestPlayerModal.tsx` (+ spec) | pergunta "Reativar?" |
| `src/application/screens/sessionWizard/*`, `src/components/session/SessionWizard.tsx`, `src/app/routes/CommunityDrawRoute.tsx`, `src/app/routes/sessionRoutes.tsx`, `src/app/AppShell.tsx`, `src/app/shellContext.ts` | liga "Reativar e usar" à reativação |
| `src/application/localCommunityUseCases.ts`, `src/hooks/useCommunities.ts`, `src/app/routes/communitiesContract.ts`, `src/app/routes/communityRoutes.tsx`, `src/application/screens/communitiesView/*`, `src/components/community/CommunitiesView.tsx`, `src/components/community/areas/CommunityDataArea.tsx` | duplicar só nome e regras; intent morto sai |
| `src/infra/supabase/syncService.ts` (+ teste) | recusa de convidado alheio sem aviso |
| `docs/PERMISSOES.md`, `docs/JORNADA.md`, spec da avaliação | registro |

---

### Task 1: A regra no servidor

**Files:**
- Create: `supabase/migrations/20260929120000_convidado_numa_comunidade.sql`
- Create: `src/test/db/convidadoNumaComunidade.dbtest.ts`

**Interfaces:**
- Produces: gatilho `zz_guard_guest_single_community` em `public.community_players`, função
  `app_private.guard_guest_single_community()`.

- [ ] **Step 1: Conferir a última definição do que o gatilho usa**

```bash
grep -ln "create or replace function public.player_has_account(" supabase/migrations/*.sql
grep -ln "community_players" supabase/migrations/*.sql
```

Esperado: `player_has_account` só em `20260928120000_ficha_do_atleta.sql`. Os gatilhos existentes
em `community_players` são `trigger_sync_community_player_active_status` (normaliza `active` a
partir de `status`) e `set_community_players_updated_at`. Postgres dispara gatilhos `before` em
ordem alfabética: o nome `zz_…` garante que o nosso roda **depois** da normalização de `active`.

- [ ] **Step 2: Escrever o dbtest que falha**

`src/test/db/convidadoNumaComunidade.dbtest.ts`:

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

const MIGRATION = '20260929120000_convidado_numa_comunidade.sql';

if (!isTestDatabaseConfigured()) {
  test(`convidado numa comunidade requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function conta(rotulo: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`convidado-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await asIdentityCommitting(client, id, () =>
      client.query('select * from public.ensure_account_ready($1)', [
        `u${randomUUID().slice(0, 8)}`,
      ]),
    );
    return id;
  }

  async function comunidade(dono: string) {
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Comunidade ${randomUUID()}`,
      ]),
    );
    return rows[0].id;
  }

  async function convidado(dono: string) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [id, dono],
    );
    return id;
  }

  function vincular(comunidadeId: string, playerId: string, dono: string) {
    return client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id)
       do update set active = true, status = 'active', deleted_at = null`,
      [comunidadeId, playerId, dono],
    );
  }

  async function recusaVinculo(comunidadeId: string, playerId: string, dono: string) {
    await assert.rejects(vincular(comunidadeId, playerId, dono), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, '23514');
      assert.match(erro.message ?? '', /already belongs to another community/);
      return true;
    });
  }

  test('convidado em A nao entra em B', async () => {
    const dono = await conta('dono');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await recusaVinculo(b, g, dono);
  });

  test('atleta com conta pode estar em A e B', async () => {
    const dono = await conta('dono-conta');
    const atleta = await conta('atleta');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const { rows } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [atleta],
    );
    await vincular(a, rows[0].id, dono);
    await vincular(b, rows[0].id, dono);
  });

  test('reescrever o vinculo na mesma comunidade passa', async () => {
    const dono = await conta('dono-mesma');
    const a = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await vincular(a, g, dono);
  });

  test('vinculo apagado libera outra comunidade, e reativar o antigo e recusado', async () => {
    const dono = await conta('dono-apagado');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await client.query(
      'update public.community_players set deleted_at = now() where community_id = $1 and player_id = $2',
      [a, g],
    );
    await vincular(b, g, dono);
    await recusaVinculo(a, g, dono);
  });

  test('vinculo inativo nao conta', async () => {
    const dono = await conta('dono-inativo');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await client.query(
      "update public.community_players set status = 'inactive' where community_id = $1 and player_id = $2",
      [a, g],
    );
    await vincular(b, g, dono);
  });

  test('convidado que ganha conta pode entrar em outra comunidade', async () => {
    const dono = await conta('dono-ganha');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    const novaConta = await conta('ganhou');
    await client.query('set session_replication_role = replica');
    try {
      await client.query('update public.players set user_id = null where user_id = $1', [novaConta]);
      await client.query('update public.players set user_id = $1 where id = $2', [novaConta, g]);
    } finally {
      await client.query('set session_replication_role = origin');
    }
    await vincular(b, g, dono);
  });
}
```

(O último teste usa `session_replication_role = replica` só para montar o estado "convidado que
ganhou conta" sem passar pelos gatilhos de identidade de `players` — mesmo recurso do
`fichaDoAtleta.dbtest.ts`. Se o harness tiver um helper de vínculo `player_account_links` mais
direto, use-o e diga no relatório.)

- [ ] **Step 3: Rodar e ver falhar**

```bash
docker ps --format '{{.Names}}' | grep -q volley_test_pg2 || docker start volley_test_pg2
export VOLLEY_TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55500/volley_test"
node --import tsx --test src/test/db/convidadoNumaComunidade.dbtest.ts
```

Esperado: falha no `before` (a migration ainda não existe) ou em "convidado em A nao entra em B".

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20260929120000_convidado_numa_comunidade.sql`:

```sql
-- Convidado numa comunidade so (spec 2026-09-29-convidado-numa-comunidade-design.md).
--
-- Convidado e o atleta sem conta, e pertence a uma comunidade: e ela que o cadastra, edita e
-- desativa. Em producao, em 2026-09-29, nenhum convidado estava em duas comunidades.
-- O nome zz_ faz o gatilho rodar depois de trigger_sync_community_player_active_status, que
-- normaliza active a partir de status.

create or replace function app_private.guard_guest_single_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null or new.active is not true then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.player_id::text, 0));

  if public.player_has_account(new.player_id) then
    return new;
  end if;

  if exists (
    select 1
      from public.community_players cp
     where cp.player_id = new.player_id
       and cp.community_id <> new.community_id
       and cp.deleted_at is null
       and cp.active
  ) then
    raise exception 'Guest athlete already belongs to another community' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_guest_single_community() from public, anon, authenticated;

drop trigger if exists zz_guard_guest_single_community on public.community_players;
create trigger zz_guard_guest_single_community
  before insert or update on public.community_players
  for each row execute function app_private.guard_guest_single_community();
```

- [ ] **Step 5: Rodar e ver passar**

O mesmo comando do Step 3. Esperado: 6/6.

- [ ] **Step 6: Bateria inteira, em segundo plano**

Conferir que não há outra rodando (ver `CONTEXTO.md`) e rodar
`npm run test:db > <arquivo> 2>&1` em segundo plano, esperando terminar. Esperado: tudo verde. Se
uma suíte antiga falhar porque vincula o mesmo convidado a duas comunidades, leia o que ela
protege: se o cenário for legítimo só com conta, dê conta ao atleta no teste; diga no relatório.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260929120000_convidado_numa_comunidade.sql src/test/db/convidadoNumaComunidade.dbtest.ts
git commit -m "feat(db): convidado so pode estar ativo numa comunidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A regra e a busca de duplicado no cliente

**Files:**
- Modify: `src/logic/playerDuplicates.ts`, `src/logic/playerDuplicates.test.ts`
- Modify: `src/application/localPlayerUseCases.ts` (`applyGuestPlayerUpsert`, ~linha 218),
  `src/application/localPlayerUseCases.test.ts` (~linhas 72-110)

**Interfaces:**
- Produces:
  - `findGuestMatchInCommunity(players: Player[], candidate: Pick<Player, 'id' | 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>, communityId: string): Player | undefined`
    — convidado (sem `userId`), não apagado, com `communityId` em `communityIds`, mesmo perfil;
    **ativo ou desativado**.
  - `applyGuestPlayerUpsert(players, guestPlayer, communityId)` — mesma assinatura; reaproveita só
    o convidado **ativo** da comunidade; desativado ou nenhum → cria novo com
    `communityIds: [communityId]`.
  - `findDuplicatePlayerByProfile` **sai** (único chamador era `applyGuestPlayerUpsert`).

- [ ] **Step 1: Testes que falham**

Em `src/logic/playerDuplicates.test.ts`, trocar os testes de `findDuplicatePlayerByProfile` por:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer } from '../test/fixtures';
import { findGuestMatchInCommunity } from './playerDuplicates';

const perfil = { nome: 'Vitur', genero: 'M' as const, posicaoPrincipal: 'oposto' as const, alturaCm: 176 };
const candidato = makePlayer('novo', { ...perfil, nome: ' vitur ' });

test('acha convidado de mesmo perfil na mesma comunidade', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'] });
  assert.equal(findGuestMatchInCommunity([g], candidato, 'c1')?.id, 'g');
});

test('acha tambem o desativado', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'], ativo: false });
  assert.equal(findGuestMatchInCommunity([g], candidato, 'c1')?.id, 'g');
});

test('nunca acha de outra comunidade, com conta ou apagado', () => {
  const outra = makePlayer('o', { ...perfil, communityIds: ['c2'] });
  const conta = makePlayer('k', { ...perfil, communityIds: ['c1'], userId: 'u1' });
  const apagado = makePlayer('x', { ...perfil, communityIds: ['c1'], deletedAt: '2026-09-01T00:00:00.000Z' });
  assert.equal(findGuestMatchInCommunity([outra, conta, apagado], candidato, 'c1'), undefined);
});

test('sem nome nao acha nada', () => {
  const g = makePlayer('g', { ...perfil, communityIds: ['c1'] });
  assert.equal(findGuestMatchInCommunity([g], { ...candidato, nome: '  ' }, 'c1'), undefined);
});
```

(Mantenha os testes existentes de `duplicatePlayerProfileKey`, se houver.)

Em `src/application/localPlayerUseCases.test.ts`, ajustar o teste
"applyGuestPlayerUpsert reuses duplicate guests…" para o `existing` ter `communityIds: ['community-1']`
(sem isso ele deixa de ser da comunidade — é a regra nova) e acrescentar:

```ts
test('applyGuestPlayerUpsert nao reaproveita convidado de outra comunidade', () => {
  const deOutra = { ...player('player-outra', 'Convidado'), communityIds: ['community-2'] };
  const novo = { ...player('guest-9', 'Convidado'), isGuest: true, communityIds: ['community-1'] };
  const result = applyGuestPlayerUpsert([deOutra], novo, 'community-1');
  assert.equal(result.wasCreated, true);
  assert.deepEqual(result.selectedPlayer.communityIds, ['community-1']);
  assert.deepEqual(result.players.find((p) => p.id === 'player-outra')?.communityIds, ['community-2']);
});

test('applyGuestPlayerUpsert com duplicado desativado cria outro', () => {
  const desativado = { ...player('player-off', 'Convidado'), communityIds: ['community-1'], ativo: false };
  const novo = { ...player('guest-10', 'Convidado'), isGuest: true, communityIds: ['community-1'] };
  const result = applyGuestPlayerUpsert([desativado], novo, 'community-1');
  assert.equal(result.wasCreated, true);
  assert.equal(result.selectedPlayer.id, 'guest-10');
});

test('applyGuestPlayerUpsert grava o convidado so na comunidade da pelada', () => {
  const novo = { ...player('guest-11', 'Visitante'), isGuest: true, communityIds: ['community-2'] };
  const result = applyGuestPlayerUpsert([], novo, 'community-1');
  assert.deepEqual(result.selectedPlayer.communityIds, ['community-1']);
});
```

(`player(id, nome)` é o helper local do arquivo; confira como ele monta gênero/posição/altura para
que os perfis batam.)

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --import tsx --test src/logic/playerDuplicates.test.ts src/application/localPlayerUseCases.test.ts
```

- [ ] **Step 3: Implementar**

`src/logic/playerDuplicates.ts` — substituir `findDuplicatePlayerByProfile` por:

```ts
export function findGuestMatchInCommunity(
  players: Player[],
  candidate: Pick<Player, 'id' | 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
  communityId: string,
) {
  const candidateKey = duplicatePlayerProfileKey(candidate);
  if (!candidateKey) return undefined;

  return players.find(
    (player) =>
      player.id !== candidate.id &&
      !player.userId &&
      !player.deletedAt &&
      (player.communityIds ?? []).includes(communityId) &&
      duplicatePlayerProfileKey(player) === candidateKey,
  );
}
```

`src/application/localPlayerUseCases.ts`:

```ts
export function applyGuestPlayerUpsert(
  players: Player[],
  guestPlayer: Player,
  communityId: string,
): { players: Player[]; selectedPlayer: Player; wasCreated: boolean } {
  const match = findGuestMatchInCommunity(players, guestPlayer, communityId);
  if (match && match.ativo !== false) return { players, selectedPlayer: match, wasCreated: false };
  const selectedPlayer: Player = { ...guestPlayer, communityIds: [communityId] };
  return { players: [...players, selectedPlayer], selectedPlayer, wasCreated: true };
}
```

(Ajuste o import: `findGuestMatchInCommunity` de `../logic/playerDuplicates`. O convidado novo
nasce com exatamente `[communityId]` — é assim que o cliente nunca dá uma segunda comunidade a um
convidado; o guarda é o gatilho da Task 1.)

`grep -rn "findDuplicatePlayerByProfile" src` deve voltar vazio.

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/logic/playerDuplicates.ts src/logic/playerDuplicates.test.ts src/application/localPlayerUseCases.ts src/application/localPlayerUseCases.test.ts
git commit -m "feat: convidado so e reaproveitado na propria comunidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: "Reativar e usar" no convidado rápido

**Files:**
- Modify: `src/components/player/GuestPlayerModal.tsx`, `src/components/player/GuestPlayerModal.spec.tsx`
- Modify: `src/application/screens/sessionWizard/sessionWizardIntents.ts`,
  `src/application/screens/sessionWizard/sessionWizardContract.ts` (+ `.test.ts`),
  `src/components/session/SessionWizard.tsx` (~linha 3018)
- Modify: `src/app/AppShell.tsx` (~linha 557), `src/app/shellContext.ts` (~linha 45),
  `src/app/routes/CommunityDrawRoute.tsx` (~linha 117), `src/app/routes/sessionRoutes.tsx` (~linha 349)

**Interfaces:**
- Consumes: `findGuestMatchInCommunity` (Task 2); `play.reactivateGuestPlayer({ playerId, canEdit, currentUserId }): AppResult<'reactivated'>` (já existe em `src/hooks/usePlayers.ts:165`).
- Produces:
  - `GuestPlayerModal` nova prop `onReactivateGuestPlayer?: (playerId: string, editDetails: boolean) => void`.
  - intent `{ kind: 'reactivateGuestPlayer'; playerId: string; editDetails: boolean }`; entrada do
    contrato `reactivateGuestPlayer: (playerId: string, editDetails: boolean) => void`.
  - shell: `reactivateGuestPlayerForSession(playerId: string, editDetails: boolean, communityId: string, canEdit: boolean): void`.

- [ ] **Step 1: Spec que falha** — em `GuestPlayerModal.spec.tsx`, com `players` contendo um
  convidado desativado da comunidade `c1` com o mesmo nome/gênero/posição/altura que o
  formulário vai montar, e `defaultCommunityId="c1"`:
  - (a) com `canEditDetails` e `onReactivateGuestPlayer`: preencher e confirmar mostra
    "<Nome> está desativado nesta comunidade." e **não** chama `onAddGuestPlayer`; "Reativar e usar"
    chama `onReactivateGuestPlayer('<id>', false)` e fecha; "Cadastrar outro" chama
    `onAddGuestPlayer` com o convidado novo.
  - (b) sem `canEditDetails`: o aviso aparece com "Peça a quem administra para reativá-lo.", sem
    "Reativar e usar"; "Cadastrar outro" funciona.
  - (c) com um desativado de **outra** comunidade de mesmo perfil: salva direto, sem aviso.
  Leia o spec atual para montar o formulário do jeito que ele já faz (nome, gênero, posição; a
  altura vem do atleta-modelo, então use perfis sem altura ou com o mesmo modelo).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/player/GuestPlayerModal.spec.tsx`.

- [ ] **Step 3: Implementar o modal** — em `handleSave` (onde hoje monta `newGuest` e chama
  `onAddGuestPlayer`): antes de chamar, se `defaultCommunityId` e
  `findGuestMatchInCommunity(players, newGuest, defaultCommunityId)` devolver um atleta com
  `ativo === false`, guardar `{ guest: newGuest, match, editDetails }` num estado
  `pendenteDesativado` e **não** salvar. Com esse estado, renderizar (no lugar do rodapé de
  ações) um bloco `role="alert"`:

```tsx
<div role="alert" className="alert alert-warning alert-soft flex flex-col items-start gap-3">
  <p className="text-sm font-bold">{pendenteDesativado.match.nome} está desativado nesta comunidade.</p>
  {!(canEditDetails && onReactivateGuestPlayer) && (
    <p className="text-xs">Peça a quem administra para reativá-lo.</p>
  )}
  <div className="flex flex-wrap gap-2">
    {canEditDetails && onReactivateGuestPlayer && (
      <button type="button" className="btn btn-primary min-h-11" onClick={reativar}>
        Reativar e usar
      </button>
    )}
    <button type="button" className="btn btn-ghost min-h-11" onClick={cadastrarOutro}>
      Cadastrar outro
    </button>
  </div>
</div>
```

  `reativar` chama `onReactivateGuestPlayer(match.id, editDetails)`, limpa o estado e fecha como o
  salvar já fecha; `cadastrarOutro` chama `onAddGuestPlayer(guest, editDetails)` e fecha. Extraia o
  "limpar e fechar" que já existe no fim de `handleSave` para uma função e reutilize.

- [ ] **Step 4: Ligar até o shell**
  - `sessionWizardIntents.ts`: acrescentar `| { kind: 'reactivateGuestPlayer'; playerId: string; editDetails: boolean }`.
  - `sessionWizardContract.ts`: entrada `reactivateGuestPlayer: (playerId: string, editDetails: boolean) => void`;
    `case 'reactivateGuestPlayer': input.reactivateGuestPlayer(intent.playerId, intent.editDetails); return;`.
    Teste em `sessionWizardContract.test.ts`: o intent chama a entrada com os argumentos.
  - `SessionWizard.tsx`: passar `onReactivateGuestPlayer={(playerId, editDetails) => dispatch({ kind: 'reactivateGuestPlayer', playerId, editDetails })}`.
  - `CommunityDrawRoute.tsx` e `sessionRoutes.tsx`: `reactivateGuestPlayer: (playerId, editDetails) => shell.reactivateGuestPlayerForSession(playerId, editDetails, community.id, permissions.canEditPlayerProfile)`.
  - `shellContext.ts`: declarar `reactivateGuestPlayerForSession`.
  - `AppShell.tsx`, junto de `applyGuestPlayer`:

```tsx
  const reactivateGuestPlayerForSession = (
    playerId: string,
    editDetails: boolean,
    communityId: string,
    canEdit: boolean,
  ) => {
    const result = play.reactivateGuestPlayer({
      playerId,
      canEdit,
      currentUserId: auth.user?.id ?? null,
    });
    if (!result.ok) {
      toasts.push(result.error.message, 'error');
      return;
    }
    if (sess.activeSession && sess.activeSession.communityId === communityId) {
      const nextSelected = [...new Set([...sess.activeSession.selectedPlayerIds, playerId])];
      wizard.updateSession({ selectedPlayerIds: nextSelected });
    }
    if (editDetails) {
      navigate(`${paths.convidados(communityId)}?editar=${playerId}`);
    }
  };
```

  (Confira os nomes reais de `toasts.push` e do objeto exposto pelo shell; exponha a função onde
  `applyGuestPlayer` é exposta, ~linha 654.)

- [ ] **Step 5: Rodar e ver passar** — o spec do modal, `npx vitest run src/app/AppRouter.spec.tsx`,
  `node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts`,
  `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/components/player/GuestPlayerModal.tsx src/components/player/GuestPlayerModal.spec.tsx src/application/screens/sessionWizard/sessionWizardIntents.ts src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts src/components/session/SessionWizard.tsx src/app/AppShell.tsx src/app/shellContext.ts src/app/routes/CommunityDrawRoute.tsx src/app/routes/sessionRoutes.tsx
git commit -m "feat: convidado rapido pergunta se reativa o desativado da comunidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Duplicar comunidade copia só nome e regras; o intent morto sai

**Files:**
- Modify: `src/application/localCommunityUseCases.ts` (~linhas 138-160 e 207-237) + `.test.ts`
- Modify: `src/hooks/useCommunities.ts` (~linha 152)
- Modify: `src/app/routes/communitiesContract.ts` (~linhas 55-75), `src/app/routes/communityRoutes.tsx` (~linha 360)
- Modify: `src/application/screens/communitiesView/communitiesViewIntents.ts`,
  `communitiesViewContract.ts` (+ `.test.ts`)
- Modify: `src/components/community/CommunitiesView.tsx` (~linhas 168, 349, 428, 476) (+ spec)
- Modify: `src/components/community/areas/CommunityDataArea.tsx` (~linhas 26, 131) (+ spec)

**Interfaces:**
- Produces: `onDuplicateCommunity: (communityId: string) => void` (sem `includeAthletes`) em todos
  os contratos; `duplicateCommunity(communityId: string)` no hook; intent
  `{ kind: 'duplicateCommunity'; communityId: string }`.

- [ ] **Step 1: Specs que falham**
  - `CommunityDataArea.spec.tsx`: trocar `/duplicar com atletas/i` por `/duplicar comunidade/i`
    nos dois testes existentes; acrescentar: clicar "Duplicar comunidade" chama
    `onDuplicateCommunity` com **um** argumento (`toHaveBeenCalledWith('community-1')`).
  - `CommunitiesView.spec.tsx`: o menu do cartão mostra "Duplicar comunidade" e não
    "Duplicar com atletas" (leia o spec para abrir o menu do jeito que ele já faz).
  - `localCommunityUseCases.test.ts`: o teste de duplicar (linha ~252) deixa de passar
    `includeAthletes` e de afirmar `result.includeAthletes`; afirma só a comunidade nova.
  - `communitiesViewContract.test.ts`: o intent `duplicateCommunity` chama
    `onDuplicateCommunity(communityId)`; o caso de `updatePlayerCommunities`, se existir, sai.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `localCommunityUseCases.ts`: a função de duplicar (linha ~138) perde `includeAthletes` da
    entrada e do retorno (`{ duplicate: Community } | null`). Remover
    `applyCommunityMembershipDuplicate` e `applyPlayerCommunityMemberships` (confira com `grep`
    que não sobra chamador) e seus testes.
  - `useCommunities.ts`: `duplicateCommunity(communityId: string)`.
  - `communitiesContract.ts` e `communityRoutes.tsx`: `onDuplicateCommunity: (communityId) => { comm.duplicateCommunity(communityId); }` — sai o ramo `play.setPlayers(...)` e o import. Em
    `communitiesContract.ts` sai também `onUpdatePlayerCommunities`.
  - `communitiesViewIntents.ts`: `duplicateCommunity` sem `includeAthletes`; remover
    `updatePlayerCommunities`. `communitiesViewContract.ts`: idem, e remover
    `onUpdatePlayerCommunities` do tipo de entrada.
  - `CommunitiesView.tsx`: props `onDuplicateCommunity: (communityId: string) => void` e sem
    `onUpdatePlayerCommunities`; o item do menu vira
    `<button type="button" onClick={() => onDuplicateCommunity(community.id)}>Duplicar comunidade</button>`.
  - `CommunityDataArea.tsx`: prop `onDuplicateCommunity: (communityId: string) => void`; o botão
    vira `onClick={() => onDuplicateCommunity(community.id)}` com o texto
    `<Copy className="w-4 h-4" /> Duplicar comunidade`. Continua dentro de `canExportCommunity`.
  - `grep -rn "includeAthletes\|applyCommunityMembershipDuplicate\|applyPlayerCommunityMemberships\|updatePlayerCommunities\|Duplicar com atletas" src e2e preview`
    deve voltar vazio.

- [ ] **Step 4: Rodar e ver passar** — os specs/testes tocados, `npm run lint`, `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/application/localCommunityUseCases.ts src/application/localCommunityUseCases.test.ts src/hooks/useCommunities.ts src/app/routes/communitiesContract.ts src/app/routes/communityRoutes.tsx src/application/screens/communitiesView src/components/community/CommunitiesView.tsx src/components/community/CommunitiesView.spec.tsx src/components/community/areas/CommunityDataArea.tsx src/components/community/areas/CommunityDataArea.spec.tsx
git commit -m "feat: duplicar comunidade copia so nome e regras, sem atletas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A recusa à progressão de convidado alheio deixa de avisar (P21)

**Files:**
- Modify: `src/infra/supabase/syncService.ts` (~linhas 1161-1170)
- Modify: `src/infra/supabase/syncService.test.ts` (teste "syncNow: convidado alheio pendente recusado avisa uma vez…", ~linha 2993)

- [ ] **Step 1: Ajustar o teste para o comportamento novo** — renomear para
  `'syncNow: convidado alheio pendente recusado sai synced, sem aviso, e nao volta a subir'` e
  trocar as assertivas de aviso por:

```ts
    assert.equal(tentativas, 1);
    assert.equal(issues.length, 0);
    assert.equal(first.players[0].syncStatus, 'synced');
```

  Procure outros testes que esperam o texto "O servidor recusou a edição deste convidado"
  (`grep -n "recusou a edição" src`) e ajuste do mesmo jeito.

- [ ] **Step 2: Rodar e ver falhar** — `node --import tsx --test src/infra/supabase/syncService.test.ts`.

- [ ] **Step 3: Implementar** — no `catch` do laço de atletas:

```ts
      } catch (error) {
        if (isTeamGuest && !playerForUpload.deletedAt && isPermissionRefusal(error)) {
          updatedPlayers.push(markSynced(playerForUpload, playerForUpload.cloudId, syncedAt));
          continue;
        }
        onIssue(`atleta "${player.nome}"`, error);
        updatedPlayers.push(playerForUpload);
      }
```

- [ ] **Step 4: Rodar e ver passar** — o teste, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git commit -m "fix: recusa a progressao de convidado alheio nao vira aviso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentos, verificação e publicação

**Files:**
- Modify: `docs/PERMISSOES.md`, `docs/JORNADA.md`,
  `docs/superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md` (seção 1.6)

- [ ] **Step 1: Documentos**
  - `PERMISSOES.md` seção E: "Parte 2a — convidado numa comunidade só: ✅ feita em <data>" com o
    resumo (gatilho, busca na comunidade, "Reativar e usar", duplicar só regras). Seção F: P8, P9,
    P10, P20 e P21 marcadas resolvidas (✅ e riscadas, no padrão de B2/B3).
  - `JORNADA.md`, no formato de banco de perguntas: "Um convidado pode estar em duas
    comunidades?" (não; `convidadoNumaComunidade.dbtest.ts`, `playerDuplicates.test.ts`) e
    "Duplicar a comunidade leva o elenco?" (não; `CommunityDataArea.spec.tsx`). Onde a jornada falar
    de "Duplicar com atletas", atualizar.
  - Spec da avaliação, 1.6: acrescentar "Entrou em 2026-09-29 com
    `2026-09-29-convidado-numa-comunidade-design.md`."

- [ ] **Step 2: Verificação** — `npm run lint`, `npx eslint` nos tocados (só erros),
  `npx prettier --check` nos tocados, `npm test`, `npm run build`, `npm run test:db` inteiro
  (em segundo plano, esperando).

- [ ] **Step 3: Commit**

```bash
git add docs/PERMISSOES.md docs/JORNADA.md docs/superpowers/specs/2026-09-25-avaliacao-da-comunidade-design.md
git commit -m "docs: convidado numa comunidade so, na jornada e nas permissoes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Publicação (só com ok do usuário)**
  1. Conferir em produção: 0 convidados com dois vínculos ativos (a mesma consulta da spec) e que
     nenhum gatilho `zz_guard_guest_single_community` existe ainda.
  2. `apply_migration` com o arquivo exato; conferir o gatilho em `pg_trigger` e a função em
     `pg_proc` (`prosecdef`, `proconfig`); advisors sem categoria nova.
  3. Merge fast-forward em `main`, testes no resultado, push, deploy da Vercel `READY`.
