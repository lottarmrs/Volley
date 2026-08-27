# TAREFAS - Partidas Multi-set + Pontuacao Fluida

Plano de execucao para multi-set ponta a ponta: registro, persistencia, estatisticas,
notas, UI, mobile e bugs de travamento/reordenacao.

## Status atual

- [x] Nucleo puro: `Game.sets[]`/`Game.setTargets`, `evaluateMatchState`,
      melhor-de-N e tiebreak.
- [x] Persistencia via `metadata` no Supabase, sem migracao de colunas dedicadas.
- [x] Pontuacao ao vivo multi-set ligada no `registerPoint`.
- [x] Nota multi-set com `gameExposure(game)`.
- [x] Playoffs de round-robin com placeholders `rank:N`.
- [x] Reordenacao aceita partidas `scheduled`, `active` e `paused`.
- [ ] QA manual em preview/mobile antes de considerar 100% fechado.

## Fase 0 - Modal de ponto no mobile

- [x] `PointModal` com `modal-bottom` no mobile e `sm:modal-middle` no desktop.
- [x] `modal-box` em `flex flex-col max-h-[90vh]`.
- [x] Corpo rolavel com `overflow-y-auto flex-1`.
- [x] Footer fixo com Confirmar e `env(safe-area-inset-bottom)`.
- [ ] Validar no preview mobile: cortada + assistencia -> Confirmar sempre clicavel.

## Fase 1 - Persistencia de `sets[]` e `setTargets`

- [x] `mapGameToDb` grava `sets` e `setTargets` em `metadata`.
- [x] `mapDbToGame` restaura `sets` e `setTargets` de `metadata`.
- [x] Teste de round-trip dos mappers.

## Fase 2 - Pontuacao ao vivo multi-set (`registerPoint`)

- [x] Detecta multi-set via `currentGame.setTargets && setTargets.length > 1`.
- [x] Chama `evaluateMatchState` apos incrementar o set atual.
- [x] Atualiza `game.sets` e `game.scoreA/scoreB` com o retorno.
- [x] Mantem o `PointEvent` com o placar do set fechado.
- [x] Encerra a partida no `matchWinner` e gera `GameReport`.
- [x] Proximo ponto comeca no placar novo do jogo, incluindo 0-0 apos virada de set.
- [x] Caminho de set unico segue intacto.
- [x] Teste de `registerPoint` fechando set multi-set.

## Fase 3 - Desfazer cruzando fronteira de set

- [x] `undoLastPoint` detecta se o ultimo ponto fechou um set.
- [x] Remove o ultimo set e restaura `scoreA/scoreB` para `scoreBefore`.
- [x] Reabre partida finalizada e limpa vencedor/fim/relatorio.
- [x] Teste de undo removendo set final multi-set.

## Fase 4 - Nota e estatisticas multi-set

- [x] Helper `gameExposure(game)` criado.
- [x] `calculateMatchRating` usa exposicao multi-set.
- [x] `calculateSessionRating` usa exposicao multi-set.
- [x] `calculateLiveGameRatings` herda a regra via `calculateMatchRating`.
- [x] Testes de exposicao sem duplicar set final e ponderacao de sessao.
- [x] Standings de torneio somam pontos dos sets.

## Fase 5 - UI ao vivo de sets

- [x] `TeamScoreCard` mostra sets vencidos.
- [x] `TeamScoreCard` mostra parciais dos sets.
- [x] `TournamentActiveView` mostra parciais na tabela.
- [x] `TournamentBracket` mostra parciais de jogos finalizados.
- [x] Polir label para "Sets A x B" em vez de apenas contagem por card.
- [x] Indicar "Tiebreak" quando o set atual usa alvo menor.
- [ ] QA visual para garantir que set unico nao ficou poluido.

## Fase 6 - Wizard / configuracao

- [x] Toggle `roundRobinPlayoffs`.
- [x] Configuracao `playoffSetTargets` com default `[12, 12, 7]`.
- [x] Jogos de playoff recebem `setTargets`.
- [x] Jogos de grupo seguem como set unico.
- [x] Placeholders `rank:N` sao gerados para final/3o lugar de round-robin.
- [x] Propagacao resolve `rank:N` apos a fase de grupos.

## Fase 7 - Chaveamento e reordenacao de partidas

- [x] `propagateKnockoutResults` roda ao atualizar jogos da sessao.
- [x] Final/3o lugar resolvem `rank:N` apos resultados de grupo.
- [x] Bracket renderiza jogos de mata-mata e parciais.
- [x] `reorderScheduledGame` reordena por `sequenceNumber`.
- [x] Reordenacao agora aceita `scheduled`, `active` e `paused`.
- [x] Tabela mostra badges "Em jogo" e "Pausado".
- [x] Iniciar outro jogo de torneio pausa qualquer jogo ativo anterior.
- [x] Retomar um jogo pausado pausa qualquer outro jogo ativo.
- [x] SessionView prefere jogo `active`; usa `paused` so se nao houver ativo.
- [x] Testes de reordenacao com jogo ativo e inicio com jogo pausado.
- [ ] QA manual: pausar jogo, iniciar outro, reordenar e retomar no preview.

## Fase 8 - Robustez anti-travamento

- [x] `GameActions` bloqueia placeholders `winner:`, `loser:`, `group:` e `rank:`.
- [x] `evaluateMatchState` ignora `setTargets` vazio/invalido em vez de fechar set.
- [x] `getGameWinner` ignora `maxPoints` invalido.
- [x] Teste de `setTargets` vazio/invalido.
- [x] Fallback visual mais amigavel para tela principal quando times ainda nao existem.
- [ ] Considerar boundary/fallback de erro para evitar tela branca em casos inesperados.

## Fase 9 - Testes e validacao

- [x] Unit: nucleo (`evaluateMatchState`, standings, mappers, rating).
- [x] Hook: `registerPoint` multi-set.
- [x] Hook: `undoLastPoint` cruzando set final.
- [x] Hook: reordenacao de jogo ativo.
- [x] Hook: iniciar novo jogo com anterior pausado.
- [x] `npm run test:unit` verde.
- [x] `npm run test:ui` verde.
- [x] `npm run build` verde.
- [x] Preview local responde HTTP 200 em `http://localhost:3000`.
- [ ] Validacao manual no preview/mobile:
  - [ ] cortada + assistencia no `PointModal`;
  - [ ] multi-set 2x0;
  - [ ] virada no tiebreak;
  - [ ] reordenacao com jogo ativo/pausado;
  - [ ] propagacao de `rank:N` para final/3o lugar.

## Pendencias reais restantes

1. QA manual mobile e torneio real no preview.
2. Considerar boundary/fallback de erro para evitar tela branca em casos inesperados.
