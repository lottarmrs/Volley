# Gate 0 — Integridade de elenco e estado canônico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os dois P0 de integridade — atletas descartados pelo balanceador e estado operacional contraditório entre telas — mais o P1 de relatórios que perdem jogos por W.O.

**Architecture:** Três módulos puros passam a ser a fonte única de verdade: `sessionPhase.ts` deriva a fase operacional de `status` + jogos reais; `balancing.ts` sanitiza atributos ausentes na fronteira e valida a invariante união-dos-times = seleção; `reports.ts` conta jogos e pontos a partir dos jogos, não dos subprodutos. As telas passam a consumir essas funções em vez de decidir sozinhas.

**Tech Stack:** TypeScript (strictNullChecks, não strict), React 19, Vite 6. Testes unitários no runner do Node com tsx (`.test.ts`); testes de UI em Vitest + jsdom (`.spec.tsx`).

## Global Constraints

- Idioma de UI, domínio e mensagens: **pt-BR**. Campos do modelo em português (`nome`, `atributos`, `status`).
- **Sem comentários no código-fonte**, exceto quando explicam uma decisão não óbvia — o projeto usa comentário para justificar, não para narrar.
- Prettier: aspas simples, largura 100 (`.prettierrc`).
- Imports por alias (`@domain`, `@logic`, `@shared/types`), não caminhos relativos profundos.
- Tipos fluem por `src/types.ts`; importar de `@shared/types`.
- `.test.ts` = runner do Node, **zero DOM**. `.spec.tsx` = Vitest + jsdom.
- Ordem de verificação do CI: `npm run typecheck` → `npm run lint:eslint` → `npm run format:check` → `npm test` → `npm run build`.
- `lint:eslint` tem erros pré-existentes no repositório. O critério é **não aumentar** o número nos arquivos tocados: rodar `npx eslint <arquivos-tocados>` e exigir saída limpa.
- `format:check` também falha em ~170 arquivos pré-existentes por divergência de versão do Prettier. O critério é rodar `node node_modules/prettier/bin/prettier.cjs --check <arquivos-tocados>` e exigir "All matched files use Prettier code style!".
- Rodar um teste único: `node --import tsx --test <caminho>` (unit) ou `npx vitest run <caminho>` (UI).

---

### Task 1: Módulo de fase operacional

Cria a função pura que unifica o estado. Nenhuma tela muda nesta tarefa — ela só produz a fonte de verdade que a Task 2 consome.

**Files:**
- Create: `src/domain/sessionPhase.ts`
- Test: `src/domain/sessionPhase.test.ts`

**Interfaces:**
- Consumes: `Session`, `Game`, `SessionStatus`, `GameStatus` de `@shared/types`.
- Produces:
  - `type OperationalPhase = 'rascunho' | 'times_gerados' | 'pronta' | 'entre_partidas' | 'em_andamento' | 'pausada' | 'encerrada'`
  - `interface PhasePermissions { podeIniciar: boolean; podePausar: boolean; podeRetomar: boolean; podeEncerrar: boolean; podePontuar: boolean }`
  - `derivePhase(session: Session | null, games: Game[]): OperationalPhase`
  - `phasePermissions(phase: OperationalPhase): PhasePermissions`
  - `isTerminalGame(game: Game): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/domain/sessionPhase.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePhase, phasePermissions, isTerminalGame } from './sessionPhase';
import type { Game, Session, SessionStatus, GameStatus } from '@shared/types';

const session = (status: SessionStatus): Session =>
  ({ id: 's1', name: 'Sessao', date: '2026-08-10', status, selectedPlayerIds: [], teamIds: [] }) as Session;

const game = (status: GameStatus): Game => ({ id: 'g' + status, sessionId: 's1', status }) as Game;

test('sessao sem objeto e rascunho', () => {
  assert.equal(derivePhase(null, []), 'rascunho');
});

test('status de configuracao viram rascunho', () => {
  for (const s of ['draft', 'players_selected', 'configured'] as SessionStatus[]) {
    assert.equal(derivePhase(session(s), []), 'rascunho');
  }
});

test('teams_generated vira times_gerados', () => {
  assert.equal(derivePhase(session('teams_generated'), []), 'times_gerados');
});

test('ativa sem nenhum jogo e pronta, nao em andamento', () => {
  assert.equal(derivePhase(session('active'), []), 'pronta');
});

test('ativa com jogo apenas agendado continua pronta', () => {
  assert.equal(derivePhase(session('active'), [game('scheduled')]), 'pronta');
});

test('ativa com jogo ativo e em_andamento', () => {
  assert.equal(derivePhase(session('active'), [game('scheduled'), game('active')]), 'em_andamento');
});

test('ativa com jogo terminal e nenhum ativo e entre_partidas', () => {
  assert.equal(derivePhase(session('active'), [game('finished'), game('scheduled')]), 'entre_partidas');
});

test('walkover conta como jogo terminal', () => {
  assert.equal(derivePhase(session('active'), [game('walkover')]), 'entre_partidas');
  assert.equal(isTerminalGame(game('walkover')), true);
  assert.equal(isTerminalGame(game('cancelled')), true);
  assert.equal(isTerminalGame(game('scheduled')), false);
});

test('pausada vence a existencia de jogo ativo', () => {
  assert.equal(derivePhase(session('paused'), [game('active')]), 'pausada');
});

test('encerrada vence tudo, inclusive jogo ativo orfao', () => {
  assert.equal(derivePhase(session('finished'), [game('active')]), 'encerrada');
  assert.equal(derivePhase(session('cancelled'), [game('active')]), 'encerrada');
});

test('jogos de outra sessao sao ignorados', () => {
  const alheio = { id: 'gx', sessionId: 'outra', status: 'active' } as Game;
  assert.equal(derivePhase(session('active'), [alheio]), 'pronta');
});

test('pausada nao permite iniciar', () => {
  const p = phasePermissions('pausada');
  assert.equal(p.podeIniciar, false);
  assert.equal(p.podeRetomar, true);
  assert.equal(p.podePontuar, false);
});

test('pronta permite iniciar mas nao pontuar', () => {
  const p = phasePermissions('pronta');
  assert.equal(p.podeIniciar, true);
  assert.equal(p.podePontuar, false);
});

test('em_andamento permite pontuar e pausar, nao iniciar', () => {
  const p = phasePermissions('em_andamento');
  assert.equal(p.podePontuar, true);
  assert.equal(p.podePausar, true);
  assert.equal(p.podeIniciar, false);
});

test('encerrada nao permite nada alem de consultar', () => {
  const p = phasePermissions('encerrada');
  assert.deepEqual(p, {
    podeIniciar: false,
    podePausar: false,
    podeRetomar: false,
    podeEncerrar: false,
    podePontuar: false,
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
node --import tsx --test src/domain/sessionPhase.test.ts
```

Esperado: falha de resolução de módulo — `Cannot find module './sessionPhase'`.

- [ ] **Step 3: Implementar o módulo**

Criar `src/domain/sessionPhase.ts`:

```ts
import type { Game, Session } from '@shared/types';

export type OperationalPhase =
  | 'rascunho'
  | 'times_gerados'
  | 'pronta'
  | 'entre_partidas'
  | 'em_andamento'
  | 'pausada'
  | 'encerrada';

export interface PhasePermissions {
  podeIniciar: boolean;
  podePausar: boolean;
  podeRetomar: boolean;
  podeEncerrar: boolean;
  podePontuar: boolean;
}

export function isTerminalGame(game: Game): boolean {
  return game.status === 'finished' || game.status === 'walkover' || game.status === 'cancelled';
}

export function derivePhase(session: Session | null, games: Game[]): OperationalPhase {
  if (!session) return 'rascunho';

  if (session.status === 'finished' || session.status === 'cancelled') return 'encerrada';
  if (session.status === 'paused') return 'pausada';
  if (session.status === 'teams_generated') return 'times_gerados';
  if (session.status !== 'active') return 'rascunho';

  const own = games.filter((g) => g.sessionId === session.id);
  if (own.some((g) => g.status === 'active')) return 'em_andamento';
  if (own.some(isTerminalGame)) return 'entre_partidas';
  return 'pronta';
}

const NENHUMA: PhasePermissions = {
  podeIniciar: false,
  podePausar: false,
  podeRetomar: false,
  podeEncerrar: false,
  podePontuar: false,
};

export function phasePermissions(phase: OperationalPhase): PhasePermissions {
  switch (phase) {
    case 'pronta':
    case 'entre_partidas':
      return { ...NENHUMA, podeIniciar: true, podeEncerrar: true };
    case 'em_andamento':
      return { ...NENHUMA, podePausar: true, podeEncerrar: true, podePontuar: true };
    case 'pausada':
      return { ...NENHUMA, podeRetomar: true, podeEncerrar: true };
    case 'times_gerados':
      return { ...NENHUMA, podeEncerrar: true };
    default:
      return NENHUMA;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
node --import tsx --test src/domain/sessionPhase.test.ts
```

Esperado: `pass 15`, `fail 0`.

- [ ] **Step 5: Verificar tipos e formato**

```bash
npm run typecheck
```

Esperado: sem nenhuma linha `error TS`.

```bash
node node_modules/prettier/bin/prettier.cjs --check src/domain/sessionPhase.ts src/domain/sessionPhase.test.ts
```

Esperado: `All matched files use Prettier code style!`. Se falhar, rodar o mesmo comando com `--write` e repetir.

```bash
npx eslint src/domain/sessionPhase.ts src/domain/sessionPhase.test.ts
```

Esperado: nenhuma saída.

- [ ] **Step 6: Commit**

```bash
git add src/domain/sessionPhase.ts src/domain/sessionPhase.test.ts
git commit -m "feat(domain): derivar fase operacional de sessao a partir do status e dos jogos"
```

---

### Task 2: Telas consomem a fase em vez do status cru

Substitui a decisão local de cada tela pela função da Task 1. É onde os defeitos observados desaparecem.

**Files:**
- Modify: `src/App.tsx` (badge do header)
- Modify: `src/components/live/TournamentActiveView.tsx` (status, CTA e ações do header)
- Modify: `src/components/dashboard/Dashboard.tsx` (card de sessão ativa)
- Test: `src/domain/sessionPhase.test.ts` (já criado; sem casos novos aqui)

**Interfaces:**
- Consumes: `derivePhase`, `phasePermissions`, `OperationalPhase` de `@domain/sessionPhase`.
- Produces: `PHASE_LABEL: Record<OperationalPhase, string>`, **acrescentado a
  `src/domain/sessionPhase.ts`** nesta tarefa (não existia na Task 1) e importado pelos três
  componentes. Fica no módulo de domínio para que os três leiam o mesmo rótulo; é a razão de o
  arquivo da Task 1 aparecer também no commit desta.

- [ ] **Step 1: Localizar os pontos que leem status cru**

```bash
git grep -n "Partida em Andamento" -- src/
git grep -n "status === 'active'" -- src/App.tsx src/components/live src/components/dashboard
```

Anotar cada ocorrência. São esses os pontos que a etapa seguinte troca.

- [ ] **Step 2: Trocar o badge do header em `src/App.tsx`**

Importar no topo, junto dos demais imports de domínio:

```ts
import { derivePhase, phasePermissions } from '@domain/sessionPhase';
```

Derivar uma vez, perto de onde `activeSession` já está disponível:

```ts
const operationalPhase = derivePhase(sess.activeSession, sess.games);
```

O rótulo do badge passa a sair de um mapa explícito, não de `status`:

```ts
const PHASE_LABEL: Record<OperationalPhase, string> = {
  rascunho: 'Rascunho',
  times_gerados: 'Times Prontos',
  pronta: 'Pronta para Começar',
  entre_partidas: 'Entre Partidas',
  em_andamento: 'Partida em Andamento',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};
```

O badge só aparece quando a fase não é `rascunho` nem `encerrada`, e exibe `PHASE_LABEL[operationalPhase]`.

- [ ] **Step 3: Trocar status e CTAs em `TournamentActiveView.tsx`**

O bloco `STATUS` deixa de exibir o `status` traduzido e passa a exibir `PHASE_LABEL[phase]`. Exportar o mapa da Task 2 Step 2 de um lugar comum — colocá-lo em `src/domain/sessionPhase.ts` como `PHASE_LABEL` e importar nos dois arquivos, para não duplicar.

Os botões do header passam a respeitar as permissões:

```ts
const perms = phasePermissions(phase);
```

- `Pausar` renderiza somente se `perms.podePausar`
- `Retomar` renderiza somente se `perms.podeRetomar`
- `Encerrar` renderiza somente se `perms.podeEncerrar`
- o CTA `Iniciar torneio` recebe `disabled={!perms.podeIniciar}`

Isso é o que impede o `INICIAR TORNEIO` clicável com o torneio pausado.

- [ ] **Step 4: Trocar o card de sessão ativa no `Dashboard.tsx`**

A condição atual `activeSession?.status === 'active' || activeSession?.status === 'teams_generated'` passa a ser derivada:

```ts
const phase = derivePhase(activeSession, games);
const mostrarCardAtivo = phase !== 'rascunho' && phase !== 'encerrada';
```

E o texto do badge do card usa `PHASE_LABEL[phase]` em vez do ternário
`activeSession.status === 'active' ? 'Partida Ativa' : 'Pronta para Iniciar'`.

`Dashboard` passa a receber `games` por prop se ainda não recebe; o componente pai (`App.tsx`) já tem `sess.games`.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
npm test
```

Esperado: `pass 701+`/`fail 0` no runner do Node e `Tests 136 passed` no Vitest. Qualquer teste de UI que afirme os textos antigos precisa ser atualizado para o novo rótulo — atualizar a expectativa, não reverter o comportamento.

- [ ] **Step 6: Verificar tipos, formato e lint dos arquivos tocados**

```bash
npm run typecheck
node node_modules/prettier/bin/prettier.cjs --check src/App.tsx src/components/live/TournamentActiveView.tsx src/components/dashboard/Dashboard.tsx src/domain/sessionPhase.ts
npx eslint src/App.tsx src/components/live/TournamentActiveView.tsx src/components/dashboard/Dashboard.tsx src/domain/sessionPhase.ts
```

Esperado: sem `error TS`, formato limpo, eslint sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/live/TournamentActiveView.tsx src/components/dashboard/Dashboard.tsx src/domain/sessionPhase.ts
git commit -m "fix(estado): telas derivam a fase operacional em vez de ler status cru"
```

---

### Task 3: Integridade do elenco no balanceador

**Files:**
- Modify: `src/logic/balancing.ts:115-146` (`mapPlayerToAthleteVector`), `:1348-1460` (`balanceTeams`)
- Modify: `src/shared/types/session.ts:517` (`AthleteVector`)
- Test: `src/logic/balancing.test.ts`

**Interfaces:**
- Consumes: `Player`, `AthleteVector`, `Division` de `@shared/types`.
- Produces:
  - `AthleteVector` ganha `isEstimated: boolean`
  - `mapPlayerToAthleteVector(p: Player, sessionPosition?: Position, fallback?: Attributes): AthleteVector`
  - `computeAttributeFallback(players: Player[]): Attributes`
  - `findRosterDivergence(division: Division, selectedPlayerIds: string[]): { missing: string[]; duplicated: string[] } | null`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `src/logic/balancing.test.ts`:

```ts
test('computeAttributeFallback usa media por atributo apenas dos avaliados', () => {
  const avaliados = [
    { atributos: { ataque: 4, defesa: 6 } },
    { atributos: { ataque: 8, defesa: 2 } },
    { atributos: {} },
  ] as unknown as Player[];
  const fb = computeAttributeFallback(avaliados);
  assert.equal(fb.ataque, 6);
  assert.equal(fb.defesa, 4);
});

test('computeAttributeFallback cai no meio da escala quando ninguem foi avaliado', () => {
  const fb = computeAttributeFallback([{ atributos: {} }] as unknown as Player[]);
  assert.equal(fb.ataque, 5);
});

test('atleta sem atributos nao produz NaN no vetor e e marcado como estimado', () => {
  const fallback = computeAttributeFallback([
    { atributos: { ataque: 6, defesa: 6, saque: 6, recepcao: 6, levantamento: 6, bloqueio: 6, velocidade: 6, resistencia: 6, leituraDeJogo: 6, regularidade: 6, controleEmocional: 6 } },
  ] as unknown as Player[]);
  const semAvaliacao = { id: 'p1', nome: 'Sem dados', atributos: {}, formaAtual: {}, status: {}, perfil: {} } as unknown as Player;
  const v = mapPlayerToAthleteVector(semAvaliacao, undefined, fallback);
  assert.equal(v.isEstimated, true);
  for (const k of ['overall', 'attack', 'defense', 'serve', 'reception', 'setting', 'block', 'speed', 'stamina', 'gameVision', 'consistency', 'emotionalControl'] as const) {
    assert.ok(Number.isFinite(v[k]), `${k} deveria ser finito, veio ${v[k]}`);
  }
});

test('findRosterDivergence devolve null quando a uniao dos times cobre a selecao', () => {
  const division = { teams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c'] }] } as unknown as Division;
  assert.equal(findRosterDivergence(division, ['a', 'b', 'c']), null);
});

test('findRosterDivergence nomeia quem ficou de fora', () => {
  const division = { teams: [{ playerIds: ['a'] }, { playerIds: ['b'] }] } as unknown as Division;
  assert.deepEqual(findRosterDivergence(division, ['a', 'b', 'c']), { missing: ['c'], duplicated: [] });
});

test('findRosterDivergence acusa atleta em dois times', () => {
  const division = { teams: [{ playerIds: ['a', 'b'] }, { playerIds: ['b'] }] } as unknown as Division;
  assert.deepEqual(findRosterDivergence(division, ['a', 'b']), { missing: [], duplicated: ['b'] });
});

test('balanceTeams distribui todos os selecionados mesmo sem avaliacao', () => {
  const players = Array.from({ length: 9 }, (_, i) => ({
    id: 'p' + i,
    nome: 'P' + i,
    atributos: i < 2 ? {} : { ataque: 5, defesa: 5, saque: 5, recepcao: 5, levantamento: 5, bloqueio: 5, velocidade: 5, resistencia: 5, leituraDeJogo: 5, regularidade: 5, controleEmocional: 5 },
    formaAtual: { valor: 0 },
    status: { lesionado: false },
    perfil: {},
    posicaoPrincipal: 'ponteiro',
    genero: 'M',
  })) as unknown as Player[];

  const divisions = balanceTeams(players, 3, 's1');
  const ids = players.map((p) => p.id);
  for (const d of divisions) {
    assert.equal(findRosterDivergence(d, ids), null);
  }
});
```

Acrescentar `computeAttributeFallback`, `findRosterDivergence` e `balanceTeams` ao import existente no topo do arquivo de teste, e `Division` ao import de tipos.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/logic/balancing.test.ts
```

Esperado: falhas de import (`computeAttributeFallback is not exported`) e, uma vez exportadas as funções, falha em `balanceTeams distribui todos os selecionados` — é a reprodução do P0.

- [ ] **Step 3: Adicionar `isEstimated` ao tipo**

Em `src/shared/types/session.ts`, dentro de `AthleteVector`:

```ts
  isEstimated: boolean;
```

- [ ] **Step 4: Implementar fallback e sanitização em `balancing.ts`**

```ts
const ATTRIBUTE_KEYS = [
  'ataque', 'defesa', 'saque', 'recepcao', 'levantamento', 'bloqueio',
  'velocidade', 'resistencia', 'leituraDeJogo', 'regularidade', 'controleEmocional',
] as const;

const MID_SCALE = 5;

export function computeAttributeFallback(players: Player[]): Attributes {
  const fallback = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const valores = players
      .map((p) => p.atributos?.[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    fallback[key] = valores.length
      ? valores.reduce((a, b) => a + b, 0) / valores.length
      : MID_SCALE;
  }
  return fallback;
}

function hasAnyAttribute(p: Player): boolean {
  return ATTRIBUTE_KEYS.some((k) => typeof p.atributos?.[k] === 'number');
}
```

`mapPlayerToAthleteVector` ganha um terceiro parâmetro opcional `fallback?: Attributes` e passa a resolver cada atributo por `p.atributos?.[k] ?? fallback?.[k] ?? MID_SCALE`. O campo `overall` também é protegido: se o cálculo devolver algo não finito, usa a média dos atributos resolvidos. E `isEstimated: !hasAnyAttribute(p)`.

- [ ] **Step 5: Implementar a invariante**

```ts
export function findRosterDivergence(
  division: Division,
  selectedPlayerIds: string[],
): { missing: string[]; duplicated: string[] } | null {
  const vistos = new Map<string, number>();
  for (const team of division.teams) {
    for (const id of team.playerIds) vistos.set(id, (vistos.get(id) ?? 0) + 1);
  }
  const missing = selectedPlayerIds.filter((id) => !vistos.has(id));
  const duplicated = [...vistos.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return missing.length || duplicated.length ? { missing, duplicated } : null;
}
```

Em `balanceTeams`, calcular o fallback uma vez a partir de `players` antes do `map`, e passar para `mapPlayerToAthleteVector`.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
node --import tsx --test src/logic/balancing.test.ts
```

Esperado: todos passando, incluindo `balanceTeams distribui todos os selecionados mesmo sem avaliacao`.

- [ ] **Step 7: Rodar a suíte inteira**

```bash
npm test
```

Esperado: `fail 0` nos dois runners. Testes de balanceamento existentes que afirmem composições específicas podem quebrar — se quebrarem, verificar se a invariante (diferença de tamanho ≤ 1, distribuição de levantadores) continua válida e atualizar a expectativa; não relaxar a invariante.

- [ ] **Step 8: Commit**

```bash
git add src/logic/balancing.ts src/logic/balancing.test.ts src/shared/types/session.ts
git commit -m "fix(balanceamento): atleta sem avaliacao entra com media da turma e nao e mais descartado"
```

---

### Task 4: Wizard bloqueia divergência e avisa estimativa

**Files:**
- Modify: `src/application/sessionLifecycleUseCases.ts` (retorno de `buildDivisionGenerationPlan` e do resultado de geração)
- Modify: `src/components/session/SessionWizard.tsx` (painel de diagnóstico e botão `Gerar tabela`)
- Test: `src/application/sessionLifecycleUseCases.test.ts`

**Interfaces:**
- Consumes: `findRosterDivergence` de `@logic/balancing`.
- Produces: `buildRosterIntegrityIssues(division: Division, selectedPlayerIds: string[], players: Player[]): string[]` — mensagens prontas em pt-BR, vazio quando não há problema.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/application/sessionLifecycleUseCases.test.ts`:

```ts
test('buildRosterIntegrityIssues nomeia o atleta que ficou fora dos times', () => {
  const division = { teams: [{ playerIds: ['a'] }, { playerIds: ['b'] }] } as unknown as Division;
  const players = [
    { id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }, { id: 'c', nome: 'Caio' },
  ] as unknown as Player[];
  const issues = buildRosterIntegrityIssues(division, ['a', 'b', 'c'], players);
  assert.equal(issues.length, 1);
  assert.ok(issues[0].includes('Caio'));
});

test('buildRosterIntegrityIssues devolve vazio quando a divisao cobre a selecao', () => {
  const division = { teams: [{ playerIds: ['a', 'b'] }] } as unknown as Division;
  const players = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }] as unknown as Player[];
  assert.deepEqual(buildRosterIntegrityIssues(division, ['a', 'b'], players), []);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: `buildRosterIntegrityIssues is not exported`.

- [ ] **Step 3: Implementar**

Em `src/application/sessionLifecycleUseCases.ts`:

```ts
export function buildRosterIntegrityIssues(
  division: Division,
  selectedPlayerIds: string[],
  players: Player[],
): string[] {
  const divergence = findRosterDivergence(division, selectedPlayerIds);
  if (!divergence) return [];
  const nome = (id: string) => players.find((p) => p.id === id)?.nome ?? id;
  const issues: string[] = [];
  if (divergence.missing.length) {
    issues.push(
      `${divergence.missing.length} atleta(s) selecionado(s) ficaram fora dos times: ${divergence.missing.map(nome).join(', ')}.`,
    );
  }
  if (divergence.duplicated.length) {
    issues.push(`Atleta(s) em mais de um time: ${divergence.duplicated.map(nome).join(', ')}.`);
  }
  return issues;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: todos passando.

- [ ] **Step 5: Ligar no wizard**

Em `SessionWizard.tsx`, na etapa Times, calcular a partir da divisão selecionada:

```ts
const rosterIssues = buildRosterIntegrityIssues(
  selectedDivision,
  activeSession?.selectedPlayerIds ?? [],
  players,
);
const estimatedCount = selectedDivision.teams
  .flatMap((t) => t.playerIds)
  .filter((id) => !players.find((p) => p.id === id)?.atributos?.ataque).length;
```

No painel `DIAGNÓSTICO DE EQUILÍBRIO`, antes dos alertas de composição:

- se `rosterIssues.length`, renderizar cada mensagem como alerta de erro;
- se `estimatedCount > 0`, renderizar `${estimatedCount} atleta(s) entraram com avaliação estimada pela média da turma.` como aviso.

O botão `Gerar tabela` recebe `disabled={rosterIssues.length > 0}`.

- [ ] **Step 6: Rodar a suíte e verificar**

```bash
npm test
npm run typecheck
node node_modules/prettier/bin/prettier.cjs --check src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/components/session/SessionWizard.tsx
npx eslint src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/components/session/SessionWizard.tsx
```

Esperado: `fail 0`, sem `error TS`, formato limpo, eslint sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts src/components/session/SessionWizard.tsx
git commit -m "feat(wizard): bloquear tabela quando a divisao nao cobre a selecao e avisar avaliacao estimada"
```

---

### Task 5: Relatório conta os jogos que aconteceram

Começa por caracterização, porque a causa do `totalGames: 1` **não está determinada** — o teste é que vai expô-la.

**Files:**
- Create: `src/logic/reports.test.ts`
- Modify: `src/logic/reports.ts:123-240` (`generateSessionReport`)
- Modify: `src/shared/types/session.ts:84` (`SessionReport`)

**Interfaces:**
- Consumes: nada das tarefas anteriores. **Não** usar `isTerminalGame` da Task 1 aqui: ele inclui
  `cancelled`, e o relatório precisa justamente excluir jogo cancelado. São regras diferentes com
  nomes parecidos — manter separadas é proposital.
- Produces: `SessionReport` ganha `gamesByWalkover: number`.

- [ ] **Step 1: Escrever o teste de caracterização**

Criar `src/logic/reports.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSessionReport } from './reports';
import type { Game, Player, Session, Team } from '@shared/types';

const session = { id: 's1', name: 'Torneio', date: '2026-08-10', status: 'finished', type: 'tournament', selectedPlayerIds: [], teamIds: ['t1', 't2'] } as unknown as Session;
const teams = [
  { id: 't1', sessionId: 's1', name: 'Time 1', playerIds: [] },
  { id: 't2', sessionId: 's1', name: 'Time 2', playerIds: [] },
] as unknown as Team[];
const players: Player[] = [];

const games = [
  { id: 'g1', sessionId: 's1', status: 'finished', teamAId: 't1', teamBId: 't2', scoreA: 2, scoreB: 1, winnerTeamId: 't1', sequenceNumber: 1 },
  { id: 'g2', sessionId: 's1', status: 'walkover', teamAId: 't1', teamBId: 't2', scoreA: 12, scoreB: 0, winnerTeamId: 't1', finishReason: 'walkover', sequenceNumber: 2 },
  { id: 'g3', sessionId: 's1', status: 'walkover', teamAId: 't1', teamBId: 't2', scoreA: 0, scoreB: 12, winnerTeamId: 't2', finishReason: 'walkover', sequenceNumber: 3 },
] as unknown as Game[];

test('relatorio conta os tres jogos, inclusive os decididos por W.O.', () => {
  const r = generateSessionReport(session, games, [], teams, players);
  assert.equal(r.totalGames, 3);
});

test('relatorio soma os pontos dos jogos, nao os eventos registrados', () => {
  const r = generateSessionReport(session, games, [], teams, players);
  assert.equal(r.totalPoints, 27);
});

test('relatorio informa quantos jogos foram por W.O.', () => {
  const r = generateSessionReport(session, games, [], teams, players);
  assert.equal(r.gamesByWalkover, 2);
});

test('jogo cancelado nao entra na contagem', () => {
  const comCancelado = [...games, { id: 'g4', sessionId: 's1', status: 'cancelled', teamAId: 't1', teamBId: 't2', scoreA: 0, scoreB: 0, sequenceNumber: 4 }] as unknown as Game[];
  const r = generateSessionReport(session, comCancelado, [], teams, players);
  assert.equal(r.totalGames, 3);
});
```

- [ ] **Step 2: Rodar e registrar exatamente o que falha**

```bash
node --import tsx --test src/logic/reports.test.ts
```

Esperado: falhas. **Anotar os valores recebidos** — é o diagnóstico da causa que a spec deixou em aberto. Se `totalGames` já vier 3 aqui, a causa do `1` observado em produção está a montante (lista de jogos desatualizada na chamada de `finishSession`, `sessionLifecycleUseCases.ts:1052`) e não em `reports.ts`; nesse caso, acrescentar um teste que cubra a montagem da lista antes de seguir.

- [ ] **Step 3: Adicionar o campo ao tipo**

Em `src/shared/types/session.ts`, junto de `totalGames` e `totalPoints` no `SessionReport`:

```ts
  gamesByWalkover: number;
```

- [ ] **Step 4: Implementar a contagem a partir dos jogos**

Em `generateSessionReport`, substituir as duas linhas de contagem:

```ts
  const countedGames = sessionGames.filter(
    (g) => g.status === 'finished' || g.status === 'walkover',
  );
```

e no objeto de retorno:

```ts
    totalGames: countedGames.length,
    totalPoints: countedGames.reduce((sum, g) => sum + (g.scoreA ?? 0) + (g.scoreB ?? 0), 0),
    gamesByWalkover: countedGames.filter((g) => g.status === 'walkover').length,
```

`gameReports` continua como está — o ranking individual segue vindo dos eventos, e W.O. não tem autor.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
node --import tsx --test src/logic/reports.test.ts
```

Esperado: 4 testes passando.

- [ ] **Step 6: Corrigir o truncamento do MVP no Histórico**

```bash
git grep -n -i "mvp" -- src/components/history/HistoryView.tsx
```

No card de MVP, o nome é cortado no primeiro espaço. Trocar o corte por `mvpName` inteiro, deixando o CSS truncar visualmente com `truncate` se necessário — o dado não deve ser cortado.

- [ ] **Step 7: Rodar a suíte inteira e o build**

```bash
npm test
npm run typecheck
npm run build
```

Esperado: `fail 0`, sem `error TS`, `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add src/logic/reports.ts src/logic/reports.test.ts src/shared/types/session.ts src/components/history/HistoryView.tsx
git commit -m "fix(relatorios): contar jogos e pontos a partir dos jogos, incluindo W.O."
```

---

### Task 6: Encerrar sessão resolve jogos abertos

**Files:**
- Modify: `src/application/sessionLifecycleUseCases.ts:1040-1060` (fluxo de encerramento)
- Test: `src/application/sessionLifecycleUseCases.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: o resultado de encerramento passa a devolver os jogos atualizados, sem nenhum `active` ou `paused` remanescente.

- [ ] **Step 1: Escrever o teste que falha**

```ts
test('encerrar sessao nao deixa jogo ativo orfao', () => {
  const activeSession = { id: 's1', name: 'Sessao', status: 'active', teamIds: [], selectedPlayerIds: [] } as unknown as Session;
  const games = [
    { id: 'g1', sessionId: 's1', status: 'finished', scoreA: 12, scoreB: 2 },
    { id: 'g2', sessionId: 's1', status: 'active', scoreA: 0, scoreB: 0 },
  ] as unknown as Game[];

  const result = buildFinishedSessionResult({
    activeSession,
    sessions: [activeSession],
    games,
    pointEvents: [],
    teams: [],
    players: [],
    sessionReports: [],
    finishedAt: '2026-08-10T12:00:00.000Z',
  });

  const abertos = result.games.filter(
    (g) => g.sessionId === 's1' && (g.status === 'active' || g.status === 'paused'),
  );
  assert.deepEqual(abertos, []);
});
```

A função real é `buildFinishedSessionResult` (`sessionLifecycleUseCases.ts:1015`). Conferir no Step 2 o nome exato da chave de jogos no objeto de retorno e ajustar `result.games` se divergir.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: falha mostrando o jogo `active` remanescente.

- [ ] **Step 3: Implementar**

No fluxo de encerramento, antes de gerar o relatório, normalizar os jogos abertos:

```ts
  const resolvedGames = sessionGames.map((game) =>
    game.status === 'active' || game.status === 'paused'
      ? { ...game, status: 'cancelled' as const, finishedAt: input.finishedAt }
      : game,
  );
```

Usar `resolvedGames` daí em diante, inclusive na chamada de `generateSessionReport`, e devolvê-los no resultado. Jogo aberto sem placar vira `cancelled`, não `finished` — não foi disputado, e a Task 5 já exclui `cancelled` da contagem.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/application/sessionLifecycleUseCases.test.ts
```

Esperado: todos passando.

- [ ] **Step 5: Verificação final completa do CI**

```bash
npm run typecheck
npx eslint src/application/sessionLifecycleUseCases.ts
node node_modules/prettier/bin/prettier.cjs --check src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts
npm test
npm run build
```

Esperado: sem `error TS`, eslint sem saída, formato limpo, `fail 0`, `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add src/application/sessionLifecycleUseCases.ts src/application/sessionLifecycleUseCases.test.ts
git commit -m "fix(sessao): encerrar sessao resolve jogos abertos em vez de deixa-los orfaos"
```

---

## Verificação manual ao final

Com `npm run dev` e uma sessão de teste:

1. Criar sessão com 9 atletas, sendo 2 sem nenhuma avaliação. Gerar times. **Esperado:** os 9 distribuídos, aviso de "2 atletas entraram com avaliação estimada", `Gerar tabela` habilitado.
2. Gerar tabela e chegar ao estado ativo sem iniciar partida. **Esperado:** header e corpo dizem a mesma coisa; nada de "Partida em Andamento" antes do primeiro ponto.
3. Criar torneio, gerar tabela, e comparar a lista de Torneios com o detalhe. **Esperado:** mesmo estado nos dois.
4. Pausar o torneio. **Esperado:** `Iniciar torneio` desabilitado.
5. Fechar dois jogos por W.O. e um normal, encerrar, abrir o Histórico. **Esperado:** `Total de jogos: 3`, pontos somando os três, e o nome do MVP inteiro.
6. Encerrar uma sessão com partida em andamento. **Esperado:** nenhum jogo `active` remanescente no estado.
