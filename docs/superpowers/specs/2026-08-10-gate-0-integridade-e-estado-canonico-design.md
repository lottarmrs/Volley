# Gate 0 — Integridade de elenco e estado canônico de sessão

> Spec A do Plano 5 Fase 3. A Spec B (navegação centrada em comunidade) depende desta e é escrita
> depois. Data: 2026-08-10.

## 1. Resumo

Fechar os dois P0 que a auditoria de 2026-08-09/10 deixou abertos, antes de mexer em navegação:

1. o balanceador descarta silenciosamente atletas sem avaliação;
2. o estado operacional de sessão e torneio se contradiz entre telas.

Some-se um P1 de mesma natureza — relatórios que perdem os jogos decididos por W.O.

A Fase 3 de navegação vai fazer sidebar, badges e CTAs **lerem** esse estado. Refatorar rotas sobre
um estado que se contradiz apenas espalha a contradição por mais telas. Por isso este gate vem
primeiro.

Evidência: `.impeccable/audit/2026-08-09-full-product/pass-c/report.md` e a crítica
`.impeccable/critique/2026-08-10T12-04-02Z__src-app-tsx.md` (11/40, 3 P0, 7 P1).

## 2. Contexto

O terceiro P0 — sync de startup apagando registros locais — **já foi corrigido** em 2026-08-10:
`syncStatus.ts` passou a contar registro sem `syncStatus` e sem `cloudId` como pendente, e
`GuestPlayerModal` passou a nascer com `syncStatus: 'local'`. Ao medir, o contador de pendências
saltou de 5 para 48: 43 registros — 17 eventos de ponto, 9 times, 8 jogos, 3 sessões, 4 relatórios
e 2 convidados — estavam invisíveis para a guarda. Fica registrado aqui porque explica por que este
gate existe: os defeitos restantes são da mesma família, dados que o produto perde ou distorce sem
avisar.

### O que a auditoria mediu

**Elenco.** Nove atletas selecionados, sete distribuídos (3 + 2 + 2), nas três divisões
alternativas, em três execuções independentes. Os ausentes são sempre os dois com `atributos: {}`.
Posição foi descartada como causa por teste controlado. `mapPlayerToAthleteVector`
(`balancing.ts:128`) copia `p.atributos.ataque` cru; com atributos vazios o vetor vira `undefined`,
os scores viram `NaN`, e toda comparação `score < best` é falsa — o atleta some no annealing.

O painel de diagnóstico, na mesma tela, exibe `DESEQUILIBRADA — Diferença: 137 pts` com **todas** as
métricas de dispersão em `0.0`, um alerta verde de sucesso, oito alertas laranja sobre falta de
levantador — e nenhuma menção aos dois atletas perdidos. O `137` é o próprio `NaN` se propagando.

**Estado.** `SessionStatus` já tem oito valores, incluindo `paused`. O problema não é falta de
estados: é que cada tela decide sozinha o que exibir a partir do `status` cru. Casos medidos:

- header verde `PARTIDA EM ANDAMENTO` sobre corpo `SESSÃO INICIADA — toque para iniciar a primeira
  partida`;
- o mesmo header sobre `JOGO 1 — FINALIZADO` com os dois cards em `JOGO ENCERRADO`;
- lista de Torneios diz `PRONTO`; o detalhe do mesmo torneio diz `STATUS: EM ANDAMENTO`,
  `0/3 JOGOS`, `TABELA PRONTA — INICIE A PRIMEIRA PARTIDA` e oferece `INICIAR TORNEIO`, com
  `PAUSAR` e `ENCERRAR` já habilitados;
- com `TORNEIO PAUSADO` na tela, o CTA `INICIAR TORNEIO` continua ativo e clicável;
- sessão encerrada convivendo com jogo `status: "active"` órfão.

**Relatórios.** Torneio com três jogos finalizados (`2×1`, `12×0` W.O., `0×12` W.O.). A
classificação final conta os três corretamente. O Histórico do mesmo torneio diz
`TOTAL DE JOGOS: 1` e `PONTOS MARCADOS: 3` — 24 pontos somem — enquanto, logo abaixo, mostra cada
time com dois jogos disputados. Causa em `reports.ts:232-233`: `totalGames` conta `gameReports` e
`totalPoints` conta eventos; W.O. não gera nenhum dos dois.

## 3. Decisões tomadas

| Decisão | Escolha |
|---|---|
| Ordem | Gate 0 primeiro; navegação na Spec B |
| Abordagem | Fonte única de verdade no domínio, consumida por todas as telas |
| Atleta sem avaliação | Entra com a média da turma e o produto avisa |
| Base da média | Apenas os atletas selecionados da sessão, não a comunidade |
| Falha de invariante | Devolvida como `issues` e bloqueia o avanço; sem `throw` |

## 4. Não-objetivos

Fora do escopo desta spec, e deliberadamente:

- rotas, sidebar, decomposição do `App.tsx`, os três lares de autoridade — tudo é Spec B;
- premiação, artilharia e MVP vazios quando o organizador usa `Rápido`/`W.O.` — é decisão de
  produto sobre o contrato de autoria, não defeito;
- `applyResult` ainda podendo remover registro local sem `cloudId`, e o caminho de troca de dono do
  cache que ignora `pendingChanges` por design (`cloudSyncStartupUseCases.ts:51-56`);
- as escalas incoerentes (`3` / `50` / `6.0` / `nível 6+` / `50 PON`) — merece decisão própria, não
  um patch;
- confirmações destrutivas em `window.confirm` nativo — Spec B ou posterior;
- acessibilidade da sessão ao vivo (`aria-live`, nomes de botão, `Remover lance` em hover).

## 5. Desenho

### 5.1 Fase operacional derivada

Módulo puro novo: `src/domain/sessionPhase.ts`.

```
derivarFase(session, games) → OperationalPhase
permissoesDaFase(fase) → FasePermissions
```

`OperationalPhase` combina o `status` persistido com a realidade dos jogos. **Jogo terminal**, aqui
e no resto da spec, significa `status` em `finished`, `walkover` ou `cancelled` — os três encerram o
jogo. `TournamentBracket.tsx:15` já usa `finished || walkover` como "encerrado"; a definição segue
esse precedente.

| Fase | Condição | Header | CTA primário |
|---|---|---|---|
| `rascunho` | `draft`, `players_selected`, `configured` | Rascunho pendente | Continuar configuração |
| `times_gerados` | `teams_generated` | Times prontos | Gerar tabela |
| `pronta` | `active`, nenhum jogo `active` nem terminal | Pronta para começar | Começar primeira partida |
| `entre_partidas` | `active`, há jogo terminal, nenhum `active` | Entre partidas | Iniciar próximo jogo |
| `em_andamento` | `active` e existe jogo `active` | Partida em andamento | — |
| `pausada` | `paused` | Pausada | Retomar |
| `encerrada` | `finished`, `cancelled` | Encerrada | Ver histórico |

`FasePermissions` expõe `podeIniciar`, `podePausar`, `podeRetomar`, `podeEncerrar`, `podePontuar`.
`pausada` tem `podeIniciar: false` — é o que desativa o `INICIAR TORNEIO` clicável sob o aviso de
pausa.

**Consumidores obrigatórios**, que deixam de ler `session.status` cru: badge do header em
`App.tsx`, `Dashboard`, lista de Torneios, `TournamentActiveView`, `SessionActiveView`.

Encerrar sessão passa a resolver os jogos abertos, para que jogo `active` dentro de sessão
`finished` deixe de ocorrer.

### 5.2 Integridade do elenco

Tudo em `src/logic/balancing.ts`.

**Sanitização na fronteira.** `mapPlayerToAthleteVector` deixa de copiar atributo cru. Atributo
ausente é substituído pela média **daquele atributo** entre os atletas selecionados que têm
avaliação — atributo a atributo, para não distorcer o perfil. Se nenhum selecionado tem avaliação,
usa o meio da escala (5). O vetor resultante nunca contém `undefined` nem `NaN`.

**Marca de origem.** O vetor ganha `isEstimated: boolean`, para a UI avisar sem inventar.

**Invariante pós-balanceamento.** Função exportada e testada compara a união dos times com
`selectedPlayerIds`. Em divergência, `generateBalancedDivisions` devolve os nomes ausentes e os
duplicados junto com as divisões. O wizard **bloqueia `Gerar tabela`** e mostra quem sumiu. Sem
`throw` — segue o padrão de `issues` já usado em `AppResult`.

**Diagnóstico honesto.** O painel abre com quantos entraram estimados e, se houver, quem ficou
fora. Os alertas de composição continuam, abaixo.

Efeito esperado: com atributo ausente virando média, os atletas sem avaliação passam a ser
distribuídos e o `DESEQUILIBRADA — 137 pts` com dispersões `0.0` deixa de ocorrer.

### 5.3 Relatórios

`buildSessionReport` (`src/logic/reports.ts`) passa a derivar dos jogos, não dos subprodutos:

- `totalGames` = jogos com `status` em `finished` ou `walkover`; `cancelled` fica de fora, porque um
  jogo cancelado não foi disputado;
- `totalPoints` = soma de `scoreA + scoreB` desses jogos;
- campo novo `gamesByWalkover` = jogos com `status === 'walkover'`, para o Histórico poder dizer
  "3 jogos, 2 por W.O.".

`createWalkoverResult` (`tournament.ts:304-320`) já grava `status: 'walkover'`, `finishReason:
'walkover'` e o placar `pointsPerGame × 0` — o dado necessário existe e está correto. O relatório
simplesmente não o lê.

O ranking individual continua vindo dos eventos: W.O. não tem autor e não deve inventar um.

Junto, uma linha: o card do Histórico deixa de truncar o nome do MVP no primeiro espaço
(`AUDIT` em vez de `AUDIT C1`). É corte de exibição, não do dado.

## 6. Testes

Node runner, `.test.ts`, sem DOM — os três módulos são puros.

- `src/domain/sessionPhase.test.ts` — as sete fases e as permissões. Casos que hoje falhariam:
  `active` sem jogo ativo; `active` com jogo finalizado e nenhum ativo; `paused` negando
  `podeIniciar`; sessão `finished` com jogo `active` pendente.
- `src/logic/balancing.test.ts` — cresce com: atributo ausente não produz `NaN`; média por atributo
  calculada só sobre os selecionados avaliados; união dos times igual à seleção; divergência
  devolvida em vez de silenciada.
- `src/logic/reports.test.ts` — sessão com W.O. contando jogos e pontos.

Nenhum teste de UI novo: as telas passam a consumir funções puras e o comportamento que importa
fica coberto no domínio.

## 7. Critério de aceitação

- `derivarFase` é a única origem de badge, CTA e permissão nas cinco telas listadas em 5.1;
  nenhuma delas lê `session.status` cru.
- Gerar times com um atleta sem avaliação o distribui, e o painel diz que a avaliação foi estimada.
- Gerar times com divergência entre seleção e distribuição bloqueia `Gerar tabela` e nomeia quem
  ficou fora.
- Torneio pausado não oferece `Iniciar`.
- Lista e detalhe do mesmo torneio exibem o mesmo estado.
- Encerrar sessão não deixa jogo `active` órfão.
- Relatório de sessão com W.O. conta os jogos e os pontos daqueles jogos.
- `typecheck → lint:eslint → format:check → test → build` verde.

## 8. Riscos

**Mudar o vetor do balanceador altera divisões existentes.** Atletas antes descartados passam a
entrar, então times gerados mudam. É o objetivo, mas invalida comparações com resultados antigos.
Mitigação: os testes de balanceamento existentes asseguram as invariantes (diferença de tamanho
≤ 1, distribuição de levantadores), não composições específicas.

**`derivarFase` tocar cinco telas de uma vez.** Mitigação: a função é pura e testada antes de ter
consumidor; as telas migram uma por vez, cada uma com o gate de testes verde.

**Média por atributo pode mascarar um atleta muito fora da curva.** Aceito: é melhor que o
comportamento atual, que é descartá-lo em silêncio, e o aviso de estimativa dá ao organizador a
informação para ajustar.

## 9. Referências

- Auditoria: `.impeccable/audit/2026-08-09-full-product/pass-c/report.md`
- Crítica: `.impeccable/critique/2026-08-10T12-04-02Z__src-app-tsx.md`
- Spec base da Fase 3: `docs/superpowers/specs/2026-07-31-plano-5-screen-contracts-reset-navigation-design.md`
- Handoff: `HANDOFF.md`
