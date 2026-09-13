# HANDOFF — Panelinha

> Atualizado em **2026-09-08**, ao integrar em `main` a W5-02..W5-04, o editor de avaliação, a
> remediação da auditoria de segurança do mesmo dia e a W6-01, depois da review independente de
> branch inteira. Este é o ponto de retomada canônico se o limite da conversa acabar.
>
> **2026-09-13:** a XS-W3-08 está concluída na branch `exec/c6-w3-08-target-cohort-reachability`,
> não integrada — ver a seção dela logo abaixo da tabela de fatias.

## 0. Trabalho corrente — execução arquitetural C6

O trabalho ativo **não é mais o Plano 5**, que foi concluído em 2026-08-12. Hoje o repositório
executa o programa de arquitetura C6, fatia por fatia (`XS-Wx-yy`), no modelo _strangler_: o
modelo legado continua existindo e a autoridade migra por contexto.

**Fonte canônica da ordem de trabalho:**
`docs/architecture/execution/C6-EXECUTION-MASTER.md` (waves e pré-condições) e
`docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` (fatias W3–W6).
As seções 1–15 deste arquivo **não** descrevem a ordem de trabalho atual.

### Alcançabilidade — leia antes de planejar qualquer fatia C6

Em 2026-09-10, depois de três dead ends seguidos, levantei o que do C6 é realmente alcançável por um
usuário: [mapa de alcançabilidade](docs/architecture/execution/C6-REACHABILITY-MAP.md).

Resumo, re-derivado em 2026-09-13 no fim da XS-W3-08: das ~46 funções públicas da era C6 destinadas
ao cliente, **8 são alcançáveis** — 5 por tela (editor de avaliação e perfil de comunidade, W5-03 e
seu complemento), 1 por tela e por sync (`community_evaluation_target_ids`) e 2 **só por sync**,
ambas da XS-W3-08: `create_target_session` e `read_target_session`. Essas duas só disparam para
organizadores herdados do backfill, porque `set_community_organizer` existe no banco e não tem
chamador. O restante de W3 e W4, mais W5-01, W5-02, W6-01 e W6-02 — captura de snapshot incluída —
continua sem caminho. A tabela abaixo diz que essas fatias estão concluídas, e elas estão: o código
existe, é testado e faz o que promete. **Concluída não quer dizer alcançável.**

### Estado das fatias

| Fatia    | Assunto                                            | Estado                             |
| -------- | -------------------------------------------------- | ---------------------------------- |
| XS-W3-01 | Session target root                                | concluída                          |
| XS-W3-02 | Session organizer assignment                       | concluída                          |
| XS-W3-03 | Session courts                                     | concluída                          |
| XS-W3-04 | Session rules snapshot                             | concluída                          |
| XS-W3-05 | SessionParticipant + RosterRevision                | concluída                          |
| XS-W3-06 | Lifecycle/readiness semantic commands              | concluída                          |
| XS-W3-07 | Session cohort cutover                             | concluída                          |
| XS-W4-01 | Registration schema e invariantes                  | concluída                          |
| XS-W4-02 | Open/Close/Lock Registration                       | concluída                          |
| XS-W4-03 | JoinRegistration                                   | concluída                          |
| XS-W4-04 | Leave / promoção / capacidade                      | concluída                          |
| XS-W4-05 | FinalizeSessionRoster                              | concluída                          |
| XS-W4-06 | Legacy Session Registration introduction           | concluída                          |
| XS-W5-01 | Versioned PlayerEvaluation source model            | concluída                          |
| XS-W5-02 | Skill rubric/dimension contract                    | concluída                          |
| XS-W5-03 | CommunityPlayerSkillProfile + editor de avaliação  | concluída                          |
| XS-W5-04 | GlobalPlayerSkillProfile interno sob demanda       | concluída                          |
| XS-W6-01 | Snapshots imutáveis de entrada do balanceador      | concluída                          |
| XS-W6-02 | Porta de formação de times / solver determinístico | concluída                          |
| XS-W3-08 | Session target alcançável pelo cliente (por sync)  | concluída na branch, não integrada |

### O que a XS-W3-08 entregou — Session target alcançável por sync

Branch `exec/c6-w3-08-target-cohort-reachability`, **não integrada em `main`**. Ver o
[spec](docs/superpowers/specs/2026-09-10-xs-w3-08-target-cohort-reachability-design.md), o
[plano](docs/superpowers/plans/2026-09-10-xs-w3-08-target-cohort-reachability.md) e o
[mapa de alcançabilidade re-derivado](docs/architecture/execution/C6-REACHABILITY-MAP.md). Inserida
na sequência C6 porque a cadeia W3 → W6 pressupunha Session target que nada no cliente criava.

- `d4ad525`: `read_target_session` devolve `current_roster_revision_id`
  (`20260909090000_target_session_current_roster_revision.sql`) — a maior `revision_number`, a mesma
  definição de "corrente" que `capture_balance_input_snapshot` usa. O formato de retorno mudou, então
  a migration faz `drop function` antes do `create or replace`; `security definer`, `search_path`
  vazio, autorização e concessões ficaram iguais;
- `139bd51`: `Session.authorityModel?: 'legacy' | 'target'` e `isTargetCohortSession`. Ausência quer
  dizer legada;
- `da7fd16`: o upload não sobe mais a raiz de Session com marcador target;
- `8a4af23`: `syncNow` lê por id, via `read_target_session`, cada Session marcada e mescla o nome
  (até `fe131b0`, também a comunidade — ver a rodada de correção abaixo). Leitura recusada mantém o
  objeto local;
- `04fd199`: `set_community_organizer(community, user, enabled)`
  (`20260910100000_set_community_organizer.sql`) concede e revoga `ORGANIZER` sob
  `community.members.manage`, com revogação suave, espelhando `set_community_evaluator`;
- `fd3f1e2` + `88e3475`: no primeiro upload, uma Session de comunidade com o modelo de avaliação
  ativado chama `create_target_session` no lugar do upsert legado, e o marcador chega pelo payload
  que o sync devolve ao estado React — nunca por escrita direta em `localStorage`. Criação recusada
  **não** cai para o legado: a Session fica pendente e o erro vai para o ledger. Se a consulta de
  ativação falhar, as Sessions de comunidade ainda não sincronizadas são puladas naquela rodada —
  ir para o legado as fixaria para sempre, porque o portão `!cloudId` não reabre e o mesmo id
  colidiria com a PK da linha legada.

**Rodada de correção da review final de branch inteira** (2 críticos e 3 importantes apontados):

- `fe131b0`: o merge da leitura por id preserva o `communityId` local. A leitura devolve o id de
  nuvem da Comunidade, gerado pelo servidor e nunca igual ao id local; sobrescrevê-lo tirava a
  Session de `getCommunitySessions`;
- `25992d4`: a criação target se recupera quando a linha já existe. Observado contra o banco real: um
  segundo `create_target_session` com o mesmo id, pelo mesmo organizador, falha com `23505`
  (`duplicate key value violates unique constraint "sessions_pkey"`) e mantém uma linha — não há
  replay idempotente. Isso acontece quando uma cópia obsoleta de `activeSession` é regravada por cima
  de `sessions` e apaga marcador e `cloudId`, ou quando a resposta se perde depois do commit. Com
  `23505`, o sync lê a Session por id e a adota como target; qualquer outro erro, ou a leitura
  falhando, mantém a Session pendente e reporta, sem cair para o legado. O caso de banco virou teste
  de regressão em `setCommunityOrganizer.dbtest.ts`;
- `95656c2`: só ids UUID vão para `community_evaluation_target_ids`. Um id local de comunidade
  (`community-1700000000000`) fazia a consulta `uuid[]` inteira falhar e pulava toda Session de
  comunidade nova em todo sync; agora a Session dessa comunidade segue o legado, como antes;
- `67ac1af`: excluir uma Session target não chama mais `softDelete`, que a RLS filtrava em silêncio e
  o sync registrava como sucesso; o upload reporta um problema naquela rodada. A Session local continua
  saindo do estado e a linha segue viva no servidor — ver o problema conhecido abaixo. Session legada
  apagada não mudou;
- `d02034c` (re-review, I-1): depois de `23505`, se a leitura por id responde `P0002`, a linha com
  esse id não é target. Como `mapSessionToDb` envia `id: local.id`, é a própria Session legada, que
  perdeu o `cloudId` por uma regravação obsoleta antes de a comunidade ativar o modelo. O sync segue
  o upsert legado em vez de relançar o erro e deixar a Session pendente para sempre; qualquer outro
  erro de leitura continua reportando e deixando a Session pendente.

**O cutover está morto, e por quê.** A primeira versão desta fatia ligava
`transition_legacy_session_to_target` a um botão. Foi implementada, revisada e revertida
(`2fae047` → `a320106`), porque nenhuma Session legada deste app chega a ser elegível: uma Session só
entra em `sessions` via `confirmDivision`, que grava `status: 'teams_generated'` e cria times —
bloqueada por `NOT_DRAFT` e `HAS_TEAM_EVIDENCE`; o rascunho do wizard vive só em `activeSession`,
nunca sobe e não tem `cloudId`, então a inspeção daria `P0002`; e `buildManualSessionDraft`, o único
caminho que produziria um rascunho sem times, não tem chamador. A versão revertida tinha ainda um
defeito de perda de dado verificado: gravava `localStorage` por trás de `useSessions`, que regrava as
duas chaves a partir do estado no próximo clique.

**Fronteiras que esta fatia não cruza:** **não liga captura nem publicação.** Nada chama
`capture_balance_input_snapshot`; a leitura devolve a revisão corrente, mas o merge a descarta de
propósito (uma revisão em cache ficaria velha e a captura a recusaria com `40001`), e uma Session
criada pelo sync nasce sem revisão de elenco. Publicação de candidatos é a XS-W6-03. Nenhuma tela
chama `set_community_organizer`, e `set_community_member_role` continua sem gravar responsabilidade:
**quem for promovido a organizador pelo painel de membros não cria Session target** — só os
organizadores semeados pelo backfill de `20260827150000`. Times e jogos de Session target continuam
no sync genérico. Comunidade não ativada não muda em nada.

**Problema conhecido — `42501` recorrente para quem não é `ORGANIZER`.** Um membro de uma comunidade
ativada que não tem `ORGANIZER` — o que inclui qualquer organizador promovido pela interface depois
do backfill — e cria uma Session localmente recebe `42501` de `create_target_session` a cada sync,
sem nenhuma saída pela interface. Não há perda de dado: a Session continua local e pendente. Mas o
erro volta toda rodada, e isso passa a acontecer no momento em que uma comunidade ativa o modelo de
avaliação.

**Problema conhecido — Session target invisível em outro aparelho.** O download em lote restringe
`sessions` a `authority_model = 'legacy'` (`scopeOperationalFetch`, `operationalCloudService.ts:72`),
e a leitura target só acontece por um `cloudId` que o aparelho já guarda localmente
(`mergeTargetCohortSessionReads`, `syncService.ts:993`). Outro aparelho do mesmo usuário, ou outro
membro da comunidade, nunca vê a Session. Já `teams` e `games` são baixados sem esse filtro
(`operationalCloudService.ts:671-672`), então o que dessas tabelas pertencer à Session target chega
sem a Session-pai. O filtro foi verificado no cliente; a visibilidade dessas linhas pela RLS não foi
re-verificada nesta rodada.

**Problema conhecido — excluir uma Session target não se propaga.** A policy de update de `sessions`
só casa linha legada (`20260827210000_target_session_root.sql:103-114`), e `softDelete` não usa
`.select()` (`operationalCloudService.ts:755-762`): para uma linha target ele mudaria zero linhas, sem
erro, e o sync marcaria um sucesso falso. Desde esta rodada o upload não chama `softDelete` para
Session target apagada e reporta um problema naquela rodada — contexto
`exclusão da sessão "<nome>" no modelo versionado`, mensagem "A exclusão de sessões no modelo
versionado ainda não é enviada para a nuvem.". A Session local é removida, porque o upload devolve
`visible(updatedSessions)`, que descarta registro apagado; a linha continua viva no servidor, e o aviso
aparece uma vez, não a cada sync. Manter a Session pendente exigiria trocar esse filtro, o que muda
também o comportamento legado, e foi descartado. Mapear exclusão para `cancel_target_session`
continua sendo decisão de produto.

**Problema conhecido — promover a organizador pelo app ainda não concede `ORGANIZER`.**
`set_community_organizer` não tem chamador em `src/`, e `set_community_member_role` não grava
`community_responsibilities`. Quem é promovido pelo painel de membros cai no `42501` acima.

### Evidência de verificação da XS-W3-08

**Rodada de correção da review final** — 2026-09-13 sobre `95656c2`, com a árvore limpa fora da
documentação desta etapa: `npm run typecheck` passou; `npm test` **971 unitários + 283 UI**, zero
falhas, em 48 arquivos de UI; suíte completa PostgreSQL **672/672**, exit 0, 277,6 s, no
`volley_test_pg2`; `npm run build` passou; `npx playwright test` **12/12**; `git diff --check` limpo
na árvore de trabalho. `git diff --check 1ec364e..HEAD` acusa "trailing whitespace" nas linhas
novas de `syncService.test.ts`, que é CRLF; com `core.whitespace=cr-at-eol` o resultado é vazio. Nem todo
teste novo falhou antes da correção. Três não falharam:
`Session target duplicada cuja leitura tambem falha fica pendente, reporta e nao cai para o legado`
protege um comportamento que já existia; o caso de banco
`a second create_target_session with the same id by the same organizer raises 23505 and keeps one row`
fixa o comportamento observado; e
`excluir uma Session legada continua chamando softDelete sem reportar problema` (`67ac1af`) protege o
caminho legado. Os demais foram vistos falhando antes da correção. Depois de `67ac1af` (exclusão de Session target, sem
SQL): `npm run typecheck` passou, `npm run test:unit` **973/973** e `npm run test:ui` **283/283**;
suíte de banco e e2e não foram rodadas de novo, e os números acima delas valem para `95656c2`. Depois
de `d02034c` (re-review, sem SQL): `npm run typecheck` passou, `npm run test:unit` **974/974**,
`npm run test:ui` **283/283**, e `git -c core.whitespace=cr-at-eol diff --check 1ec364e..HEAD` limpo.

Rodada original em 2026-09-13 sobre `88e3475`, com a árvore limpa fora da documentação desta etapa.

- `npm run typecheck`: passou, sem erro;
- `npm test`: **968 unitários + 283 UI**, zero falhas, em 48 arquivos de UI;
- suíte completa PostgreSQL (`node scripts/db-harness.mjs`): **671/671**, exit 0, serial, 258,7 s, no
  container preservado `volley_test_pg2` (`127.0.0.1:55500`);
- `npm run build`: passou. `npx playwright test`: **12/12** em chromium;
- `git diff --check`: limpo na árvore de trabalho. `git diff --check 3da6a6f..HEAD` acusa "trailing
  whitespace" no plano da fatia — o arquivo entrou com CRLF em `d391677`; é o `\r`, não espaço, e não
  foi reescrito;
- prova por mutação das cinco guardas, cada uma restaurada com `git checkout` e rodada de novo até
  verde; depois das cinco, `git status` só mostrava documentação. As duas mutações SQL valem de fato:
  o harness reconstrói o schema a partir dos arquivos de `supabase/migrations/` em cada arquivo de
  teste (`src/test/db/harness.ts:89-95`, `rebuildFromMigrations` em `:123`):
  - remover `order by r.revision_number desc` da subconsulta de `read_target_session` →
    `targetSessionCurrentRosterRevision.dbtest.ts`: matou o único teste,
    `read_target_session devolve a revisao corrente de elenco, e ela e a que capture aceita`, **mas na
    asserção 3** (`:192`, a leitura devolveu a primeira revisão), antes de alcançar a concordância com
    a captura (`:197-208`). O teste é load-bearing; a asserção de concordância, isoladamente, não foi
    provada por esta mutação. Restaurado: 1/1;
  - remover o filtro de raiz convertida do upload → `syncService.test.ts`: matou exatamente
    `uploadLocalDataToCloud nao sobe a raiz de uma Session convertida`
    (`['legacy-session', 'target-session']` contra `['legacy-session']`). Restaurado: 46/46;
  - `isTargetCohortSession` devolvendo `true` para marcador ausente (`!== 'legacy'`) →
    `sessionCohortCutover.test.ts`: matou **um** teste, não os dois que o plano previa —
    `uma Session sem marcador continua sendo legada`. `so o marcador target muda a coorte` sobrevive,
    porque só afirma `'target'` → `true` e `'legacy'` → `false`, o que a mutação preserva. Restaurado:
    5/5;
  - `set_community_organizer` sem efeito ao conceder → `setCommunityOrganizer.dbtest.ts`: matou
    exatamente o caso 2, `the owner grants it, and the same create_target_session call now succeeds`
    (`:81`); o caso 3 (revogar → `42501`) passa trivialmente sem concessão. Restaurado: 7/7;
  - o sync caindo para o upsert legado quando `create_target_session` falha →
    `syncService.test.ts`: matou exatamente
    `falha ao criar no modelo target nao cai para o legado em silencio` (1 upsert legado contra 0).
    Restaurado: 46/46;
- ambiente: o Docker Desktop não subia. O backend morria em sockets Unix órfãos de um crash anterior
  (`%LOCALAPPDATA%\Docker\run\sailor-ingest.sock` e
  `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`, "Não é possível o acesso ao arquivo pelo
  sistema"), e cada nova tentativa que falhava deixava outro. Recuperado renomeando os diretórios
  para `*.stuck-<timestamp>`, sem apagar nada; `volley_test_pg2` estava `Exited (255)` e voltou com
  `docker start`. Nenhum mock;
- sem push, merge, aplicação de migration em Supabase remoto ou deploy.

### Branches — cadeia integrada em `main`

**Toda a cadeia C6 até `XS-W6-02` está em `main`.** As fatias até `XS-W4-06`, mais a correção de
cascade de `session_organizer_assignments`, entraram em 2026-09-04; `XS-W5-01` em 2026-09-05. Em
2026-09-08, depois da review independente de branch inteira, entraram de uma vez a `XS-W5-02`, a
`XS-W5-03` com seu complemento de editor/source authority, a `XS-W5-04`, a remediação da auditoria
de segurança e a `XS-W6-01`. Em 2026-09-10 entrou a `XS-W6-02`, também depois de review de branch
inteira e da onda de correção que ela gerou. Os dois merges foram fast-forward — `main` não tinha
andado — e as branches `exec/c6-w5-02-skill-rubric-contract` e `exec/c6-w6-02-team-formation-port`
foram apagadas por já estarem contidas em `main`.

```text
main   ← contém W3-01..W6-02, a correção de cascade e a remediação de segurança
```

Não existe trabalho C6 pendente de integração.

**Integrado não é implantado.** Nada foi enviado para remoto, nenhuma migration foi aplicada em
Supabase remoto e nenhuma imagem foi implantada. Continua valendo o que a seção de segurança
registra: o CSP do `nginx.conf` só passa a valer no próximo deploy, as policies de `storage`
dependem de aplicar a migration no projeto remoto, e o achado **A9 continua aberto**.

**Integrado não é implantado.** Nada foi enviado para remoto, nenhuma migration foi aplicada em
Supabase remoto e nenhuma imagem foi implantada. O CSP do `nginx.conf` só passa a valer no próximo
deploy, e as policies de `storage` dependem de aplicar a migration no projeto remoto. As migrations
novas são seis e aplicam-se na ordem da lista do README.

Ao retomar, confira `git status` e escolha a próxima fatia em
`docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` — a seguinte é a
`XS-W6-02` (porta do solver determinístico). Antes dela, leia o backlog da review independente
logo abaixo: há um achado de segurança **aberto** (A9) e uma decisão de produto pendente (A6).

### O que a wave W3 entregou

- `sessions.authority_model` (`legacy | target`) é o seletor efetivo de autoridade;
- comandos semânticos para criar, agendar, publicar, iniciar, finalizar e cancelar uma Session
  target — nenhuma transição passa por `update` genérico de `status`;
- readiness **derivada**, nunca persistida, revalidada dentro de `StartSession`;
- roster normalizado em revisões imutáveis, com Guest que nunca vira Player global;
- `app_private.command_receipts` — idempotência durável por `command_id` (`ADR-API-006`);
- cutover explícito de uma Session legada elegível por vez, irreversível, com ledger de
  proveniência;
- o sync genérico deixou de baixar, mesclar ou escrever raízes de Session target.

### O que a W4-01 entregou

- `registration_windows` (uma por Session COMMUNITY target, com capacidade e contador FIFO) e
  `registration_entries`;
- `app_private.allocate_registration_slot`, que serializa na linha da Window com
  `select ... for update`, conta os confirmados **depois** do lock e decide a última vaga no
  servidor — sem contagem no cliente;
- posição de fila vinda de `next_queue_sequence`, nunca de timestamp; uma posição nunca é reemitida
  depois de uma desistência;
- no máximo uma inscrição efetiva por Window/Player, com rejoin indo para o fim da fila.

O alocador **não** verifica autorização, elegibilidade, lifecycle da Window nem `closes_at` — isso
pertence a W4-02/W4-03, e W4-06 precisa alocar numa Window que não está `OPEN`.
`registration_entries` não tem nenhum grant de browser, preservando `OPEN-REG-003`.

Dois pontos para as próximas fatias: o alocador não tem parâmetro `p_joined_at` (`joined_at` usa
`now()`), então W4-06 não consegue preservar o timestamp original de inscrição por esse caminho —
decida a assinatura antes de W4-06; e nada impede W4-02 de reduzir `capacity` abaixo do total já
confirmado.

### O que a W4-02 entregou

- `create_registration_window`, `open_registration`, `close_registration` e `lock_registration`
  como comandos semânticos; a máquina `DRAFT → OPEN → CLOSED → LOCKED` é estritamente sequencial e
  a tabela de transições vive em uma única função;
- nenhum papel de browser consegue mudar `registration_windows.status` por UPDATE — o exit gate foi
  verificado enumerando grants, policies, todos os `SECURITY DEFINER` que escrevem `status`,
  triggers e o `USAGE` do schema `app_private`;
- idempotência dupla: o receipt cobre o retry do mesmo `command_id`, e o no-op de estado-alvo cobre
  dois `command_id` diferentes em duplo clique;
- os quatro comandos exigem a Session em `DRAFT` ou `SCHEDULED`, e nunca escrevem
  `sessions.revision` — a Window é aggregate root própria.

**Três avisos para as próximas fatias** (levantados na revisão final):

1. **W4-05** precisa travar `sessions FOR UPDATE` **antes** de `registration_windows FOR UPDATE`.
   Nada no código força isso e nenhum teste cobre, porque só existe um comando que trava as duas.
   Inverter dá deadlock no primeiro par concorrente com `close`/`lock_registration`.
2. ~~**W4-03** não pode reusar a autorização desta fatia~~ — **atendido**. `join_registration`
   autoriza por membership ativa, não por `assert_target_session_write_authorized`, e compara
   `now()` com `closes_at` (`REG-INV-018`). `closes_at` continua inerte fora desse comando: nada
   fecha uma Window automaticamente, e `add_registration_entry` aceita depois do prazo de propósito.
   Se a W4-04 introduzir fechamento automático, essa assimetria muda de sentido.
3. **W4-06**: a tabela de transições é indexada só por `(from, to)`, não por qual comando pode
   executar o par. Acrescentar `CLOSED → OPEN` para reopen ensinaria `open_registration` a reabrir
   junto. Existe teste que falha alto nessa hora — leia como sinal de design, não como teste a
   atualizar.

### O que a W4-03 entregou

- `join_registration` (membro entra por conta própria) e `add_registration_entry` (Organizer
  inscreve um Player que pode não ter conta nenhuma); os dois delegam capacidade e FIFO inteiros ao
  alocador da W4-01;
- o cliente **nunca** nomeia um Player no auto-cadastro: `join_registration` não tem parâmetro de
  Player e resolve a identidade por `current_user_active_player_id()`, sem fallback
  (`REG-INV-004`/`REG-INV-005`). A revisão final enumerou nove caminhos — assinatura, resolução,
  fallback, determinismo do `limit 1`, grants que poderiam forjar um link `ACTIVE`, `auth.uid()`,
  redirecionamento cross-Community, alcance direto do alocador e o caminho do Organizer — e nenhum
  permite inscrever outra pessoa;
- assimetria deliberada de elegibilidade: auto-cadastro exige membership + link `ACTIVE` + relação
  viva de roster; o Organizer exige só a relação viva, que é justamente o caso de uso;
- os dois comandos exigem **também** que a linha de `players` esteja viva (`deleted_at is null` e
  `active`), não só a relação — sem isso um Player com soft-delete consumiria vaga e apareceria no
  roster que a W4-05 materializa;
- o retorno expõe apenas `entry_status` e `window_revision`; nada de `queue_sequence`, contagem ou
  id de player, e `registration_entries` continua sem grant de browser.

**Um vazamento conhecido, deliberadamente adiado:** `registration_windows` tem `select` para
membros ativos, e a coluna `next_queue_sequence` deixa um membro **derivar** a própria posição na
fila lendo a linha antes de entrar. A garantia por-linha continua de pé, mas a agregada não.
Fechar isso (restringir a coluna no grant, ou mover para um espelho privado) pertence à fatia que
resolver `OPEN-REG-003` — está registrado para ser decidido, não descoberto.

**Três avisos para a W4-04/W4-05:**

1. `ChangeRegistrationCapacity` precisa **decidir** `expected_revision` explicitamente em vez de
   herdar o molde da W4-02. A revisão da Window sobe a cada inscrição, então um Organizer segurando
   uma revisão da carga da tela levaria `40001` por causa da inscrição de terceiros — foi
   exatamente o argumento que a W4-03 usou para não pedir `expected_revision`.
2. `Leave` e a promoção precisam manter **Session antes de Window**. A promoção quer naturalmente
   partir de `registration_entries`; se travar a Window (ou uma entry) antes da Session, dá deadlock
   contra todos os comandos desta cadeia.
3. A ausência de buracos na fila é propriedade **pré-promoção**. Assim que a promoção mudar um
   `WAITLISTED` para `CONFIRMED`, a lista de espera deixa de ser `1..N` e a asserção do teste de
   rajada precisa de outro invariante (estritamente crescente, sem repetição) — ninguém deve
   "consertar" renumerando.

E para a W4-05: sem nenhum grant em `registration_entries`, `FinalizeSessionRoster` **tem** que ler
a fila dentro de uma função `SECURITY DEFINER`. Essa é a forma certa e é também o ponto exato onde
um `select` de conveniência fecharia `OPEN-REG-003` sem ninguém decidir.

### O que a W4-04 entregou

- `leave_registration` (o membro sai sozinho), `remove_registration_entry` (o Organizer remove
  alguém) e `change_registration_capacity`, mais **um** promotor interno
  `app_private.promote_waitlist_to_capacity` compartilhado pelos três gatilhos que o N2.05 §10 lista;
- o promotor preenche **todas** as vagas livres em ordem de `queue_sequence`: depois de um Leave
  existe exatamente uma, depois de um aumento de 12 para 15 existem três — `REG-INV-016` sai como
  consequência do algoritmo, não como um segundo caminho de código;
- **uma revisão por comando, nunca uma por promoção.** Um aumento de capacidade que promove três
  pessoas ainda é um único bump. É por isso que o promotor não reusa `allocate_registration_slot`,
  que insere linha e bumpa sozinho;
- `OPEN-REG-002` resolvido para o caminho de promoção: o candidato inelegível vira `REMOVED` com
  `removal_reason = 'INELIGIBLE_AT_PROMOTION'` e a fila **continua** andando. O custo está registrado
  na spec — uma inelegibilidade transitória custa a posição em definitivo, e `RestoreRegistrationEntry`
  é o caminho auditado de volta;
- a revalidação é **por `source` da entry**: `SELF_JOIN` exige membership ativa + link `ACTIVE` +
  standing vivo de roster; qualquer outra origem exige só o standing. Uma regra uniforme tornaria o
  Player sem conta que a W4-03 existe para atender permanentemente impromovível;
- redução de capacidade abaixo do confirmado é recusada sem escolher vítimas (`REG-INV-017`), e
  nenhum comando desta fatia rebaixa um `CONFIRMED`.

**Uma assimetria deliberada:** `leave_registration` exige link `ACTIVE` e uma entry efetiva, mas
**não** exige membership ativa — sair é a única ação de Registration estritamente de-escalatória, e
exigir membership deixaria encalhada a entry de quem saiu da Community até o promotor transformar um
`WITHDRAWN` voluntário num `REMOVED` administrativo, destruindo a distinção que `REG-INV-012` existe
para preservar. A revisão final atacou a assimetria por sete caminhos e nenhum permite afetar a entry
de outra pessoa. A spec enumera as três exposições residuais, todas exigindo um UUID inadivinhável.

**Invariante que a revisão final descobriu e que a spec agora nomeia:** depois de todo comando
mutante, ou `confirmed = capacity`, ou não existe nenhuma entry `WAITLISTED`. O guard
`if v_entry.status = 'CONFIRMED'` nos dois call sites do promotor depende dela — quem quebrar a
invariante precisa saber o que mais quebra junto.

**Dois avisos para a W4-05:**

1. **Nada revalida uma entry já `CONFIRMED`.** O promotor revalida apenas quem está na fila, e nenhum
   comando de W4-01..04 rebaixa ou remove um `CONFIRMED`. Um Player confirmado antes de a linha de
   `players` sofrer soft-delete, de a relação de roster ser desativada ou de o link ser revogado
   continua `CONFIRMED` para sempre — e um `FinalizeSessionRoster` que materialize o conjunto
   `CONFIRMED` literalmente vai colocá-lo no roster. Decida explicitamente: revalidar no finalize
   usando `registration_entry_still_eligible`, que já é privada e ciente de `source`, ou aceitar e
   documentar.
2. **Boa notícia sobre `expected_revision`:** `revision` fica provadamente congelada depois de
   `LOCKED` — todo caminho que poderia bumpá-la ou exige `OPEN` ou levanta `23514` em `LOCKED`, e o
   no-op de capacidade não bumpa. Um token capturado depois do LOCK não envelhece por atividade de
   Registration, que é exatamente o que `REG-INV-021` precisa.

E mantenha **Session antes de Window**: nove comandos passarão a travar as duas linhas, e uma única
inversão dá deadlock no primeiro par concorrente.

### O que a W4-05 entregou

- `finalize_session_roster` só materializa o roster quando a Registration Window já está `LOCKED`;
  ele rejeita a finalização vazia e, na primeira materialização, revalida cada entry `CONFIRMED` —
  uma única entry inelegível rejeita o comando inteiro;
- a revisão de roster guarda a proveniência exata da revisão de Registration e a ordem determinística
  inclui somente os confirmados;
- o mesmo `command_id` retorna o receipt persistido, enquanto comandos distintos convergem para a
  mesma revisão imutável sem materializar outro roster;
- a função preserva a ordem global de locks: Session antes de Window;
- `registration_entries` continua sem grant de browser; a leitura necessária para a materialização
  permanece dentro do comando `SECURITY DEFINER`.

A próxima fronteira é `XS-W4-06 — Legacy Session Registration introduction`. O reopen de uma
Registration continua deliberadamente adiado em `OPEN-REG-006`; esta fatia não entrega UI,
Realtime nem implantação em produção.

### Evidência de verificação da W4-05

- `npm run typecheck` passou; o ESLint focado em
  `src/test/db/registrationFinalize.dbtest.ts` passou com zero erro e zero aviso depois da remoção
  de duas atribuições inúteis, sem alterar suas transições aguardadas;
- `npm test` passou: 920 testes unitários e 245 testes de UI, sem falhas. `npm run test:db` passou
  contra `volley_test_pg2` em `127.0.0.1:55500`: 547 testes, zero falhas. O primeiro disparo foi
  interrompido porque o Docker Desktop estava indisponível (`ECONNREFUSED`); o rerun completo é a
  evidência válida;
- `npm run build` passou. `git diff --check` não encontrou erro de espaço em branco;
- os gates globais continuam com dívida fora desta fatia: `npm run lint:eslint` reporta 10 erros e
  315 avisos preexistentes. `npm run format:check` ainda reporta arquivos preexistentes. A checagem
  focada de Prettier passou para README, HANDOFF, spec, plano, teste e migration SQL.

Duas melhorias menores de teste continuam diferidas no ledger: a asserção de `rowCount` no drift e
o diagnóstico da matriz. Elas não fazem parte desta fatia.

### O que a W4-06 entregou

- `introduce_registration_from_legacy_roster` materializa uma Registration target inteira a partir
  da revisão de roster do cutover — **a revisão de roster é a única fonte**; nenhum artefato de
  Registration nasce de outro lugar;
- a Window nasce `DRAFT`, com `revision = 1`; toda entry migrada entra `CONFIRMED` sem posição de
  fila (`queue_sequence` nulo), então o primeiro join genuíno depois da introdução recebe a
  sequência 1 — a fila do legado nunca é fabricada retroativamente;
- a capacidade é explícita no comando e recusa encolher a Registration abaixo do roster já
  migrado: pedir capacidade menor que o confirmado é `23514`, não uma escolha silenciosa de
  vítimas;
- um único membro inelegível recusa a introdução inteira e não escreve nada — nem Window, nem
  entries, nem ledger;
- `app_private.registration_introductions` é o ledger de proveniência da introdução, imutável por
  trigger, com a única exceção nomeada (`introduced_by_user_id ... on delete set null`) que
  sobrevive à cascata de `auth.users`;
- o predicado "standing vivo" de roster foi fatorado para
  `app_private.registration_player_standing_alive(community_id, player_id)`, privado e
  compartilhado; `app_private.registration_entry_still_eligible` passa a **delegar** a ele em vez
  de duplicar a regra;
- o comando **não** recebe um token de fingerprint do chamador. A garantia de que a fonte não mudou
  entre a inspeção e a transição vem de dentro do banco: uma revisão de roster superada
  (`LEGACY_ROSTER_SUPERSEDED`) bloqueia tanto `inspect_registration_introduction` quanto
  `introduce_registration_from_legacy_roster` com `23514`, então não existe janela para inspecionar
  uma fonte e transicionar outra.

**Dois avisos para a W5-01 e o que vier depois:**

1. `registration_entry_still_eligible` agora delega inteiramente a
   `registration_player_standing_alive`. Uma mudança nas regras de standing tem exatamente uma casa
   — quem alterar o predicado compartilhado altera os dois caminhos de uma vez, e quem duplicar a
   regra em outro lugar reintroduz a divergência que esta fatia fechou.
2. `LEGACY_ROSTER_EMPTY` e `ROSTER_ENTRY_NOT_PLAYER` são blockers inalcançáveis pelo cutover de hoje
   — existem como defesa em profundidade. No dia em que o cutover aprender a carregar Guests, esses
   dois blockers passam a ser alcançáveis de verdade; até lá são código morto propositalmente
   mantido.

A próxima fronteira é `XS-W5-01 — Versioned PlayerEvaluation source model`.

### Evidência de verificação da W4-06

- `npm run typecheck` passou sem saída;
- `npm test` passou: 920 testes unitários e 245 testes de UI (45 arquivos de teste), sem falhas;
- `npm run test:db` passou contra `volley_test_pg2` em `127.0.0.1:55500`: 566 testes, zero falhas;
- `npm run build` passou;
- o ESLint focado em `src/test/db/registrationIntroduction.dbtest.ts` passou com zero erro e zero
  aviso; a checagem focada de Prettier passou para `registrationIntroduction.dbtest.ts`, README e
  HANDOFF;
- `git diff main...HEAD --name-only` só lista migration, suíte nova, spec, plano, README e HANDOFF
  (mais os artefatos já pendentes de integração da W4-05, porque `main` ainda não absorveu a cadeia
  local). `git diff --check` não encontrou erro de espaço em branco.

Antes do Passo 1 desta fatia, a suíte de regressão dobrada de uma tarefa anterior também rodou —
`registrationSchema`, `registrationLifecycle`, `registrationJoin`, `registrationLeave`,
`registrationFinalize` e `sessionCohortCutover`, com `--test-concurrency=1` — e passou: 227 testes,
zero falhas, sem editar nenhuma dessas suítes.

### O que a W5-01 entregou

- a responsabilidade `EVALUATOR` em `community_responsibilities` deriva a capacidade
  `player.evaluate` em `community_capabilities`, sempre por concessão explícita e por pessoa —
  `GINV-CAP-002` proíbe qualquer rank de governança conferir essa capacidade, então nem `owner` nem
  `admin` avaliam sem a concessão explícita. A derivação também exige membership `ACTIVE`, a mesma
  forma que o ramo de `session.manage` já usava;
- `player_evaluation_contributions` é append-only: reavaliar não sobrescreve, supersede a linha
  anterior. Um índice único parcial em `(community_id, player_id, evaluator_user_id)` com
  `superseded_at is null` é quem garante uma única contribuição efetiva por avaliador, Player e
  Community — uma constraint, não uma convenção;
- os escores de dimensão são linhas em `player_evaluation_dimension_scores`, não um JSON: uma
  dimensão omitida é a ausência da linha, não um zero. É a regra "missing ≠ 0" do N2.02 §7 virando
  estrutural em vez de convencional;
- o avaliador vem de `auth.uid()` dentro do comando; `record_player_evaluation` não tem parâmetro
  de avaliador, e um teste fixa a lista exata de argumentos para que qualquer parâmetro novo falhe;
- o comando supersede antes de inserir, dentro de uma única transação, sob o lock da linha de
  `players` — a mesma linha que duas submissões concorrentes disputam. Por isso
  `superseded_by_id` tem que ser `deferrable initially deferred`: a UPDATE que supersede nomeia a
  linha nova antes dela existir, e nenhuma outra ordem resolve isso — um índice único parcial nunca
  pode ser uma constraint deferrable, e um CHECK não pode ser deferred de jeito nenhum;
- `rubric_version` é texto deliberadamente opaco, sem foreign key: `OPEN-BAL-001` continua aberta e
  o contrato de rubric pertence à `XS-W5-02`.

**Um aviso já nasce nesta fatia:** ela entrega **escritas sem consumidor**. A agregação continua
sendo a média após filtragem de extremos por mediana/MAD no cliente, em
`src/logic/playerEvaluations.ts`, lendo as linhas legadas — um
avaliador usando o comando novo não muda perfil nenhum nem nada visível no app.

**Quatro avisos para a `XS-W5-02` e o que vier depois:**

1. `public.player_evaluations` ainda carrega `unique (owner_id, player_id)`. Um avaliador ativo em
   duas Communities continua colidindo ali; aposentar essa autoridade pertence à migração de coorte.
2. `app_private.registration_player_standing_alive` ganhou uma segunda chamadora fora de
   Registration, e o nome dela já não corresponde ao uso. A fatia que precisar de uma terceira
   chamadora é quem deve renomear.
3. `player_evaluation_contributions` referencia Community e Player com `on delete restrict`, então
   apagar qualquer um dos dois falha enquanto existirem contribuições — deliberado; a decisão de
   retenção pertence à fatia que definir a retenção de avaliações.
4. Uma vez que a exclusão de conta anonimiza `evaluator_user_id` para `NULL`, aquela contribuição
   fica efetiva para sempre e nunca bloqueia um avaliador novo, porque o índice único parcial trata
   `NULL` como valores distintos. E nada estruturalmente amarra `player_id` a `community_id` — o
   comando garante isso por procedimento, via `registration_player_standing_alive`.

A próxima fronteira é `XS-W5-02 — Skill rubric/dimension contract`.

### Evidência de verificação da W5-01

- `npm run typecheck` passou sem saída;
- `npm test` passou: 920 testes unitários e 245 testes de UI (45 arquivos de teste), sem falhas;
- `npm run test:db` passou contra `volley_test_pg2` em `127.0.0.1:55500`: 589 testes, zero falhas —
  inclui as asserções de `playerEvaluationContributions.dbtest.ts` sobre `player.evaluate`
  (capacidade por pessoa nunca por rank, membership `ACTIVE` obrigatória, uma contribuição efetiva
  por avaliador/Player/Community, anonimização em vez de bloqueio, supersede-then-insert, dois
  submits concorrentes encadeando em vez de colidir, e a superfície de avaliação legada intocada);
- `npm run build` passou;
- o ESLint focado em `src/test/db/playerEvaluationContributions.dbtest.ts` passou com zero erro e
  zero aviso; a checagem focada de Prettier passou para
  `playerEvaluationContributions.dbtest.ts`, README e HANDOFF;
- `git diff main...HEAD --name-only` lista só a migration, a suíte nova, a spec, o plano, README e
  HANDOFF. `git diff --check` não encontrou erro de espaço em branco.

### O que a W5-02 entregou

- `skill_rubric_versions` e `skill_rubric_dimensions` registram somente `v0-legacy-11`, experimental,
  com as onze dimensões do cliente, todas opcionais, e proveniência explícita;
- cada escore carrega `rubric_version`; foreign keys compostas o vinculam tanto à versão da
  contribuição quanto à dimensão registrada, sem depender só da validação do comando;
- `record_player_evaluation` recusa versão desconhecida, dimensão não declarada e dimensão
  obrigatória ausente. Preserva autorização, locks, replay, normalização da versão e precedência
  dos erros de payload existentes;
- `skill_rubric_dimensions_for` consulta dimensões por versão como `SECURITY INVOKER`; o contrato é
  legível por `authenticated`, mas os dados de avaliação continuam sem grants de navegador;
- a migration `20260906130635_skill_rubric_contract.sql` recusa explicitamente avaliações existentes.
  Essa precondição evita atribuição retroativa de significado; uma implantação com dados de origem
  exige uma migração histórica desenhada separadamente;
- o design corrigiu a promessa inexequível de testes anteriores intactos: fixtures de inserção
  direta agora usam a versão registrada e a coluna nova; a dimensão que tentava nomear avaliador
  é recusada. As garantias de autorização, histórico, concorrência e reset foram preservadas.

Esta etapa continua sem consumidor no app. `OPEN-BAL-001` e `OPEN-RATING-001` permanecem abertas;
a fronteira seguinte é W5-03, com o julgamento de escopo abaixo antes de detalhar a implementação.

### O que a W5-03 entregou

- RPC `get_community_player_skill_profile` calcula o perfil por Community/Player/rubric com fontes
  vigentes; leitura exige `player.evaluate` e standing vivo, sem acesso bruto às avaliações;
- por escolha explícita do usuário, mantém média filtrada por mediana/MAD do legado: abaixo de quatro
  notas não filtra; limiar `max(1.75, MAD * 2.5)`; média arredondada a uma casa; ausência continua null;
- política `v0-legacy-mad-mean` experimental, contagens por dimensão, revisão determinística das
  fontes e instante de consulta. A leitura não altera fontes, histórico ou receipts;
- painel no editor de atleta com identidade cloud e comunidades vinculadas: seleção e consulta
  explícitas, erros em português, descarte de respostas atrasadas ao trocar contexto;
- a [decisão de cálculo sob demanda](docs/architecture/adr/2026-09-06-community-skill-profile-on-demand.md)
  substitui explicitamente o gate de perfil armazenado da W5-03. Não há tabela/cache/job adicional.

**Fronteira do produto:** esta fatia integra a leitura sob demanda. O complemento seguinte conectou o
editor online à origem versionada, mas somente após ativação e concessão explícitas por comunidade;
o perfil ainda é experimental e o balanceador não o consome. Não interpretar o painel como cutover
global nem avançar automaticamente para um perfil global sem revisar a utilidade dessa etapa.
`OPEN-RATING-001` e `OPEN-BAL-001` seguem abertas.

### O que o complemento do editor entregou

- ativação explícita por comunidade em `app_private.community_evaluation_cutovers`, sem importação
  retroativa das notas antigas;
- `activate_community_evaluation_model`, `set_community_evaluator` e `get_community_evaluation_editor`
  mantêm gestão, capacidade e leitura de notas próprias separadas;
- `record_community_player_evaluation` valida a versão, usa o comando versionado existente e compara
  a contribuição esperada para rejeitar edição concorrente;
- após ativação, um trigger impede INSERT/UPDATE no `player_evaluations` legado. DELETE continua
  disponível para limpeza/anonymização existente;
- editor online com campos esparsos, zero válido, retry do mesmo comando, conflito com recarga e
  controles explícitos para ativação/avaliadores. O cadastro de atleta cloud não simula consenso nem
  enfileira avaliação legada;
- o perfil e o sorteio ainda não foram promovidos a autoridade global. A próxima etapa deve medir
  adoção/latência e desenhar snapshots antes do cutover do balanceador.
- o sincronizador legado consulta os IDs de coortes target em lote antes de deduplicar conflitos;
  respostas malformadas e falhas inesperadas interrompem a escrita, enquanto somente RPC ausente
  mantém compatibilidade com deployments antigos. Um upsert individual de coorte target é recusado.

### Evidência de verificação do complemento do editor

- typecheck, testes focados do editor/perfil e sincronização, suíte completa do aplicativo (929
  unitários e 279 de UI) e build passaram;
- ESLint focado passou sem erros; os avisos restantes nos arquivos tocados pertencem às regras já
  existentes. A suíte DB focada passou com 12/12 casos;
- a suíte DB completa foi executada serialmente após a migration, com 623/623 testes aprovados no
  PostgreSQL descartável `volley_test_pg2`;
- agentes independentes atingiram o limite de uso antes da entrega; a revisão independente da W5-03
  foi aplicada anteriormente. Neste complemento, root revisou a migration, o fluxo de retry e os limites de
  autoridade manualmente. Nenhuma aplicação remota, commit, merge ou deploy foi feita.
- o editor fecha quando a comunidade selecionada deixa de estar vinculada ao atleta; respostas
  assíncronas antigas não reabrem o contexto. O teste cobre a remoção dinâmica do vínculo.

**Fronteira do produto:** a avaliação agora pode alimentar a origem versionada somente depois de uma
ativação e concessão explícitas. Comunidades ainda legadas continuam no fluxo antigo; não há conversão
automática. A leitura de perfil permanece experimental e o balanceador segue usando sua autoridade
atual.

### O que a W5-04 entregou — projeção global interna

- `app_private.compute_global_player_skill_profile` calcula por Player/rubric, agrupando primeiro
  as avaliações vigentes por comunidade e depois os valores comunitários por fundamento;
- peso igual por comunidade com valor disponível, política experimental `v0-equal-community-mean`.
  Dez avaliadores numa comunidade não dão a ela dez vezes mais peso; ausência continua null;
- a média filtrada escolhida pelo usuário continua dentro de cada comunidade. Seu cálculo foi
  extraído sem alteração para um helper privado compartilhado pelo RPC existente e pelo global;
- fontes ordenadas e revisão determinística incluem as duas políticas e as revisões comunitárias.
  Nova avaliação com a mesma nota muda a proveniência; timestamp de consulta não muda a revisão;
- ambas as funções internas são SECURITY INVOKER e inacessíveis aos papéis de navegador. O RPC
  público comunitário preserva os controles de autenticação, capacidade e vínculo vivo;
- a projeção shadow reconstrói fontes versionadas retidas. Revogação de capacidade ou perda de
  vínculo atual não é tratada como exclusão retroativa de uma avaliação aceita;
- reutiliza índices existentes; não adiciona tabela de projeção, fila ou job. Decisão registrada
  em [perfil global interno sob demanda](docs/architecture/adr/2026-09-08-global-skill-profile-internal-on-demand.md).

**Próxima fronteira:** W5-05 prepara a comparação shadow e a troca da fonte consumida pelo resolver;
W6-01 materializa snapshots autorizados por revisão do elenco. O gate de W5-05 depende desse
consumidor: não marcá-lo concluído apenas porque as consultas de perfil passaram nos testes.
Visibilidade global, política de dados ausentes do sorteio e snapshots persistentes não são
concedidos por esta função privada. OPEN-RATING-001/002 e OPEN-BAL-001 continuam abertos.

### Evidência de verificação da W5-04

- suíte completa PostgreSQL: **629/629**, execução serial no container descartável
  `volley_test_pg2`, porta 55500. Inclui seis casos globais, seis comunitários, 12 do editor e 13
  da rubric; a execução inicial foi recuperada após reiniciar o Docker;
- corrigido o teste histórico da W5-02: reconstruir o estado anterior exclui a migration da rubric
  e todas as posteriores, preservando a verificação de recusa atômica com dados antigos;
- `npm test`: **929 unitários + 279 UI**; typecheck e build passaram. O primeiro run de aplicativo
  falhou no ambiente sandbox antes dos testes; a reexecução autorizada passou sem alteração de código;
- ESLint das duas suítes DB alteradas: zero erros/avisos. Prettier focado, referências arquiteturais
  e `git diff --check` passaram. Gates globais de lint/format mantêm o baseline preexistente descrito
  na W5-03; não foram declarados verdes por essas verificações focadas;
- revisão independente do SQL, cobertura e correção do teste histórico: sem achados acionáveis.
  Comparação direta confirmou cálculo comunitário idêntico após renomear parâmetro local;
- evidências em `.superpowers/sdd/2026-09-08-xs-w5-04-global-skill-profile/`. Sem commit, merge,
  migrations remotas ou deploy; a função global segue interna, sem alteração visual nesta fatia.

### O que a W6-01 entregou — entradas congeladas do balanceador

Primeira fatia em que a cadeia avaliação → perfil → sorteio produz um artefato que o sorteio pode
consumir. Até aqui tudo era calculado sob demanda, o que é certo para consultar um perfil e errado
para formar times: a formação precisa continuar explicável depois que as origens mudarem.

- `public.capture_balance_input_snapshot(command_id, session_id, roster_revision_id)` congela uma
  revisão exata do elenco de uma Session target COMMUNITY em `DRAFT` ou `SCHEDULED`;
  `public.read_balance_input_snapshot(snapshot_id)` devolve o mesmo formato. As duas são
  `security definer` com `search_path` vazio, concedidas só a `authenticated`, e exigem o organizador
  designado — cargo de governança ou responsabilidade `EVALUATOR` **não** dão acesso à formação;
- o comando aceita **apenas identificadores**. O navegador nunca envia vetor de atributo: quem
  resolve os valores é o servidor, a partir do perfil global privado da W5-04, que continua sendo a
  única origem de avaliação. Atributo legado, autoavaliação, Overall, forma, estatística e nota de
  exibição não entram no vetor;
- **política de ausência escolhida pelo usuário**, versionada como `v0-global-roster-mean-5`:
  dimensão que o elenco avaliado nunca observou recebe a média do próprio elenco; sem nenhuma
  observação, 5. Zero observado participa da média como zero. Estimativa não entra na média e nunca
  sobrescreve valor observado, e cada dimensão estimada aparece em `estimated_dimensions`;
- Guest joga mas não contribui para a média de referência, e não tem perfil nem metadado físico;
- comunidade de origem que ainda não ativou o modelo novo **interrompe** a captura. Origem em sombra
  não é promovida a entrada confiável nem descartada em silêncio;
- uma única instrução SQL resolve elegibilidade, perfis, metadados e ativação. Em `READ COMMITTED`,
  duas instruções veriam dois instantes diferentes, e o vetor de um participante poderia nascer de um
  estado que nunca coexistiu com o do participante seguinte;
- `input_fingerprint` é md5 de um JSON determinístico sem id, sem carimbo de hora e sem ator: a
  mesma entrada lógica capturada duas vezes tem a mesma impressão digital, e uma revisão de origem
  nova a muda mesmo com a nota idêntica. A proveniência privada guarda revisões e valores crus, sem
  identidade de avaliador e sem `player_id` global;
- `app_private.balance_input_snapshots` tem RLS, nenhuma concessão de navegador e um gatilho que
  recusa UPDATE e DELETE com 55000. A única transição aceita é `created_by → null`, que o apagamento
  de conta provoca — um snapshot reescrevível não provaria nada sobre a formação passada;
- captura e recibo entram na mesma transação; comando recusado não deixa nenhum dos dois. Replay do
  mesmo `command_id` devolve o snapshot congelado; reusar o comando para outro elenco é 23505.

**Fronteiras que esta fatia não cruza:** o sorteio legado continua no caminho anterior, a publicação
de candidatos não foi integrada e a troca ampla de origem da W5-05 **não** está feita. O snapshot
devolvido continua amarrado ao elenco original — publicar candidatos exige revalidar elenco e
configuração atuais por conta própria. Não há nenhuma mudança de interface nesta fatia.

### Evidência de verificação da W6-01

- suíte focada `src/test/db/balanceInputSnapshots.dbtest.ts`: **17/17**, no container preservado
  `volley_test_pg2`, `127.0.0.1:55500`;
- suíte completa PostgreSQL: **658/658**, exit 0, execução serial (641 anteriores + 17 novos);
- `npm run typecheck`, `npm run build`: passaram. `npm test`: **935 unitários + 279 UI** em 48
  arquivos, zero falhas. ESLint e Prettier dos arquivos novos: zero erros e zero avisos;
- **a primeira asserção foi escrita antes do RPC existir e falhou com 42883**, como o plano exigia.
  As demais foram escritas depois da implementação, então três guardas menos óbvias foram provadas
  por mutação dirigida: remover a recusa de comunidade em sombra, remover a recusa de revisão antiga
  e afrouxar o gatilho de imutabilidade. Cada mutação matou exatamente um teste, e só um;
- um defeito real apareceu no fixture, não no código: `session_participants` tem índice único por
  `(session_id, player_id)`, então uma revisão nova do mesmo elenco precisa **reaproveitar** o
  participante — que é o que `finalize_session_roster` faz em produção;
- a transição `created_by → null` é exercitada diretamente, e não por `delete from auth.users`, que
  ainda esbarra na guarda do Player canônico (dívida anterior, fixada em
  `authCascadeSafety.dbtest.ts`). Quando ela cair, é este `set null` que a FK vai disparar;
- sem commit remoto, merge, aplicação de migration em Supabase remoto ou deploy.

### O que a W6-02 entregou — porta de formação de times

Integrada em `main` em 2026-09-10 por fast-forward, depois da review de branch inteira.
Dá ao motor de balanceamento já existente um contrato versionado, sem tocar no que qualquer
usuário vê. Ver o plano em
[`2026-09-09-xs-w6-02-team-formation-port-design.md`](docs/superpowers/specs/2026-09-09-xs-w6-02-team-formation-port-design.md)
e a decisão de escopo em
[`C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`](docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md#xs-w6-02--teamformationrequest--deterministic-solver-port).

- `TeamFormationRequest` (`src/shared/types/teamFormation.ts`) é o contrato normalizado que a porta
  aceita: versão de contrato, versão de algoritmo, participantes ordenados, número de times,
  restrições obrigatórias, política de objetivo, orçamento explícito de busca, semente e
  proveniência (`LOCAL` ou `AUTHORIZED_SNAPSHOT`);
- duas adaptações (`src/application/teamFormationAdapters.ts`) traduzem para esse contrato: uma a
  partir do snapshot local de hoje, outra a partir do snapshot autorizado da W6-01 — que usa chaves
  de rubrica em português e precisa virar os campos em inglês que o solver já espera;
- canonicalização pura, impressão digital FNV-1a e precheck de viabilidade vivem em
  `src/domain/teamFormation.ts`, sem nenhuma dependência de infraestrutura — por isso o Worker
  consegue importar essas funções sem carregar nada além delas;
- o precheck recusa **só contradição mecânica** no próprio pedido: elenco vazio, `teamCount < 1`,
  menos participantes que times, a mesma dupla marcada para jogar junta e separada, uma dupla de
  `pairsTogether` apontando para um participante fora da lista, ou um índice fixo — de um
  participante que **está** na lista — fora do intervalo de times. Um id órfão em `pairsSeparated`
  ou em `lockedPlayerIdxs` passa direto para o motor, que já trata esse caso corretamente (ver a
  review abaixo — a primeira versão recusava esses dois também, e isso era um bug). Ele nunca recusa
  por dificuldade — decidir se uma combinação satisfatível mas exigente deveria ser recusada é
  política de produto, ainda em aberto;
- o motor ganhou um sexto parâmetro (`budget`) em `balanceSnapshots`, e `deriveFormationBudget`
  calcula `seeds`/`maxIterations` com a fórmula que já existia a partir de `balanceSpeed` e do
  tamanho do elenco — a única mudança é que o orçamento agora está explícito no pedido, em vez de
  escondido dentro do motor;
- os dois pontos de chamada existentes — o Worker de `useSessionWizard` e o caminho direto de
  `sessionLifecycleUseCases` — passam a rotear pela porta (`src/application/teamFormationPort.ts`),
  produzindo as mesmas opções de antes. `src/logic/balancer.worker.ts` foi reescrito para chamar a
  porta em vez de `balanceSnapshots` direto.

**Fronteiras que esta fatia não cruza:** nenhuma troca de origem (o assistente de sessão ainda não
consome o snapshot autorizado — isso é o gate da W5-05), nenhuma publicação de candidatos, nenhuma
votação, nenhuma mudança de interface, nenhuma restrição obrigatória nova.

**Fatos que só apareceram na execução, não estavam no plano:**

- o motor **já era determinístico antes desta fatia** — `createSeededRandom` com semente de
  `config.balanceSeed`, orçamento por contagem de iterações, `Date.now()` só preenchendo o
  `runtimeMillis` relatado. Esta fatia deu um contrato ao motor; não o tornou determinístico;
- o plano original previa uma guarda de versão de algoritmo comparando `algorithmVersion` contra a string `algorithm` que o motor relata — esse campo guarda `'Simulated Annealing (Smart Balance Engine)'`, uma string de exibição, então a comparação como descrita era inimplementável. A primeira versão implementada comparou, em vez disso, contra a constante exportada `BALANCE_ALGORITHM_VERSION` e recusava quando divergiam. **Essa guarda não existe mais** — foi removida na review independente descrita abaixo, por comparar a constante contra ela mesma e não conseguir falhar sem um chamador escrito à mão. Não confundir com a W6-01: lá a guarda nunca existiu no plano; aqui ela existiu, foi implementada e depois removida;
- o gate de paridade prova o **caminho de código** do Worker — contrato, serialização, roteamento —
  invocando o handler do próprio módulo do Worker com um `self` simulado. jsdom não tem `Worker`
  real, então isso não prova paridade com um Worker de navegador de verdade.

### Evidência de verificação da W6-02

Números da primeira implementação, antes da review de branch inteira e da onda de correção
descritas logo abaixo. Os números finais, depois da correção, estão no fim daquela seção.

- `npm run typecheck`: passou, sem saída;
- `npm test`: **952 unitários + 282 UI**, zero falhas, em 48 arquivos de UI;
- `npm run build`: passou, `vite build` concluído sem erro;
- `npx eslint` nos 16 arquivos criados/modificados pela fatia: **0 erros, 2 avisos** (`any` em dois
  pontos de `src/logic/balancing.test.ts`, do mesmo tipo que já compõe a linha de base de ~347
  avisos do repositório);
- `npx prettier --check` nos mesmos 16 arquivos: todos conformes;
- `git diff --check`: limpo;
- prova por mutação das três guardas novas, cada uma restaurada e confirmada com `git diff` limpo
  depois:
  - remover a exclusão de `runtimeMillis` em `canonicalizeCandidates` e rodar
    `src/domain/teamFormation.test.ts`: **matou dois testes**, não um —
    `a impressao digital ignora runtimeMillis` e `a projecao canonica nao carrega runtimeMillis`.
    Achado a registrar: a exclusão de `runtimeMillis` está coberta por duas asserções
    independentes, não por uma guarda única;
  - fazer `solveTeamFormationDirect` ignorar a recusa do precheck e rodar
    `src/application/teamFormationPort.test.ts`: matou exatamente um teste,
    `o precheck recusa antes de qualquer busca`, que passou a lançar
    `InfeasibleConstraintsError` em vez de devolver uma recusa limpa;
  - fazer o Worker chamar `balanceSnapshots` direto de novo e rodar o teste de paridade em
    `teamFormationPort.test.ts`: matou exatamente um teste, `o driver direto e o codigo do worker
concordam na impressao digital` (`'' !== '01c903bf'`);
- sem commit remoto, merge em `main`, aplicação de migration ou deploy — esta fatia não toca SQL.

### Review independente da W6-02 e onda de correção — 2026-09-10

Uma review independente percorreu a branch `exec/c6-w6-02-team-formation-port` inteira antes da
integração e encontrou uma regressão real de comportamento, além de limpezas. Corrigido nos commits
`471e81b`, `396fc47`, `6247b9d`, `636bdec`, `984572e` e `6d23152` — nenhum deles tocou documentação,
por isso o texto acima e o spec da fatia precisaram de correção separada.

- **Regressão real: o precheck recusava um pedido que o motor já satisfazia.** A primeira versão
  recusava qualquer id de `hardConstraints` ausente de `participants` — as três variantes da
  restrição, não só `pairsTogether`. O motor tolera deliberadamente um id órfão nas outras duas:
  `buildInitialSolution` protege a colocação com `if (athlete)`, a penalidade de trava e
  `isFeasible` pulam uma trava cujo id não resolve (`currentIdx === -1`), e uma dupla
  `pairsSeparated` com um membro ausente está vacuamente satisfeita — não há ninguém para colocar
  junto, então a restrição não pode ser violada. Só `pairsTogether` não tem essa saída: nomeia duas
  pessoas que precisam ficar no mesmo time, e se uma delas não está jogando, nenhuma atribuição
  satisfaz. O assistente de sessão alcança esse estado exatamente quando alguém trava um atleta,
  volta um passo no assistente e o desmarca — a trava fica órfã, e a primeira versão do precheck
  recusava a geração de times até a trava ser removida manualmente, mesmo que o motor conseguisse
  formar times perfeitamente bem ignorando-a. A review pegou isso antes da integração. Corrigido em
  `471e81b`, restringindo a recusa por restrição órfã ao caso `pairsTogether`;
- **A guarda de versão de algoritmo foi removida, não afrouxada.** Ela comparava
  `algorithmVersion` contra a constante `BALANCE_ALGORITHM_VERSION` — mas as duas adaptações já
  escrevem essa mesma constante no pedido antes de ele existir, e a porta é a única chamadora de
  produção de ambas, então a comparação verificava a constante contra ela mesma: não havia como
  fazê-la falhar sem escrever um chamador só para provar isso. Removida em `6247b9d`; não existe
  mais o código de recusa `ALGORITHM_VERSION_MISMATCH`. `algorithmVersion` continua sendo um campo do
  pedido e continua entrando na impressão digital como proveniência, mas nada o valida em tempo de
  execução hoje;
- **Uma recusa do precheck agora chega ao usuário no caminho síncrono.** Antes, uma recusa nesse
  caminho devolvia `null` e deixava o assistente "gerando" para sempre, sem nenhuma mensagem.
  Corrigido em `396fc47`: o caminho síncrono reseta o estado de geração e mostra a mesma mensagem
  pt-BR que o caminho do Worker já mostrava; o Worker por sua vez passou a repassar o código da
  própria recusa em vez de agrupar toda recusa em `INFEASIBLE_CONSTRAINTS`;
- duas limpezas adicionais, sem mudança de comportamento visível: a adaptação do snapshot autorizado
  agora lança um erro explícito em vez de produzir `NaN` quando falta uma dimensão de rubrica, e
  rejeita um `gender` que não seja `'M'`, `'F'` ou nulo em vez de aceitá-lo sem checar (`984572e`); e
  `canonicalizeRequest` passou a ordenar as chaves do objeto recursivamente, então o mesmo pedido com
  `lockedPlayerIdxs` montado em ordem diferente — o que acontece na prática, porque essa estrutura é
  montada por spreads sucessivos na ordem de clique do usuário — gera a mesma impressão digital
  (`6d23152`).

**Números finais dos gates, depois da onda de correção:** `npm run typecheck` limpo, sem saída;
`npm test`: **957 unitários + 283 UI**, zero falhas, em 48 arquivos de UI; `npm run build` limpo.

### Backlog da review independente de branch — 2026-09-08

Três revisores independentes percorreram a branch inteira antes da integração: a W6-01, a
remediação de segurança e a cadeia W5 como integração. O que foi corrigido está nos commits
`efab989`, `eecf192` e `5899651`. O que **não** foi corrigido está aqui, para não se perder.

**Da cadeia W5 — costuras entre fatias:**

- **`PGRST202` confunde "servidor antigo" com "cache de schema do PostgREST desatualizado".**
  `playerEvaluationCloudService` trata os dois como "nenhuma coorte migrada" e sobe avaliação
  legada; numa comunidade já ativada o gatilho recusa, e o lote inteiro morre com um `23514` opaco,
  levando junto toda linha legítima. Falha fechada, mas a mensagem não ajuda ninguém.
- **`record_player_evaluation` continua chamável direto para coorte ativada.** A checagem de
  concorrência otimista (`p_expected_contribution_id` → `40001`) só existe em
  `record_community_player_evaluation`. Um avaliador só consegue superseder a própria contribuição,
  então o alcance é limitado — mas a proteção contra escrita perdida que o editor anuncia é
  conselho, não garantia. Nenhum dbtest cobre.
- **A ativação não conta as próprias consequências.** É um cutover irreversível, de comunidade
  inteira, atrás de uma caixa de seleção alcançável só por atleta → comunidade → "Avaliar atleta".
  Não diz que é irreversível, que as avaliações legadas ficam imutáveis, que avaliações não
  sincronizadas de outros clientes serão descartadas, nem que quem ativou ainda precisa se conceder
  `EVALUATOR` antes de avaliar. Pertence às configurações da comunidade, não à tela de um atleta.
- **Vocabulário de dimensão duplicado em quatro lugares** — banco, use case, editor e painel — e
  `skill_rubric_dimensions_for`, criada exatamente para isso, não tem nenhum consumidor no cliente.
- **Duas camadas de comando coexistem.** `src/application/command/*` existe para comando semântico
  com recibo; a fatia do editor reimplementou envelope, retry e classificação à mão. A próxima
  fatia vai derivar tudo pela terceira vez.
- **Dois modelos de filiação decidem o mesmo dado.** `get_community_evaluation_editor` expõe
  `profiles.email` atrás de `community_memberships`, enquanto a RLS de `profiles` usa
  `community_members`. Se divergirem, o RPC revela e-mail que a RLS negaria.

**Da W6-01:** um organizador designado sem `player.evaluate` em lugar nenhum passa a obter, pela
média do elenco, valores derivados de avaliações de comunidades onde não tem vínculo. O payload não
nomeia comunidade, então é divulgação de valor derivado — e parece ser escolha deliberada do
desenho, não defeito. Vale decidir explicitamente antes que a publicação de candidatos torne esses
vetores visíveis na interface.

### Auditoria de segurança de 2026-09-08 — remediação na mesma branch

**Não é uma fatia C6.** É um trabalho transversal que entrou no meio da execução da W5 e vive no
mesmo diretório de trabalho, ainda sem commit. O laudo está em
`docs/security-audit/relatorio-auditoria-seguranca.pdf`, gerado por `gerar_relatorio.py` (o `.venv`
do gerador é ignorado pelo git e pelo ESLint desde esta passagem). Dez achados, todos remediados:

- **A1–A3 (alta)** — `regenerate_career_events_for_sessions`, `recalculate_player_career` e
  `regenerate_player_milestones` eram `security definer` concedidas a `authenticated` **sem
  verificação de autorização nenhuma**: o alvo vinha inteiro do parâmetro. Como `career_events` só
  recebe `grant select`, essas RPCs devolviam ao cliente a escrita que o schema negava. A correção é
  **revogar o grant, não adicionar guarda de `auth.uid()`**: `recalculate_player_career` é chamada
  por `handle_new_user()`, onde ainda não existe sessão e `auth.uid()` é NULL — uma guarda por
  identidade quebraria o cadastro com claim code;
- **A4 (média)** — `reset_product_data` recebia uma conta alvo e apagava as tabelas inteiras em
  dezesseis dos dezoito DELETE. Agora o raio é o que a assinatura promete; os filhos com
  `on delete restrict` saem antes, escopados à mão, e o Player canônico da conta é preservado;
- **A5 (média)** — causa raiz: `20260801120000` recriou `log_table_changes()` sem repetir
  `security definer` (que não é herdado), o trigger virou invoker e bateu no RLS; três semanas
  depois `20260820110000` destravou isso com `with check (true)`, abrindo a trilha de auditoria para
  qualquer conta gravar linha arbitrária atribuída a terceiros. Restaurar o definer torna a policy
  desnecessária, e ela foi removida junto com o `insert` a `authenticated`;
- **A6/A7 (baixa)** — `find_player_by_username` devolvia o nome real de qualquer atleta a qualquer
  conta; agora `name` volta NULL fora de comunidade compartilhada ou administração, e a checagem de
  username livre segue funcionando porque depende da presença da linha. `community_capabilities`
  deixou de ser sondável para usuário arbitrário — o único chamador é `security definer` e nunca
  precisou do grant;
- **A8 (baixa)** — o INSERT de `community_rules`, `whatsapp_list_templates`, `community_players`,
  `community_presence` e `whatsapp_list_drafts`
  exigia papel atual **e** posse; UPDATE/DELETE aceitavam qualquer um dos dois, e como `owner_id`
  guarda quem criou, o ramo de posse ficava verdadeiro para sempre. Alinhados ao INSERT.
  **Consequência deliberada:** ex-organizador perde a escrita sobre linhas que criou, inclusive pelo
  caminho de sync. As duas últimas entraram depois da review independente: têm a mesma forma e
  `community_id not null`, então o ramo de posse não sustentava nenhuma linha pessoal. `games`,
  `teams`, `point_events`, `game_reports` e `session_reports` repetem a forma com `community_id`
  **nulável** e ficam de fora de propósito — ali o ramo de posse sustenta a linha pessoal;
- **A9 (baixa)** — **NÃO fechado, apesar da correção.** A policy de leitura não declarava `to` e
  valia para `anon` sobre o bucket inteiro, e as novas policies corrigem isso — mas o bucket
  `avatars` é criado com `public = true`, e bucket público é servido por
  `/storage/v1/object/public/...` **sem avaliar policy de `storage.objects`**. O app grava em
  `proposals/<player_id>/` e publica com `getPublicUrl`; aprovar só copia a mesma URL para
  `players.avatar_url`, sem mover arquivo. Quem souber o caminho continua lendo proposta não
  aprovada. O que as policies fecham é a API autenticada e a listagem. Fechar de verdade exige
  bucket privado com URL assinada, ou cópia para um prefixo realmente público na aprovação —
  ver `docs/architecture/contexts/N2.11-media.md`, que já descrevia a lacuna;
- **A10 (baixa)** — não havia CSP nenhum e o `X-XSS-Protection` do `nginx.conf` é obsoleto. A
  auditoria **não encontrou sink de XSS no código**: o CSP é contenção contra regressão futura e
  dependência comprometida. Cada diretiva está comentada no arquivo com o que a exige (Turnstile,
  Supabase/realtime, `blob:` do worker do balanceador) para ninguém afrouxá-la no escuro.

Duas decisões de escopo que ficam registradas por serem contraintuitivas: o endurecimento de
`search_path` só aconteceu nas funções que a migration já precisava tocar por outro motivo
(`ADR-SEC-003`, harden by touched surface — C6.01 proíbe a migration única de reescrita), e por isso
`C6-W0-04-SECURITY-HARDENING-BACKLOG.md` caiu de 44 para 42 funções pendentes; e `schema.sql`
recebeu as definições corrigidas de `reset_product_data` e `log_table_changes` — idênticas às da
migration — mais a remoção da policy permissiva, para que uma base nova não nasça vulnerável antes
de aplicar o histórico.

**`find_player_by_username` é a exceção deliberada:** no `schema.sql` ela continua na versão antiga,
porque a definição endurecida consulta `community_memberships`, tabela que só nasce em
`20260827140000` e que o snapshot nem cria. Como a função é `language sql`, o Postgres valida o
corpo na criação e o snapshot deixaria de subir. Quem provisiona aplica `schema.sql` e **depois** as
migrations (ver README), então quem manda no banco resultante é `20260908160000`. Isso está fixado
em `src/infra/supabase/schema.test.ts`, com o comentário explicando por quê — não "conserte" essa
divergência sem ler o teste.

**O que continua aberto** — levantado pela review independente desta remediação, em 2026-09-08:

1. **A9 não está fechado** (acima). É o único achado cuja correção não alcança o caminho que o app
   realmente usa. O laudo em PDF foi regerado depois da review e já diz isso — nove de dez
   corrigidos, com A9 aberto e o motivo.
2. **A6 é contornável.** `create_community_with_owner` é concedida a `authenticated` e insere quem
   chama como `owner` — então qualquer conta cria uma comunidade descartável e volta a ler o nome
   real de qualquer atleta por username exato. Pior: o ramo de administração lê
   `community_memberships`, enquanto o resto da pilha (`current_user_has_community_role`,
   `current_user_can_access_player`) lê `community_members`, e os RPCs de adicionar membro ainda
   escrevem só na tabela antiga. Admin adicionado pelo caminho normal recebe `name: null` na busca
   de vínculo. `playerCloudService` ainda tipa `name: string`, o que passou a ser mentira.
3. **`reset_product_data` continua sem funcionar ponta a ponta.** O escopo da conta está correto,
   mas `sessions` tem seis filhos com `on delete restrict` que o reset não apaga, `players` tem
   mais três, e `guard_target_community_writes` recusa apagar qualquer comunidade `target` — isto
   é, toda comunidade criada pelo produto atual. A migration corrige o raio de alcance, não a
   completude, e o comentário dela agora diz isso.
4. **O teste negativo de A5 não é sustentador neste harness.** A concessão de INSERT em
   `modification_logs` a `authenticated` vem das default privileges da plataforma Supabase, que o
   harness não emula — a asserção já passaria antes da correção. O teste positivo (o gatilho voltou
   a gravar como definer) é o que realmente sustenta.
5. **`connect-src` do Turnstile não foi verificado** contra um projeto real. Uma regressão de CSP
   aí mata o login em silêncio: faça um teste manual do container antes de implantar.
6. **`index.html` embute um script de ferramenta local** (`localhost:8400/live.js`) que entra no
   build. O CSP novo passa a bloqueá-lo, mas ele não deveria estar num build de produção.

A remediação está em `main` desde 2026-09-08, mas **não** foi aplicada em Supabase remoto nem
implantada — o CSP do `nginx.conf` só passa a valer no próximo deploy da imagem, e as policies de
`storage` dependem de aplicar a migration no projeto remoto.

### Evidência de verificação da remediação de segurança — 2026-09-08

Rodado nesta passagem, com a branch inteira no diretório de trabalho:

- `src/test/db/securityAuditRemediation.dbtest.ts`: **12/12**. Cada achado tem par de casos — a via
  de ataque passa a ser negada **e** o fluxo legítimo que dependia daquela superfície continua
  funcionando (cadastro recalcula carreira, username disponível, wrapper de capability do usuário
  corrente, avatar aprovado público). Um `revoke` que fecha o furo e quebra o cadastro seria troca
  de defeito, não correção;
- `npm run test:db` completo: **641/641**, exit 0, execução serial no container preservado
  `volley_test_pg2`, `127.0.0.1:55500` (629 anteriores + 12 novos);
- `npm run typecheck`: passou; `npm test`: **929 unitários + 279 UI** em 48 arquivos, zero falhas;
  `npm run build`: passou;
- ESLint e Prettier focados nos arquivos alterados por este trabalho: zero erros e zero avisos;
  `git diff --check` limpo. Os gates globais mantêm o baseline preexistente descrito na W5-03 —
  não foram declarados verdes por estas verificações focadas;
- o teste de baseline `schemaSecurityBaseline.ts` foi atualizado junto, removendo
  `find_player_by_username` e `reset_product_data` da lista de `search_path = public` pendente.

### Evidência de verificação da W5-03

- `npm run typecheck` e `npm run build`: passaram;
- `npm test`: 925 testes unitários e 254 testes de UI em 46 arquivos, zero falhas;
- `npm run test:db`: 611 testes, zero falhas, no PostgreSQL descartável preservado
  `volley_test_pg2`, `127.0.0.1:55500`; inclui seis casos da nova consulta;
- ESLint focado: zero erros e seis avisos preexistentes no PlayerEditView. Prettier dos arquivos
  alterados cobertos pelo gate passou. Documentos novos também foram formatados;
- gates globais continuam vermelhos: 9.336 erros/315 avisos de ESLint e 18 arquivos de formatação,
  nas pendências preexistentes descritas abaixo. Os arquivos temporários de inspeção foram removidos;
- inspeção do componente real com fixture interceptada no Playwright/Edge: desktop 1280px e celular
  390px, sem transbordamento da página ou erros de execução. Não é validação E2E com Supabase;
- revisão independente não encontrou bloqueios. Identificou consulta automática ao remover e
  reintroduzir a comunidade selecionada; teste reproduziu o problema e passou após limpar o contexto;
- índice parcial existente começa por Community/Player e os escores têm chave por contribuição;
  não foi adicionado índice redundante. Latência sob carga representativa ainda não foi medida;
- evidências locais em `.superpowers/sdd/2026-09-06-xs-w5-03-community-skill-profile/`;
  `git diff --check` passou. Sem commit, merge, aplicação remota de migrations ou deploy.

### Evidência de verificação da W5-02

- typecheck passou após as alterações de código;
- `npm test`: 920 testes unitários e 245 testes de UI em 45 arquivos, zero falhas;
- `npm run test:db`: **605 testes**, zero falhas, no container preservado `volley_test_pg2`,
  `127.0.0.1:55500`; inclui 13 casos novos e os 24 da W5-01;
- `npm run build` passou;
- ESLint focado nas duas suítes alteradas passou; Prettier dos arquivos alterados suportados passou;
- os gates globais de ESLint e formatação ainda falham em arquivos não alterados: ESLint encontrou
  9.336 erros e 315 avisos, incluindo ferramentas locais e sete arquivos rastreados preexistentes
  (`e2e/fixtures/auth.ts`, `eslint.config.mjs`, `scripts/check-architecture-r10.mjs`,
  `src/app/routes/sessionRoutes.tsx`, `src/components/account/AccountSyncView.tsx`,
  `src/logic/syncIssueLedger.ts`, `src/ui/StarRating.tsx`); Prettier apontou 18 arquivos preexistentes.
  Isso é dívida real dos gates globais, não uma validação global verde;
- revisão independente aprovada. A única melhoria de teste apontada foi aplicada e revisada:
  contar receipts por avaliador para detectar registros indevidos de comandos rejeitados;
- `git diff --check` passou. Nenhuma migration anterior nem arquivo do cliente foi alterado.

### Julgamento histórico após W5-02 — 2026-09-06

Este registro explica a direção proposta antes da W5-03. A decisão de cálculo sob demanda e a
escolha explícita da média filtrada foram posteriormente implementadas na W5-03, descrita acima.

O objetivo é permitir reunir participantes, controlar vagas, formar times explicáveis, operar a
partida com confiança e preservar o histórico coletivo, mantendo simples a pelada avulsa. O guia é
`docs/architecture/contexts/N2.01-product-experience.md`; a sequência C6 é um meio para isso.

**Manter a W5-02:** versões e dimensões registradas resolvem um problema concreto: hoje o comando
da W5-01 aceita vocabulário arbitrário. As duas tabelas pequenas e as foreign keys impedem que um
escore seja associado ao significado de outra versão. Trocar isso por convenções no TypeScript ou
validação apenas na UI perderia a garantia justamente no lugar em que os dados são compartilhados.
Não há necessidade de editor de rubrics, motor genérico de formulários ou novas abstrações aqui.

**Recomendar um próximo incremento utilizável:** a busca no código confirmou que o app ainda não
consome `record_player_evaluation` nem as novas tabelas de origem; o serviço de avaliações continua
usando o legado. Em vez de prolongar entregas isoladas de infraestrutura, o próximo design deve
amarrar avaliação autorizada → perfil da Community legível → entrada versionada para os times,
com uma demonstração e testes do fluxo. A ativação precisa definir uma única autoridade de escrita
por coorte; conectar a UI não autoriza escrever simultaneamente no legado e no modelo novo.

**Questionar materialização antecipada:** W5-03 pede comparar reconstrução com projeção armazenada.
Antes de criar atualização assíncrona, cache persistido ou controle adicional de invalidação,
avaliar uma consulta/cálculo sob demanda com versão da política, origem e cobertura explícitas.
Persistir o snapshot consumido pelo sorteio continua sendo uma necessidade distinta. Sem medidas
de carga/latência, não há evidência nesta revisão de que perfis pré-calculados compensem seu custo.
Essa é uma recomendação para revisar o design/exit gate da W5-03, não uma mudança silenciosa da
arquitetura canônica nem uma implementação já realizada.

**Não copiar o agregador legado sem revisão:** ele usa média após filtragem por mediana/MAD, e
`clampAttribute` converte valores não finitos em 5. Isso não satisfaz automaticamente a semântica
de dimensão ausente do modelo novo. A política de agregação continua em `OPEN-RATING-001`; uma
política experimental deve ser nomeada e testada antes de virar comportamento oficial.

O resumo `PRODUCT.md` ainda descreve avaliações oficiais por owner/admin e o modo sem conta como
entrada/fallback. O target N2.01 e a W5-01 separam governança da capacidade operacional e tratam
Quick Session como jornada legítima própria. Esses trechos históricos não devem dirigir novos
atalhos de autorização ou restrições ao uso casual.

### Decisões em aberto que a W3 preservou

`OPEN-SES-002` (unpublish), `OPEN-SES-004` (roster pós-início), `OPEN-COM-005` (takeover
administrativo), `OPEN-API-002` (retenção de command receipts), `OPEN-MIG-005..007` (coortes
legadas mais ricas) e `OPEN-REG-001..006` (superfície de leitura da fila, entre outras) continuam
**abertas**. Nenhuma foi fechada implicitamente — ver a seção
"Non-goals" de cada design em `docs/superpowers/specs/`.

### Dívida conhecida ao retomar

- `softDelete('sessions')` é um `update` genérico sem `.select().single()`: o RLS filtra a linha
  target em silêncio, sem erro classificado. É o único caminho de escrita de raiz que a
  classificação nova não cobre.
- Filhos de Session target (teams/games) ainda passam pelo sync genérico; só a raiz está cercada.
  A autoridade deles pertence a W6/W7.
- ~~Uma Session target retida localmente falha o upload genérico a cada sync, indefinidamente.~~
  Fechada pela XS-W3-08 (`da7fd16`) para Session com marcador local `authorityModel: 'target'`: o
  upload pula a raiz.
- **Problema conhecido (XS-W3-08):** membro de comunidade ativada sem `ORGANIZER` que cria Session
  localmente recebe `42501` de `create_target_session` a cada sync, sem saída pela interface. Sem
  perda de dado — a Session fica pendente. Ver a seção da XS-W3-08 acima.
- **Defeito pré-existente encontrado pela W4-06 — corrigido, mas só em parte da superfície.**
  `session_organizer_assignments` referencia a conta que morre por dois caminhos: direto via
  `organizer_user_id` e indireto via `profiles` → `community_memberships`. Num único
  `delete from auth.users` as duas ações `SET NULL` atingem a mesma linha, e a segunda escreve a
  partir de uma pré-imagem que ressuscita o id de filiação que a primeira nulou — `23503` em
  `session_organizer_assignments_community_membership_id_fkey`. O estado final da linha sempre foi
  correto, então `20260904204951_session_organizer_assignment_cascade.sql` torna essa FK
  `deferrable initially deferred` e o workaround saiu do teste desta fatia.
  **O que continua aberto:** a mesma forma existe em outras cinco tabelas, e `modification_logs`
  está **provada** colidindo do mesmo jeito — ou seja, apagar uma conta ainda não funciona ponta a
  ponta, e quem construir o Unlink de `N2.16`/`XS-W2-01` terá de lidar com ela. A lista medida está
  fixada em `src/test/db/authCascadeSafety.dbtest.ts`; deleção de conta segue bloqueada antes disso
  pela guarda do Player canônico, o que mantém tudo isso latente.
- **As checagens de valor único do ledger de introdução são decisões, não defaults.**
  `registration_introductions` fixa `initial_window_status = 'DRAFT'`,
  `initial_window_revision = 1` e `queue_chronology = 'UNKNOWN'` via `check`. Uma fatia futura que
  queira introduzir uma Window já `OPEN`, ou uma cronologia de fila realmente comprovada, precisa
  alargar essas constraints deliberadamente — não são um artefato incidental da implementação atual.

### Ambiente obrigatório da suíte de banco

`npm run test:db` exige PostgreSQL real (`QA-INV-003/004`) e **nunca** usa mock:

```text
container  volley_test_pg2  →  127.0.0.1:55500
VOLLEY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55500/postgres'
```

**A porta mudou em 2026-09-01.** O Windows passou a reservar o intervalo 55362-55461 depois de um
reboot, então `volley_test_pg` não consegue mais publicar a 55432 — o PostgreSQL dentro dele está
íntegro, só o bind falha (`netsh interface ipv4 show excludedportrange protocol=tcp` mostra o
intervalo). Em vez de destruir o container que este arquivo mandava preservar, subimos um segundo,
`volley_test_pg2`, numa porta livre. Nada de valor vive no volume: `rebuildFromMigrations` reconstrói
o schema do zero a cada execução.

Preservar os containers entre sessões; não derrubar. Se quiser voltar à porta antiga, libere o
intervalo reservado antes.

### Ruído conhecido dos gates globais

`npm run lint:eslint` e `npm run format:check` falham no repositório inteiro por causa de
diretórios não rastreados (`.agent/`, `.claude/`, `.gemini/`, `.github/skills/`) e do worktree
irmão `.worktrees/`. **Não são da sua branch.** Para provar que uma branch está limpa, mostre que
`git diff <base>...HEAD --name-only` não contém nenhum caminho reportado, e rode
`npx eslint`/`npx prettier --check` apenas nos arquivos alterados. Nunca rode `prettier --write`
no repositório inteiro.

---

# Histórico — Plano 5 / Fase 3 (concluída em 2026-08-12)

> Tudo abaixo desta linha descreve o **Plano 5**, já concluído. Fica preservado porque a auditoria
> de produto das seções 4–13 continua sendo o registro mais completo das superfícies do app, e a
> §13.1 documenta por que cada branch antigo foi descartado. **Não é a ordem de trabalho atual** —
> essa está na seção 0 acima, e os caminhos de workspace/branch citados abaixo estão obsoletos.

## 1. Objetivo em andamento

- Produto: app React + Vite local-first para vôlei amador, com sync opcional via Supabase.
- Prioridade atual do framework: Produto Escalável, depois Experiência.
- Foco imediato: Plano 5 — **Fase 3 (Nova Navegação)**. As duas pré-condições estão satisfeitas:

  1. **Gate 0 — integridade e estado canônico** (PR #21, mergeado em 2026-08-11). Fechou os três
     P0 da auditoria: sync apagando registros locais, atletas descartados pelo balanceador
     (causa real: `genero: null`) e estado operacional contraditório. Entregou
     `src/domain/sessionPhase.ts`, a fonte única que a nova navegação deve ler.
     Spec e plano em `docs/superpowers/`.
  2. **Spike A1 — `SessionContext` na raiz** (PR #20, este branch). Sem ele a árvore remonta ao
     navegar por rotas URL e a sessão ativa se perde. Detalhe na seção Pós-Spike A1 abaixo.

- **A spec de design da Fase 3 está pronta**, em
  `docs/superpowers/specs/2026-08-06-plano-5-fase-3-nova-navegacao-revisao-design.md`: árvore de
  rotas, mapeamento Modules→rotas, estratégia de migração (router-in-parallel + cutover único) e
  as mudanças no input do `ScreenContract` (`setPage` → `navigate`). Ela responde ao
  `impeccable critique` de 2026-08-05 (24/40, 3 P0s) e substitui a §6 da spec de julho onde
  conflitar. **Próximo passo é `superpowers:writing-plans`, não novo brainstorming.**

- Fase 2 (Screen Contracts) concluída em 2026-08-04; Fase 1 (reset + cutover) em 2026-08-03.

### Agenda — decidido em 2026-08-11: `/agenda` global

Num brainstorming de 2026-08-11, a Agenda chegou a ser discutida como "primeiro bloco do Início,
sem item próprio na sidebar". **Essa direção foi descartada.** Vale a spec da Fase 3: `/agenda`
como **rota global**.

O argumento contra a rota global era que um item de sidebar chamado Agenda apontando para `/`
competiria com Início no mesmo destino. Isso valia para a spec de julho, em que Agenda não tinha
rota própria — a spec revisada resolve dando a ela `/agenda` de verdade, e a competição deixa de
existir.

Além disso, a §12 da spec base (`2026-07-22-scalable-product-restructure-design.md`, linha 289)
lista Agenda entre as quatro áreas globais aprovadas — Início, Comunidades, Agenda, Meu perfil.
Rebaixá-la foi justamente o P0-1 da crítica de 2026-08-05. **Não reabrir sem decisão explícita de
produto.**

## Pós-Spike A1 (Plano 5 — gate de infra da Fase 3)

Pré-requisito da Fase 3 (Nova Navegação) satisfeito em **2026-08-05**. O estado da sessão
ativa (`activeSession`/`games`/`pointEvents`/`gameReports`/`teams`/`sessions`/`sessionReports`)
vivia em `useSessions()` chamado no `App.tsx` (ho local do shell). Hoje `App.tsx` nunca
desmonta (`AppRouter` é `/*` catch-all), então o state sobrevive; mas na Fase 3 (rotas URL
react-router v7) a árvore remonta ao navegar e perderia placar/sorteio/heartbeat sem um
contexto acima de `<App/>`.

- **Spike A1 (escopo completo, escolhido pelo usuário):** extrai `SessionContext` que detém o
  state de `useSessions()` e o eleva à raiz (`main.tsx`), acima de `<AppRouter/>`. Padrão
  espelhado em Toast (PR #16): Context + hook consumer no mesmo `use*.ts`, Provider one-liner
  que injeta o store externo — sem reimplementar `useSessions` (já persiste/normaliza/limpa
  órfãos/propaga knockout).
- **Arquivos:** `src/ui/common/useSession.ts` (Context + `SessionContextValue` + `useSession()`
  com guard PT-BR), `src/ui/common/SessionProvider.tsx` (Provider one-liner),
  `src/main.tsx` (`<SessionProvider>` dentro de `<ToastProvider>` envolvendo `<AppRouter/>`),
  `src/App.tsx` (`useSessions()` → `useSession()`, nome `sess` preservado, ~120 refs intocadas),
  `src/app/AppRouter.spec.tsx` (harness envolve `<AppRouter/>` em `<SessionProvider>`).
- **Gate de infra Fase 2 intacto:** views e o novo contexto não importam `@storage`/`@infra`.
- **Verificação:** `lint` (tsc --noEmit) + `test:unit` (699) + `test:ui` (136) + `build` verdes.
- **Prova do gate A1:** Provider acima de `<App/>` detém o state — desmontar/remontar `<App/>`
  (rotas URL Fase 3, StrictMode double-mount, HMR) não destrói a sessão ativa.
- **Não toca em rotas URL (Fase 3);** views continuam via `ScreenContract` (Fase 2 preservada).
  `useCloudSync` sem redesign: `CloudSyncDeps` inalterada, só a origem dos setters.
- **Estado:** spike A1 fechado. O `impeccable critique` exigido pelo §6.9 foi rodado em
  2026-08-05 (24/40) e respondido pela spec da Fase 3.

> Os números de verificação acima (`test:unit` 699 / `test:ui` 136) são do momento do spike, em
> 2026-08-05. Depois do Gate 0 a suíte está em 734 / 139.

## 1.1 Auditoria do produto — concluída

A Fase 3 estava condicionada a uma auditoria visual e funcional completa do produto, incluindo as
superfícies internas de sessão e de torneio — estados que só aparecem depois de iniciar partidas,
registrar pontos e concluir fixtures.

**Essa auditoria foi concluída** (seções 8 e 9 desta página: 18/18 e 20/21, com o único item
faltante não aplicável ao formato usado). Os bloqueadores que ela levantou estão fechados pelo
Gate 0. O que ela deixou aberto e ainda não é da Fase 3 está registrado em
`.impeccable/audit/2026-08-09-full-product/pass-c/report.md`.

## 2. Estado do repositório

- Workspace: `C:\Users\Matheus Silva\antigravity\Volley`
- Branch de trabalho: `worktree-plano-5-fase-3-navegacao`
- `main` em `98d712a` (spike A1, PR #20), logo após `f2ce974` (Gate 0, PR #21).
- Servidor local: **parado**; porta 3000 livre.
- Fase 1 do Plano 5: reset/cutover concluído em 2026-08-03.
- Fase 2 do Plano 5: 9/9 telas migradas para `ScreenContract<Model, Intent>` e gate fechado.
- Gate 0 (integridade e estado canônico): concluído em 2026-08-11.
- Spike A1 (`SessionContext` na raiz): concluído e mergeado.
- Fase 3: **concluída** (cutover na Task 10). Plano de implementação em
  `docs/superpowers/plans/2026-08-12-plano-5-fase-3-nova-navegacao.md` (10 tarefas,
  execução subagent-driven; progresso em `.superpowers/sdd/progress.md`).
- `src/App.tsx` foi **removido**: não existem mais `activeModule`, `page` nem
  `renderActiveContent()`. O shell é `src/app/AppShell.tsx` e a navegação é por rotas URL
  (`src/app/AppRouter.tsx` + `src/app/routes/`), sem feature flag.
- **Nenhum PR aberto.** #19 foi fechado sem merge em 2026-08-11 (duplicata: seu conteúdo já
  estava em `main` via #18 e #20, e as linhas exclusivas dele eram código pré-Gate-0 que o merge
  teria revertido).

### Registro histórico — a janela de router-in-parallel fechou

Da Task 1 à Task 9 a Fase 3 rodou em router-in-parallel: o `AppRouter`/`App.tsx` antigo servia
produção enquanto o `AppRouterV7`/`AppShell.tsx` novo crescia atrás da flag (`VITE_NAV_V3` ou
`?nav=v3`), com as closures do shell duplicadas de propósito. **A Task 10 fechou a janela:**
`App.tsx` e a flag foram deletados, `AppRouterV7` virou o único `AppRouter` e não existe mais
cópia a manter em sincronia. Rollback do cutover = `git revert` do commit da Task 10.

### Working tree

Há vários arquivos/diretórios não rastreados que pertencem ao usuário ou ao ambiente (`.agents/`,
`.codex/`, `.claude/`, `.github/hooks/`, `AGENTS.md`, lockfiles e artefatos de sessão). **Não apagar,
resetar, adicionar ou versionar em massa.** Os artefatos `.impeccable/` desta auditoria também estão
não rastreados por design.

## 3. Processo e skills obrigatórios

O trabalho corrente segue:

1. `product-design:audit` — screenshots primeiro, cada imagem aberta/validada e notas ligadas à
   evidência;
2. `browser:control-in-app-browser` — usar exclusivamente o Codex In-app Browser para o produto;
3. `superpowers:writing-plans` — este handoff foi atualizado antes de continuar a execução;
4. `superpowers:brainstorming` — não implementar a Fase 3 antes de o desenho ser aprovado;
5. `superpowers:verification-before-completion` — nenhum “concluído” sem verificação fresca.

O preflight de contexto do Product Design não pôde rodar: o Python global não existe e o pacote
instalado não contém `user_context_preflight.py` no caminho documentado. Não havia contexto salvo na
rodada anterior; usar este repositório, as capturas atuais e a spec como fontes.

## 4. Auditoria já concluída

### Evidência

- Relatório consolidado:
  `.impeccable/audit/2026-08-09-full-product/report.md`
- Matriz de cobertura:
  `.impeccable/audit/2026-08-09-full-product/coverage.md`
- Avaliação A:
  `.impeccable/audit/2026-08-09-full-product/capture-a.md`
- Avaliação B:
  `.impeccable/audit/2026-08-09-full-product/capture-b.md`
- Registro de mutações:
  `.impeccable/audit/2026-08-09-full-product/mutations.md`
- Screenshots A:
  `.impeccable/audit/2026-08-09-full-product/screenshots/`
- Screenshots B:
  `.impeccable/audit/2026-08-09-full-product/screenshots-b/`
- Crítica Impeccable versionada:
  `.impeccable/critique/2026-08-10T00-00-56Z__src-app-tsx.md`

Verificação fresca anterior: **37 evidências A + 40 evidências B aceitas = 77**; uma captura de
loading da B foi rejeitada. Links locais do relatório estavam íntegros. Critique score: **15/40**,
com **2 P0** e **5 P1**.

### Superfícies já percorridas

- Shell desktop/tablet e drawer.
- Oito módulos globais: Dashboard, Torneios, Jogadores, Ranking, Histórico, Nuvem & Conta,
  Configurações e Gestão.
- Comunidades: lista, criação imediata, entrar por código e dez áreas — Resumo, Atletas, Presença,
  Lista WhatsApp, Sessões, Ligas, Ranking, Membros, Regras e Dados.
- Atletas: lista, busca, criar, editar, avaliação, VUT, carreira, convidado e confirmação de
  exclusão cancelada.
- Wizard regular: Sessão, Atletas, Formato, Regras, Revisão, Times e transição após `Gerar tabela`.
- Wizard de torneio: as sete etapas, configurações/vínculos e tabela.
- Estado de sessão/torneio antes da primeira partida.

## 5. Mutações já existentes na conta/estado local

O usuário autorizou afetar a conta e os rascunhos para completar a auditoria.

- Comunidade `NOVA COMUNIDADE`.
- `AUDIT Convidado 1` a `AUDIT Convidado 7`.
- Torneio `Torneio — 09/08/2026`, tabela gerada, nenhuma partida iniciada na última captura.
- Sessão regular `Sessão — 09/08/2026`, marcada pronta/ativa antes da primeira partida.
- Uma sessão anterior `Sessão — 28/06/2026` foi ativada inesperadamente na primeira passagem.
- Nenhum ponto/placar/encerramento havia sido registrado até este handoff.

Registrar toda nova mutação imediatamente em
`.impeccable/audit/2026-08-09-full-product/mutations.md`. Não limpar fixtures antes de capturar
histórico, premiação e reveal; limpeza é uma decisão posterior.

## 6. Achados bloqueadores já confirmados

### P0 — integridade do elenco

Nove atletas selecionados resultaram em apenas sete distribuídos (3 + 2 + 2), mas o produto liberou
tabela/ativação. O resumo continuou exibindo nove IDs e `7M / 0F`.

Hipótese observável: `selectedPlayerIds` pode conter IDs ausentes do catálogo `players`; a UI conta
IDs no resumo, enquanto `SessionWizard.tsx:210-212` filtra apenas jogadores existentes para o
balanceador. Não tratar como causa fechada sem diagnóstico próprio.

### P0 — máquina de estados contraditória

- Torneio aparece `Pronto` na lista e `Em andamento` no detalhe, embora ainda ofereça
  `Iniciar Torneio`.
- Jogo Livre mostra `Sessão ativa`/`Partida em andamento` antes de `Começar Primeira Partida`.

### P1 — `Gerar tabela` tem semântica diferente por formato

- Torneio avança para a etapa 7 e oferece `Iniciar torneio`.
- Jogo Livre usa `confirmDivision()` para persistir e navegar direto ao estado ativo; a etapa 7
  prometida pelo stepper não aparece.

### P1 — arquitetura de informação

- Todos os destinos permanecem em `/`.
- Comunidades fica escondida sob Jogadores.
- A spec propõe cinco áreas comunitárias state-driven, mas a auditoria recomenda subrotas reais.
- `GestaoView` é administração global, não gestão comunitária.
- Backup/importação são globais e não devem migrar automaticamente para a comunidade.

## 7. Pedido atual ainda não concluído

**Percorrer todas as superfícies internas da sessão ativa e do torneio ativo.** O usuário autorizou
“fazer o que for necessário”. Isso permite usar as fixtures `AUDIT`, iniciar partidas, registrar
pontos de teste, desfazer quando necessário e finalizar fixtures para desbloquear histórico,
premiação e VUT reveal.

Esta autorização não inclui sincronizar manualmente, importar/restaurar backup, alterar papéis,
apagar comunidade/atletas reais ou compartilhar externamente. Use somente os fixtures `AUDIT` e os
rascunhos criados pela auditoria.

### Checkpoint de execução — passagem C (2026-08-10, Claude Code)

**O estado das passagens A/B foi perdido.** Ele existia apenas no `localStorage` do Codex In-app
Browser; o processo do Codex não está mais em execução e nada daquilo tinha subido para a nuvem.
Depois do login em outro navegador, o estado sincronizado trouxe 0 sessões, 0 torneios, 0
comunidades e nenhum atleta `AUDIT`. A confirmação nativa pendente de `Encerrar Sessão` morreu
junto e **não precisa mais ser clicada**.

A passagem C refez as seções 8 e 9 do zero, com fixtures próprias:

- seção 8 (sessão regular): **concluída**, itens 1–18, com `AUDIT Sessao C — 09/08/2026`;
- seção 9 (torneio): **concluída, 20/21**, com `AUDIT Torneio C — 09/08/2026` e a rodada
  complementar `AUDIT Torneio D — pausa`, que fechou os itens 1, 14, 15 e 18. O item 8
  (`TournamentBracket`) é não aplicável ao round-robin usado e exige mata-mata para ser exercitado;
- reveal VUT e Histórico capturados nos dois fluxos, pela primeira vez na auditoria.

Relatório completo, com achados e correções: `.impeccable/audit/2026-08-09-full-product/pass-c/report.md`.

**Achado que muda o diagnóstico do P0 — causa raiz fechada:** `GuestPlayerModal.handleSave`
(`GuestPlayerModal.tsx:100-136`) cria o convidado **sem `syncStatus`**, enquanto o cadastro normal
grava `syncStatus: 'local'` (`usePlayers.ts:245`). `countPendingChanges` conta apenas `'local'` e
`'pending'` (`syncStatus.ts:16`), então o convidado fica invisível para a contagem que serve de
guarda contra o download automático (`cloudSyncStartupUseCases.ts:58-63`). Com a contagem em zero,
o startup baixa e `applyResult` (`useCloudSync.ts:154-161`) sobrescreve o local, levando o registro
sem `cloudId`. A guarda existe e está correta — só não enxerga o registro que precisa proteger.
Isso explica também por que o efeito parece intermitente. É a causa real do "9 selecionados, 7
distribuídos". A hipótese antiga (`SessionWizard.tsx:210-212`) foi verificada e **descartada**.

**Corrigido em 2026-08-10.** Ao medir o estado real, o contador de pendências saltou de **5 para
48**: não eram só os 2 convidados: 17 eventos de ponto, 9 times, 8 jogos, 3 sessões e 4 relatórios
também estavam invisíveis para a guarda. **Nenhuma entidade criada localmente nasce com
`syncStatus`** — o convidado era só o sintoma visível.

- `src/logic/syncStatus.ts` — registro sem `syncStatus` **e** sem `cloudId` passa a contar como
  pendente. É a guarda compartilhada por todas as coleções e é o que resolve de fato.
- `src/components/player/GuestPlayerModal.tsx` — convidado nasce com `syncStatus: 'local'` e
  `updatedAt`, como o cadastro normal.
- `src/logic/syncStatus.test.ts` — um teste codificava o bug (`ignores ... undefined statuses`) e
  foi corrigido; dois casos novos cobrem a regra.

Verificado: 701 unit + 136 UI passando, typecheck e build limpos; no navegador, reload preservou os
9 atletas com `AUDIT C3`/`AUDIT C6` ainda sem `syncStatus`, sem disparar o download.

**Ainda em aberto:** `applyResult` pode remover registro local sem `cloudId`, e o caminho de troca
de dono do cache (`cloudSyncStartupUseCases.ts:51-56`) ignora `pendingChanges` por design. Decidir
se ali também se preserva o que nunca subiu.

Além dela, um segundo defeito independente foi reproduzido três vezes: o balanceador descarta
atletas com `atributos: {}`, e o painel de diagnóstico não menciona a perda.

**Evidência desta passagem não tem arquivos `.jpg`** — o navegador desta sessão devolve screenshots
para inspeção mas não os grava em disco, e o projeto não tem Playwright/Puppeteer. Cada estado foi
aberto e validado no momento da captura; a evidência persistida é o estado do `localStorage`, o DOM
e as medições no relatório.

Para retomar: **não é preciso recriar nada.** As seções 8 e 9 estão fechadas. `AUDIT Torneio D —
pausa` ficou em andamento com 0/3 jogos de propósito — é a fixture pronta para reexecutar
pausar/retomar e os controles contextuais sem montar tudo de novo.

`coverage.md` e a crítica foram atualizados. Score:
**15/40 (2 P0, 5 P1) → 11/40 (3 P0, 7 P1)**, em
`.impeccable/critique/2026-08-10T12-04-02Z__src-app-tsx.md`.

O servidor de dev foi **encerrado**; a porta 3000 está livre e nenhum processo `node` ficou
pendurado.

Com a auditoria fechada, as decisões da seção 13 estão liberadas — mas a evidência recomenda uma
ordem: **integridade de dados antes de navegação.** Enquanto o estado local e o da nuvem
discordarem em silêncio, nenhuma rota nova sobrevive ao primeiro reload.

### Checkpoint de execução — sessão regular (passagem anterior, estado perdido)

Estado confirmado às **21:18 BRT**:

- pasta criada e preenchida: `.impeccable/audit/2026-08-09-full-product/session-live-tabs/`;
- evidências aceitas `01` a `19`;
- jogo 1 finalizado: Time 1 15×0 Time 2;
- jogo 2 finalizado: Time 1 15×0 Time 3;
- jogo 3 finalizado: Time 1 0×15 Time 2;
- modal detalhado percorrido nas abas `Ponto Nosso` e `Erro Adversário`, incluindo autor,
  fundamento, assistência, categorias avançadas e subtipo de erro;
- um ponto detalhado foi registrado e desfeito; efeito líquido zero;
- um destaque `Defesa` para `AUDIT Convidado 1` foi criado e removido; efeito líquido zero;
- `Próxima Batalha`, `Próximo da Fila`, reentrada, rotação e classificação foram validados;
- `Copiar Próximo` abriu alerta nativo, posteriormente dispensado; clipboard lido vazio;
- `Encerrar Sessão` foi acionado após o terceiro jogo. A confirmação nativa permaneceu aberta e
  bloqueou duas chamadas de automação, reiniciando o kernel do navegador. **Não repetir o clique**:
  primeiro recuperar a aba, chamar `getJsDialog()` e aceitar a confirmação existente, ou pedir ao
  usuário um único clique manual se a caixa ainda estiver visível;
- após confirmar, ainda faltam resumo/premiação, VUT reveal (se houver), Histórico e exportadores;
- a auditoria interna do torneio ainda não começou nesta passagem.

Mutações detalhadas e reversões estão em
`.impeccable/audit/2026-08-09-full-product/mutations.md`.

## 8. Matriz obrigatória — sessão regular

Criar a pasta:

`.impeccable/audit/2026-08-09-full-product/session-live-tabs/`

Capturar e validar, em ordem:

1. Estado pré-primeira-partida.
2. Confirmação/transição de `Começar Primeira Partida`.
3. Placar ativo com os dois `TeamScoreCard`.
4. Ponto rápido do time sem autor.
5. Modal `Registrar Detalhes do Ponto` — aba `Ponto Nosso`.
6. Autor do ponto + fundamento + assistência/levantador.
7. Modal — aba `Erro Adversário`.
8. Categorias de erro: Saque, Recepção, Levantamento, Ataque, Bloqueio, Defesa,
   Rede/Invasão, Líbero, Outro e categorias avançadas.
9. Confirmação de ponto e mudança do placar.
10. `Desfazer Ponto` e recuperação do placar.
11. Fila/rotação: `Próxima Batalha`, `Próximo da Fila`, fila vazia e `Iniciar Próximo Jogo`.
12. Destaques/lances: abrir FAB/formulário, criar um destaque `AUDIT`, listar e remover somente o
    destaque criado.
13. Aviso/ownership da sessão e eventual confirmação de assumir controle, se aparecer.
14. Compartilhar/copiar próxima partida: abrir apenas estados seguros; não enviar externamente.
15. Encerrar partida e transição para a próxima.
16. Encerrar sessão com confirmação, resumo e premiação.
17. Reveal VUT pós-sessão, se produzido.
18. Histórico detalhado da sessão finalizada e exportadores apenas em preview/cópia segura.

Para cada etapa: DOM recente → ação única → espera estável → screenshot → abrir via `view_image` →
aceitar/rejeitar → nota de UX/design/acessibilidade.

## 9. Matriz obrigatória — torneio

Criar a pasta:

`.impeccable/audit/2026-08-09-full-product/tournament-live-tabs/`

Capturar e validar:

1. Lista `Pronto` e detalhe contraditório pré-início.
2. `Iniciar Torneio` e primeira partida.
3. Header: Sair, Editar, Pausar/Retomar e Encerrar.
4. Status, formato, rodada e regra.
5. Placar ativo e os dois times.
6. PointModal nas duas abas (`Ponto Nosso`/`Erro Adversário`) e um evento de teste.
7. Desfazer ponto.
8. Tabela/chave do torneio (`TournamentBracket`) conforme formato.
9. Classificação e critérios de desempate.
10. Tabela de jogos e cada controle contextual: Iniciar/Pausar, mover para cima/baixo, W.O. A/B,
    Editar placar, Cancelar, WhatsApp e Copiar. Confirmações destrutivas devem ser capturadas e
    canceladas, salvo quando uma fixture `AUDIT` precisar ser concluída.
11. Artilheiros.
12. MVP parcial.
13. Premiação parcial (`AwardsPanel`).
14. Destaques e remoção apenas do destaque `AUDIT` criado.
15. Sessões do confronto.
16. Compartilhar classificação, artilharia, jogo e resumo final sem envio externo.
17. Finalizar jogos suficientes para observar `Próxima Partida`, placar final e avanço de rodada.
18. Pausar/retomar torneio.
19. Encerrar torneio, resumo final, classificação final, MVP e prêmios.
20. Histórico detalhado, bracket final e exportadores.
21. Reveal VUT pós-torneio, se produzido.

## 10. Estados transversais a observar

- Loading e processamento.
- Empty/no-data antes e depois do primeiro ponto.
- Confirmação, cancelamento e recuperação.
- Controles desabilitados e explicação do motivo.
- Status anunciado no header, Dashboard, lista e detalhe.
- Foco, nomes acessíveis, `aria-pressed`/`aria-current`, dependência de cor e microtexto.
- Reflow em desktop e pelo menos um viewport tablet/mobile nos painéis mais densos.
- Nomes longos/truncamento.
- Consistência entre quantidade selecionada, quantidade distribuída e participantes da partida.
- Persistência ao sair/voltar e recarregar a rota `/`.

## 11. Runbook de execução

1. Confirmar que `HANDOFF.md` contém este runbook e verificar o diff antes de qualquer interação.
2. Iniciar `npm run dev -- --host 127.0.0.1` oculto; registrar PIDs e confirmar porta 3000.
3. Conectar ao Codex In-app Browser com binding próprio; ler documentação completa da superfície.
4. Abrir o produto sem recarregar uma aba útil; se a autenticação expirou, pedir login e esperar.
5. Capturar o estado inicial antes da primeira mutação.
6. Executar sessão regular conforme seção 8, registrando cada mutação.
7. Executar torneio conforme seção 9.
8. Atualizar `coverage.md`, `report.md`, `capture-a.md`/novo relatório complementar e a crítica
   Impeccable com os novos achados.
9. Reavaliar o score e os P0/P1; versionar nova snapshot via `critique-storage.mjs`.
10. Parar apenas os PIDs do servidor criado nesta rodada e confirmar porta 3000 livre.
11. Rodar verificação fresca dos arquivos, links, contagens e estados alegados.
12. Entregar relatório inline com screenshots e lista numerada de todas as etapas.

## 12. Critério de conclusão desta auditoria

A auditoria complementar só pode ser chamada de concluída quando:

- toda linha das seções 8 e 9 tem screenshot aceito ou bloqueio nomeado;
- cada screenshot foi aberto em resolução original;
- todas as mutações estão registradas;
- sessão e torneio finalizados aparecem no Histórico, ou o motivo técnico do bloqueio está provado;
- premiação/VUT reveal foram capturados ou marcados honestamente como não produzidos;
- o relatório e a crítica foram atualizados;
- o servidor local foi encerrado;
- nenhuma ação fora do escopo foi executada.

## 13. Decisões de design pendentes após a auditoria

Não decidir até a evidência complementar estar pronta:

1. Inserir um `Gate 0` de integridade do elenco + máquina de estados antes da Fase 3.
2. Usar subrotas reais para as cinco áreas comunitárias.
3. Agenda como rota própria ou seção do Início.
4. Separar Administração da plataforma, Gestão da comunidade e Dados/backup.
5. Modelo único de transição `rascunho → pronto → partida em andamento → encerrado` para Jogo Livre
   e Torneio.

## 13.1 Faxina de branches — 2026-08-11

Todos os branches antigos foram analisados e removidos. Nenhum PR ficou aberto. Registro do que
foi descartado **com análise**, para ninguém redescobrir e achar que encontrou trabalho perdido:

**`codex/project-closeout`** (14 commits, 29/07) — descartado. Cada item tem substituto melhor
em `main`:

- `fix(security): make career totals view invoker-safe` — aplicaria `security_invoker = true`
  na view `career_totals`, fazendo-a respeitar o RLS de `career_events`. **Contradiz decisão de
  produto posterior:** o schema em `main` documenta que a view é global de propósito ("o card de
  terceiros fica global e correto sem revelar em quais comunidades a pessoa joga"). Esse
  comentário **não existe no branch** — a migration é anterior à decisão. Aplicá-la hoje
  regrediria a feature.
- `docs: formally close Plan 3` — o fechamento real está no programa mestre
  (`| 3 | ... | Concluido (main, 2026-07-30) |`), com a nota de escopo. O
  `plan3-closeout-2026-07-29.md` do branch é anterior e menos completo.
- Spec e plano de `session-device-control-offline` (29/07, 252 + 730 linhas) — **sucedidos pelo
  Plano 4** (`docs/superpowers/plans/2026-07-30-plano-4-offline-operacional.md`), que está em
  `main` e consta como **concluído em 2026-07-31**.
- `chore(deps)` react-router `^7.17.0` → `^8.3.0` — major bump que `main` não adotou.
- `style: format prettier` — refeito melhor pelo PR #18 (`endOfLine: lf`).
- `fix(migrations)` ×2 e `fix(career)` — pressupõem migrations que `main` nunca recebeu.

**`feat/plan4-session-control`** (2 commits, 29/07) — descartado. `sessionOperations.ts` (105
linhas) + tipos (157) + **257 linhas de teste**, sem nenhum consumidor em `main`. Modelava
_operações causais_ (`deriveEffectiveOperations`, `validateOperationDependency`,
`projectSessionOperations`). O produto seguiu por outro modelo — _posse e heartbeat_ — que foi
implementado e fechado: `sessionOwnershipUseCases.ts`, `SessionOwnershipNotice.tsx`,
`sessionOwnershipCloudService.ts`. Abordagens diferentes para o mesmo problema; a segunda venceu.

**`worktree-reposicionar-export-import`** (1 commit, 04/08) — descartado por decisão do usuário em
2026-08-11. Commit `3e94b16` `refactor(settings): gate export/import behind offline mode, drop
orphan Dashboard props`, que existia **apenas no disco local** (sem remoto, fora de `main`).
Tocava `src/App.tsx` (64 linhas) e `Dashboard.tsx` — exatamente a área que a Fase 3 vai reescrever,
o que motivou o descarte em vez do merge. Recuperável pelo reflog enquanto ele durar.

**`backup/main-before-pr11-sync-20260630`** — **mantido de propósito, só local.** É uma foto de
`main` de 29–30/06, anterior à reorganização de diretórios (`src/services/` → `src/infra/`,
`src/components/common/` → `src/ui/common/`). Quase tudo tem equivalente em `main` sob o caminho
novo, **exceto** três módulos de domínio que não existem lá com nome nenhum:
`src/domain/playerLink.ts`, `src/domain/permissions.ts` e `src/hooks/usePlayerLinkProposals.ts`
(funções `canDirectlyLinkPlayer`, `buildPlayerLinkProposal`, `supersedePendingProposalsForLink`).

A funcionalidade **existe** em `main`, sob outra arquitetura — `communityPlayerSearchUseCases.ts`,
`communityPlayerCloudService.ts`, e as permissões em `communityMembersViewModel.ts` /
`playerEditViewModel.ts`. O domínio foi reescrito na migração para `ScreenContract`, não perdido.

**O que não foi verificado:** ninguém comparou linha a linha as regras de negócio do
`playerLink.ts` de junho com a reescrita atual. Se alguma regra caiu na tradução, esse branch é a
única cópia. É por isso que ele fica. Custa nada sendo local; apagar é irreversível.

**Pergunta em aberto, herdada desta análise:** `src/infra/outbox/` **não existe em `main`**, mas a
linha do Plano 4 no programa mestre diz "e o outbox" como escopo restaurado e concluído. Ou o
outbox vive noutro caminho, ou aquela linha está otimista. Vale confirmar um dia — não bloqueia
a Fase 3.

## 14. Referências principais

- Spec de design da Fase 3 (a que vale):
  `docs/superpowers/specs/2026-08-06-plano-5-fase-3-nova-navegacao-revisao-design.md`
- Spec da Fase 3 (base de julho, substituída na §6 pela acima):
  `docs/superpowers/specs/2026-07-31-plano-5-screen-contracts-reset-navigation-design.md`
- Plano mestre:
  `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
- Plano concluído da Fase 2:
  `docs/superpowers/plans/2026-08-03-plano-5-fase-2-screen-contracts.md`
- Plano concluído da Fase 3 (rotas URL, cutover na Task 10):
  `docs/superpowers/plans/2026-08-12-plano-5-fase-3-nova-navegacao.md`
- Shell/router:
  `src/app/AppRouter.tsx`, `src/app/AppShell.tsx`, `src/app/routes/`,
  `src/application/appRoutes.ts`, `src/application/appShellViewModel.ts`
- Wizard:
  `src/components/session/SessionWizard.tsx`, `src/hooks/useSessionWizard.ts`,
  `src/application/sessionLifecycleUseCases.ts`
- Sessão/tournament live:
  `src/components/live/SessionActiveView.tsx`, `src/components/live/TournamentActiveView.tsx`,
  `src/components/live/PointModal.tsx`, `src/components/live/TeamScoreCard.tsx`,
  `src/components/live/AwardsPanel.tsx`, `src/components/live/HighlightFab.tsx`

## 15. Comandos de verificação do projeto

Ordem CI definida em `AGENTS.md`:

```text
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
```

O trabalho C6 acrescenta dois gates que **não** estão na ordem acima e são obrigatórios ao fechar
uma fatia:

```text
npm run check:architecture
npm run test:db          # duas vezes, cada uma reconstruindo as migrations do zero
```

`test:db` precisa do PostgreSQL real descrito na seção 0. Rodar duas vezes é o que prova que a
cadeia de migrations reconstrói de forma determinística.

Não executar a suíte completa apenas por editar artefatos de auditoria. Executá-la quando houver
mudança em código-fonte, ou antes de fechar uma fase de implementação.
