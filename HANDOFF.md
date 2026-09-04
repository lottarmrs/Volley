# HANDOFF — Panelinha

> Atualizado em **2026-09-04**, ao fechar `XS-W4-06`. Este é o ponto de retomada canônico se o
> limite da conversa acabar.

## 0. Trabalho corrente — execução arquitetural C6

O trabalho ativo **não é mais o Plano 5**, que foi concluído em 2026-08-12. Hoje o repositório
executa o programa de arquitetura C6, fatia por fatia (`XS-Wx-yy`), no modelo _strangler_: o
modelo legado continua existindo e a autoridade migra por contexto.

**Fonte canônica da ordem de trabalho:**
`docs/architecture/execution/C6-EXECUTION-MASTER.md` (waves e pré-condições) e
`docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` (fatias W3–W6).
As seções 1–15 deste arquivo **não** descrevem a ordem de trabalho atual.

### Estado das fatias

| Fatia    | Assunto                                  | Estado    |
| -------- | ---------------------------------------- | --------- |
| XS-W3-01 | Session target root                      | concluída |
| XS-W3-02 | Session organizer assignment             | concluída |
| XS-W3-03 | Session courts                           | concluída |
| XS-W3-04 | Session rules snapshot                   | concluída |
| XS-W3-05 | SessionParticipant + RosterRevision      | concluída |
| XS-W3-06 | Lifecycle/readiness semantic commands    | concluída |
| XS-W3-07 | Session cohort cutover                   | concluída |
| XS-W4-01 | Registration schema e invariantes        | concluída |
| XS-W4-02 | Open/Close/Lock Registration             | concluída |
| XS-W4-03 | JoinRegistration                         | concluída |
| XS-W4-04 | Leave / promoção / capacidade            | concluída |
| XS-W4-05 | FinalizeSessionRoster                    | concluída |
| XS-W4-06 | Legacy Session Registration introduction | concluída |
| XS-W5-01 | Versioned PlayerEvaluation source model  | próxima   |

### Branches — cadeia integrada em `main`

A cadeia C6 até `XS-W4-06` **está em `main`**, integrada em 2026-09-04 por fast-forward, junto com
a correção de cascade de `session_organizer_assignments`. Não existe mais trabalho C6 pendente de
integração: `exec/c6-w4-05-finalize-session-roster` e
`exec/c6-w4-06-legacy-registration-introduction` viraram ponteiros redundantes para pontos dessa
mesma história.

```text
main   ← contém W3-01..W4-06 e a correção de cascade
```

Ao retomar, confirme que está em `main` e inicie `XS-W5-01` a partir deste ponto
canônico.

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
- Uma Session target retida localmente falha o upload genérico a cada sync, indefinidamente.
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
