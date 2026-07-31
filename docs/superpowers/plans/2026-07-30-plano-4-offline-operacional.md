# Plano 4 — Offline operacional: posse da sessão e entrega confiável

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Spec:** `docs/superpowers/specs/2026-07-30-plano-4-offline-operacional-design.md`

**Objetivo:** Impedir que duas pessoas produzam placares concorrentes da mesma sessão, e
garantir que o que não subiu para a nuvem seja reenviado sozinho e fique visível.

**Arquitetura:** Dois mecanismos independentes. **Posse** vive no banco (só o servidor
enxerga os dois aparelhos) e é por **usuário**, não por dispositivo. **Entrega** vive no
cliente e reusa o `syncStatus` por entidade que já é a fila durável — o que falta é
detectar rede, reenviar sozinho e dizer a verdade na tela. Eles se cruzam num ponto só:
o sync verifica posse antes de subir.

**Tech stack:** TypeScript, React, Vite, Supabase (Postgres + RLS + RPC),
`node:test` + `tsx` para lógica pura, Vitest + Testing Library para hooks e componentes.

---

## Contexto do domínio (leia antes da Tarefa 1)

Se você nunca mexeu neste projeto, estes cinco fatos evitam 90% dos enganos:

1. **O app é local-first.** Tudo funciona a partir do `localStorage`. Nenhuma tela
   espera resposta de rede para funcionar. O sync é uma ação separada que reconcilia o
   payload inteiro de uma vez — não há escrita por operação.

2. **A fila de pendências já existe.** Toda entidade tem um campo `syncStatus`. Quando
   vale `'pending'`, significa "ainda não confirmado pela nuvem". Isso é persistido.
   **Você não vai criar uma fila** — vai fazer o que já está na fila ser reenviado.

3. **`PostgrestError` NÃO é uma instância de `Error`.** É um objeto simples com `code` e
   `message`. Escrever `error instanceof Error` descarta silenciosamente todo erro vindo
   do Supabase. Já aconteceu neste projeto. Sempre acesse os campos por
   `(error as { code?: string; message?: string })`.

4. **Ids locais x ids de nuvem.** Alguns campos (`point_events.game_id`,
   `teams.player_ids`) guardam ids **locais** em texto, únicos só por `(owner_id,
   local_id)`. Já causou vazamento de dados entre contas. **Neste plano você não mexe
   nisso** — `point_events.session_id` é `uuid` de verdade, pode comparar direto.

5. **Toda RPC nova segue o mesmo ritual de permissão**, nesta ordem:
   ```sql
   revoke execute on function public.nome(args) from public, anon;
   grant  execute on function public.nome(args) to authenticated;
   ```
   O Supabase concede `EXECUTE` a todo mundo por padrão. Se você só fizer `grant`, a
   função fica aberta para usuário anônimo.

---

## Restrições globais

Valem para **todas** as tarefas. Não repita a pergunta, siga.

- **Autoridade da sessão é por usuário**, nunca por dispositivo. `control_device_id`
  existe mas **nunca bloqueia** nada — só alimenta um aviso informativo.
- **Erro de rede nunca congela o reenvio.** Intervalo cresce até o teto de 15 minutos e
  fica lá. Só erro estrutural (`validation`, `authorization`, `conflict`) para o retry.
- **Nenhum descarte silencioso.** Nada de placar apagado, evento sumido ou erro engolido.
  Conflito preserva as duas versões.
- **`vpg_device_id` fica FORA de `STORAGE_KEYS`.** Essa lista é varrida por
  `clearLocalDomainCache` na troca de conta, e o aparelho não muda porque o usuário mudou.
- **Sem item novo na barra lateral.** A navegação definitiva é decisão do Plano 5.
- **Toda RPC:** `security definer`, `set search_path = public`, `revoke` antes do `grant`.
- **Textos em português com acentuação correta.** O projeto acabou de passar por uma
  correção de acentos e mojibake; não reintroduza `Nao foi possivel`.
- **Migrations vão para `supabase/migrations/` E para `supabase/migrations/schema.sql`.**
  O `schema.sql` é o retrato consolidado; se divergir, o teste de schema quebra.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/logic/connectivity.ts` | Decidir o estado de rede a partir de sinais. Funções puras. |
| `src/logic/connectivity.test.ts` | Testes da decisão de estado. |
| `src/logic/syncBackoff.ts` | Classificar erro de rede e calcular o próximo horário de tentativa. |
| `src/logic/syncBackoff.test.ts` | Testes de classificação e backoff. |
| `src/hooks/useConnectivity.ts` | Ligar o módulo puro aos eventos do browser. |
| `src/hooks/useConnectivity.spec.tsx` | Testes do hook. |
| `src/infra/supabase/sessionOwnershipCloudService.ts` | Chamar as RPCs de posse. |
| `src/application/sessionOwnershipUseCases.ts` | Regras de posse do lado do cliente. |
| `src/application/sessionOwnershipUseCases.test.ts` | Testes das regras. |
| `src/components/live/SessionOwnershipNotice.tsx` | Aviso de posse na tela de sessão. |
| `src/components/live/SessionOwnershipNotice.spec.tsx` | Testes do aviso. |
| `src/components/account/SyncConflictSection.tsx` | Seção de conflitos. |
| `src/components/account/SyncConflictSection.spec.tsx` | Testes da seção. |
| `supabase/migrations/20260731100000_session_ownership.sql` | Colunas + RPCs de posse. |

**Modificar:**

| Arquivo | O quê |
| --- | --- |
| `src/logic/syncIssueLedger.ts` | Campo `nextAttemptAt` em `SyncIssueEntry`. |
| `src/hooks/useCloudSync.ts` | Reenvio automático e classificação de erro. |
| `src/storage/localStorageRepository.ts` | Ler/gravar `vpg_device_id`. |
| `src/components/account/AccountSyncView.tsx` | Encaixar a seção de conflitos. |
| `src/App.tsx` | Ligar o indicador de pendente. |
| `src/application/appShellViewModel.ts` | Rótulo honesto do badge. |
| `src/infra/supabase/schema.test.ts` | Testes de schema da migration nova. |
| `supabase/migrations/schema.sql` | Espelhar a migration. |

---

## Tarefa 1: Módulo de conectividade

**Por que existe:** hoje o projeto não tem **nenhuma** detecção de rede — nem um
`navigator.onLine`. Sem saber que a rede voltou, não há como reenviar sozinho.

**A armadilha:** `navigator.onLine` mente. Ele responde `true` quando você está
conectado a um wi-fi que não tem internet — exatamente o caso do ginásio com roteador
sem link. Por isso ele é **pista, não veredito**: a autoridade é o resultado de uma
requisição de verdade.

**Arquivos:**
- Criar: `src/logic/connectivity.ts`
- Criar: `src/logic/connectivity.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: `type ConnectivityState = 'online' | 'offline' | 'unknown'` e
  `nextConnectivityState(input: { current: ConnectivityState; browserOnline: boolean; lastOutcome?: 'success' | 'network_failure' | null }): ConnectivityState`.
  A Tarefa 3 e a Tarefa 4 usam os dois.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/logic/connectivity.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextConnectivityState } from './connectivity';

test('uma requisicao bem-sucedida manda mais que o navigator.onLine', () => {
  // O caso do wi-fi sem internet ao contrario: o browser diz que caiu, mas a
  // requisicao passou. A requisicao e a verdade.
  assert.equal(
    nextConnectivityState({ current: 'offline', browserOnline: false, lastOutcome: 'success' }),
    'online',
  );
});

test('falha de rede vence o navigator.onLine otimista', () => {
  // Wi-fi de ginasio sem link: onLine=true, mas nada sai.
  assert.equal(
    nextConnectivityState({ current: 'online', browserOnline: true, lastOutcome: 'network_failure' }),
    'offline',
  );
});

test('sem resultado de requisicao, segue a pista do browser', () => {
  assert.equal(
    nextConnectivityState({ current: 'unknown', browserOnline: true, lastOutcome: null }),
    'online',
  );
  assert.equal(
    nextConnectivityState({ current: 'online', browserOnline: false, lastOutcome: null }),
    'offline',
  );
});

test('o estado inicial e desconhecido ate haver qualquer sinal', () => {
  assert.equal(
    nextConnectivityState({ current: 'unknown', browserOnline: false, lastOutcome: null }),
    'offline',
  );
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/logic/connectivity.test.ts
```

Esperado: FALHA com `Cannot find module './connectivity'`.

- [ ] **Passo 3: implementar**

Crie `src/logic/connectivity.ts`:

```ts
/**
 * Estado de rede do app.
 *
 * `navigator.onLine` responde `true` num wi-fi sem internet — o caso do ginasio com
 * roteador sem link. Por isso ele e PISTA, nao veredito: quem manda e o resultado de
 * uma requisicao de verdade. O evento do browser serve para ANTECIPAR uma tentativa,
 * nao para declarar o estado.
 */
export type ConnectivityState = 'online' | 'offline' | 'unknown';

export type RequestOutcome = 'success' | 'network_failure';

export function nextConnectivityState(input: {
  current: ConnectivityState;
  browserOnline: boolean;
  lastOutcome?: RequestOutcome | null;
}): ConnectivityState {
  if (input.lastOutcome === 'success') return 'online';
  if (input.lastOutcome === 'network_failure') return 'offline';
  return input.browserOnline ? 'online' : 'offline';
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx tsx --test src/logic/connectivity.test.ts
```

Esperado: `pass 4`, `fail 0`.

- [ ] **Passo 5: commit**

```bash
git add src/logic/connectivity.ts src/logic/connectivity.test.ts
git commit -m "feat(sync): add connectivity state decision"
```

---

## Tarefa 2: Classificação de erro de rede e backoff

**Por que existe:** duas coisas que hoje não existem e são pré-requisito do reenvio.

Primeiro, **classificação**. O `AppError` já tem a variante `offline_unavailable`, e
**ninguém no projeto a produz** — falha de rede hoje cai em `technical`, indistinguível
de "o servidor recusou". Sem separar as duas, o reenvio não sabe o que insistir.

Segundo, **backoff**. Reenviar num laço apertado vira tempestade de requisição.

**A decisão importante:** o spec base mandava congelar depois de 5 tentativas. Aqui isso
está **errado** e você não vai fazer. Congelar um sync de payload inteiro significa que
os dados **nunca sobem** — que é exatamente a falha que este plano conserta. Rede sempre
pode voltar; erro estrutural, não. Então: rede reenvia para sempre com intervalo até um
teto; estrutural para na hora.

**A armadilha:** `PostgrestError` **não** é `instanceof Error`. É objeto simples. Se você
testar por `instanceof`, todo erro do Supabase escapa da classificação.

**Arquivos:**
- Criar: `src/logic/syncBackoff.ts`
- Criar: `src/logic/syncBackoff.test.ts`

**Interfaces:**
- Consome: `AppError['kind']` de `src/application/appResult.ts`.
- Produz: `classifySyncError(error: unknown): AppError['kind']` e
  `computeNextAttemptAt(input: { count: number; lastSeenAt: string; kind: AppError['kind'] }): string | undefined`.
  A Tarefa 3 grava o resultado; a Tarefa 4 lê.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/logic/syncBackoff.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySyncError, computeNextAttemptAt, RETRY_INTERVALS_MS } from './syncBackoff';

test('classifica falha de fetch como offline_unavailable', () => {
  // Chrome/Firefox usam "Failed to fetch"; Safari usa "Load failed".
  assert.equal(classifySyncError(new TypeError('Failed to fetch')), 'offline_unavailable');
  assert.equal(classifySyncError(new TypeError('NetworkError when attempting to fetch')), 'offline_unavailable');
  assert.equal(classifySyncError(new TypeError('Load failed')), 'offline_unavailable');
});

test('classifica PostgrestError sem usar instanceof', () => {
  // PostgrestError e objeto simples, NAO instancia de Error. Testar por instanceof
  // descartaria todo erro vindo do Supabase — ja aconteceu neste projeto.
  const permissao = { code: '42501', message: 'permission denied' };
  assert.equal(classifySyncError(permissao), 'authorization');

  const dadoInvalido = { code: '22023', message: 'Ja e membro' };
  assert.equal(classifySyncError(dadoInvalido), 'validation');

  const conflito = { code: '23505', message: 'duplicate key' };
  assert.equal(classifySyncError(conflito), 'conflict');
});

test('o que nao reconhece vira technical, nao offline', () => {
  // Chutar "offline" para erro desconhecido faria o app insistir para sempre num
  // erro que nunca vai passar.
  assert.equal(classifySyncError(new Error('boom')), 'technical');
  assert.equal(classifySyncError({ code: '42P01', message: 'relation does not exist' }), 'technical');
});

test('erro de rede sempre tem proxima tentativa, mesmo depois de muitas falhas', () => {
  const base = '2026-07-31T12:00:00.000Z';
  const depoisDe50 = computeNextAttemptAt({ count: 50, lastSeenAt: base, kind: 'offline_unavailable' });
  assert.ok(depoisDe50, 'erro de rede nunca pode congelar');
  // Depois do teto, o intervalo para de crescer e fica no ultimo.
  const teto = RETRY_INTERVALS_MS[RETRY_INTERVALS_MS.length - 1];
  assert.equal(new Date(depoisDe50!).getTime() - new Date(base).getTime(), teto);
});

test('o intervalo cresce a cada falha ate o teto', () => {
  const base = '2026-07-31T12:00:00.000Z';
  const delta = (count: number) =>
    new Date(computeNextAttemptAt({ count, lastSeenAt: base, kind: 'technical' })!).getTime() -
    new Date(base).getTime();
  assert.equal(delta(1), RETRY_INTERVALS_MS[0]);
  assert.equal(delta(2), RETRY_INTERVALS_MS[1]);
  assert.equal(delta(3), RETRY_INTERVALS_MS[2]);
});

test('erro estrutural nao tem proxima tentativa', () => {
  const base = '2026-07-31T12:00:00.000Z';
  // Nenhum destes se conserta com o tempo. Insistir so gera ruido.
  for (const kind of ['validation', 'authorization', 'conflict'] as const) {
    assert.equal(computeNextAttemptAt({ count: 1, lastSeenAt: base, kind }), undefined);
  }
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/logic/syncBackoff.test.ts
```

Esperado: FALHA com `Cannot find module './syncBackoff'`.

- [ ] **Passo 3: implementar**

Crie `src/logic/syncBackoff.ts`:

```ts
import type { AppError } from '../application/appResult';

/**
 * Intervalos entre tentativas, em milissegundos: 30s, 1min, 2min, 5min, 15min.
 * Depois do ultimo o intervalo para de crescer e fica nele — nao ha limite de
 * tentativas para erro de rede.
 */
export const RETRY_INTERVALS_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

/** Nenhum destes se conserta sozinho com o tempo; insistir so gera ruido. */
const ERROS_ESTRUTURAIS: AppError['kind'][] = ['validation', 'authorization', 'conflict'];

const MARCAS_DE_REDE = ['failed to fetch', 'networkerror', 'load failed', 'network request failed'];

/**
 * Descobre a natureza do erro para decidir se vale reenviar.
 *
 * NAO use `instanceof Error` aqui: o PostgrestError do Supabase e um objeto simples
 * com `code` e `message`, e testar por instanceof descartaria todos eles em silencio.
 */
export function classifySyncError(error: unknown): AppError['kind'] {
  const bruto = error as { code?: string; message?: string } | null;
  const mensagem = (bruto?.message ?? '').toLowerCase();

  if (MARCAS_DE_REDE.some((marca) => mensagem.includes(marca))) return 'offline_unavailable';

  switch (bruto?.code) {
    case '42501':
      return 'authorization';
    case '22023':
      return 'validation';
    case '23505':
      return 'conflict';
    default:
      // Desconhecido vira `technical`, nunca `offline`: chutar offline faria o app
      // insistir para sempre num erro que nao vai passar.
      return 'technical';
  }
}

/**
 * Quando tentar de novo. `undefined` significa "nao tente automaticamente".
 *
 * Erro de rede NUNCA retorna undefined: congelar um sync de payload inteiro faria os
 * dados nunca subirem, que e a falha que este plano conserta.
 */
export function computeNextAttemptAt(input: {
  count: number;
  lastSeenAt: string;
  kind: AppError['kind'];
}): string | undefined {
  if (ERROS_ESTRUTURAIS.includes(input.kind)) return undefined;

  const indice = Math.min(Math.max(input.count, 1) - 1, RETRY_INTERVALS_MS.length - 1);
  const intervalo = RETRY_INTERVALS_MS[indice];
  return new Date(new Date(input.lastSeenAt).getTime() + intervalo).toISOString();
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx tsx --test src/logic/syncBackoff.test.ts
```

Esperado: `pass 6`, `fail 0`.

- [ ] **Passo 5: commit**

```bash
git add src/logic/syncBackoff.ts src/logic/syncBackoff.test.ts
git commit -m "feat(sync): classify network errors and compute retry backoff"
```

---

## Tarefa 3: Gravar o horário da próxima tentativa no ledger

**Por que existe:** o `syncIssueLedger` já registra cada falha com `count`, `firstSeenAt`,
`lastSeenAt`, `status` e `kind`, tudo persistido em `localStorage`. Falta só **quando
tentar de novo**. Você não vai criar estrutura nova — vai acrescentar um campo.

**Arquivos:**
- Modificar: `src/logic/syncIssueLedger.ts`
- Modificar: `src/logic/syncIssueLedger.spec.ts`

**Interfaces:**
- Consome: `computeNextAttemptAt` e `classifySyncError` da Tarefa 2.
- Produz: `SyncIssueEntry.nextAttemptAt?: string` e
  `dueSyncIssues(ledger: SyncIssueEntry[], now: string): SyncIssueEntry[]`.
  A Tarefa 4 chama `dueSyncIssues` para saber se está na hora.

- [ ] **Passo 1: escrever o teste que falha**

Acrescente ao fim de `src/logic/syncIssueLedger.spec.ts`:

```ts
import { dueSyncIssues } from './syncIssueLedger';

describe('proxima tentativa', () => {
  it('grava nextAttemptAt para erro de rede e omite para estrutural', () => {
    const rede = recordSyncIssue([], {
      operation: 'Sincronização',
      context: 'upload',
      error: new TypeError('Failed to fetch'),
      occurredAt: '2026-07-31T12:00:00.000Z',
    });
    expect(rede[0].kind).toBe('offline_unavailable');
    expect(rede[0].nextAttemptAt).toBe('2026-07-31T12:00:30.000Z');

    const estrutural = recordSyncIssue([], {
      operation: 'Sincronização',
      context: 'upload',
      error: { code: '42501', message: 'permission denied' },
      occurredAt: '2026-07-31T12:00:00.000Z',
    });
    expect(estrutural[0].kind).toBe('authorization');
    expect(estrutural[0].nextAttemptAt).toBeUndefined();
  });

  it('dueSyncIssues devolve so o que ja venceu', () => {
    const ledger: SyncIssueEntry[] = [
      {
        id: 'a', operation: 'op', context: 'ctx', message: 'm', status: 'open', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T12:00:30.000Z',
      },
      {
        id: 'b', operation: 'op', context: 'ctx', message: 'm2', status: 'open', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T13:00:00.000Z',
      },
    ];
    const vencidos = dueSyncIssues(ledger, '2026-07-31T12:00:31.000Z');
    expect(vencidos.map((i) => i.id)).toEqual(['a']);
  });

  it('issue resolvida nunca vence, mesmo com horario passado', () => {
    const ledger: SyncIssueEntry[] = [
      {
        id: 'a', operation: 'op', context: 'ctx', message: 'm', status: 'resolved', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T12:00:30.000Z',
      },
    ];
    expect(dueSyncIssues(ledger, '2026-07-31T23:00:00.000Z')).toEqual([]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/logic/syncIssueLedger.spec.ts
```

Esperado: FALHA — `dueSyncIssues` não é exportado.

- [ ] **Passo 3: acrescentar o campo à interface**

Em `src/logic/syncIssueLedger.ts`, dentro de `export interface SyncIssueEntry`, logo
depois de `kind?: AppError['kind'];`, acrescente:

```ts
  /**
   * Quando tentar de novo. Ausente significa "nao tente automaticamente" — o que
   * acontece com erro estrutural, que nao se conserta com o tempo.
   */
  nextAttemptAt?: string;
```

- [ ] **Passo 4: usar a classificação em `recordSyncIssue`**

No topo de `src/logic/syncIssueLedger.ts`, acrescente o import:

```ts
import { classifySyncError, computeNextAttemptAt } from './syncBackoff';
```

Depois, em `recordSyncIssue`, substitua o corpo inteiro por:

```ts
export function recordSyncIssue(ledger: SyncIssueEntry[], input: SyncIssueInput): SyncIssueEntry[] {
  const message = formatSyncIssueError(input.error);
  const id = buildSyncIssueId(input.operation, input.context, message);
  const existing = ledger.find((issue) => issue.id === id);
  // A natureza do erro vem do proprio erro quando o chamador nao informa.
  const kind = input.kind ?? classifySyncError(input.error);

  if (!existing) {
    return limitSyncIssueLedger([
      {
        id,
        operation: input.operation,
        context: input.context,
        message,
        status: 'open',
        count: 1,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
        kind,
        nextAttemptAt: computeNextAttemptAt({ count: 1, lastSeenAt: input.occurredAt, kind }),
      },
      ...ledger,
    ]);
  }

  const count = existing.count + 1;
  return limitSyncIssueLedger(
    ledger.map((issue) =>
      issue.id === id
        ? {
            ...issue,
            status: 'open',
            count,
            lastSeenAt: input.occurredAt,
            resolvedAt: undefined,
            kind,
            nextAttemptAt: computeNextAttemptAt({ count, lastSeenAt: input.occurredAt, kind }),
          }
        : issue,
    ),
  );
}
```

- [ ] **Passo 5: acrescentar `dueSyncIssues`**

No fim de `src/logic/syncIssueLedger.ts`, antes das funções privadas:

```ts
/**
 * Issues abertas cuja hora de tentar de novo ja passou.
 *
 * Issue resolvida nunca vence: `status` manda mais que `nextAttemptAt`, senao uma
 * falha ja corrigida voltaria a disparar reenvio para sempre.
 */
export function dueSyncIssues(ledger: SyncIssueEntry[], now: string): SyncIssueEntry[] {
  const agora = new Date(now).getTime();
  return ledger.filter(
    (issue) =>
      issue.status === 'open' &&
      issue.nextAttemptAt !== undefined &&
      new Date(issue.nextAttemptAt).getTime() <= agora,
  );
}
```

- [ ] **Passo 6: rodar e ver passar**

```bash
npx vitest run src/logic/syncIssueLedger.spec.ts
```

Esperado: todos passam.

- [ ] **Passo 7: rodar a suíte inteira**

```bash
npm test && npx vitest run && npx tsc --noEmit
```

Esperado: tudo verde, zero erro de tipo. Se algum teste antigo do ledger quebrar por
causa do `kind` agora ser derivado, ajuste a expectativa do teste — o comportamento novo
está correto.

- [ ] **Passo 8: commit**

```bash
git add src/logic/syncIssueLedger.ts src/logic/syncIssueLedger.spec.ts
git commit -m "feat(sync): record when each failed sync should be retried"
```

---

## Tarefa 4: Hook de conectividade

**Por que existe:** a Tarefa 1 fez a decisão pura. Falta ligá-la aos eventos do browser.
Separado do `useCloudSync` de propósito: um hook que só observa rede é testável sozinho.

**Arquivos:**
- Criar: `src/hooks/useConnectivity.ts`
- Criar: `src/hooks/useConnectivity.spec.tsx`

**Interfaces:**
- Consome: `nextConnectivityState` e `ConnectivityState` da Tarefa 1.
- Produz: `useConnectivity(): { state: ConnectivityState; reportOutcome(outcome: RequestOutcome): void; onlineAt: number }`.
  A Tarefa 5 usa `state` e `reportOutcome`; `onlineAt` é um contador que muda toda vez
  que a rede volta, para a Tarefa 5 disparar reenvio.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/hooks/useConnectivity.spec.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectivity } from './useConnectivity';

function setBrowserOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('useConnectivity', () => {
  beforeEach(() => setBrowserOnline(true));
  afterEach(() => vi.restoreAllMocks());

  it('comeca com o que o browser diz', () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.state).toBe('online');
  });

  it('o evento offline do browser derruba o estado', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => {
      setBrowserOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.state).toBe('offline');
  });

  it('uma falha de rede reportada vence o browser otimista', () => {
    // Wi-fi de ginasio: onLine continua true, mas nada sai.
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('network_failure'));
    expect(result.current.state).toBe('offline');
  });

  it('um sucesso reportado religa mesmo com o browser dizendo offline', () => {
    setBrowserOnline(false);
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('success'));
    expect(result.current.state).toBe('online');
  });

  it('onlineAt muda quando a rede volta, para servir de gatilho', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => result.current.reportOutcome('network_failure'));
    const antes = result.current.onlineAt;
    act(() => {
      setBrowserOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.onlineAt).not.toBe(antes);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/hooks/useConnectivity.spec.tsx
```

Esperado: FALHA — módulo não encontrado.

- [ ] **Passo 3: implementar**

Crie `src/hooks/useConnectivity.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import {
  nextConnectivityState,
  type ConnectivityState,
  type RequestOutcome,
} from '../logic/connectivity';

/**
 * Observa a rede e expoe o estado para quem precisa decidir se tenta de novo.
 *
 * `onlineAt` e um carimbo que muda toda vez que a rede VOLTA. Ele existe para servir
 * de dependencia de efeito: quem quiser reagir a "a rede voltou" observa esse numero,
 * em vez de tentar comparar estados anteriores na mao.
 */
export function useConnectivity() {
  const [state, setState] = useState<ConnectivityState>(() =>
    typeof navigator === 'undefined' ? 'unknown' : navigator.onLine ? 'online' : 'offline',
  );
  const [onlineAt, setOnlineAt] = useState(() => Date.now());

  const apply = useCallback((outcome: RequestOutcome | null) => {
    setState((current) => {
      const next = nextConnectivityState({
        current,
        browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        lastOutcome: outcome,
      });
      // So carimba quando houve transicao PARA online, para o gatilho nao disparar
      // a cada render.
      if (next === 'online' && current !== 'online') setOnlineAt(Date.now());
      return next;
    });
  }, []);

  const reportOutcome = useCallback((outcome: RequestOutcome) => apply(outcome), [apply]);

  useEffect(() => {
    const aoMudar = () => apply(null);
    window.addEventListener('online', aoMudar);
    window.addEventListener('offline', aoMudar);
    return () => {
      window.removeEventListener('online', aoMudar);
      window.removeEventListener('offline', aoMudar);
    };
  }, [apply]);

  return { state, reportOutcome, onlineAt };
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/hooks/useConnectivity.spec.tsx
```

Esperado: `5 passed`.

- [ ] **Passo 5: commit**

```bash
git add src/hooks/useConnectivity.ts src/hooks/useConnectivity.spec.tsx
git commit -m "feat(sync): observe connectivity from browser events and request outcomes"
```

---

## Tarefa 5: Reenvio automático no `useCloudSync`

**Por que existe:** todas as peças estão prontas; falta o gatilho. Hoje, se um sync falha,
nada tenta de novo — a pessoa precisa clicar.

**Duas proteções que você ganha de graça** por reusar o `run` que já existe (não
reimplemente nenhuma delas):

1. A trava de reentrância persistida com TTL (`isInflight`) impede reenvio automático
   concorrente com clique manual.
2. A recusa de escrita enquanto o cache pertence a outra conta impede reenviar dados da
   conta anterior depois de trocar de login.

**A armadilha do `online`:** o evento chega **antes** da rede estar realmente utilizável.
Disparar na hora costuma falhar de novo. Por isso o debounce de 2 segundos.

**Arquivos:**
- Modificar: `src/hooks/useCloudSync.ts`
- Modificar: `src/hooks/useCloudSync.spec.tsx`

**Interfaces:**
- Consome: `useConnectivity` (Tarefa 4), `dueSyncIssues` (Tarefa 3).
- Produz: `useCloudSync` passa a devolver também `connectivity: ConnectivityState`.
  A Tarefa 9 usa esse campo para o indicador.

- [ ] **Passo 1: escrever o teste que falha**

Acrescente ao fim de `src/hooks/useCloudSync.spec.tsx`:

```tsx
describe('reenvio automatico', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reenvia quando a rede volta, apos o debounce', async () => {
    let chamadas = 0;
    syncService.syncNow = async () => {
      chamadas += 1;
      return emptyPayload();
    };
    // Uma falha de rede aberta e vencida no ledger e o que torna o reenvio devido.
    recordStoredSyncIssue({
      operation: 'Sincronização',
      context: 'upload',
      error: new TypeError('Failed to fetch'),
      occurredAt: '2026-07-31T11:00:00.000Z',
    });

    renderHook(() => useCloudSync(deps({ userId: 'user-1' })));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      // Antes do debounce nao pode ter disparado.
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(chamadas).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(chamadas).toBe(1);
  });

  it('nao reenvia quando so ha erro estrutural', async () => {
    let chamadas = 0;
    syncService.syncNow = async () => {
      chamadas += 1;
      return emptyPayload();
    };
    // 42501 e authorization: nao se conserta com o tempo, entao nao tem nextAttemptAt.
    recordStoredSyncIssue({
      operation: 'Sincronização',
      context: 'upload',
      error: { code: '42501', message: 'permission denied' },
      occurredAt: '2026-07-31T11:00:00.000Z',
    });

    renderHook(() => useCloudSync(deps({ userId: 'user-1' })));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(chamadas).toBe(0);
  });

  it('nao reenvia sem nenhuma falha registrada', async () => {
    let chamadas = 0;
    syncService.syncNow = async () => {
      chamadas += 1;
      return emptyPayload();
    };
    renderHook(() => useCloudSync(deps({ userId: 'user-1' })));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(chamadas).toBe(0);
  });
});
```

No topo do arquivo, acrescente ao import existente de `syncIssueLedger`:

```tsx
import { recordStoredSyncIssue } from '../logic/syncIssueLedger';
```

(se já estiver importado, não duplique).

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/hooks/useCloudSync.spec.tsx
```

Esperado: os três novos falham — nada dispara reenvio.

- [ ] **Passo 3: importar as peças novas**

Em `src/hooks/useCloudSync.ts`, acrescente aos imports:

```ts
import { useEffect, useRef } from 'react';
import { useConnectivity } from './useConnectivity';
import { classifySyncError } from '../logic/syncBackoff';
import { dueSyncIssues } from '../logic/syncIssueLedger';
```

Atenção: a linha 1 do arquivo hoje é `import { useState } from 'react';`. Troque por
`import { useEffect, useRef, useState } from 'react';` em vez de criar um import novo.

- [ ] **Passo 4: reportar o resultado da requisição**

Dentro de `useCloudSync`, logo depois das declarações de estado, acrescente:

```ts
  const connectivity = useConnectivity();
```

No `run`, no bloco `catch (e)`, **antes** de `const message = ...`, acrescente:

```ts
      // A requisicao real manda mais que o navigator.onLine.
      connectivity.reportOutcome(
        classifySyncError(e) === 'offline_unavailable' ? 'network_failure' : 'success',
      );
```

E no caminho de sucesso, logo depois de `applyResult(result);`, acrescente:

```ts
      connectivity.reportOutcome('success');
```

Por que `'success'` também no erro estrutural: o servidor respondeu, logo há rede. Só
falha de rede é evidência de que não há.

- [ ] **Passo 5: disparar o reenvio**

Ainda em `useCloudSync`, depois da definição de `sync` (para `sync` já existir), acrescente:

```ts
  // O evento `online` do browser chega ANTES da rede estar utilizavel de verdade.
  // Sem esta espera, a primeira tentativa quase sempre falha de novo.
  const DEBOUNCE_RECONEXAO_MS = 2000;
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (connectivity.state !== 'online') return;
    if (!deps.userId) return;

    const timer = setTimeout(() => {
      // So reenvia se houver falha aberta E vencida. `dueSyncIssues` ja ignora
      // resolvidas e erros estruturais, que nao tem nextAttemptAt.
      if (dueSyncIssues(loadSyncIssueLedger(), new Date().toISOString()).length === 0) return;
      void syncRef.current().catch(() => {
        // O erro ja foi registrado no ledger dentro do `run`; aqui so evitamos
        // uma promise rejeitada sem tratamento.
      });
    }, DEBOUNCE_RECONEXAO_MS);

    return () => clearTimeout(timer);
  }, [connectivity.state, connectivity.onlineAt, deps.userId]);
```

- [ ] **Passo 6: expor o estado de rede**

No `return` de `useCloudSync`, acrescente ao objeto:

```ts
    connectivity: connectivity.state,
```

- [ ] **Passo 7: rodar e ver passar**

```bash
npx vitest run src/hooks/useCloudSync.spec.tsx
```

Esperado: todos passam, incluindo os testes antigos de troca de conta.

- [ ] **Passo 8: teste de mutação**

Comente a linha `if (dueSyncIssues(...).length === 0) return;` e rode de novo. O teste
"nao reenvia sem nenhuma falha registrada" **tem** que falhar. Se passar, o teste não
está testando o que diz. Descomente depois.

- [ ] **Passo 9: commit**

```bash
git add src/hooks/useCloudSync.ts src/hooks/useCloudSync.spec.tsx
git commit -m "feat(sync): retry pending work automatically when the network returns"
```

---

## Tarefa 6: Identidade do dispositivo

**Por que existe:** a posse é por **usuário**, mas o dispositivo é registrado para um
aviso informativo — "você está com esta sessão aberta em outro aparelho". Ele **nunca**
bloqueia.

**A armadilha crítica:** `clearLocalDomainCache` varre todas as chaves de `STORAGE_KEYS`
quando o usuário troca de conta. O id do dispositivo **não pode** estar nessa lista — o
aparelho não muda porque a pessoa mudou. Mesmo tratamento de `LOCAL_CACHE_OWNER_KEY`,
que também fica de fora.

**Arquivos:**
- Modificar: `src/storage/localStorageRepository.ts`
- Modificar: `src/storage/localStorageRepository.spec.ts`

**Interfaces:**
- Consome: `generateUUID` de `src/logic/uuid.ts`.
- Produz: `getOrCreateDeviceId(): string`. A Tarefa 8 usa.

- [ ] **Passo 1: escrever o teste que falha**

Acrescente dentro do `describe('cache partition', ...)` de
`src/storage/localStorageRepository.spec.ts`:

```ts
    it('getOrCreateDeviceId cria uma vez e devolve sempre o mesmo', () => {
      const primeiro = getOrCreateDeviceId();
      expect(primeiro).toMatch(/[0-9a-f-]{36}/i);
      expect(getOrCreateDeviceId()).toBe(primeiro);
    });

    it('o id do dispositivo sobrevive a troca de conta', () => {
      // clearLocalDomainCache varre STORAGE_KEYS. O aparelho nao muda porque o
      // usuario mudou, entao vpg_device_id NAO pode estar nessa lista.
      const antes = getOrCreateDeviceId();
      clearLocalDomainCache();
      expect(getOrCreateDeviceId()).toBe(antes);
    });
```

E acrescente `getOrCreateDeviceId` ao import do topo do arquivo.

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/storage/localStorageRepository.spec.ts
```

Esperado: FALHA — `getOrCreateDeviceId` não existe.

- [ ] **Passo 3: implementar**

No topo de `src/storage/localStorageRepository.ts`, acrescente:

```ts
import { generateUUID } from '../logic/uuid';
```

Logo abaixo de `export const LOCAL_CACHE_OWNER_KEY = 'vpg_cache_owner_id';`, acrescente:

```ts
/**
 * Identidade do APARELHO, nao do usuario.
 *
 * Fica de proposito FORA de STORAGE_KEYS: `clearLocalDomainCache` varre aquela lista
 * na troca de conta, e o aparelho nao muda porque a pessoa mudou. Mesmo tratamento de
 * LOCAL_CACHE_OWNER_KEY.
 *
 * Serve apenas para um aviso informativo ("voce esta com esta sessao aberta em outro
 * aparelho"). NUNCA bloqueia nada — se o id se perder na limpeza do navegador, o pior
 * que acontece e o aviso deixar de aparecer.
 */
export const DEVICE_ID_KEY = 'vpg_device_id';
```

E no fim do arquivo:

```ts
export function getOrCreateDeviceId(): string {
  try {
    const existente = localStorage.getItem(DEVICE_ID_KEY);
    if (existente) return existente;
    const novo = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, novo);
    return novo;
  } catch (err) {
    console.error('Error resolving device id:', err);
    // Sem storage, devolve um id efemero: o aviso de aparelho para de funcionar,
    // nada mais quebra.
    return generateUUID();
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/storage/localStorageRepository.spec.ts
```

Esperado: todos passam.

- [ ] **Passo 5: commit**

```bash
git add src/storage/localStorageRepository.ts src/storage/localStorageRepository.spec.ts
git commit -m "feat(session): add a device identity that survives account switching"
```

---

## Tarefa 7: Migration de posse da sessão

**Por que existe:** só o servidor enxerga os dois aparelhos, então a autoridade tem que
morar no banco.

**Duas regras que parecem detalhe e não são:**

**Expiração pela atividade, não pela reivindicação.** Se medisse desde a reivindicação, o
celular de quem está tocando a sessão morre e ninguém mais marca ponto até o prazo
acabar. Medindo pelo último ponto registrado, a garantia vale enquanto alguém joga e a
sessão se libera sozinha quando o aparelho some.

**Sessão sem nenhum evento.** Uma sessão recém-criada não tem `point_event`, e "último
evento" seria nulo. Por isso o `coalesce(max(occurred_at), control_claimed_at)` —
`control_claimed_at` é preenchido junto com a posse, então o resultado nunca é nulo.

**Arquivos:**
- Criar: `supabase/migrations/20260731100000_session_ownership.sql`
- Modificar: `supabase/migrations/schema.sql`
- Modificar: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Produz: colunas `sessions.controlled_by_user_id`, `sessions.control_claimed_at`,
  `sessions.control_device_id`; RPCs `claim_session_ownership(uuid, text)` e
  `transfer_session_ownership(uuid, text)`, ambas retornando `public.sessions`.
  A Tarefa 8 chama as duas.

- [ ] **Passo 1: escrever a migration**

Crie `supabase/migrations/20260731100000_session_ownership.sql`:

```sql
-- Posse da sessao, para impedir que duas pessoas produzam placares concorrentes.
--
-- A autoridade e o USUARIO, nao o aparelho. Bloquear por aparelho puniria o caso
-- legitimo de trocar de celular no meio da sessao, e transformaria o aviso num id
-- opaco com o qual ninguem consegue fazer nada. `control_device_id` e registrado
-- apenas para um aviso informativo e NUNCA bloqueia.
--
-- `controlled_by_user_id` e distinto de `sessions.owner_id`, que continua sendo quem
-- criou a sessao: um moderador pode assumir o controle sem virar dono.

alter table public.sessions
  add column if not exists controlled_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists control_claimed_at timestamptz,
  add column if not exists control_device_id text;

-- 30 minutos SEM PONTO NOVO liberam a sessao.
--
-- Medir desde a reivindicacao criaria o pior cenario: o celular de quem esta tocando
-- a sessao morre e ninguem mais marca ponto ate o prazo acabar. Medindo pela
-- atividade, a garantia vale enquanto alguem joga e a sessao volta sozinha quando o
-- aparelho some.
--
-- O coalesce cobre a sessao recem-criada, que ainda nao tem nenhum point_event:
-- control_claimed_at e preenchido junto com a posse, entao nunca e nulo.
create or replace function public.session_control_is_expired(p_session public.sessions)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select max(pe.occurred_at) from public.point_events pe
      where pe.session_id = p_session.id and pe.deleted_at is null),
    p_session.control_claimed_at
  ) < now() - interval '30 minutes';
$$;

revoke execute on function public.session_control_is_expired(public.sessions) from public, anon;
grant execute on function public.session_control_is_expired(public.sessions) to authenticated;

create or replace function public.claim_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;

  -- Mesmo direito de escrita que a RLS de sessions ja concede: dono da sessao, ou
  -- owner/admin/moderator da comunidade (default de current_user_has_community_role).
  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  -- Assume se estiver livre, se ja for sua, ou se a posse tiver expirado.
  if v_session.controlled_by_user_id is not null
     and v_session.controlled_by_user_id <> v_uid
     and not public.session_control_is_expired(v_session) then
    raise exception 'Outra pessoa está com o controle desta sessão' using errcode = '42501';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.claim_session_ownership(uuid, text) from public, anon;
grant execute on function public.claim_session_ownership(uuid, text) to authenticated;

-- Tomada explicita: permitida a quem ja pode escrever a sessao, independente de
-- expiracao. E o botao "assumir controle", que sempre exige confirmacao na tela.
create or replace function public.transfer_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;

  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.transfer_session_ownership(uuid, text) from public, anon;
grant execute on function public.transfer_session_ownership(uuid, text) to authenticated;
```

- [ ] **Passo 2: aplicar no projeto real**

Use a ferramenta `apply_migration` do MCP do Supabase, com `name` =
`session_ownership` e o conteúdo do arquivo. **Não** use `execute_sql` para DDL.

- [ ] **Passo 3: verificar contra o banco, não contra o arquivo**

Rode via `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='sessions'
      and column_name in ('controlled_by_user_id','control_claimed_at','control_device_id')) as colunas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('claim_session_ownership','transfer_session_ownership','session_control_is_expired')) as funcoes,
  has_function_privilege('anon','public.claim_session_ownership(uuid,text)','execute') as anon_pode_claim,
  has_function_privilege('authenticated','public.claim_session_ownership(uuid,text)','execute') as auth_pode_claim;
```

Esperado: `colunas=3`, `funcoes=3`, `anon_pode_claim=false`, `auth_pode_claim=true`.

- [ ] **Passo 4: teste de comportamento contra o banco real**

Teste de schema casa **texto** de SQL, não comportamento — foi assim que um vazamento de
dados entre contas sobreviveu neste projeto. Rode via `execute_sql`, tudo dentro de uma
transação que termina em `rollback` para não sujar produção. Substitua os dois UUIDs por
ids reais de `public.profiles`:

```sql
begin;
create temp table r(caso text, resultado text) on commit drop;

with c as (insert into public.communities(owner_id,name) values ('<UUID_A>','POSSE tmp') returning id),
s as (insert into public.sessions(owner_id,name,date,status,type,community_id)
      select '<UUID_A>','POSSE sessao',current_date,'active','free_play',id from c returning id)
insert into r select 'setup', (select count(*)::text from s);

-- 1) reivindicar sessao livre
insert into r select '1) livre',
  (select (controlled_by_user_id is not null)::text
     from public.claim_session_ownership((select id from public.sessions where name='POSSE sessao'), 'dev-1'));

-- 2) sessao recem-criada, sem nenhum ponto: expiracao cai em control_claimed_at,
--    entao continua com dono e outra reivindicacao teria de falhar.
insert into r select '2) expirada agora?',
  (select public.session_control_is_expired(s)::text
     from public.sessions s where s.name='POSSE sessao');

-- 3) forcar expiracao recuando o carimbo
update public.sessions set control_claimed_at = now() - interval '31 minutes'
 where name='POSSE sessao';
insert into r select '3) expirada apos 31min?',
  (select public.session_control_is_expired(s)::text
     from public.sessions s where s.name='POSSE sessao');

-- 4) sessao encerrada recusa
update public.sessions set status='finished' where name='POSSE sessao';
insert into r select '4) encerrada recusa?', (
  select case when exists (
    select 1 from public.claim_session_ownership(
      (select id from public.sessions where name='POSSE sessao'), 'dev-2')
  ) then 'aceitou (ERRADO)' else 'x' end
);

select * from r order by caso;
rollback;
```

Esperado: `1) livre = true`, `2) expirada agora? = false`, `3) expirada apos 31min? = true`.
O caso 4 deve **erguer exceção** com a mensagem de sessão encerrada — se ele retornar
linha, a regra não está funcionando. Rode o caso 4 separado para ver a exceção.

Depois, confirme que nada sobrou:

```sql
select count(*) from public.communities where name like 'POSSE%';
```

Esperado: `0`.

- [ ] **Passo 5: espelhar no `schema.sql`**

Copie o conteúdo inteiro da migration para o fim de `supabase/migrations/schema.sql`,
precedido de um cabeçalho de seção no mesmo estilo dos outros blocos do arquivo.

- [ ] **Passo 6: teste de schema**

Acrescente ao fim de `src/infra/supabase/schema.test.ts`:

```ts
const sessionOwnershipMigration = readFixture(
  new URL('../../../supabase/migrations/20260731100000_session_ownership.sql', import.meta.url),
);

test('session ownership is by user, never by device', () => {
  // O device_id existe para um aviso informativo. Se algum dia ele aparecer numa
  // comparacao que decide permissao, este teste quebra de proposito.
  const fn = extractSqlFunction(sessionOwnershipMigration, 'claim_session_ownership');
  assert.ok(fn, 'missing claim_session_ownership');
  assert.match(fn, /controlled_by_user_id <> v_uid/i);
  assert.doesNotMatch(fn, /control_device_id\s*(<>|=)\s*p_device_id/i);
});

test('session control expiry measures activity, not claim time', () => {
  // Medir desde a reivindicacao travaria a quadra quando o celular do organizador
  // morresse. O coalesce cobre a sessao sem nenhum ponto ainda.
  const fn = extractSqlFunction(sessionOwnershipMigration, 'session_control_is_expired');
  assert.ok(fn, 'missing session_control_is_expired');
  assert.match(fn, /max\(pe\.occurred_at\)/i);
  assert.match(fn, /coalesce\(/i);
  assert.match(fn, /p_session\.control_claimed_at/i);
});

test('ownership RPCs revoke from anon before granting', () => {
  for (const nome of ['claim_session_ownership', 'transfer_session_ownership']) {
    assert.match(
      sessionOwnershipMigration,
      new RegExp(`revoke execute on function public\\.${nome}\\(uuid, text\\) from public, anon`, 'i'),
    );
    assert.match(
      sessionOwnershipMigration,
      new RegExp(`grant execute on function public\\.${nome}\\(uuid, text\\) to authenticated`, 'i'),
    );
  }
});

test('consolidated schema carries the ownership columns and RPCs', () => {
  assert.match(baseSchema, /controlled_by_user_id uuid references auth\.users\(id\) on delete set null/i);
  assert.match(baseSchema, /create or replace function public\.claim_session_ownership/i);
  assert.match(baseSchema, /create or replace function public\.transfer_session_ownership/i);
});
```

- [ ] **Passo 7: rodar**

```bash
npx tsx --test src/infra/supabase/schema.test.ts
```

Esperado: todos passam.

- [ ] **Passo 8: commit**

```bash
git add supabase/migrations/20260731100000_session_ownership.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(db): add session ownership by user with activity-based expiry"
```

---

## Tarefa 8: Serviço e regras de posse no cliente

**Por que existe:** a Tarefa 7 fez o banco. Falta o cliente saber pedir e saber o que
mostrar.

**A regra que decide a tela** é pura e por isso testável sozinha: dado quem controla a
sessão e quem sou eu, posso marcar placar ou não?

**Arquivos:**
- Criar: `src/infra/supabase/sessionOwnershipCloudService.ts`
- Criar: `src/application/sessionOwnershipUseCases.ts`
- Criar: `src/application/sessionOwnershipUseCases.test.ts`

**Interfaces:**
- Consome: `getOrCreateDeviceId` (Tarefa 6); RPCs da Tarefa 7.
- Produz: `resolveSessionControl(input): SessionControlView` e
  `claimSessionControlCommand` / `transferSessionControlCommand`, ambos devolvendo
  `AppResult<{ controlledByUserId: string | null }>`. A Tarefa 9 usa os três.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/application/sessionOwnershipUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSessionControl } from './sessionOwnershipUseCases';

test('sessao sem dono libera o placar', () => {
  const v = resolveSessionControl({
    controlledByUserId: null, controlClaimedAt: null, controlDeviceId: null,
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: null,
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'free');
});

test('sessao minha libera o placar', () => {
  const v = resolveSessionControl({
    controlledByUserId: 'u-1', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-1',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Eu',
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'mine');
});

test('sessao de outra pessoa bloqueia e nomeia quem esta com ela', () => {
  const v = resolveSessionControl({
    controlledByUserId: 'u-2', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-9',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Ana',
  });
  assert.equal(v.canScore, false);
  assert.equal(v.reason, 'held_by_other');
  // O nome importa: "outro dispositivo" nao e acionavel, "Ana" e.
  assert.match(v.message, /Ana/);
});

test('minha sessao em outro aparelho AVISA mas nao bloqueia', () => {
  // Bloquear aqui puniria o caso legitimo de trocar de celular no meio da sessao.
  const v = resolveSessionControl({
    controlledByUserId: 'u-1', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-OUTRO',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Eu',
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'mine_other_device');
  assert.match(v.message, /outro aparelho/i);
});

test('sem usuario nao ha placar a marcar', () => {
  const v = resolveSessionControl({
    controlledByUserId: null, controlClaimedAt: null, controlDeviceId: null,
    currentUserId: null, currentDeviceId: 'd-1', holderName: null,
  });
  assert.equal(v.canScore, false);
  assert.equal(v.reason, 'not_authenticated');
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/application/sessionOwnershipUseCases.test.ts
```

Esperado: FALHA — módulo não existe.

- [ ] **Passo 3: implementar o serviço de nuvem**

Crie `src/infra/supabase/sessionOwnershipCloudService.ts`:

```ts
import { supabase } from '../../lib/supabaseClient';

export interface SessionControlRow {
  controlled_by_user_id: string | null;
  control_claimed_at: string | null;
  control_device_id: string | null;
}

export const sessionOwnershipCloudService = {
  async claim(sessionCloudId: string, deviceId: string): Promise<SessionControlRow> {
    const { data, error } = await supabase.rpc('claim_session_ownership', {
      p_session_id: sessionCloudId,
      p_device_id: deviceId,
    });
    if (error) throw error;
    return data as unknown as SessionControlRow;
  },

  async transfer(sessionCloudId: string, deviceId: string): Promise<SessionControlRow> {
    const { data, error } = await supabase.rpc('transfer_session_ownership', {
      p_session_id: sessionCloudId,
      p_device_id: deviceId,
    });
    if (error) throw error;
    return data as unknown as SessionControlRow;
  },
};
```

- [ ] **Passo 4: implementar as regras**

Crie `src/application/sessionOwnershipUseCases.ts`:

```ts
import { appOk, productError, technicalError, type AppResult } from './appResult';
import { classifySyncError } from '../logic/syncBackoff';
import { getOrCreateDeviceId } from '../storage/localStorageRepository';
import { sessionOwnershipCloudService } from '@infra/supabase/sessionOwnershipCloudService';

export type SessionControlReason =
  | 'free'
  | 'mine'
  | 'mine_other_device'
  | 'held_by_other'
  | 'not_authenticated';

export interface SessionControlView {
  canScore: boolean;
  reason: SessionControlReason;
  message: string;
  holderName: string | null;
}

/**
 * Decide se esta tela pode marcar placar.
 *
 * A autoridade e o USUARIO. O aparelho so gera aviso: bloquear por aparelho puniria
 * quem legitimamente trocou de celular no meio da sessao.
 */
export function resolveSessionControl(input: {
  controlledByUserId: string | null;
  controlClaimedAt: string | null;
  controlDeviceId: string | null;
  currentUserId: string | null;
  currentDeviceId: string;
  holderName: string | null;
}): SessionControlView {
  if (!input.currentUserId) {
    return {
      canScore: false,
      reason: 'not_authenticated',
      message: 'Entre na sua conta para marcar o placar.',
      holderName: null,
    };
  }

  if (!input.controlledByUserId) {
    return { canScore: true, reason: 'free', message: '', holderName: null };
  }

  if (input.controlledByUserId !== input.currentUserId) {
    const quem = input.holderName ?? 'Outra pessoa';
    return {
      canScore: false,
      reason: 'held_by_other',
      message: `${quem} está com o controle desta sessão.`,
      holderName: input.holderName,
    };
  }

  if (input.controlDeviceId && input.controlDeviceId !== input.currentDeviceId) {
    return {
      canScore: true,
      reason: 'mine_other_device',
      message: 'Você está com esta sessão aberta em outro aparelho.',
      holderName: input.holderName,
    };
  }

  return { canScore: true, reason: 'mine', message: '', holderName: input.holderName };
}

async function executarPosse(
  acao: 'claim' | 'transfer',
  sessionCloudId: string,
): Promise<AppResult<{ controlledByUserId: string | null }>> {
  try {
    const row = await sessionOwnershipCloudService[acao](sessionCloudId, getOrCreateDeviceId());
    return appOk({ controlledByUserId: row.controlled_by_user_id });
  } catch (error) {
    // O RPC devolve 42501 quando outra pessoa esta com o controle. Essa e uma
    // resposta de produto, nao falha tecnica: a mensagem do servidor ja nomeia o caso.
    const bruto = error as { message?: string } | null;
    if (classifySyncError(error) === 'authorization' && bruto?.message?.trim()) {
      return productError('permission_denied', bruto.message.trim());
    }
    return technicalError('Não foi possível atualizar o controle da sessão.', error);
  }
}

export const claimSessionControlCommand = (sessionCloudId: string) =>
  executarPosse('claim', sessionCloudId);

export const transferSessionControlCommand = (sessionCloudId: string) =>
  executarPosse('transfer', sessionCloudId);
```

- [ ] **Passo 5: rodar e ver passar**

```bash
npx tsx --test src/application/sessionOwnershipUseCases.test.ts && npx tsc --noEmit
```

Esperado: `pass 5`, zero erro de tipo.

Se o TypeScript reclamar de `'permission_denied'`, abra `src/application/appResult.ts`,
veja os valores válidos de `ProductErrorCode` e use o que corresponde a permissão negada.

- [ ] **Passo 6: commit**

```bash
git add src/infra/supabase/sessionOwnershipCloudService.ts src/application/sessionOwnershipUseCases.ts src/application/sessionOwnershipUseCases.test.ts
git commit -m "feat(session): resolve who may score a session"
```

---

## Tarefa 9: Aviso de posse na tela de sessão

**Por que existe:** a regra da Tarefa 8 só vale se aparecer. E precisa **nomear** quem
está com a sessão — "outro dispositivo" não é acionável; "Ana está com o controle" é.

**Arquivos:**
- Criar: `src/components/live/SessionOwnershipNotice.tsx`
- Criar: `src/components/live/SessionOwnershipNotice.spec.tsx`

**Interfaces:**
- Consome: `SessionControlView` (Tarefa 8).
- Produz: componente `SessionOwnershipNotice`.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/components/live/SessionOwnershipNotice.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionOwnershipNotice } from './SessionOwnershipNotice';

const base = { canScore: true, reason: 'mine' as const, message: '', holderName: null };

describe('SessionOwnershipNotice', () => {
  it('nao mostra nada quando a sessao e minha neste aparelho', () => {
    const { container } = render(<SessionOwnershipNotice control={base} onTakeControl={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('nomeia quem esta com a sessao e oferece assumir', () => {
    render(
      <SessionOwnershipNotice
        control={{ canScore: false, reason: 'held_by_other', message: 'Ana está com o controle desta sessão.', holderName: 'Ana' }}
        onTakeControl={vi.fn()}
      />,
    );
    expect(screen.getByText(/Ana está com o controle/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /assumir controle/i })).toBeTruthy();
  });

  it('pede confirmacao antes de assumir', () => {
    // Tomar o controle de quem esta marcando placar nao pode ser um clique so.
    const onTakeControl = vi.fn();
    render(
      <SessionOwnershipNotice
        control={{ canScore: false, reason: 'held_by_other', message: 'Ana está com o controle desta sessão.', holderName: 'Ana' }}
        onTakeControl={onTakeControl}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /assumir controle/i }));
    expect(onTakeControl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onTakeControl).toHaveBeenCalledTimes(1);
  });

  it('avisa sobre outro aparelho sem oferecer assumir', () => {
    // Ja e minha: nao ha o que assumir, so avisar.
    render(
      <SessionOwnershipNotice
        control={{ canScore: true, reason: 'mine_other_device', message: 'Você está com esta sessão aberta em outro aparelho.', holderName: 'Eu' }}
        onTakeControl={vi.fn()}
      />,
    );
    expect(screen.getByText(/outro aparelho/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /assumir controle/i })).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx vitest run src/components/live/SessionOwnershipNotice.spec.tsx
```

Esperado: FALHA — componente não existe.

- [ ] **Passo 3: implementar**

Crie `src/components/live/SessionOwnershipNotice.tsx`:

```tsx
import { useState } from 'react';
import type { SessionControlView } from '@app/sessionOwnershipUseCases';

/**
 * Aviso de quem esta com o controle da sessao.
 *
 * Assumir o controle exige confirmacao: tirar a sessao de quem esta marcando placar
 * naquele momento nao pode acontecer por toque acidental.
 */
export function SessionOwnershipNotice({
  control,
  onTakeControl,
}: {
  control: SessionControlView;
  onTakeControl: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (control.reason === 'mine' || control.reason === 'free') return null;

  const podeAssumir = control.reason === 'held_by_other';

  return (
    <div className="alert alert-warning flex flex-col items-start gap-2" role="status">
      <span className="text-sm font-bold">{control.message}</span>

      {podeAssumir && !confirmando && (
        <button type="button" className="btn btn-sm" onClick={() => setConfirmando(true)}>
          Assumir controle
        </button>
      )}

      {podeAssumir && confirmando && (
        <div className="flex flex-col gap-2">
          <span className="text-xs">
            {control.holderName ?? 'A outra pessoa'} perde o controle e passa a ver a sessão
            em modo leitura. O placar já marcado não é perdido.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-warning"
              onClick={() => {
                setConfirmando(false);
                onTakeControl();
              }}
            >
              Confirmar
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx vitest run src/components/live/SessionOwnershipNotice.spec.tsx
```

Esperado: `4 passed`.

- [ ] **Passo 5: commit**

```bash
git add src/components/live/SessionOwnershipNotice.tsx src/components/live/SessionOwnershipNotice.spec.tsx
git commit -m "feat(session): show who holds session control and confirm takeover"
```

---

## Tarefa 10: Indicador honesto de trabalho não entregue

**Por que existe:** hoje o pendente é um número num badge com tooltip. Isso descreve uma
fila, não um risco.

**A mudança que parece cosmética e não é:** "3 pendentes" versus "3 alterações ainda não
foram para a nuvem". Mesma informação, consequência explícita. É o que faz a pessoa agir
antes de fechar o app achando que salvou.

**Arquivos:**
- Modificar: `src/application/appShellViewModel.ts`
- Modificar: `src/application/appShellViewModel.test.ts`
- Modificar: `src/App.tsx`

**Interfaces:**
- Consome: `connectivity` do `useCloudSync` (Tarefa 5).
- Produz: `buildPendingDeliveryNotice(input): { visible: boolean; message: string } | null`.

- [ ] **Passo 1: escrever o teste que falha**

Acrescente ao fim de `src/application/appShellViewModel.test.ts`:

```ts
import { buildPendingDeliveryNotice } from './appShellViewModel';

test('nao avisa quando nao ha pendente', () => {
  assert.equal(
    buildPendingDeliveryNotice({ pendingChanges: 0, connectivity: 'offline', hasOpenFailure: true }),
    null,
  );
});

test('nao avisa quando ha pendente mas tudo esta bem', () => {
  // Pendente com rede e sem falha e so o sync que ainda nao rodou. Avisar aqui
  // treinaria a pessoa a ignorar o aviso.
  assert.equal(
    buildPendingDeliveryNotice({ pendingChanges: 3, connectivity: 'online', hasOpenFailure: false }),
    null,
  );
});

test('avisa com pendente e sem rede, dizendo a consequencia', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 3, connectivity: 'offline', hasOpenFailure: false,
  });
  assert.ok(aviso);
  // "pendentes" descreve uma fila; "nao foram para a nuvem" descreve uma perda possivel.
  assert.match(aviso!.message, /não foram para a nuvem/i);
  assert.match(aviso!.message, /3/);
});

test('avisa com pendente e falha aberta, mesmo com rede', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 1, connectivity: 'online', hasOpenFailure: true,
  });
  assert.ok(aviso);
  assert.match(aviso!.message, /1 alteração/i);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/application/appShellViewModel.test.ts
```

Esperado: FALHA — função não exportada.

- [ ] **Passo 3: implementar**

Acrescente ao fim de `src/application/appShellViewModel.ts`:

```ts
import type { ConnectivityState } from '../logic/connectivity';

export interface PendingDeliveryNotice {
  visible: boolean;
  message: string;
}

/**
 * Aviso persistente de trabalho que nao chegou na nuvem.
 *
 * So aparece quando ha pendente E algo de fato impede a entrega (sem rede, ou falha
 * aberta). Pendente com rede e sem falha e apenas o sync que ainda nao rodou — avisar
 * ali treinaria a pessoa a ignorar o aviso.
 *
 * A palavra importa: "3 pendentes" descreve uma fila, "3 alteracoes ainda nao foram
 * para a nuvem" descreve uma perda possivel.
 */
export function buildPendingDeliveryNotice(input: {
  pendingChanges: number;
  connectivity: ConnectivityState;
  hasOpenFailure: boolean;
}): PendingDeliveryNotice | null {
  if (input.pendingChanges <= 0) return null;
  if (input.connectivity === 'online' && !input.hasOpenFailure) return null;

  const plural = input.pendingChanges === 1 ? 'alteração ainda não foi' : 'alterações ainda não foram';
  return {
    visible: true,
    message: `${input.pendingChanges} ${plural} para a nuvem.`,
  };
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx tsx --test src/application/appShellViewModel.test.ts
```

Esperado: todos passam.

- [ ] **Passo 5: ligar no `App.tsx`**

Em `src/App.tsx`, onde `pendingChanges` já é calculado (por volta da linha 245), logo
depois acrescente:

```tsx
  const pendingDeliveryNotice = buildPendingDeliveryNotice({
    pendingChanges,
    connectivity: cloudSync.connectivity,
    hasOpenFailure: (cloudSync.syncIssueSummary?.openCount ?? 0) > 0,
  });
```

Ajuste `cloudSync` para o nome real da variável que recebe o retorno de `useCloudSync`
nesse arquivo. Importe `buildPendingDeliveryNotice` de `@app/appShellViewModel`.

Depois, no cabeçalho do `drawer-content` (perto da linha 1376), renderize o aviso como
faixa **clicável** que leva ao módulo de conta:

```tsx
  {pendingDeliveryNotice && (
    <button
      type="button"
      onClick={() => handleNav('conta')}
      className="w-full bg-warning/20 text-warning-content text-xs font-bold px-4 py-2 text-left"
    >
      {pendingDeliveryNotice.message} Toque para ver os detalhes.
    </button>
  )}
```

- [ ] **Passo 6: verificar no navegador**

```bash
npm run dev
```

Abra o app, entre na conta, e no console do navegador force o estado offline:

```js
window.dispatchEvent(new Event('offline'));
```

A faixa deve aparecer **se** houver pendente. Clique nela: deve levar a "Nuvem & Conta".
Se não houver pendente, a faixa não aparece — isso está correto.

- [ ] **Passo 7: rodar tudo e commitar**

```bash
npm test && npx vitest run && npx tsc --noEmit && npx vite build
git add src/application/appShellViewModel.ts src/application/appShellViewModel.test.ts src/App.tsx
git commit -m "feat(sync): warn that pending changes have not reached the cloud"
```

---

## Tarefa 11: Detecção e resolução de conflito

**Por que existe:** offline, a posse só pode ser **detectada** depois — se dois aparelhos
estão sem rede, nenhum sabe que o outro existe. Esta tarefa cobre esse caso.

**A regra que não pode ser quebrada:** os eventos **não são mesclados**. Mesclar por
relógio de celular gera placar dobrado. Preserva-se as duas versões e uma pessoa decide.

**A segunda regra:** conflito numa sessão **não** pode travar a entrega das outras.

**Arquivos:**
- Criar: `src/logic/syncConflicts.ts`
- Criar: `src/logic/syncConflicts.test.ts`
- Criar: `src/components/account/SyncConflictSection.tsx`
- Criar: `src/components/account/SyncConflictSection.spec.tsx`
- Modificar: `src/components/account/AccountSyncView.tsx`

**Interfaces:**
- Consome: `SessionControlRow` (Tarefa 8).
- Produz: `detectSessionConflicts(input): SessionConflict[]` e o componente
  `SyncConflictSection`.

- [ ] **Passo 1: escrever o teste que falha**

Crie `src/logic/syncConflicts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSessionConflicts } from './syncConflicts';

const evento = (sessionId: string, syncStatus: string) => ({ sessionId, syncStatus });

const controle = (userId: string) => ({
  controlled_by_user_id: userId, control_claimed_at: 'x', control_device_id: 'd',
});

test('detecta conflito quando marquei em sessao controlada por outra pessoa', () => {
  const conflitos = detectSessionConflicts({
    currentUserId: 'u-1',
    localPointEvents: [evento('s-1', 'pending'), evento('s-1', 'pending')],
    cloudSessionControl: { 's-1': controle('u-2') },
    cloudEventCounts: { 's-1': 19 },
    holderNames: { 'u-2': 'Ana' },
  });
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0].sessionId, 's-1');
  assert.equal(conflitos[0].localEventCount, 2);
  // Sem os DOIS numeros a pessoa nao tem como decidir qual versao vale.
  assert.equal(conflitos[0].holderEventCount, 19);
  assert.equal(conflitos[0].holderName, 'Ana');
});

test('nao ha conflito quando a sessao e minha', () => {
  assert.deepEqual(
    detectSessionConflicts({
      currentUserId: 'u-1',
      localPointEvents: [evento('s-1', 'pending')],
      cloudSessionControl: { 's-1': controle('u-1') },
      cloudEventCounts: {},
      holderNames: {},
    }),
    [],
  );
});

test('nao ha conflito com evento ja sincronizado', () => {
  // Ja subiu: nao ha o que decidir.
  assert.deepEqual(
    detectSessionConflicts({
      currentUserId: 'u-1',
      localPointEvents: [evento('s-1', 'synced')],
      cloudSessionControl: { 's-1': controle('u-2') },
      cloudEventCounts: { 's-1': 19 },
      holderNames: { 'u-2': 'Ana' },
    }),
    [],
  );
});

test('uma sessao em conflito nao contamina as outras', () => {
  // A entrega das demais nao pode ser travada por um conflito localizado.
  const conflitos = detectSessionConflicts({
    currentUserId: 'u-1',
    localPointEvents: [evento('s-1', 'pending'), evento('s-2', 'pending')],
    cloudSessionControl: { 's-1': controle('u-2') },
    cloudEventCounts: { 's-1': 19 },
    holderNames: { 'u-2': 'Ana' },
  });
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0].sessionId, 's-1');
  assert.equal(
    conflitos.some((c) => c.sessionId === 's-2'),
    false,
  );
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/logic/syncConflicts.test.ts
```

Esperado: FALHA — módulo não existe.

- [ ] **Passo 3: implementar a detecção**

Crie `src/logic/syncConflicts.ts`:

```ts
import type { SessionControlRow } from '@infra/supabase/sessionOwnershipCloudService';

export interface SessionConflict {
  sessionId: string;
  localEventCount: number;
  /** Quantos pontos a outra pessoa ja tem na nuvem para esta sessao. */
  holderEventCount: number;
  holderUserId: string;
  holderName: string | null;
}

/**
 * Encontra sessoes em que marquei placar offline enquanto outra pessoa detinha o
 * controle.
 *
 * O resultado e POR SESSAO de proposito: um conflito localizado nao pode travar a
 * entrega das demais sessoes.
 */
export function detectSessionConflicts(input: {
  currentUserId: string | null;
  localPointEvents: { sessionId: string; syncStatus?: string }[];
  cloudSessionControl: Record<string, SessionControlRow>;
  cloudEventCounts: Record<string, number>;
  holderNames: Record<string, string>;
}): SessionConflict[] {
  if (!input.currentUserId) return [];

  const porSessao = new Map<string, number>();
  for (const evento of input.localPointEvents) {
    // Evento ja sincronizado nao gera decisao: ele ja esta na nuvem.
    if (evento.syncStatus !== 'pending') continue;
    porSessao.set(evento.sessionId, (porSessao.get(evento.sessionId) ?? 0) + 1);
  }

  const conflitos: SessionConflict[] = [];
  for (const [sessionId, localEventCount] of porSessao) {
    const dono = input.cloudSessionControl[sessionId]?.controlled_by_user_id;
    if (!dono || dono === input.currentUserId) continue;
    conflitos.push({
      sessionId,
      localEventCount,
      holderEventCount: input.cloudEventCounts[sessionId] ?? 0,
      holderUserId: dono,
      holderName: input.holderNames[dono] ?? null,
    });
  }
  return conflitos;
}

```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx tsx --test src/logic/syncConflicts.test.ts
```

Esperado: `pass 4`.

- [ ] **Passo 5: escrever o teste da seção de conflitos**

Crie `src/components/account/SyncConflictSection.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SyncConflictSection } from './SyncConflictSection';

const conflito = {
  sessionId: 's-1', sessionName: 'Terça 19h', localEventCount: 21,
  holderUserId: 'u-2', holderName: 'Ana', holderEventCount: 19,
};

describe('SyncConflictSection', () => {
  it('nao aparece quando nao ha conflito', () => {
    const { container } = render(
      <SyncConflictSection conflicts={[]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('mostra as DUAS contagens, com nome', () => {
    // Sem os dois numeros a pessoa nao tem como decidir.
    render(<SyncConflictSection conflicts={[conflito]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />);
    expect(screen.getByText(/21/)).toBeTruthy();
    expect(screen.getByText(/19/)).toBeTruthy();
    expect(screen.getByText(/Ana/)).toBeTruthy();
  });

  it('deixa escolher qual versao vale', () => {
    const onKeepMine = vi.fn();
    const onKeepTheirs = vi.fn();
    render(
      <SyncConflictSection conflicts={[conflito]} onKeepMine={onKeepMine} onKeepTheirs={onKeepTheirs} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /manter o meu/i }));
    expect(onKeepMine).toHaveBeenCalledWith('s-1');
    fireEvent.click(screen.getByRole('button', { name: /manter o de ana/i }));
    expect(onKeepTheirs).toHaveBeenCalledWith('s-1');
  });

  it('avisa que nada e apagado', () => {
    // Regra do plano: nenhum descarte silencioso. A pessoa precisa saber disso
    // ANTES de escolher.
    render(<SyncConflictSection conflicts={[conflito]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />);
    expect(screen.getByText(/pode ser recuperad/i)).toBeTruthy();
  });
});
```

- [ ] **Passo 6: implementar a seção**

Crie `src/components/account/SyncConflictSection.tsx`:

```tsx
export interface SyncConflictItem {
  sessionId: string;
  sessionName: string;
  localEventCount: number;
  holderUserId: string;
  holderName: string | null;
  holderEventCount: number;
}

/**
 * Decisao humana sobre placares concorrentes.
 *
 * As versoes NAO sao mescladas: mesclar por relogio de celular gera placar dobrado.
 * A versao nao escolhida vira soft-delete, nunca apagada — e a tela diz isso antes
 * da escolha, para a decisao nao parecer irreversivel.
 */
export function SyncConflictSection({
  conflicts,
  onKeepMine,
  onKeepTheirs,
}: {
  conflicts: SyncConflictItem[];
  onKeepMine: (sessionId: string) => void;
  onKeepTheirs: (sessionId: string) => void;
}) {
  if (conflicts.length === 0) return null;

  return (
    <section className="card bg-base-200 border border-warning p-4 space-y-4">
      <h3 className="font-bold uppercase text-sm">Placares em conflito</h3>
      <p className="text-xs">
        Estas sessões foram marcadas em dois aparelhos ao mesmo tempo. Escolha qual versão
        vale. A outra não é apagada e pode ser recuperada depois.
      </p>

      {conflicts.map((c) => {
        const quem = c.holderName ?? 'A outra pessoa';
        return (
          <div key={c.sessionId} className="border-t border-base-300 pt-3 space-y-2">
            <p className="font-bold text-sm">{c.sessionName}</p>
            <p className="text-xs">
              Seu aparelho: <strong>{c.localEventCount}</strong> pontos · {quem}:{' '}
              <strong>{c.holderEventCount}</strong> pontos
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => onKeepMine(c.sessionId)}>
                Manter o meu
              </button>
              <button type="button" className="btn btn-sm" onClick={() => onKeepTheirs(c.sessionId)}>
                Manter o de {quem}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Passo 7: encaixar no `AccountSyncView`**

Em `src/components/account/AccountSyncView.tsx`, acrescente às props da interface
`AccountSyncViewProps`:

```tsx
  syncConflicts?: SyncConflictItem[];
  onKeepMineConflict?: (sessionId: string) => void;
  onKeepTheirsConflict?: (sessionId: string) => void;
```

E renderize a seção perto do topo do conteúdo, antes da lista de falhas de sync:

```tsx
      <SyncConflictSection
        conflicts={syncConflicts ?? []}
        onKeepMine={onKeepMineConflict ?? (() => {})}
        onKeepTheirs={onKeepTheirsConflict ?? (() => {})}
      />
```

- [ ] **Passo 8: rodar tudo**

```bash
npx vitest run && npm test && npx tsc --noEmit && npx vite build
```

Esperado: tudo verde.

- [ ] **Passo 9: commit**

```bash
git add src/logic/syncConflicts.ts src/logic/syncConflicts.test.ts src/components/account/SyncConflictSection.tsx src/components/account/SyncConflictSection.spec.tsx src/components/account/AccountSyncView.tsx
git commit -m "feat(sync): detect concurrent scoring and let a human decide"
```

---

## Tarefa 12: Ligar posse e conflito nos caminhos reais

**Por que existe — leia com atenção:** as Tarefas 7 a 11 produzem mecanismo. Sem esta
tarefa, **nada disso é chamado por lugar nenhum**, e o plano teria repetido o erro que
custou o outbox: peça construída, testada, e sem consumidor. Esta tarefa é o que
transforma as anteriores em comportamento.

Três ligações, todas obrigatórias:

1. A tela de sessão precisa **reivindicar** o controle ao abrir e **renderizar** o aviso.
2. O upload precisa **segurar** os eventos das sessões em conflito.
3. A escolha do conflito precisa **fazer alguma coisa** — hoje `onKeepMine` e
   `onKeepTheirs` não têm implementação.

**Arquivos:**
- Modificar: `src/components/live/SessionActiveView.tsx`
- Modificar: `src/hooks/useSessions.ts`
- Modificar: `src/infra/supabase/syncService.ts`
- Criar: `src/application/sessionConflictResolution.ts`
- Criar: `src/application/sessionConflictResolution.test.ts`

**Interfaces:**
- Consome: `resolveSessionControl`, `claimSessionControlCommand`,
  `transferSessionControlCommand` (Tarefa 8); `SessionOwnershipNotice` (Tarefa 9);
  `detectSessionConflicts` (Tarefa 11).
- Produz: `resolveConflictKeepingMine(input)` e `resolveConflictKeepingTheirs(input)`,
  ambos devolvendo a lista de `PointEvent` já ajustada.

- [ ] **Passo 1: escrever o teste da resolução**

Crie `src/application/sessionConflictResolution.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConflictKeepingMine,
  resolveConflictKeepingTheirs,
} from './sessionConflictResolution';

const ev = (id: string, sessionId: string, extra: Record<string, unknown> = {}) =>
  ({ id, sessionId, syncStatus: 'pending', ...extra }) as any;

test('manter o meu libera os eventos da sessao para subir', () => {
  const saida = resolveConflictKeepingMine({
    pointEvents: [ev('e-1', 's-1'), ev('e-2', 's-2')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  const meu = saida.find((e) => e.id === 'e-1')!;
  assert.equal(meu.conflictStatus, 'resolved_keep_mine');
  assert.equal(meu.syncStatus, 'pending');
  // A outra sessao nao pode ser tocada.
  assert.equal(saida.find((e) => e.id === 'e-2')!.conflictStatus, undefined);
});

test('manter o do outro faz soft-delete, nunca apaga', () => {
  // Regra do plano: nenhum descarte silencioso. O evento continua na lista, marcado.
  const saida = resolveConflictKeepingTheirs({
    pointEvents: [ev('e-1', 's-1')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  assert.equal(saida.length, 1, 'o evento nao pode sumir da lista');
  assert.equal(saida[0].deletedAt, '2026-07-31T12:00:00.000Z');
  assert.equal(saida[0].conflictStatus, 'resolved_keep_theirs');
});

test('resolver uma sessao nao mexe nas outras', () => {
  const saida = resolveConflictKeepingTheirs({
    pointEvents: [ev('e-1', 's-1'), ev('e-2', 's-2')],
    sessionId: 's-1',
    now: '2026-07-31T12:00:00.000Z',
  });
  assert.equal(saida.find((e) => e.id === 'e-2')!.deletedAt, undefined);
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
npx tsx --test src/application/sessionConflictResolution.test.ts
```

Esperado: FALHA — módulo não existe.

- [ ] **Passo 3: implementar a resolução**

Crie `src/application/sessionConflictResolution.ts`:

```ts
import type { PointEvent } from '../types';

export type ConflictStatus = 'pending_decision' | 'resolved_keep_mine' | 'resolved_keep_theirs';

interface Entrada {
  pointEvents: PointEvent[];
  sessionId: string;
  now: string;
}

/** Minha versao vale: os eventos seguem pendentes e voltam a poder subir. */
export function resolveConflictKeepingMine(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    evento.sessionId === input.sessionId
      ? ({ ...evento, conflictStatus: 'resolved_keep_mine' } as PointEvent)
      : evento,
  );
}

/**
 * A versao da outra pessoa vale.
 *
 * Os meus eventos viram SOFT-DELETE, nunca apagados: a regra do plano e que nenhum
 * placar desaparece em silencio, e o `deletedAt` mantem a linha recuperavel.
 */
export function resolveConflictKeepingTheirs(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    evento.sessionId === input.sessionId
      ? ({
          ...evento,
          deletedAt: input.now,
          syncStatus: 'pending',
          conflictStatus: 'resolved_keep_theirs',
        } as PointEvent)
      : evento,
  );
}
```

Se o TypeScript reclamar de `conflictStatus`, acrescente o campo opcional ao tipo
`PointEvent` em `src/shared/types/session.ts`:

```ts
  /** Marca de conflito de placar concorrente. Ausente = sem conflito. */
  conflictStatus?: 'pending_decision' | 'resolved_keep_mine' | 'resolved_keep_theirs';
```

- [ ] **Passo 4: rodar e ver passar**

```bash
npx tsx --test src/application/sessionConflictResolution.test.ts && npx tsc --noEmit
```

Esperado: `pass 3`, zero erro de tipo.

- [ ] **Passo 5a: marcar os eventos detectados como pendentes de decisão**

A detecção da Tarefa 11 devolve uma lista, mas **nada grava** essa informação nos
eventos — e o filtro do próximo passo lê exatamente esse campo. Sem este passo, o
filtro nunca encontra nada e a proteção não existe.

Acrescente a `src/application/sessionConflictResolution.ts`:

```ts
import type { SessionConflict } from '../logic/syncConflicts';

/**
 * Carimba os eventos das sessoes em conflito para que o upload saiba segura-los.
 *
 * A deteccao sozinha nao muda nada: e este carimbo, persistido junto com o evento,
 * que faz o filtro de upload funcionar e que mantem o conflito visivel entre
 * recarregamentos do app.
 */
export function markConflictedEvents(
  pointEvents: PointEvent[],
  conflicts: SessionConflict[],
): PointEvent[] {
  const emConflito = new Set(conflicts.map((c) => c.sessionId));
  if (emConflito.size === 0) return pointEvents;
  return pointEvents.map((evento) =>
    emConflito.has(evento.sessionId) &&
    (evento as { conflictStatus?: string }).conflictStatus === undefined
      ? ({ ...evento, conflictStatus: 'pending_decision' } as PointEvent)
      : evento,
  );
}
```

E o teste, no mesmo arquivo de teste da Tarefa 12:

```ts
import { markConflictedEvents } from './sessionConflictResolution';

test('marca so os eventos das sessoes em conflito', () => {
  const saida = markConflictedEvents(
    [ev('e-1', 's-1'), ev('e-2', 's-2')],
    [{ sessionId: 's-1', localEventCount: 1, holderEventCount: 2, holderUserId: 'u-2', holderName: 'Ana' }],
  );
  assert.equal((saida[0] as any).conflictStatus, 'pending_decision');
  assert.equal((saida[1] as any).conflictStatus, undefined);
});

test('nao sobrescreve uma decisao ja tomada', () => {
  // Se a pessoa ja decidiu, redetectar o conflito nao pode reabrir a decisao.
  const saida = markConflictedEvents(
    [ev('e-1', 's-1', { conflictStatus: 'resolved_keep_mine' })],
    [{ sessionId: 's-1', localEventCount: 1, holderEventCount: 2, holderUserId: 'u-2', holderName: 'Ana' }],
  );
  assert.equal((saida[0] as any).conflictStatus, 'resolved_keep_mine');
});
```

Chame `markConflictedEvents` no `useCloudSync`, logo depois de um download bem-sucedido —
é o momento em que se conhece o estado de controle da nuvem.

- [ ] **Passo 5b: segurar os eventos em conflito no upload**

Em `src/infra/supabase/syncService.ts`, dentro de `uploadLocalDataToCloud`, **antes** do
laço que sobe `pointEvents`, filtre:

```ts
    // Eventos de sessao em conflito nao sobem ate alguem decidir qual versao vale.
    // O filtro e POR SESSAO de proposito: as demais continuam subindo normalmente.
    const emConflito = new Set(
      local.pointEvents
        .filter((e) => (e as { conflictStatus?: string }).conflictStatus === 'pending_decision')
        .map((e) => e.sessionId),
    );
    const pointEventsParaSubir = local.pointEvents.filter((e) => !emConflito.has(e.sessionId));
```

E use `pointEventsParaSubir` no lugar de `local.pointEvents` **apenas nesse laço**.

- [ ] **Passo 5c: trazer os campos de controle para o `Session` local**

O passo seguinte lê `session.controlledByUserId`. Esses campos existem no banco desde a
Tarefa 7, mas **não chegam ao objeto local** — o mapeador de sessão não os conhece.

Em `src/shared/types/session.ts`, acrescente à interface `Session`:

```ts
  /** Quem está com o controle desta sessão. Preenchido pelo download. */
  controlledByUserId?: string | null;
  controlClaimedAt?: string | null;
  controlDeviceId?: string | null;
  /** Nome de exibição de quem controla, resolvido no download para a tela poder nomear. */
  controlHolderName?: string | null;
```

Em `src/infra/supabase/operationalCloudService.ts`, no mapeamento de sessão vindo da
nuvem (procure a função que converte a linha do banco em `Session`), acrescente:

```ts
    controlledByUserId: row.controlled_by_user_id ?? null,
    controlClaimedAt: row.control_claimed_at ?? null,
    controlDeviceId: row.control_device_id ?? null,
```

E no `select` de sessões desse mesmo arquivo, inclua as três colunas novas na lista —
se elas não estiverem no `select`, chegam `undefined` e o aviso nunca aparece.

`controlHolderName` é resolvido separadamente: a tela já tem a lista de membros da
comunidade; cruze `controlledByUserId` com ela. Se não encontrar, deixe `null` — o
componente já cai para "Outra pessoa".

- [ ] **Passo 6: reivindicar e avisar na tela de sessão**

Em `src/components/live/SessionActiveView.tsx`, no topo do componente, acrescente:

```tsx
  const [control, setControl] = useState<SessionControlView>({
    canScore: true, reason: 'free', message: '', holderName: null,
  });

  // A ORDEM importa. Primeiro decidimos a partir do estado que veio da nuvem, DEPOIS
  // reivindicamos — porque reivindicar grava o meu device_id, e a partir daí o caso
  // "minha sessao em outro aparelho" some e o aviso nunca apareceria.
  useEffect(() => {
    if (!session?.cloudId) return;

    const visao = resolveSessionControl({
      controlledByUserId: session.controlledByUserId ?? null,
      controlClaimedAt: session.controlClaimedAt ?? null,
      controlDeviceId: session.controlDeviceId ?? null,
      currentUserId,
      currentDeviceId: getOrCreateDeviceId(),
      holderName: session.controlHolderName ?? null,
    });
    setControl(visao);

    // Só reivindica quando já posso marcar. Se outra pessoa está com o controle, a
    // tomada é explícita, pelo botão — nunca automática ao abrir a tela.
    if (!visao.canScore) return;

    // Sem rede a chamada falha e seguimos marcando: offline a posse só pode ser
    // DETECTADA depois, no sync, nunca imposta aqui.
    void claimSessionControlCommand(session.cloudId).then((r) => {
      if (!isAppOk(r)) {
        setControl({
          canScore: false,
          reason: 'held_by_other',
          message: r.error.message,
          holderName: null,
        });
      }
    });
  }, [session?.cloudId, currentUserId]);
```

E renderize o aviso logo abaixo do cabeçalho da sessão:

```tsx
      <SessionOwnershipNotice
        control={control}
        onTakeControl={() => {
          if (!session?.cloudId) return;
          void transferSessionControlCommand(session.cloudId).then((r) => {
            if (isAppOk(r)) {
              setControl({ canScore: true, reason: 'mine', message: '', holderName: null });
            }
          });
        }}
      />
```

Por fim, desabilite os botões de marcar ponto quando `control.canScore === false`.
Procure os botões de placar nesse arquivo e acrescente `disabled={!control.canScore}`.

- [ ] **Passo 7: verificar no navegador — esta é a prova de que ligou**

```bash
npm run dev
```

Abra uma sessão ativa. No console:

```js
// Sem sessao na nuvem o aviso nao aparece; com ela, deve reivindicar ao abrir.
document.querySelector('[role="status"]')?.textContent;
```

Depois, para simular que outra pessoa está com o controle, use `execute_sql` numa
transação e observe a tela após recarregar:

```sql
begin;
update public.sessions set controlled_by_user_id = '<UUID_DE_OUTRA_CONTA>',
       control_claimed_at = now(), control_device_id = 'outro'
 where id = '<UUID_DA_SESSAO>';
-- recarregue o app AGORA e veja o aviso, depois:
rollback;
```

A tela deve mostrar o aviso e os botões de ponto devem estar desabilitados.

- [ ] **Passo 8: rodar tudo e commitar**

```bash
npm test && npx vitest run && npx tsc --noEmit && npx vite build
git add src/components/live/SessionActiveView.tsx src/infra/supabase/syncService.ts src/application/sessionConflictResolution.ts src/application/sessionConflictResolution.test.ts src/shared/types/session.ts
git commit -m "feat(session): wire ownership and conflict handling into the real paths"
```

---

## Tarefa 13: Registrar a exceção de UI e fechar o gate

**Por que existe:** o programa congela a UI até o Plano 5. O Plano 3B abriu exceção
registrada para a aba de linha do tempo; este plano abre outra. Sem registro, a regra
aparece violada sem explicação.

**Arquivos:**
- Modificar: `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
- Modificar: `docs/superpowers/specs/2026-07-30-plano-4-offline-operacional-design.md`

- [ ] **Passo 1: registrar a exceção no programa**

Em `docs/superpowers/plans/2026-07-22-scalable-product-program.md`, na seção
"Regras do programa", logo abaixo da exceção do Plano 3B, acrescente:

```markdown
  - **Exceção aberta no Plano 4 (decisão do usuário, 2026-07-30):** três acréscimos,
    sem item novo na barra lateral — aviso de posse na tela de sessão, seção de
    conflitos dentro de "Nuvem & Conta", e faixa clicável de trabalho não entregue.
    A navegação definitiva de sincronização é decisão do Plano 5, junto da arquitetura
    de informação centrada em comunidade. Ver
    `docs/superpowers/specs/2026-07-30-plano-4-offline-operacional-design.md`, seção 9.
```

- [ ] **Passo 2: atualizar o estado do plano na tabela**

Na tabela do mesmo arquivo, troque o estado da linha 4 para
`**Concluído** (`main`, <data>)` com a data real.

- [ ] **Passo 3: marcar o gate de conclusão**

Abra a seção 11 do spec e marque cada item **só depois de verificar**, anotando ao lado
o valor medido — não a expectativa. Itens de banco se verificam por `execute_sql` contra
o projeto real, não lendo o arquivo de migration.

- [ ] **Passo 4: conferir o `schema.sql` contra produção**

Siga `docs/operations/schema-drift-check.md`. É um procedimento manual, por MCP. O
resultado esperado é silêncio: nenhuma função ausente, nenhuma divergente.

- [ ] **Passo 5: verificação final**

```bash
npm test && npx vitest run && npx tsc --noEmit && npx vite build
```

E via MCP, `get_advisors` com `type: security` — não pode haver advertência nova além do
conjunto pré-existente conhecido.

- [ ] **Passo 6: commit**

```bash
git add docs/
git commit -m "docs(program): record the Plan 4 UI exception and close the gate"
```

---

## Ordem e dependências

```
Tarefa 1 (conectividade pura)
   └─> Tarefa 4 (hook) ─┐
Tarefa 2 (backoff) ──┬──┴─> Tarefa 5 (reenvio automatico) ─> Tarefa 10 (indicador)
                     └─> Tarefa 3 (ledger)

Tarefa 6 (device id) ─> Tarefa 7 (migration) ─> Tarefa 8 (regras) ─> Tarefa 9 (aviso)
                                                      └─> Tarefa 11 (conflito)

Tarefa 12 (LIGACAO: renderiza o aviso, segura o upload, resolve o conflito)
   ^-- sem ela as Tarefas 7-11 nao sao chamadas por lugar nenhum

Tarefa 12 (ligacao) depende dos dois blocos. Tarefa 13 (fechamento) depende de todas.
```

As Tarefas 1–5 e 6–9 são dois blocos independentes: dá para revisar um sem o outro. A
Tarefa 11 depende do bloco de posse. A Tarefa 10 depende do bloco de entrega.
