# Plano 5 — Fase 4 (Slugs de Comunidade + Username Mutável) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Dar a cada comunidade um slug derivado do nome (`/comunidades/inimigos-do-voleibol`) e tornar o username do atleta mutável no rename — ambos regeneram quando o nome muda, ambos liberam o handle antigo para reivindicação imediata por outro ente, sem tabela de histórico/alias. O `id` (comunidade) e o `players.id` (atleta) continuam estáveis; slug/username são cosméticos de URL.

**Architecture:** O resolvedor de rota (`resolveCommunityRoute` + `CommunityShell`) passa a aceitar slug **ou** id num único slot `:communityId`; o slug é apenas uma forma legível do id no mesmo caminho. A camada de domínio ganha `src/logic/communitySlug.ts` espelhando `src/logic/username.ts`; a camada de storage (local + Supabase) ganha coluna `slug` com `UNIQUE` e backfill; os pontos de nascimento/renomeação geram/regeneram o handle. Mudança de URL é incremental: emito slug nas superfícies compartilháveis (lista de comunidades, sidebar, seleção); navegações internas profundas (detalhe de sessão, editar-atleta) continuam keyed em id, que continua resolvendo para sempre. Sem big-bang de contrato.

**Tech Stack:** React 19, react-router 7.17, TypeScript (`strictNullChecks`, sem `strict`), Vite 6, Vitest + jsdom + RTL (`.spec.tsx`), runner nativo do Node + tsx (`.test.ts`), Supabase (Postgres + RLS + RPCs).

## Global Constraints

- Node ≥ 20 (22 recomendado). `nvm use` antes de qualquer comando se algo falhar.
- Prettier: aspas simples, largura 100 (`.prettierrc`). **Validar formato só nos arquivos que você tocou:** `npx prettier@3.8.4 --check <arquivos>` — `npm run format:check` acusa arquivos por `core.autocrlf` e o ruído esconde o erro real (memória `prettier-version-mismatch`).
- **Sem comentários no código-fonte, exceto onde este plano mostra o comentário explicitamente.**
- Idioma da UI é pt-BR: labels, toasts, erros e campos de domínio.
- Imports usam aliases (`@app`, `@domain`, `@logic`, `@shared/types`, …), nunca caminhos relativos profundos.
- Dois runners de teste, separados por glob: `.test.ts` → lógica pura, runner do Node, zero DOM. `.spec.tsx` → UI, Vitest + jsdom + RTL.
- Ordem de verificação do CI: `typecheck → lint:eslint → format:check → test → build`. `lint:eslint` tem ~347 warnings pré-existentes; **corrigir só erros**.
- `python` não existe neste ambiente. Heredoc do PowerShell quebra com aspas: commit multi-linha via `git commit -F <arquivo>` (memória `volley-ambiente-armadilhas`).
- Baseline no início do plano: 763 testes unit, 175 UI, `typecheck` e `build` verdes (pós Fase 3, commit `1bb3510`). Nenhuma tarefa pode reduzir esses números.
- Branch de trabalho: `worktree-plano-5-fase-4-slugs`. Commit por tarefa. Antes de encerrar qualquer sessão: `git log origin/main..HEAD` — trabalho local não pushado já se perdeu três vezes neste projeto (memória).
- **Toda mudança de causa sem um teste que a reproduza é armadilha** (memória `plans-followed-literally`, `volley-ambiente-armadilhas`): não afirmar que algo funciona sem o teste que prova.

## Decisões de produto fechadas (não reabrir)

1. **Slug mutável, sem grace.** Rename do nome regenera o slug. O slug antigo libera no instante do rename; outro ente pode reivindicar primeiro. Sem tabela `community_slug_history`. Um link antigo depois do rename: 404/redirect honesto pra lista (ninguém reclamou) ou vai pro novo dono se reclamado. Não há mentira de continuidade.
2. **Homônimo não herda.** Comunidade B que reivindica o slug antes liberado por A (mesmo nome) é outro `id`, dados próprios. Jamais puxa histórico de A.
3. **Username do atleta também mutável.** Inverte a invariant "handles estáveis" (`username.ts:62`, já ships em produção). Rename do atleta regenera username; `players.id` é a identidade estável. Referências externas amarradas a username quebram no rename, mesma lógica honesta do slug. Guests e nomes em branco continuam sem handle (guards `username.ts:61,63` sobrevivem).
4. **Blacklist de segmentos reservados na validação.** `generateCommunitySlug` rejeita 9 literais que colidem com filhos da rota: `pessoas, sessoes, desempenho, gestao, nova, ativa, torneios, editar-atleta, novo` — cai pro sufixo `-2` (que não colide com nada, pois `sessoes-2` não é segmento de rota). **Username do atleta NÃO usa blacklist**: é handle global keyed em `players.id`, não vive em `/comunidades/:username`, não colide com rota de comunidade.
5. **Resolução slug-ou-id, sem big-bang.** `resolveCommunityRoute` e `CommunityShell` aceitam ambos; URLs baseadas em id funcionam para sempre. Slug é emitido nas superfícies compartilháveis; id permanence nas navegações internas.

## Desvios deliberados

Ambos produzem **menos** código que a alternativa. Estão aqui para o executor não achar que é descuido:

1. **Sem redirect 301 / sem alias.** SPA sem server, `Navigate replace` reescreve URL; mas como slug é mutável sem grace, nem isso é necessário — link antigo simplesmente para de resolver. Mais accurado; YAGNI.
2. **`resolveUsername` mantém a assinatura e ganha 1 parâmetro opcional** (`force?: boolean`) em vez de um novo `mode` union. Menor superfície; a invariant antiga vira o default (`force` omitido) e o caso de rename passa `force: true`.
3. **Slugs em rotas filhas não mudam nesta fase.** Apenas o slot `:communityId` vira resolvível por slug. Rotas internas (`/comunidades/:id/sessoes/:id`) seguem keyed em id; visíveis só nas shareable surfaces.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/logic/communitySlug.ts` | `slugify` (reexporta de `username.ts`), `generateCommunitySlug`, `resolveCommunitySlug`, `RESERVED_COMMUNITY_SLUGS`. Espelho de `username.ts`. |
| `src/logic/communitySlug.test.ts` | Testes do acima (runner do Node). |
| `supabase/migrations/20260814120000_community_slug.sql` | `alter table communities add column slug text`; unique index `lower(slug)`; backfill `do$$` espelhando `20260610161256`; RPC `find_community_by_slug`. |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/shared/types/community.ts` | Adiciona `slug?: string` em `interface Community`. |
| `src/logic/username.ts` | `resolveUsername` ganha `force?: boolean`; quando `true` e `nome` é slug-ável, regenera (ignora o `username` existente). Guests/blank permanecem. |
| `src/logic/username.test.ts` | Atualiza o teste da invariant (linha 43): agora `force: true` regenera `Renamed` → `renamed`; mantém o caso sem `force` estável. |
| `src/application/localCommunityUseCases.ts` | `createLocalCommunity` estampa `slug` via `resolveCommunitySlug`; `applyLocalCommunityUpdate` regenera `slug` quando `patch.name` difere de `current.name`. |
| `src/application/localPlayerUseCases.ts` | `applyLocalPlayerSave` passa `force` ao `resolveUsername` quando o nome mudou (detecta `patch.nome !== current.nome`); `taken` exclui `current.username` (libera o handle velho). |
| `src/application/appRoutes.ts` | `resolveCommunityRoute` resolve por `id` **ou** `slug`; novo helper `resolveCommunityIdFromParam` traduz slug→id. `extractCommunityId` continua extração pura. |
| `src/application/appRoutes.test.ts` | Testes de resolução slug-ou-id e do novo helper. |
| `src/app/routes/communityRoutes.tsx` | `CommunityShell` resolve param (slug ou id) → `Community` via novo helper. |
| `src/app/routes/communitiesContract.ts` | `onSelectCommunity` e links de UI emitem `slug ?? id` em `paths.comunidade(...)`. |
| `src/application/appRoutes.ts` (`getShellNavigationItems`) | Sidebar dentro de comunidade: `to` usa `community.slug ?? community.id`. |

## Escopo minimizável (ponytail)

Se o tempo apertar, a ordem de entrega de valor é:
1. **Username mutável** (Task 2–3: menor diff, isolado). Ship sozinho se preciso.
2. **Slug de comunidade com persistência local + resolução** (Task 1, 4–6: sem Supabase). Testável CLI.
3. **Migration Supabase + RPC + sync** (Task 7–8: produção cloud).

Cada um é atômico e verde por si. Nenhuma tarefa abaixo pressupõe a próxima pra typecheckar.

---

## Task 1: `communitySlug.ts` (camada pura)

**Files:**
- Create: `src/logic/communitySlug.ts`
- Create: `src/logic/communitySlug.test.ts`

**Interfaces:**
- Produces: `slugify` (reexporta), `generateCommunitySlug(name, taken)`, `resolveCommunitySlug(community, takenSlugs, force?)`, `RESERVED_COMMUNITY_SLUGS: Set<string>`.
- **Rung 2 da escada:** `slugify` já existe em `username.ts:16` — reexportar, não duplicar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/logic/communitySlug.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCommunitySlug, resolveCommunitySlug, RESERVED_COMMUNITY_SLUGS } from './communitySlug';

test('RESERVED_COMMUNITY_SLUGS lista os 9 segmentos que colidem com a rota', () => {
  assert.deepEqual(
    [...RESERVED_COMMUNITY_SLUGS].sort(),
    ['ativa', 'desempenho', 'editar-atleta', 'gestao', 'nova', 'novo', 'pessoas', 'sessoes', 'torneios'],
  );
});

test('generateCommunitySlug deriva do nome e sufixa colisoes', () => {
  const taken = new Set<string>();
  assert.equal(generateCommunitySlug('Inimigos do Voleibol', taken), 'inimigos-do-voleibol');
  assert.equal(generateCommunitySlug('Inimigos do Voleibol', taken), 'inimigos-do-voleibol-2');
});

test('generateCommunitySlug rejeita reservados caindo pro sufixo', () => {
  const taken = new Set<string>();
  assert.equal(generateCommunitySlug('Pessoas', taken), 'pessoas-2');
  assert.equal(generateCommunitySlug('Sessoes', new Set<string>()), 'sessoes-2');
});

test('generateCommunitySlug cai pro fallback quando o nome nao gera slug', () => {
  assert.equal(generateCommunitySlug('!!!', new Set<string>()), 'comunidade');
  assert.equal(generateCommunitySlug('---', new Set<string>()), 'comunidade-2');
});

test('resolveCommunitySlug mantem slug estavel por default e regenera com force', () => {
  const taken: string[] = [];
  assert.equal(
    resolveCommunitySlug({ name: 'Inimigos', slug: 'inimigos-do-voleibol' }, taken),
    'inimigos-do-voleibol',
  );
  assert.equal(
    resolveCommunitySlug({ name: 'Inimigos do Vôlei', slug: 'inimigos-do-voleibol' }, taken, true),
    'inimigos-do-volei',
  );
  assert.equal(resolveCommunitySlug({ name: '   ' }, taken), undefined);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/logic/communitySlug.test.ts
```

Esperado: FAIL — `Cannot find module './communitySlug'`.

- [ ] **Step 3: Implementar `communitySlug.ts`**

```ts
import { slugify } from './username';

export const RESERVED_COMMUNITY_SLUGS = new Set<string>([
  'pessoas',
  'sessoes',
  'desempenho',
  'gestao',
  'nova',
  'ativa',
  'torneios',
  'editar-atleta',
  'novo',
]);

const FALLBACK_SLUG = 'comunidade';

export function generateCommunitySlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || FALLBACK_SLUG;
  let suffix = 0;
  let candidate = base;
  while (taken.has(candidate) || RESERVED_COMMUNITY_SLUGS.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

export function resolveCommunitySlug(
  community: { name: string; slug?: string },
  takenSlugs: Iterable<string>,
  force = false,
): string | undefined {
  if (!force && community.slug) return community.slug;
  if (!slugify(community.name)) return undefined;
  return generateCommunitySlug(community.name, new Set(takenSlugs));
}
```

> A checagem de reservados **dentro** do loop cobre o caso em que o base já é reservado (`sessoes`) e também o sufixo cair num reservado. `taken.add` ao final mantém unicidade entre gerações consecutivas.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/logic/communitySlug.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Formatar e commitar**

```bash
npx prettier@3.8.4 --check src/logic/communitySlug.ts src/logic/communitySlug.test.ts && git add src/logic/communitySlug.ts src/logic/communitySlug.test.ts && git commit -m "plano-5 fase 4: camada pura de slug de comunidade"
```

---

## Task 2: Username mutável (`force` em `resolveUsername`)

**Files:**
- Modify: `src/logic/username.ts`
- Modify: `src/logic/username.test.ts`

- [ ] **Step 1: Atualizar o teste da invariant e adicionar casos de force**

Em `src/logic/username.test.ts`, substituir o teste `resolveUsername keeps an existing handle and skips guests/blank names` por dois:

```ts
test('resolveUsername mantem handle estavel por default', () => {
  assert.equal(resolveUsername({ nome: 'Renamed', username: 'carol-mendes' }, []), 'carol-mendes');
  assert.equal(resolveUsername({ nome: 'Lucca', isGuest: true }, []), undefined);
  assert.equal(resolveUsername({ nome: '   ' }, []), undefined);
});

test('resolveUsername regenera o handle com force: true', () => {
  assert.equal(resolveUsername({ nome: 'Carol Mendes', username: 'carol-mendes' }, [], true), 'carol-mendes');
  assert.equal(resolveUsername({ nome: 'Renamed', username: 'carol-mendes' }, [], true), 'renamed');
  assert.equal(resolveUsername({ nome: 'Lucca', isGuest: true, username: 'lucca' }, [], true), 'lucca');
  assert.equal(resolveUsername({ nome: '   ', username: 'x' }, [], true), undefined);
});
```

> **Decisão:** username do atleta é handle global keyed em `players.id`, **não** vive em `/comunidades/:username`, não colide com rota. **Username NÃO usa blacklist.** `generateUsername` fica como está.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
node --import tsx --test src/logic/username.test.ts
```

Esperado: FAIL no novo teste (regenera com force).

- [ ] **Step 3: Implementar `force` em `resolveUsername`**

Em `src/logic/username.ts`, alterar linhas 57-65:

```ts
export function resolveUsername(
  athlete: { nome: string; isGuest?: boolean; username?: string },
  takenUsernames: Iterable<string>,
  force = false,
): string | undefined {
  if (athlete.isGuest) return athlete.username;
  if (!force && athlete.username) return athlete.username;
  if (!slugify(athlete.nome)) return undefined;
  return generateUsername(athlete.nome, new Set(takenUsernames));
}
```

> Guest antes do guard de force: guest é sempre estável, mesmo renomeando. Blank com `force` → `undefined`. Nome slug-ável com `force` → `generateUsername`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
node --import tsx --test src/logic/username.test.ts
```

Esperado: PASS, todos (7 testes).

- [ ] **Step 5: Suite + commitar**

```bash
npm run lint && npm run test:unit
```

```bash
npx prettier@3.8.4 --check src/logic/username.ts src/logic/username.test.ts && git add src/logic/username.ts src/logic/username.test.ts && git commit -m "plano-5 fase 4: regenera username do atleta no rename (force)"
```

---

## Task 3: Propagar `force` para o caller de rename do atleta

**Files:**
- Modify: `src/application/localPlayerUseCases.ts` (caller `applyLocalPlayerSave:126`)
- Modify: testes relevantes
- **Não mexer:** `src/app/AppShell.tsx:358` — é criação (`createPlayerForCommunity`), não rename, não ganha `force`.

- [ ] **Step 1: Escrever/atualizar o teste que falha** — em `src/application/localPlayerUseCases.test.ts`: "renomear atleta regenera username; guarda `players.id` estável; libera o username antigo do `taken`".

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Propagar force em `applyLocalPlayerSave`** — quando `input.patch.nome` difere de `current.nome` (byte-by-byte), passar `force: true` para `resolveUsername`. **Crítico:** o `taken` set deve **excluir** `current.username` do próprio atleta — o handle velho está sendo liberado, senão o novo slug colide com o antigo e sufixa desnecessariamente. Replicar a lógica do caller em `AppShell.tsx` (exclui `p.username`); aqui remover `current.username` do set antes de passar.

- [ ] **Step 4: Rodar e confirmar que passa**

- [ ] **Step 5: Suite + commitar**

```bash
npm run lint && npm run test:unit && npm run test:ui
```

```bash
git add src/application/localPlayerUseCases.ts src/application/localPlayerUseCases.test.ts && git commit -m "plano-5 fase 4: rename de atleta regenera username"
```

---

## Task 4: Estampar `slug` em `Community` (local)

**Files:**
- Modify: `src/shared/types/community.ts`
- Modify: `src/application/localCommunityUseCases.ts`
- Modify: `src/logic/migrations.ts` (`normalizeCommunity:123` — backfill de slug em load, idempotente)
- Modify: testes

- [ ] **Step 1: Adicionar `slug?: string` em `interface Community`** (`community.ts`, depois de `name`).

- [ ] **Step 2: Teste que falha** — `localCommunityUseCases.test.ts`: criar comunidade estampa slug; renomear regenera slug diferente e libera o antigo.

- [ ] **Step 3: `createLocalCommunity` estampa slug**
  - `slug = resolveCommunitySlug({ name }, takenSlugs)` onde `takenSlugs` = slugs não-nulos das `input.communities`.
  - Incluir `slug` no objeto criado.

- [ ] **Step 4: `applyLocalCommunityUpdate` regenera slug no rename**
  - Após o `errors.name` check, se `input.patch.name` !== `current.name`:
    - `slug = resolveCommunitySlug({ name: input.patch.name }, takenSlugsExcluindo(current))`
    - `taken` exclui `current.slug` (libera handle velho).
  - Spread `{ ...community, ...input.patch, slug, syncStatus: 'pending', updatedAt }`.

- [ ] **Step 5: `normalizeCommunity` backfilla slug legado**
  - Se `community.slug` undefined, gerar. Idempotente: se tem slug, manter. Determinístico (ordem `createdAt`); acumulador de `taken` passado pra `normalizeCommunities` pra não colidir entre si.

> **Cuidado:** `normalizeCommunities` roda a cada load. Backfill idempotente é obrigatório. Mesma entrada → mesmo slug.

- [ ] **Step 6: Rodar testes, suite, commitar**

```bash
npm run lint && npm run test:unit && npm run test:ui
```

```bash
git add src/shared/types/community.ts src/application/localCommunityUseCases.ts src/logic/migrations.ts src/application/localCommunityUseCases.test.ts && git commit -m "plano-5 fase 4: slug de comunidade no nascimento/renomeacao (local)"
```

---

## Task 5: Resolução slug-ou-id no roteamento

**Files:**
- Modify: `src/application/appRoutes.ts`
- Modify: `src/application/appRoutes.test.ts`
- Modify: `src/app/routes/communityRoutes.tsx`

- [ ] **Step 1: Teste que falha** — `appRoutes.test.ts`:

```ts
test('resolveCommunityRoute aceita slug ou id', () => {
  const communities = [{ id: 'c1', slug: 'inimigos-do-voleibol' }];
  assert.deepEqual(resolveCommunityRoute({ communityId: 'inimigos-do-voleibol', communities }), { kind: 'ok' });
  assert.deepEqual(resolveCommunityRoute({ communityId: 'c1', communities }), { kind: 'ok' });
  assert.deepEqual(resolveCommunityRoute({ communityId: 'inexistente', communities }), { kind: 'redirect', to: '/comunidades' });
  assert.equal(resolveCommunityIdFromParam('inimigos-do-voleibol', communities), 'c1');
  assert.equal(resolveCommunityIdFromParam('c1', communities), 'c1');
  assert.equal(resolveCommunityIdFromParam('zzz', communities), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

- [ ] **Step 3: Implementar**

```ts
export function resolveCommunityIdFromParam(
  param: string,
  communities: Pick<Community, 'id' | 'slug'>[],
): string | null {
  const byId = communities.find((c) => c.id === param);
  if (byId) return byId.id;
  const bySlug = communities.find((c) => c.slug === param);
  return bySlug ? bySlug.id : null;
}

export function resolveCommunityRoute(input: {
  communityId?: string;
  communities: Pick<Community, 'id' | 'slug'>[];
}): RouteResolution {
  if (input.communityId && resolveCommunityIdFromParam(input.communityId, input.communities))
    return { kind: 'ok' };
  return { kind: 'redirect', to: paths.comunidades };
}
```

> **Breakage audit (gargalo real):** assinatura de `resolveCommunityRoute` muda de `{ communityId, communityIds }` para `{ communityId, communities }`. **Antes de editar**, rodar `grep -rn "resolveCommunityRoute"` e atualizar **todos** os call sites (não só o do `CommunityShell`). Cada caller passa `shell.comm.communities.map((c) => ({ id: c.id, slug: c.slug }))`. Isso é o custo do root-cause fix — não corrigir só o path do ticket e deixar os irmãos quebrados.

- [ ] **Step 4: `CommunityShell` usa o resolvedor** — no lugar do `find((item) => item.id === communityId)`, usar `resolveCommunityIdFromParam(communityId, comm.communities)` e depois `find` por id real.

- [ ] **Step 5: Rodar, suite, commitar**

```bash
npx vitest run src/app/AppRouter.spec.tsx && npm run lint && npm run test:unit
```

```bash
git add src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/routes/communityRoutes.tsx && git commit -m "plano-5 fase 4: resolveCommunityRoute aceita slug ou id"
```

---

## Task 6: Emitir slug nas superfícies compartilháveis

**Files:**
- Modify: `src/app/routes/communitiesContract.ts` (`onSelectCommunity` e afins) — `paths.comunidade(slug ?? id)`.
- Modify: `src/application/appRoutes.ts` (`getShellNavigationItems`).
- Modify: specs correspondentes.

> **Cuidado de desenho:** `getShellNavigationItems` hoje extrai o `communityId` bruto do `pathname` (slug ou id). Para montar os itens de sidebar **dentro** de uma comunidade, precisa do objeto community resolvido. Menor diff: passar `communities` no input do helper (novo parâmetro) e resolver antes. O resolvedor é barato.

- [ ] **Step 1: Spec que falha** — sidebar dentro de comunidade monta link com slug: `/comunidades/inimigos-do-voleibol` (não `/comunidades/c1`).

- [ ] **Step 2: Rodar, confirmar falha**

- [ ] **Step 3: Trocar `paths.comunidade(id)` por `paths.comunidade(slug ?? id)`** nas superfícies de share. Ponto onde a URL visível muda. **Mantenha id** em:
> - `paths.sessao(communityId, sessionId)`, `paths.atleta(communityId, playerId)` — navegações internas, id continua (resolvível pra sempre).
> - Só `paths.comunidade(...)` (visit/share) e o link ativo da sidebar ganham slug.

- [ ] **Step 4: Rodar, suite, commitar**

```bash
npm run lint && npm run test:ui && npm run build
```

```bash
git add src/app/routes/communitiesContract.ts src/application/appRoutes.ts src/app/AppRouter.spec.tsx && git commit -m "plano-5 fase 4: emite slug nas superficies compartilháveis (sidebar, lista)"
```

---

## Task 7: Persistência Supabase — coluna `slug`, unique, backfill, RPC

**Files:**
- Create: `supabase/migrations/20260814120000_community_slug.sql`

Espelha `supabase/migrations/20260610161256_global_athlete_identity.sql` (player username).

- [ ] **Step 1: Migration**

```sql
alter table public.communities add column if not exists slug text;

create unique index if not exists communities_slug_lower_idx
  on public.communities (lower(slug))
  where slug is not null;
```

- [ ] **Step 2: Backfill `do$$`** — iterar `communities` ordenado por `created_at, id`, slug-ificar `name` via `translate()` de accents (igual ao molde de atleta), de-dup com `-2/-3`, respeitando a blacklist de 9 reservados. Set `slug`. Idempotente (`where slug is null`).

- [ ] **Step 3: RPC `find_community_by_slug`** espelhando `find_player_by_username` — lookup `lower(slug)` → `id`. `SECURITY DEFINER`, `set search_path = public`.

- [ ] **Step 4: RLS** — `grant select` de `communities` já existe; `slug` visível na mesma superfície que `name`. Nenhuma política nova se `slug` é coluna pública.

- [ ] **Step 5: Aplicar** — `mcp__supabase__apply_migration` (ou CLI local). Rodar `get_advisors` (security) após.

- [ ] **Step 6: Commitar**

```bash
git add supabase/migrations/20260814120000_community_slug.sql && git commit -m "plano-5 fase 4: migration slug de comunidade (coluna, unique, backfill, rpc)"
```

---

## Task 8: Sync cloud de slug

**Files:**
- Modify: `src/infra/supabase/` (community service + `syncService.ts`) — incluir `slug` no upsert/mapeamento local↔cloud.

> **Não supor; ler antes de editar.** Ler `syncService.ts` e o community service para achar o ponto de mapeamento. Mínimo: mapear `Community.slug <-> communities.slug`. Commit.

- [ ] Mapear `slug` no `communityService` (upsert/select).

- [ ] Mapear `slug` no `syncService` (push/pull).

- [ ] Teste de sync (se houver harness).

- [ ] Commitar.

---

## Task 9: Sanity final + cutover

- [ ] **CI order:** `typecheck → lint:eslint → format:check → test → build`. Baseline: 763 unit / 175 UI.
- [ ] **Smoke manual:** renomear "Nova comunidade" → "Inimigos do Voleibol" localmente; URL da sidebar vira `/comunidades/inimigos-do-voleibol`; id não muda; dados permanecem; URL antiga `/comunidades/<id>` ainda resolve.
- [ ] **Regressão manual:** renomear "Carol Mendes" → "Carol Souza"; username vira `carol-souza`; `players.id` estável; lista de atletas não perde dados.
- [ ] **Commit/PR final.** Branch: `worktree-plano-5-fase-4-slugs`.

## Escada / YAGNI aplicado

- Sem tabela `community_slug_history` (grace). Add quando alguém reclamar que link antigo quebrou, com TTL.
- Username sem blacklist (não colide com rota de comunidade).
- `resolveUsername` com 1 param opcional em vez de `mode` union.
- Rotas filhas continuam keyed em id (não slug-ificadas nesta fase).
- Cada task atômicamente verde; ship incremental.

## Pendências fora do escopo desta fase

- Slug nas rotas filhas (`/comunidades/:slug/sessoes/:id`) — quando essa superfície virar compartilhável.
- Histórico/alias com TTL — se link-compartilhado-quebrado virar dor real.
- Username do atleta como URL pública (`/atletas/:username`) — hoje é id; fora desta fase.
