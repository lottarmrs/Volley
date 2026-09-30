# Dados online — parte 2: peladas e histórico

Segunda de cinco partes do projeto "tempo real" (decidido em 2026-09-30; memória
`volley-next-realtime-replaces-sync`). A parte 1 (comunidade, elenco, membros e regras online,
`docs/superpowers/specs/2026-09-30-dados-online-comunidade-design.md`) está em produção desde
2026-09-30 (`d8cad4b`). Esta parte leva peladas, times, jogos, pontos e relatórios para o banco,
incluindo a pelada ao vivo.

## Decisões desta parte (2026-09-30)

1. **Tudo online já, inclusive o placar**, sem fila. A fila local do placar é da parte 3.
2. **Sem sinal no placar:** os botões de ponto, desfazer, próximo jogo e encerrar ficam
   desabilitados com a faixa "Sem conexão. O placar volta quando o sinal voltar."; nada entra e
   nada some.
3. **Abordagem A:** os "set" do `useSessions` passam a gravar no banco comparando a lista nova com a
   anterior; o formato lido pelas telas não muda. Operações explícitas só onde o significado é
   outro (excluir pelada, limpar histórico, importar backup sem conta).
4. **Consulta única por pessoa** `['peladas', userId]`. Paginação ou pontos sob demanda ficam para
   quando o volume pedir (em produção, em 2026-09-30: 9 peladas, 11 jogos, 242 pontos).
5. **Rascunho do assistente** (antes de "Criar") continua no aparelho.
6. **Na troca, com conta:** as chaves locais de peladas, pelada ativa, times, jogos, pontos e
   relatórios são apagadas na primeira abertura, sem "último envio" (mesmo risco aceito na parte
   1; nenhuma pelada foi alterada em produção desde 2026-09-14).
7. **Sem conta:** nada muda nesta parte.

## Por quê

- Hoje `useSessions` guarda tudo no `localStorage` e o `syncService` sobe e baixa. Quarenta e dois
  pontos do código gravam por `set*`, a maioria em `useLiveSession` e `useSessionWizard`.
- **Buraco encontrado:** o servidor tem `schedule_`, `start_`, `finish_` e `cancel_target_session`
  (`20260828190617_target_session_lifecycle_readiness.sql`), mas o app nunca os chama. O sync cria
  a pelada target (`create_target_session`) e nunca mais atualiza a raiz
  (`syncService.ts`, `isTargetCohortSession` → `continue`). Como as 6 comunidades de produção estão
  no modelo target desde 2026-09-16, a primeira pelada nova ficaria em rascunho na nuvem para
  sempre. Nenhuma pelada foi criada desde a ativação.

## Parte 1 — Camada de dados das peladas

- **Leitura:** `['peladas', userId]` traz `sessions`, `teams`, `games`, `point_events`,
  `game_reports` e `session_reports` de tudo o que a RLS deixa a pessoa ler (as próprias e as das
  comunidades onde é membro ativo, pela policy de `membro_le_o_historico`). Mapeamento com
  `id = local_id || id` e `cloudId`, como o sync (`operationalCloudService` `mapDbTo*`).
- **`useSessions` mantém o formato** (`sessions`, `rawSessions`, `teams`, `games`, `pointEvents`,
  `gameReports`, `sessionReports` e os `set*`), com conta lendo do cache.
- **"Set" que grava:** cada `set*` aplica o novo valor no cache na hora, compara por referência
  com o anterior e grava só as linhas novas, alteradas ou removidas; se o banco recusar, restaura o
  cache e mostra o toast (mesmo helper da parte 1, `useOnlineList`).
- **Raiz da pelada:**
  - **legacy** (as 9 existentes): `upsert` direto, como o sync faz hoje;
  - **target** (toda pelada nova de comunidade ativada): nasce por `create_target_session`; edição
    de nome/data/local por `update_target_session_draft` enquanto rascunho, depois não muda e o app
    deixa de oferecer; mudança de status vira o comando correspondente (sortear/agendar →
    `schedule_target_session`, iniciar → `start_target_session`, encerrar →
    `finish_target_session`).
- **Filhos** (times, jogos, pontos, relatórios): gravação direta nas tabelas, com a permissão por
  cargo que já existe (`schema.sql`, policies "Community organizers can …").
- **Operações explícitas:** excluir pelada (legacy: `deleted_at`; target: `cancel_target_session`),
  limpar histórico da comunidade, e importar backup (só sem conta).

## Parte 2 — Pelada ao vivo, sem sinal e controle

- **Pelada ativa vem do banco:** com conta, deixa de ser `STORAGE_KEYS.activeSession`. A rota
  `/comunidades/:c/sessoes/ativa` (`paths.sessaoAtiva`) abre a pelada em andamento daquela
  comunidade vinda do cache, controlada por `controlled_by_user_id`. A mesma conta retoma em outro
  aparelho; `claim_session_ownership`, o aviso de outro aparelho e a transferência continuam
  valendo. `/sessao/ativa` (pelada sem comunidade) segue só no modo sem conta.
- **Quem não controla** vê o placar em leitura, sem botões; relê quando o banco avisa. O
  acompanhamento ponto a ponto é da parte 3.
- **Cada toque grava** pelo "set" que grava; recusa de um ponto volta atrás com toast e relê os
  pontos do jogo.
- **Sem sinal** (`navigator.onLine` via `useConnectivity`, ou falha de gravação): botões de ponto,
  desfazer, próximo jogo e encerrar desabilitados e a faixa "Sem conexão. O placar volta quando o
  sinal voltar."; ao voltar, relê do banco e destrava.
- **Iniciar e encerrar:** na target, `start_target_session` e `finish_target_session`; na legacy,
  status direto. Encerrar grava os relatórios da pelada e a progressão (online desde a parte 1).
  Recusa por pré-requisito do modelo target (organizador designado, quadra, elenco fechado)
  aparece na tela dizendo o que falta.
- **Primeiro passo do plano:** medir, contra Postgres real, os pré-requisitos de `schedule`,
  `start` e `finish` no fluxo que o app faz hoje, antes de mexer no app.

### Medição (2026-09-30, Postgres de teste com todas as migrations)

Sondagem do fluxo que o app fará numa comunidade target, como dono:

- `create_target_session` (com `planned_start_at`) já cria a designação de organizador e a
  quadra 1; `add_target_session_court` para a mesma ordem dá 23505.
- O elenco só nasce ao fechar a lista (`create_registration_window` → `open_registration` →
  `add_registration_entry`/`join_registration` → `close_registration` → `lock_registration` →
  `finalize_session_roster`), fluxo que o app já tem desde a W4.
- Depois disso a prontidão acusa só `RULES_INVALID`. `freeze_target_session_rules_snapshot` com
  `COMMUNITY_DEFAULTS` falha sem linha em `community_rules` (23514); com `SESSION_EXPLICIT` e o
  payload das regras da pelada, passa.
- `schedule_target_session` → `start_target_session` passam; times, jogos e pontos gravam direto;
  `finish_target_session` exige que nenhum jogo esteja fora de `finished`/`cancelled`/`walkover`
  (SES-INV-025), e passa depois disso.
- `update public.sessions` numa pelada target afeta 0 linhas (sem erro): a raiz target não aceita
  gravação direta.
- Comunidade criada como o app cria (insert direto) nasce `legacy` e dá `ORGANIZER` ao dono.

**Consequências:** nenhum ajuste de servidor é necessário além da publicação. Na raiz target, o que
hoje o app guarda em `sessions` (config do sorteio, `teamIds`, `selectedPlayerIds`) é
reconstruído na leitura: `config` do payload das regras congeladas (`session_rules_snapshots`,
legível por `authenticated` pela policy), `teamIds` e `selectedPlayerIds` dos times da pelada, e o
status de `lifecycle_status` (`DRAFT`/`SCHEDULED` → `draft` ou `teams_generated` conforme haja
times; `IN_PROGRESS` → `active`; `COMPLETED` → `finished`; `CANCELLED` → `cancelled`). Iniciar na
target é a sequência congelar regras (`SESSION_EXPLICIT`, com `config` e `type`) → agendar →
iniciar; encerrar cancela os jogos não terminados antes de `finish_target_session`; sem elenco
fechado, a tela pede para fechar a lista.

## Parte 3 — Convivência com o sync

- O `syncService` deixa de subir e baixar `sessions`, `teams`, `games`, `point_events`,
  `game_reports` e `session_reports`; recebe as peladas do cache só para traduzir ids de rodadas de
  liga (`championship_rounds.session_id`).
- Ligas, rodadas, presença e WhatsApp seguem no sync até a parte 4. "Materializar rodada" cria a
  pelada online.
- Limpeza na troca: `STORAGE_KEYS.sessions`, `activeSession`, `teams`, `games`, `points`,
  `gameReports`, `sessionReports` apagados na primeira sessão `ready` com conta.

## Parte 4 — Servidor

Migration nova `20260930160000_peladas_online.sql`:

- acrescenta `sessions`, `teams`, `games`, `point_events`, `game_reports` e `session_reports` à
  publicação `supabase_realtime` (idempotente, como a da parte 1);
- a medição da Parte 2 não pediu ajuste de servidor; o dbtest do fluxo target fica como prova;
- sem mudança de RLS prevista (leitura de histórico já aberta em `membro_le_o_historico`).

A ponte `useCommunityRealtime` passa a escutar as seis tabelas (filtradas por `community_id`) e
invalida `['peladas', userId]`; o payload continua fora da tela (ADR-RT-001).

## Parte 5 — Telas

- `/impeccable shape` antes do código: histórico, agenda e painel com carregando e faixa de erro;
  placar ao vivo com a faixa de sem conexão e botões travados; placar em leitura para quem não
  controla; mensagens de pré-requisito do modelo target. Mesmo padrão da parte 1 (componentes
  `OnlineLoading`/`OnlineReadError`, gravação silenciosa).
- `/impeccable clarify` dos textos que ainda falam de sincronizar pelada (`SessionWizard`,
  `ChampionshipWizardView` no que toca a pelada, contador de pendentes do `AppShell`).

## Testes

- dbtest: o fluxo do app no modelo target (criar, agendar, iniciar, pontos, encerrar, cancelar)
  com o cargo que opera (dono, admin, organizador) e a recusa para membro comum.
- dbtest: as seis tabelas em `supabase_realtime`.
- Unitário: a comparação do "set" que grava (novas, alteradas, removidas; nada quando igual) e a
  tradução de status em comando target.
- Specs: `useSessions` com conta (lê do banco, grava, volta atrás, sem conexão) e sem conta
  (`localStorage`); placar sem sinal trava e destrava; placar em leitura para quem não controla.
- Sync: não sobe nem baixa peladas; ainda traduz a rodada de liga pelo cache.
- Troca: com conta apaga as sete chaves; sem conta não.

## Publicação

1. Migration primeiro (publicação e eventual ajuste de pré-requisito).
2. App depois.
3. Conferência no ar: numa comunidade ativada, marcar uma pelada, sortear, iniciar, marcar pontos,
   encerrar e ver o histórico em outra aba.

## Fora desta parte

- Fila local do placar e membros acompanhando ponto a ponto (parte 3); atualizar "Funciona Sem
  Sinal" no `PRODUCT.md` (parte 3).
- Ligas, presença, WhatsApp e modelos (parte 4); remoção do sync e do modo sem conta além da pelada
  rápida (parte 5).
