# C6 — mapa de alcançabilidade

> Levantado em **2026-09-10**, depois de três dead ends consecutivos descobertos durante a
> execução da W6-03 e da W3-08. Este documento existe porque o pacote C6 assume alcançabilidade
> que nunca foi verificada, e três specs foram escritas em cima dessa suposição.

## O que "alcançável" quer dizer aqui

Existe um caminho de um componente React até o comando. O teste foi mecânico e tem três níveis,
porque parar no primeiro foi exatamente o erro que motivou este mapa:

1. o nome do RPC aparece em `src/` fora de teste;
2. o gateway que o nomeia é importado por alguma outra coisa;
3. essa outra coisa chega a um componente ou hook.

Um RPC que só aparece no próprio gateway é infraestrutura, não funcionalidade.

**Limite do método:** ele mede fiação, não uso. Um comando alcançável pode estar atrás de uma tela
que ninguém abre, ou de uma permissão que ninguém tem — foi o caso de `create_target_session`, que
é alcançável no papel e exige uma responsabilidade `ORGANIZER` que o app não sabe conceder.

## Resultado

Das 65 funções públicas criadas pelas migrations da era C6, cerca de 20 são helpers internos ou
gatilhos, chamados por SQL e não pelo cliente — `assert_*`, `guard_*`, `log_table_changes`,
`current_user_*`, `target_session_compatibility_*`, `check_*`, `prevent_*`. Elas não deveriam ter
chamador no cliente e não contam.

Das ~45 restantes, que são comandos semânticos destinados ao cliente, **6 são alcançáveis**.

### Alcançável

| Capacidade | Caminho |
| --- | --- |
| Editor de avaliação da comunidade | `CommunityEvaluationEditor` → `communityEvaluationUseCases` → `get_community_evaluation_editor`, `record_community_player_evaluation`, `activate_community_evaluation_model`, `set_community_evaluator` |
| Perfil de habilidade da comunidade | `CommunitySkillProfilePanel` → `communitySkillProfileUseCases` → `get_community_player_skill_profile` |
| Filtro de coorte no sync | `syncService` → `playerEvaluationCloudService` → `community_evaluation_target_ids` |

Ou seja: **a W5-03 e o complemento do editor são a única parte do C6 que um usuário toca.**

### Não alcançável

| Onda | Comandos sem caminho |
| --- | --- |
| **W3 inteira** | `create_target_session`, `update_target_session_draft`, `publish/schedule/start/finish/cancel_target_session`, `assign/revoke_target_session_organizer`, `add/configure_target_session_court`, `freeze_target_session_rules_snapshot`, `replace_target_quick_session_roster`, `read_target_roster_revision`, `read_target_session_readiness`, `transition_legacy_session_to_target`, `inspect_legacy_session_cutover` |
| **W4 inteira** | `create_registration_window`, `open/close/lock_registration`, `join/leave_registration`, `add/remove_registration_entry`, `change_registration_capacity`, `finalize_session_roster`, `inspect_registration_introduction`, `introduce_registration_from_legacy_roster` |
| **W5-01, W5-02** | `record_player_evaluation` (o editor usa o próprio comando), `skill_rubric_dimensions_for` |
| **W6-01, W6-02** | `capture_balance_input_snapshot`, `read_balance_input_snapshot`, e o adaptador autorizado |
| **W2 (fora do C6, mesmo padrão)** | `create_community_with_owner`, `archive_community`, `update_community_profile` — o app cria e edita comunidade por `upsert` genérico na tabela; e `approve/reject/request/withdraw_community_join_request`, enquanto o cliente chama os RPCs legados `approve_join_request` / `reject_join_request` |
| **Operacional** | `reset_product_data` — `resetScaffoldCloudService` não é importado por nada |

`read_target_session` é um caso à parte: a XS-W3-08 acabou de ligá-lo no sync, mas ele só dispara
para Session com marcador de coorte, e nada define esse marcador. Alcançável no código, inerte na
prática.

## As três paredes, em ordem

Descobertas nesta ordem, cada uma abaixo da anterior:

1. **Nenhuma Session target existe.** `operationalCloudService` grava `authority_model: 'legacy'`
   fixo e filtra as leituras por `legacy`.
2. **Nenhuma Session legada pode virar target.** Uma Session só entra em `sessions` via
   `confirmDivision`, que grava `status: 'teams_generated'` e cria times — bloqueada por `NOT_DRAFT`
   e `HAS_TEAM_EVIDENCE`. O rascunho do wizard vive só em `activeSession`, nunca sobe, não tem
   `cloudId`. E `buildManualSessionDraft`, o único caminho que produziria um rascunho sem times, não
   tem chamador.
3. **Criar target nativamente exige `ORGANIZER`, que o app não concede.** As linhas de
   `community_responsibilities` vêm de um backfill único na migration `20260827150000`, semeado de
   `community_members.role = 'organizador'`. `set_community_member_role`, a única RPC que muda cargo,
   **não** grava responsabilidade. Quem já era organizador tem; quem for promovido amanhã, não.

A terceira é a mais barata de derrubar: um RPC espelhando `set_community_evaluator`, que a W5 já
criou como precedente.

## O que isto significa para o produto

O app que os usuários usam é o modelo legado, e ele funciona. O C6 é uma refundação construída
ao lado, e hoje ela sustenta uma única funcionalidade viva — a avaliação por comunidade.

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
