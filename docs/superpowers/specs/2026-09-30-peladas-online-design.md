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

8. **Toda pelada nasce marcada, com lista** (decidido em 2026-09-30, depois do percurso em
   produção). A exceção é a **pelada rápida** ("Jogar agora, sem lista"), que fica numa comunidade
   escolhida (se a pessoa tiver só uma, já vem escolhida) e entra no histórico dela.
9. **Esta parte inclui o fluxo novo** (seção "Fluxo da pelada"), para marcar, lista e sortear
   nascerem online já no desenho novo.

## Fluxo da pelada

### O que o percurso em produção mostrou (2026-09-30, celular, conta do usuário)

- A pelada marcada **some**: a tela diz "Ela já aparece na agenda do grupo", mas a agenda e a lista
  de peladas da comunidade ficam vazias. Marcar grava só no aparelho e depende do sync; a pelada
  target que subiu nunca volta (o sync não baixa target).
- A lista **não abre**: sem id da nuvem, "Abrir a lista de presença" termina em "A lista não
  carregou" sem chamar o servidor; noutro aparelho a janela ficou em `DRAFT` e `reopen_registration`
  deu 400.
- Portas demais, com nomes diferentes ("Nova sessão", "Nova pelada", "Criar sessão", "Marcar uma
  pelada" que leva à lista de comunidades); o painel não mostra a próxima pelada.
- Marcar ainda é o assistente de 7 passos (Sessão, Atletas, Formato, Regras, Revisão, Times,
  Tabela), retoma rascunho no meio, não volta pelo topo, título cortado no celular, "Marcar pelada"
  duas vezes e ativo depois de marcada. **Não há horário.**
- A comunidade nova ensina "Montar o elenco" antes de "Marcar a primeira pelada".
- A pelada rápida (`/comecar`) não tem entrada no painel nem na comunidade e, com conta, joga os
  nomes na primeira comunidade sem perguntar (`onboardingRoutes.tsx`, `comm.communities[0]`).
- Textos técnicos ou em inglês: "Setup de sessão v1.2", "Média Power", "Over", "Plataforma
  local-first… Web Worker", "Central local dos grupos", "Invalid login credentials", toasts de sync.
- **Correção de uma hipótese:** toda comunidade, inclusive a criada hoje, já nasce ativada
  (gatilho `activate_evaluation_model_on_community_insert`, `20260915180000`); pelada nova é target
  e aceita lista. `communities.authority_model` não decide isso.

### O desenho

- **Uma ação, "Marcar pelada"**, no painel, na agenda e na comunidade (na agenda e no painel,
  escolhe a comunidade se houver mais de uma). Tela curta: data, **horário (obrigatório)**, local
  (vem da comunidade), vagas e formato (jogo livre ou torneio). O botão é **"Marcar e abrir a
  lista"**: `create_target_session` com `planned_start_at` → `create_registration_window` com as
  vagas → `open_registration`, tudo online; termina na tela da pelada com o link para o WhatsApp.
- **A tela da pelada é o centro** (`/comunidades/:c/sessoes/:s`, que hoje é o quadro da
  inscrição): lista (confirmados, vagas, reserva, pagamento) → **Fechar a lista**
  (`close_registration` → `lock_registration` → `finalize_session_roster`) → **Sortear** (rota
  `sortear`, que recebe os passos de formato, regras, revisão, times e tabela do assistente; "ajustar
  quem joga" é exceção sobre os confirmados) → **Iniciar** → placar → **Encerrar**. Mostra quem
  organiza e o estado atual.
- **Pelada rápida** ("Jogar agora, sem lista"), com entrada no painel e na comunidade: escolhe a
  comunidade, escolhe do elenco ou cola nomes (os colados viram convidados dessa comunidade), e o
  app faz por trás a mesma pelada target com a lista preenchida por quem organiza e fechada na hora
  (`create_target_session` → janela com as vagas = quantidade → `open_registration` →
  `add_registration_entry` por atleta → fechar, travar, `finalize_session_roster`) e vai direto ao
  sortear. Um tipo só de pelada no servidor. Sem conta, a pelada rápida continua no aparelho, como
  hoje.
- **O assistente de 7 passos deixa de ser porta de entrada.** Seus passos de formato e regras em
  diante vivem no sortear; o passo de atletas vira "ajustar quem joga".
- **O painel mostra a próxima pelada** marcada (data, hora, lista X de Y, estado) com o próximo
  passo em destaque, além de "Marcar pelada" e "Pelada rápida".
- **A comunidade nova** ensina "Marcar a primeira pelada" primeiro (a lista traz as pessoas) e o
  elenco como complemento.
- **"Pelada"** em toda a interface; "sessão" some dos textos.
- A pelada presa em `DRAFT` em produção (Inimigos do Vôlei, 30/09) passa a aparecer e pode ter a
  lista aberta ou ser cancelada pela tela da pelada.

## Análise de dependências (2026-09-30, grafo do código + Postgres de teste)

Feita antes de quebrar o assistente de pelada ("Setup de Sessão v1.2"), cruzando o grafo do
código (`graphify-out/`), as migrations e sondas no Postgres de teste.

### Banco de dados

- **Quem organiza sem ser dono, admin ou moderador não grava a pelada.** Sonda: um membro com a
  responsabilidade `ORGANIZER` cria a pelada (`create_target_session` passa), mas gravar time e
  ponto dá 42501. As policies de `teams`, `games`, `point_events`, `game_reports` e
  `session_reports` usam `current_user_has_community_role` com o padrão
  `['owner','admin','moderator']` (`20260624203424_community_model_v2.sql`); o cargo
  `organizador` e a responsabilidade ficam de fora. O sync escondia a recusa.
- **Pelada target sem local nem observações.** `create_target_session` e
  `update_target_session_draft` só aceitam nome e horários; a raiz target não aceita gravação
  direta.
- **Carreira só é recalculada quando jogos ou pontos mudam.** Os gatilhos
  `regenerate_career_after_*` (por comando) existem em `games` e `point_events`, não em
  `sessions`; `regenerate_career_events_for_sessions` (última definição em
  `20260730120000_scope_career_points_by_owner.sql`) só conta pelada com `status = 'finished'`.
  `finish_target_session` grava `status = 'finished'` (via
  `target_session_compatibility_status`), mas se nada for gravado depois, a pelada não entra na
  carreira.
- **Custo medido:** um ponto (insert + placar do jogo, com auditoria `log_table_changes` e dois
  recálculos de carreira) leva ~30 ms no banco local. Aceitável.
- **Sem mudança necessária:** ciclo target completo; regras congeladas legíveis por membros;
  elenco pela lista; exclusão só lógica (as FKs para `sessions` não atrapalham); candidatos do
  sorteio só publicados como registro (`publish_team_candidate_set`), times continuam por
  insert direto.

### Frontend

- `Session` não tem horário nem lê o local de uma target: falta `plannedStartAt` (de
  `planned_start_at`) e o local da pelada target.
- O sortear guarda formato e regras num rascunho **por pelada** no aparelho até começar (o
  congelamento só acontece no "Começar").
- Quatro lugares criam pelada sem lista e travariam ao começar: `SessionWizardRoute`,
  `QuickStartRoute`, `createSessionFromCommunity` ("criar pelada com estes atletas") e
  `materializeChampionshipRound` (rodada de liga).
- Pelada rápida com nomes colados: os convidados novos precisam existir no banco (com id da
  nuvem) antes de `add_registration_entry`; a gravação de atletas hoje não espera o banco.
- Encerrar grava hoje a pelada antes dos jogos (`handleFinishSession`); a ordem certa é jogos
  primeiro.
- O assistente (`SessionWizard.tsx`, 3.047 linhas, 7 passos num `switch`) não tem spec próprio;
  `useSessionWizard` (626 linhas) vive no `AppShell`; o registro de arquitetura
  (`currentStateLedger.ts`) cita os arquivos pelo caminho; os E2E `01-onboarding` e
  `05-session-wizard` percorrem o fluxo antigo.
- Os leitores de peladas (7 arquivos, todos via `sess.*`) não mudam de formato.

### Outras ligações

- Liga (abrir e materializar rodada) aponta para peladas e segue no sync até a parte 4.
- A aba "Presença" (`community_presence`) e a "Lista de WhatsApp" ficam redundantes com a lista
  nova — **decidido: fica para a parte 4**.
- Ranking e card são calculados no app a partir das peladas lidas; a carreira oficial depende da
  correção de "carreira ao encerrar".

### Decisões da análise

- **Ajustar quem joga depois de fechar a lista = reabrir a lista** (`reopen_registration`):
  tirar ou incluir, fechar de novo. A lista oficial sempre bate com quem jogou.
- **Quebrar o assistente** em peças: marcar (tela curta), sortear (formato e regras → times →
  tabela, estado preso à rota), seletor de atletas (pelada rápida e convidado rápido).
  Extração mecânica primeiro, protegida por specs de caracterização; a lógica de times
  (`prepareAuthorizedTeamFormation`, balanceamento, candidatos, `sessionLifecycleUseCases`) não
  muda, só quem a chama.
- **Rodada de liga** usa a pelada rápida com os atletas dos dois times e vai direto ao
  "Começar", sem sorteio.

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

- acrescenta `sessions`, `teams`, `games`, `point_events`, `game_reports`, `session_reports` e
  `registration_windows` à publicação `supabase_realtime` (idempotente, como a da parte 1);
- a medição da Parte 2 não pediu ajuste no ciclo target; o dbtest do fluxo target fica como prova;
- migration `20260930170000_peladas_servidor.sql` (análise de dependências):
  - quem tem `session.manage` na comunidade (dono, admin, moderador e quem tem a
    responsabilidade `ORGANIZER`) grava `teams`, `games`, `point_events`, `game_reports` e
    `session_reports` da comunidade;
  - `set_target_session_details(p_session_id, p_expected_revision, p_location, p_notes)` para quem
    organiza a pelada, enquanto não encerrada nem cancelada;
  - gatilho em `sessions`: ao passar para `status = 'finished'`, recalcula a carreira daquela
    pelada e os marcos de quem jogou;
- sem mudança de RLS prevista (leitura de histórico já aberta em `membro_le_o_historico`).

A ponte `useCommunityRealtime` passa a escutar as seis tabelas (filtradas por `community_id`) e
invalida `['peladas', userId]`; o payload continua fora da tela (ADR-RT-001).

## Parte 5 — Telas

- `/impeccable shape` antes do código, em duas levas:
  1. **o fluxo** (seção "Fluxo da pelada"): marcar (tela curta), tela da pelada (lista → fechar →
     sortear → iniciar), pelada rápida (escolher comunidade, elenco ou colar), entradas (painel com
     a próxima pelada, agenda, comunidade, comunidade nova);
  2. **os estados online**: histórico, agenda e painel com carregando e faixa de erro; placar com a
     faixa de sem conexão e botões travados; placar em leitura para quem não controla; recusas do
     modelo target ("Feche a lista antes de iniciar a pelada.", "Só quem organiza esta pelada pode
     iniciar."). Mesmo padrão da parte 1 (`OnlineLoading`/`OnlineReadError`, gravação silenciosa).
- `/impeccable clarify` dos textos: "sessão" → "pelada"; os técnicos e em inglês listados no
  percurso; o erro do login em português ("E-mail ou senha incorretos."); os que falam de
  sincronizar pelada (`SessionWizard`, `ChampionshipWizardView` no que toca a pelada, pendentes do
  `AppShell`); toasts de sync que não pedem ação saem.
- A tela da pelada escuta `registration_windows` da pelada aberta (canal por pelada) e relê o
  quadro quando a lista muda.

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
3. Conferência no ar, no celular: marcar uma pelada com horário (a lista abre junto), ver a pelada
   na agenda e no painel, entrar na lista por outra aba, fechar a lista, sortear, iniciar, marcar
   pontos, encerrar e ver o histórico em outra aba; depois, uma pelada rápida colando nomes.

## Fora desta parte

- Fila local do placar e membros acompanhando ponto a ponto (parte 3); atualizar "Funciona Sem
  Sinal" no `PRODUCT.md` (parte 3).
- Ligas, presença, WhatsApp e modelos (parte 4); remoção do sync e do modo sem conta além da pelada
  rápida (parte 5).
