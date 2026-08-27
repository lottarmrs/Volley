# Player Claim Prerequisite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desbloquear o bootstrap conta-jogador 1:1 substituindo o vinculo legado por um claim transacional que preserva o jogador canonico e publica aliases para reparo do cache/sync.

**Architecture:** O Supabase executa o claim como uma unica transacao, mantem o UUID e o username do jogador da conta, move referencias relacionais e registra um alias imutavel do jogador legado. O cliente baixa os aliases e os injeta no remapeador ja existente de `syncService`, que repara referencias textuais, arrays e JSON sem criar um segundo motor de migracao.

**Tech Stack:** PostgreSQL/Supabase migrations, `@supabase/supabase-js` 2.108.x, TypeScript 5.8, Node test runner, Vitest.

## Global Constraints

- Supabase Auth permanece a autoridade de identidade.
- O jogador da conta continua canonico, preservando `player.id`, `user_id` e `username`.
- Um jogador historico nao pode ser reivindicado por duas contas.
- Claim aprovado e atomico, idempotente, auditavel e exige cloud.
- Escrita direta nunca define ou promove `players.user_id`.
- O alias legado e imutavel e nunca volta a ser identidade ativa.
- Metadata de usuario nao participa de autorizacao.
- Funcoes `SECURITY DEFINER` fixam `search_path`, validam ator e possuem revoke/grant explicitos.
- O sync aplica aliases antes de merge/upload para impedir a reintroducao de IDs legados.
- A UI visivel permanece igual nesta fatia.
- Nenhuma migration e aplicada remotamente durante a implementacao.

---

### Task 1: Claim transacional e aliases no banco

**Files:**
- Modify: `supabase/migrations/20260722162234_account_identity_foundation.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `player_link_proposals`, `players`, `community_players`, `player_evaluations`, `player_avatar_proposals`.
- Produces: `player_identity_claims`, `player_identity_aliases`, RPC `approve_player_link(uuid)` retornando `jsonb`, e `propose_player_link(uuid)` preservando retorno UUID.

Antes das tabelas de claim, `schema.sql` deve consolidar as definicoes completas de
`player_link_proposals`, `player_evaluations` e `player_avatar_proposals` a partir das
migrations historicas correspondentes. Constraints, indices, RLS e grants devem ser
copiados semanticamente sem criar uma segunda variante. O contrato de schema deve
falhar se qualquer tabela consumida pela funcao de merge estiver ausente.

- [ ] **Step 1: Escrever contratos de schema que falham**

Adicionar testes que exijam:

```ts
test('account claim keeps canonical identity and records an immutable alias', () => {
  for (const dependency of ['player_link_proposals', 'player_evaluations', 'player_avatar_proposals']) {
    assert.match(baseSchema, new RegExp(`create table(?: if not exists)? public\\.${dependency}`, 'i'));
  }
  assert.match(accountIdentityMigration, /create table if not exists public\.player_identity_claims/i);
  assert.match(accountIdentityMigration, /create table if not exists public\.player_identity_aliases/i);
  assert.match(accountIdentityMigration, /unique\s*\(legacy_player_id\)/i);
  assert.match(accountIdentityMigration, /unique\s*\(idempotency_key\)/i);
  assert.match(accountIdentityMigration, /canonical_player_id[\s\S]*legacy_player_id/i);
  assert.match(accountIdentityMigration, /jsonb_build_object\([\s\S]*canonical_player_id/i);
});

test('approved legacy links merge into the existing account player', () => {
  assert.match(accountIdentityMigration, /create or replace function public\.merge_player_identity_claim/i);
  assert.match(accountIdentityMigration, /where user_id = v_user_id[\s\S]*for update/i);
  assert.doesNotMatch(accountIdentityMigration, /update public\.players\s+set user_id = v_user_id\s+where id = v_legacy_player_id/i);
  assert.match(accountIdentityMigration, /insert into public\.player_identity_aliases/i);
  assert.match(accountIdentityMigration, /set deleted_at = coalesce\(deleted_at, now\(\)\)/i);
});

test('claim migrates relational references before archiving the legacy player', () => {
  for (const relation of ['community_players', 'player_evaluations', 'player_avatar_proposals']) {
    assert.match(accountIdentityMigration, new RegExp(`public\\.${relation}[\\s\\S]*canonical`, 'i'));
  }
  assert.match(accountIdentityMigration, /status = 'superseded'[\s\S]*player_link_proposals/i);
});
```

- [ ] **Step 2: Rodar os contratos e confirmar RED**

Run: `npm run test:unit -- --test-name-pattern="account claim|approved legacy links|claim migrates"`

Expected: FAIL porque tabelas e helper de claim ainda nao existem.

- [ ] **Step 3: Implementar tabelas e invariantes**

Criar nos dois artefatos SQL:

```sql
create table if not exists public.player_identity_claims (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.player_link_proposals(id) on delete restrict,
  idempotency_key uuid not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  legacy_player_id uuid not null unique references public.players(id) on delete restrict,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('approved', 'conflict')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.player_identity_aliases (
  legacy_player_id uuid primary key references public.players(id) on delete restrict,
  legacy_local_id text,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  claim_id uuid not null unique references public.player_identity_claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (legacy_player_id <> canonical_player_id)
);
```

Habilitar RLS. Conceder somente `SELECT` a `authenticated`; a policy permite leitura quando o usuario e dono/canonico ou possui acesso comunitario a um dos jogadores. Nao criar policies de escrita.

- [ ] **Step 4: Implementar merge idempotente**

Criar `public.merge_player_identity_claim(p_proposal_id uuid, p_reviewer uuid) returns jsonb` como `SECURITY DEFINER`, sem grant para API roles. A funcao deve, nesta ordem:

1. Bloquear proposta, jogador legado e jogador canonico com `FOR UPDATE`.
2. Validar proposta pendente/aprovada, aprovador e `auth.uid() = p_reviewer`.
3. Retornar o `result` existente quando `proposal_id` ja foi concluido.
4. Recusar alias/claim concorrente com erro `23505` e mensagem `Player already claimed`.
5. Preservar `canonical.id`, `canonical.user_id` e `canonical.username`.
6. Mesclar somente campos esportivos, usando o legado quando o canônico estiver vazio/default; para JSON usar `canonical_json || legacy_json` apenas quando a conta ainda nao possui valor equivalente.
7. Inserir/upsert `community_players` no canônico antes de remover os vínculos do legado.
8. Consolidar `player_evaluations` por `(owner_id, player_id)`, mantendo o registro com `updated_at` mais recente.
9. Mover `player_avatar_proposals`; propostas pendentes conflitantes tornam-se `superseded`.
10. Superseder outras propostas pendentes do legado ou usuario.
11. Inserir claim e alias.
12. Arquivar o legado com `username = null`, `user_id = null`, `active = false` e `deleted_at` preenchido.
13. Retornar `jsonb_build_object('claim_id', ..., 'canonical_player_id', ..., 'legacy_player_id', ..., 'legacy_local_id', ...)`.

Todas as mutacoes de `user_id` usam `set_config('app.allow_user_link_promotion', 'on', true)`. Revogar `EXECUTE` de `PUBLIC`, `anon` e `authenticated` para o helper.

- [ ] **Step 5: Adaptar RPCs existentes**

`approve_player_link(uuid)` passa a retornar `jsonb` e delega ao helper depois da autorizacao administrativa. `propose_player_link(uuid)` continua retornando UUID; no auto-approve do criador, delega ao helper em vez de mover `user_id` para o legado. Revogar assinaturas antigas antes de recriar quando o tipo de retorno mudar; restaurar grant apenas a `authenticated`.

- [ ] **Step 6: Verificar Task 1**

Run: `npm run test:unit -- --test-name-pattern="account claim|approved legacy links|claim migrates|account identity|account bootstrap|canonical player"`

Expected: PASS.

Run: `npm run typecheck && npm run test:ui`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260722162234_account_identity_foundation.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(claim): merge legacy player into account identity"
```

---

### Task 2: Contrato tipado e adapter de claim

**Files:**
- Create: `src/application/playerClaim.ts`
- Create: `src/application/playerClaim.test.ts`
- Modify: `src/application/playerLinkUseCases.ts`
- Modify: `src/application/playerLinkUseCases.test.ts`
- Modify: `src/application/index.ts`
- Modify: `src/infra/supabase/playerLinkProposalCloudService.ts`
- Modify: `src/infra/supabase/mappers.test.ts`

**Interfaces:**
- Consumes: JSON retornado por `approve_player_link`.
- Produces: `PlayerClaimResult`, `PlayerIdentityAlias`, `applyClaimToPlayers` e gateway `approve(): Promise<PlayerClaimResult>`.

- [ ] **Step 1: Escrever testes de contrato e merge local**

```ts
test('applyClaimToPlayers preserves canonical username and archives legacy copy', () => {
  const result = applyClaimToPlayers([canonical, legacy], {
    claimId: 'claim-1',
    canonicalPlayerId: 'canonical-cloud',
    legacyPlayerId: 'legacy-cloud',
    legacyLocalId: 'legacy-local',
  }, '2026-07-22T00:00:00Z');
  assert.equal(result.find((player) => player.cloudId === 'canonical-cloud')?.username, 'ana');
  assert.ok(result.find((player) => player.cloudId === 'legacy-cloud')?.deletedAt);
});
```

Adicionar teste do mapper RPC snake_case -> camelCase e do comando de aprovacao usando o resultado cloud sem vincular o legado.

- [ ] **Step 2: Confirmar RED**

Run: `npm run test:unit -- --test-name-pattern="applyClaimToPlayers|claim result|reviewPlayerLinkCommand"`

Expected: FAIL pelos contratos ausentes.

- [ ] **Step 3: Implementar contratos**

```ts
export interface PlayerIdentityAlias {
  legacyPlayerId: string;
  legacyLocalId?: string;
  canonicalPlayerId: string;
}

export interface PlayerClaimResult extends PlayerIdentityAlias {
  claimId: string;
}
```

`applyClaimToPlayers` localiza por `cloudId` primeiro e `id` como fallback, preserva o jogador canônico, marca o legado como deletado e nao copia `username`, `userId` ou IDs.

- [ ] **Step 4: Adaptar gateway e comando**

`playerLinkProposalCloudService.approve` retorna `PlayerClaimResult`. `reviewPlayerLinkCommand`, quando a proposta e cloud-backed, aguarda a RPC e aplica o resultado ao array de jogadores; falha de rede conserva a intencao pendente atual.

- [ ] **Step 5: Verificar e commit**

Run: `npm run test:unit -- --test-name-pattern="applyClaimToPlayers|claim result|reviewPlayerLinkCommand"`

Expected: PASS.

Run: `npm run typecheck && npm run test:ui`

Expected: PASS.

```bash
git add src/application/playerClaim.ts src/application/playerClaim.test.ts src/application/playerLinkUseCases.ts src/application/playerLinkUseCases.test.ts src/application/index.ts src/infra/supabase/playerLinkProposalCloudService.ts src/infra/supabase/mappers.test.ts
git commit -m "feat(claim): consume canonical player result"
```

---

### Task 3: Reparo de aliases no sync

**Files:**
- Create: `src/infra/supabase/playerIdentityAliasCloudService.ts`
- Create: `src/infra/supabase/playerIdentityAliasCloudService.test.ts`
- Modify: `src/infra/supabase/syncService.ts`
- Modify: `src/infra/supabase/syncService.test.ts`

**Interfaces:**
- Consumes: `PlayerIdentityAlias[]` da nuvem.
- Produces: `applyPlayerIdentityAliases(payload, aliases)` e download cloud ja reparado.

- [ ] **Step 1: Escrever testes de reparo**

Criar caso com alias `legacy-cloud`/`legacy-local` -> `canonical-cloud` e payload contendo ambos. Exigir que o reparo:

- mantenha somente o jogador canônico ativo;
- remapeie `selectedPlayerIds`, `config`, `team.playerIds`, pontos/assistencias;
- remapeie game/session reports, presence e drafts;
- remapeie propostas;
- marque entidades alteradas como `pending` sem ressuscitar o legado.

- [ ] **Step 2: Confirmar RED**

Run: `npm run test:unit -- --test-name-pattern="player identity aliases|downloads aliases before merge"`

Expected: FAIL porque service e reparo nao existem.

- [ ] **Step 3: Implementar service read-only**

O service executa:

```ts
supabase
  .from('player_identity_aliases')
  .select('legacy_player_id, legacy_local_id, canonical_player_id');
```

Mapear para `PlayerIdentityAlias`; nenhuma escrita direta.

- [ ] **Step 4: Reutilizar o remapeador existente**

Implementar `applyPlayerIdentityAliases` junto de `consolidateDuplicateRecords`, alimentando o `playerIdMap` com `legacyPlayerId` e `legacyLocalId` para o ID local do jogador canônico (`canonical.cloudId === canonicalPlayerId`, fallback `canonical.id`). Reutilizar `remapIdArray`, `remapSessionConfig`, `remapGameReportPlayers`, presença e drafts existentes.

No download, buscar aliases em `Promise.all`, aplicar ao payload cloud antes do merge. Em `syncNow`, aplicar novamente ao payload local antes de upload, tornando retry idempotente.

- [ ] **Step 5: Verificacao completa**

Run: `npm run test:unit`

Expected: PASS.

Run: `npm run typecheck && npm run test:ui && npm run build`

Expected: PASS.

Run: `git diff --check`

Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/infra/supabase/playerIdentityAliasCloudService.ts src/infra/supabase/playerIdentityAliasCloudService.test.ts src/infra/supabase/syncService.ts src/infra/supabase/syncService.test.ts
git commit -m "feat(sync): repair legacy player aliases"
```
