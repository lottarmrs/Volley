# Minha carta — o baralho de cartas VUT no perfil do atleta

Fatia 2 da gamificação do perfil do atleta (decidida com o usuário em 2026-10-06). A fatia 1, "Sua
noite" (`docs/superpowers/specs/2026-10-05-sua-noite-design.md`), está no PR lottarmrs/Volley#25.

## Por quê

- A aba "Perfil" de `/perfil` (`src/components/account/UserProfileView.tsx`) mostra números
  inventados: atributos faltantes viram 7, o OVR cai em 70, a contagem de partidas cai em 12, e a
  "Galeria de conquistas" é fixa no código ("Sacador de Elite", "Rei da Quadra", "Paredão
  Insuperável") e igual para todo mundo. Os atributos vêm da ficha antiga, não da avaliação da
  comunidade. O perfil contradiz a carta que a fatia 1 tornou pública.
- O atleta não tem um lugar próprio para ver a própria carta: hoje só chega nela em Pessoas de cada
  comunidade. O "Ver minha carta" de "Sua noite" leva à lista de Pessoas.

## Decisões tomadas com o usuário (2026-10-06)

1. **Uma carta por comunidade, como um baralho.** Os números de cada carta são a avaliação daquela
   comunidade; não existe carta "geral".
2. Abaixo do baralho: **álbum de conquistas** e **coleção de edições**.
3. Álbum e coleção valem **para a carta em destaque**, contados só no histórico daquela comunidade.
4. "Minha carta" é o **miolo da aba do perfil** (abordagem 1); não há rota nova.
5. Visual passa pelo `/impeccable` com as referências do usuário (memória
   `volley-design-references`), com bancada em `preview/` antes de ligar no app.

## Parte 1 — Dados (sem mudança no servidor)

Nada novo no banco. Usa a ficha da conta (uma por conta), as comunidades da pessoa, o histórico de
peladas que o app já carrega (`sess` do shell: sessões, times, jogos, pontos, relatórios) e
`get_community_card_stats` (fatia 1), que qualquer membro ativo lê.

### 1.1 Motor — `editionHistory`

Em `src/logic/futCards.ts`, ao lado de `resolvePlayerEdition`:

`editionHistory(player: Player, ctx: BuildVutCardContext): EditionEntry[]`, com
`EditionEntry = { sessionId: string; date: string; edition: VutEdition }`.

Para cada pelada encerrada (`status === 'finished'`) em que o atleta está num time, monta o
`EditionContext` daquela noite (os pontos, jogos encerrados, times e participantes daquela pelada —
o mesmo que `resolveLastSessionContext` monta para a última) e chama `resolvePlayerEdition`.
Entram só as edições `mvp`, `maestro` e `muralha` (a `in_form` depende da forma do momento, não de
uma noite, e fica fora da coleção). Ordem: mais recente primeiro (por `date`, empate por
`createdAt`).

Limite honesto: não guardamos a avaliação de cada época; a edição antiga aparece com os números de
hoje e a data da noite.

### 1.2 `buildMyCards`

Função pura em `src/application/myCards.ts`:

```ts
export interface MyCard {
  community: Community;
  card: VutCard;
  achievements: { unlocked: Achievement[]; near: Achievement[]; locked: Achievement[] };
  editions: EditionEntry[];
  lastPlayedAt: string | null;
  loading: boolean;
}
export function buildMyCards(input: {
  player: Player;
  communities: Community[];
  history: Omit<BuildVutCardContext, 'skillValues' | 'partnershipMatrix'>;
  skillValuesByCommunity: Map<string, Map<string, Partial<Attributes>> | undefined>;
}): MyCard[];
```

- Uma `MyCard` para cada comunidade em que o atleta tem vínculo de elenco
  (`player.communityIds` contém o id da comunidade).
- O histórico de cada carta é filtrado para aquela comunidade (sessões com `communityId` igual e os
  times, jogos, pontos e relatórios dessas sessões). Nada vaza entre cartas.
- `card` = `buildVutCard(player, { ...historicoDaComunidade, skillValues })`. Com o mapa da
  comunidade presente e o atleta ausente dele, a carta sai "aguardando avaliação" (regra da fatia 1).
- `achievements`: `unlocked` = desbloqueadas; `near` = bloqueadas com `current > 0` e `target > 0`,
  ordenadas pela proporção; `locked` = o resto. Contador "N de M" = `unlocked.length` de
  `card.achievements.length`.
- `editions` = `editionHistory(player, historicoDaComunidade)`.
- `loading` = `true` enquanto o mapa daquela comunidade é `undefined` (números não chegaram); a
  tela mostra esqueleto, nunca números provisórios.
- Ordem do baralho: `lastPlayedAt` mais recente primeiro (data da última pelada encerrada em que
  jogou ali); comunidades sem pelada vão para o fim, por nome.

### 1.3 Números de várias comunidades

Hook `useCardStatsForCommunities(communities: Community[], players: Player[])` em
`src/hooks/`, com `useQueries` — uma consulta por comunidade com `cloudId`, mesma chave
`queryKeys.numerosDaCarta(cloudId)` e mesma função da fatia 1, `refetchOnWindowFocus`. Devolve
`Map<communityId (id do app), Map<playerId, Partial<Attributes>> | undefined>`. Sem Supabase ou sem
`cloudId`: a entrada fica `new Map()` (carta "?" sem esqueleto infinito).

## Parte 2 — A tela

### 2.1 Estrutura de `/perfil`

O cabeçalho (foto, nome, @username) e a aba Configurações não mudam. A aba "Perfil" vira
**"Minha carta"**, com, de cima para baixo:

1. **Baralho** — a carta em destaque grande, as vizinhas aparecendo nas bordas. Celular: desliza
   para o lado. Computador: setas. Pontos indicam quantas cartas há. Abaixo da carta: nome da
   comunidade, link "Abrir comunidade" e **Compartilhar** (`shareCardImage` da fatia 1).
2. **Álbum de conquistas** da carta em destaque — contador "N de M"; desbloqueadas primeiro
   (emoji, nome, raridade pela cor da moldura), depois "perto de sair" com barra de progresso
   (mesma regra da fatia 1: bloqueada não passa de 95%), depois bloqueadas apagadas com a regra
   visível.
3. **Coleção de edições** — miniaturas das cartas especiais ganhas naquela comunidade, com o selo
   da edição e a data da noite, numa fileira que desliza; tocar abre a carta grande.

### 2.2 O que sai

As "estatísticas rápidas" com padrões inventados, os atributos com padrão 7, a galeria fixa de três
conquistas e a lista "Minhas comunidades" (o baralho já mostra as comunidades). Nenhum desses
textos ou números volta em lugar nenhum.

### 2.3 Endereço

`/perfil?comunidade=<id do app da comunidade>` abre na carta daquela comunidade; trocar de carta
atualiza o parâmetro (`replace`, sem empilhar histórico). Parâmetro desconhecido: abre na primeira
carta.

### 2.4 Estados

- Sem comunidade: painel de primeiro uso (`EmptyState`) "Sua carta nasce quando você entra numa
  comunidade", com o caminho para achar uma (`/comunidades`).
- Comunidade sem pelada jogada: carta aparece; álbum todo bloqueado com progresso zero; coleção
  "Nenhuma edição especial ainda — sai MVP, Maestro ou Muralha numa noite".
- Sem avaliação: carta com "?" (fatia 1).
- Carregando: esqueleto do tamanho da carta.

### 2.5 Visual

Tela nova: pesquisa nas referências, `/impeccable` (shape e concept-seed de superfície, decisão
do usuário), bancada `preview/minhacarta.*` com exemplos (três comunidades com edições, uma sem
pelada, uma sem avaliação, nenhuma comunidade), ok do usuário antes de ligar no app. Mundo visual
herdado (DESIGN.md); sem fonte, paleta ou material novo. `motion/react`; com "reduzir movimento",
só opacidade.

## Parte 3 — Ligações

- "Ver minha carta" (fim de "Sua noite", `AppShell`) dispensa a noite e navega para
  `/perfil?comunidade=<id>` em vez de Pessoas.
- Em Pessoas, a carta de si mesmo (`FutCardModal` aberto pelo próprio atleta) ganha o link "Ver em
  Minha carta" para o mesmo endereço. A carta dos outros não muda.

## Testes

- `futCards.test.ts` — `editionHistory`: uma entrada por noite de MVP/Maestro/Muralha com a data;
  noite sem edição não entra; `in_form` não entra; pelada não encerrada não entra; ordem mais
  recente primeiro.
- `myCards.test.ts` — uma carta por comunidade do elenco; histórico não vaza entre cartas; ordem
  pela última pelada jogada; comunidade sem pelada com álbum zerado e no fim; comunidade sem
  avaliação → carta "?"; mapa `undefined` → `loading`.
- Hook (`.spec.tsx`) — uma consulta por comunidade; comunidade sem `cloudId` → `new Map()`.
- Tela (`.spec.tsx`) — trocar de carta troca álbum e coleção; `?comunidade=` abre na carta certa e
  trocar atualiza o endereço; estados vazio, sem pelada, sem avaliação, carregando.
- `UserProfileView.spec` — nenhum dos textos inventados aparece ("Sacador de Elite", "Rei da
  Quadra", "Paredão Insuperável").
- `AppShell.spec` — "Ver minha carta" navega para `/perfil?comunidade=…`.
- E2E na pilha local (`e2e/local-stack/`) — depois de "Sua noite", "Ver minha carta" abre o perfil
  na carta da Pelada Local.

## Onde

Branch `exec/minha-carta` (worktree `C:\Volley-carta`), criada de `exec/sua-noite` porque depende
do PR #25. Quando o #25 entrar no `main`, esta branch se alinha ao `main` antes do próprio PR. Sem
migration.

## Documentos

- `docs/JORNADA.md` — "O que o atleta vê no próprio perfil?" e "De onde vêm as edições
  colecionadas?".
- `HANDOFF.md` — a fatia.

## Fora desta fatia

Metas e desafios entre peladas; ranking e temporada; escolher moldura no perfil; carta "como era"
na época de cada edição (exigiria guardar a avaliação por noite); notificação push.
