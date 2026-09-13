# C6 — mapa de alcançabilidade

> Levantado em **2026-09-10**, depois de três dead ends consecutivos descobertos durante a
> execução da W6-03 e da W3-08. **Re-derivado em 2026-09-13**, no fim da XS-W3-08
> (branch `exec/c6-w3-08-target-cohort-reachability`, base `88e3475`), rodando de novo o comando do
> fim deste documento e refazendo os três níveis para cada comando que a fatia tocou. Nada aqui foi
> editado à mão sem uma busca que o sustente; as referências `arquivo:linha` são dessa base.

## O que "alcançável" quer dizer aqui

Existe um caminho de um componente React até o comando. O teste foi mecânico e tem três níveis,
porque parar no primeiro foi exatamente o erro que motivou este mapa:

1. o nome do RPC aparece em `src/` fora de teste (`.test.ts`, `.spec.tsx`, `.dbtest.ts`);
2. o gateway que o nomeia é importado por alguma outra coisa — **e o método que faz a chamada é
   invocado**, não só o módulo importado;
3. essa outra coisa chega a um componente renderizado pelo `AppRouter`, ou ao sync que o
   `AppShell` monta.

Um RPC que só aparece no próprio gateway é infraestrutura, não funcionalidade.

Há dois tipos de alcance, e este mapa distingue:

- **por tela** — um usuário abre uma rota e age;
- **por sync** — o comando só dispara quando uma sincronização roda. Um sync roda por quatro portas,
  todas em `useCloudSync`, montado em `AppShell.tsx:144`: o botão "Sincronizar Agora" em
  `/perfil/sync` (`AccountSyncView.tsx:275` → `globalRoutes.tsx:270` → `useCloudSync.ts:339`); o
  reenvio automático ao reconectar, só quando há falha vencida no ledger (`useCloudSync.ts:352-367`);
  a ação de recuperação do painel (`useCloudSync.ts:371-375`); e o upload de conversão de convidado no
  primeiro login (`AppShell.tsx:582`). As três primeiras chamam `syncNow`; a última chama só
  `uploadLocalDataToCloud`. Nenhum botão nomeia o comando — ele é consequência do estado local.

**Limite do método:** ele mede fiação, não uso. Um comando alcançável pode estar atrás de uma tela
que ninguém abre, ou de uma permissão que ninguém tem — é o caso de `create_target_session`, abaixo.

## Resultado

O comando do fim deste documento lista hoje **66** funções públicas nas migrations da era C6 (eram 65
em 2026-09-10; a diferença é `set_community_organizer`, criada pela XS-W3-08). Cerca de 20 são
helpers internos, gatilhos ou redefinições de funções anteriores ao C6 — `assert_*`, `guard_*`,
`log_table_changes`, `current_user_*`, `target_session_compatibility_*`, `check_*`, `prevent_*`, e
também `claim_session_ownership`, `transfer_session_ownership`, `find_player_by_username` e
`session_control_is_expired`, que a varredura de nível 1 encontra em `src/` mas que só aparecem na
lista porque `20260827210000_target_session_root.sql` e `20260908160000_security_audit_remediation.sql`
as recriam. Elas não contam como capacidade C6.

Das ~46 restantes, que são comandos semânticos destinados ao cliente, **8 são alcançáveis**: 5 por
tela, 1 por tela e por sync, e 2 **só por sync** — os dois novos, ambos da XS-W3-08, e ambos
condicionados a estado que a própria interface não produz sozinha (ver abaixo).

### Alcançável

| Capacidade                          | Tipo            | Caminho                                                                                                                                                                                        |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor de avaliação da comunidade   | tela            | `PlayerEditRoute` → `PlayerEditView` → `CommunityEvaluationEditor` → `communityEvaluationUseCases` → `get_community_evaluation_editor`, `record_community_player_evaluation`, `activate_community_evaluation_model`, `set_community_evaluator` |
| Perfil de habilidade da comunidade  | tela            | `PlayerEditView` → `CommunitySkillProfilePanel` → `communitySkillProfileUseCases` → `get_community_player_skill_profile`                                                                       |
| Ativação por comunidade             | tela e sync     | `PlayerEditView` → `isCommunityEvaluationActivated`; e `syncService` → `playerEvaluationCloudService` / `communityEvaluationCloudService.activatedCommunityIds` → `community_evaluation_target_ids` |
| Criar Session no modelo target      | **só sync**     | `uploadLocalDataToCloud` → `sessionCohortCloudService.createTargetSession` → `create_target_session`                                                                                          |
| Ler Session target por id           | **só sync**     | `syncNow` → `mergeTargetCohortSessionReads` → `sessionCohortCloudService.readTargetSession` → `read_target_session`                                                                           |

### Os comandos que a XS-W3-08 tocou, nível por nível

**`create_target_session` — alcançável por sync, só para organizadores herdados.**

1. `src/infra/supabase/sessionCohortCloudService.ts:120`.
2. `syncService.ts:19` importa o serviço; `syncService.ts:1290` invoca `createTargetSession` dentro de
   `uploadLocalDataToCloud`.
3. `uploadLocalDataToCloud` é chamado por `syncNow` (`syncService.ts:1809`) e por
   `cloudSyncUseCases.ts:32`, ambos pelas quatro portas de sync acima.

Dispara só para uma Session local sem `cloudId`, não apagada, sem marcador target, cuja comunidade
resolve para um id de nuvem que `community_evaluation_target_ids` devolve como ativado
(`syncService.ts:1234-1260`, `:1285-1289`). O servidor então exige uma responsabilidade `ORGANIZER`
ativa. **Como `set_community_organizer` não tem chamador (abaixo), essas linhas só existem para quem
o backfill único de `20260827150000` semeou a partir de `community_members.role = 'organizador'`.**
Para qualquer outro membro de uma comunidade ativada, o comando responde `42501` a cada sync — ver
"Problema conhecido" no HANDOFF.

**`read_target_session` — alcançável por sync, condicionado ao anterior.**

1. `sessionCohortCloudService.ts:113`.
2. `syncService.ts:998` invoca `readTargetSession` dentro de `mergeTargetCohortSessionReads`
   (`:987`).
3. `mergeTargetCohortSessionReads` só é chamado por `syncNow` (`syncService.ts:1752`) — o upload de
   conversão de convidado não passa por ele.

Só lê Session com `authorityModel === 'target'` e `cloudId`. O único produtor desse marcador no
cliente é o ramo de criação acima (`syncService.ts:1296-1299`), então `read_target_session` herda
exatamente a mesma restrição de `ORGANIZER`. A leitura devolve `currentRosterRevisionId`
(`sessionCohortCloudService.ts:88`), mas o merge guarda só `name` e `communityId`
(`syncService.ts:999`) — de propósito: uma revisão em cache ficaria velha, e a captura recusa uma
revisão não corrente com `40001`.

**`set_community_organizer` — capacidade de banco sem caminho.**

1. **Falha.** Nenhuma ocorrência em `src/` fora de `src/test/db/setCommunityOrganizer.dbtest.ts`.

A migration existe, é testada contra o `create_target_session` real e faz o que promete. Nenhuma tela
a chama, e `set_community_member_role` — a RPC que o painel de membros usa para promover
(`CommunityMembersPanel.tsx:177` → `communityMembershipUseCases.ts:174` →
`membershipCloudService.ts:139`) — continua sem gravar `community_responsibilities`. Consequência direta: **quem for
promovido a organizador pela interface hoje não consegue criar Session target**. A terceira parede
abaixo foi derrubada no banco, não no app.

**`capture_balance_input_snapshot` e `read_balance_input_snapshot` — continuam inalcançáveis.**

1. `src/infra/supabase/balanceInputSnapshotCloudService.ts:20` e `:33`.
2. `src/application/balanceInputSnapshotUseCases.ts:2` importa o gateway.
3. **Falha.** `balanceInputSnapshotUseCases` só é importado por
   `balanceInputSnapshotUseCases.test.ts:8`.

A XS-W3-08 faz Session target existirem e expõe a revisão corrente de elenco na leitura — mas nada
chama a captura. E mesmo que chamasse, uma Session criada pelo sync nasce **sem** revisão de elenco
(`targetSessionCurrentRosterRevision.dbtest.ts:180` afirma `null` logo depois de
`create_target_session`), e os comandos que materializam uma (`replace_target_quick_session_roster`,
`finalize_session_roster`) não aparecem em `src/`. **Esta fatia abre a estrada; não anda por ela.**

**Cutover (`inspect_legacy_session_cutover`, `transition_legacy_session_to_target`,
`executeSessionCohortTransition`) — mortos, e agora sabidamente mortos.**

1. `inspect_legacy_session_cutover` em `sessionCohortCloudService.ts:106`;
   `transition_legacy_session_to_target` só como nome de operação em `sessionCohortCutover.ts:55`.
2. O módulo do serviço é importado por `syncService.ts:19`, mas o método `inspect` só é invocado por
   `inspectLegacySessionCutover` (`sessionCohortCutover.ts:62`), e `executeSessionCohortTransition`
   (`sessionCohortCutover.ts:84`) é quem executa a transição.
3. **Falha.** Os dois só são importados por `sessionCohortCutover.test.ts:6-9`. A UI de conversão
   foi implementada e revertida (`a320106`).

Não é só fiação faltando: não existe Session legada elegível para ligar (segunda parede, abaixo).

### Não alcançável

| Onda                              | Comandos sem caminho                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W3**                            | `update_target_session_draft`, `publish/schedule/start/finish/cancel_target_session`, `assign/revoke_target_session_organizer`, `add/configure_target_session_court`, `freeze_target_session_rules_snapshot`, `replace_target_quick_session_roster`, `read_target_roster_revision`, `read_target_session_readiness`, `transition_legacy_session_to_target`, `inspect_legacy_session_cutover` |
| **W3-08 (governança)**            | `set_community_organizer`                                                                                                                                                                                                                    |
| **W4 inteira**                    | `create_registration_window`, `open/close/lock_registration`, `join/leave_registration`, `add/remove_registration_entry`, `change_registration_capacity`, `finalize_session_roster`, `inspect_registration_introduction`, `introduce_registration_from_legacy_roster` |
| **W5-01, W5-02**                  | `record_player_evaluation` (o editor usa o próprio comando), `skill_rubric_dimensions_for`                                                                                                                                                  |
| **W6-01, W6-02**                  | `capture_balance_input_snapshot`, `read_balance_input_snapshot`, e o adaptador autorizado                                                                                                                                                  |
| **W2 (fora do C6, mesmo padrão)** | `create_community_with_owner`, `archive_community`, `update_community_profile` — nomeados em `src/application/command/communityCommands.ts`, que nada fora de teste importa; o app cria e edita comunidade por `upsert` genérico na tabela. E `approve/reject/request/withdraw_community_join_request`, enquanto o cliente chama os RPCs legados `approve_join_request` / `reject_join_request` |
| **Operacional**                   | `reset_product_data` — `resetScaffoldCloudService` não é importado por nada                                                                                                                                                                 |

## As três paredes, em ordem

Descobertas nesta ordem, cada uma abaixo da anterior. O estado de cada uma depois da XS-W3-08:

1. **Nenhuma Session target existe.** `operationalCloudService` grava `authority_model: 'legacy'`
   fixo e filtra as leituras por `legacy`. — **Derrubada por sync**, para Session nova de comunidade
   ativada criada por organizador herdado: o upload chama `create_target_session` no lugar do upsert
   legado.
2. **Nenhuma Session legada pode virar target.** Uma Session só entra em `sessions` via
   `confirmDivision`, que grava `status: 'teams_generated'` e cria times — bloqueada por `NOT_DRAFT`
   e `HAS_TEAM_EVIDENCE`. O rascunho do wizard vive só em `activeSession`, nunca sobe, não tem
   `cloudId`. E `buildManualSessionDraft`, o único caminho que produziria um rascunho sem times, não
   tem chamador fora de `sessionLifecycleUseCases.ts` e seus testes. — **De pé, e contornada, não
   derrubada**: a fatia desistiu do cutover.
3. **Criar target nativamente exige `ORGANIZER`, que o app não concede.** As linhas de
   `community_responsibilities` vêm de um backfill único na migration `20260827150000`.
   `set_community_member_role` não grava responsabilidade. — **Derrubada no banco, de pé no app**:
   `set_community_organizer` existe e é testada, mas nada em `src/` a chama.

## O que isto significa para o produto

O app que os usuários usam é o modelo legado, e ele funciona. O C6 é uma refundação construída
ao lado, e hoje ela sustenta uma funcionalidade viva por tela — a avaliação por comunidade — e, desde a
XS-W3-08, a criação por sync de Session target para um conjunto que só encolhe relativamente: os
organizadores herdados do backfill.

**Terminar o C6 não é pré-requisito para usar o app.** As duas coisas devem ser planejadas
separadamente.

## Como usar este mapa

Antes de escrever a spec de qualquer fatia C6, verifique os três níveis para o que ela pressupõe.
Uma fatia cuja saída não tem consumidor alcançável entrega infraestrutura, não software — e este
repositório já tem seis ondas disso.

O comando que gera a primeira coluna:

```bash
for f in supabase/migrations/2026082[7-9]*.sql supabase/migrations/20260[89]*.sql; do
  grep -oE "^create (or replace )?function public\.[a-z_]+" "$f"
done | sed -E 's/^create (or replace )?function public\.//' | sort -u
```

E a varredura de nível 1 usada na re-derivação de 2026-09-13, sobre a saída acima em `fns.txt`:

```bash
while read fn; do
  n=$(grep -rlw --include='*.ts' --include='*.tsx' "$fn" src | grep -vE '\.(test|spec|dbtest)\.tsx?$')
  [ -n "$n" ] && echo "$fn -> $n"
done < fns.txt
```
