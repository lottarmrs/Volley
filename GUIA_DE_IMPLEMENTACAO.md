# Guia de Implementação — Panelinha Team Balancer

> Tradução do `PLANO_DE_MELHORIA.md` para **código**: passo a passo de estruturação em **TypeScript + React 19**, com os arquivos exatos a tocar, e a análise de impacto nas integrações **Supabase** e **Vercel**.
> Convenção do projeto: lógica pura em `src/logic` (testável sem React), hooks em `src/hooks`, serviços de nuvem em `src/services/supabase`, componentes em `src/components`, tipos em `src/types.ts`. Todo `npm run lint` (tsc) e `npm test` devem ficar verdes a cada passo.

---

## 0. Mapa rápido: o que cada melhoria toca

| Melhoria | Arquivos principais | Migração Supabase? | Impacto Vercel |
|---|---|---|---|
| Fase A — normalização de escala | `src/logic/calculations.ts`, `src/logic/balancing.ts` | **Não** | Nenhum |
| Fase B — rotação 6x0/5x1 | `src/types.ts`, `src/logic/migrations.ts`, `src/logic/balancing.ts`, `src/components/session/SessionWizard.tsx` | **Não** (config é `jsonb`) | Nenhum |
| Web Worker + barra de progresso | `src/logic/balancer.worker.ts` (novo), `src/hooks/useSessionWizard.ts`, UI do passo "Times" | **Não** | **Atenção leve** (bundling do worker) |
| Taxonomia de eventos | `src/types.ts`, `src/logic/match.ts`, `src/components/live/PointModal.tsx`, `src/logic/statistics.ts`, `src/services/supabase/operationalCloudService.ts` | **Opcional** (texto funciona; colunas estruturadas = 1 migração aditiva) | Nenhum |

**Resumo executivo do impacto de backend:** a maior parte das melhorias é **lógica client-side pura** e **não exige nenhuma mudança no Supabase**, porque os campos relevantes já são `jsonb`/`text` flexíveis (`sessions.config`, `teams.strength_snapshot`, `community_rules.balance_weights`, `point_events.reason`). A única que pode pedir uma migração (aditiva e opcional) é a taxonomia de eventos, se quisermos colunas estruturadas. Detalhes nas §6 e §7.

---

## 1. Fase A — Normalização de escala (base de tudo)

**Objetivo:** fazer os fundamentos realmente pesarem, igualando a escala do `overall` (0–100) à dos fundamentos (0–10) **apenas dentro do scorer**. Atributos continuam 0–10 e `strengthSnapshot.overall` continua 0–100 (sem migração).

### Passo 1.1 — Centralizar constantes

Criar `src/logic/balancingConstants.ts`:

```ts
// Fator de normalização: overall (0–100) → mesma faixa dos fundamentos (0–10)
export const OVERALL_SCALE = 10;

export const PENALTIES = {
  forbiddenPair: 10000,
  togetherPair: 10000,
  lockedAssignment: 10000,
  teamSizeDiff: 2000,
  setterSlot: 8000,
  setterMissing: 15000,
  compositionSlot: 8000, // Fase B
  duplicateSolution: 5000,
} as const;

export const THRESHOLDS = {
  strongAttacker: 7.0, // será tornado relativo na Fase C
  setter: 7.0,
  defensiveRef: 7.0,
} as const;

export const QUALITY = { excellent: 1.5, good: 3.0, acceptable: 6.0 } as const;
```

> Os limiares de `QUALITY` mudam porque o score total cai ~10× após a normalização (eram 15/30/60 na escala quebrada). Calibre com os cenários de teste (passo 1.5).

### Passo 1.2 — Normalizar no `ObjectiveScorer.score` (`src/logic/balancing.ts`)

Onde hoje está:

```ts
const overallSpread = weightedSpread(teamsMetrics.map((m) => m.overall), this.weights.overall);
```

Trocar para dividir o overall pela escala (Opção B do plano, recomendada):

```ts
import { OVERALL_SCALE } from './balancingConstants';

const overallSpread = weightedSpread(
  teamsMetrics.map((m) => m.overall / OVERALL_SCALE), // 0–100 → 0–10
  this.weights.overall,
);
```

> Alternativa (Opção A do plano): manter `m.overall` e multiplicar **cada** spread de fundamento por 10. A Opção B é um único ponto de mudança, por isso é preferível.

Também ajustar `buildBalanceDiagnostics` para usar `m.overall / OVERALL_SCALE` no `overallSpread`, para o diagnóstico bater com o score.

### Passo 1.3 — Limpar `adjustedOverall` (remover dupla contagem de forma)

`calculateGeneralOverall` (em `calculations.ts`) já soma `formaAtual.valor * 0.5`. Em `balancing.ts`:

```ts
// ANTES
export function adjustedOverall(a: AthleteVector): number {
  const injuryPenalty = a.isInjured ? 1.5 : 0.0;
  const formModifier = a.currentForm * 0.25;          // ← dupla contagem
  const heightBonus = calculateHeightImpact(a.heightCm);
  return a.overall + formModifier + heightBonus - injuryPenalty;
}

// DEPOIS — overall já inclui forma e altura; lesão é tratada no termo injuredPenalty do scorer
export function adjustedOverall(a: AthleteVector): number {
  return a.overall;
}
```

> Se quiser manter um leve efeito de lesão no overall, faça-o proporcional à escala 0–100 (ex.: `- (a.isInjured ? 8 : 0)`), mas o recomendado é deixar a lesão só no `injuredPenalty` dedicado para não contar duas vezes.

### Passo 1.4 — Recalibrar os 4 perfis (`MODE_WEIGHTS`)

Com as escalas iguais, os pesos agora têm efeito real. Reduzir o domínio do `overall` e dar peso de verdade aos fundamentos. Exemplo de ponto de partida para `competitive` (ajustar via testes):

```ts
competitive: {
  overall: 1.0, attack: 1.6, defense: 1.4, setting: 1.6, block: 1.2,
  reception: 1.3, serve: 0.8, height: 0.5, gender: 0.6 /* nunca < piso */,
  injured: 0.5, teamSize: 2.0, roleCoverage: 1.5, consistency: 0.8,
  emotionalControl: 0.6, netPresence: 1.0,
}
```

(O piso de `gender` entra na Fase B.)

### Passo 1.5 — Testes (`src/logic/balancing.test.ts`)

Adicionar casos que **provem** o efeito:

1. Um grupo onde dois jogadores têm overall igual mas ataque muito diferente → o perfil `competitive` deve separá-los em times distintos (antes, ignorava).
2. Mudar `balanceMode` de `social` → `competitive` muda a divisão resultante.
3. `getQualityLabel` retorna rótulos coerentes com os novos `QUALITY`.

```bash
npm run lint && npm run test:unit
```

---

## 2. Fase B — Rotação 6x0 / 5x1 e composição por posição

### Passo 2.1 — Tipos (`src/types.ts`)

```ts
export type RotationType = '6x0' | '5x1';

// Adicionar em TournamentConfig e FreePlayConfig:
rotationType?: RotationType; // default '6x0'

// Composição alvo por papel (5x1)
export interface RoleComposition {
  levantador: number; // 1
  ponteiro: number;   // 2
  oposto: number;     // 1
  central: number;    // 1 (ou 2 no fallback)
  libero: number;     // 1 (ou 0 no fallback)
}
```

### Passo 2.2 — Defaults e migração local (`src/logic/migrations.ts`)

Em `DEFAULT_TOURNAMENT_CONFIG` e no normalizador, garantir `rotationType`:

```ts
export function normalizeTournamentConfig(config: any): TournamentConfig {
  return {
    ...DEFAULT_TOURNAMENT_CONFIG,
    ...config,
    rotationType: config?.rotationType ?? '6x0', // sessões antigas viram 6x0
    // ...resto igual
  };
}
```

Fazer o equivalente para o free play (criar `normalizeFreePlayConfig` se ainda não existir, espelhando o padrão). **Isso garante compatibilidade com dados antigos sem migração de banco** (ver §6).

### Passo 2.3 — Resolução de elenco por posição (`src/logic/balancing.ts`)

Nova função pura que decide a composição viável antes do annealing:

```ts
import { RoleComposition } from '../types';

export function resolveComposition(
  athletes: AthleteVector[],
  numTeams: number,
): { perTeam: RoleComposition; warnings: string[] } {
  const liberos = athletes.filter((a) => a.position === 'libero').length;
  const warnings: string[] = [];
  // 1 líbero por time se houver; senão, fallback 2 centrais / 0 líbero
  const useLibero = liberos >= numTeams;
  if (!useLibero) warnings.push('Líberos insuficientes → usando 2 centrais por time.');
  return {
    perTeam: {
      levantador: 1, ponteiro: 2, oposto: 1,
      central: useLibero ? 1 : 2,
      libero: useLibero ? 1 : 0,
    },
    warnings,
  };
}
```

> Para papéis com déficit (ex.: poucos levantadores), a ordem de fallback é: posição secundária (`secondaryPositions`) → `all-rounder` (coringa) → relaxar o slot com aviso. Isso é uma **decisão de produto a confirmar** (ver §6 do plano).

### Passo 2.4 — Penalidade de composição no scorer

Dentro de `ObjectiveScorer.score`, quando `rotationType === '5x1'`, somar penalidade por slot fora do alvo. Passar a composição e o tipo via construtor do scorer:

```ts
// pseudo: por time, contar jogadores por papel (usando position + secondary + all-rounder)
for (const team of solution.teams) {
  for (const role of ['levantador','ponteiro','oposto','central','libero'] as const) {
    const have = countRole(team, role);
    const want = composition.perTeam[role];
    if (have < want) penalty += (want - have) * PENALTIES.compositionSlot;
  }
}
```

Além disso, **equilibrar atributos dentro do papel**: em vez de só comparar a média do time, comparar "média dos ponteiros entre times", "média dos centrais entre times", etc. (novos spreads por papel, com peso menor).

### Passo 2.5 — Atribuição inicial guiada por papéis (`InitialTeamBuilder`)

Estender `buildInitialSolution`: distribuir por papel em **snake draft** (ida-e-volta), do mais forte ao mais fraco dentro de cada papel, respeitando gênero. Isso dá um ponto de partida já próximo da composição alvo, encurtando o annealing.

### Passo 2.6 — Gênero como critério permanente

No `MODE_WEIGHTS`, garantir um **piso** de `gender` em todos os perfis (ex.: nunca < 0.6) e aplicar o termo de gênero independente da rotação. No 5x1, adicionar penalidade leve se todas as mulheres caírem no mesmo papel.

### Passo 2.7 — UI: seletor na etapa "Regras" (`SessionWizard.tsx`, `case 3`)

Adicionar um grupo de opções (6x0 / 5x1). Ao escolher 5x1, chamar `resolveComposition` (via hook) e mostrar o resumo + `warnings`. Persistir em `config.rotationType` pelo fluxo existente de update de config.

```tsx
<RotationSelector
  value={config.rotationType ?? '6x0'}
  onChange={(rt) => updateConfig({ rotationType: rt })}
  composition={composition}   // de resolveComposition
  warnings={warnings}
/>
```

---

## 3. Web Worker + barra de progresso

**Objetivo:** mover `balanceTeams` para uma thread separada **na máquina do usuário** (sem servidor), liberando a UI e permitindo barra de progresso animada.

### Passo 3.1 — Protocolo de mensagens (`src/logic/balancerMessages.ts`)

```ts
import { Player, TournamentConfig, FreePlayConfig, Division } from '../types';

export interface BalanceRequest {
  type: 'balance';
  players: Player[];
  numTeams: number;
  sessionId: string;
  config?: TournamentConfig | FreePlayConfig;
}
export type BalanceResponse =
  | { type: 'progress'; percent: number; bestScore: number; partial?: Division }
  | { type: 'done'; divisions: Division[] }
  | { type: 'error'; message: string };
```

### Passo 3.2 — O worker (`src/logic/balancer.worker.ts`)

```ts
/// <reference lib="webworker" />
import { balanceTeams } from './balancing';
import type { BalanceRequest, BalanceResponse } from './balancerMessages';

self.onmessage = (e: MessageEvent<BalanceRequest>) => {
  const { players, numTeams, sessionId, config } = e.data;
  const post = (m: BalanceResponse) => self.postMessage(m);
  try {
    // balanceTeams recebe um callback opcional de progresso (passo 3.3)
    const divisions = balanceTeams(players, numTeams, sessionId, config, (percent, bestScore, partial) =>
      post({ type: 'progress', percent, bestScore, partial }),
    );
    post({ type: 'done', divisions });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
```

### Passo 3.3 — Emitir progresso no annealing (`balancing.ts`)

Adicionar um parâmetro opcional `onProgress?` em `balanceTeams` e no `SimulatedAnnealingBalancer.balance`, chamando-o a cada ~2–5% das iterações (acumulando entre as 3 seeds para o percentual global). **Sem `onProgress`, o comportamento atual é idêntico** (assinatura retrocompatível), então os testes existentes continuam válidos.

### Passo 3.4 — Consumir no hook (`src/hooks/useSessionWizard.ts`)

Trocar a chamada síncrona por uma assíncrona com worker e estado de progresso:

```ts
const [isGenerating, setIsGenerating] = useState(false);
const [progress, setProgress] = useState(0);

const generateDivisions = (advanceStep = true) => {
  if (!activeSession?.config) return;
  const sessionPlayers = players.filter((p) => activeSession.selectedPlayerIds.includes(p.id));

  const worker = new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), { type: 'module' });
  setIsGenerating(true); setProgress(0);

  worker.onmessage = (e: MessageEvent<BalanceResponse>) => {
    const msg = e.data;
    if (msg.type === 'progress') setProgress(msg.percent);
    else if (msg.type === 'done') {
      setBestDivisions(msg.divisions); setSelectedDivisionIndex(0);
      setIsGenerating(false); worker.terminate();
      if (advanceStep) nextStep();
    } else { setIsGenerating(false); worker.terminate(); /* tratar erro */ }
  };
  worker.postMessage({ type: 'balance', players: sessionPlayers,
    numTeams: activeSession.config.teamCount, sessionId: activeSession.id, config: activeSession.config });
};
```

> `new Worker(new URL('...', import.meta.url), { type: 'module' })` é a forma **oficial do Vite** de declarar workers — ele detecta esse padrão e gera o chunk do worker automaticamente (ver §7).

### Passo 3.5 — UI da barra de progresso (passo "Times")

Quando `isGenerating`, renderizar uma `progress` (daisyUI) com `value={progress}` e, se vier `partial`, uma prévia da melhor divisão atual + botão "Cancelar" (`worker.terminate()`). É o "ver o equilíbrio acontecendo".

### Passo 3.6 — Cobertura maior de possibilidades

Como a UI não trava mais, aumentar `SPEED_CONFIG.advanced` (mais iterações/seeds) e, se quiser, mais opções exploradas. Sem temperatura adaptativa — manter o resfriamento atual (`temperature *= 0.995`).

---

## 4. Taxonomia de eventos (nomenclatura do vôlei)

### Passo 4.1 — Tipos (`src/types.ts`)

```ts
export type PointType = 'winner' | 'error';
export type Skill = 'saque' | 'recepcao' | 'levantamento' | 'ataque' | 'bloqueio' | 'defesa' | 'posicionamento';
export type Fault =
  | 'saque_fora' | 'saque_rede' | 'ataque_fora' | 'ataque_rede'
  | 'dois_toques' | 'conducao' | 'quatro_toques' | 'toque_apoiado'
  | 'toque_rede' | 'invasao_quadra' | 'invasao_rede'
  | 'ataque_linha_ataque' | 'libero_ataque' | 'libero_levantamento_frente'
  | 'libero_bloqueio' | 'libero_saque' | 'bloqueio_fora_antena'
  | 'posicao_rotacao';

// PointReason antigo é mantido para retrocompat de leitura; novos campos:
export interface PointEvent {
  // ...campos atuais...
  reason?: PointReason;          // legado (manter)
  pointType?: PointType;         // novo
  skill?: Skill;                 // novo
  fault?: Fault;                 // novo (quando pointType === 'error')
  playerTeamId?: string | null;  // time do autor (crédito/débito correto)
}
```

> Manter `reason` evita quebrar leitura de dados antigos. Os novos campos são opcionais.

### Passo 4.2 — Rótulos (`src/logic/match.ts`)

Substituir/expandir `POINT_REASON_LABELS` por mapas `SKILL_LABELS`, `FAULT_LABELS` com os termos do vôlei (Ace, Cortada, Largadinha, Dois toques, Condução, Toque na rede, Invasão, etc. — ver tabelas da §4.1 do plano). Atualizar `calculatePlayerScoringRanking` para creditar por `pointType === 'winner'` em vez do array `CREDITED_REASONS`.

### Passo 4.3 — UI (`src/components/live/PointModal.tsx`)

Modal em duas abas: **"Ponto nosso"** (ações positivas por `skill`) e **"Erro"** (por `fault`). Manter atalho "Não informado" para velocidade (alinha com o registro de 1 toque da §4.2 do plano). Ao confirmar, gravar `pointType`, `skill`/`fault`, `playerId`, `playerTeamId`.

### Passo 4.4 — Estatísticas (`src/logic/statistics.ts`)

Reescrever para agregar por `skill`/`fault`: aces, cortadas, largadas, bloqueios, defesas, **erros por tipo**, `pointsContribution` (pontos do jogador ÷ pontos do time), saldo individual. Adicionar testes dedicados (hoje não há).

---

## 5. Sequência de PRs sugerida

1. **PR1 — Fase A** (`balancingConstants.ts`, normalização, limpeza, recalibração, testes). Isolado e de alto impacto.
2. **PR2 — Web Worker + progresso** (independe da taxonomia; depende só de Fase A estar de pé).
3. **PR3 — Rotação 5x1** (tipos + migração local + composição + UI).
4. **PR4 — Taxonomia de eventos** (tipos + match + PointModal + statistics + mapper; ver §6 sobre a migração opcional).

Cada PR mantém `npm run lint`, `npm run test:unit` e `npm run test:ui` verdes.

---

## 6. Impacto no Supabase

O esquema (`supabase/migrations/`) usa colunas flexíveis, o que minimiza o impacto:

- **`sessions.config` é `jsonb`** → adicionar `rotationType` (Fase B) **não exige migração**. Já chega/sai pelo mapper de sessão como parte do objeto `config`. Sessões antigas sem o campo são normalizadas para `'6x0'` em `migrations.ts` (passo 2.2).
- **`teams.strength_snapshot` é `jsonb`** → manter o overall em 0–100 (sem mudança). A normalização da Fase A é **só no scorer**, não no snapshot → **sem migração, sem mudança de mapper**.
- **`community_rules.balance_weights` é `jsonb`** → defaults de rotação/peso por comunidade **sem migração**.
- **`point_events.reason` é `text` sem `CHECK`** → novos valores de reason já funcionam. **Porém**, os campos estruturados novos (`pointType`, `skill`, `fault`, `playerTeamId`) **não têm coluna**. Duas opções:

  **Opção 1 (recomendada) — migração aditiva e segura** (`supabase/migrations/2026XXXX_point_event_taxonomy.sql`):

  ```sql
  alter table public.point_events
    add column if not exists point_type text,
    add column if not exists skill text,
    add column if not exists fault text,
    add column if not exists player_team_id text;
  ```

  É **aditiva** (colunas anuláveis), não quebra dados nem RLS existentes. Depois, atualizar `mapPointEventToDb` / `mapDbToPointEvent` em `src/services/supabase/operationalCloudService.ts` (linha ~191) para ler/gravar os novos campos.

  **Opção 2 — sem migração:** guardar os novos campos dentro do que já existe (ex.: serializar `{pointType,skill,fault}` no próprio `reason` ou reaproveitar um jsonb). Funciona, mas suja as consultas — preferir a Opção 1.

- **Sem impacto em RLS/policies:** nenhuma das mudanças altera ownership/community model; as policies de `point_events`/`teams`/`sessions` continuam válidas.
- **Migração de histórico (opcional):** se quiser que estatísticas antigas usem a nova taxonomia, criar um passo em `src/logic/migrations.ts` que mapeie `reason` legado → `pointType/skill` (ex.: `attack → winner/ataque`, `opponent_error → error/undefined`). Não é obrigatório.

**Conclusão Supabase:** Fases A, B e o Worker = **zero migração**. Taxonomia de eventos = **uma migração aditiva opcional** + atualização de 1 mapper.

---

## 7. Impacto na Vercel

O projeto é uma **SPA Vite** (sem `vercel.json`, sem funções serverless). O cálculo é client-side, então a Vercel só serve estáticos.

- **Build:** continua `vite build` → `dist/`. Sem mudança de comando.
- **Web Worker:** usar **obrigatoriamente** o padrão `new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), { type: 'module' })`. Assim o Vite emite o worker como um chunk separado no `dist/assets/`, servido normalmente como estático pela Vercel. **Não** importar o worker por caminho string solto (quebra no build de produção).
- **Sem servidor, sem custo extra:** o processamento é na máquina do usuário; a Vercel não executa nada do balanceamento. Nada de funções, nada de cold start.
- **Variáveis de ambiente:** as `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` já são embutidas no build (prefixo `VITE_`). Nenhuma variável nova é necessária para estas melhorias. Garantir que estejam configuradas no painel da Vercel (Production/Preview) — já é o caso hoje.
- **SPA fallback (react-router):** como não há `vercel.json`, a Vercel usa o preset Vite (fallback para `index.html`). As mudanças aqui **não alteram rotas**, então nada a fazer. Se um dia aparecer 404 em refresh de rota interna, aí sim criar `vercel.json` com rewrite para `/index.html` — mas isso é independente deste plano.
- **Headers (opcional):** Web Workers `type: module` não exigem COOP/COEP (não usamos `SharedArrayBuffer`). Nenhum header especial é necessário.

**Conclusão Vercel:** impacto praticamente nulo. O único cuidado real é declarar o worker no padrão do Vite para o bundling de produção funcionar.

---

## 8. Checklist de verificação por fase

- [ ] **A:** `npm run lint` + `test:unit` verdes; cenários provam que fundamentos pesam; rótulos de qualidade coerentes.
- [ ] **B:** sessão 5x1 gera composição correta; fallback líbero→central com aviso; sessões antigas abrem como 6x0.
- [ ] **Worker:** UI não congela no modo `advanced`; barra anima; resultado idêntico ao síncrono (determinismo); build de produção (`npm run build`) emite o chunk do worker.
- [ ] **Eventos:** PointModal grava `pointType/skill/fault`; estatísticas por fundamento batem; migração aditiva aplicada e mappers atualizados; dados antigos ainda leem.
```
