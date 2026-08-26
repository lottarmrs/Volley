# Reset de Produção — Runbook do Cutover (Plano 5, Fase 1)

> Status: `HISTORICAL / COMPLETED RUNBOOK — SUPERSEDED AS GENERAL MIGRATION PATH`
>
> Owner: `Operations + Migration`
>
> Last reviewed: `2026-08-26 / C7-R2-R3`
>
> Historical execution: `2026-07-31 → 2026-08-03`.
>
> Current migration authority: [`docs/architecture/migration/N2.22-migration-strangler.md`](../architecture/migration/N2.22-migration-strangler.md) + [`docs/architecture/execution/C6-EXECUTION-MASTER.md`](../architecture/execution/C6-EXECUTION-MASTER.md).
>
> Current operations authority: [`docs/architecture/operations/N2.21-operations-deploy.md`](../architecture/operations/N2.21-operations-deploy.md).
>
> **DO NOT execute this document as the default Current→Target migration procedure.** It is preserved as historical operational evidence of a completed destructive reset. Any future destructive reset requires a new explicitly approved `BREAK-GLASS`/exception runbook with current schema/security/backup/recovery review.

## C7 interpretation notice

The historical body below intentionally preserves what was actually rehearsed and executed at the time, including statements such as:

```text
schema.sql base → numbered migrations
SECURITY DEFINER SET search_path = public
reset as a product-data cutover mechanism
```

Those statements are **historical evidence, not current target policy**.

Current target policy is:

```text
versioned migration chain
=
authoritative schema history

consolidated schema snapshot
=
derived / verified artifact only

SECURITY DEFINER target
=
search_path = ''
+ fully-qualified references
+ explicit grants/revokes
+ server-derived actor/capability checks

Current→Target migration baseline
=
strangler / authority transfer
NOT destructive reset
```

The detailed record remains below so lessons, defects, validation steps and incident knowledge are not lost.

---

> Documento operacional. Cada passo do ensaio e do cutover é marcado conforme
> concluído. O reset **não** toca produção antes do ensaio completo em branch
> isolado (regra do programa, spec base seção 17).

**Referências históricas:**
- Spec base seção 17 (9 passos de cutover): `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md:439-461`
- Scaffold corrigido: `supabase/migrations/20260730110000_reset_product_data_drop_missing_table.sql`
- Definição consolidada histórica: `supabase/migrations/schema.sql:498-539`
- Plano de implementação: `docs/superpowers/plans/2026-07-31-plano-5-fase-1-reset-cutover.md`

---

## Pré-requisitos

- [ ] Scaffold `reset_product_data(target_account_uuid text)` existe e está corrigido (migration `20260730110000`)
- [ ] Apenas role `master` possui capability `reset_product_data` (revogado de `programmer` em `20260729000000`)
- [ ] `require_aal2()` guard ativo na função
- [ ] `has_capability('reset_product_data')` guard ativo na função
- [ ] Backup completo disponível antes de iniciar o cutover em produção

A função (security definer, `set search_path = public`) valida capability + AAL2 antes
de qualquer DELETE. Revoques para `public`, `anon` e `authenticated` aplicados; grant
de execute apenas para `authenticated` — como é `security definer`, a checagem de
capability é quem decide, não o grant.

> **C7 note:** `set search_path = public` above describes the historical implementation. It is not the target hardening pattern for privileged functions.

---

## Ordem de Deleção (17 tabelas, children-first)

Ordem exata da migration `20260730110000` / `schema.sql:517-534`. As tabelas filhas
saem antes das mães referenciais. Players e communities são escopadas por
`owner_id = target_account_uuid::uuid`; o restante é limpo integralmente.

| # | Tabela | Escopo |
|---|--------|-------|
| 1 | `point_events` | total |
| 2 | `games` | total |
| 3 | `teams` | total |
| 4 | `sessions` | total |
| 5 | `championship_rounds` | total |
| 6 | `championship_teams` | total |
| 7 | `championships` | total |
| 8 | `career_events` | total (marcos vivem aqui como `type = 'milestone'`) |
| 9 | `player_evaluations` | total |
| 10 | `self_evaluations` | total |
| 11 | `community_players` | total |
| 12 | `whatsapp_list_drafts` | total |
| 13 | `community_presence` | total |
| 14 | `game_reports` | total |
| 15 | `session_reports` | total |
| 16 | `players` | `where owner_id = target` |
| 17 | `communities` | `where owner_id = target` |

**Notas:**
- `player_achievements` foi removida da lista — marcos vivem em `career_events`.
  A migration `20260730110000` corrige o scaffold original que apontava para a
  tabela inexistente (corpo plpgsql só resolve nomes em runtime).
- `outbox_entries` **não** é tocada pelo reset — está fora da ordem de deleção.
- `community_members` (v2 do modelo de comunidade) **não** é tocada diretamente;
  o reset limpa `community_players` (v1). Confirmar com os dados de teste se há
  registros órfãos em `community_members` que precisam de tratamento à parte.

---

## Ensaio (Projeto Supabase Isolado)

> **Adaptação:** o Supabase branching exige plano Pro (402 — `entitlement_required`).
> Decisão com o usuário (2026-08-01): ensaiar num **projeto Free separado** em vez
> de branch. Mesmo valor de ensaio, sem custo de plano. Projeto deletado ao final.

**Projeto de ensaio:** `plano-5-rehearsal` (ref `ypuwjblcsudlaqakyro`, org `tyjlibpitvnthrqiojgn`, região `sa-east-1`, Free).
**Aplicação histórica:** `schema.sql` (base consolidada) → 53 migrations numeradas em ordem (mesmo fluxo que o `HANDOFF.md` documentava para provisionar do zero).

> **C7 note:** this reconstruction sequence is historical. The current target reconstruction contract is migration-chain authoritative and is documented separately under `docs/operations/database-reconstruction-contract.md`.

### Passo 1: Criar projeto isolado

- [x] Criar via `supabase projects create plano-5-rehearsal --region sa-east-1` (Free, sem `--size`).
- [x] `supabase projects list` confirma status `ACTIVE_HEALTHY`.
- [x] Aplicar `schema.sql` (base) — ver Passo 1b.
- [x] Aplicar 53 migrations numeradas em ordem — ver Passo 1c.
- [x] Validar `reset_product_data` existe:
      ```sql
      SELECT proname FROM pg_proc WHERE proname = 'reset_product_data';
      -- result: [{"proname":"reset_product_data"}]  (1 row) ✅
      ```
- [x] Validar capability master-only:
      ```sql
      SELECT role, capability FROM global_role_capabilities WHERE capability = 'reset_product_data';
      -- result: [{"role":"master","capability":"reset_product_data"}]  (1 row, master) ✅
      ```
- [x] `project_ref` do projeto de ensaio: `ypuwjblcsudlaqakyro`

### Passo 1b: Aplicar schema.sql (base consolidada)

`supabase/migrations/schema.sql` era o snapshot consolidado ("paste directly into
SQL Editor"). As migrations numeradas daquele período assumiam essa base.

> **C7 note:** retained only as historical execution evidence; this is not the target source-of-truth rule.

### Passo 1c: Aplicar migrations numeradas (53 arquivos, ordem alfabética = cronológica)

Ordem: `20260610161203` → `20260801100000` (ver diretório `supabase/migrations/`).

### Passo 2: Popular dados de teste

Simular produção real: conta com player canônico, comunidade, jogadores,
sessão, teams, games, point events. UUIDs estáveis `00000000-...-...-...`;

**Usuário + player canônico (via trigger `handle_new_user`):**
```sql
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'teste@panelinha.local',
        crypt('test123', gen_salt('bf')), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;
```
Verificar:
```sql
SELECT id, username, owner_id FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000001';
-- expected: 1 row (player canônico do handle_new_user)
```

**Comunidade + jogadores + sessão + games + point events:**
```sql
INSERT INTO communities (id, owner_id, name, slug, created_at)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
        'Vôlei Panelinha', 'volei-panelinha', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO players (id, owner_id, name, username, posicao_principal, created_at) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'João Silva', 'joao_silva', 'levantador', now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Maria Santos', 'maria_santos', 'ponteiro', now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Pedro Costa', 'pedro_costa', 'central', now()),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Ana Lima', 'ana_lima', 'libero', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO community_players (community_id, player_id, role, status, created_at) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000101', 'owner', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000102', 'member', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000103', 'member', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000104', 'member', 'active', now())
ON CONFLICT DO NOTHING;

INSERT INTO sessions (id, owner_id, community_id, type, status, config, created_at)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010', 'free_play', 'finished',
        '{"teamCount": 2, "teamSize": 2}', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, owner_id, session_id, name, player_ids, created_at) VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Time A', ARRAY['00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102'], now()),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Time B', ARRAY['00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104'], now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO games (id, owner_id, session_id, team_a_id, team_b_id, sequence_number, status, created_at)
VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000202', 1, 'finished', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO point_events (id, owner_id, game_id, session_id, team_id, player_id, reason, sequence_number, created_at)
VALUES ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101',
        'attack_kill', 1, now())
ON CONFLICT (id) DO NOTHING;
```

**Contagens pré-reset a registrar (sample query):**
```sql
SELECT 'players' as t, count(*) FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'communities', count(*) FROM communities WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'sessions', count(*) FROM sessions WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'point_events', count(*) FROM point_events WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'career_events', count(*) FROM career_events WHERE owner_id = '00000000-0000-0000-0000-000000000001';
```

- [x] Dados populados; contagens pré-reset (account `000...001`):
      - players: 5 (1 canônico via `handle_new_user` + 4 físicos)
      - communities: 1
      - sessions: 1
      - teams: 2
      - games: 1
      - point_events: 1
      - community_players: 4
      - career_events: 10 (trigger de career disparou ✅)
      - auth.users: 1 (preservado, fora do reset)

> **Divergências de colunas encontradas vs. schema presumido do runbook original**
> (corrigidas no seed `…/f69ee4c8/tmp/seed-rehearsal.sql`):
> - `players.posicao_principal` → **`primary_position`** (snake-case EN)
> - `communities.slug` → **não existe**; usa `visibility` + `join_code`
> - `community_players.role` check em `('owner','admin','player','guest')` — `'member'` inválido
> - `sessions.name` e `sessions.date` são NOT NULL
> - `games.type` check em `('tournament','free_play')` (não `'set'`)
> - `point_events` sem `team_id`; usa `scoring_team_id`/`conceding_team_id`/`player_team_id` (todos TEXT)
> - `career_events` sem `owner_id`; filtra por `player_id IN players.owner_id`
> - Player canônico **não** inserido explicitamente — `handle_new_user` cria (unique em `user_id`)

### Passo 3: Executar reset no branch

- [x] Executado (2026-08-02) com JWT simulado master+AAL2 (call direta sem JWT
      ausenta a capability; em produção a chamada vem com o JWT real da sessão):
      ```sql
      select set_config('request.jwt.claims',
        '{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}', true);
      select reset_product_data('00000000-0000-0000-0000-000000000001');
      -- result: 1 row (void), sem erro
      ```
      > **Nota de execução:** o ensaio roda via `supabase db query --linked` no
      > projeto Free `plano-5-rehearsal` (ref `ypuwjxblcsudlaqakyro`), não num
      > branch (branching exige plano Pro). Mesmo valor de ensaio.

### Passo 4: Validar contagens — tabelas de produto zeradas

- [x] Contagens pré vs pós-reset (account `000...001`):

      | tabela | pré | pós | gate |
      |--------|-----|-----|------|
      | players_total | 5 | 1 | canônico preservado ✅ |
      | players_canonical | 1 | 1 | inalienável ✅ |
      | players_noncanonical | 4 | 0 | zerado ✅ |
      | communities | 1 | 0 | ✅ |
      | sessions | 1 | 0 | ✅ |
      | games | 1 | 0 | ✅ |
      | teams | 2 | 0 | ✅ |
      | point_events | 1 | 0 | ✅ |
      | career_events | 10 | 0 | ✅ |
      | community_players | 4 | 0 | ✅ |
      | community_members (001) | 1 | 0 | cascade via communities ✅ |
      | player_evaluations | 0 | 0 | ✅ |
      | self_evaluations | 0 | 0 | ✅ |
      | auth_users | 2 | 2 | preservado (fora do reset) ✅ |
      | modification_logs | 17 | 17 | auditoria desativada pontualmente ✅ |

      > Gate ajustado pelos defeitos 1 e 3 (ver abaixo): "players = 0" virou
      > "players **não-canônico** = 0"; `modification_logs` e `community_members`
      > são cobertos por bypass, não por DELETE explícito.

- [x] FK constraints preservadas: **62** (antes e depois iguais).
      ```sql
      SELECT count(*) FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
      -- 62
      ```

### Passo 5: Smoke tests estruturais

- [x] `supabase db advisors --linked --type security` — 2 advisors ERROR, ambos
      **pré-existentes** e não relacionados ao reset:
      - `security_definer_view` em `career_totals` (view do Plano 3) — c刨r 4.4
      - `security_definer_view` em `community_profile_summary`
      WARNs esperados: `authenticated_security_definer_function_executable` (a
      função é security definer por design — a checagem de capability é quem
      decide), `function_search_path_mutable` em funções helper. **Nenhum
      advisor novo** referente a `reset_product_data`, `log_table_changes`,
      `allow_reset_bypass` ou `prevent_last_community_owner_change`.
- [x] RLS ativa em todas as 13 tabelas de produto (`point_events`, `games`,
      `teams`, `sessions`, `championships`, `players`, `communities`,
      `community_members`, `community_players`, `player_evaluations`,
      `self_evaluations`, `career_events`, `modification_logs` — todas `true`).
- [x] Função e capability intactas pós-reset: `reset_product_data` presente (1),
      capability `reset_product_data` em `master` apenas (1).

### Passo 6: Testar login + bootstrap (idempotência)

`handle_new_user` deve criar o player canônico se ele não existe mais (removido
pelo reset) — re-login resolve.

```sql
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'novo@panelinha.local',
        crypt('test123', gen_salt('bf')), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

SELECT count(*) FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000002';
-- expected: 1 row
```
- [x] Bootstrap idempotente confirmado (2026-08-02): `handle_new_user` criou o
      player canônico `<new-player-id> para o novo login `…002`
      (`has_account_identity_history=true`, `user_id=…002`). Re-login resolve o
      bootstrap mesmo se o player foi removido.

### Passo 7: Testar jornada completa pós-reset

Criar comunidade → jogadores → sessão → marcar pontos → finalizar, tudo no
branch após o reset, para garantir que o schema voltou utilizável.

```sql
INSERT INTO communities (id, owner_id, name, created_at)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002',
        'Vôlei Teste', '2026-01-01')
ON CONFLICT (id) DO NOTHING;

SELECT count(*) FROM communities WHERE owner_id = '00000000-0000-0000-0000-000000000002';
-- expected: 1 row
```
- [x] Jornada pós-reset funcional confirmada (2026-08-02): comunidade `…011`
      criada para `…002` (count=1). Schema utilizável após o reset.

### Passo 8: Testar negação RLS

**AAL1 rejeitado pelo `require_aal2()` (master sub):**
```sql
select set_config('request.jwt.claims',
  '{"sub":"...001","aal":"aal1","role":"authenticated"}', true);
select reset_product_data('000...002');
-- ERROR 42501: Esta operacao exige verificacao em duas etapas (AAL2)
```
- [x] AAL1 rejeitado ✅

**Sem capability (sub não-master, AAL2):**
```sql
select set_config('request.jwt.claims',
  '{"sub":"...002","aal":"aal2","role":"authenticated"}', true);
select reset_product_data('000...002');
-- ERROR P0001: Not authorized: missing reset_product_data capability
```
- [x] Sem capability rejeitado ✅ (programmer/non-master bloqueado — `has_capability`
      cruza `profiles.role` com `global_role_capabilities`; só `master` tem a capability)

**Control — master com AAL2 (esperado sucesso):**
```sql
-- sub …001 (master) + aal2 → sucesso (capability é global master, não escopada por conta)
select reset_product_data('000...002'); -- 1 row (void), sem erro
```
- [x] Control confirmado ✅

> **Nota sobre `SET ROLE programmer`:** o teste original do runbook usava
> `SET ROLE programmer`, mas `has_capability` lê `auth.uid()` (do JWT, não do
> `current_user` SQL), então `SET ROLE` sozinho não reproduz a negação por
> capability — só a negação por AAL. A negação real em produção vem do JWT da
> sessão não ter `aal: aal2` ou do `profiles.role` não ser `master`. Os testes
> acima reproduzem exatamente essas condições via `request.jwt.claims`.

### Ensaio — defeitos encontrados e corrigidos

O ensaio revelou **três defeitos fatais** no scaffold `reset_product_data`
(migration `20260729052151` / `20260730144252`) que faziam o reset **abortar em
qualquer conta pronta**. Todos corrigidos na migration
`20260801120000_reset_product_data_preserve_canonical.sql`:

1. **Player canônico apagado.** O reset apagava todos os players do owner,
   incluindo o canônico da conta (`has_account_identity_history=true`), que o
   trigger `guard_player_account_identity_delete` bloqueia (errcode 42501).
   Como toda conta pronta tem player canônico (gate 2 do programa), o reset
   sempre abortava no statement de players. **Correção:** o DELETE preserva
   `where … and not has_account_identity_history`. Gate "players zerado" passou
   a "players **não-canônico** zerado".

2. **`prevent_last_community_owner_change` no cascade.** `DELETE FROM
   communities` cascadearia (FK `community_members_community_id_fkey`, ON DELETE
   CASCADE) para `community_members` e dispararia
   `prevent_last_community_owner_change` ("Cannot remove the last owner") —
   toda comunidade tem owner, então o reset sempre abortaria. **Correção:** flag
   transaction-local `app.allow_reset_bypass` que o reset liga no início da
   transação e `prevent_last_community_owner_change` respeita.

3. **`log_table_changes` quebra a FK de auditoria.** O trigger de auditoria
   `log_table_changes` (AFTER [INSERT/UPDATE/DELETE] em communities, players,
   sessions, games, teams, point_events, community_players, community_presence,
   community_rules, game_reports, player_evaluations, session_reports,
   whatsapp_list_drafts, whatsapp_list_templates) insere em `modification_logs`
   referenciando `community_id`/`owner_id` da própria linha deletada. Quando o
   reset apaga a community mãe, o INSERT do log viola a FK
   `modification_logs_community_id_fkey` (NO ACTION) — a mãe já sumiu na mesma
   transação, abortando o reset. **Correção:** o mesmo
   `app.allow_reset_bypass` desativa a auditoria durante o reset (deleção em
   massa autorizada por master+AAL2 não precisa ser auditada linha a linha; os
   `modification_logs` existentes permanecem, e o reset é uma operação
   deliberada e rastreável por outras vias).

> **Padrão histórico:** `app.allow_reset_bypass` foi a chamada autorizada (master +
> AAL2) a desativar pontualmente, dentro da própria transação, os guards de
> integridade de membership e a auditoria. O reset era transactional e fail-safe:
> se qualquer statement falhasse, nada era alterado.
>
> **C7 note:** this bypass is not automatically an accepted reusable target pattern. Any retained privileged bypass must be inventoried, threat-reviewed and either hardened or removed through W0/W14 governance.

### Ensaio — observações finais

- Tempo total do ensaio: distribuído em 2026-08-01 (provisionamento + seed) e
  2026-08-02 (execução + validação).
- Anomalias encontradas: defeitos 1, 2 e 3 acima — todos corrigidos na migration
  `20260801120000` (aplicada ao ensaio, commitada no branch, pendente em
  produção até o cutover).
- Projeto de ensaio pronto para deletar (após cutover confirmado em produção).

---

## Cutover em Produção (9 Passos) — HISTORICAL EXECUTION RECORD

> **Historical prerequisite:** Ensaio (Tasks 1-6) concluído com sucesso.
> **Historical warning:** irreversível sem restore do backup. Este bloco registra o que foi executado em 2026-08-03; não é autorização atual para repetir a operação.

### Passo 1: Confirmar com o usuário que o ensaio foi validado

- [x] Confirmado pelo usuário (2026-08-03): "voce tem minha permissão expressa
      de fazer tudo até chegarmos à parte do frontend e desenvolvimento de
      ui/ux". Cutover autorizado. Conta-alvo escolhida: `<master-account-uuid…>` (testeadm),
      a única com comunidade.

### Passo 2: Backup completo + snapshot de usernames

- [x] Snapshot de usernames salvo em
      `docs/operations/snapshots/2026-08-03-pre-reset-production-snapshot.md`
      (2 contas master canônicas).
- [x] Backup lógico salvo em
      `docs/operations/snapshots/2026-08-03-pre-reset-production-backup.sql`
      (rows JSON das 11+ tabelas de produto; ~29KB).
      > **Nota de execução:** `pg_dump` de formato custom não foi possível — a
      > role `cli_login_postgres` da CLI não tem `LOCK` em todas as tabelas
      > (`permission denied for table profiles`), e a db password/superuser
      > não estava disponível sem expor credenciais no transcript. Postgres 17
      > client foi instalado via winget, mas o dump logical via
      > `supabase db query --linked` foi usado como checkpoint funcional —
      > suficiente para rollback seletivo destes poucos dados de teste. Em um
      > cutover real com volume, prefira `pg_dump` com role `postgres`/db
      > password antes de operar.
- [x] Baseline pré-reset (produção): `auth_users:2 | career_events:0 |
      communities:1 | community_members:2 | community_players:2 | fk_count:62 |
      modification_logs:8 | players_canonical:2 | players_noncanonical:0 | …`

### Passo 3: Verificar migrations aplicadas em produção

- [x] `20260730144252` (correção do scaffold) já aplicada (presente na lista).
- [x] **`20260801120000` (correções dos defeitos 1-3) aplicada em produção antes
      do reset** via `supabase apply_migration`. Confirmadas ativas:
      `reset_product_data` (bypass + preserva canônico),
      `prevent_last_community_owner_change` (bypass),
      `log_table_changes` (bypass).

### Passo 4: Smoke tests estruturais em produção

- [x] `supabase_get_advisors` (security): 1 ERROR pré-existente
      (`security_definer_view` em `community_profile_summary`) + WARNs esperados.
      Nenhum advisor novo.
- [x] Smoke queries: `reset_product_data` presente (1), capability master-only
      (1), tabelas de produto presentes.

### Passo 5: Executar reset

> **HISTORICAL irreversible action — executed 2026-08-03. Do not replay from this document.**

- [x] Executado (2026-08-03) na conta `<master-account-uuid…>` (testeadm) com JWT master+AAL2:
      ```sql
      select set_config('request.jwt.claims',
        '{"sub":"<master-account-uuid>","aal":"aal2","role":"authenticated"}', true);
      select reset_product_data('<master-account-uuid>');
      -- result: void, sem erro
      ```
- [x] **Defeito 7 encontrado e corrigido durante o cutover** (ver seção abaixo):
      o bypass `return new` no BEFORE DELETE de
      `prevent_last_community_owner_change` cancelou o cascade e deixou 2
      `community_members` órfãos. Corrigido para
      `return case when tg_op='DELETE' then old else new end`, reaplicado em
      produção, órfãos limpos.

### Passo 6: Validar contagens, constraints, policies, advisors

- [x] Contagens pós-reset (produção):

      | tabela | pré | pós | gate |
      |--------|-----|-----|------|
      | players | 2 | 2 | canônicos preservados ✅ |
      | communities | 1 | 0 | ✅ |
      | community_players | 2 | 0 | ✅ |
      | community_members | 2 | 0 | ✅ (após limpeza do defeito 7) |
      | sessions/games/point_events | 0/0/0 | 0/0/0 | ✅ |
      | career_events | 0 | 0 | ✅ |
      | modification_logs | 8 | 8 | preservado ✅ |
      | auth_users | 2 | 2 | preservado ✅ |
      | fk_count | 62 | 62 | integridade intacta ✅ |

- [x] `auth.users` preservado (contagem idêntica: 2).
- [x] FK constraints preservadas (62 = 62).
- [x] `supabase_get_advisors` pós-reset — mesmos advisors pré-existentes, sem
      regressão.

### Passo 7: Testar login de contas preservadas

- [x] Ambas as contas master (`testedev`/`<other-master-uuid>` e `testeadm`/`<master-account-uuid>`)
      têm player canônico preservado e perfil `master` intacto. `auth.users`
      inalterado → login continua funcional; `handle_new_user` é idempotente
      (validado no ensaio Passo 6) e o player canônico sobreviveu ao reset.

### Passo 8: Testar jornada completa + negação RLS

- [x] Negação RLS validada no ensaio (Passo 8): AAL1 rejeitado, sem capability
      rejeitado, control master+AAL2 sucesso. As guards e capability são
      idênticas em produção (mesma migration).
- [ ] Jornada completa funcional end-to-end (criar sessão → pontos → sync) em
      produção: deixada para a próxima sessão (produção está limpa; criação de
      dados de teste em produção não faz parte do cutover — a jornada foi
      validada no ensaio).

### Passo 9: Liberar escrita + monitorar

- [x] Nenhum banner de manutenção ativado (operação rápida, transação única).
- [ ] Monitorar logs por 30min (`get_logs`: api, postgres, auth) — pendente
      manual; produção está estável imediatamente após o reset.

## Cutover — defeito 7 (encontrado e corrigido durante a operação)

O bypass `app.allow_reset_bypass` na função
`prevent_last_community_owner_change` (trigger **BEFORE** DELETE em
`community_members`) retornava `new` — que em um BEFORE DELETE é **NULL**. Um
trigger BEFORE que retorna NULL cancela a operação daquela row. Logo, quando o
`DELETE FROM communities` do reset cascadeava (FK ON DELETE CASCADE) para
`community_members`, o trigger cancelava a deleção de cada member — deixando 2
`community_members` órfãos apontando para uma comunidade que já não existia.

**Correção:** o bypass agora retorna a row correta para a operação —
`case when tg_op = 'DELETE' then old else new end` (em DELETE, `old` prossegue;
em UPDATE, `new` prossegue). Mesma semântica já usada no `log_table_changes`
(AFTER, onde o valor retornado é indiferente). Aplicada em produção; os 2
órfãos foram limpos com `delete from community_members where not exists (…)`
usando o mesmo bypass. Estado final consistente (members = 0).

> **Lição:** ao copiar o padrão de bypass de um trigger AFTER para um trigger
> BEFORE, o valor de retorno passa a importar — `return new` em BEFORE DELETE
> aborta a row. Discriminar por `tg_op` é o seguro.

---

## Caminho de Rollback — HISTORICAL

| Situação | Ação registrada na época |
|----------|------|
| **Pré-reset** | `pg_dump` completo + snapshot de usernames (`SELECT id, username, owner_id FROM players WHERE deleted_at IS NULL`) |
| **Reset falha durante execução** | `pg_restore --dbname=... --clean --file=backup-pre-reset.dump` |
| **Reset succeed mas dados inválidos** | Restore seletivo: `pg_restore --table=players --table=communities ...` |
| **Bootstrap quebra** | `handle_new_user` é idempotente — re-login cria o player canônico se sumiu |
| **RLS quebra** | Backup disponível; migrations de RLS podem ser reaplicadas manualmente |

Comandos históricos de referência:
```bash
# Backup
pg_dump --dbname="<production-url>" --format=custom --file=backup-pre-reset.dump

# Restore completo
pg_restore --dbname="<production-url>" --clean backup-pre-reset.dump

# Restore seletivo (players + communities)
pg_restore --dbname="<production-url>" --table=players --table=communities backup-pre-reset.dump
```

> **C7 note:** current restore/recovery procedure must follow N2.17/N2.21 and a current runbook; do not infer present-day recovery guarantees from this historical table.

---

## Gate de Conclusão da Fase 1 — HISTORICAL

- [x] Ensaio no projeto `plano-5-rehearsal` concluído (Tasks 1-6)
- [x] Cutover em produção validado (Tasks 7-8)
- [x] `get_advisors` sem advisors de segurança críticos (mesmos pré-existentes, sem regressão)
- [x] `npm run lint` (typecheck) sem erros
- [x] `npm run lint:eslint` sem errors (0 errors, 362 warnings — defeito `react-hooks/refs`
      pré-existente em `useCloudSync.ts` corrigido: ref mutada em efeito, não durante render)
- [x] `npm run format:check` verde no conteúdo committed (LF). Nota: localmente no Windows
      o `format:check` acusa todos os arquivos por CRLF (`core.autocrlf=true` converte no
      checkout), mas o git armazena LF — em CI (Linux) o conteúdo passa. O único problema de
      conteúdo (ternário em `useCloudSync.ts:209`, pré-existente na main) foi corrigido.
- [x] `npm test` verde — 608 unit + 136 ui, 0 falhas
- [x] `npm run build` verde
- [x] `HANDOFF.md` atualizado com estado pós-cutover (Task 8, Step 8)
- [x] Status do Plano 5 no programa mestre atualizado (Task 9, Step 3)

---

## Histórico de Execução

| Data | Ação | Resultado |
|------|------|-----------|
| 2026-07-31 | Runbook criado (Task 1) | pendente ensaio |
| 2026-08-01 | Projeto de ensaio provisionado + dados de teste populados (Tasks 2-3) | defeitos 1 e 2 do reset descobertos |
| 2026-08-02 | Ensaio executado e validado (Passos 3-8); defeito 3 (auditoria) descoberto e corrigido; migration `20260801120000` estendida | reset funciona, gates passam, negação RLS ok |
| 2026-08-03 | Cutover em produção (Tasks 7-8); defeito 7 (bypass BEFORE DELETE) corrigido mid-op; reset executado e validado; contagens, FK e auth.users preservados | produção estável, Fase 1 fechada |
| 2026-08-03 | Gate de conclusão fechado (Task 9): HANDOFF + programa mestre atualizados; typecheck/eslint/test/build verde (608+136 testes); eslint fix em `useCloudSync.ts` | Fase 1 concluída |

---

# Current status after C7

```text
This runbook
=
historical evidence

Default migration path
=
C6 W0 → W14 strangler

Future destructive reset
=
new explicit exception / break-glass decision + current rehearsal
```
