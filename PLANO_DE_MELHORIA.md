# Plano de Melhoria — Panelinha Team Balancer

> Análise técnica do projeto e roadmap priorizado de melhorias para **(1)** o algoritmo de equilíbrio de times, **(2)** o SessionWizard e **(3)** as telas em jogo (placar, registro de eventos, estatísticas).
> Atualizado: 11/06/2026 · Base de código: `src/logic/balancing.ts`, `src/components/session/SessionWizard.tsx`, `src/components/live/*`.
> Alinhado às **Regras Oficiais de Voleibol FIVB 2025‑2028** (documento anexado).
> 👉 Para o **passo a passo de código** (TypeScript/React) e o **impacto em Supabase e Vercel**, veja o `GUIA_DE_IMPLEMENTACAO.md`.

---

## 1. Panorama do projeto

App **local-first** (React 19 + Vite 6 + TS + Tailwind/daisyUI) para organizar vôlei amador: cadastro de atletas com atributos detalhados, balanceamento automático por simulated annealing, sessões ao vivo com placar, torneios, ranking, comunidades, listas de WhatsApp e sync opcional com Supabase.

A arquitetura está **bem separada**: lógica pura em `src/logic`, hooks em `src/hooks`, serviços de nuvem em `src/services/supabase`, componentes em `src/components`. Há testes (Node test runner + Vitest), o que facilita as melhorias propostas — a maior parte é cirúrgica e testável.

**Pontos fortes:** separação de camadas, tipagem forte, algoritmo determinístico (seeds fixas → reprodutível), diagnóstico de qualidade já existente, modo offline robusto.

**Pontos fracos gerais:** componentes muito grandes (SessionWizard 2.219 linhas, TournamentActiveView 1.302, HistoryView 1.208), escala inconsistente no scorer, telas em jogo densas demais para uso à beira da quadra (fontes minúsculas, muitos `text-[7px]`/`text-[9px]`) e taxonomia de eventos genérica, distante da nomenclatura real do vôlei.

---

## 2. Algoritmo de equilíbrio

### 2.1 Como funciona hoje

`balanceTeams()` mapeia jogadores → `AthleteVector`, escolhe um perfil de pesos (`balanced` / `competitive` / `social` / `mixed`), constrói uma solução inicial gulosa (`InitialTeamBuilder`), e refina com **simulated annealing** rodando **3 seeds fixas** (42, 143, 244) para gerar 3 opções. O `ObjectiveScorer` soma "spreads" (diferença máx−mín entre times por fundamento) ponderados, mais penalidades (gênero, lesão, tamanho, levantador, cobertura de funções, duplicatas).

### 2.2 Problemas encontrados (em ordem de impacto)

**🔴 CRÍTICO — Incompatibilidade de escala entre `overall` e os fundamentos.** É a raiz do pedido "fazer os fundamentos realmente impactarem".
`calculateGeneralOverall()` retorna valor em escala **0–100** (`Math.round(overall*10)` → um jogador médio ≈ 60). Já `m.attack`, `m.defense`, etc. são médias dos atributos em escala **0–10** (≈ 7). No scorer:

```
overallSpread  = (maxOverall − minOverall) × 1.4   // diferença típica 5–15 → contribui 7–21
attackSpread   = (maxAttack  − minAttack)  × 1.15  // diferença típica 0.3–1.5 → contribui 0.3–1.7
```

Resultado: **o `overall` domina o objetivo em ~10×**, e os pesos de ataque, defesa, levantamento, bloqueio, recepção tornam-se quase irrelevantes. Hoje os times são equilibrados basicamente pela média geral; os fundamentos quase não entram. **Esta é a correção de maior alavancagem e pré‑requisito do que você pediu.**

**🟠 ALTO — Forma física contada duas vezes.** `calculateGeneralOverall` já soma `formaAtual.valor * 0.5`. Depois `adjustedOverall()` soma de novo `currentForm * 0.25`.

**🟠 ALTO — `adjustedOverall` aplica penalidades irrelevantes.** `injuryPenalty = 1.5` e `heightBonus ≤ 0.5` numa escala 0–100 são ruído.

**🟡 MÉDIO — Métrica de "spread" frágil a outliers.** `max − min` ignora a distribuição. Para 3+ times, **desvio‑padrão** equilibra melhor o conjunto.

**🟡 MÉDIO — Diversidade fraca das 3 opções.** Seeds + penalidade de duplicata exata convergem para soluções quase iguais.

**🟡 MÉDIO — Limiares fixos (7.0) para `hasStrongAttacker`/`hasSetter`.** Deveriam ser relativos ao grupo.

**🟢 BAIXO — Magic numbers** espalhados; **`totalMales` não usado**; **resfriamento fixo** (mantemos simples — sem temperatura adaptativa, por decisão de produto: preferimos cobrir mais possibilidades e mostrar o progresso, ver §2.6).

### 2.3 NOVO — Tipo de rotação (6x0 / 5x1) e composição por posição

Hoje o algoritmo distribui por força/gênero e tenta garantir 1 levantador por time, mas **não monta uma escalação por posições**. O pedido é permitir escolher a rotação na etapa de **Regras** do wizard e, em **5x1**, montar cada time como uma escalação real.

**Composição alvo por time no 5x1 (6 em quadra):**

| Posição | Qtd padrão | Alternativa (sem líberos suficientes) |
|---|---|---|
| Levantador | 1 | 1 |
| Ponteiro (saída de rede) | 2 | 2 |
| Oposto | 1 | 1 |
| Central | 1 | **2** |
| Líbero | 1 | **0** |

> Regra de fallback: usar **2 centrais + 0 líbero** somente quando **não houver líberos suficientes** para dar 1 por time. A decisão é por time/sessão, priorizando dar líbero ao máximo de times possível.

No **6x0** não há especialização: vale a distribuição livre por atributos + gênero (comportamento atual, já corrigido pela escala).

**Como modelar isso no algoritmo:**

1. **Config nova** `rotationType: '6x0' | '5x1'` em `TournamentConfig` / `FreePlayConfig` e em `CommunityRules` (default por comunidade). Persistir e versionar via `migrations.ts`.
2. **Resolução de elenco por posição.** Antes do annealing, classificar atletas por `posicaoPrincipal` (e `posicoesSecundarias` como reserva). Definir, por time, os "slots" da tabela acima. Atletas `all-rounder` (coringa) preenchem o slot mais carente.
3. **Viabilidade.** Calcular se o grupo comporta a composição (ex.: precisa de ≥ `numTeams` levantadores; se faltar, emitir aviso e relaxar — coringa/secundário cobre). Decidir nº de líberos vs. centrais conforme disponibilidade.
4. **Restrição no scorer (5x1).** Adicionar penalidade alta para times que fujam da composição alvo (peso comparável ao da distribuição de levantador hoje, ex. `8000`/slot faltante). Manter os spreads de atributos **dentro** dos papéis — ou seja, equilibrar "ponteiro vs. ponteiro", "central vs. central" entre times, não só a média do time.
5. **Atribuição inicial guiada por papéis.** Estender `InitialTeamBuilder`: distribuir primeiro os levantadores, depois opostos, centrais, ponteiros e líberos — em cada papel, alternando entre times do mais forte ao mais fraco (snake draft) para equilibrar a força **por posição**, respeitando o gênero.
6. **Equilíbrio de gênero sempre ativo.** Tornar o termo de gênero um critério permanente (piso mínimo de peso) em todos os perfis e em ambas as rotações, não apenas no perfil `mixed`. Hoje `competitive` zera quase o gênero (`0.2`). Garantir distribuição equilibrada de mulheres por time **e**, no 5x1, evitar concentrar todas em um único papel.

> Observação de produto: definir o que acontece quando um time tem **mais de 6** jogadores (reservas) ou número não múltiplo de 6 — provavelmente manter reservas fora da escalação titular e permitir rodízio. Vale alinhar antes de implementar (ver §6).

### 2.4 Plano para o algoritmo (consolidado)

**Fase A — Fundação (alto impacto, baixo risco)**
1. **Normalizar a escala apenas no código do scorer**, mantendo os atributos em **0–10** e o overall em **0–100** nos dados e na UI (mais fácil de preencher/ler — sua preferência). A normalização é interna e localizada: ao calcular os *spreads*, ou multiplica-se os fundamentos por 10, ou divide-se o overall por 10, de modo que tudo seja comparado na mesma unidade. **Recalibrar os 4 perfis** de peso depois disso. → habilita "fundamentos importam". Ver detalhe em §2.5.
2. Remover dupla contagem de forma; limpar `adjustedOverall`.
3. Remover `totalMales`; extrair `PENALTIES`/`THRESHOLDS` nomeados e documentados.
4. Reforçar `balancing.test.ts` com casos que provem que mudar o perfil muda o foco e que os fundamentos influenciam.

**Fase B — Rotação e composição (a feature pedida)**
5. Adicionar `rotationType` (config + wizard + persistência/migração).
6. Implementar resolução de elenco por posição, viabilidade e fallback líbero↔central.
7. Penalidades de composição no scorer + atribuição inicial por papéis (snake draft por posição).
8. Equilíbrio de gênero como critério permanente.

**Fase C — Qualidade**
9. Trocar `max−min` por desvio‑padrão; limiares relativos ao grupo.
10. Garantir diversidade real das 3 opções (penalizar similaridade, rotular por objetivo).
11. **Cobrir o maior número de possibilidades** (mais iterações/seeds, sem temperatura adaptativa — manter o resfriamento simples) e mover o cálculo para um **Web Worker** que roda na máquina do usuário, alimentando uma **barra de progresso** que mostra o equilíbrio acontecendo. Detalhe em §2.6.
12. Expor um "porquê" legível por opção (liga com §4.5).

### 2.5 NOVO — Normalização de escala só no código (resposta à sua dúvida)

**Sim, dá para fazer 100% via código, sem mexer nos dados nem na UI.** A escala dos atributos (0–10) e do overall (0–100) é só uma questão de *como os números são comparados dentro do scorer* — não precisa mudar o que você digita nem o que aparece na tela.

O problema hoje:

```ts
// calculateTeamMetrics → m.overall ≈ 60 (0–100)  |  m.attack ≈ 7 (0–10)
overallSpread = (maxOverall − minOverall) × 1.4   // ~7–21
attackSpread  = (maxAttack  − minAttack)  × 1.15  // ~0.3–1.7  ← some no ruído
```

Duas formas equivalentes de resolver, ambas localizadas no `ObjectiveScorer`/`calculateTeamMetrics`:

- **Opção A (a que você sugeriu): multiplicar os fundamentos por 10.** Cada `attackSpread`, `defenseSpread`, etc. passa a usar `valor × 10`, ficando na mesma faixa do overall (0–100). Simples e direto.
- **Opção B: dividir o overall por 10** dentro do scorer (overall vira 0–10 só ali). Tem a vantagem de deixar os *spreads* em "pontos de fundamento" (ex.: "times diferem 0,4 no ataque"), o que torna os limiares de qualidade mais intuitivos.

**Recomendação:** Opção B (dividir o overall por 10 no scorer), porque os números ficam pequenos e legíveis e casam com os limiares de `getQualityLabel`. Mas a Opção A funciona igual — fica a seu critério.

**Em ambos os casos, o que NÃO muda:**
- O cadastro de atributos continua **0–10**.
- O `strengthSnapshot.overall` continua **0–100** (salvo na nuvem e exibido com `max={100}` no `TeamScoreCard`).
- Nenhuma migração de dados é necessária.

**O que precisa de ajuste junto:** os pesos dos 4 perfis e os limiares de `getQualityLabel`/temperatura foram calibrados na escala quebrada. Depois de igualar as escalas, é preciso uma passada de recalibração (rápida, com os cenários de teste). Sem isso, os fundamentos passam a contar, mas a "nota de qualidade" pode sair deslocada.

Em resumo: **a normalização é um ajuste de código pequeno e isolado**; sua escolha de manter atributos 0–10 e overall 0–100 está perfeita e é totalmente compatível.

### 2.6 NOVO — Processamento na máquina do usuário + barra de progresso (resposta à sua dúvida)

**Boa notícia: isso que você quer já é a realidade hoje.** O balanceamento (`balanceTeams`) é uma função JavaScript pura que roda **inteiramente no navegador do usuário** — é chamada de forma síncrona em `useSessionWizard.generateDivisions`. **Não há servidor envolvido** no cálculo: o Supabase só é usado para backup/sync opcional. Ou seja, **a máquina do usuário já faz todo o processamento e nosso servidor não é sobrecarregado.** Não há custo de servidor por sorteio, e funciona até offline.

**O porém:** como o cálculo roda na *thread principal* do navegador, durante o processamento pesado (modo `advanced`: 25.000 iterações × 3 seeds) **a interface congela** — nenhuma barra de progresso conseguiria sequer animar, porque a tela só atualiza quando o loop termina. Por isso, hoje, "mostrar o progresso" e "não travar a UI" exigem a mesma solução técnica.

**A solução é o Web Worker** — e ele atende exatamente os dois desejos ao mesmo tempo:

- Um Web Worker é uma **segunda thread dentro do navegador do próprio usuário** (continua usando a máquina dele, nada vai para servidor).
- Como roda em paralelo, **a UI não congela** e pode animar uma barra de progresso de verdade.
- O worker envia mensagens de progresso (ex.: a cada N iterações: `% concluído`, melhor score até agora, e até a melhor divisão parcial). A UI mostra a barra e pode **renderizar o equilíbrio "acontecendo"** — exatamente a experiência que você descreveu.
- O cálculo continua **determinístico** (seeds fixas), então o resultado final é o mesmo.

**Plano de implementação (§2.4 Fase C, item 11):**
1. Extrair `balanceTeams` para um worker (`src/logic/balancer.worker.ts`), trocando a chamada síncrona por mensagens (`postMessage`/`onmessage`).
2. No `SimulatedAnnealingBalancer`, emitir progresso periódico (a cada ~2–5% das iterações) com `% , bestScore, melhor divisão parcial`.
3. UI: estado `isGenerating` + barra de progresso animada no passo "Times", com prévia opcional da melhor divisão atual e botão "cancelar".
4. Como a UI não trava mais, podemos **cobrir mais possibilidades** com tranquilidade (mais iterações/seeds, busca mais exaustiva) sem prejudicar a experiência — quanto melhor o equilíbrio, mais vale a espera, e agora ela é visível.

> Resumo: **o processamento já é do usuário (sem carga no servidor)**; o Web Worker é o que permite, ao mesmo tempo, não travar a tela e mostrar a barra de progresso com o equilíbrio evoluindo.

---

## 3. SessionWizard

### 3.1 Estado atual

7 passos (`Sessão → Atletas → Formato → Regras → Revisão → Times → Tabela`) num único `switch` de 2.219 linhas em `SessionWizard.tsx`, misturando share, edição de times e drag de jogadores.

### 3.2 Problemas

- **Componente monolítico**, difícil de manter/testar.
- **Densidade visual extrema** (`text-[9px] uppercase tracking-widest` por toda parte) — cansativo no celular, que é o uso real à beira da quadra.
- **Validação tardia**: não há indicador claro de "o que falta para avançar".
- **Edição manual de times** não mostra impacto no equilíbrio.

### 3.3 Plano para o SessionWizard

1. **Quebrar em subcomponentes** por passo (`src/components/session/steps/`), refactor sem mudar comportamento, com testes de fumaça.
2. **Etapa "Regras" recebe o seletor de rotação** (6x0 / 5x1) com explicação curta de cada uma e, no 5x1, um resumo da composição que será montada ("cada time: 1 levantador, 2 ponteiros, 1 oposto, 1 central, 1 líbero"). Mostrar aviso quando o elenco não comporta (ex.: "Sem líberos suficientes → usaremos 2 centrais em N times").
3. **Resumo de validação no topo** com botão "Avançar" desabilitado + motivo (mínimo de atletas, posições faltantes para 5x1, formato indefinido).
4. **Aumentar a base tipográfica** (mín. ~12px) mantendo a estética.
5. **Passo Times com feedback de equilíbrio ao vivo**: ao mover jogador, recalcular e mostrar o delta ("Equilíbrio: Bom → Aceitável") e, no 5x1, alertar se quebrar a escalação (ex.: time ficou sem central).
6. **Pré‑visualização das 3 opções lado a lado**, rotuladas por objetivo, com a escalação por posição visível no 5x1.
7. **Indicador de rascunho salvo** (reaproveitar `sessionDraft.ts`).

---

## 4. Telas em jogo, registro de eventos e estatísticas

### 4.0 Verificação: faltas oficiais (FIVB 2025‑2028) × o que o projeto cobre hoje

Cruzando o `PointReason` atual do projeto (`attack`, `block`, `serve_ace`, `opponent_error`, `defense_counterattack`, `tip`, `unknown`) com o livro de regras, o resultado é claro: **o projeto não registra praticamente nenhuma falta específica do vôlei** — todas as faltas caem no balde genérico `opponent_error`. As ações **positivas** estão razoavelmente cobertas; os **erros/faltas**, não.

**Ações positivas (pontos conquistados) — cobertura atual:**

| Ação (regra) | No projeto hoje | Status |
|---|---|---|
| Ace — saque ponto (12) | `serve_ace` | ✅ Coberto |
| Cortada / ataque (13) | `attack` | ✅ Coberto |
| Largadinha (13.1.2) | `tip` | ✅ Coberto |
| Bloqueio (14) | `block` | ✅ Coberto |
| Contra‑ataque (transição) | `defense_counterattack` | ✅ Coberto |
| Bola de segunda (ataque do levantador) | — | ❌ Faltando |

**Faltas oficiais (pontos por erro) — o livro de regras lista, o projeto não distingue:**

| Falta oficial | Regra | No projeto hoje |
|---|---|---|
| Quatro toques | 9.3.1 | ❌ vira `opponent_error` |
| Toque apoiado | 9.3.2 | ❌ vira `opponent_error` |
| Condução (bola retida/lançada) | 9.3.3 | ❌ vira `opponent_error` |
| Dois toques | 9.3.4 | ❌ vira `opponent_error` |
| Invasão sobre a rede (tocar bola/adversário no espaço dele) | 11.4.1 | ❌ vira `opponent_error` |
| Interferência sob a rede | 11.4.2 | ❌ vira `opponent_error` |
| Invasão da quadra adversária (pé além da linha central) | 11.4.3 | ❌ vira `opponent_error` |
| Toque na rede durante a jogada | 11.4.4 | ❌ vira `opponent_error` |
| Falta de ordem de saque | 12.6.1.1 | ❌ vira `opponent_error` |
| Execução incorreta do saque (8s, pisar na linha) | 12.6.1.2 / 12.4 | ❌ vira `opponent_error` |
| Saque na rede / não cruza | 12.6.2.1 | ❌ vira `opponent_error` |
| Saque "fora" | 12.6.2.2 | ❌ vira `opponent_error` |
| Saque sobre barreira | 12.6.2.3 | ❌ vira `opponent_error` |
| Ataque "fora" | 13.3.2 | ❌ vira `opponent_error` |
| Ataque ilegal de fundo ("pisar na linha dos 3") | 13.3.3 | ❌ vira `opponent_error` |
| Ataque sobre saque na zona de frente | 13.3.4 | ❌ vira `opponent_error` |
| Líbero ataca bola acima da rede | 13.3.5 / 19.3.1.2 | ❌ vira `opponent_error` |
| Ataque de bola vinda de toque de dedos do líbero na frente | 13.3.6 / 19.3.1.4 | ❌ vira `opponent_error` |
| Bloqueio invade espaço adversário antes do ataque | 14.6.1 | ❌ vira `opponent_error` |
| Bloqueio de jogador de fundo / líbero | 14.6.2 / 19.3.1.3 | ❌ vira `opponent_error` |
| Bloquear o saque | 14.6.3 | ❌ vira `opponent_error` |
| Bloqueio manda a bola "fora" | 14.6.4 | ❌ vira `opponent_error` |
| Bloqueio por fora da antena | 14.6.5 | ❌ vira `opponent_error` |
| Líbero tenta bloquear | 14.6.6 / 19.3.1.3 | ❌ vira `opponent_error` |
| Líbero saca | 19.3.1.3 | ❌ vira `opponent_error` |
| Falta de posição | 7.5 | ❌ vira `opponent_error` |
| Falta de rotação | 7.7 | ❌ vira `opponent_error` |

**Conclusão:** a §4.1 abaixo propõe a taxonomia que cobre exatamente essa lacuna. Para vôlei amador, o registro deve ser **opcional e rápido** (atalho "Erro — não informado" sempre disponível); o ganho é poder detalhar quando quiser, com a linguagem certa.

### 4.1 Nova taxonomia de eventos (nomenclatura do vôlei)

Hoje `PointReason` é genérico: `attack | block | serve_ace | opponent_error | defense_counterattack | tip | unknown`. O pedido é registrar com a linguagem do vôlei e, em pontos **ou erros**, escolher o fundamento/falta e o responsável.

**Modelo proposto para `PointEvent`** (acrescenta dimensões, mantém compatibilidade):

- `pointType: 'winner' | 'error'` — ponto por **ação positiva** própria ou por **erro/falta** de alguém.
- `skill` (fundamento envolvido): `saque | recepcao | levantamento | ataque | bloqueio | defesa | posicionamento`.
- `fault?` (quando `error`): tipo de falta oficial — ver tabela abaixo.
- `playerId` + `playerTeamId`: o **autor** (quem pontuou OU quem cometeu o erro), permitindo creditar/debitar corretamente nas estatísticas.

**Pontos por ação positiva (`winner`):**

| Rótulo na UI | `skill` | Observação |
|---|---|---|
| Ace | saque | Saque que resulta em ponto |
| Cortada / Ataque | ataque | Kill |
| Largadinha (largada) | ataque | Toque sutil para enganar a defesa |
| Bloqueio | bloqueio | Ponto de bloqueio |
| Contra‑ataque | defesa | Ponto após defesa/transição |
| Bola de segunda | levantamento | Ataque do levantador (opcional) |

**Pontos por erro/falta do adversário (`error`):**

| Rótulo na UI | `skill` | `fault` | Base na regra |
|---|---|---|---|
| Erro de saque | saque | saque_fora_rede | 12.6 |
| Erro de ataque | ataque | ataque_fora_rede | 13.3 |
| Erro de recepção | recepcao | — | — |
| Erro de defesa | defesa | — | — |
| Dois toques | levantamento | dois_toques | 9.3.4 |
| Condução (carregada) | levantamento | conducao | 9.3.3 |
| Quatro toques | — | quatro_toques | 9.3.1 |
| Toque na rede | — | toque_rede | 11.3 / 11.4 |
| Invasão (linha central) | — | invasao_quadra | 11.2 |
| Invasão sobre a rede | — | invasao_rede | 11.1 |
| Ataque ilegal da linha de trás ("pisar na linha dos 3") | ataque | ataque_linha_ataque | 13.2.2 / 13.3 |
| Falta do líbero — ataque acima da rede | ataque | libero_ataque | 13.3.5 |
| Falta do líbero — levantar de dedos na zona de frente p/ ataque | levantamento | libero_levantamento_frente | 13.3.6 |
| Falta do líbero — bloqueio | bloqueio | libero_bloqueio | 14.6.6 |
| Falta de posição / rotação | — | posicao_rotacao | 7.5 / 7.7 |
| Posicionamento / movimentação | posicionamento | — | erro tático genérico |

> A UI agrupa por "Ponto nosso" (ação) vs. "Erro deles / Erro nosso", com o fundamento. Manter um atalho "Não informado" para velocidade.

### 4.2 Registro de ponto — `PointModal` / `TeamScoreCard`

**Problemas atuais:** fluxo de até 3 toques; `reason` inicia em `unknown` e jogador `undefined` (fácil confirmar sem dados); fontes minúsculas; sem desfazer rápido visível.

**Plano:**
1. **Marcação em 1 toque com atribuição opcional**: tocar no jogador já registra o ponto; um seletor de fundamento/falta (taxonomia §4.1) aparece por alguns segundos e auto‑confirma. Mantém velocidade e ainda coleta dados ricos.
2. **Botão grande de Desfazer** sempre visível ("Desfazer: Ace do Math") — `undoLastPoint` já existe no hook.
3. **Aumentar tipografia** do placar; mover barras Força/Rede para um detalhe recolhível.
4. **Modal em duas abas** ("Ponto nosso" / "Erro") seguindo a taxonomia, com ícones e os termos do vôlei.

### 4.3 Estatísticas — `src/logic/statistics.ts`

**Problemas:** `pointsContribution` fixo em `0` (TODO); cálculo de **erros** quase sempre 0 (depende de `playerId` em `opponent_error`, que o fluxo não preenche); `kills` mistura ataque+contra‑ataque+largada.

**Plano (habilitado pela §4.1):**
1. Estatísticas por fundamento: **aces, cortadas, largadas, bloqueios, defesas/contra‑ataques** separados; e **erros por tipo** (saque, ataque, recepção, faltas).
2. Implementar `pointsContribution` (pontos do jogador ÷ pontos do time).
3. Índices úteis para vôlei amador: **eficiência de ataque** (pontos − erros de ataque), **% de aproveitamento de saque**, **saldo individual** (pontos gerados − erros).
4. Cobrir `statistics.ts` com testes usando os fixtures existentes.

### 4.4 Estatísticas ao vivo durante a partida

Adicionar **sequência atual** ("3 pontos seguidos"), **maior parcial** e uma **mini‑timeline** dos últimos pontos (dados já em `PointEvent`). Termos: "rally", "set point", "match point", "red zone" (a partir de 20) para dar identidade.

### 4.5 Transparência do balanceamento

Na tela de times e no card em jogo, mostrar **por que** os times estão equilibrados (resumo de `diagnostics`) e, no 5x1, a **escalação por posição** de cada time.

### 4.6 Glossário

Adicionar uma tela/painel de **glossário do vôlei** (acessível do menu e como tooltips no registro de eventos), reaproveitando os termos: Ace, Rally, Cortada, Dois toques, Largadinha, Manchete, Machadinha, Peixinho, Saque/Serviço, Bloqueio, Líbero, Levantador, Central, Oposto, Ponteiro, Rotação, Set point, Match point, Tie‑break, Red zone, Posições 1–6, etc. Serve de onboarding e padroniza a linguagem do app.

---

## 5. Roadmap priorizado

| Prioridade | Item | Esforço | Risco | Impacto |
|---|---|---|---|---|
| **P0** | Algoritmo §2.4 Fase A (escala, forma, limpeza + recalibrar pesos) — *fundamentos passam a importar* | M | Médio | 🔥 Muito alto |
| **P0** | Eventos §4.1 + registro 1 toque/desfazer §4.2 (nova taxonomia do vôlei) | M‑G | Médio | 🔥 Alto (uso real) |
| **P1** | Algoritmo §2.4 Fase B — rotação 6x0/5x1 + composição por posição + gênero permanente | G | Médio‑alto | 🔥 Alto (feature pedida) |
| **P1** | Wizard §3.3‑2/3 (seletor de rotação na etapa Regras + validação) | M | Baixo | Alto |
| **P1** | Estatísticas §4.3 (por fundamento, erros, contribuição, testes) | M | Baixo | Alto |
| **P2** | Wizard §3.3‑1/4/5/6 (quebrar componentes, tipografia, feedback ao editar, 3 opções) | G | Médio | Médio‑alto |
| **P2** | Algoritmo §2.4 Fase C (desvio‑padrão, diversidade, Web Worker + barra de progresso) | M | Médio | Médio‑alto |
| **P3** | Estat. ao vivo §4.4 + transparência §4.5 + glossário §4.6 | M | Baixo | Médio |

> **Sequência sugerida:** começar pela **Fase A do algoritmo** (sem ela, nem a rotação nem os "fundamentos importam" funcionam direito) **em paralelo** com a **nova taxonomia de eventos + registro 1 toque**. Depois a **rotação 5x1** (que depende da Fase A) junto do seletor no wizard, e então as estatísticas por fundamento.

---

## 6. Riscos, decisões e cuidados

- **Recalibração de pesos:** corrigir a escala vai **mudar os times gerados**. Criar cenários de teste (grupos de exemplo) e validar que os resultados "fazem sentido" antes de mergear.
- **5x1 — decisões de produto a confirmar:** (a) o que fazer com times de **mais de 6** jogadores (reservas/rodízio?); (b) se o nº de atletas não fecha 6 por time, priorizar quais posições; (c) se faltam levantadores/opostos, qual a ordem de fallback (secundária → coringa → relaxar restrição). Sugiro alinhar isso antes da Fase B.
- **Migração de dados:** `PointEvent.reason` muda de forma. Manter um **mapeamento dos reasons antigos** para a nova taxonomia em `migrations.ts` para não perder histórico/estatísticas. `strengthSnapshot.overall` é salvo/exibido em 0–100 (`max={100}` no `TeamScoreCard`); ao mudar a escala interna, manter a de exibição ou versionar.
- **Refactor do Wizard:** incremental, um passo por vez, mantendo os testes verdes.
- **Compatibilidade FIVB vs. amador:** as faltas seguem a FIVB 2025‑2028, mas o app é para vôlei recreativo — manter o registro **opcional e rápido** (ninguém vai detalhar toda falta no meio do jogo). O valor está em permitir, não obrigar.
```
