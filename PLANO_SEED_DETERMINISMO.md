# Plano — Variedade, Determinismo e Rotação do Sorteio

> Plano focado em controlar **quando o sorteio se repete, quando varia e com que qualidade**.
> Escopo escolhido: **(1) Portfólio diverso · (2) Parada por iterações + teto · (3) Anti‑repetição por histórico · (4) Seed aleatória por geração.**
> Base: `src/logic/balancing.ts`, `src/hooks/useSessionWizard.ts`, `src/hooks/useSessions.ts`, `src/types.ts`.

---

## 1. Reformulação do problema (o que descobrimos no código)

A pergunta original ("a seed é a melhor solução?") tinha uma premissa que o código desmente:

- **Reprodutibilidade já está resolvida pela persistência.** Em `confirmDivision` (`useSessionWizard.ts:372`), os times escolhidos são salvos como entidades (`setTeams(...)` → localStorage + sync). Reabrir uma sessão **carrega os times salvos, não recalcula**. Logo, **não precisamos de seed para "reabrir = mesmos times"**.
- **A seed só age dentro do wizard**, antes de confirmar, quando o usuário gera/re‑sorteia. Portanto a seed é, no máximo, uma alavanca de **variedade** — não o mecanismo de reprodutibilidade.

Conclusão: a seed fixa (42) hoje só serve para deixar o sorteio previsível durante o wizard. Vamos substituí‑la por um conjunto de mecanismos melhores.

| Necessidade | Melhor solução |
|---|---|
| Reabrir sessão → mesmos times | **Persistência (já existe)** — nada a fazer |
| 3 opções realmente distintas | **Portfólio diverso** (§3) |
| Variar semana a semana, mesmo grupo | **Anti‑repetição por histórico** (§4) + **seed aleatória** (§6) |
| Mesmo resultado entre aparelhos p/ uma geração | **Parada por iterações** (§5) |
| Cada clique em "gerar" muda | **Seed aleatória por geração** (§6) |

---

## 2. Visão geral da nova arquitetura de sorteio

```
generate(seed aleatória) ─▶ multi-restart (N seeds derivadas)
        │                         │
        │                         ▼
        │                 candidatos (M soluções)
        │                         │
        ▼                         ▼
 anti-repetição          seleção de PORTFÓLIO
 (penalidade no scorer)  (top 3 de alta qualidade
        │                 e mutuamente diferentes)
        ▼                         │
 parada por iterações ◀───────────┘
 (+ teto de segurança ~30–45s, com aviso na UI)
```

Tudo continua **client-side** (Web Worker, ver plano principal §2.6) e **sem servidor**.

---

## 3. Peça 1 — Portfólio diverso (3 opções de verdade)

**Problema atual:** as 3 opções vêm de 3 seeds fixas + uma penalidade só para *fingerprint idêntico*. Soluções "quase iguais" (1 jogador trocado) passam.

**Solução:** gerar **mais candidatos** e **selecionar** as 3 melhores que sejam diferentes entre si.

### Passo 3.1 — Gerar M candidatos

Em `balanceTeams`, rodar `N` reinícios (ex.: 8–12) a partir de seeds derivadas da seed base (`seed, seed+101, seed+202, …`). Cada reinício retorna `{ solution, score }`.

### Passo 3.2 — Métrica de diferença entre soluções

```ts
// Quantos jogadores compartilham o mesmo time entre duas soluções (0 = idênticas)
export function solutionDistance(a: TeamSolution, b: TeamSolution): number {
  // para cada time de A, achar o time de B com maior interseção; somar os "não compartilhados"
  // retorna nº de jogadores que mudaram de companhia
}
```

### Passo 3.3 — Seleção gulosa do portfólio

```ts
function selectPortfolio(candidates: Scored[], k = 3, minDistance = 2): Scored[] {
  const sorted = [...candidates].sort((a, b) => a.score - b.score);
  const chosen: Scored[] = [sorted[0]]; // melhor de todos
  for (const c of sorted.slice(1)) {
    if (chosen.length >= k) break;
    const distinct = chosen.every((s) => solutionDistance(c.solution, s.solution) >= minDistance);
    if (distinct) chosen.push(c);
  }
  // se não achar k distintas, completa com as melhores restantes
  return chosen;
}
```

Substitui a lógica atual de "3 seeds → ordena por score". A penalidade de `duplicateSolution` pode ser removida (a seleção já garante diversidade) ou mantida com peso menor. Os rótulos por objetivo (`assignLabelsToDivisions`) continuam.

---

## 4. Peça 2 — Anti‑repetição por histórico (rotação social)

**Objetivo:** semana a semana, com o mesmo grupo, evitar repetir as mesmas parcerias → todos jogam com todos ao longo do tempo, sem perder o equilíbrio.

### Passo 4.1 — Construir a matriz de coocorrência (`src/logic/partnershipHistory.ts`)

```ts
import { Team, Session } from '../types';

// Peso de "quantas vezes (recentes) o par jogou junto", com decaimento por recência
export type PartnershipMatrix = Map<string, number>; // chave "idA|idB" (ordenada)

export function buildPartnershipMatrix(
  sessions: Session[],      // do mesmo grupo/comunidade
  teams: Team[],
  opts = { lookback: 6, decay: 0.8 },
): PartnershipMatrix {
  const finished = sessions
    .filter((s) => s.status === 'finished' /* ou teams_generated */)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, opts.lookback);

  const matrix: PartnershipMatrix = new Map();
  finished.forEach((s, idx) => {
    const weight = Math.pow(opts.decay, idx); // sessão mais recente pesa mais
    teams.filter((t) => t.sessionId === s.id).forEach((team) => {
      const ids = [...team.playerIds].sort();
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}|${ids[j]}`;
          matrix.set(key, (matrix.get(key) ?? 0) + weight);
        }
    });
  });
  return matrix;
}
```

### Passo 4.2 — Penalidade no scorer (`ObjectiveScorer`)

Receber a matriz e um peso `repetition` (novo em `BalanceWeights`, default p.ex. 0.8):

```ts
let repetitionPenalty = 0;
for (const team of solution.teams) {
  const ids = team.map((a) => a.id).sort();
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      repetitionPenalty += this.partnership.get(`${ids[i]}|${ids[j]}`) ?? 0;
}
repetitionPenalty *= this.weights.repetition;
// somar ao retorno do score()
```

É **soft**: o algoritmo equilibra força/gênero/posição e, entre soluções de qualidade parecida, prefere a que mistura mais o grupo.

### Passo 4.3 — Ligar no fluxo

No hook, montar a matriz a partir de `sessions` + `teams` da comunidade ativa e passar para `balanceTeams` (novo parâmetro ou dentro de `config`). Um toggle "Misturar o grupo (anti‑repetição)" na etapa Regras permite ligar/desligar e regular a intensidade.

> Observação: a matriz é **derivada em runtime** dos dados que já existem (sessões + times). **Não precisa de tabela nova** (ver §8).

---

## 5. Peça 3 — Parada por iterações + teto de segurança

**Objetivo:** resultado igual entre aparelhos para uma mesma seed, e qualidade melhor — aceitando passar de 5s, sem chegar a absurdos.

### Passo 5.1 — Critério de parada baseado em iterações

No `SimulatedAnnealingBalancer.balance`, **remover o relógio do critério principal** e usar só `maxIterations` + estagnação. Escalar `maxIterations` com o tamanho do grupo:

```ts
// ex.: base por jogador, com piso e teto de iterações
const iters = clamp(players.length * 4000, 20000, 120000);
```

### Passo 5.2 — Teto absoluto de segurança (só fallback)

Manter um `Date.now()` **apenas** como guarda‑costas para nunca travar (ex.: 30–45s). Em uso normal ele não dispara; se disparar (máquina muito fraca + grupo enorme), aceitamos perder o determinismo naquele caso extremo.

```ts
const SAFETY_CAP_MS = 45000;
while (iterations < maxIterations && iterationsWithoutImprovement < maxNoImprovement) {
  if (Date.now() - startTime > SAFETY_CAP_MS) break; // raríssimo
  // ...
}
```

### Passo 5.3 — Aviso na UI ("pode demorar")

No passo "Times", antes/junto da barra de progresso, exibir:

> "Estamos testando milhares de combinações para achar o time mais equilibrado. Isso pode levar alguns segundos — quanto maior o grupo, um pouquinho mais."

Combinar com a **barra de progresso + Web Worker** (plano principal §2.6) para a espera ser visível e a UI não travar.

---

## 6. Peça 4 — Seed aleatória por geração

- Cada clique em **"Gerar"** ou **"Re‑sortear"** usa uma **seed base aleatória nova** (`Math.floor(Math.random() * 1e6)`).
- Como o resultado é **persistido ao confirmar** (§1), não há necessidade de salvar a seed para reprodutibilidade.
- (Opcional) Guardar a seed usada em `config.balanceSeed` apenas para fins de depuração/compartilhamento ("gerou um time injogável? me manda a seed"). É `jsonb`, sem migração.

```ts
const generateDivisions = (advanceStep = true) => {
  const seed = Math.floor(Math.random() * 1_000_000);
  // chamar o Worker com { ...config, balanceSeed: seed } + partnershipMatrix
};
```

---

## 7. Passo a passo consolidado (ordem de implementação)

1. **Parada por iterações + teto + aviso** (§5) — baixo risco, melhora qualidade e determinismo já de cara. Depende do Worker (plano principal) para a espera não travar.
2. **Seed aleatória por geração** (§6) — trivial; troca o `baseSeed = 42` por seed aleatória.
3. **Portfólio diverso** (§3) — `solutionDistance` + `selectPortfolio`; substitui a seleção atual de 3 seeds.
4. **Anti‑repetição por histórico** (§4) — `partnershipHistory.ts` + peso `repetition` no scorer + toggle na UI.

Cada etapa mantém `npm run lint` + `npm test` verdes.

---

## 8. Impacto Supabase e Vercel

- **Supabase: zero migração.**
  - Seed (se persistida) e qualquer flag entram em `sessions.config` (`jsonb`).
  - A matriz de anti‑repetição é **derivada em runtime** de `sessions` + `teams` (que já sincronizam). Nenhuma tabela/coluna nova.
  - O peso `repetition` em `BalanceWeights` vai para `community_rules.balance_weights` (`jsonb`).
- **Vercel: nenhum impacto.** Continua SPA estática; o cálculo (mais longo agora) é client-side no Worker. Sem env vars, rotas ou build novos. Só o cuidado já citado de declarar o Worker no padrão do Vite.

---

## 9. Testes

1. **Portfólio:** as 3 opções retornadas têm `solutionDistance ≥ minDistance` entre si.
2. **Anti‑repetição:** dado um histórico onde A e B sempre jogaram juntos, com peso `repetition > 0` eles tendem a cair em times diferentes; com peso 0, o comportamento é o atual.
3. **Determinismo por iterações:** mesma seed + mesmos dados → resultado idêntico, independente de "atrasar" artificialmente o relógio (mock de tempo) — desde que o teto não dispare.
4. **Seed aleatória:** duas gerações seguidas tendem a produzir portfólios diferentes.
5. **Teto de segurança:** com `maxIterations` enorme, o laço encerra pelo teto sem estourar tempo.

---

## 10. Recomendações finais

- **Reprodutibilidade**: confiar na persistência (já existe). Não acoplar à seed.
- **Variedade**: anti‑repetição por histórico é o que mais agrega para grupo fixo; o portfólio garante que o "re‑sortear" sempre ofereça alternativas reais.
- **Tempo**: parada por iterações + teto + aviso + barra de progresso dá qualidade e previsibilidade sem travar.
- **Dependência**: implementar **depois (ou junto)** do Web Worker do plano principal, para a busca mais longa não congelar a UI.
