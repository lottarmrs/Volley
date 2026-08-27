# Canonical Glossary — Volley

> Status: `DRAFT-CANONICAL / C2.00 / C7-R5-NORMALIZED`
>
> Este glossário define a linguagem canônica da arquitetura. Termos legados podem continuar existindo durante a migração, mas devem ser explicitamente marcados como `Legacy*` quando conflitam com estes significados.
>
> C7 R5 normalization: `PlayerMatchStatContribution`, `StandingsProjection`, `RevertMatchEvent` and the execution/correlation ID taxonomy are canonical terms.

---

## 1. Identity / People

### User

Identidade autenticada da plataforma.

Um User pode:

- possuir conta Auth;
- pertencer a Communities via Membership;
- estar vinculado a um Player;
- não ser atleta.

`User ≠ Player`.

---

### UserProfile

Perfil de conta associado ao User autenticado.

Não é a identidade esportiva canônica.

---

### Player

Identidade esportiva persistente e global.

Pode existir sem conta autenticada.

Pode participar em várias Communities.

Pode possuir PlayerAccountLink posteriormente.

---

### PlayerAccountLink

Relação controlada entre um User e um Player.

Não deve ser confundida com Membership nem com participação em Session.

---

### Participant

Identidade operacional/histórica de participação dentro de um contexto como Session/Match.

Pode apontar para Player ou representar Guest.

`Participant ≠ Player`.

---

### Guest

Pessoa participante sem Player persistente obrigatório e sem account obrigatória.

Participar como Guest não promove automaticamente a pessoa para Player.

---

### CommunityPlayer

Relação esportiva entre Community e Player.

Representa que aquele Player faz parte do universo esportivo da Community.

Não concede acesso/account governance.

`CommunityPlayer ≠ CommunityMembership`.

---

## 2. Community / Governance

### Community

Contexto organizacional persistente que agrupa governança, atletas, Sessions, avaliações, competições e histórico.

É um boundary de autorização/organização, mas não um tenant rígido universal porque Player é global.

---

### CommunityMembership

Relação entre User e Community para acesso/governança.

Possui, conceitualmente:

```text
governance_role
operational_responsibilities
status
```

---

### Governance Role

Dimensão de poder administrativo dentro da Community.

Valores base:

```text
OWNER
ADMIN
MEMBER
```

---

### Owner

Único responsável de ownership ativo da Community.

Pode transferir ownership e possui highest governance authority no contexto da Community, sem ganhar automaticamente responsabilidades esportivas operacionais.

---

### Admin

Papel de governança com capabilities administrativas definidas.

`Admin ≠ Organizer`.

---

### Member

Membership sem autoridade administrativa especial, salvo capabilities derivadas de responsabilidades operacionais específicas.

---

### Operational Responsibility

Responsabilidade funcional não hierárquica dentro do contexto.

Exemplos futuros possíveis:

```text
ORGANIZER
REFEREE
STATISTICIAN
COACH
```

não são governance roles por natureza.

---

### Organizer

Responsabilidade operacional ligada à organização de Session/Match e atividades esportivas relacionadas.

Pode, conforme assignment/capability:

- organizar Session;
- configurar Session;
- preparar/start/control Match;
- inserir/corrigir eventos esportivos;
- avaliar Players.

Não implica governança administrativa da Community.

---

### CommunityJoinRequest

Pedido para um User ingressar em uma Community.

É entidade distinta de Membership.

`PENDING JoinRequest ≠ Membership`.

---

## 3. Session / Registration

### Session

Evento operacional em que pessoas se reúnem para jogar.

Pode ser:

```text
QUICK
COMMUNITY
```

Pode hospedar zero ou várias Matches e múltiplas courts.

`Session ≠ Match`.

---

### Quick Session

Session criada sem Community obrigatória e que pode ser local/offline-owned até publicação explícita.

---

### Community Session

Session pertencente a um contexto Community e compartilhada entre usuários.

Shared state relevante é server-authoritative.

---

### SessionOrganizerAssignment

Assignment explícito de Organizer(s) responsável(is) por uma Session específica.

Community Organizer eligibility não significa automaticamente permissão irrestrita de editar Sessions de todos os outros Organizers.

---

### SessionCourt

Representação de uma quadra/recurso de execução dentro da Session.

Uma Session pode conter múltiplas courts e Matches independentes.

---

### RegistrationWindow

Janela de inscrição de uma Session.

Controla:

- abertura/fechamento;
- capacity;
- fila;
- revision;
- eligibility.

---

### RegistrationEntry

Estado da intenção de inscrição de um participante elegível dentro de uma RegistrationWindow.

Pode estar confirmado ou em waitlist conforme lifecycle/policy.

`RegistrationEntry ≠ SessionParticipant`.

---

### Waitlist

Fila autoritativa FIFO formada por RegistrationEntries que não obtiveram vaga confirmada.

Posição é determinada server-side.

---

### Promotion

Transição de primeiro elegível da waitlist para vaga confirmada.

É efeito da mutation da RegistrationWindow, não um status histórico permanente chamado `PROMOTED`.

---

### SessionParticipant

Identidade operacional efetiva dentro de uma Session.

É materializada a partir de Quick participation ou roster finalized, e preserva snapshot histórico apropriado.

---

### Roster

Conjunto efetivo de Participants de uma Session em uma determinada revisão.

---

### RosterRevision

Snapshot/versionamento do roster da Session.

Mudanças de roster invalidam/stale downstream artifacts como TeamDraw quando aplicável.

---

### SessionReadiness

Estado derivado que informa se uma Session pode avançar para determinada operação, retornando blockers explícitos.

Não deve necessariamente ser um lifecycle status persistido.

---

## 4. Ratings / Skills

### Player Skill Profile

Subdomínio de `N2.02 — Identity / Player` que possui a semântica de avaliação e das projeções de skill do Player.

É owner de:

```text
PlayerEvaluation
CommunityPlayerSkillProfile
GlobalPlayerSkillProfile
Derived Overall
```

Não é um N2 independente e não possui o solver de Team Formation.

---

### PlayerEvaluation

Avaliação subjetiva realizada por um evaluator autorizado sobre um Player dentro de uma Community.

Uma avaliação possui scores por atributo e histórico/revisões.

---

### Evaluation Revision

Versão histórica de uma PlayerEvaluation.

A revisão efetiva atual substitui a anterior sem apagar história.

---

### Skill Attribute

Dimensão esportiva usada para avaliar/balancear Player.

Exemplos dependem da rubrica vigente, como ataque, saque, recepção, levantamento, bloqueio, defesa etc.

---

### Community Skill Profile / CommunityPlayerSkillProfile

Projection consolidada por atributo das avaliações de um Player dentro de uma Community.

---

### Global Skill Profile / GlobalPlayerSkillProfile

Projection consolidada por atributo a partir dos Community Skill Profiles de um Player.

Não é calculada agregando diretamente todas as avaliações individuais globais.

---

### Overall / Derived Overall

Valor derivado/resumo calculado a partir de skill attributes conforme fórmula versionada.

Serve a display/ranking/explicação.

**Não participa do Team Balancer.**

---

### Confidence

Medida separada da nota/skill indicando evidência ou estabilidade da estimativa.

Confidence não é rating.

---

### Missing Attribute

Atributo sem informação suficiente.

Nunca equivale automaticamente a `0`.

---

## 5. Team Formation

### Team Formation

Processo de geração, comparação, seleção e confirmação de equipes a partir de um RosterRevision congelado.

---

### PlayerBalanceSnapshot

Snapshot imutável dos inputs esportivos utilizados pelo solver para um Participant.

Inclui atributo por atributo, posições/constraints/confidence/proveniência conforme necessidade.

---

### Attribute Vector

Conjunto multidimensional de atributos utilizado pelo Team Balancer.

É o núcleo numérico do balanceamento.

---

### Hard Constraint

Regra que uma solução precisa satisfazer para ser considerada válida.

Violação torna Candidate inválido.

---

### Soft Objective

Critério que diferencia a qualidade entre soluções válidas.

Exemplos podem envolver equilíbrio multidimensional, composição, histórico/repetition etc.

---

### Solver

Engine determinística/versionada que produz Candidates a partir de inputs congelados, config e seed.

---

### CandidateSet

Conjunto persistido e imutável de alternativas de Team Formation publicadas para seleção.

Pode conter, por exemplo, três opções A/B/C.

---

### TeamCandidate

Uma alternativa específica de formação dentro de CandidateSet.

---

### TeamSelectionPolicy

Policy que determina como uma Candidate vira TeamDraw confirmado.

Valores base:

```text
ORGANIZER_CHOICE
PARTICIPANT_VOTE
```

---

### Team Voting / VotingRound

Processo opcional de votação entre Candidates por participantes elegíveis.

Vote individual possui política de privacidade própria.

---

### TeamDraw

Composição de equipes selecionada/confirmada para uma Session e vinculada a um RosterRevision.

É snapshot histórico, revisionado quando alteração manual formal for necessária.

---

## 6. Match

### Match

Execução esportiva concreta de um confronto.

Pode ser casual ou estar ligada a Fixture.

Mantém lifecycle, roster, event history, projection e result.

---

### Fixture

Confronto planejado dentro de Competition.

Define pairing/slot/schedule/dependencies.

Não é a própria execução esportiva.

`Fixture ≠ Match`.

---

### MatchRoster

Snapshot congelado dos participantes/teams válidos para a Match.

---

### MatchParticipation

Registro factual de participação efetiva de Player/Participant na Match.

Serve como fonte histórica para stats em vez de consultar Team atual.

---

### Lineup

Configuração operacional de jogadores em quadra/posições num momento ou início de Match, quando necessária.

Não é sinônimo de MatchRoster.

---

### MatchController

Ator que possui autoridade técnica corrente para enviar comandos de controle/placar daquela Match.

`MatchController ≠ Organizer`.

Organizer pode adquirir controle se possuir eligibility/capability e lease válido.

---

### MatchControlLease

Estado autoritativo de posse temporária do controle da Match.

Inclui controller, device, epoch, heartbeat/expiry conforme policy.

---

### Control Epoch

Número monotônico/versionamento da autoridade de Match control.

Takeover incrementa epoch.

Commands de epoch antigo são rejeitados.

---

### MatchCommand

Intenção enviada ao Match Engine, como:

```text
AwardPoint
PauseMatch
ResumeMatch
RevertMatchEvent
FinishMatch
```

---

### RevertMatchEvent

Command canônico para reverter semanticamente um MatchEvent por meio de uma correção append-oriented.

Não significa hard-delete do evento original.

O alias genérico `RevertEvent` não é nome canônico de target.

---

### MatchEvent

Fato append-oriented produzido pelo Match Engine e ordenado por `sequence` dentro da Match.

É a fonte factual do Match bounded context para replay/correções.

---

### Match Sequence

Sequência monotônica autoritativa dos MatchEvents.

É usada para ordering, concurrency e gap detection.

---

### MatchProjection

Estado derivado atual da Match, como score/sets/status/current set/last sequence.

Pode ser reconstruído a partir do effective event stream.

---

### MatchResult

Resultado técnico produzido ao final da Match.

Não é automaticamente resultado oficial de Competition.

---

### Reconciliation

Processo explícito de resolver divergência entre history local offline e history server-authoritative, especialmente após takeover/control epoch divergence.

Não usa Last-Write-Wins.

---

## 7. Competition

### Competition

Edição competitiva delimitada que possui entries, rules, stages, fixtures e official results.

Liga estruturas como liga/campeonato/torneio sob um modelo interno comum.

---

### CompetitionSeries

Identidade opcional persistente para uma série recorrente de Competition editions.

Não é obrigatória para toda Competition.

---

### CompetitionEntry

Participante competitivo abstrato inscrito na Competition.

Pode evoluir para tipos como TEAM ou PLAYER; TEAM é o cenário dominante inicial.

---

### CompetitionTeam

Equipe persistente no contexto da Competition.

Não é SessionTeam operacional.

---

### CompetitionRoster

Roster versionado da CompetitionTeam.

MatchRoster congela o que efetivamente valeu em uma Match específica.

---

### CompetitionStage

Fase estrutural da Competition, como round-robin, group stage, knockout ou playoff.

Combinações complexas são modeladas por várias stages, não giant format enum.

---

### CompetitionRound

Agrupador lógico de Fixtures dentro de Stage quando o formato possui conceito de rodada.

Não é Fixture.

---

### FixtureSlotSource

Origem de um slot de Fixture, como:

```text
DIRECT_ENTRY
GROUP_POSITION
FIXTURE_WINNER
FIXTURE_LOSER
SEED
BYE
```

---

### OfficialCompetitionResult

Resultado competitivo oficialmente homologado para um Fixture/execução.

É esta entidade que alimenta standings/bracket, não simplesmente MatchFinished.

---

### Walkover / WO

Resultado administrativo previsto pela Competition policy.

Não produz PointEvents fictícios para simular a partida.

---

### StandingsProjection

Classificação derivada de `OfficialCompetitionResult[] + CompetitionPenalty[]` segundo policy versionada.

Não deve ser diretamente editável.

O antigo singular `StandingsProjection` é apenas alias textual legado e não deve ser usado para novos nomes de tabela/type/API.

---

### Penalty

Fato administrativo explícito que afeta standings/Competition conforme policy.

---

## 8. Statistics / History

### Statistical Fact

Fato objetivo derivado de participação/eventos/resultados esportivos.

Não é PlayerEvaluation subjetiva.

---

### PlayerMatchStatContribution

Projection/contribuição rebuildable de um Player/MatchParticipation em uma única Match.

É derivada de MatchParticipation + MatchEvents efetivos + MatchResult/eligibility/coverage e funciona como unidade canônica do pipeline estatístico e boundary de performance para aggregates de carreira.

O antigo termo `PlayerMatchStats` não é nome canônico de entidade target.

---

### Career

Visão agregada histórica das participações/estatísticas de um Player.

Pode ter dimensões Global, Community, Competition, date range etc sem duplicar o mesmo Match factual.

---

### Statistical Coverage

Informação que indica quais stats foram realmente capturadas naquela Match.

Permite distinguir `0` de `unknown/not captured`.

---

### Ranking

Ordenação derivada por uma métrica/policy específica.

`Skill Ranking ≠ Statistics Ranking`.

---

### Report

Representação preparada de dados para consumo/export/auditoria.

Report não é necessariamente source of truth e pode usar snapshot quando precisa permanecer historicamente estável.

---

## 9. Media / Notification

### MediaAsset

Identidade canônica de um arquivo/asset de mídia processado e autorizado.

Domínio referencia `MediaAsset`, não URL de provider como identidade.

---

### MediaUploadIntent

Autorização/intenção server-side que antecede upload e limita purpose/actor/resource.

---

### Media Variant

Derivado de MediaAsset para tamanhos/formats específicos.

---

### NotificationIntent

Registro da decisão de que uma determinada notificação deve ser entregue a um recipient.

É distinto de DeliveryAttempt.

---

### DeliveryAttempt

Tentativa de entrega de NotificationIntent por um channel/provider.

Pode falhar/retry sem alterar o fato que originou a notification.

---

### DomainOutbox

Estrutura durável de integração criada na mesma transação do domínio para executar side effects assíncronos após commit.

---

## 10. Platform / Architecture

### Source Fact

Dado autoritativo que representa fato/decisão persistida do domínio e a partir do qual projections podem ser reconstruídas.

---

### Mutable State

Estado autoritativo mutável de um aggregate, protegido por lifecycle/revision/transaction conforme contexto.

---

### Snapshot

Representação congelada de inputs/estado histórico em determinado momento.

Alterações futuras do source não reescrevem snapshot antigo.

---

### Projection

Estado derivado/rebuildable calculado a partir de source facts/state.

---

### Revision

Número monotônico usado para representar versão lógica de aggregate administrativo/mutável.

É diferente de Match Sequence.

---

### Sequence

Número monotônico de ordering de eventos dentro de um stream/aggregate onde ordem é parte da semântica, como MatchEvent.

---

### Command

Intenção de alteração de estado semanticamente expressa pela Application Layer.

---

### Query

Operação que observa estado/read model sem alterar domínio.

---

### Command ID / `command_id`

Identificador estável de uma intenção lógica mutante, usado para idempotência e unknown-outcome recovery.

Retries do mesmo Command preservam o mesmo `command_id`.

Um `command_id` pode corresponder a várias tentativas técnicas de request.

---

### Request ID / `request_id`

Identificador de **uma tentativa técnica de request/transporte**.

Um retry cria novo `request_id`, mesmo quando preserva o mesmo `command_id`.

Para execução remota, o boundary confiável do servidor gera ou garante esse identificador e pode ecoar uma forma segura ao client.

---

### Trace ID / `trace_id`

Identificador do trace de observabilidade distribuída.

Pertence à instrumentação, não à idempotência de domínio.

Retries podem produzir traces distintos; sampling pode significar que nem todo request possui trace retido.

---

### Reference ID / `reference_id`

Identificador opaco e seguro para referência de erro/suporte apresentada ao usuário quando necessário.

Pode ser mapeado server-side para request/trace/error context.

Não é autorização, não é `command_id` e não precisa ser igual a `request_id` ou `trace_id`.

O `correlationId` client-side atual é vocabulário transitional; target prefere `reference_id` para a referência de suporte.

---

### Job ID / `job_id`

Identidade de uma unidade lógica de processamento assíncrono.

Attempts/retries podem compartilhar o mesmo `job_id` enquanto possuem metadata de tentativa distinta.

---

### Release ID / `release_id`

Identidade da versão/artefato implantado usada para correlacionar comportamento operacional com um release.

---

### Correlation

Relação entre sinais/identidades como `command_id`, `request_id`, `trace_id`, `reference_id`, `job_id` e `release_id`.

`correlation_id` não é um identificador canônico universal no target.

---

### Domain Event

Evento semanticamente significativo produzido pelo domínio, como `RegistrationPromoted` ou `OfficialResultPublished`.

Não deve ser confundido com evento técnico genérico `RowUpdated`.

---

### Realtime Envelope

Contrato de mensagem Realtime com metadata como event id, event type, aggregate, revision/sequence, schema version e payload mínimo.

---

### Presence

Estado efêmero de conexão/visualização no Realtime.

Não concede autoridade e não é registro histórico oficial.

---

### Cache

Cópia local/substituível de estado server-authoritative utilizada para performance/UX.

Pode ser descartada e refetchada.

---

### Local Draft

Intenção não validada/commitada no servidor, persistida localmente para UX/offline preparation.

Não é shared fact.

---

### Outbox Command

Command autorizado a permanecer pendente localmente para envio posterior segundo uma offline policy explícita.

Não existe outbox universal para qualquer mutation.

---

### Offline-Owned

Estado cuja autoridade legítima é temporariamente local/device-side, como Quick Session antes do authority handoff.

---

### Authority Handoff

Transição explícita e idempotente em que um aggregate local passa a ter autoridade server-side.

Depois do handoff não existem duas autoridades concorrentes.

---

### Read Model

DTO/visão de consulta criada para um use case/tela específica.

Não precisa ser igual à Database Row ou Domain Model.

---

### Capability

Permissão funcional contextual derivada server-side a partir do ator, resource context e relationships atuais.

---

### RLS

Row Level Security do Postgres usada como uma das camadas de defense in depth para dados expostos via Supabase/PostgREST.

Não substitui Application Authorization.

---

### BOLA / IDOR

Classe de vulnerabilidade em que um usuário tenta operar recurso de outro contexto por conhecer/adivinhar seu identificador.

Mitigação central: resolver contexto real do recurso e autorizar nele.

---

### SECURITY DEFINER

Função Postgres executada com privilégios do owner e tratada como endpoint privilegiado.

Exige authorization explícita, grants mínimos, `search_path` seguro e objetos qualificados.

---

### Realtime

Transporte de mudanças já commitadas para reduzir latência de atualização entre clients.

Não é source of truth.

---

### Reconciliation

Processo de comparar autoridade/versionamento local e server-side para retornar a estado consistente após perda de conectividade/gap/divergência.

---

### Idempotency

Propriedade pela qual retries da mesma intenção lógica não produzem efeitos duplicados.

---

### Unknown Outcome

Situação em que o client não sabe se a mutation commitou, por exemplo timeout após possível commit.

Resolve-se consultando/repetindo com o mesmo command ID, não assumindo falha.

---

### Domain Audit

Registro persistente de ações administrativas/relevantes necessárias à governança/compliance.

É distinto de telemetry.

---

### Telemetry

Logs/metrics/traces destinados a entender comportamento técnico/operacional.

Não é history esportiva nem audit de domínio.

---

### ADR

Architecture Decision Record.

Documento histórico que registra contexto, alternativas, decisão, consequências e review/exit strategy de uma decisão arquitetural relevante.

---

### Invariant

Condição que o sistema deve preservar em todos os estados válidos dentro do escopo definido.

Invariante crítica deve possuir enforcement/test evidence quando possível.

---

### Hypothesis

Direção plausível ainda não confirmada como decisão canônica.

Não deve ser tratada como requisito firme sem ADR/validação apropriada.

---

### Open Decision

Questão arquitetural/produto explicitamente não resolvida.

Mantém opções, evidência necessária, impacto e trigger/deadline de decisão.

---

### Strangler Migration

Estratégia incremental em que capacidades novas assumem autoridade por bounded context/cohort e responsabilidades legacy diminuem até remoção.

---

### Shadow Execution

Execução do novo cálculo/read path em paralelo apenas para comparação, sem alterar estado autoritativo ou experiência principal.

---

### Cohort Cutover

Migração na qual novos aggregates/cohorts usam novo modelo enquanto aggregates antigos concluem lifecycle no modelo anterior.

---

### Compatibility Adapter

Adapter temporário que traduz new→legacy ou legacy→canonical durante migração.

Não é uma segunda source of truth e deve possuir removal gate.

---

### Contract Phase

Fase final de uma migration expand/migrate/verify/contract em que artefatos legacy deixam de ser necessários e são removidos.

---

### Architecture Fitness Function

Teste/regra automática que detecta erosão de uma propriedade arquitetural, como dependency boundary, RLS requirement ou proibição de Overall no solver.

---

## 11. Termos legados reservados

Os termos abaixo podem existir enquanto o Strangler estiver ativo, mas novos modelos canônicos não devem reintroduzir sua semântica antiga sem ADR explícito.

### LegacyGame

Nome recomendado para o atual conceito `Game` durante coexistência com `Match`.

Novo código canônico usa `Match`.

---

### LegacyTeam

Representação antiga baseada, entre outras coisas, em arrays de IDs e Session/Game state.

Não deve ser confundida com TeamDrawTeam ou CompetitionTeam.

---

### Legacy Sync / Global Sync

Arquitetura atual que sincroniza coleções locais/cloud de maneira ampla.

Está deprecada no target e deve perder responsabilidades monotonicamente durante N2.22.

---

### `syncStatus`

Metadata legacy/infrastructure de sincronização.

Não é product lifecycle e não deve aparecer em canonical domain models novos.

---

### `cloudId` / `localId`

Identidade dual legacy de sincronização.

Novo domínio usa UUID final e não realiza remapping cloud/local como regra geral.

---

### `selectedPlayerIds[]`

Representação legacy de seleção/roster em Session.

Target usa Participants/RosterRevision/RosterEntries.

---

### `team.playerIds[]`

Representação legacy de relação Team↔Player.

Target usa relações normalizadas/snapshots apropriados.

---

### `game.pointIds[]`

Representação legacy de referências de eventos dentro de Game.

Target usa `MatchEvent(match_id, sequence, ...)`.

---

### `PlayerMatchStats`

Alias antigo para a contribuição estatística por Match.

Target usa `PlayerMatchStatContribution`.

---

### `StandingsProjection`

Alias singular antigo.

Target usa `StandingsProjection`.

---

### `RevertEvent`

Alias genérico antigo de correção/reversão.

Target Match usa `RevertMatchEvent`.

---

### `correlationId` / `correlation_id` como catch-all

Vocabulário transitional que misturava request, trace e referência de suporte.

Target usa IDs distintos (`request_id`, `trace_id`, `reference_id`) conforme a função.

---

## 12. Regras de uso do glossário

1. Um termo canônico possui um significado principal.
2. Se o código legacy usa a mesma palavra com semântica diferente, adicionar prefixo `Legacy` ou registrar alias transitional durante a migração.
3. Novas features devem reutilizar termos canônicos antes de criar sinônimos.
4. Alteração semântica material deste glossário exige revisar documentos/ADRs relacionados.
5. `V2`, `New` e `Final` são nomes transitórios; após Contract o nome canônico volta a ser o domínio normal.
6. Termos de UI podem ser mais amigáveis que nomes internos, desde que não alterem a semântica arquitetural.
7. `correlation` descreve relação entre sinais; não autoriza criar um único `correlation_id` universal para todos os usos.
