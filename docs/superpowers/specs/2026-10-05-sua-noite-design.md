# Sua noite — a carta pública pela avaliação e a revelação no celular do atleta

Primeira fatia da gamificação do perfil do atleta e da carta VUT (decidida com o usuário em
2026-10-05). Objetivo do produto: o atleta ter motivo para abrir o app além de marcar presença.

## Por quê

- **A revelação acontece no aparelho errado.** O `VutRevealModal` só abre no `handleFinishSession`
  do `AppShell`, no celular de quem aperta "Encerrar", em fila com as cartas de todos. O atleta, no
  próprio celular, nunca vê a própria edição especial nem as próprias conquistas.
- **Os números da carta não vêm da avaliação.** `generateFutStats` lê `players.attributes`, campo
  legado. A avaliação da comunidade é obrigatória desde 2026-09-16 e usa os mesmos 11 fundamentos
  (rubrica `v0-legacy-11`), mas não chega à carta. Conta criada desde a ficha (2026-09-28) nasce com
  `attributes = {}`, e a carta mostra o piso da curva (stats 20, bronze).
- Desde 2026-09-30 o membro lê do banco as peladas, os times, os jogos, os pontos e os relatórios da
  comunidade, e desde 2026-10-01 quem joga com a própria conta ganha `career_events`
  (`session_played`). O celular do atleta já tem o que precisa para montar a noite dele.

## Decisões tomadas com o usuário (2026-10-05)

1. Ordem da gamificação: **depois da pelada** primeiro; depois a carta como identidade ("Minha
   carta"); depois metas entre peladas.
2. **Cada atleta vê a própria noite no próprio celular.** Com conta, o organizador deixa de ver a
   fila com as cartas de todos; ele também joga e recebe a própria noite.
3. **A carta é pública com os números da avaliação.** Qualquer membro ativo vê o OVR e os 6 stats de
   qualquer atleta da comunidade. A aba "Avaliação" (cobertura e contagem) continua só para quem
   avalia e para o próprio atleta. Isso estreita a decisão 1 de 2026-09-29 ("os demais membros veem
   só a carta"): o resultado vira público, o detalhe não.
4. A carta vale **por comunidade**: dentro da comunidade X, os números são a avaliação de X.
5. **Híbrido:** o servidor sinaliza a noite e guarda o "já vi"; o cliente calcula a noite com o
   motor VUT existente.
6. Sem conta (pelada rápida num aparelho só), a fila do organizador fica como está.
7. Referências visuais: microkit.co, bencho.dev, spell.sh, inspora.design, styles.refero.design,
   dribbble.com, awwwards.com.

## Parte 1 — Servidor

Migration nova `20261005120000_sua_noite.sql`.

### 1.1 Números da carta para membros

`public.get_community_card_stats(p_community_id uuid)` devolve
`table (player_id uuid, dimension_key text, value numeric)` para cada atleta com vínculo ativo no
elenco da comunidade, na rubrica `v0-legacy-11`. Autoriza qualquer membro ativo
(`community_members.status = 'active'`) ou quem tem papel na comunidade; senão `42501`. Delega a
`app_private.compute_community_player_skill_profile` e devolve só `value` das dimensões com valor —
sem `sample_count`, `contribution_count`, cobertura ou `source_revision`. `security definer`,
`search_path = ''`, `grant execute` a `authenticated`, `revoke` de `public` e `anon`.

`get_community_player_skill_profile` (aba "Avaliação") não muda.

### 1.2 O "já vi"

Tabela `public.athlete_night_views (player_id uuid references players, session_id uuid references
sessions, seen_at timestamptz default now(), primary key (player_id, session_id))`, com RLS:
`select` e `insert` só quando `players.user_id = auth.uid()` para o `player_id`, a mesma regra de
`career_events`. Sem `update` nem `delete`.

`public.mark_my_night_seen(p_session_id uuid)` insere a linha do atleta da conta com
`on conflict do nothing`; recusa (`42501`) se o atleta da conta não tem `session_played` naquela
pelada.

### 1.3 Noite pendente

`public.get_my_pending_night()` devolve `(session_id, community_id, occurred_at)` da pelada mais
recente em que o atleta da conta tem `career_events.type = 'session_played'`, sem linha em
`athlete_night_views` e com `occurred_at` nos últimos 7 dias. Sem nada, zero linhas. Só a mais
recente: duas peladas sem abrir o app mostram só a última.

### 1.4 Testes — `src/test/db/noiteDoAtleta.dbtest.ts`

- membro ativo lê os números da carta de outro atleta; não membro recebe `42501`;
- a leitura não traz cobertura nem contagem;
- o atleta marca a própria noite e não marca a de outro; marcar de novo não falha;
- a pendente some depois de vista; pelada com mais de 7 dias não aparece;
- quem não jogou a pelada não recebe a noite dela.

## Parte 2 — Forma de quem tem conta pelo histórico

A nota da noite não depende da ficha: o motor a calcula dos jogos e pontos da pelada
(`calculateSessionRating`), que são da pelada e já estão online. O que depende da ficha é a
**forma** (`player.formaAtual.ultimasPartidas`, lida por `autoFormFromHistory`), gravada pelo
encerramento (`play.applyProgression` em `handleFinishSession`).

**Confirmado no código (2026-10-05):** `persistPlayer` em `src/hooks/usePlayers.ts` pula qualquer
atleta de outra conta (`if (player.userId && player.userId !== userId) return null`). A forma de quem
tem conta só muda quando a própria pessoa encerra uma pelada; para os outros, fica parada.

Correção: para atleta **com conta** (`player.userId`), `buildVutCard` reconstrói
`formaAtual.ultimasPartidas` pelo histórico — as notas de pelada (`calculateSessionRating`) das
últimas 10 peladas encerradas em que jogou, em ordem cronológica (o mesmo limite de
`applySessionRatingToForm`) — e usa esse atleta efetivo em todo o cálculo da carta (selo de forma,
edição In-Form, conquistas). `formaAtual.valor` (ajuste manual) não muda. Atleta sem conta continua
lendo a ficha. O achado vai para `docs/JORNADA.md`.

## Parte 3 — Carta pela avaliação

- `generateFutStats(player, skillValues?)`: com `skillValues` (os 11 fundamentos daquela
  comunidade), OVR e stats saem deles pelas mesmas fórmulas (`calculatePositionOverall` sobre uma
  cópia do atleta com esses atributos, mais o bônus de forma). Sem `skillValues`, usa `atributos`
  como hoje — o modo sem conta não muda.
- Fundamento sem valor usa a média dos fundamentos avaliados do próprio atleta.
- Nenhum fundamento avaliado: estado "aguardando avaliação" — `FutStats.rated = false` (os números
  continuam calculados, para não espalhar `null` pelo motor). A carta mostra "?", "—" e o selo
  "Aguardando avaliação" no lugar do tier; edição, conquistas e estatísticas de jogo continuam.
- `buildVutCard` repassa os valores pelo contexto (`BuildVutCardContext.skillValues?:
  Map<string, Partial<Attributes>>`, chave = id do atleta no app). Com o mapa presente e o atleta
  ausente dele, a carta é "aguardando avaliação".
- Hook `useCommunityCardStats(communityCloudId)` (TanStack Query, uma chamada por comunidade,
  `refetchOnWindowFocus`) alimenta `PlayersView` → `FutCardModal` e a noite. As tabelas de avaliação
  não estão no tempo real e os membros não as leem pela RLS; não se adiciona nada ao canal.

## Parte 4 — Sua noite

### 4.1 Quando aparece

Componente global montado no `AppShell` (como a pergunta da fila do placar). Com conta e Supabase,
chama `get_my_pending_night()` ao abrir e quando a aba volta ao foco. Com pendente, carrega a
comunidade pelas queries online (`sessionDataQueries`) e os números da carta, e abre. Sem sinal, sem
dados ou erro: não aparece, sem mensagem; tenta de novo na próxima abertura.

### 4.2 O que calcula

Função pura em `src/application/` (`buildAthleteNight`): recebe o atleta, a pelada, o histórico da
comunidade e os números da carta; roda `buildVutCard` sem a pelada (antes) e com ela (depois) e
devolve carta, edição, conquistas novas, as duas mais próximas de desbloquear, jogos, vitórias,
pontos e nota da noite. A noite existe sempre que a pessoa jogou, mesmo sem nada novo.

### 4.3 O que mostra

Sequência, a partir do `VutRevealModal` adaptado para uma pessoa:

1. Pacote fechado — "Sua noite · comunidade · data" — toque para abrir.
2. Revelação da carta, com edição especial e tier.
3. A noite em números: jogos, vitórias, pontos, nota.
4. Conquistas novas, uma a uma.
5. "Quase lá": as duas mais próximas, com barra de progresso.
6. Compartilhar no WhatsApp (reaproveita a exportação de imagem da aba Exportar) e "Ver minha carta"
   (abre a carta na comunidade).

Conta como vista ao **abrir o pacote** (`mark_my_night_seen`). Fechar sem abrir faz a noite voltar
na próxima abertura, dentro dos 7 dias.

### 4.4 O organizador

Com conta, `handleFinishSession` deixa de montar a fila de revelações; o resumo da pelada continua.
Sem conta, a fila continua como hoje.

### 4.5 Visual

Tela nova: `/impeccable shape` antes do componente, precedido de pesquisa nas referências da decisão
7, citando o que veio de cada uma. Bancada em `preview/noite.tsx` com noites de exemplo: edição
especial, só números, três conquistas, atleta sem avaliação. Animação com `motion/react`; com
"reduzir movimento", transições simples. Celular modesto é a referência de desempenho.

## Testes do cliente

- `futCards.test.ts`: stats pela avaliação; fundamento faltante pela média dos avaliados; estado sem
  avaliação; sem `skillValues`, comportamento atual.
- `buildAthleteNight` (`.test.ts`): edição e conquistas pela diferença antes/depois; noite sem nada
  novo ainda devolve números e "quase lá"; atleta que não jogou não tem noite.
- Spec do componente global: aparece com pendente; não aparece sem; marca vista ao abrir o pacote;
  some sem dados.
- `PlayersView.spec.tsx`: membro comum vê o OVR de outro atleta.
- `AppShell`: com conta, encerrar não monta fila; sem conta, monta.

## Documentos

- `docs/JORNADA.md`: etapa do encerramento — "O atleta vê a própria noite?"; etapa 1 — "Quem vê os
  números da carta?".
- `docs/PERMISSOES.md`: a carta pública pela avaliação.

## Fora desta fatia

"Minha carta" no perfil; metas e desafios entre peladas; ranking e temporada; refazer o
`FutCardModal`; notificação push quando a noite fica pronta; mais de uma noite pendente.
