# Plano 2 Atualizado: Avaliações — Design

## Contexto

O programa Produto Escalável (`docs/superpowers/plans/2026-07-22-scalable-product-program.md`,
spec base `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`)
define cinco planos. O Plano 1 (Account Identity & Auth Foundation) foi entregue e está
em `main`. O Plano 2 original ("Player Claim, Communities & Evaluations") cobria três
frentes:

1. **Claim de jogador histórico** — entregue nesta sessão (Plan A: código de claim no
   cadastro; Plan B: remoção completa do antigo sistema de proposta/aprovação).
2. **Comunidades** (descoberta, pedidos, convites, RBAC) — já existia antes desta sessão.
3. **Avaliações** — parcialmente entregue, mais avançado do que o brainstorm inicial
   assumiu (ver correção abaixo).

Este documento escopa apenas o item 3.

**Correção de premissa (descoberta ao mapear arquivos para o plano):** o brainstorm
inicial assumiu que avaliações eram inexistentes no código. Na verdade já existe um
sistema funcionando em produção: `src/logic/playerEvaluations.ts`,
`src/infra/supabase/playerEvaluationCloudService.ts`, tabela `public.player_evaluations`
com RLS ativa. O que existe hoje:

- `aggregatePlayerEvaluations`: agrega múltiplos avaliadores por jogador com rejeição de
  outliers já implementada (mediana ± MAD, sem peso por papel).
- `player.atributos`: já é um valor **derivado** (consenso), não autorado diretamente.
- `player.personalAttributes`: "minha avaliação como avaliador deste jogador" — mas
  **qualquer membro da comunidade** pode ser esse avaliador, inclusive, sem nenhuma regra
  especial, o próprio jogador avaliando a si mesmo.
- RLS atual (`schema.sql:467-483`): INSERT/UPDATE/DELETE restrito a
  `owner_id = auth.uid() AND current_user_can_access_player(player_id)` — **qualquer**
  membro com acesso ao jogador pode avaliar, não só owner/admin.
- `current_user_can_access_player` (`schema.sql:147+`) é um OR entre staff, dono do
  player, e membership em **qualquer** comunidade compartilhada — não sabe "para qual
  comunidade" a avaliação é, porque essa dimensão não existe na tabela hoje.
- Um jogador em múltiplas comunidades tem hoje uma única agregação **global**, misturando
  avaliadores de todas elas.

Isso quebra duas premissas do spec base (seção 8.2): "só owner/admin avalia" e
"autoavaliação separada, nunca entra na nota oficial". Nenhuma das duas é verdade hoje.

**Decisão do usuário:** evoluir o sistema existente em vez de criar um paralelo do zero —
adicionar `community_id` (para autorização, não para isolar a agregação — ver Objetivos),
restringir escrita a owner/admin daquela comunidade, e criar uma autoavaliação de verdade
(tabela nova, separada, nunca entra no pool de agregação). `aggregatePlayerEvaluations`
(já testada, com rejeição de outliers) continua sendo usada exatamente como hoje, sem
mudança de comportamento. Continua **sem** peso por papel, **sem** âncora objetiva via
`point_events`, **sem** isolamento de agregação por comunidade — as três seguem adiadas
como refinamento futuro, decisão já tomada e registrada.

## Objetivos

- `player_evaluations` ganha `community_id` (not null) — só para **autorização e
  rastreabilidade** de quem escreveu a avaliação, não para isolar a agregação (ver
  decisão abaixo).
- RLS de INSERT/UPDATE/DELETE em `player_evaluations` passa a exigir
  `current_user_has_community_role(community_id, array['owner','admin'])` (função já
  existe, reutilizada sem alteração) — não mais "qualquer membro com acesso ao jogador".
- Continua exatamente uma avaliação por `(owner_id, player_id)` — a constraint de
  unicidade **não muda**. `community_id` registra em qual comunidade aquela avaliação foi
  autorizada, não cria múltiplas avaliações por avaliador.
- **Decisão explícita:** a agregação (`aggregatePlayerEvaluations`, já testada) continua
  **global** — todas as avaliações de um jogador entram no mesmo pool, como hoje. Isolar
  a agregação por comunidade (spec base 8.2, "sem misturar") foi avaliado e adiado, porque
  exigiria tornar `Player.atributos` contextual à comunidade ativa, tocando `balancing.ts`
  e o formato de sync — fora do escopo deste plano. `player.atributos`,
  `evaluationAggregate`, `personalAttributes`, `hasOwnEvaluation`, `balancing.ts`, e o
  payload de sync **não mudam de forma nenhuma** além de `PlayerEvaluation` ganhar o
  campo `communityId`.
- Nova tabela `self_evaluations`: autoavaliação de verdade, só o próprio jogador
  (`players.user_id = auth.uid()`) lê/escreve, nunca entra em `aggregatePlayerEvaluations`.
- Adaptar a UI de avaliação existente (não redesenhar) ao novo modelo — precisa agora
  saber em qual comunidade o avaliador está atuando, para submeter o `community_id`
  correto na escrita (contexto que hoje não existe na chamada).

## Não objetivos

- Peso por papel, rejeição de outliers com constantes novas, âncora objetiva via
  `point_events`, ou **agregação isolada por comunidade** (spec base pedia "sem misturar
  comunidades" — adiado nesta sessão por exigir mudanças em `balancing.ts`/`Player`, fora
  de escopo) — tudo registrado em `multi-evaluation-attributes-design` (memória) como
  refinamento futuro.
- Qualquer mudança em `balancing.ts`, no formato de `Player.atributos`/
  `evaluationAggregate`, ou no payload de sync além de `PlayerEvaluation.communityId`.
- Redesenhar telas ou criar navegação nova — UI congelada até os gates do Plano 5, ajuste
  mínimo apenas para adicionar contexto de comunidade e a superfície de autoavaliação.
- Migrar dados existentes de `player_evaluations` — produção foi resetada (Plan A/B),
  zero avaliações reais existem hoje. É alteração de schema limpa, não migração de dados.
- Mudar `current_user_can_access_player` ou qualquer outra função de acesso não
  relacionada a avaliações.
- Reabrir claim ou comunidades (itens 1 e 2 do Plano 2 original, já entregues).

## Modelo de dados

```sql
-- Alteração em player_evaluations existente (schema limpo, sem dados a preservar):
alter table public.player_evaluations
  add column community_id uuid references public.communities(id) on delete cascade;
-- (vira not null depois de preenchida; ver plano de implementação para ordem exata dos
-- passos de alter table + backfill/constraint, já que a tabela pode não estar
-- literalmente vazia no momento exato da migração real — confirmar contagem antes de
-- aplicar not null diretamente.)

-- unique(owner_id, player_id) NÃO muda — continua uma avaliação por avaliador/jogador.
-- community_id só registra em qual comunidade aquela escrita foi autorizada.

create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- RLS: só players.user_id = auth.uid() lê/escreve o próprio registro.
```

`aggregatePlayerEvaluations`/`applyEvaluationAggregate` **não mudam** — continuam
recebendo todas as avaliações do jogador e agregando globalmente, exatamente como hoje
(`syncService.ts:1367-1379`). `community_id` só existe na tabela/tipo, não entra na
lógica de agregação.

## Segurança

- `player_evaluations`: RLS de escrita trocada de "qualquer membro com acesso ao
  jogador" para `current_user_has_community_role(community_id, array['owner','admin'])`
  (reuso direto, sem nova função). Leitura mantém o padrão atual (dono da avaliação ou
  quem acessa o jogador).
- `self_evaluations`: RLS via `players.user_id = auth.uid()`, mesmo padrão de outras
  tabelas "dono edita o próprio registro".
- Nenhuma função `SECURITY DEFINER` nova.

## UI

Não-objetivo além do mínimo. A tela de avaliação existente precisa passar a saber "em
qual comunidade" o avaliador está agindo (hoje essa informação não existe no fluxo) —
provavelmente já disponível via contexto de comunidade ativa na navegação atual, a
confirmar ao mapear o componente exato no plano de implementação. Adicionar uma
superfície mínima para autoavaliação (`self_evaluations`), sem tela nova nem mudança de
navegação.

## Refinamento futuro (explicitamente fora deste plano)

Peso por papel, âncora objetiva via `point_events`, e **agregação isolada por
comunidade** (exige tornar `Player.atributos` contextual e tocar `balancing.ts`) — ver
memória `multi-evaluation-attributes-design`, já marcada como adiada até os Planos 3-5
do programa fecharem.

## Testes

- **Banco/RLS**: matriz para anonymous/member/moderator/admin/owner/staff em
  `player_evaluations` (escrita agora exige owner/admin da comunidade específica) e
  `self_evaluations`. Confirmar que `moderator` NÃO pode escrever avaliação oficial.
  Confirmar que owner/admin de uma comunidade não consegue escrever com `community_id`
  de uma comunidade da qual não é owner/admin (mesmo tendo acesso ao jogador via outra
  comunidade).
- **Domínio**: nenhuma regressão nos testes existentes de `aggregatePlayerEvaluations`/
  `simulateLocalConsensus` — o comportamento de agregação global não muda.
- **Integração**: autoavaliação (`self_evaluations`) nunca aparece em
  `aggregatePlayerEvaluations`; `PlayerEvaluation.communityId` é persistido e
  sincronizado corretamente end-to-end (upload/download).

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec base,
  seção 8 e "Não objetivos")
- `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (programa de 5 planos)
- Memória `multi-evaluation-attributes-design` (design de agregação ponderada — adiado)
- `src/logic/playerEvaluations.ts`, `src/infra/supabase/playerEvaluationCloudService.ts`
  (sistema existente sendo evoluído por este plano)
