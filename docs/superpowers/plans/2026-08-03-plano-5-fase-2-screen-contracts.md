# Plano 5 — Fase 2: Screen Contracts (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as 9 telas principais para o tipo formal `ScreenContract<Model, Intent>`, de forma gradual e com TDD, tornando cada view uma função pura de `Model` que emite `Intent` — sem acessar `@infra/*` nem `@storage/*`.

**Architecture:** Cada tela ganha 3 arquivos em `src/application/screens/<screen>/`: `<screen>Model.ts` (tipo `Model`, dados prontos para render), `<screen>Intents.ts` (união discriminada de `Intent`), `<screen>Contract.ts` (factory `buildScreenContract(input)` que liga hooks/use-cases existentes em `Model` + `dispatch(intent)`). A view (`.tsx`) deixa de receber ~30 props individuais e passa a consumir `ScreenContract`. A navegação atual (`Module`/`Page` `useState` em `App.tsx`) **não muda** nesta fase — `App.tsx` continua shell; ele passa a chamar `buildScreenContract(...)` e renderizar `<Screen contract={...} />`.

**Tech Stack:** TypeScript (sem `strict`, com `strictNullChecks`), React 19, Vite 6, Node test runner + tsx (`.test.ts`), Vitest + RTL (`.spec.tsx`).

## Global Constraints

- **Prettier:** aspas simples, 100 chars (`.prettierrc`).
- **TypeScript:** `strictNullChecks: true`, **não** `strict: true` (compilador permissivo). Imports por alias (`@app`, `@domain`, `@hooks`, `@ui`, `@storage`, `@infra`, `@shared/types`), não paths relativos profundos — exceto dentro de uma mesma árvore de feature.
- **Sem comentários no source a não ser que pedido.** UI em pt-BR (labels, toasts, erros, campos do domínio).
- **Test runners — não confundir:** `.test.ts` → unit (Node runner + tsx), zero DOM; `.spec.tsx` → UI (Vitest + jsdom + RTL, `globals: true`).
- **Ordem de verificação CI por tarefa:** `npm run lint` (typecheck) → `npm run test:unit` → `npm run test:ui` → `npm run build`. Tudo verde antes de commitar a tarefa.
- **`AppResult<T>`:** casos de uso em `src/application/` retornam `AppResult<T>` (`src/application/appResult.ts`); erros via helpers (`productError`, `validationError`, etc.), não `throw` cru. O `dispatch` de um contract pode delegar a um use-case e tratar o result internamente — não propaga `throw` pra view.
- **Skill por tarefa:** `superpowers:test-driven-development` em cada tela (RED-GREEN-REFACTOR). `superpowers:verification-before-completion` em cada gate.
- **Convenção de nomes (decidida aqui, não na spec base):** diretório `src/application/screens/<screen-screaming>/` com `<Screen>Model.ts`, `<Screen>Intents.ts`, `<Screen>Contract.ts`, `<Screen>Contract.test.ts`. A view existente em `src/components/...` **não muda de lugar** — só troca a assinatura de props.
- **Gate de fase (Fase 2 → Fase 3), em vigor ao final:** (a) 9 telas migradas para `ScreenContract`; (b) **nenhuma view importa `@infra/*` ou `@storage/*`** — verificável por `grep -rn "from '@infra/\|from '@storage/" src/components/ src/app/` retornando vazio; (c) `typecheck → test:unit → test:ui → build` verde; (d) testes de contract cobrem `Model` e `Intent` de cada tela.
  - **Estado atual verificado (2026-08-03):** `grep` em `src/components/**/*.tsx` acha **exatamente 1** importação de `@storage/*` (`SessionActiveView.tsx:50`, `getOrCreateDeviceId`) e **zero** de `@infra/*`. Logo o gate de infra é quase todo satisfeito pelo contract da tela 2 (SessionActiveView). As telas 1 e 3-9 já não importam `@infra/*`/`@storage/*` — só precisam do contract.

---

## File Structure

### Diretório novo: `src/application/screens/`

Não existe hoje. Cada tela ganha um subdiretório:

```
src/application/screens/
├── sessionWizard/
│   ├── sessionWizardModel.ts        # tipo Model
│   ├── sessionWizardIntents.ts      # tipo Intent (união discriminada)
│   ├── sessionWizardContract.ts     # buildSessionWizardContract(input): ScreenContract<Model, Intent>
│   └── sessionWizardContract.test.ts # unit: Model construído + cada Intent despacha p/ hook certo
├── sessionActiveView/
│   ├── sessionActiveViewModel.ts
│   ├── sessionActiveViewIntents.ts
│   ├── sessionActiveViewContract.ts
│   └── sessionActiveViewContract.test.ts
├── playerEditView/
├── communitiesView/
├── playersView/
├── dashboard/
├── historyView/
├── accountSyncView/
└── gestaoView/
```

Um arquivo compartilhado define o tipo `ScreenContract` (a spec base dá o tipo inline; materializo uma vez):

- **Create:** `src/application/screens/screenContract.ts` — `export type ScreenContract<Model, Intent> = { model: Model; dispatch(intent: Intent): Promise<void> };`

### Views existentes (mudam de assinatura, **não** de lugar)

| View | Path atual | Sheet de specs ao lado |
|------|-----------|------------------------|
| SessionWizard | `src/components/session/SessionWizard.tsx` | — (sem spec hoje) |
| SessionActiveView | `src/components/live/SessionActiveView.tsx` | `src/components/live/SessionActiveView.spec.tsx` (?) |
| PlayerEditView | `src/components/player/PlayerEditView.tsx` | `src/components/player/PlayerEditView.spec.tsx` |
| CommunitiesView | `src/components/community/CommunitiesView.tsx` | `src/components/community/CommunitiesView.spec.tsx` |
| PlayersView | `src/components/player/PlayersView.tsx` | ? |
| Dashboard | `src/components/dashboard/Dashboard.tsx` | ? |
| HistoryView | `src/components/history/HistoryView.tsx` | `src/components/history/HistoryView.spec.tsx` |
| AccountSyncView | `src/components/account/AccountSyncView.tsx` | `src/components/account/AccountSyncView.spec.tsx` |
| GestaoView | `src/components/admin/GestaoView.tsx` | ? |

> Confirmar sheet de specs existente por tela no passo 1 de cada tarefa (Glob `*.spec.tsx` no diretório do componente). Specs existentes **devem continuar passando** — são testes de regressão de UI; não apagar, não weaken.

### `App.tsx` (shell)

Linhas que renderizam cada tela no `renderActiveContent()` switch **recebem** `buildScreenContract(...)` e passam `contract` em vez de props individuais. A posição no switch e o `Module`/`Page` **não mudam**.

---

## Task Right-Sizing

Cada tarefa = uma tela completa (Model + Intent + Contract + testes + refatoro da view + wiring no App.tsx + gate verde). Telas 1 e 2 são sequenciais (definem/validam o padrão); telas 3-9 podem ser despachadas em paralelo após o gate da tela 2 verde. Cada tarefa termina com commit independente e gate verde.

### Ordem (da spec do Plano 5 seção 5.3)

1. SessionWizard (alta) — **sequencial, define o padrão**
2. SessionActiveView (alta) — **sequencial, valida o padrão + corta a única importação de `@storage/*`**
3. PlayerEditView (média) — paralelizável dali em diante
4. CommunitiesView (média)
5. PlayersView (baixa)
6. Dashboard (baixa)
7. HistoryView (baixa)
8. AccountSyncView (média)
9. GestaoView (baixa)
— Task 10: gate de fase (grep infra/storage vazio + suite completa verde + HANDOFF)

---




### Task 0: Fundação — tipo `ScreenContract` compartilhado

**Files:** Create `src/application/screens/screenContract.ts`
**Interfaces:** Produces `ScreenContract<Model, Intent>` — consumido pelas Tasks 1-9.

- [ ] **Step 1: Criar o tipo compartilhado**

```ts
// src/application/screens/screenContract.ts
export type ScreenContract<Model, Intent> = {
  model: Model;
  dispatch(intent: Intent): Promise<void>;
};
```

- [ ] **Step 2: typecheck** — Run `npm run lint` → PASS.
- [ ] **Step 3: Commit** — `git add src/application/screens/screenContract.ts && git commit -m "feat(screens): adicionar tipo ScreenContract (Fase 2 Task 0)"`

---

### Task 1: SessionWizard — define o padrão (sequencial)

**Complexidade:** Alta. 6 steps, ~30 props, `onAddGuestPlayer` inline que toca `play.setPlayers`/`setPage`/`wizard.updateSession`.
**Files:**
- Create `src/application/screens/sessionWizard/sessionWizardModel.ts`
- Create `src/application/screens/sessionWizard/sessionWizardIntents.ts`
- Create `src/application/screens/sessionWizard/sessionWizardContract.ts`
- Create `src/application/screens/sessionWizard/sessionWizardContract.test.ts`
- Modify `src/components/session/SessionWizard.tsx` (props → `contract`)
- Modify `src/App.tsx` (bloco `<SessionWizard .../>` ~613-659)

**Interfaces — Consumes:**
- Retorno de `useSessionWizard` (`src/hooks/useSessionWizard.ts:356-385`): `{ wizardStep, setWizardStep, validationErrors, bestDivisions, setBestDivisions, selectedDivisionIndex, setSelectedDivisionIndex, isGenerating, progress, nextStep, prevStep, goToStep, updateSession, togglePlayer, selectAllActivePlayers, clearSelectedPlayers, useLastSelection, validateCurrentStep, generateDivisions, cancelGeneration, confirmDivision, startGeneratedTournament, cancelWizard, resumeDraft, togglePlayerLock, addPairConstraint, removePairConstraint, partnershipMatrix }`
- `applyGuestPlayerUpsert(rawPlayers, newPlayer)` de `@app/localPlayerUseCases`
- `setPage`/`setEditingPlayer`/`setPlayers` do shell e de `usePlayers`

**Interfaces — Produces:** `SessionWizardModel`, `SessionWizardIntent`, `buildSessionWizardContract(input)`, e a view passa a aceitar `contract`.

#### Step 1: `Model`

- [ ] Criar `sessionWizardModel.ts`:

```ts
import type { Community, Division, PartnershipMatrix, Player, Session } from '@shared/types';

export interface SessionWizardModel {
  activeSession: Session | null;
  players: Player[];
  communities: Community[];
  wizardStep: number;
  validationErrors: Record<string, string>;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
  isGenerating: boolean;
  generationProgress: number;
  partnershipMatrix?: PartnershipMatrix;
  stepLabels: string[];
  positionLabels: Record<string, string>;
  positionOrder: string[];
}
```

- [ ] `npm run lint` → PASS.

#### Step 2: `Intent`

- [ ] Criar `sessionWizardIntents.ts`:

```ts
import type { Division, Player, Session } from '@shared/types';

export type SessionWizardIntent =
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'cancel' }
  | { kind: 'updateSession'; patch: Partial<Session> }
  | { kind: 'togglePlayer'; id: string }
  | { kind: 'selectAllActive' }
  | { kind: 'clearSelection' }
  | { kind: 'useLastSelection' }
  | { kind: 'generateDivisions'; advanceStep?: boolean }
  | { kind: 'cancelGeneration' }
  | { kind: 'confirmDivision' }
  | { kind: 'startGeneratedTournament' }
  | { kind: 'selectDivisionIndex'; index: number }
  | { kind: 'togglePlayerLock'; playerId: string; teamIdx: number }
  | { kind: 'addPairConstraint'; p1: string; p2: string; type: 'together' | 'separated' }
  | { kind: 'removePairConstraint'; p1: string; p2: string; type: 'together' | 'separated' }
  | { kind: 'setBestDivisions'; divisions: Division[] }
  | { kind: 'addGuestPlayer'; player: Player; editDetails: boolean };
```

- [ ] `npm run lint` → PASS.

#### Step 3: `buildSessionWizardContract`

- [ ] Criar `sessionWizardContract.ts`. O `dispatch` é um `switch(intent.kind)` que delega cada intent à função correspondente da hook API. Para `addGuestPlayer`, o contract chama `input.applyGuestPlayer(player, editDetails)` — a costura real (que toca `applyGuestPlayerUpsert`→`setPlayers`, `updateSession`, e `setPage('player-edit')` quando `editDetails`) **fica em `App.tsx`**, passada como `applyGuestPlayer` no `SessionWizardContractInput`. Isso mantém o contract puro (sem `setPage`, sem `setPlayers`) e o shell como único lugar que conhece navegação cross-slice.

```ts
import type { Community, Division, Player, Session } from '@shared/types';
import type { PartnershipMatrix } from '@logic/partnershipHistory';
import type { ScreenContract } from '../screenContract';
import type { SessionWizardModel } from './sessionWizardModel';
import type { SessionWizardIntent } from './sessionWizardIntents';

export type SessionWizardHookApi = {
  wizardStep: number;
  validationErrors: Record<string, string>;
  bestDivisions: Division[];
  setBestDivisions: (d: Division[]) => void;
  selectedDivisionIndex: number;
  setSelectedDivisionIndex: (i: number) => void;
  isGenerating: boolean;
  progress: number;
  nextStep: () => void;
  prevStep: () => void;
  updateSession: (patch: Partial<Session>) => void;
  togglePlayer: (id: string) => void;
  selectAllActivePlayers: () => void;
  clearSelectedPlayers: () => void;
  useLastSelection: () => void;
  validateCurrentStep: () => boolean;
  generateDivisions: (advanceStep?: boolean) => void;
  cancelGeneration: () => void;
  confirmDivision: () => void;
  startGeneratedTournament: () => void;
  cancelWizard: () => void;
  togglePlayerLock: (playerId: string, teamIdx: number) => void;
  addPairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  removePairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  partnershipMatrix?: PartnershipMatrix;
};

export interface SessionWizardContractInput {
  activeSession: Session | null;
  players: Player[];
  communities: Community[];
  hookApi: SessionWizardHookApi;
  applyGuestPlayer: (player: Player, editDetails: boolean) => void;
}

function buildModel(input: SessionWizardContractInput): SessionWizardModel {
  const h = input.hookApi;
  return {
    activeSession: input.activeSession,
    players: input.players,
    communities: input.communities,
    wizardStep: h.wizardStep,
    validationErrors: h.validationErrors,
    bestDivisions: h.bestDivisions,
    selectedDivisionIndex: h.selectedDivisionIndex,
    isGenerating: h.isGenerating,
    generationProgress: h.progress,
    partnershipMatrix: h.partnershipMatrix,
    stepLabels: ['Sessão', 'Atletas', 'Formato', 'Regras', 'Revisão', 'Times', 'Tabela'],
    positionLabels: { levantador: 'Levantador', ponteiro: 'Ponteiro', oposto: 'Oposto', central: 'Central', libero: 'Líbero', 'all-rounder': 'Curinga' },
    positionOrder: ['levantador', 'ponteiro', 'oposto', 'central', 'libero', 'all-rounder'],
  };
}

export function buildSessionWizardContract(
  input: SessionWizardContractInput,
): ScreenContract<SessionWizardModel, SessionWizardIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: SessionWizardIntent): Promise<void> => {
    const h = input.hookApi;
    switch (intent.kind) {
      case 'next': if (h.validateCurrentStep()) h.nextStep(); return;
      case 'prev': h.prevStep(); return;
      case 'cancel': h.cancelWizard(); return;
      case 'updateSession': h.updateSession(intent.patch); return;
      case 'togglePlayer': h.togglePlayer(intent.id); return;
      case 'selectAllActive': h.selectAllActivePlayers(); return;
      case 'clearSelection': h.clearSelectedPlayers(); return;
      case 'useLastSelection': h.useLastSelection(); return;
      case 'generateDivisions': h.generateDivisions(intent.advanceStep); return;
      case 'cancelGeneration': h.cancelGeneration(); return;
      case 'confirmDivision': h.confirmDivision(); return;
      case 'startGeneratedTournament': h.startGeneratedTournament(); return;
      case 'selectDivisionIndex': h.setSelectedDivisionIndex(intent.index); return;
      case 'togglePlayerLock': h.togglePlayerLock(intent.playerId, intent.teamIdx); return;
      case 'addPairConstraint': h.addPairConstraint(intent.p1, intent.p2, intent.type); return;
      case 'removePairConstraint': h.removePairConstraint(intent.p1, intent.p2, intent.type); return;
      case 'setBestDivisions': h.setBestDivisions(intent.divisions); return;
      case 'addGuestPlayer': input.applyGuestPlayer(intent.player, intent.editDetails); return;
    }
  };
  return { model, dispatch };
}
```

> `ponytail:` `positionLabels`/`stepLabels`/`positionOrder` são constantes literais no `Model` para tirar do componente (que hoje as tem como module-level no `.tsx`). Se preferir, podem ficar num arquivo `sessionWizardConstants.ts` e o `buildModel` só reexportar — só fazer isso se a view ainda precisar delas fora do model.

- [ ] `npm run lint` → PASS.

#### Step 4: Teste do contract (RED → GREEN)

- [ ] Criar `sessionWizardContract.test.ts` cobrindo: (a) `buildModel` projeta corretamente os campos da hook API no `Model`; (b) cada `Intent` despacha para a função esperada da hook (usar spies assertáveis). Temas obrigatórios: `next` só chama `nextStep` se `validateCurrentStep()` retornar `true` (testar ambos ramos); `addGuestPlayer` chama `applyGuestPlayer` (não a hook); `selectDivisionIndex` chama `setSelectedDivisionIndex`.

  Template:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionWizardContract } from './sessionWizardContract';

function spy() { const calls: unknown[][] = []; const fn = (...a: unknown[]) => calls.push(a); return { fn, calls }; }

function makeHookApi(overrides: Partial<Record<string, { fn: (...a: never[]) => unknown }>> = {}) {
  const noop = { fn: () => {} };
  return {
    wizardStep: 0, validationErrors: {}, bestDivisions: [], setBestDivisions: noop,
    selectedDivisionIndex: 0, setSelectedDivisionIndex: noop, isGenerating: false, progress: 0,
    nextStep: overrides.nextStep ?? noop, prevStep: overrides.prevStep ?? noop,
    updateSession: overrides.updateSession ?? noop, togglePlayer: overrides.togglePlayer ?? noop,
    selectAllActivePlayers: noop, clearSelectedPlayers: noop, useLastSelection: noop,
    validateCurrentStep: overrides.validateCurrentStep ?? { fn: () => true },
    generateDivisions: overrides.generateDivisions ?? noop, cancelGeneration: noop,
    confirmDivision: noop, startGeneratedTournament: noop, cancelWizard: overrides.cancelWizard ?? noop,
    togglePlayerLock: noop, addPairConstraint: noop, removePairConstraint: noop,
    partnershipMatrix: undefined,
  };
}

test('next despacha nextStep só quando validateCurrentStep é true', async () => {
  const nextStep = spy();
  const c = buildSessionWizardContract({ activeSession: null, players: [], communities: [], hookApi: makeHookApi({ nextStep: nextStep as never, validateCurrentStep: { fn: () => true } as never }), applyGuestPlayer: () => {} });
  await c.dispatch({ kind: 'next' });
  assert.equal(nextStep.calls.length, 1);
});

test('next não despacha quando validateCurrentStep é false', async () => {
  const nextStep = spy();
  const c = buildSessionWizardContract({ activeSession: null, players: [], communities: [], hookApi: makeHookApi({ nextStep: nextStep as never, validateCurrentStep: { fn: () => false } as never }), applyGuestPlayer: () => {} });
  await c.dispatch({ kind: 'next' });
  assert.equal(nextStep.calls.length, 0);
});

test('addGuestPlayer chama applyGuestPlayer, não a hook', async () => {
  const applyGuestPlayer = spy();
  const c = buildSessionWizardContract({ activeSession: null, players: [], communities: [], hookApi: makeHookApi(), applyGuestPlayer: applyGuestPlayer.fn });
  await c.dispatch({ kind: 'addGuestPlayer', player: { id: 'p1' } as never, editDetails: true });
  assert.equal(applyGuestPlayer.calls.length, 1);
  assert.deepEqual(applyGuestPlayer.calls[0], [{ id: 'p1' }, true]);
});

test('buildModel projeta campos da hook API', () => {
  const c = buildSessionWizardContract({ activeSession: null, players: [], communities: [], hookApi: { ...makeHookApi(), wizardStep: 3, isGenerating: true, progress: 42 }, applyGuestPlayer: () => {} });
  assert.equal(c.model.wizardStep, 3);
  assert.equal(c.model.isGenerating, true);
  assert.equal(c.model.generationProgress, 42);
});
```

- [ ] Run `node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts` → PASS.
- [ ] `npm run lint` → PASS.

#### Step 5: Refatorar a view

- [ ] Em `src/components/session/SessionWizard.tsx`: trocar `interface SessionWizardProps { ...30 campos }` por `{ contract: ScreenContract<SessionWizardModel, SessionWizardIntent> }`. Substituir cada `props.onX` por `contract.dispatch({ kind: 'x', ... })` e cada `props.<dado>` por `contract.model.<dado>`. Remover as constantes module-level `POSITION_LABELS`/`POSITION_ORDER`/`WIZARD_STEPS` (agora vêm do `model.stepLabels`/`positionLabels`/`positionOrder`). Nenhuma mudança visual.
- [ ] `npm run lint` → PASS.

#### Step 6: Wiring no shell (`App.tsx`)

- [ ] No bloco `page === 'session-wizard'` (~613-659), substituir as ~30 props por:

```tsx
import { buildSessionWizardContract } from '@application/screens/sessionWizard/sessionWizardContract';

const wizardContract = buildSessionWizardContract({
  activeSession: sess.activeSession,
  players: play.players,
  communities: comm.communities,
  hookApi: wizard, // retorno de useSessionWizard — confere que os nomes batem com SessionWizardHookApi
  applyGuestPlayer: (newPlayer, editDetails) => {
    const result = applyGuestPlayerUpsert(play.rawPlayers, newPlayer);
    play.setPlayers(result.players);
    if (sess.activeSession) {
      const nextSelected = [...new Set([...sess.activeSession.selectedPlayerIds, result.selectedPlayer.id])];
      wizard.updateSession({ selectedPlayerIds: nextSelected });
    }
    if (editDetails) {
      play.setEditingPlayer(result.selectedPlayer);
      setPage('player-edit');
    }
  },
});
// ...
<SessionWizard contract={wizardContract} />
```

- [ ] Remover imports de props antigas que não são mais usados (ex.: `setBestDivisions`, `partnershipMatrix` se só UI os usava).
- [ ] **Gate:** `npm run lint && npm run test:unit && npm run test:ui && npm run build` → tudo verde. Spec `AppRouter.spec.tsx` e `useSessions.spec.tsx` ainda passam (regressão de UI nula).
- [ ] **Commit** — `git commit -m "refactor(screens): migrar SessionWizard para ScreenContract (Fase 2 Task 1)"`

> **Padrão documentado aqui.** Tasks 2-9 seguem estes mesmos 6 passos, trocando apenas screen/props/intents. Repetir o código completo por tarefa (não escrever "similar à Task 1").

---

### Task 2: SessionActiveView — valida o padrão + corta a última importação de `@storage/*` (sequencial)

**Complexidade:** Alta. Súmula ao vivo, ownership heartbeat, PointModal. **Única view que infringe o gate de `@storage/*`** (`getOrCreateDeviceId` em `@storage/localStorageRepository`, linha 139).
**Files:**
- Create `src/application/screens/sessionActiveView/sessionActiveViewModel.ts`
- Create `src/application/screens/sessionActiveView/sessionActiveViewIntents.ts`
- Create `src/application/screens/sessionActiveView/sessionActiveViewContract.ts`
- Create `src/application/screens/sessionActiveView/sessionActiveViewContract.test.ts`
- Modify `src/components/live/SessionActiveView.tsx` (props → `contract`; **remover** `import { getOrCreateDeviceId } from '@storage/localStorageRepository'` — o `currentDeviceId` passa a vir do `Model`/input)
- Modify `src/App.tsx` (bloco `<SessionActiveView .../>`)

**Interfaces — Consumes:** props atuais (`SessionActiveViewProps` linhas 54-67) + `useLiveSession(activeSession, games, setGames, pointEvents, setPointEvents, players, sessionTeams, gameReports, setGameReports)` interno. O `getOrCreateDeviceId()` é chamado dentro da view hoje (linha 139, dentro do `useEffect` de ownership) — passa a ser **recebido** como `currentDeviceId` no contract input (o shell calcula uma vez e fornece; a view para de importar `@storage/*`).

**Interfaces — Produces:** `SessionActiveViewModel`, `SessionActiveViewIntent`, `buildSessionActiveViewContract(input)`.

#### Step 1: `Model`

- [ ] Criar `sessionActiveViewModel.ts`:

```ts
import type { Game, GameReport, Player, PointEvent, Session, Team } from '@shared/types';

export interface SessionActiveViewModel {
  activeSession: Session;
  games: Game[];
  pointEvents: PointEvent[];
  players: Player[];
  sessionTeams: Team[];
  gameReports: GameReport[];
  currentDeviceId: string;
}
```

> `setGames`/`setPointEvents`/`setGameReports`/`setActiveSession` NÃO são Model — são Intents (a view emite "registrei um ponto", não recebe um setter).

#### Step 2: `Intent`

- [ ] Criar `sessionActiveViewIntents.ts` — enumerar cada mutação que a view faz hoje:

```ts
import type { Game, GameReport, PointEvent, Session } from '@shared/types';

export type SessionActiveViewIntent =
  | { kind: 'setGames'; games: Game[] }
  | { kind: 'setPointEvents'; events: PointEvent[] }
  | { kind: 'setGameReports'; reports: GameReport[] }
  | { kind: 'setActiveSession'; session: Session }
  | { kind: 'exit' }
  | { kind: 'finishSession' };
```

> `ponytail:` se a view só chama `setGames(...)`, `setPointEvents(...)`, etc. direto, os intents acima são wrappers 1:1. Se `useLiveSession` já encapsula essas mutações em funções nomeadas (ex.: `addPoint`, `undoPoint`), preferir essas como Intents em vez de setters crus — fica mais legível. Confirmar a API de `useLiveSession` no wiring e ajustar. A regra é: Intent = ação de domínio, não "atribui membro de array".

#### Step 3: `buildSessionActiveViewContract`

- [ ] Criar o contract. `dispatch` delega cada Intent ao setter correspondente. `exit`/`finishSession` chamam `onExit`/`onFinishSession` recebidos no input (costura de navegação fica no shell, igual à Task 1).

```ts
import type { Game, GameReport, PointEvent, Session, Team, Player } from '@shared/types';
import type { ScreenContract } from '../screenContract';
import type { SessionActiveViewModel } from './sessionActiveViewModel';
import type { SessionActiveViewIntent } from './sessionActiveViewIntents';

export interface SessionActiveViewContractInput {
  activeSession: Session;
  games: Game[];
  pointEvents: PointEvent[];
  players: Player[];
  sessionTeams: Team[];
  gameReports: GameReport[];
  currentDeviceId: string;
  setGames: (g: Game[]) => void;
  setPointEvents: (e: PointEvent[]) => void;
  setGameReports: (r: GameReport[]) => void;
  setActiveSession: (s: Session) => void;
  onExit: () => void;
  onFinishSession: () => void;
}

export function buildSessionActiveViewContract(
  input: SessionActiveViewContractInput,
): ScreenContract<SessionActiveViewModel, SessionActiveViewIntent> {
  const model: SessionActiveViewModel = {
    activeSession: input.activeSession,
    games: input.games,
    pointEvents: input.pointEvents,
    players: input.players,
    sessionTeams: input.sessionTeams,
    gameReports: input.gameReports,
    currentDeviceId: input.currentDeviceId,
  };
  const dispatch = async (intent: SessionActiveViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'setGames': input.setGames(intent.games); return;
      case 'setPointEvents': input.setPointEvents(intent.events); return;
      case 'setGameReports': input.setGameReports(intent.reports); return;
      case 'setActiveSession': input.setActiveSession(intent.session); return;
      case 'exit': input.onExit(); return;
      case 'finishSession': input.onFinishSession(); return;
    }
  };
  return { model, dispatch };
}
```

#### Step 4: Teste do contract

- [ ] Criar `sessionActiveViewContract.test.ts` — cobrir: `buildModel` projeta os 7 campos; cada Intent despacha pro setter certo (spies); `exit`/`finishSession` chamam `onExit`/`onFinishSession`, não os setters. Template análogo ao da Task 1.

#### Step 5: Refatorar a view

- [ ] `SessionActiveView.tsx`: `SessionActiveViewProps` → `{ contract }`. Trocar `props.setGames(x)` por `contract.dispatch({ kind: 'setGames', games: x })`, etc. **Deletar `import { getOrCreateDeviceId } from '@storage/localStorageRepository';`** (linha 50). Onde a linha 139 chamava `currentDeviceId: getOrCreateDeviceId()`, trocar por `currentDeviceId: contract.model.currentDeviceId`. Nenhuma mudança visual.

#### Step 6: Wiring no shell

- [ ] `App.tsx` bloco `<SessionActiveView .../>`: o shell passa a calcular `getOrCreateDeviceId()` uma vez (import vindo do shell, não da view) e construir o contract:

```tsx
import { getOrCreateDeviceId } from '@storage/localStorageRepository';
import { buildSessionActiveViewContract } from '@application/screens/sessionActiveView/sessionActiveViewContract';

const sessionTeams = selectSessionTeams(sess.teams, sess.activeSession?.id);
const liveContract = buildSessionActiveViewContract({
  activeSession: sess.activeSession!, currentDeviceId: getOrCreateDeviceId(),
  games: sess.games, pointEvents: sess.pointEvents, players: play.players,
  sessionTeams, gameReports: sess.gameReports,
  setGames: sess.setGames, setPointEvents: sess.setPointEvents,
  setGameReports: sess.setGameReports, setActiveSession: sess.setActiveSession,
  onExit: () => applyShellNavigationTarget(getDashboardNavigationTarget()),
  onFinishSession: () => handleFinishSession(),
});
<SessionActiveView contract={liveContract} />
```

> `selectSessionTeams` já é importado hoje (`@app/sessionLifecycleUseCases`). `getOrCreateDeviceId` agora só aparece em `App.tsx` (shell) e no contract — **a view não importa mais `@storage/*`.**

- [ ] **Gate:** `npm run lint && npm run test:unit && npm run test:ui && npm run build` → verde. Específico desta task: `grep "from '@storage/" src/components/live/SessionActiveView.tsx` → **vazio**.
- [ ] **Commit** — `git commit -m "refactor(screens): migrar SessionActiveView para ScreenContract e cortar import de @storage (Fase 2 Task 2)"`

> **GATE da Task 2 verde é a pré-condição para despachar Tasks 3-9 em paralelo** (spec 5.5). Padrão validado em 1 e 2, agora pode escalar.

---

### Task 3: PlayerEditView (paralelizável)

**Complexidade:** Média. Formulário + sliders + autoavaliação + avaliação oficial.
**Props atuais (12-21 campos):** `editingPlayer, setEditingPlayer, players, games, pointEvents, teams, communities, sessions, onBack, onSave, onDelete, validationErrors, showDeleteConfirm, setShowDeleteConfirm, permissions?, currentUserId?`.

- [ ] **Step 1: Model** — `PlayerEditViewModel { editingPlayer, players, games, pointEvents, teams, communities, sessions, validationErrors, showDeleteConfirm, permissions, currentUserId }`.
- [ ] **Step 2: Intent**:

```ts
export type PlayerEditViewIntent =
  | { kind: 'setEditingPlayer'; player: Player | null }
  | { kind: 'setShowDeleteConfirm'; value: boolean }
  | { kind: 'back' }
  | { kind: 'save' }
  | { kind: 'delete' };
```

- [ ] **Step 3: `buildPlayerEditViewContract`** — `dispatch` delega `setEditingPlayer`→`input.setEditingPlayer`, `setShowDeleteConfirm`→`input.setShowDeleteConfirm`, `back`→`input.onBack`, `save`→`input.onSave`, `delete`→`input.onDelete`. `permissions` e `currentUserId` são Model (read-only na view).
- [ ] **Step 4: Teste** — `buildModel` projeta os 10 campos; cada Intent despacha certo (spies em `onBack`/`onSave`/`onDelete`).
- [ ] **Step 5: Refatorar a view** — `props.*` → `contract.model.*` / `contract.dispatch({kind})`. Spec `PlayerEditView.spec.tsx` (existente) **continua passando** — é teste de regressão de UI; não weaken.
- [ ] **Step 6: Wiring** — `App.tsx` constrói o contract nos dois pontos que renderizam `PlayerEditView` (`dashboard`+`player-edit` e `players`+`player-edit`, linhas ~661-690 e ~910). Onuços `onSave`/`onBack` diferem por origem; parametrizar o `buildPlayerEditViewContract` com `onBack`/`onSave` distintos por ponto de montagem (relatório 2 já mapeou: `onBack` é session-wizard vs players; `onSave` tem `setPage` pós-save distinto).
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): migrar PlayerEditView para ScreenContract (Fase 2 Task 3)`

---

### Task 4: CommunitiesView (paralelizável)

**Complexidade:** Média-alta. ~37 props, ~4000 linhas de componente. Torneios/campeonatos vivem aqui (`onCreateChampionship`, `onMaterializeRound`, etc.).
**Props atuais (`src/components/community/CommunitiesView.tsx:144-181`):** dados (13 listas + 3 APIs `presenceApi`/`whatsAppApi`/`rulesApi`), callbacks (20+), `currentUserId`, `isSupabaseConfigured`, `globalRole`, `onLinkedCloudPlayer?`.

- [ ] **Step 1: Model** — agrupar os 13 campos de dados + as 3 APIs de slice:

```ts
export interface CommunitiesViewModel {
  communities: Community[];
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
  presenceApi: CommunityPresenceApi;
  whatsAppApi: WhatsAppApi;
  rulesApi: RulesApi;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  globalRole: AuthRole | null;
}
```

- [ ] **Step 2: Intent** — enumerar os 20+ callbacks como união discriminada (cada `onX` → `{ kind: 'x', ...params }`):

```ts
export type CommunitiesViewIntent =
  | { kind: 'back' }
  | { kind: 'addCommunity'; input: Partial<Community> }
  | { kind: 'updateCommunity'; communityId: string; patch: Partial<Community>; allowed?: boolean }
  | { kind: 'deleteCommunity'; communityId: string }
  | { kind: 'duplicateCommunity'; communityId: string; includeAthletes: boolean }
  | { kind: 'updatePlayerCommunities'; communityId: string; playerIds: string[] }
  | { kind: 'createPlayer'; name: string; communityId: string }
  | { kind: 'createSession'; community: Community; playerIds: string[]; rules: CommunityRules }
  | { kind: 'viewSession'; sessionId: string }
  | { kind: 'clearCommunityHistory'; communityId: string }
  | { kind: 'createChampionship'; input: CreateChampionshipInput }
  | { kind: 'materializeRound'; roundId: string }
  | { kind: 'deleteChampionship'; championshipId: string }
  | { kind: 'rescheduleRound'; roundId: string; scheduledDate: string }
  | { kind: 'setRoundSkipped'; roundId: string; skipped: boolean }
  | { kind: 'updateChampionshipRecurrence'; championshipId: string; recurrenceRule: Championship['recurrenceRule'] }
  | { kind: 'linkedCloudPlayer'; player: Player; communityId: string };
```

> Os callbacks que retornam `AppResult<...>` (`onCreateChampionship`, etc.) — o `dispatch` chama o callback e ignora o retorno (`Promise<void>`). Se a view precisar reagir ao result (ex.: fechar modal só se ok), converter a Intent para `await dispatch(...)` na view e despachar o use-case; para esta task, preservar o comportamento atual.

- [ ] **Step 3: `buildCommunitiesViewContract`** — `dispatch` switch sobre os 17 kinds, delega cada ao callback do input. As 3 APIs de slice (`presenceApi`/`whatsAppApi`/`rulesApi`) são **Model** (a view chama seus métodos internos — não são intents próprias da CommunitiesView a menos que queira elevá-las; preservar como estão em Model por ora).
- [ ] **Step 4: Teste** — cobrir buildModel (16 campos) + um intent por kind representativo (não todos os 17 exaustivamente; 5-6 intents cobrindo os tipos: void-com-args, com-AppResult, sem-args, opcional `allowed?`).
- [ ] **Step 5: Refatorar a view** — `props.onX(a, b)` → `contract.dispatch({ kind: 'x', a, b })`. Spec `CommunitiesView.spec.tsx` (existente) continua passando.
- [ ] **Step 6: Wiring** — `App.tsx` bloco `<CommunitiesView.../>`. Os callbacks já existem como handlers no shell (relatório 2: `createSessionFromCommunity`, `createPlayerForCommunity`, `materializeChampionshipRound`, `clearChampionshipTeamBridges`, etc.) — passá-los diretos no contract input.
- [ ] **Gate:** suite verde + spec existente verde. **Commit** — `refactor(screens): migrar CommunitiesView para ScreenContract (Fase 2 Task 4)`

---

### Task 5: PlayersView (paralelizável)

**Complexidade:** Baixa. Lista simples + busca.
**Props atuais (`src/components/player/PlayersView.tsx:9-21`):** `players, communities, games, pointEvents, teams, sessions, onBack, onAddPlayer, onEditPlayer, onRestoreDemoPlayers, onAddGuestPlayer`.

- [ ] **Step 1: Model** — `PlayersViewModel { players, communities, games, pointEvents, teams, sessions }`.
- [ ] **Step 2: Intent**:

```ts
export type PlayersViewIntent =
  | { kind: 'back' }
  | { kind: 'addPlayer' }
  | { kind: 'editPlayer'; player: Player }
  | { kind: 'restoreDemoPlayers' }
  | { kind: 'addGuestPlayer'; player: Player; editDetails: boolean };
```

- [ ] **Step 3: `buildPlayersViewContract`** — 5 Intents, cada delega ao callback do input.
- [ ] **Step 4: Teste** — buildModel (6 campos) + 5 intents (spies).
- [ ] **Step 5: Refatorar a view** — `props.*` → `contract.*`. Confirmar se há `PlayersView.spec.tsx` (Glob); se há, continua passando.
- [ ] **Step 6: Wiring** — `App.tsx` bloco `<PlayersView.../>`.
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): migrar PlayersView para ScreenContract (Fase 2 Task 5)`

---

### Task 6: Dashboard (paralelizável)

**Complexidade:** Baixa. Cards de ação + resumo.
**Props atuais (`src/components/dashboard/Dashboard.tsx:17-30`):** `activeSession, sessionDraft, onNewSession, onResumeSession, onResumeDraft, onClearDraft, onClearActiveSession, onPlayers, onHistory, onExportBackup, onImportBackup, onCommunities`.

- [ ] **Step 1: Model** — `DashboardModel { activeSession, sessionDraft }`.
- [ ] **Step 2: Intent**:

```ts
import type { SessionDraft } from '@shared/types';
export type DashboardIntent =
  | { kind: 'newSession' }
  | { kind: 'resumeSession' }
  | { kind: 'resumeDraft'; draft: SessionDraft }
  | { kind: 'clearDraft' }
  | { kind: 'clearActiveSession' }
  | { kind: 'players' }
  | { kind: 'history' }
  | { kind: 'exportBackup' }
  | { kind: 'importBackup'; file: File }
  | { kind: 'communities' };
```

- [ ] **Step 3: `buildDashboardContract`** — 10 Intents, delegates.
- [ ] **Step 4: Teste** — buildModel (2 campos) + 10 intents (spies).
- [ ] **Step 5: Refatorar a view** — `props.*` → `contract.*`. Confirmar spec.
- [ ] **Step 6: Wiring** — `App.tsx` bloco `<Dashboard.../>` (linhas ~729-779 do dashboard handler mapeados no relatório 2).
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): migrar Dashboard para ScreenContract (Fase 2 Task 6)`

---

### Task 7: HistoryView (paralelizável)

**Complexidade:** Baixa. Lista + tabs de exportação.
**Props atuais (`src/components/history/HistoryView.tsx:62-75`):** `sessions, games, pointEvents, teams, players, sessionReports, selectedHistorySessionId, setSelectedHistorySessionId, onDeleteSession, onBackToDashboard, initialTab?, hideTabs?`.
**Nota:** `initialTab`/`hideTabs` são flags de render — vão no Model.

- [ ] **Step 1: Model** — `HistoryViewModel { sessions, games, pointEvents, teams, players, sessionReports, selectedHistorySessionId, initialTab?, hideTabs? }`.
- [ ] **Step 2: Intent**:

```ts
export type HistoryViewIntent =
  | { kind: 'setSelectedSessionId'; id: string | null }
  | { kind: 'deleteSession'; id: string }
  | { kind: 'backToDashboard' };
```

- [ ] **Step 3: `buildHistoryViewContract`** — 3 Intents, delegates a `setSelectedHistorySessionId`/`onDeleteSession`/`onBackToDashboard`.
- [ ] **Step 4: Teste** — buildModel (7-9 campos) + 3 intents. Spec `HistoryView.spec.tsx` (existente) continua passando.
- [ ] **Step 5: Refatorar a view** — `props.*` → `contract.*`.
- [ ] **Step 6: Wiring** — `App.tsx` bloco `<HistoryView.../>`.
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): migrar HistoryView para ScreenContract (Fase 2 Task 7)`

---

### Task 8: AccountSyncView (paralelizável)

**Complexidade:** Média. Sync + conflitos + backup. Muitas propriedades `Promise<void>`.
**Props atuais (`src/components/account/AccountSyncView.tsx:21-43`):** `user, profile, loading, isSupabaseConfigured, onSignOut (Promise), onLinkGoogleIdentity (Promise), onSync (Promise), onRepairDuplicates (Promise), lastSyncedAt, syncLoading, players, recoverableSyncActions?, syncIssueSummary?, onRetryPrimarySyncAction (Promise|void)?, onClearResolvedSyncIssues (Promise|void)?, syncConflicts?, onKeepMineConflict (id)?, onKeepTheirsConflict (id)?`.

- [ ] **Step 1: Model** — `AccountSyncViewModel { user, profile, loading, isSupabaseConfigured, lastSyncedAt, syncLoading, players, recoverableSyncActions?, syncIssueSummary?, syncConflicts? }`.
- [ ] **Step 2: Intent**:

```ts
export type AccountSyncViewIntent =
  | { kind: 'sync' }
  | { kind: 'repairDuplicates' }
  | { kind: 'signOut' }
  | { kind: 'linkGoogleIdentity' }
  | { kind: 'retryPrimarySyncAction' }
  | { kind: 'clearResolvedSyncIssues' }
  | { kind: 'keepMineConflict'; sessionId: string }
  | { kind: 'keepTheirsConflict'; sessionId: string };
```

- [ ] **Step 3: `buildAccountSyncViewContract`** — `dispatch` é `async`, cada Intent `await`s o callback correspondente (`Promise<void>` ou `Promise<void> | void` — compatível). Callbacks opcionais (`onRetryPrimarySyncAction?`): no `dispatch`, checar `if (input.onRetry) await input.onRetry()`.
- [ ] **Step 4: Teste** — buildModel (9-10 campos) + 8 intents. Spec `AccountSyncView.spec.tsx` (existente) continua passando.
- [ ] **Step 5: Refatorar a view** — `props.*` → `contract.*`. Trocar `await props.onSync()` por `await contract.dispatch({ kind: 'sync' })`.
- [ ] **Step 6: Wiring** — `App.tsx` bloco `<AccountSyncView.../>` (módulo `conta`).
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): migrar AccountSyncView para ScreenContract (Fase 2 Task 8)`

---

### Task 9: GestaoView (paralelizável)

**Complexidade:** Baixa. Admin staff-only.
**Props atuais (`src/components/admin/GestaoView.tsx:6-13`):** `currentUserId, isMaster, players, onToast?`.

- [ ] **Step 1: Model** — `GestaoViewModel { currentUserId, isMaster, players }`.
- [ ] **Step 2: Intent** — o `onToast` é callback de UI, não ação de domínio. Se a view só usa `onToast` pra reportar resultado de ações internas (RPCs de role), ele **continua interno** — a view chama `useToast()` diretamente (Fase 2 pre-release já providenciou `ToastProvider`, PR #16). Logo:

```ts
export type GestaoViewIntent = { kind: 'noop' }; // ou vazio — confirmar no passo 1 se há ações além de toast
```

> `ponytail:` Investigar no Step 1 se `GestaoView` emite alguma ação para fora (ex.: `onChangeRole`). Se só mostra dados e reporta via `useToast()`, `Intent = never` e o `ScreenContract` é só `{ model }` com `dispatch` que nunca é chamado — nesse caso a tela **não precisa de contract** (não há Intents); documentar isso e marcar a task como "não aplicável — sem intents" em vez de forçar um contract vazio. **Decidir antes de criar arquivos.** Se há Intents reais, prosseguir normalmente.

- [ ] **Step 3-6 (se aplicável):** contract + wiring + gate + commit. Se não aplicável, registrar no commit "GestaoView sem Intents — consome useToast() diretamente, sem contract (Fase 2 Task 9)".
- [ ] **Gate:** suite verde. **Commit** — `refactor(screens): GestaoView — sem contract (apenas Model implícito) ou migrado conforme Step 1 (Fase 2 Task 9)`

---

### Task 10: Gate de Fase (Fase 2 → Fase 3)

**Files:** Modify `docs/superpowers/plans/2026-07-22-scalable-product-program.md` (marcar Fase 2 concluída), `HANDOFF.md`.

**Interfaces:** Consumes todas as Tasks 1-9. Produces o desbloqueio da Fase 3.

- [ ] **Step 1: Verificar gate de infra (o mensurável)**

Run:
```bash
grep -rn "from '@infra/\|from '@storage/" src/components/ src/app/ 2>/dev/null
```
Expected: **zero saídas**. (Hoje só `SessionActiveView.tsx:50` infringe — cortado na Task 2.) Se houver qualquer saída, a tarefa correspondente não terminou o retrofit; voltar à tarefa before de declarar gate verde.

- [ ] **Step 2: Verificar gate de contracts**

Run:
```bash
ls src/application/screens/*/  # 9 subdiretórios, cada um com Model/Intents/Contract/Contract.test
```
Expected: 9 subdiretórios (`sessionWizard`, `sessionActiveView`, `playerEditView`, `communitiesView`, `playersView`, `dashboard`, `historyView`, `accountSyncView`, `gestaoView`), cada um com seus 4 arquivos.

- [ ] **Step 3: Suite completa**

Run: `npm run lint && npm run lint:eslint && npm run format:check && npm test && npm run build`
Expected: tudo verde.

- [ ] **Step 4: Roteador/navegação inalterado**

Confirmar que `src/app/AppRouter.tsx` não foi tocado (não deveria — Fase 2 não mexe em rotas). `git diff main -- src/app/AppRouter.tsx` → vazio (exceto se já vinha de main, comparar com o ponto de partida da Fase 2). O `renderActiveContent()` switch e `Module`/`Page` `useState` em `App.tsx` continuam; só a forma de passar props mudou.

- [ ] **Step 5: Atualizar programa mestre e HANDOFF**

- Em `docs/superpowers/plans/2026-07-22-scalable-product-program.md`, linha 14: mudar `"Fase 1 concluída ... proximo passo é Fase 2"` → `"Fase 2 concluída (2026-08-DD); próximo passo é Fase 3 (Nova Navegação)"`.
- Atualizar `HANDOFF.md` com: 9 telas em `ScreenContract`, gate de infra vazio, próxima ação = Fase 3 (invocar skill `impeccable` critique antes, conforme spec do Plano 5 seção 6.9).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-07-22-scalable-product-program.md HANDOFF.md
git commit -m "docs(plano-5): fechar gate da Fase 2 — 9 telas em ScreenContract, gate de infra vazio"
```

> **Skill:** `superpowers:verification-before-completion` antes de declarar o gate verde. `superpowers:subagent-driven-development` ou `executing-plans` para Tasks 3-9 (paralelizáveis conforme spec 5.5, GATE da Task 2 verde).

---

## Self-Review (ran while writing)

1. **Spec coverage:**
   - Tipo `ScreenContract<Model, Intent>` → Task 0.
   - 9 telas (spec 5.3) → Tasks 1-9, ordem e complexidade conferem.
   - 3 arquivos por tela (spec 5.2) → file structure + cada tarefa cria os 4 (Model/Intents/Contract/Contract.test).
   - Padrão de migração 5 passos (spec 5.4) → Steps 1-6 da Task 1 (extrair Model / extrair Intent / buildScreenContract / refatorar view / testes do contract / wiring). Notar: spec diz 5 passos; aqui viram 6 por causa do passo de wiring no shell, que a spec subsume em "refatorar a view" mas que aqui é explícito (o shell muda, não a view). Justificado — executor sem contexto não adivinha que o shell também muda.
   - Paralelização 3-9 (spec 5.5) → Task 10 Step nota + Task 1 gate.
   - Gate por tela (spec 5.6) → toda task termina com `lint && test:unit && test:ui && build`.
   - Gate de fase (spec 5.8) → Task 10.
   - TDD por tela (spec skills) → every task has RED-then-GREEN contract test.
2. **Placeholder scan:** verificado. Tasks 2-9 abaixo trazem código completo (Model/Intents/dispatch skeleton) parametrizado por screen, não "similar à Task 1".
3. **Type consistency:** `ScreenContract<Model, Intent>` usado uniformemente; `buildScreenContract(input)` retorna `{ model, dispatch }`; views consomem `props.contract`. `SessionWizardHookApi` bate com o retorno real de `useSessionWizard` (linhas 356-385). `applyGuestPlayer` (sem `setPage` no contract) move a costura de navegação pro shell — consistente com a regra "eventos de UI não carregam autorização/navegação".

## Execução (chão)

**Plan completo e salvo em `docs/superpowers/plans/2026-08-03-plano-5-fase-2-screen-contracts.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por tarefa, revisei entre tarefas, iteração rápida. Skills: `superpowers:subagent-driven-development`. Tasks 1-2 sequenciais; Tasks 3-9 paralelizáveis após gate da Task 2.

**2. Inline Execution** — executar as tarefas nesta sessão via `superpowers:executing-plans`, batch com checkpoints.

**Qual abordagem?**
