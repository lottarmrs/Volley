# Plano 2 Atualizado: Avaliações — Design

## Contexto

O programa Produto Escalável (`docs/superpowers/plans/2026-07-22-scalable-product-program.md`,
spec base `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`)
define cinco planos. O Plano 1 (Account Identity & Auth Foundation) foi entregue e está
em `main`. O Plano 2 original ("Player Claim, Communities & Evaluations") cobria três
frentes:

1. **Claim de jogador histórico** — entregue nesta sessão (Plan A: código de claim no
   cadastro; Plan B: remoção completa do antigo sistema de proposta/aprovação), mas de
   forma mais simples do que a seção 7.3 do spec base descrevia (sem aprovação da
   comunidade — o código é a prova de autorização).
2. **Comunidades** (descoberta, pedidos, convites, RBAC) — já existia antes desta sessão
   inteira. `search_public_communities`, `request_to_join_public`/`request_to_join_community`,
   `approve_join_request`/`reject_join_request`, `set_community_member_role`,
   `remove_community_member`, `generate_join_code`/`disable_join_code`,
   `find_community_by_code` já estão migrados e em produção.
3. **Avaliações** (autoavaliação global separada de avaliação oficial por comunidade) —
   **não entregue**. `public.player_evaluations` hoje é uma tabela única com
   `unique(owner_id, player_id)`, sem `community_id`, sem distinção entre autoavaliação e
   avaliação oficial.

Este documento escopa apenas o item 3 — a única frente do Plano 2 original ainda não
entregue. Itens 1 e 2 são tratados como já concluídos e não são reabertos aqui.

**Decisão do usuário (revisada nesta sessão):** seguir a versão simples do spec base
(seção 8), não o design de agregação ponderada de uma memória de 2026-06-10
(`multi-evaluation-attributes-design`). Esse design mais complexo — pesos por papel,
rejeição de outliers, âncora objetiva via `point_events`, agregação global — foi
avaliado e descartado *para este plano* por contrariar o próprio princípio de
consolidação do programa Produto Escalável (YAGNI, evitar complexidade nova antes de
fechar identidade/domínio/offline/cutover). Fica registrado como refinamento futuro
possível, não como escopo deste plano — ver seção "Refinamento futuro" abaixo.

## Objetivos

- Separar autoavaliação (informativa, editável só pelo próprio jogador) de avaliação
  oficial (por comunidade, só owner/admin, conforme spec base seção 8.2).
- Cada avaliação oficial é contextual a uma comunidade: no máximo uma por
  `(community_id, player_id, evaluator_user_id)`.
- Média oficial calculada por comunidade, sem misturar com autoavaliação.
- Reutilizar `current_user_has_community_role` (já existe) para RLS/RPC de avaliação
  oficial.
- Adaptar a UI de avaliação existente (não redesenhar) ao novo modelo.

## Não objetivos

- Agregação ponderada por papel, rejeição de outliers, âncora objetiva via
  `point_events`, ou qualquer média oficial **global** cross-comunidade — explicitamente
  fora do spec base (seção 3 e 8.2) e fora deste plano. Ver "Refinamento futuro".
- Redesenhar telas ou criar novas telas de avaliação — UI congelada até os gates do
  Plano 5, por decisão explícita do usuário nesta sessão. Qualquer ajuste de UI é o
  mínimo necessário para expor a separação self/oficial na tela já existente.
- Decaimento por recência.
- Pesos configuráveis por comunidade.
- Reabrir claim ou comunidades (itens 1 e 2 do Plano 2 original, já entregues).

## Modelo de dados

Produção foi resetada (Plan A/B, sessão anterior) — zero avaliações reais existem hoje.
O redesenho abaixo não precisa de migração de dados, só de schema novo.

```sql
create table public.self_evaluations (
  player_id uuid primary key references public.players(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- RLS: só o dono do player (players.user_id = auth.uid()) lê/escreve o próprio registro.
-- Puramente informativo — não alimenta nenhuma média oficial nem players.atributos.

create table public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  evaluator_id uuid not null references auth.users(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, community_id, evaluator_id)
);
-- RLS: escrita restrita a current_user_has_community_role(community_id, array['owner','admin']),
-- conforme spec base 8.2 ("Somente owner/admin autorizado avalia").
```

Sem tabela/coluna de cache global. A média oficial por comunidade é calculada sob
demanda (view ou query simples — `avg` não ponderado dos registros de
`player_evaluations` daquela comunidade), exibida apenas no contexto daquela comunidade.
`players.atributos` **não é tocado por este plano** — continua como está hoje (campo
autorado diretamente, fora do escopo desta separação self/oficial). Isso evita o
problema de "qual é o valor canônico global" inteiramente, consistente com o não-objetivo
do spec base.

## Segurança

- `self_evaluations`: RLS via `players.user_id = auth.uid()`, mesmo padrão de outras
  tabelas "dono edita o próprio registro".
- `player_evaluations`: RLS de escrita via `current_user_has_community_role` (já existe,
  reutilizado sem alteração), restrita a `owner`/`admin`. Leitura segue o padrão já usado
  por outras tabelas de comunidade (membros leem, `is_app_staff()` sempre lê).
- Nenhuma função `SECURITY DEFINER` nova além do que já existe — sem RPC de agregação
  complexa, a média por comunidade é uma query direta sob RLS.

## UI

Não-objetivo. Adaptar a tela de avaliação já existente (implementada 2026-06-18,
mencionada na memória `facilitator-gamification-design`) para:
- gravar em `player_evaluations` (com `community_id`) em vez da tabela antiga de
  avaliação única;
- expor um campo/seção separado, mínimo, para autoavaliação (`self_evaluations`).

Nenhuma tela nova. Nenhuma mudança de navegação.

## Refinamento futuro (explicitamente fora deste plano)

A memória `multi-evaluation-attributes-design` (2026-06-10) descreve um pipeline de
agregação ponderada mais robusto — pesos por papel, rejeição de outliers (MAD),
âncora objetiva via `point_events`, agregação global normalizada por comunidade,
produzindo um `players.atributos` derivado. Esse design resolve um problema real
(moderadores de comunidades diferentes avaliam com rigor distinto) que a versão simples
deste plano não resolve — cada comunidade fica isolada, sem nota canônica cross-comunidade.

Fica deliberadamente para depois: só faz sentido revisitar depois que os Planos 3-5 do
programa Produto Escalável fecharem (VUT/conquistas, offline cloud-first, contratos de
tela/cutover), como uma extensão sobre o modelo de dados aqui definido
(`player_evaluations` com `community_id` já dá a base necessária — o refinamento futuro
adicionaria agregação, não mudaria o schema base). Não recriar este documento quando
chegar a hora — atualizar a memória `multi-evaluation-attributes-design` com a decisão de
adiamento e o motivo.

## Testes

- **Banco/RLS**: matriz para anonymous/member/admin/owner/staff em `self_evaluations` e
  `player_evaluations` — caminho permitido e negado para cada papel. Confirmar que
  `moderator` NÃO pode escrever avaliação oficial (só owner/admin, por spec base 8.2).
- **Domínio**: cálculo da média por comunidade (unweighted), unicidade
  `(community_id, player_id, evaluator_id)`.
- **Integração**: autoavaliação nunca aparece em queries/telas de avaliação oficial e
  vice-versa.

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec base,
  seção 8 e "Não objetivos")
- `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (programa de 5 planos)
- Memória `multi-evaluation-attributes-design` (design de agregação de 2026-06-10 —
  refinamento futuro, não escopo deste plano)
- Memória `facilitator-gamification-design` (UI de avaliação existente, 2026-06-18)
