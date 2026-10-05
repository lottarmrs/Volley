# Dados online — parte 3: placar sem sinal

Terceira de cinco partes do projeto "tempo real" (memória `volley-next-realtime-replaces-sync`).
As partes 1 e 2 estão em produção (`de718f7`). O acompanhamento ponto a ponto por quem não
marca já saiu na parte 2 (`9df3b4c`; ~0,9 s na pilha local). Falta o que dá nome a esta parte: o
placar ao vivo continuar funcionando sem sinal.

## Decisões (2026-10-05)

1. **Sem sinal, o placar faz pontos e jogos:** marcar, desfazer, o jogo terminar sozinho e começar
   o próximo jogo. **Encerrar a pelada pede sinal** e fica travado enquanto houver fila.
2. **Conflito pergunta antes de enviar:** se, enquanto o aparelho estava sem sinal, outra pessoa
   assumiu o placar ou marcou pontos nesta pelada, quem tem a fila decide entre "Enviar os meus
   mesmo assim" e "Descartar os meus". Nada é perdido sem alguém decidir.
3. **Quem acompanha** vê "Último ponto há N min — quem marca pode estar sem sinal" quando o jogo
   está em andamento e passa de 3 minutos sem ponto novo.
4. **Quem marca** vê a faixa "Sem sinal · N pontos guardados no aparelho" e, ao voltar,
   "Enviando…" até zerar.
5. **Caminho 1:** a fila guarda as gravações que o `writeField` já calcula; sem migration, sem
   comando novo no servidor.

## Hoje

- `useSessions.writeField` (`src/hooks/useSessions.ts`) aplica a mudança no cache
  `['peladas', userId]` e encadeia `persistSessionBundleChanges(prev, next)`
  (`src/application/sessionWrites.ts`), que grava a diferença tabela a tabela: upsert pelo id e
  `deleted_at` para o que saiu.
- Sem sinal (`navigator.onLine === false`) o `writeField` **descarta** a mudança e reporta erro;
  `useScoringOffline` trava ponto, desfazer, próximo jogo e encerrar.
- Falha de gravação com sinal: o cache é invalidado e relido; o toque se perde.
- O servidor aceita pontos, jogos e relatórios de quem tem `session.manage` na comunidade. O
  "controle" (`controlled_by_user_id`) é regra do app, não do banco.
- Upsert por id é idempotente: reenviar a mesma linha não duplica.
- O cache do TanStack Query não sobrevive a recarregar a página.

## Desenho

### A fila

Módulo puro novo `src/application/scoreQueue.ts` (testes `.test.ts` no Node):

- **Entrada da fila:** `{ seq, at, sessionId, upserts: { games, pointEvents, gameReports },
  removals: { games, pointEvents, gameReports } }`. `removals` guarda o id local e o `cloudId`.
- `queueEntryFromDiff(prev, next, sessionId)`: a diferença que o `writeField` já calcula,
  restrita às três tabelas do placar e à pelada ativa.
- `applyQueue(bundle, entries)`: aplica as entradas, em ordem, por cima de um bundle lido do
  banco. **O cache é sempre "banco + fila"**: toda releitura (inclusive a disparada pelo aviso de
  tempo real) passa pela fila antes de chegar à tela, para o placar não voltar atrás enquanto ela
  não esvaziou.
- `detectQueueConflict({ queued, serverPoints, serverSession, knownPointIds, userId })`:
  conflito quando o banco tem ponto desta pelada que o aparelho não conhecia ao perder o sinal, ou
  quando `controlled_by_user_id` deixou de ser esta conta. Devolve quem assumiu e quantos pontos
  de cada lado, para a pergunta.

### Onde fica guardada

`src/storage/scoreQueueStore.ts`, por conta (`volley.placar.<userId>`), com try/catch em toda
leitura e escrita:

- as entradas da fila;
- a **foto da pelada ativa** (sessão, times, jogos, pontos e relatórios de jogo dela) e os ids de
  pontos conhecidos no momento em que o sinal caiu.

É a única exceção à regra "dados da conta não ficam no aparelho" (parte 5 apaga o resto). A fila
e a foto sobrevivem a fechar o app; reabrir o app com sinal envia os pontos guardados. A foto não
reabre o placar sem sinal: reabrir o app sem sinal nenhum fica fora desta parte (precisa de service
worker). A foto é descartada quando a fila esvazia e a releitura confirma.

### O `writeField`

- **Sem sinal, ou gravação que falha por rede**, e a mudança é só de jogos, pontos ou relatórios
  de jogo da pelada ativa: vira entrada da fila, o cache fica com o novo estado, e o placar segue.
  Qualquer outra mudança sem sinal continua recusada como hoje.
- **Com fila pendente**, novas gravações do placar também entram na fila (mesmo com sinal), para
  não passarem na frente das antigas.
- A recusa do servidor que não é de rede (RLS, validação) continua como hoje: toast e releitura.

### Ao voltar o sinal

Hook novo `useScoreQueue` (montado pelo `useSessions`), disparado pelo `onlineAt` do
`useConnectivity`, antes da releitura que o `useScoringOffline` já faz:

1. Busca só a sessão (controle) e os pontos desta pelada.
2. Sem conflito: envia as entradas em ordem pelo `defaultSessionWriteGateway`, dentro do
   `writeChain`, removendo cada uma depois de gravada; uma falha de rede para o envio e espera o
   próximo `online`. Ao zerar, relê.
3. Com conflito: mostra a pergunta (modal no placar) — "Enquanto você estava sem sinal, Bia
   assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados." — com **Enviar os meus mesmo
   assim** (envia como no passo 2; no placar do jogo, a última gravação vale) e **Descartar os
   meus** (limpa a fila e a foto, relê).

### Telas

- **Quem marca** (`SessionActiveView`): a faixa atual "Sem conexão. O placar volta quando o sinal
  voltar." vira "Sem sinal · N pontos guardados no aparelho"; com sinal e fila: "Enviando…".
  Ponto, desfazer e próximo jogo ficam habilitados sem sinal; encerrar fica desabilitado com
  "Encerre quando o sinal voltar e os pontos forem enviados."
- **Quem acompanha** (placar em leitura): com o jogo em andamento e mais de 3 minutos desde o
  último ponto, a linha "Último ponto há N min — quem marca pode estar sem sinal". Some no próximo
  ponto.
- **Sem conta:** nada muda (já é tudo no aparelho).

### PRODUCT.md

O princípio 2, "Funciona Sem Sinal", passa a dizer que o placar ao vivo funciona sem sinal e
envia quando o sinal volta; o resto do app pede conexão; sem conta, a pelada rápida roda inteira
no aparelho.

## Testes

- `scoreQueue.test.ts`: diferença vira entrada só com as três tabelas; `applyQueue` sobre bundle
  relido não volta o placar; desfazer depois de marcar, ambos na fila, termina no estado certo;
  conflito por ponto alheio e por troca de controle; sem conflito quando só há pontos meus.
- `useSessions` (`.spec.tsx`): sem sinal o ponto entra na fila e aparece; ao voltar, envia em
  ordem e esvazia; falha temporária guarda a fila e tenta de novo a cada 20 s; só a recusa
  definitiva do servidor descarta; reabrir com sinal só envia depois das comunidades; conflito
  mostra a pergunta e as duas respostas fazem o que dizem; "enviar mesmo assim" não pergunta de
  novo; pelada encerrada em outro lugar só oferece descartar.
- `SessionActiveView.spec.tsx`: faixa com contagem, "Enviando…", encerrar travado com fila,
  aviso de placar parado para quem acompanha.
- Pilha local (`e2e/local-stack/sem-sinal.spec.ts`): corta a rede do contexto de quem marca,
  marca pontos e desfaz um, fecha o app sem sinal e reabre com sinal, e confere banco e tela da
  membro; segundo cenário com outra tela de quem organiza marcando enquanto este aparelho está sem
  sinal, e a pergunta respondida com "Descartar os meus".

## Fora desta parte

- Encerrar a pelada sem sinal.
- Fila para qualquer outra tela (lista, sorteio, comunidade).
- Remoção do `syncService` e das chaves locais (parte 5).
- Reabrir o app sem sinal nenhum (precisa de service worker).
