# Plano 5 — Fase 1: Reset de Produção, Ensaio e Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensaiar o reset de produção em um branch Supabase isolado, executar o cutover em produção, e validar que o backend está estável antes de iniciar a Fase 2 (Screen Contracts).

**Architecture:** O scaffold `reset_product_data(target_account_uuid text)` já existe (migration `20260730110000`), corrigido e restrito ao role `master` com `require_aal2()`. A fase 1 cria um branch Supabase isolado para ensaio, executa os 9 passos de cutover na produção, documenta o caminho de rollback, e atualiza o `HANDOFF.md`.

**Tech Stack:** Supabase (Postgres, RLS, RPCs, branches), Node 22, npm, Vite 6, Vitest.

## Global Constraints

- Node >= 20 (22 Recommended — see `.nvmrc`)
- `npm run lint` = `tsc --noEmit` (typecheck)
- `npm run lint:eslint` (ESLint, ~347 warnings aceitáveis, corrigir só errors)
- `npm run format:check` (Prettier)
- `npm test` = `test:unit` + `test:ui` em sequência
- `npm run build` (Vite → `dist/`)
- CI verification order: `typecheck → lint:eslint → format:check → test → build`
- UI em pt-BR (labels, toast, erros)
- Sem comments no source unless asked
- Imports com aliases (`@app`, `@domain`, etc.)
- Migrations land em local Supabase primeiro, depois projeto remoto
- RLS e RPCs requerem testes positivos e negativos antes de aplicar remote
- Remote changes exigem backup, verificação pós-aplicação, e caminho de rollback documentado
- Nenhum reset de produção ocorre antes do ensaio completo (regra do programa, linha 98)

**Skills a usar:**
- `systematic-debugging` — se o reset falhar no branch isolado (diagnóstico antes de correção)
- `verification-before-completion` — antes de declarar cada gate concluído
- `subagent-driven-development` — para executar o plano tarefa por tarefa

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260728110000_reset_scaffold.sql` | Read-only | Scaffold original (referência) |
| `supabase/migrations/20260730110000_reset_product_data_drop_missing_table.sql` | Read-only | Scaffold corrigido (referência) |
| `supabase/migrations/schema.sql:498-539` | Read-only | Definição consolidada do `reset_product_data` |
| `HANDOFF.md` | Modify | Atualizar com estado pós-cutover |
| `docs/superpowers/plans/2026-07-22-scalable-product-program.md:14` | Modify | Atualizar status da Fase 1 |
| `docs/operations/reset-cutover-runbook.md` | Create | Documento de ensaio + cutover + rollback |

---

### Task 1: Documento de Runbook do Cutover

**Files:**
- Create: `docs/operations/reset-cutover-runbook.md`
- Read: `supabase/migrations/20260730110000_reset_product_data_drop_missing_table.sql` (referência)
- Read: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md:439-461` (spec base seção 17)

**Interfaces:**
- Consumes: spec base seção 17 (9 passos de cutover), migration `20260730110000` (estrutura do reset)
- Produces: `docs/operations/reset-cutover-runbook.md` — documento de referência para ensaio e cutover

- [ ] **Step 1: Ler a migration corrigida e a spec base**

Read `supabase/migrations/20260730110000_reset_product_data_drop_missing_table.sql` — anotar as 16 tabelas de delete em ordem children-first (point_events → games → teams → sessions → championship_rounds → championship_teams → championships → career_events → player_evaluations → self_evaluations → community_players → whatsapp_list_drafts → community_presence → game_reports → session_reports → players → communities, scoped por `owner_id = target_account_uuid`).

Read `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` lines 439-461 — anotar os 9 passos de cutover.

- [ ] **Step 2: Escrever o runbook**

Write `docs/operations/reset-cutover-runbook.md` with the following structure:

```markdown
# Reset de Produção — Runbook do Cutover (Plano 5, Fase 1)

## Pré-requisitos
- Scaffold `reset_product_data(target_account_uuid text)` existe e está corrigido
- Apenas role `master` possui capability `reset_product_data`
- `require_aal2()` guard ativo
- Backup completo disponível antes de iniciar

## Ensaio (Branch Supabase Isolado)

### Passo 1: Criar branch isolado
[comando e validação]

### Passo 2: Popular dados de teste
[descrição das entidades a criar]

### Passo 3: Executar reset no branch
[comando SQL]

### Passo 4: Validar contagens
[queries de verificação para cada uma das 16 tabelas]

### Passo 5: Smoke tests estruturais
[verificar RLS, RPCs, grants, get_advisors]

### Passo 6: Testar login + bootstrap
[verificar handle_new_user idempotência]

### Passo 7: Testar jornada completa
[criar comunidade → jogadores → sessão → pontos → finalizar → sync]

### Passo 8: Testar negação RLS
[programmer bloqueado, AAL1 rejeitado, master sem AAL2 rejeitado]

## Cutover em Produção (9 Passos)

### Passo 1: Bloquear escrita + ativar manutenção
### Passo 2: Backup completo + snapshot usernames
### Passo 3: Verificar migrations aplicadas
### Passo 4: Smoke tests estruturais
### Passo 5: Executar reset
### Passo 6: Validar contagens, constraints, policies, advisors
### Passo 7: Testar login de contas preservadas
### Passo 8: Testar jornada completa + negação RLS
### Passo 9: Liberar escrita + monitorar

## Caminho de Rollback
- Pré-reset: pg_dump + snapshot usernames
- Se reset falhar: pg_restore
- Se dados inválidos: restore seletivo
- Se bootstrap quebrar: re-login (handle_new_user idempotente)

## Orem de Deleção (16 tabelas, children-first)
1. point_events
2. games
3. teams
4. sessions
5. championship_rounds
6. championship_teams
7. championships
8. career_events
9. player_evaluations
10. self_evaluations
11. community_players
12. whatsapp_list_drafts
13. community_presence
14. game_reports
15. session_reports
16. players (where owner_id = target)
17. communities (where owner_id = target)

## Gate de Conclusão da Fase 1
- [ ] Ensaio no branch concluído
- [ ] Cutover em produção validado
- [ ] get_advisors sem advisors críticos
- [ ] npm run build + npm test verde
- [ ] HANDOFF.md atualizado
```

- [ ] **Step 3: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): create reset cutover runbook for fase 1"
```

---

### Task 2: Criar Branch Supabase Isolado para Ensaio

**Files:**
- Read: `supabase/migrations/schema.sql` (para confirmar que o branch aplicará todas as migrations)
- Read: `docs/operations/reset-cutover-runbook.md` (runbook criado na Task 1)

**Interfaces:**
- Consumes: Supabase project (via Supabase MCP tools ou CLI)
- Produces: Branch `plano-5-rehearsal` ativo com todas as migrations aplicadas

- [ ] **Step 1: Listar migrations existentes**

Confirmar todas as migrations no diretório `supabase/migrations/` estão prontas para o branch.

- [ ] **Step 2: Criar branch Supabase isolado**

Usar `supabase_create_branch` (MCP tool) com `name: "plano-5-rehearsal"`. O branch aplica todas as migrations automaticamente.

- [ ] **Step 3: Verificar que o branch está ativo**

Usar `supabase_list_branches` para confirmar `plano-5-rehearsal` está com status `active`.

- [ ] **Step 4: Verificar que o reset_product_data existe no branch**

Usar `supabase_execute_sql` no branch com:
```sql
SELECT proname FROM pg_proc WHERE proname = 'reset_product_data';
```
Expected: 1 row returned.

- [ ] **Step 5: Verificar que a capability existe apenas para master**

```sql
SELECT role, capability FROM global_role_capabilities WHERE capability = 'reset_product_data';
```
Expected: 1 row, `role = 'master'`.

- [ ] **Step 6: Registrar no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passo 1 do ensaio como concluído, anotar o `project_ref` do branch.

- [ ] **Step 7: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): rehearse branch created, step 1 confirmed"
```

---

### Task 3: Popular Dados de Teste no Branch Isolado

**Files:**
- Read: `docs/operations/reset-cutover-runbook.md` (Passo 2 do ensaio)

**Interfaces:**
- Consumes: Branch `plano-5-rehearsal` (via `supabase_execute_sql` no branch context)
- Produces: Dados de teste simulando produção real no branch

- [ ] **Step 1: Criar usuário de teste**

Usar `supabase_execute_sql` no branch:
```sql
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'teste@panelinha.local', crypt('test123', gen_salt('bf')), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Verificar que handle_new_user criou o player canônico**

```sql
SELECT id, username, owner_id FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000001';
```
Expected: 1 row (player canônico criado pela trigger `handle_new_user`).

- [ ] **Step 3: Criar comunidade de teste**

```sql
INSERT INTO communities (id, owner_id, name, slug, created_at)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Vôlei Panelinha', 'volei-panelinha', now())
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 4: Criar jogadores, sessão, games e point events**

```sql
INSERT INTO players (id, owner_id, name, username, posicao_principal, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'João Silva', 'joao_silva', 'levantador', now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Maria Santos', 'maria_santos', 'ponteiro', now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Pedro Costa', 'pedro_costa', 'central', now()),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Ana Lima', 'ana_lima', 'libero', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO community_players (community_id, player_id, role, status, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000101', 'owner', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000102', 'member', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000103', 'member', 'active', now()),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000104', 'member', 'active', now())
ON CONFLICT DO NOTHING;

INSERT INTO sessions (id, owner_id, community_id, type, status, config, created_at)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'free_play', 'finished', '{"teamCount": 2, "teamSize": 2}', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, owner_id, session_id, name, player_ids, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Time A', ARRAY['00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102'], now()),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Time B', ARRAY['00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000104'], now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO games (id, owner_id, session_id, team_a_id, team_b_id, sequence_number, status, created_at)
VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 1, 'finished', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO point_events (id, owner_id, game_id, session_id, team_id, player_id, reason, sequence_number, created_at)
VALUES ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'attack_kill', 1, now())
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 5: Verificar que career_events foi populado pela trigger**

```sql
SELECT count(*) FROM career_events WHERE owner_id = '00000000-0000-0000-0000-000000000001';
```
Expected: >= 1 row (trigger de career recalcula após game/report).

- [ ] **Step 6: Registrar contagens pré-reset no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passo 2 do ensaio como concluído, anotar contagens de cada tabela.

- [ ] **Step 7: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): test data populated in rehearsal branch, step 2 confirmed"
```

---

### Task 4: Executar Reset no Branch Isolado e Validar

**Files:**
- Read: `docs/operations/reset-cutover-runbook.md` (Passos 3-5 do ensaio)

**Interfaces:**
- Consumes: Branch `plano-5-rehearsal` com dados de teste
- Produces: Tabelas de produto zeradas, auth.users preservado, constraints íntegras

- [ ] **Step 1: Executar o reset no branch**

Usar `supabase_execute_sql` no branch:
```sql
SELECT reset_product_data('00000000-0000-0000-0000-000000000001');
```
Expected: retorna 1 row sem erro.

- [ ] **Step 2: Validar contagens — tabelas de produto zeradas**

```sql
SELECT 'point_events' as t, count(*) FROM point_events WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'games', count(*) FROM games WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'teams', count(*) FROM teams WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'sessions', count(*) FROM sessions WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'career_events', count(*) FROM career_events WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'player_evaluations', count(*) FROM player_evaluations WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'self_evaluations', count(*) FROM self_evaluations
UNION ALL SELECT 'community_players', count(*) FROM community_players WHERE community_id IN (SELECT id FROM communities WHERE owner_id = '00000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'communities', count(*) FROM communities WHERE owner_id = '00000000-0000-0000-0000-000000000001'
UNION ALL SELECT 'players', count(*) FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000001';
```
Expected: every count = 0.

- [ ] **Step 3: Validar auth.users preservado**

```sql
SELECT count(*) FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
```
Expected: 1 row (auth.users não é tocado pelo reset).

- [ ] **Step 4: Validar constraints e policies**

```sql
SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
```
Expected: same count as before reset.

- [ ] **Step 5: Verificar advisors de segurança**

Usar `supabase_get_advisors` com `type: "security"`. Anotar se há advisors críticos.

- [ ] **Step 6: Registrar resultados no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passos 3-5 do ensaio como concluídos, anotar contagens e resultados dos advisors.

- [ ] **Step 7: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): reset executed and validated in rehearsal branch, steps 3-5 confirmed"
```

---

### Task 5: Testar Login, Bootstrap e Jornada Completa no Branch

**Files:**
- Read: `docs/operations/reset-cutover-runbook.md` (Passos 6-8 do ensaio)

**Interfaces:**
- Consumes: Branch `plano-5-rehearsal` após reset
- Produces: Validação de bootstrap idempotente, jornada completa funcional, e negação RLS

- [ ] **Step 1: Testar handle_new_user idempotência**

```sql
-- Simular um novo login do usuário de teste (trigger handle_new_user deve criar player se não existe)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'novo@panelinha.local', crypt('test123', gen_salt('bf')), now(), 'authenticated')
ON CONFLICT (id) DO NOTHING;

SELECT count(*) FROM players WHERE owner_id = '00000000-0000-0000-0000-000000000002';
```
Expected: 1 row (player canônico criado pela trigger).

- [ ] **Step 2: Testar jornada completa no branch**

Via `supabase_execute_sql`, verificar que é possível:
```sql
-- Criar nova comunidade
INSERT INTO communities (id, owner_id, name, slug, created_at)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'Vôlei Teste', 'volei-teste', now())
ON CONFLICT (id) DO NOTHING;

-- Verificar que a comunidade foi criada
SELECT count(*) FROM communities WHERE owner_id = '00000000-0000-0000-0000-000000000002';
```
Expected: 1 row.

- [ ] **Step 3: Testar negação RLS — programmer bloqueado para reset**

```sql
-- Tentar executar reset como programmer (should fail)
SET ROLE programmer;
SELECT reset_product_data('00000000-0000-0000-0000-000000000002');
RESET ROLE;
```
Expected: ERROR — `permission denied` ou `new exception` with `42501` (programmer não tem capability).

- [ ] **Step 4: Testar negação RLS — AAL1 rejeitado**

```sql
-- Simular sessão AAL1 (should fail require_aal2)
SELECT set_config('request.jwt.claims', '{"aal": "aal1"}'::jsonb, true);
SELECT reset_product_data('00000000-0000-0000-0000-000000000002');
```
Expected: ERROR — `require_aal2` raises `42501`.

- [ ] **Step 5: Registrar resultados no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passos 6-8 do ensaio como concluídos. Anotar tempos, observações, anomalias.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): login, journey and RLS denial tested in rehearsal branch, steps 6-8 confirmed"
```

---

### Task 6: Deletar Branch de Ensaio e Documentar Caminho de Rollback

**Files:**
- Modify: `docs/operations/reset-cutover-runbook.md` (seção de rollback)

**Interfaces:**
- Consumes: Branch `plano-5-rehearsal` (concluído)
- Produces: Branch deletado, caminho de rollback documentado e testado

- [ ] **Step 1: Documentar caminho de rollback no runbook**

Atualizar a seção "Caminho de Rollback" com:
- Comando de backup pré-reset: `pg_dump --dbname=... --format=custom --file=backup-pre-reset.dump`
- Comando de snapshot de usernames: `SELECT id, username FROM players WHERE deleted_at IS NULL`
- Comando de restore: `pg_restore --dbname=... --clean --file=backup-pre-reset.dump`
- Restore seletivo: `pg_restore --table=players --table=communities ...`
- Idempotência do `handle_new_user`: re-login resolve bootstrap

- [ ] **Step 2: Deletar o branch de ensaio**

Usar `supabase_delete_branch` com `branch_id` correspondente ao `plano-5-rehearsal`.

- [ ] **Step 3: Verificar que o branch foi deletado**

Usar `supabase_list_branches` para confirmar que `plano-5-rehearsal` não está mais na lista.

- [ ] **Step 4: Marcar ensaio como concluído no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar toda a seção "Ensaio" como concluída, com data e observações finais.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): rehearsal complete, rollback path documented, branch deleted"
```

---

### Task 7: Cutover em Produção — Backup e Preparação

**Files:**
- Modify: `docs/operations/reset-cutover-runbook.md` (registrar passos do cutover)

**Interfaces:**
- Consumes: Produção (Supabase project principal)
- Produces: Backup completo + snapshot de usernames + migrations verificadas

**PRÉ-REQUISITO:** Todas as tasks 1-6 concluídas e ensaio validado.

**WARNING:** Esta task toca produção. Confirmar com usuário master antes de executar.

- [ ] **Step 1: Confirmar com o usuário que o ensaio foi validado**

Perguntar ao usuário: "Ensaio concluído no branch isolado. Confirma que podemos prosseguir com o cutover em produção?"

- [ ] **Step 2: Verificar que todas as migrations estão aplicadas em produção**

Usar `supabase_list_migrations` para confirmar que todas as migrations locais (`supabase/migrations/`) estão aplicadas no projeto remoto.

- [ ] **Step 3: Snapshot de usernames (antes do backup)**

Usar `supabase_execute_sql`:
```sql
SELECT id, username, owner_id FROM players WHERE deleted_at IS NULL;
```
Salvar o resultado em arquivo de texto (snapshot mínimo).

- [ ] **Step 4: Smoke tests estruturais em produção**

Usar `supabase_get_advisors` com `type: "security"`. Anotar advisors críticos.

Usar `supabase_execute_sql`:
```sql
SELECT proname FROM pg_proc WHERE proname = 'reset_product_data';
SELECT role, capability FROM global_role_capabilities WHERE capability = 'reset_product_data';
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('point_events', 'games', 'teams', 'sessions', 'career_events', 'player_evaluations', 'self_evaluations', 'community_players', 'whatsapp_list_drafts', 'community_presence', 'game_reports', 'session_reports', 'players', 'communities', 'championships', 'championship_teams', 'championship_rounds');
```
Expected: 1 row para reset_product_data, 1 row para capability (master only), 17 para tables.

- [ ] **Step 5: Registrar estado pré-cutover no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passos 1-4 do cutover como concluídos, anotar advisors, migrations, e snapshot.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md
git commit -m "docs(plano-5): production pre-cutover backup and smoke tests completed"
```

---

### Task 8: Cutover em Produção — Executar Reset e Validar

**Files:**
- Modify: `docs/operations/reset-cutover-runbook.md` (registrar passos 5-9 do cutover)
- Modify: `HANDOFF.md` (atualizar com estado pós-cutover)

**Interfaces:**
- Consumes: Produção (Supabase project principal), pré-backup concluído (Task 7)
- Produces: Reset executado, tabelas zeradas, auth.users preservado, produção validada

**PRÉ-REQUISITO:** Task 7 concluída, backup confirmado.

**WARNING:** Esta task executa o reset em produção. Irreversível sem restore do backup.

- [ ] **Step 1: Confirmar com o usuário uma última vez**

Perguntar ao usuário: "Backup completo. Confirmar a execução do reset_product_data em produção? Esta operação é irreversível."

- [ ] **Step 2: Executar o reset em produção**

Usar `supabase_execute_sql`:
```sql
SELECT reset_product_data('TARGET_ACCOUNT_UUID');
```
Substituir `TARGET_ACCOUNT_UUID` pelo UUID confirmado pelo usuário. Expected: 1 row sem erro.

- [ ] **Step 3: Validar contagens — todas as 16 tabelas zeradas**

Usar `supabase_execute_sql`:
```sql
SELECT 'point_events' as t, count(*) FROM point_events WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'games', count(*) FROM games WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'teams', count(*) FROM teams WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'sessions', count(*) FROM sessions WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'career_events', count(*) FROM career_events WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'player_evaluations', count(*) FROM player_evaluations WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'self_evaluations', count(*) FROM self_evaluations
UNION ALL SELECT 'community_players', count(*) FROM community_players WHERE community_id IN (SELECT id FROM communities WHERE owner_id = 'TARGET_ACCOUNT_UUID')
UNION ALL SELECT 'communities', count(*) FROM communities WHERE owner_id = 'TARGET_ACCOUNT_UUID'
UNION ALL SELECT 'players', count(*) FROM players WHERE owner_id = 'TARGET_ACCOUNT_UUID';
```
Expected: every count = 0.

- [ ] **Step 4: Validar auth.users preservado**

```sql
SELECT count(*) FROM auth.users;
```
Expected: same count as before reset (auth.users não é tocado).

- [ ] **Step 5: Verificar advisors pós-reset**

Usar `supabase_get_advisors` com `type: "security"`. Confirmar que não há advisors críticos novos.

- [ ] **Step 6: Testar login de conta preservada**

Verificar que é possível fazer login com uma conta preservada (auth.users intacto) e que `handle_new_user` cria um player canônico idempotente se o player foi removido pelo reset.

- [ ] **Step 7: Registrar cutover concluído no runbook**

Atualizar `docs/operations/reset-cutover-runbook.md` — marcar Passos 5-9 do cutover como concluídos, anotar contagens, advisors, e observações.

- [ ] **Step 8: Atualizar HANDOFF.md**

Atualizar `HANDOFF.md` — adicionar seção "Pós-Cutover Plano 5" com:
- Data do cutover
- Account UUID resetado
- Contagens pré e pós-reset
- Advisors verificados
- Estado: produção estável

- [ ] **Step 9: Commit**

```bash
git add docs/operations/reset-cutover-runbook.md HANDOFF.md
git commit -m "docs(plano-5): production cutover completed, HANDOFF updated"
```

---

### Task 9: Gate de Conclusão da Fase 1

**Files:**
- Modify: `docs/superpowers/plans/2026-07-22-scalable-product-program.md:14`

**Interfaces:**
- Consumes: Tasks 1-8 concluídas
- Produces: Fase 1 marcada como concluída no programa mestre

**PRÉ-REQUISITO:** Todas as tasks 1-8 concluídas e cutover validado.

- [ ] **Step 1: Verificar que todos os gate criteria da Fase 1 são atendidos**

Checklist:
- [ ] Ensaio no branch `plano-5-rehearsal` concluído (Tasks 1-6)
- [ ] Cutover em produção validado (Tasks 7-8)
- [ ] `get_advisors` sem advisors de segurança críticos
- [ ] `npm run lint` (typecheck) sem erros
- [ ] `npm run build` verde
- [ ] `npm test` verde
- [ ] `HANDOFF.md` atualizado com estado pós-cutover
- [ ] `docs/operations/reset-cutover-runbook.md` completo

- [ ] **Step 2: Rodar verificação final**

```bash
npm run lint && npm run lint:eslint && npm run format:check && npm test && npm run build
```
Expected: all pass.

- [ ] **Step 3: Atualizar o programa mestre**

Modificar `docs/superpowers/plans/2026-07-22-scalable-product-program.md` linha 14 — atualizar status:

```markdown
| 5 | Screen Contracts, Reset & Cutover **(escopo reduzido)** | UI atual usa contratos de aplicacao; reset aplicado em producao; ensaio, rollback e corte fecham Produto escalavel — scaffold de reset implementado no Plano 3 | Fase 1 concluída — ensaio e cutover validados |
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-22-scalable-product-program.md
git commit -m "docs(program): plano 5 fase 1 (reset cutover) concluded"
```

- [ ] **Step 5: Anunciar conclusão da Fase 1**

Output to user: "Fase 1 do Plano 5 concluída. Reset de produção ensaiado e executado com sucesso. Próximo passo: Fase 2 — Screen Contracts."

---

## Self-Review Notes

- **Spec coverage:** Fase 1 cobre spec base seção 17 (9 passos de cutover) e seção 4.2-4.6 do Plano 5 design
- **Placeholders:** `TARGET_ACCOUNT_UUID` na Task 8 é intencional — o UUID real será fornecido pelo usuário master no momento do cutover. Não é um placeholder de design, é um parâmetro de execução.
- **Type consistency:** N/A (fase operacional, sem código TypeScript)
- **Scope:** Fase 1 é focada em reset/cutover apenas. Screen Contracts (Fase 2) e Nova Navegação (Fase 3) terão planos separados.
