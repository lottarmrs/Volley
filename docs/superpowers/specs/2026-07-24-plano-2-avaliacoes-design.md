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
   avaliação oficial, sem agregação.

Este documento escopa apenas o item 3 — a única frente do Plano 2 original ainda não
entregue. Itens 1 e 2 são tratados como já concluídos e não são reabertos aqui.

Existe uma memória de design de 2026-06-10 (`multi-evaluation-attributes-design`,
anterior ao spec base de 2026-07-22) com um design "locked" para agregação de atributos:
pesos por papel, rejeição de outliers, âncora objetiva via `point_events`, agregação
global normalizada por comunidade. O spec base de 2026-07-22, seção 8, descreve algo mais
simples (autoavaliação + avaliação oficial por comunidade, sem agregação ponderada, sem
média global) e lista explicitamente "criar uma nota oficial global na primeira versão"
como não-objetivo.

**Decisão do usuário:** seguir o design completo de 2026-06-10 para a avaliação oficial,
não a versão simplificada do spec base. Isso é um desvio deliberado do spec base — ver
seção "Desvio do spec base" abaixo.

## Objetivos

- Separar autoavaliação (informativa, editável só pelo próprio jogador) de avaliação
  oficial (por comunidade, só owner/admin/moderator).
- Implementar o pipeline de agregação ponderada da memória de 2026-06-10 para a avaliação
  oficial: pesos por papel, rejeição de outliers role-blind, âncora objetiva via
  `point_events`, agregação global normalizada por comunidade.
- Tornar `players.atributos` um valor derivado (cache), não mais autorado diretamente.
- Reutilizar `current_user_has_community_role` (já existe) para RLS/RPC de avaliação
  oficial.
- Adaptar a UI de avaliação existente (não redesenhar) ao novo modelo.

## Não objetivos

- Redesenhar telas ou criar novas telas de avaliação — UI congelada até os gates do
  Plano 5, por decisão explícita do usuário nesta sessão. Qualquer ajuste de UI é o
  mínimo necessário para expor a nova separação self/oficial na tela já existente.
- Decaimento por recência (avaliações são mutáveis por avaliador, sem acúmulo obsoleto —
  já descartado na memória original).
- Pesos configuráveis por comunidade — usar os defaults fixos (admin/owner peso 2,
  moderator/organizer peso 1, `W_OBJ` peso 1) por ora.
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
-- Nunca lido pelo pipeline de agregação oficial.

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
-- RLS: escrita restrita a current_user_has_community_role(community_id, array['owner','admin','moderator']).
-- community_id NOT NULL — a "semente global" da memória de 2026-06-10 deixa de existir
-- como conceito; o que ela representava (avaliação do admin criador) vira uma avaliação
-- oficial normal na comunidade em que o jogador foi criado.
```

`players.atributos` passa de campo autorado para cache computado (coluna
`atributos_cache jsonb` recalculada, não a coluna `Attributes` legada diretamente — a
forma exata da migração de transição fica para o plano de implementação).

## Pipeline de agregação (avaliação oficial apenas)

`src/logic/attributeAggregation.ts` (lógica pura, testável, sem I/O):

1. Coletar todos os valores de `player_evaluations.attributes` para o jogador, por
   comunidade.
2. Poda de outliers **role-blind**: por atributo, no pool global (todas as comunidades
   juntas), remover valores fora de mediana ± 3·MAD. Só aplica quando n ≥ 5; abaixo
   disso usa mediana sem poda.
3. Média ponderada dentro de cada comunidade: peso 2 para owner/admin, peso 1 para
   moderator.
4. Média entre comunidades: cada comunidade conta igualmente, independente do número de
   avaliadores.
5. Âncora objetiva (ver seção seguinte) entra como avaliador sintético adicional no passo 4.

## Âncora objetiva via point_events

Só para atributos com proxy direto: `saque`, `ataque`, `bloqueio` (os únicos com um
`kind`/skill correspondente na taxonomia de `point_events`). `controleEmocional`,
`leituraDeJogo`, `resistencia` nunca têm âncora objetiva.

- Requer `MIN_GAMES_FOR_OBJ = 3` jogos do jogador para entrar no pipeline.
- Peso `W_OBJ = 1` (default), mesmo nível que uma comunidade individual no passo 4.
- A fórmula exata de conversão `point_events → valor 0-10 do atributo` fica para o plano
  de implementação (depende de como os `kind`s de ponto já se mapeiam a saque/ataque/
  bloqueio — investigar a taxonomia existente em
  `supabase/migrations/20260615200155_point_event_taxonomy.sql` e
  `20260618154732_point_event_kind_and_assist.sql` antes de codificar).

## Recompute

RPC `security definer` explícita (não trigger automático), chamada logo após
insert/update em `player_evaluations`. Justificativa: a agregação lê `point_events` e
`community_members` (papéis) além da própria tabela de avaliações — mais natural como
função explícita do que como lógica dentro de um trigger de linha. Nome exato da RPC e
se o recompute roda síncrono (bloqueia a escrita) ou é disparado após o commit ficam
para o plano de implementação.

## Segurança

- `self_evaluations`: RLS via `players.user_id = auth.uid()`, mesmo padrão de outras
  tabelas "dono edita o próprio registro".
- `player_evaluations`: RLS de escrita via `current_user_has_community_role` (já existe,
  reutilizado sem alteração). Leitura segue o padrão já usado por outras tabelas de
  comunidade (membros leem, `is_app_staff()` sempre lê).
- Nenhuma nova função `SECURITY DEFINER` além da RPC de recompute; ela segue o padrão já
  estabelecido (`set search_path = public`, revoke de `public/anon`, grant mínimo).

## UI

Não-objetivo (ver seção acima). Adaptar a tela de avaliação já existente (implementada
2026-06-18, mencionada na memória `facilitator-gamification-design`) para:
- gravar em `player_evaluations` (com `community_id`) em vez da tabela antiga de
  avaliação única;
- expor um campo/seção separado, mínimo, para autoavaliação (`self_evaluations`).

Nenhuma tela nova. Nenhuma mudança de navegação.

## Desvio do spec base

O spec base de 2026-07-22 lista "criar uma nota oficial global na primeira versão" como
não-objetivo (seção 3) e reforça em 8.2 "não existe média oficial global na primeira
versão". Este plano contraria isso deliberadamente, por escolha do usuário: a agregação
oficial É global (normalizada por comunidade), seguindo o design mais completo da
memória de 2026-06-10 em vez da versão simplificada do spec base. Registrado aqui para
rastreabilidade — não é uma omissão, é uma decisão explícita.

## Testes

- **Domínio (puro)**: poda de outliers (com e sem amostra suficiente), média ponderada
  por comunidade, agregação entre comunidades, inclusão/exclusão da âncora objetiva
  (com e sem `MIN_GAMES_FOR_OBJ` atingido), atributos sem proxy nunca recebem âncora.
- **Banco/RLS**: matriz para anonymous/member/moderator/admin/owner/staff em
  `self_evaluations` e `player_evaluations` — caminho permitido e negado para cada papel.
- **Integração**: escrita de avaliação oficial dispara recompute; escrita de
  autoavaliação nunca dispara recompute; múltiplas comunidades agregam corretamente.

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec base,
  seção 8 e "Não objetivos")
- `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (programa de 5 planos)
- Memória `multi-evaluation-attributes-design` (design de agregação de 2026-06-10)
- Memória `facilitator-gamification-design` (UI de avaliação existente, 2026-06-18)
