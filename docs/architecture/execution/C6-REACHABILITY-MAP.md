# C6 — mapa de alcançabilidade

> Status: `TRANSITIONAL / C6 EXECUTION EVIDENCE`
>
> Owner: `Migration + Architecture Governance`
>
> Last reviewed: `2026-09-24`

> Levantado em **2026-09-10**, depois de três dead ends consecutivos descobertos durante a
> execução da W6-03 e da W3-08. **Re-derivado em 2026-09-13**, no fim da XS-W3-08
> (branch `exec/c6-w3-08-target-cohort-reachability`, base `88e3475`), rodando de novo o comando do
> fim deste documento e refazendo os três níveis para cada comando que a fatia tocou. Nada aqui foi
> editado à mão sem uma busca que o sustente; as referências `arquivo:linha` são dessa base.
> **Ajustado em 2026-09-14** pela XS-W3-09 (branch `exec/c6-w3-09-organizer-from-member-role`):
> `create_target_session`, `set_community_organizer` e a terceira parede.
> **Re-derivado em 2026-09-24**, depois da tela da inscrição, da fatia do pagamento e do repasse de
> organizador (`0008c52`), rodando de novo os dois comandos do fim deste documento e refazendo os
> três níveis para tudo que o nível 1 encontra. A re-derivação corrigiu duas afirmações que tinham
> envelhecido sem serem revistas: `set_community_organizer` **tem** chamador, e a captura de snapshot
> **é** alcançável desde a XS-W6-08c. As referências `arquivo:linha` anteriores a esta data são das
> bases citadas acima.

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

O comando do fim deste documento lista hoje **79** funções públicas nas migrations da era C6 (eram 66
em 2026-09-14; as 13 a mais vêm da inscrição, da reabertura, do conjunto de candidatos e dos quatro
comandos de pagamento). Cerca de 20 são
helpers internos, gatilhos ou redefinições de funções anteriores ao C6 — `assert_*`, `guard_*`,
`log_table_changes`, `current_user_*`, `target_session_compatibility_*`, `check_*`, `prevent_*`, e
também `claim_session_ownership`, `transfer_session_ownership`, `find_player_by_username` e
`session_control_is_expired`, que a varredura de nível 1 encontra em `src/` mas que só aparecem na
lista porque `20260827210000_target_session_root.sql` e `20260908160000_security_audit_remediation.sql`
as recriam. Elas não contam como capacidade C6.

Das restantes, que são comandos semânticos destinados ao cliente, **32 são alcançáveis** — contagem
re-derivada em 2026-09-24, não herdada. A soma, por origem:

| Origem                                                  | Quantos | Tipo             |
| ------------------------------------------------------- | ------- | ---------------- |
| Editor e perfil de avaliação da comunidade              | 5       | tela             |
| `community_evaluation_target_ids`                       | 1       | tela e sync      |
| Session target (`create`, `read`, `read_roster_revision`) | 3     | sync e tela      |
| Janela de inscrição, pelo wizard e pela tela             | 10      | tela             |
| Quadro da inscrição e pagamento                          | 8       | tela             |
| Captura e leitura do snapshot de balanceamento           | 2       | tela             |
| `publish_team_candidate_set`                             | 1       | tela             |
| Repasse de organizador                                   | 2       | tela             |

Duas correções em relação à contagem anterior, ambas de afirmações que envelheceram sem revisão:
`capture_balance_input_snapshot` e `read_balance_input_snapshot` passaram a ser alcançáveis pela
XS-W6-08c e a seção que os declarava mortos não foi atualizada; e `set_community_organizer` ganhou
chamador em 2026-09-24. A contagem anterior de 28 não é reconciliável linha a linha com esta — ela
vinha sendo incrementada por fatia, e esta foi recontada do zero.

### Alcançável

| Capacidade                          | Tipo            | Caminho                                                                                                                                                                                        |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor de avaliação da comunidade   | tela            | `PlayerEditRoute` → `PlayerEditView` → `CommunityEvaluationEditor` → `communityEvaluationUseCases` → `get_community_evaluation_editor`, `record_community_player_evaluation`, `activate_community_evaluation_model`, `set_community_evaluator` |
| Perfil de habilidade da comunidade  | tela            | `PlayerEditView` → `CommunitySkillProfilePanel` → `communitySkillProfileUseCases` → `get_community_player_skill_profile`                                                                       |
| Ativação por comunidade             | tela e sync     | `PlayerEditView` → `isCommunityEvaluationActivated`; e `syncService` → `playerEvaluationCloudService` / `communityEvaluationCloudService.activatedCommunityIds` → `community_evaluation_target_ids` |
| Criar Session no modelo target      | **só sync**     | `uploadLocalDataToCloud` → `sessionCohortCloudService.createTargetSession` → `create_target_session`                                                                                          |
| Ler Session target por id           | sync e tela     | `syncNow` → `mergeTargetCohortSessionReads` → `sessionCohortCloudService.readTargetSession` → `read_target_session`; e `RegistrationBoardView` → `SessionOrganizerPanel` → `transferSessionOrganizer` → o mesmo comando, para ler a revisão antes de atribuir |
| Sorteio autorizado | tela | `SessionWizard` → `useSessionWizard.generateDivisions` → `prepareAuthorizedTeamFormation` → `create_target_session`, `create_registration_window`, `open_registration`, `reopen_registration`, `add_registration_entry`, `remove_registration_entry`, `change_registration_capacity`, `close_registration`, `lock_registration`, `finalize_session_roster`, `read_registration_window`, `read_target_roster_revision`, `capture_balance_input_snapshot`, `read_balance_input_snapshot` |
| Publicar candidatos | tela | `SessionWizard` → `CandidateSetPublication` → `useSessionWizard.publishCandidateSet` → `publishTeamCandidateSet` → `read_target_roster_revision`, `publish_team_candidate_set` |
| Inscrição da pelada | tela | `RegistrationBoardView` → `useRegistrationBoard` → `registrationUseCases` → `create_registration_window`, `open_registration`, `close_registration`, `reopen_registration`, `join_registration`, `leave_registration`, `add_registration_entry`, `remove_registration_entry`, `change_registration_capacity`, `read_registration_board`, `read_session_registration` |
| Pagamento da inscrição | tela | `RegistrationBoardView` → `useRegistrationBoard` → `registrationUseCases` → `mark_registration_payment`, `set_registration_payment_due`, `boost_registration_reserve_entry`, `apply_registration_payment_deadline` |
| Repasse de organizador | tela | `CommunityRegistrationRoute` → `RegistrationBoardView` → `SessionOrganizerPanel` → `transferSessionOrganizer` → `set_community_organizer`, `assign_target_session_organizer` |

### Os comandos que a XS-W3-08 tocou, nível por nível

**`create_target_session` — alcançável por sync, para quem tem o cargo Organizador.**

1. `src/infra/supabase/sessionCohortCloudService.ts:120`.
2. `syncService.ts:19` importa o serviço; `syncService.ts:1299` invoca `createTargetSession` dentro de
   `uploadLocalDataToCloud`.
3. `uploadLocalDataToCloud` é chamado por `syncNow` (`syncService.ts:1831`) e por
   `cloudSyncUseCases.ts:32`, ambos pelas quatro portas de sync acima.

Dispara só para uma Session local sem `cloudId`, não apagada, sem marcador target, cuja comunidade
resolve para um id de nuvem UUID que `community_evaluation_target_ids` devolve como ativado
(`syncService.ts:1234-1260`, `:1292-1296`); id que não é UUID nem entra na consulta e segue o legado.
O servidor então exige membership ativa e uma responsabilidade `ORGANIZER` ativa. **Desde a
XS-W3-09, o cargo Organizador concede essa responsabilidade**: `set_community_member_role`
(`membershipCloudService.ts:139`, invocado por `communityMembershipUseCases.ts:174` a partir de
`CommunityMembersPanel.tsx:177`) grava `community_members`, e o trigger
`mirror_community_member_to_target` projeta a membership e o `ORGANIZER`. Dono e admin não recebem
`ORGANIZER`; para eles, e para qualquer outro membro sem o cargo, o comando responde `42501` a cada
sync — ver "Problema conhecido" no HANDOFF. Se a linha já existe, o comando responde `23505` (`sessions_pkey`,
observado contra o banco real); o sync então lê a Session por id e a adota (`syncService.ts:1309-1311`).
Se essa leitura responde `P0002`, a linha é legada — a própria Session, que perdeu o `cloudId` — e o
sync segue o upsert legado (`:1313`).

**`read_target_session` — alcançável por sync, condicionado ao anterior.**

1. `sessionCohortCloudService.ts:113`.
2. `syncService.ts:998` invoca `readTargetSession` dentro de `mergeTargetCohortSessionReads`
   (`:987`), e `syncService.ts:1311` o invoca para adotar a Session depois de `23505`.
3. `mergeTargetCohortSessionReads` só é chamado por `syncNow` (`syncService.ts:1774`) — o upload de
   conversão de convidado não passa por ele.

Só lê Session com `authorityModel === 'target'` e `cloudId`. O único produtor desse marcador no
cliente é o ramo de criação acima (`syncService.ts:1317-1320`), então `read_target_session` herda
exatamente a mesma restrição de `ORGANIZER`. A leitura devolve `currentRosterRevisionId`
(`sessionCohortCloudService.ts:88`), mas o merge guarda só `name` (`syncService.ts:999`) — de
propósito: uma revisão em cache ficaria velha, e a captura recusa uma revisão não corrente com
`40001`. O `communityId` local é preservado, porque a leitura devolve o id de nuvem da Comunidade, que
nunca é igual ao local.

**Problemas conhecidos da Session target** (detalhe no HANDOFF): é invisível em outro aparelho — o
download em lote filtra `sessions` para legado (`operationalCloudService.ts:72`) e a leitura target só
acontece por um `cloudId` já guardado localmente —, enquanto `teams` e `games` são baixados sem esse
filtro e chegam sem a Session-pai; a exclusão não se propaga — o upload não chama `softDelete` para
Session target (a policy de update o filtraria em silêncio, com sucesso falso) e reporta um problema
naquela rodada, a Session local é removida e a linha continua viva no servidor.

**`set_community_organizer` e `assign_target_session_organizer` — alcançáveis por tela desde
2026-09-24.**

1. `src/infra/supabase/sessionOrganizerCloudService.ts:30` e `:38`.
2. `sessionOrganizerUseCases.ts:2` importa o serviço, e `transferSessionOrganizer` invoca os dois
   métodos — `setCommunityOrganizer` para conceder a responsabilidade, `assignSessionOrganizer` para
   amarrar a pessoa à sessão.
3. `sessionRoutes.tsx` importa `transferSessionOrganizer` e o invoca no `onTransfer` que
   `CommunityRegistrationRoute` passa a `RegistrationBoardView`; a rota está montada em
   `AppRouter.tsx:83` (`sessoes/:sessionId/inscricao`).

A ordem importa e é a razão de a fatia existir: `assign_target_session_organizer` exige
`session.manage`, que vem **só** da responsabilidade `ORGANIZER`, e nem o dono da comunidade a tem
por padrão. Por isso o caso de uso concede a responsabilidade a quem delega, além de a quem recebe.

**Portão acima deste:** a tela só oferece o repasse quando a Session é target
(`authorityModel === 'target'` com `cloudId`), e isso hoje acontece por duas portas — o sorteio do
wizard e a criação por sync. Numa comunidade que nunca passou por nenhuma das duas, o comando
continua sem caminho de usuário, por falta de Session target, não por falta de fiação.

**Assimetria conhecida, aberta:** `set_community_organizer` grava direto em
`community_responsibilities`. O espelho de `20260914120000` vai só na direção contrária
(`community_members` → membership e `ORGANIZER`), então depois do repasse o painel de membros, que lê
`community_members`, continua mostrando quem passou a organizar como "Membro". O detector
`app_private.community_membership_drift()` não acusa isso: `ORPHAN_RESPONSIBILITY` só dispara quando
não existe linha legada nenhuma para a pessoa.

**`capture_balance_input_snapshot` e `read_balance_input_snapshot` — alcançáveis desde a XS-W6-08c.**

1. `src/infra/supabase/balanceInputSnapshotCloudService.ts:20` e `:33`.
2. `authorizedTeamFormationUseCases.ts:54-55` monta o gateway sobre o serviço, e
   `prepareAuthorizedTeamFormation` invoca `captureSnapshot` (`:276`) ou `readSnapshot` (`:274`),
   conforme haja progresso guardado para a mesma revisão de elenco.
3. `useSessionWizard.ts` importa `prepareAuthorizedTeamFormation` e o chama em
   `generateDivisions` — o sorteio do wizard.

O texto anterior deste bloco dizia que a XS-W3-08 "abre a estrada; não anda por ela". Era verdade em
2026-09-13 e deixou de ser com a XS-W6-08c, que fez o wizard materializar a revisão de elenco por
`finalize_session_roster` antes de capturar. A afirmação ficou no documento por três fatias.

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
| **W3**                            | `update_target_session_draft`, `publish/schedule/start/finish/cancel_target_session`, `revoke_target_session_organizer`, `add/configure_target_session_court`, `freeze_target_session_rules_snapshot`, `replace_target_quick_session_roster`, `read_target_session_readiness`, `transition_legacy_session_to_target`, `inspect_legacy_session_cutover` |
| **W4 (restante)** | `inspect_registration_introduction`, `introduce_registration_from_legacy_roster` |
| **W5-01, W5-02**                  | `record_player_evaluation` (o editor usa o próprio comando), `skill_rubric_dimensions_for`                                                                                                                                                  |
| **W6-01, W6-02**                  | o adaptador autorizado                                                                                                                                                  |
| **W6-03** | `read_team_candidate_set` (sem consumidor até a XS-W6-04) |
| **W2 (fora do C6, mesmo padrão)** | `create_community_with_owner`, `archive_community`, `update_community_profile` — nomeados em `src/application/command/communityCommands.ts`, que nada fora de teste importa; o app cria e edita comunidade por `upsert` genérico na tabela. E `approve/reject/request/withdraw_community_join_request`, enquanto o cliente chama os RPCs legados `approve_join_request` / `reject_join_request` |
| **Operacional**                   | `reset_product_data` — `resetScaffoldCloudService` não é importado por nada                                                                                                                                                                 |

## As três paredes, em ordem

Descobertas nesta ordem, cada uma abaixo da anterior. O estado de cada uma depois da XS-W3-08 e da
XS-W3-09:

1. **Nenhuma Session target existe.** `operationalCloudService` grava `authority_model: 'legacy'`
   fixo e filtra as leituras por `legacy`. — **Derrubada por sync**, para Session nova de comunidade
   ativada criada por quem tem `ORGANIZER`: o upload chama `create_target_session` no lugar do upsert
   legado.
2. **Nenhuma Session legada pode virar target.** Uma Session só entra em `sessions` via
   `confirmDivision`, que grava `status: 'teams_generated'` e cria times — bloqueada por `NOT_DRAFT`
   e `HAS_TEAM_EVIDENCE`. O rascunho do wizard vive só em `activeSession`, nunca sobe, não tem
   `cloudId`. E `buildManualSessionDraft`, o único caminho que produziria um rascunho sem times, não
   tem chamador fora de `sessionLifecycleUseCases.ts` e seus testes. — **De pé, e contornada, não
   derrubada**: a fatia desistiu do cutover.
3. **Criar target nativamente exige `ORGANIZER`, que o app não concede.** As linhas de
   `community_responsibilities` vêm de um backfill único na migration `20260827150000`.
   `set_community_member_role` não grava responsabilidade. — **Derrubada no app para o cargo
   Organizador** pela XS-W3-09 (integrada em 2026-09-14): o trigger que espelha `community_members`
   concede `ORGANIZER` a quem recebe o cargo pelo painel. **Derrubada também para dono, admin e
   moderador** pela XS-W6-08a, em comunidades legadas: o espelho traduz o `manage_sessions` que esses
   cargos já têm. Continua de pé em comunidades target (`GINV-CAP-002`), que o app não cria;
   **Derrubada por tela em
   2026-09-24**, pelo repasse de organizador: `set_community_organizer` ganhou chamador, e quem
   administra a comunidade concede a responsabilidade a si mesmo ou a outro membro sem passar pelo
   cargo legado. A mesma fatia ativa o modelo de avaliação em toda
   comunidade, então a ativação deixa de ser parede para captura e editor.

## O que isto significa para o produto

O app que os usuários usam é o modelo legado, e ele funciona. O C6 é uma refundação construída
ao lado, e hoje ela sustenta três funcionalidades vivas por tela — a avaliação por comunidade, o
sorteio autorizado do wizard e a inscrição da pelada, com pagamento e repasse de organizador — além
da criação por sync de Session target, desde a XS-W3-08.

A inscrição é a primeira delas que o **atleta** alcança: até ela, todo comando C6 com caminho de
usuário era de organizador ou de quem administra.

**Terminar o C6 não é pré-requisito para usar o app.** As duas coisas devem ser planejadas
separadamente.

## Como usar este mapa

Antes de escrever a spec de qualquer fatia C6, verifique os três níveis para o que ela pressupõe.
Uma fatia cuja saída não tem consumidor alcançável entrega infraestrutura, não software — e este
repositório já tem seis ondas disso.

O comando que gera a primeira coluna:

```bash
for f in supabase/migrations/2026082[7-9]*.sql supabase/migrations/2026{09,1[0-2]}*.sql; do
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
