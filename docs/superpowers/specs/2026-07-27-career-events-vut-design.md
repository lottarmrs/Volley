# Plano 3: Eventos de Carreira, VUT Global e Conquistas — Design

## Contexto

Terceiro plano do Produto Escalável
(`docs/superpowers/plans/2026-07-22-scalable-product-program.md`, spec base
`docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`, seção 9).
Planos 1 e 2 estão em `main`.

**Correção de premissa (descoberta ao mapear o código):** o VUT e as conquistas **já
existem e funcionam**. `src/logic/futCards.ts` tem um motor completo — 79 conquistas em
`ACHIEVEMENT_CATALOG`, `resolveAchievements`, `buildVutCard`, tiers, molduras, química e
edições. `buildVutCard(player, ctx)` já é função pura, recebendo
`{sessions, teams, games, pointEvents, players, sessionReports}`. Os consumidores são
`FutCardModal` (exibição sob demanda) e `vutRevealUseCases` (revelação antes/depois).

O que **não** existe hoje, medido contra a seção 9 do spec base:

| Requisito do spec | Estado atual |
| --- | --- |
| Puro e determinístico | ✅ já é |
| **Global** (todas as comunidades) | ❌ calcula sobre o `ctx` recebido; com dados parciais gera card parcial sem sinalizar |
| Derivado de eventos **confirmados** | ❌ não há distinção confirmado/provisório |
| **Versionado** | ❌ nenhuma versão no cálculo |
| Recalculado no claim | ❌ não há caminho de recálculo |
| Persistido / consultável | ❌ nada em `schema.sql`; computado em memória |

Portanto este plano **não constrói o VUT** — ele torna confiável o VUT que já existe, e
depois amplia o catálogo sobre essa base.

## Objetivos

- Definir `career_events`: livro-razão de carreira **confirmada**, gerado no servidor.
- Tornar "confirmado" verdadeiro por construção — evento só existe se o dado chegou ao
  Postgres.
- Versionar o contrato de evento (`contract_version`).
- Garantir escopo global do VUT sem vazar em quais comunidades a pessoa joga.
- Dar um caminho de recálculo determinístico e idempotente (inclusive no claim).
- Ampliar catálogo e marcos narráveis **depois** que o modelo estiver estável (fase 3B).

## Não objetivos

- **Nenhuma tela nova.** A regra do programa congela a UI visível até os gates do Plano 5.
  A fase Experiência continua adiada.
- **Não persistir VUT nem estado de conquista.** Ambos permanecem derivados. Persistir
  criaria cache que envelhece em silêncio; "recalculável" é a propriedade que o spec pede.
- Não tocar avaliações (`player_evaluations`, `self_evaluations`) — domínio do Plano 2.
  Avaliação não altera VUT, conforme spec base 9.
- Não reescrever as 79 conquistas existentes. Elas passam a ler entrada confirmada; suas
  condições continuam as mesmas.
- Não duplicar `point_events` em `career_events`.

## Modelo de dados

### `career_events` — livro-razão confirmado

Granularidade de **sessão**, não de ponto. Uma linha por `(player_id, session_id)` com o
resumo daquela sessão, mais uma linha por marco (fase 3B).

```sql
create table public.career_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  -- Sem tipo 'game_won': vitórias entram como contagem no payload da sessão. Uma linha
  -- por jogo contradiria a granularidade de sessão e reintroduziria a duplicação que
  -- este desenho evita.
  type text not null check (type in ('session_played', 'milestone')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  -- Chave determinística: 'player:{id}|session:{id}|session_played'. É o que torna
  -- regeneração e retry idempotentes (spec base §6: retry não duplica evento).
  source_key text not null unique,
  contract_version integer not null,
  created_at timestamptz not null default now()
);
```

`payload` carrega o que os agregados precisam (pontos, erros, aces, bloqueios, destaques,
resultado). Estatística fina que só algumas conquistas usam (`errorsByType`) continua sendo
lida de `point_events` confirmados — duplicar a tabela de maior volume do schema não se
justifica.

### `career_totals` — agregado global, sem atribuição de comunidade

Resolve a tensão entre "VUT é global" e "privacidade por comunidade" (ver Segurança).

```sql
create view public.career_totals as
select
  ce.player_id,
  count(*) filter (where ce.type = 'session_played') as sessions_played,
  coalesce(sum((ce.payload->>'games_played')::int), 0) as games_played,
  coalesce(sum((ce.payload->>'games_won')::int), 0) as games_won,
  coalesce(sum((ce.payload->>'points')::int), 0) as total_points,
  coalesce(sum((ce.payload->>'errors')::int), 0) as total_errors,
  max(ce.occurred_at) as last_played_at
from public.career_events ce
group by ce.player_id;
```

Devolve **totais**, nunca linhas por comunidade. Por ser view com `GROUP BY`, é
estruturalmente **não auto-updatable** — ao contrário de `community_profile_summary`, que
era de tabela única e por isso virou vetor de escrita (ver
`20260726200000_lock_community_profile_summary_readonly.sql`). Aqui essa classe de bug não
existe por construção; ainda assim os grants são fixados explicitamente.

## Geração e regeneração

Gerada **no servidor, na confirmação**. Nenhum cliente escreve `career_events`.

`point_events` chega ao Postgres somente via `bulkUpsertRows` durante o sync — verificado
em `operationalCloudService.ts`; `upsertPointEvent` não tem chamador fora do próprio
módulo. Logo, as escritas vêm em lote.

Por isso o trigger é **por comando, com transition table**, não por linha: um trigger de
linha dispararia 100 vezes numa sessão de 100 pontos, recomputando o mesmo resumo a cada
uma.

```sql
create trigger regenerate_career_after_points
  after insert or update or delete on public.point_events
  referencing new table as touched
  for each statement
  execute function public.regenerate_career_events();
```

Trigger equivalente em `games`. A função coleta os `session_id` distintos afetados e
recomputa **apenas** aqueles.

**Regeneração é apagar-e-inserir por sessão afetada**, dentro da transação do trigger.
Com a `source_key` única, o resultado é idempotente e auto-corretivo: ressincronizar a
mesma sessão converge para o mesmo livro-razão; um jogo apagado remove seus eventos em vez
de deixá-los órfãos.

**Claim.** Reivindicar um jogador histórico regenera a carreira dele — o spec base é
explícito: "claim importa eventos e recalcula; não copia um cartão congelado". Como a
regeneração é idempotente e derivada do dado já confirmado, isso é apenas chamar a mesma
função para as sessões daquele jogador.

## Versionamento

`contract_version` é constante no código, gravada em toda linha gerada. Sobe quando muda o
**significado** de um evento ou a forma do `payload` — não quando muda a fórmula do VUT,
já que o VUT é recalculado na hora e não precisa de migração. Subir a versão implica uma
migration de regeneração única, para que linhas antigas não sejam reinterpretadas em
silêncio sob regra nova.

## Confirmado x provisório

- **Confirmado**: o que está em `career_events`. É o VUT oficial.
- **Provisório**: o cliente roda a mesma função pura sobre dados locais ainda não
  sincronizados e rotula o resultado como provisório.

Sem armazenamento novo e degrada corretamente offline. O spec base pede exatamente isso:
"eventos offline podem mostrar progresso provisório; conquista e VUT oficiais mudam somente
após confirmação cloud".

## Segurança

`career_events` é gerada pelo servidor; nenhum cliente escreve.

- `revoke insert, update, delete on public.career_events from anon, authenticated;`
  **antes** do grant, e de ambos os papéis — o Supabase concede `ALL` por padrão em objetos
  novos do schema `public`, então revogar só de `anon` não faz nada.
- Função geradora é `security definer` com `set search_path = public`.
- **Leitura de `career_events`**: a própria carreira sempre (`players.user_id = auth.uid()`);
  a de outro jogador apenas nas comunidades ativas em comum, reusando
  `current_user_shares_profile`.
- **Leitura de `career_totals`**: liberada para quem compartilha comunidade ativa com o
  jogador. Devolve totais globais sem revelar de quais comunidades vieram — é o que permite
  o card de terceiros ser global e correto sem vazar onde a pessoa joga.

Detalhe por comunidade continua restrito a quem participa daquela comunidade. O agregado
é o único caminho global para terceiros.

## Corte de fases

### 3A — Eventos de carreira e VUT confiável

1. Migration: `career_events`, `career_totals`, RLS e grants explícitos.
2. `regenerate_career_events()` + triggers de statement em `point_events` e `games`.
3. `contract_version` e a constante correspondente no código.
4. Cliente calcula VUT sobre o livro-razão confirmado; caminho provisório rotulado.
5. Recálculo no claim.

### 3B — Catálogo e marcos narráveis

1. Tipos de marco (`milestone`): primeira vitória, 100 pontos, sequências.
2. Conquistas novas escritas contra o modelo estável do 3A.
3. Superfície mínima de histórico, respeitando o congelamento de UI.

3A precisa vir primeiro porque as condições das conquistas são escritas **contra** o modelo
de evento. Ampliar o catálogo antes obrigaria a reescrever cada condição quando o modelo
mudasse.

## Testes

- **Idempotência real**: rodar a regeneração duas vezes e comparar o conjunto de linhas,
  não apenas verificar que não houve erro.
- **Divergência**: editar um jogo atualiza os eventos daquela sessão; apagar remove.
- **Lote**: sincronizar N pontos causa **uma** regeneração, não N. É a diferença entre
  trigger de statement e de linha, e só um teste impede a regressão.
- **Grants**: `authenticated` tem `select` e nada mais em `career_events` e
  `career_totals`. O `community_profile_summary` provou que confiar no padrão do Supabase
  deixa `INSERT/UPDATE/DELETE` abertos.
- **RLS**: matriz para anônimo, membro comum, membro de outra comunidade, dono da carreira
  e staff. Confirmar que membro de comunidade não compartilhada não lê `career_events`, mas
  que o agregado global de `career_totals` não vaza atribuição por comunidade.
- **Determinismo**: mesmo livro-razão produz o mesmo VUT, com a versão carimbada.
- **Regressão do motor atual**: os testes existentes de `futCards.test.ts` continuam
  passando sem alteração — as 79 conquistas não mudam de comportamento.

## Referências

- `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (spec base, §9)
- `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (programa)
- `src/logic/futCards.ts` (motor existente), `src/logic/statistics.ts` (`PlayerStats`)
- `supabase/migrations/20260726200000_lock_community_profile_summary_readonly.sql`
  (por que os grants são fixados explicitamente aqui)
