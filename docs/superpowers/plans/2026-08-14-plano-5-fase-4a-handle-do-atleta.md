# Plano 5 — Fase 4A (Handle do Atleta) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

> **Este plano SUBSTITUI `2026-08-14-plano-5-fase-4-slugs.md`**, cuja premissa (derivar o handle do nome e regenerar a cada rename) é o oposto da decisão de produto tomada em 2026-08-14. O arquivo antigo é deletado na Task 1 para não induzir ninguém ao erro.

**Goal:** O handle (`@username`) passa a pertencer a quem se registra: quem tem conta escolhe o seu, com verificação de disponibilidade, e pode trocá-lo depois; atleta sem conta não tem handle nenhum e continua endereçado pelo `id` na URL.

**Architecture:** Uma camada pura nova (`src/logic/handle.ts`) concentra as regras de formato que o banco já impõe hoje (`^[a-z0-9][a-z0-9_-]{2,29}$`), para que cliente e Postgres nunca discordem. A derivação automática de handle a partir do nome é **removida** dos dois pontos onde existe hoje; uma migration libera os handles que o backfill de 2026-06-10 atribuiu a atletas sem conta. A URL do atleta passa a aceitar handle **ou** id no mesmo slot `:playerId`, com o id resolvendo para sempre. A verificação de disponibilidade reusa o RPC `find_player_by_username`, que já é global, `security definer` e concedido a `authenticated` — nenhuma migration nova para isso.

**Tech Stack:** React 19, react-router 7.17, TypeScript (`strictNullChecks`, sem `strict`), Vite 6, Vitest + jsdom + RTL (`.spec.tsx`), runner nativo do Node + tsx (`.test.ts`), Supabase (Postgres + RLS + RPCs).

## Global Constraints

- Node ≥ 20 (22 recomendado). `nvm use` se algo errar.
- Prettier: aspas simples, largura 100 (`.prettierrc`). **Validar formato só nos arquivos que você tocou:** `npx prettier@3.8.4 --check <arquivos>`, sempre no caminho real do arquivo. `npm run format:check` no repo inteiro acusa dezenas de arquivos por `core.autocrlf` e o ruído esconde o erro real. Se acusar um arquivo seu, confirme se é ruído com `diff <(tr -d '\r' < ARQ) <(npx prettier@3.8.4 ARQ | tr -d '\r')` antes de reformatar.
- **Sem comentários no código-fonte, exceto onde este plano mostra o comentário explicitamente.**
- UI em pt-BR: labels, toasts, erros e campos de domínio.
- Imports por alias (`@app`, `@domain`, `@logic`, `@infra`, `@ui`, `@shared/types`), nunca caminhos relativos profundos.
- Dois runners separados por glob: `.test.ts` → lógica pura, runner nativo do Node (`node --import tsx --test <arquivo>`), zero DOM. `.spec.tsx` → UI, Vitest + jsdom + RTL (`npx vitest run <arquivo>`).
- **Erros de ESLint importam; warnings não.** Rode `npx eslint src` (não `npm run lint:eslint`, que quebra neste working copy por causa das worktrees em `.claude/worktrees/` não ignoradas pelo config). Baseline: **0 errors** em `src`.
- Baseline que não pode regredir: **765 unit, 177 UI**, `npm run lint` (= `tsc --noEmit`) limpo, `npm run build` verde.
- Branch: `worktree-plano-5-fase-4-slugs`, no worktree `.claude/worktrees/plano-5-fase-4-slugs`. **Esse worktree não tem `node_modules` nem `.env`** — rode `npm install` nele antes da Task 1. A ausência de `.env` é desejável: faz a suíte de UI rodar pelo mesmo caminho do CI (uma divergência silenciosa entre local e CI foi descoberta na Fase 3 justamente por causa disso).
- Commit por tarefa. **Não faça push e não troque de branch**; o controlador decide isso.
- Antes de encerrar qualquer sessão: `git log origin/main..HEAD`. Trabalho local não pushado já se perdeu neste projeto.
- **Nenhuma afirmação de causa sem um teste que a reproduza.** Todo teste novo precisa de prova por mutação: quebre o alvo, veja falhar pelo motivo certo, restaure, e relate a saída literal. Na Fase 3 apareceram SETE asserções que passavam sem a implementação.

## Decisões de produto fechadas (não reabrir)

1. **Handle é de quem se registra.** Atleta sem conta (`user_id is null`) não tem `username`. A URL dele é o `id`, para sempre.
2. **Handle é escolhido pela pessoa, não derivado do nome.** O nome pode virar *sugestão* pré-preenchida, nunca um valor imposto ou regenerado.
3. **Trocar o handle libera o antigo** imediatamente, sem tabela de histórico e sem alias. Um link antigo simplesmente deixa de resolver, ou passa a resolver para quem reivindicou. É raro e intencional, diferente de regenerar a cada rename.
4. **Renomear a pessoa NÃO mexe no handle.** São coisas independentes — é o que separa este plano do plano que ele substitui.
5. **Sem blacklist de segmentos reservados.** Verificado no roteador: os filhos de `:playerId` não existem (é folha), e os literais da árvore de comunidade (`pessoas`, `sessoes`, `nova`, …) vivem em níveis mais profundos, nunca no slot do handle. Defender contra essa colisão só produziria handles feios (`pessoas-2`) sem motivo.

## Desvios deliberados

Ambos produzem **menos** código que a alternativa:

1. **Nenhuma migration nova para verificar disponibilidade.** `find_player_by_username` (migration `20260610161256`) já é `security definer`, global (não filtra por RLS), retorna `id/username/name` e é `grant execute … to authenticated`. Achou linha ⇒ handle ocupado. Reuso, não crio.
2. **`resolveUsername` encolhe em vez de crescer.** O plano substituído queria acrescentar `force?: boolean`. Aqui a função perde responsabilidade: ela deixa de *inventar* handle e passa só a preservar o que existe. Menos código, e a regra nova fica em um lugar só.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/logic/handle.ts` | Regras puras do handle: `HANDLE_PATTERN`, `normalizeHandle`, `validateHandle`, `suggestHandle`. Espelha a constraint do Postgres. |
| `src/logic/handle.test.ts` | Testes do acima (runner do Node). |
| `supabase/migrations/20260814120000_handle_belongs_to_accounts.sql` | Libera `players.username` onde `user_id is null`. |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/logic/username.ts` | `resolveUsername` deixa de derivar: preserva o handle existente e devolve `undefined` quando não há. `generateUsername`/`generateUsernames`/`slugify` sobrevivem (usados por `suggestHandle` e pelo backfill histórico). |
| `src/logic/username.test.ts` | Ajusta o teste da derivação, que passa a afirmar o novo contrato. |
| `src/application/localPlayerUseCases.ts` | `applyPlayerCreationForCommunity` perde o parâmetro `createUsername`; `applyLocalPlayerSave` para de recalcular handle. |
| `src/application/localPlayerUseCases.test.ts` | Assertions do novo contrato. |
| `src/app/AppShell.tsx` | `createPlayerForCommunity` para de passar `createUsername`. |
| `src/application/appRoutes.ts` | `paths.atleta` aceita handle ou id; novo `resolvePlayerRoute` puro. |
| `src/application/appRoutes.test.ts` | Testes do acima. |
| `src/app/routes/communityRoutes.tsx` | `CommunityPeopleRoute` emite `username ?? id`; `PlayerEditRoute` resolve handle-ou-id. |
| `src/infra/supabase/playerCloudService.ts` | `isHandleAvailable(handle)` sobre o RPC existente. |
| `src/app/auth/AuthPages.tsx` | `UsernameOnboardingPage` ganha validação de formato, verificação de disponibilidade e UI de verdade. |
| `src/app/auth/AuthPages.spec.tsx` | Testes do onboarding. |
| `src/app/routes/globalRoutes.tsx` | `/perfil` ganha a troca de handle. |

## Ordem de entrega de valor (se o tempo apertar)

1. **Tasks 1–3** — para de criar handle para quem não tem conta, e libera os que o backfill criou. É a correção do namespace; ship sozinho.
2. **Task 4** — URL do atleta por handle. É o pedido original.
3. **Tasks 5–6** — verificação de disponibilidade e troca de handle. Fecha o modelo.

Cada bloco é verde por si. Nenhuma tarefa pressupõe a próxima para typecheckar.

---

## Task 1: Camada pura do handle (`handle.ts`)

**Files:**
- Create: `src/logic/handle.ts`
- Create: `src/logic/handle.test.ts`
- Delete: `docs/superpowers/plans/2026-08-14-plano-5-fase-4-slugs.md`

**Interfaces:**
- Produces: `HANDLE_PATTERN: RegExp`, `HANDLE_MIN_LENGTH`, `HANDLE_MAX_LENGTH`, `normalizeHandle(input: string): string`, `validateHandle(input: string): string | null` (devolve a mensagem de erro em pt-BR, ou `null` quando válido), `suggestHandle(name: string, taken: Iterable<string>): string | undefined`.
- Consumes: `slugify` de `./username` (já existe, `username.ts:16`) — reusar, não duplicar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/logic/handle.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_PATTERN,
  normalizeHandle,
  suggestHandle,
  validateHandle,
} from './handle';

test('o padrão do cliente é o mesmo que o Postgres impõe', () => {
  assert.equal(HANDLE_PATTERN.source, '^[a-z0-9][a-z0-9_-]{2,29}$');
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
});

test('normalizeHandle apara espaços, baixa a caixa e tira o arroba', () => {
  assert.equal(normalizeHandle('  @Joao_Silva '), 'joao_silva');
  assert.equal(normalizeHandle('MATHEUS'), 'matheus');
  assert.equal(normalizeHandle(''), '');
});

test('validateHandle aceita o que a constraint aceita', () => {
  assert.equal(validateHandle('joao'), null);
  assert.equal(validateHandle('joao-silva'), null);
  assert.equal(validateHandle('j0ao_silva'), null);
  assert.equal(validateHandle('a'.repeat(30)), null);
});

test('validateHandle recusa com mensagem em pt-BR', () => {
  assert.equal(validateHandle(''), 'Escolha um nome de usuário.');
  assert.equal(validateHandle('ab'), 'Use de 3 a 30 caracteres.');
  assert.equal(validateHandle('a'.repeat(31)), 'Use de 3 a 30 caracteres.');
  assert.equal(validateHandle('_joao'), 'Comece com uma letra ou número.');
  assert.equal(validateHandle('-joao'), 'Comece com uma letra ou número.');
  assert.equal(
    validateHandle('joão'),
    'Use apenas letras sem acento, números, hífen e underline.',
  );
  assert.equal(
    validateHandle('joao silva'),
    'Use apenas letras sem acento, números, hífen e underline.',
  );
});

test('validateHandle normaliza antes de julgar', () => {
  assert.equal(validateHandle('  @Joao_Silva '), null);
});

test('suggestHandle propõe a partir do nome e desvia de colisão', () => {
  assert.equal(suggestHandle('Thaís Lottar', []), 'thais-lottar');
  assert.equal(suggestHandle('Thaís Lottar', ['thais-lottar']), 'thais-lottar-2');
  assert.equal(suggestHandle('Thaís Lottar', ['thais-lottar', 'thais-lottar-2']), 'thais-lottar-3');
});

test('suggestHandle devolve undefined quando o nome não vira handle válido', () => {
  assert.equal(suggestHandle('', []), undefined);
  assert.equal(suggestHandle('!!!', []), undefined);
  assert.equal(suggestHandle('ab', []), undefined);
});
```

> A sugestão para um nome curto (`'ab'`) é `undefined` de propósito: `ab` tem 2 caracteres e a constraint exige 3. Sugerir algo inválido faria a pessoa receber erro num campo que o próprio app preencheu.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/logic/handle.test.ts
```

Esperado: FAIL — `Cannot find module './handle'`.

- [ ] **Step 3: Implementar `handle.ts`**

Criar `src/logic/handle.ts`:

```ts
import { slugify } from './username';

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

export function validateHandle(input: string): string | null {
  const handle = normalizeHandle(input);
  if (!handle) return 'Escolha um nome de usuário.';
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return 'Use de 3 a 30 caracteres.';
  }
  if (!/^[a-z0-9]/.test(handle)) return 'Comece com uma letra ou número.';
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Use apenas letras sem acento, números, hífen e underline.';
  }
  return null;
}

export function suggestHandle(name: string, taken: Iterable<string>): string | undefined {
  const base = slugify(name);
  if (!base) return undefined;
  const used = new Set(taken);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return validateHandle(candidate) === null ? candidate : undefined;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/logic/handle.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Deletar o plano substituído**

```bash
git rm docs/superpowers/plans/2026-08-14-plano-5-fase-4-slugs.md
```

Ele descreve derivar e regenerar o handle a cada rename — o oposto do que este plano constrói. Deixá-lo no repo faria a próxima pessoa implementar a coisa errada.

- [ ] **Step 6: Verificar e commitar**

```bash
npm run lint && npm run test:unit
```

Esperado: `tsc` sem saída; unit 765 + 7 = 772, 0 falhas.

```bash
npx prettier@3.8.4 --check src/logic/handle.ts src/logic/handle.test.ts
```

```bash
git add src/logic/handle.ts src/logic/handle.test.ts && git commit -m "feat(handle): camada pura das regras de nome de usuario"
```

---

## Task 2: Parar de derivar handle para quem não tem conta

**Files:**
- Modify: `src/logic/username.ts`
- Modify: `src/logic/username.test.ts`
- Modify: `src/application/localPlayerUseCases.ts`
- Modify: `src/application/localPlayerUseCases.test.ts`
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: nada da Task 1 (independente; pode rodar antes dela).
- Produces: `resolveUsername(athlete, takenUsernames)` mantém a assinatura mas nunca inventa handle. `applyPlayerCreationForCommunity` perde o campo `createUsername` do input — quem chamava precisa parar de passá-lo.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/logic/username.test.ts`, substituir o teste `resolveUsername derives a fresh unique handle for a new athlete` por:

```ts
test('resolveUsername nunca inventa handle: quem não tem, continua sem', () => {
  assert.equal(resolveUsername({ nome: 'Thaís Lottar' }, []), undefined);
  assert.equal(resolveUsername({ nome: 'Thaís Lottar', isGuest: false }, ['outro']), undefined);
});

test('resolveUsername preserva o handle de quem já tem', () => {
  assert.equal(
    resolveUsername({ nome: 'Thaís Lottar', username: 'thais' }, ['outro']),
    'thais',
  );
  assert.equal(
    resolveUsername({ nome: 'Nome Novo', username: 'thais' }, []),
    'thais',
  );
});
```

Em `src/application/localPlayerUseCases.test.ts`, acrescentar:

```ts
test('applyPlayerCreationForCommunity cria atleta sem handle', () => {
  const result = applyPlayerCreationForCommunity({
    players: [],
    name: 'Ana Souza',
    communityId: 'c1',
    now: '2026-08-14T00:00:00.000Z',
    createId: () => 'p1',
  });
  const created = result.players.find((player) => player.id === 'p1');
  assert.equal(created?.username, undefined);
  assert.deepEqual(created?.communityIds, ['c1']);
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
node --import tsx --test src/logic/username.test.ts src/application/localPlayerUseCases.test.ts
```

Esperado: FAIL — `resolveUsername` ainda devolve `'thais-lottar'` no primeiro caso, e `applyPlayerCreationForCommunity` ainda exige `createUsername` (erro de tipo no `tsc`, e handle preenchido no teste).

- [ ] **Step 3: Encolher `resolveUsername`**

Em `src/logic/username.ts`, substituir o bloco de doc e a função (linhas 50–65) por:

```ts
/**
 * Picks the username to persist for a new/edited athlete. A handle belongs to
 * whoever registers an account: this function never mints one. It preserves an
 * existing handle (including a guest's, which is normally none) and otherwise
 * returns undefined — the athlete is addressed by players.id until an account
 * claims a handle.
 */
export function resolveUsername(
  athlete: { nome: string; isGuest?: boolean; username?: string },
  takenUsernames: Iterable<string>,
): string | undefined {
  void takenUsernames;
  return athlete.username;
}
```

> `takenUsernames` continua no contrato porque os dois chamadores já o montam e a Fase 4B vai reaproveitá-lo na sugestão. O `void` deixa explícito que hoje ele não é lido, sem quebrar a assinatura.

- [ ] **Step 4: Remover `createUsername` do use case de criação**

Em `src/application/localPlayerUseCases.ts`, na assinatura de `applyPlayerCreationForCommunity`, apagar a linha:

```ts
  createUsername: (name: string) => string | undefined;
```

e, no corpo, apagar a atribuição de `username` no objeto do atleta criado (procure por `username: input.createUsername(` e remova a propriedade inteira).

Em `src/app/AppShell.tsx`, na closure `createPlayerForCommunity`, apagar o bloco:

```tsx
        createUsername: (playerName) =>
          resolveUsername(
            { nome: playerName, isGuest: false },
            play.rawPlayers.filter((p) => p.username).map((p) => p.username as string),
          ),
```

e o import de `resolveUsername` se ele ficar sem uso (o `tsc` acusa).

- [ ] **Step 5: Rodar e confirmar que passam**

```bash
npm run lint && node --import tsx --test src/logic/username.test.ts src/application/localPlayerUseCases.test.ts
```

Esperado: `tsc` limpo; ambos os arquivos verdes.

- [ ] **Step 6: Prova de mutação**

Reverta o corpo de `resolveUsername` para a versão antiga (que chamava `generateUsername`), rode `node --import tsx --test src/logic/username.test.ts`, e confirme que o teste `nunca inventa handle` FALHA com `'thais-lottar' !== undefined`. Restaure. Relate a saída literal.

- [ ] **Step 7: Verificar e commitar**

```bash
npm run test:unit && npx vitest run
```

Esperado: unit sem falhas; UI 177 sem falhas.

```bash
npx prettier@3.8.4 --check src/logic/username.ts src/logic/username.test.ts src/application/localPlayerUseCases.ts src/application/localPlayerUseCases.test.ts src/app/AppShell.tsx
```

```bash
git add -A src/logic src/application src/app && git commit -m "feat(handle): atleta sem conta deixa de receber nome de usuario"
```

---

## Task 3: Migration — liberar os handles de quem não tem conta

**Files:**
- Create: `supabase/migrations/20260814120000_handle_belongs_to_accounts.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada em código; muda o estado do banco.

> **Contexto que justifica a migration:** `20260610161256_global_athlete_identity.sql` fez backfill de `username` para **todos** os players, derivando do nome. Como o handle passa a pertencer a quem se registra, os handles de atletas sem conta estão ocupando o namespace e podem bloquear a pessoa real no cadastro.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260814120000_handle_belongs_to_accounts.sql`:

```sql
-- Handle belongs to whoever registers an account.
--
-- 20260610161256 backfilled players.username for every row, deriving it from the
-- athlete's name. Athletes created by a moderator never registered, so those
-- handles squat the global namespace and can block the real person from claiming
-- their own at sign-up. This releases them: username survives only where an
-- account owns the row (user_id is not null).
--
-- players.id stays the canonical identity and keeps addressing every athlete in
-- the UI, so nothing becomes unreachable.

update public.players
set username = null
where user_id is null
  and username is not null;
```

- [ ] **Step 2: Escrever o teste de schema que falha**

`src/infra/supabase/schema.test.ts` não tem um helper `readMigration(nome)`: ele declara uma constante por migration no topo do arquivo, com `readFileSync` sobre uma `new URL(...)` (veja `const migration = readFileSync(` na linha 14 e `const playerEvaluationsMigration = readFileSync(` na 22). Siga esse padrão — acrescente a constante junto das outras:

```ts
const handleOwnershipMigration = readFileSync(
  new URL('../../../supabase/migrations/20260814120000_handle_belongs_to_accounts.sql', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
```

> Confira o caminho relativo contra o das constantes vizinhas antes de rodar — se elas usam outra profundidade de `../`, use a mesma.

E o teste:

```ts
test('a migration de handle libera username de atleta sem conta', () => {
  assert.match(handleOwnershipMigration, /update public\.players/);
  assert.match(handleOwnershipMigration, /set username = null/);
  assert.match(handleOwnershipMigration, /where user_id is null/);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
node --import tsx --test src/infra/supabase/schema.test.ts
```

Esperado: FAIL — o arquivo de migration não está na lista/não é encontrado.

- [ ] **Step 4: Rodar e confirmar que passa**

Depois de registrar a migration na lista do teste:

```bash
node --import tsx --test src/infra/supabase/schema.test.ts
```

Esperado: PASS.

- [ ] **Step 5: NÃO aplique a migration**

Aplicar em produção é decisão do controlador humano — a migration apaga dados (handles) e é irreversível sem backup. Diga no relatório que ela está escrita, testada e **pendente de aplicação**.

- [ ] **Step 6: Verificar e commitar**

```bash
npm run test:unit
```

```bash
npx prettier@3.8.4 --check src/infra/supabase/schema.test.ts
```

```bash
git add supabase/migrations/20260814120000_handle_belongs_to_accounts.sql src/infra/supabase/schema.test.ts && git commit -m "feat(handle): migration libera nome de usuario de atleta sem conta"
```

---

## Task 4: URL do atleta por handle ou id

**Files:**
- Modify: `src/application/appRoutes.ts`
- Modify: `src/application/appRoutes.test.ts`
- Modify: `src/app/routes/communityRoutes.tsx`
- Modify: `src/app/AppRouter.spec.tsx`

**Interfaces:**
- Consumes: `getCommunityPlayers` de `@logic/community` (já usado no arquivo).
- Produces: `resolvePlayerRoute(input: { param?: string; players: Array<{ id: string; username?: string }> }): { kind: 'ok'; playerId: string } | { kind: 'new' } | { kind: 'not-found' }`. `paths.atleta(communityId, playerHandleOrId)` inalterado na assinatura — quem chama é que passa `username ?? id`.

- [ ] **Step 1: Escrever o teste puro que falha**

Em `src/application/appRoutes.test.ts`, acrescentar:

```ts
test('resolvePlayerRoute aceita id, handle e a sentinela de novo atleta', () => {
  const players = [
    { id: 'p1', username: 'ana' },
    { id: 'p2' },
  ];
  assert.deepEqual(resolvePlayerRoute({ param: 'p1', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'ana', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'ANA', players }), { kind: 'ok', playerId: 'p1' });
  assert.deepEqual(resolvePlayerRoute({ param: 'p2', players }), { kind: 'ok', playerId: 'p2' });
  assert.deepEqual(resolvePlayerRoute({ param: NEW_PLAYER_ID, players }), { kind: 'new' });
  assert.deepEqual(resolvePlayerRoute({ param: 'nao-existe', players }), { kind: 'not-found' });
  assert.deepEqual(resolvePlayerRoute({ players }), { kind: 'not-found' });
});

test('resolvePlayerRoute prefere id quando um handle colide com um id', () => {
  const players = [
    { id: 'ana', username: 'zeca' },
    { id: 'p2', username: 'ana' },
  ];
  assert.deepEqual(resolvePlayerRoute({ param: 'ana', players }), { kind: 'ok', playerId: 'ana' });
});
```

> O segundo teste fixa a regra de desempate: o `id` ganha. Sem isso, alguém poderia escolher como handle o `id` de outra pessoa e sequestrar a URL dela.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/application/appRoutes.test.ts
```

Esperado: FAIL — `resolvePlayerRoute is not a function`.

- [ ] **Step 3: Implementar em `appRoutes.ts`**

Acrescentar a `src/application/appRoutes.ts`:

```ts
export function resolvePlayerRoute(input: {
  param?: string;
  players: Array<{ id: string; username?: string }>;
}): { kind: 'ok'; playerId: string } | { kind: 'new' } | { kind: 'not-found' } {
  if (!input.param) return { kind: 'not-found' };
  if (input.param === NEW_PLAYER_ID) return { kind: 'new' };
  const byId = input.players.find((player) => player.id === input.param);
  if (byId) return { kind: 'ok', playerId: byId.id };
  const target = input.param.toLowerCase();
  const byHandle = input.players.find((player) => player.username?.toLowerCase() === target);
  if (byHandle) return { kind: 'ok', playerId: byHandle.id };
  return { kind: 'not-found' };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/application/appRoutes.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Consumir na rota**

Em `src/app/routes/communityRoutes.tsx`:

No `CommunityPeopleRoute`, emitir o handle quando existir — trocar as duas navegações para o editor:

```tsx
        onEditPlayer: (player) => {
          play.handleEditPlayer(player);
          navigate(paths.atleta(community.id, player.username ?? player.id));
        },
```

No `PlayerEditRoute`, trocar a resolução do alvo. Onde hoje está:

```tsx
  const targetPlayer =
    playerId && playerId !== NEW_PLAYER_ID
      ? getCommunityPlayers(community.id, play.players).find((item) => item.id === playerId)
      : undefined;
```

usar:

```tsx
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const resolution = resolvePlayerRoute({ param: playerId, players: communityPlayers });
  const targetPlayer =
    resolution.kind === 'ok'
      ? communityPlayers.find((item) => item.id === resolution.playerId)
      : undefined;
```

e trocar a condição do redirect de "não achou o atleta" por `resolution.kind === 'not-found'`. **Cuidado:** o caminho da sentinela `novo` (`resolution.kind === 'new'`) precisa continuar chamando `play.handleAddPlayer()` como hoje — não colapse os três casos em dois.

Acrescentar `resolvePlayerRoute` ao import de `@app/appRoutes`.

- [ ] **Step 6: Escrever a spec de rota que falha**

Em `src/app/AppRouter.spec.tsx`, no `describe` de pessoas, acrescentar:

```tsx
  it('abre o atleta pelo handle na URL', async () => {
    seedLocalDb({ communities: [community], players: [{ ...player, username: 'ana' }] });
    renderApp('/comunidades/c1/pessoas/editar-atleta/ana');
    expect(await screen.findByDisplayValue('Ana Souza')).toBeTruthy();
  });

  it('continua abrindo o atleta pelo id', async () => {
    seedLocalDb({ communities: [community], players: [{ ...player, username: 'ana' }] });
    renderApp('/comunidades/c1/pessoas/editar-atleta/p1');
    expect(await screen.findByDisplayValue('Ana Souza')).toBeTruthy();
  });
```

```bash
npx vitest run src/app/AppRouter.spec.tsx
```

Esperado: o teste do handle FALHA antes do Step 5 (cai no redirect para a lista); o do id passa.

- [ ] **Step 7: Prova de mutação**

Com o Step 5 aplicado, troque temporariamente `resolvePlayerRoute` por uma busca só por `id` e confirme que o teste do handle volta a falhar. Restaure. Relate a saída literal.

- [ ] **Step 8: Verificar e commitar**

```bash
npm run lint && npm run test:unit && npx vitest run && npx eslint src 2>&1 | tail -2
```

Esperado: `tsc` limpo; unit e UI sem falhas; eslint 0 errors em `src`.

```bash
npx prettier@3.8.4 --check src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/routes/communityRoutes.tsx src/app/AppRouter.spec.tsx
```

```bash
git add src/application src/app && git commit -m "feat(handle): URL do atleta aceita nome de usuario ou id"
```

---

## Task 5: Verificação de disponibilidade no cadastro

**Files:**
- Modify: `src/infra/supabase/playerCloudService.ts`
- Modify: `src/app/auth/AuthPages.tsx`
- Modify: `src/app/auth/AuthPages.spec.tsx`

**Interfaces:**
- Consumes: `validateHandle`, `normalizeHandle` de `@logic/handle` (Task 1).
- Produces: `playerCloudService.isHandleAvailable(handle: string): Promise<boolean>`.

- [ ] **Step 1: Implementar a consulta de disponibilidade**

O arquivo **já tem** `findByUsername(username)` (por volta da linha 262), que faz exatamente essa consulta pelo RPC e devolve a linha ou `null`. Não duplique a chamada — envolva-a:

```ts
  /** True when no athlete holds this handle yet. Optimistic UI hint; the unique
   *  index is what actually decides on write. */
  async isHandleAvailable(handle: string): Promise<boolean> {
    return (await this.findByUsername(handle)) === null;
  },
```

> `this` funciona porque o arquivo exporta um objeto literal de métodos e `findByUsername` é irmão de `isHandleAvailable` nele. Se o `tsc` reclamar do `this` sob a tipagem do objeto, extraia a lógica de `findByUsername` para uma função de módulo e chame-a das duas — **não** copie o corpo do RPC.
>
> Sem Supabase configurado, `findByUsername` já falha ou devolve vazio pelo caminho que o arquivo define hoje; mantenha esse comportamento. A verificação é só uma dica otimista — o índice único é quem decide na escrita.

- [ ] **Step 2: Escrever a spec que falha**

Em `src/app/auth/AuthPages.spec.tsx`, acrescentar (adaptando o harness que o arquivo já usa para montar a `UsernameOnboardingPage`):

```tsx
  it('recusa formato inválido sem chamar o servidor', async () => {
    const completeUsername = vi.fn();
    renderOnboarding({ completeUsername });
    fireEvent.change(screen.getByLabelText(/nome de usu/i), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/3 a 30 caracteres/i);
    expect(completeUsername).not.toHaveBeenCalled();
  });

  it('avisa quando o nome de usuário já está em uso', async () => {
    renderOnboarding({ isHandleAvailable: vi.fn().mockResolvedValue(false) });
    fireEvent.change(screen.getByLabelText(/nome de usu/i), { target: { value: 'ana' } });
    expect(await screen.findByText(/já está em uso/i)).toBeTruthy();
  });

  it('confirma quando está livre', async () => {
    renderOnboarding({ isHandleAvailable: vi.fn().mockResolvedValue(true) });
    fireEvent.change(screen.getByLabelText(/nome de usu/i), { target: { value: 'ana' } });
    expect(await screen.findByText(/dispon/i)).toBeTruthy();
  });
```

> Se o arquivo ainda não tiver um helper `renderOnboarding`, escreva-o seguindo o padrão dos outros helpers de render do arquivo, injetando `isHandleAvailable` por prop ou por mock do módulo — o que for menos invasivo no arquivo como ele está hoje. **Não** troque o mecanismo de mock que o arquivo já usa.

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx vitest run src/app/auth/AuthPages.spec.tsx
```

Esperado: FAIL — não existe label "nome de usuário" nem feedback de disponibilidade.

- [ ] **Step 4: Reescrever a `UsernameOnboardingPage`**

Em `src/app/auth/AuthPages.tsx`, substituir a `UsernameOnboardingPage` por:

```tsx
export function UsernameOnboardingPage() {
  const { completeUsername } = useAuthSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const navigate = useNavigate();
  const location = useLocation();
  const handle = normalizeHandle(value);
  const formatError = value ? validateHandle(value) : null;

  useEffect(() => {
    if (!handle || validateHandle(handle) !== null) {
      setAvailability('idle');
      return;
    }
    let cancelled = false;
    setAvailability('checking');
    const timer = setTimeout(() => {
      playerCloudService
        .isHandleAvailable(handle)
        .then((free) => {
          if (!cancelled) setAvailability(free ? 'free' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setAvailability('idle');
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  return (
    <form
      className="flex flex-col gap-3 max-w-sm mx-auto py-16 px-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const invalid = validateHandle(value);
        if (invalid) {
          setError(invalid);
          return;
        }
        setError(null);
        try {
          await completeUsername(handle);
          const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
          navigate(from ?? '/', { replace: true });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Nao foi possivel salvar o username.');
        }
      }}
    >
      <h2 className="text-xl font-black uppercase tracking-wider">Escolha seu nome de usuário</h2>
      <p className="text-xs text-base-content/60">
        É por ele que outras pessoas vão te encontrar e vincular às comunidades. Você pode mudar
        depois.
      </p>
      <label htmlFor="username" className="text-xs font-bold uppercase">
        Nome de usuário
      </label>
      <input
        id="username"
        className="input input-bordered"
        value={value}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {formatError ? (
        <p className="text-xs text-warning">{formatError}</p>
      ) : availability === 'checking' ? (
        <p className="text-xs text-base-content/60">Verificando…</p>
      ) : availability === 'taken' ? (
        <p className="text-xs text-error">@{handle} já está em uso.</p>
      ) : availability === 'free' ? (
        <p className="text-xs text-success">@{handle} está disponível.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={availability === 'taken'}>
        Continuar
      </button>
    </form>
  );
}
```

Imports novos no arquivo: `useEffect` de `react`, `normalizeHandle`/`validateHandle` de `@logic/handle`, e `playerCloudService` de `@infra/supabase/playerCloudService`.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run src/app/auth/AuthPages.spec.tsx
```

Esperado: PASS.

- [ ] **Step 6: Prova de mutação**

Remova o `if (invalid) { setError(invalid); return; }` do submit e confirme que o teste `recusa formato inválido sem chamar o servidor` FALHA. Restaure. Relate a saída literal.

- [ ] **Step 7: Verificar e commitar**

```bash
npm run lint && npx vitest run && npx eslint src 2>&1 | tail -2
```

```bash
npx prettier@3.8.4 --check src/infra/supabase/playerCloudService.ts src/app/auth/AuthPages.tsx src/app/auth/AuthPages.spec.tsx
```

```bash
git add src/infra src/app && git commit -m "feat(handle): cadastro verifica disponibilidade do nome de usuario"
```

---

## Task 6: Trocar o nome de usuário em `/perfil`

**Files:**
- Modify: `src/app/routes/globalRoutes.tsx`
- Modify: `src/app/AppRouter.spec.tsx`

**Interfaces:**
- Consumes: `validateHandle`, `normalizeHandle` (Task 1); `playerCloudService.isHandleAvailable` (Task 5); `completeUsername` de `useAuthSession` (já existe e já persiste o handle — é o mesmo caminho do cadastro).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Escrever a spec que falha**

Em `src/app/AppRouter.spec.tsx`, no `describe` de rotas globais:

```tsx
  it('mostra o nome de usuário atual em /perfil', async () => {
    renderApp('/perfil');
    expect(await screen.findByText(/@ana/i)).toBeTruthy();
  });
```

> `readyState` já traz `username: 'ana'` na conta (`AppRouter.spec.tsx`, objeto `readyState`), então não precisa semear nada.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/app/AppRouter.spec.tsx
```

Esperado: FAIL — `/perfil` hoje mostra só o `SettingsModule` (backup/import).

- [ ] **Step 3: Implementar o bloco de handle em `/perfil`**

Em `src/app/routes/globalRoutes.tsx`, no `PerfilRoute`, renderizar o bloco antes do `SettingsModule`:

```tsx
export function PerfilRoute() {
  const shell = useShell();
  const { account } = useAuthSession();
  const [editing, setEditing] = useState(false);
  const current = account?.username ?? null;

  return (
    <div className="space-y-6">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-2">
          <h2 className="text-base font-black uppercase tracking-tight">Nome de usuário</h2>
          {current ? (
            <p className="text-sm text-base-content/70">@{current}</p>
          ) : (
            <p className="text-sm text-base-content/60">Você ainda não escolheu um.</p>
          )}
          <p className="text-xs text-base-content/60">
            É por ele que outras pessoas te encontram. Ao trocar, o nome antigo fica livre para
            outra pessoa.
          </p>
          <div className="card-actions">
            <button type="button" className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancelar' : 'Trocar'}
            </button>
          </div>
          {editing && <HandleChangeForm onDone={() => setEditing(false)} />}
        </div>
      </div>
      <SettingsModule
        onExportBackup={shell.handleExportBackup}
        onImportBackup={shell.handleImportBackup}
        onRestoreDemoPlayers={shell.play.handleRestoreDemoPlayers}
      />
    </div>
  );
}
```

> **Por que `useAuthSession()` e não o `ShellApi`:** o `useAuth()` que o shell expõe deriva `profile` de `auth.account?.profile` ([useAuth.ts:8](src/hooks/useAuth.ts:8)) e **não repassa o `username`** — ele é irmão de `profile` dentro de `account`, não filho. Então o handle não está disponível via `shell.auth`. `useAuthSession()` devolve `account` inteiro e já é usado nesse arquivo pelo `HandleChangeForm`. Não acrescente campo ao `ShellApi` só para isso.

O formulário, no mesmo arquivo (é componente, então pode viver num módulo de rotas):

```tsx
function HandleChangeForm({ onDone }: { onDone: () => void }) {
  const { completeUsername } = useAuthSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const handle = normalizeHandle(value);

  useEffect(() => {
    if (!handle || validateHandle(handle) !== null) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      playerCloudService
        .isHandleAvailable(handle)
        .then((free) => {
          if (!cancelled) setAvailable(free);
        })
        .catch(() => {
          if (!cancelled) setAvailable(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  return (
    <form
      className="flex flex-col gap-2 pt-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const invalid = validateHandle(value);
        if (invalid) {
          setError(invalid);
          return;
        }
        try {
          await completeUsername(handle);
          onDone();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível trocar.');
        }
      }}
    >
      <input
        aria-label="Novo nome de usuário"
        className="input input-bordered input-sm"
        value={value}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {available === false && <p className="text-xs text-error">@{handle} já está em uso.</p>}
      {available === true && <p className="text-xs text-success">@{handle} está disponível.</p>}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-sm" disabled={available === false}>
        Salvar
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/app/AppRouter.spec.tsx
```

Esperado: PASS.

- [ ] **Step 5: Prova de mutação**

Remova o `<p>@{current}</p>` e confirme que o teste `mostra o nome de usuário atual` FALHA. Restaure. Relate a saída literal.

- [ ] **Step 6: Gate completo e commit**

```bash
npm run lint && npm run test:unit && npx vitest run && npx eslint src 2>&1 | tail -2 && npm run build
```

Esperado: `tsc` limpo; unit e UI sem falhas e acima do baseline; eslint 0 errors em `src`; build ✓.

```bash
npx prettier@3.8.4 --check src/app/routes/globalRoutes.tsx src/app/AppRouter.spec.tsx
```

```bash
git add src/app && git commit -m "feat(handle): trocar nome de usuario pelo perfil"
```

```bash
git log origin/main..HEAD --oneline
```

---

## Gates da Fase 4A

- [ ] Atleta criado por moderador nasce **sem** handle; `players.id` continua endereçando ele na URL.
- [ ] Renomear um atleta **não** altera o handle de ninguém.
- [ ] `/comunidades/:id/pessoas/editar-atleta/<handle>` e `.../<id>` abrem o mesmo atleta; um handle igual ao id de outra pessoa não sequestra a URL dela.
- [ ] Cadastro recusa formato inválido sem ir ao servidor e avisa "já está em uso" antes do submit.
- [ ] `/perfil` mostra o handle atual e permite trocar, deixando claro que o antigo fica livre.
- [ ] `typecheck → eslint src → test:unit → test:ui → build` verdes.
- [ ] Migration escrita e testada, **não aplicada** — aplicação é decisão humana.

## Fora de escopo (vai para o Plano 4B — handle de comunidade)

- Coluna `slug`/handle em `communities`, com unique index e constraint de formato espelhando `players`.
- UI de reivindicar/trocar o handle da comunidade nas configurações, com o nome como sugestão pré-preenchida.
- `/comunidades/<handle>` resolvendo handle-ou-id, e emissão do handle nas superfícies compartilháveis (lista, sidebar).
- Sync do handle de comunidade entre local e nuvem.

## Dívida conhecida que este plano NÃO resolve

- `AthleteUsernameSearch` continua buscando só por handle exato. Com atletas sem conta perdendo o handle, a busca por eles deixa de funcionar — o vínculo desses atletas passa a depender do painel de membros da comunidade. Se isso incomodar na prática, o caminho é uma busca por nome, que é feature nova.
- `playerCloudService` tem lógica de retry com sufixo em colisão de username (linhas ~115-123 e ~179), escrita para o mundo do handle derivado. Com handle escolhido pela pessoa e único por construção, esse caminho vira raro; não foi removido para não misturar refactor com feature.
