# Architecture Principles — Volley

> Status: `DRAFT-CANONICAL / C2.00`
>
> Este documento define princípios arquiteturais de alta estabilidade. Ele não substitui ADRs nem os documentos N2.01–N2.23. Quando uma decisão futura precisar violar um princípio aqui, ela deve ser tratada explicitamente por ADR e revisão arquitetural.

---

## P-001 — Uma única autoridade por aggregate

Duas implementações podem coexistir durante migração; duas autoridades de escrita para o mesmo aggregate não.

```text
ALLOWED
Legacy implementation
New implementation
→ cohorts diferentes

FORBIDDEN
Legacy writes
↕ bidirectional sync
New writes
para o mesmo aggregate
```

Consequências:

- cutovers devem ser por aggregate/cohort quando necessário;
- compatibility adapters são one-way e não autoritativos;
- timestamp/LWW não decide qual modelo vence;
- feature flag não muda retroativamente a engine de aggregate já criado.

---

## P-002 — Browser e payload do cliente são não confiáveis

O frontend conduz UX; ele não concede autoridade.

O servidor resolve:

- `auth.uid()`;
- contexto real do recurso;
- Membership atual;
- governance role atual;
- operational responsibilities atuais;
- capability aplicável;
- revision / sequence / control epoch atuais.

Nunca confiar no payload para:

- actor identity;
- role;
- capability;
- score final;
- queue position;
- official result;
- derived projection;
- timestamps como ordenação compartilhada.

---

## P-003 — Shared mutable state é server-authoritative

Estado compartilhado crítico pertence ao servidor/Postgres.

São online-authoritative, salvo ADR contrário:

- Community governance;
- join requests;
- Membership/roles/responsibilities;
- Registration join/leave/capacity/promotion;
- participant voting compartilhado;
- TeamDraw confirmation compartilhada;
- Competition administration;
- OfficialCompetitionResult;
- Match control takeover.

Offline não significa “editar local e sincronizar depois” por padrão.

---

## P-004 — Offline é definido por operação, não pelo aplicativo inteiro

Cada operação deve ser classificada explicitamente:

```text
ONLINE_AUTHORITATIVE
OFFLINE_OWNED
CACHED_READ
LOCAL_DRAFT
CONDITIONALLY_OFFLINE_COMMAND
```

Exemplos:

- Quick Session: offline-owned até authority handoff explícito;
- Community registration: write online-only;
- voting compartilhado: online-only;
- team solver: pode calcular offline a partir de snapshot congelado;
- Match controller: pode possuir protocolo leased/ordered offline específico.

Não existe outbox genérica para qualquer mutation.

---

## P-005 — User, Player e Participant são conceitos diferentes

```text
User
= identidade autenticada

Player
= identidade esportiva persistente

Participant
= participação histórica/operacional em Session/Match
```

Consequências:

- User pode não ser Player;
- Player pode não ter account;
- Guest pode participar sem criar Player;
- account deletion não apaga automaticamente a identidade/fato esportivo;
- historical participation usa snapshots apropriados.

---

## P-006 — CommunityMembership e CommunityPlayer são relações diferentes

```text
CommunityMembership
= account/governance/access relation

CommunityPlayer
= sports relation
```

Uma não deve ser inferida automaticamente da outra.

Player sem account pode existir na Community como atleta.

---

## P-007 — Organizer não é governance role

Organizer representa responsabilidade operacional esportiva.

Modelo base:

```text
CommunityMembership
├── governance_role: OWNER | ADMIN | MEMBER
└── operational_responsibilities
    └── ORGANIZER
```

Organizer pode, conforme assignment/capability:

- criar/organizar Session;
- configurar Session;
- abrir/administrar aspectos operacionais da Session;
- preparar/start/control Match;
- registrar/corrigir eventos esportivos;
- avaliar Players.

Organizer não ganha automaticamente:

- editar Community;
- alterar roles;
- remover membros;
- transferir ownership;
- administrar Competition;
- aplicar penalties competitivas.

Owner/Admin não ganha automaticamente responsabilidade esportiva de Organizer.

---

## P-008 — Capability é contextual e prevalece sobre hierarquia genérica de roles

Autorização responde:

> O ator possui a capability X sobre este recurso no contexto real Y?

Não:

> O ator tem uma role “alta o bastante”?

Capabilities futuras podem incluir, por exemplo:

```text
session.create
session.manage
match.control
players.evaluate
community.members.manage
community.ownership.transfer
competition.results.officialize
competition.penalties.manage
```

---

## P-009 — Registration intent e participação efetiva são diferentes

```text
RegistrationEntry
= intenção/estado de inscrição

SessionParticipant
= participação efetiva materializada
```

Waitlisted não é Participant.

FinalizeRoster converte estado de registration em roster/participants de forma explícita e revisionada.

---

## P-010 — FIFO de Registration é autoritativo e transacional

- queue sequence é server-authoritative;
- Join serializa mutation relevante da RegistrationWindow;
- Leave + promoção do primeiro elegível ocorre na mesma transação;
- capacity e promotion não usam LWW;
- writes de Registration são online-only;
- retries usam idempotência.

---

## P-011 — Team Balancer usa atributos, nunca Overall

Regra não negociável:

```text
BALANCER INPUT
=
attribute vector
+ positions/composition
+ hard constraints
+ soft objectives

NOT overall
```

Overall é derivado e pode servir a:

- display;
- ranking;
- explicação;

mas não ao optimizer.

Modificar somente Overall, mantendo inputs reais iguais, não pode alterar solução canônica do solver.

---

## P-012 — Ratings são agregados hierarquicamente por atributo

Pipeline canônico:

```text
Organizer evaluations
per Community
      ↓
Community Skill Profile
per attribute
      ↓
Global Skill Profile
per attribute
      ├── Derived Overall
      └── Team Balance Input
```

Não agregar diretamente todas as avaliações individuais globais.

Uma Community com muitos Organizers não ganha automaticamente peso global proporcional ao número de avaliadores.

Missing attribute não é zero.

---

## P-013 — Source facts e projections são conceitos diferentes

Source facts preservam o que ocorreu.

Projections são derivados reconstruíveis.

Exemplos:

```text
PlayerEvaluationRevision → fact/source
CommunitySkillProfile   → projection

MatchEvent              → fact/source
MatchProjection         → projection

OfficialCompetitionResult → authoritative fact
StandingsProjection       → projection
```

Quando projection diverge de source, source vence e projection é reconstruída.

---

## P-014 — Fixture e Match são conceitos distintos

```text
Fixture
= planejamento / pairing / schedule / slot dependency

Match
= execução esportiva concreta
```

Um Fixture pode permitir mais de uma execução Match em casos de replay/invalidation conforme policy.

Competition avança a partir de resultado oficial, não simplesmente porque uma Match terminou.

---

## P-015 — Match recebe Commands; cliente não grava placar diretamente

Cliente envia intenção como:

```text
AwardPoint
PauseMatch
ResumeMatch
RevertMatchEvent
FinishMatch
```

Servidor:

1. autoriza;
2. verifica Match state;
3. verifica control epoch;
4. verifica expected sequence;
5. aplica Rules;
6. produz MatchEvent(s);
7. atualiza MatchProjection;
8. commita;
9. responde.

Cliente não é autoridade sobre `scoreAfter` ou `winner`.

---

## P-016 — Match usa sequência autoritativa e nunca LWW

Cada MatchEvent tem `sequence` única dentro da Match.

```text
replay(effective MatchEvents)
==
MatchProjection
```

Conflitos offline não são resolvidos comparando `updated_at`.

Controle usa lease/epoch; commands de epoch antigo são rejeitados após takeover.

---

## P-017 — Realtime transporta mudanças; não define verdade

Mutation path:

```text
Command
↓
Server transaction
↓
COMMIT
↓
Realtime
↓
other clients
```

Realtime:

- não é source of truth;
- não é command bus;
- não substitui Notification;
- não substitui offline sync/reconciliation;
- pode perder mensagens.

Clients usam revision/sequence + snapshot/reconciliation para convergir.

---

## P-018 — Subscription e snapshot precisam de reconciliação de versão

Para evitar race durante entrada no channel:

```text
1. subscribe
2. buffer events
3. fetch authoritative snapshot
4. snapshot carries revision/last_sequence
5. discard buffered <= snapshot
6. apply contiguous newer events
7. gap → recover/refetch
```

Reconnect exige reconciliation; socket conectado não significa domínio sincronizado.

---

## P-019 — Presence é efêmera

Presence pode indicar:

- viewer online;
- presença temporária;
- indicador de controller conectado.

Presence nunca determina:

- Membership;
- Registration;
- attendance oficial;
- Match authority;
- score;
- vote;
- capability.

---

## P-020 — Commands semânticos substituem CRUD crítico

API responde a intenção de negócio.

Preferir:

```text
JoinRegistration
LeaveRegistration
TransferOwnership
AwardPoint
OfficializeResult
```

em vez de:

```text
updateRow
saveGame
upsertCommunity
```

Database Row, Domain Model, Command DTO e Query/View DTO são artefatos diferentes.

---

## P-021 — Actor nunca vem do payload

Para command autenticado:

```text
actor = authenticated identity resolved server-side
```

Campos como `actorUserId`, `role`, `isAdmin` fornecidos pelo cliente não concedem privilégio.

---

## P-022 — Commands críticos são idempotentes

Uma mutation relevante possui `command_id` estável.

Timeout não significa failure.

```text
same logical command
+ same command_id
→ at most one logical effect
```

Domain uniqueness continua protegendo double-click com command IDs diferentes.

---

## P-023 — `updated_at` não é mecanismo genérico de concorrência

Para shared mutable state:

- revision protege optimistic concurrency quando necessário;
- Match usa sequence;
- Registration serializa Window;
- Match control usa epoch;
- FIFO usa queue sequence.

Timestamp do client é descritivo; não autoritativo para ordenação compartilhada.

---

## P-024 — Postgres é modelo relacional autoritativo, não clone de TypeScript

Preferir estruturas relacionais para:

- identidade;
- relacionamentos;
- autorização;
- ordering;
- constraints;
- concorrência.

JSONB é aceitável onde flexibilidade/versionamento é realmente parte do modelo, como snapshots/event payloads, sem esconder relações essenciais.

Arrays de IDs não substituem join tables quando IDs possuem semântica relacional/FK.

---

## P-025 — Lifecycle de domínio não é soft delete universal

Não usar `deleted_at` como estado genérico para tudo.

Preferir lifecycle explícito:

```text
ACTIVE
ARCHIVED
REMOVED
LEFT
CANCELLED
INVALIDATED
SUPERSEDED
```

conforme bounded context.

`deleted_at` só existe quando possui significado técnico/retention próprio.

---

## P-026 — RLS, Application Authorization e constraints são defense in depth

Nenhuma camada isolada substitui as outras.

- UI visibility melhora UX;
- Application/RPC valida intenção e capability;
- RLS protege acesso a linhas expostas;
- grants reduzem surface;
- constraints protegem integridade estrutural.

Funções `SECURITY DEFINER` são endpoints privilegiados e exigem review/hardening específico.

---

## P-027 — Community é boundary organizacional/security, não tenant rígido universal

Player é global e pode participar em várias Communities.

Não colocar `community_id` automaticamente em toda tabela apenas por multi-tenancy.

Contexto é modelado onde semanticamente pertence; denormalização por performance/security exige consistência explícita.

---

## P-028 — Dados pessoais são minimizados por finalidade

Nova coleta deve responder:

- por que é necessária;
- quem a vê;
- por quanto tempo;
- qual tratamento/compartilhamento ocorre;
- como titular acessa/corrige/remove quando aplicável.

Não coletar “para talvez usar depois”.

Privacy by default deve ser preferida.

---

## P-029 — Audit, Domain History e Telemetry são separados

```text
Domain History
= fatos do produto/esporte

Audit
= ações administrativas relevantes

Telemetry
= comportamento técnico/operacional
```

Logs não são source of truth do domínio.

Telemetry não deve duplicar desnecessariamente PII, votos ou avaliações.

---

## P-030 — Provider externo não participa da transação crítica do domínio

Exemplo proibido:

```text
BEGIN
promote waitlisted user
call push provider
provider timeout
ROLLBACK
```

Correto:

```text
BEGIN
state + domain outbox
COMMIT
↓
worker
↓
provider
```

Notifications/Media cleanup/etc. usam eventual processing quando apropriado.

---

## P-031 — At-least-once + idempotência é preferido a promessas de exactly-once distribuído

Workers podem executar a mesma mensagem mais de uma vez.

Consumers são idempotentes.

Poison messages são isoladas e observáveis.

---

## P-032 — Projections importantes precisam ser realmente rebuildable

Cada projection relevante declara:

- source facts;
- source version/sequence;
- calculation version;
- rebuild procedure;
- invariants de equivalência.

“Rebuildable” deve possuir teste executável.

---

## P-033 — Performance é otimizada por contexto e evidência

Operational commands não devem escanear história total.

```text
cost(current operation)
≈
size(current aggregate/context)
```

Não introduzir Redis, search engine, warehouse, partitioning ou microservices sem trigger mensurável.

---

## P-034 — Correctness e segurança não são sacrificadas por micro-otimização

Exemplos proibidos sem ADR explícito:

- remover RLS para ganhar performance;
- voltar a usar Overall como atalho do solver;
- não persistir Match event para economizar storage;
- confiar em JWT stale de Community para evitar lookup crítico;
- usar public Realtime channel apenas para reduzir auth overhead.

---

## P-035 — Testes são orientados por invariantes e risco

Mocks não provam RLS ou concorrência real.

Camadas de prova incluem:

- pure/domain;
- property-based;
- application contract;
- Postgres/RLS/RPC integration;
- concurrency;
- offline/reconciliation;
- Realtime;
- E2E;
- security;
- migration;
- performance;
- recovery/restore drills.

Coverage percentual sozinho não certifica qualidade.

---

## P-036 — Migrations versionadas são a fonte de verdade do schema

Schema snapshots consolidados podem existir como artefato gerado/verificado, não segunda source manual.

Database evolution segue:

```text
EXPAND
MIGRATE
VERIFY
CONTRACT
```

Migrations aplicadas em produção não são reescritas retroativamente.

---

## P-037 — Migração usa Strangler por vertical slices

- novos módulos nascem na arquitetura target;
- legacy perde responsabilidades monotonicamente;
- historical backfill não bloqueia novos writes quando cohort cutover é seguro;
- adapters possuem critério de remoção desde a criação;
- global sync não recebe novas responsabilidades.

---

## P-038 — Legacy não contamina o domínio canônico

Compatibility/import logic fica em boundary explícita.

Preferir nomes como:

```text
LegacyGame
LegacySessionDTO
LegacyImporter
```

Novo Domain Model não carrega `cloudId`, `localId`, `syncStatus` apenas para satisfazer legado.

---

## P-039 — Arquitetura evolui por evidência, não por moda

Nova infraestrutura relevante exige:

- problema concreto;
- alternativas;
- impactos;
- custo operacional;
- segurança/privacy;
- failure modes;
- migration;
- exit strategy;
- review trigger.

Microservices, Redis, CRDTs, multi-region active-active e similares não são evolução automática do produto.

---

## P-040 — Toda decisão de alto custo deve preservar reversibilidade razoável

Reversibilidade não significa que toda mudança é trivialmente reversível.

Significa evitar lock-in desnecessário por design, por exemplo:

- MediaAsset referencia asset, não URL de provider;
- Application usa ports, não Supabase espalhado pelo domínio;
- Realtime contracts pertencem ao domínio, não ao SDK;
- engine versioning permite cohort cutover;
- migrations additive permitem rollback de código.

---

## P-041 — Documentation, tests e code precisam convergir

Se código contradiz ADR/documento aceito, existem duas possibilidades:

1. código possui bug;
2. arquitetura mudou e precisa de novo ADR/documentação.

Divergência silenciosa não é aceitável.

---

## P-042 — Se não sabemos a source of truth, o design não está concluído

Pergunta obrigatória para qualquer estado duplicado:

> Se A e B divergirem, qual vence e por quê?

Se a resposta for “o mais recente”, “o que o client tiver”, “depois sincroniza” ou não existir, o desenho precisa ser revisto.
