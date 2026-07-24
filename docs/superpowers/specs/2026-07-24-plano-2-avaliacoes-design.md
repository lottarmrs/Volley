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
adicionar `community_id`, restringir escrita a owner/admin daquela comunidade, e criar
uma autoavaliação de verdade (tabela nova, separada, nunca entra no pool de agregação).
Reaproveitar a lógica de rejeição de outliers já testada (`aggregatePlayerEvaluations`)
para a agregação por comunidade — isso não é o design ponderado/com âncora objetiva que
foi adiado (ver `multi-evaluation-attributes-design`), é só reuso de código já testado em
vez de escrever uma média simples do zero. Continua **sem** peso por papel, **sem**
âncora objetiva via `point_events`, **sem** agregação global cross-comunidade — essas três
seguem adiadas como refinamento futuro, decisão já tomada e registrada.

## Objetivos

- `player_evaluations` ganha `community_id` (not null). Uma avaliação pertence a uma
  comunidade específica.
- RLS de INSERT/UPDATE/DELETE em `player_evaluations` passa a exigir
  `current_user_has_community_role(community_id, array['owner','admin'])` (função já
  existe, reutilizada sem alteração) — não mais "qualquer membro com acesso ao jogador".
- Agregação (`aggregatePlayerEvaluations`, já testada) roda por comunidade — cada
  comunidade tem sua própria média com rejeição de outliers, sem misturar com outras
  comunidades nem com autoavaliação.
- Nova tabela `self_evaluations`: autoavaliação de verdade, só o próprio jogador
  (`players.user_id = auth.uid()`) lê/escreve, nunca entra em `aggregatePlayerEvaluations`.
- Adaptar a UI de avaliação existente (não redesenhar) ao novo modelo — precisa agora
  saber em qual comunidade o avaliador está atuando (contexto que hoje não existe na
  chamada).

## Não objetivos

- Peso por papel, rejeição de outliers com constantes novas, âncora objetiva via
  `point_events`, ou qualquer agregação global cross-comunidade — decisão já tomada,
  registrada em `multi-evaluation-attributes-design` (memória) como refinamento futuro.
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

-- unique(owner_id, player_id) vira unique(owner_id, player_id, community_id).

create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- RLS: só players.user_id = auth.uid() lê/escreve o próprio registro.
```

`aggregatePlayerEvaluations` (função pura já existente, sem mudança de assinatura)
passa a ser chamada por comunidade — o call site em `applyEvaluationAggregate` (ou seu
substituto na camada de aplicação) filtra `evaluations` por `community_id` antes de
agregar, uma vez por comunidade em que o jogador está.

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

Peso por papel, âncora objetiva via `point_events`, agregação global cross-comunidade —
ver memória `multi-evaluation-attributes-design`, já marcada como adiada até os Planos
3-5 do programa fecharem.

## Testes

- **Banco/RLS**: matriz para anonymous/member/moderator/admin/owner/staff em
  `player_evaluations` (escrita agora exige owner/admin da comunidade específica) e
  `self_evaluations`. Confirmar que `moderator` NÃO pode escrever avaliação oficial.
- **Domínio**: `aggregatePlayerEvaluations` chamada por comunidade produz agregados
  independentes (sem regressão nos testes existentes de outlier rejection).
- **Integração**: autoavaliação nunca aparece em `aggregatePlayerEvaluations`;
  avaliação de uma comunidade não vaza para a agregação de outra.

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec base,
  seção 8 e "Não objetivos")
- `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (programa de 5 planos)
- Memória `multi-evaluation-attributes-design` (design de agregação ponderada — adiado)
- `src/logic/playerEvaluations.ts`, `src/infra/supabase/playerEvaluationCloudService.ts`
  (sistema existente sendo evoluído por este plano)
