# Unificação da Navegação da Comunidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as dez abas de `CommunitiesView` por seis áreas de comunidade com endereço próprio, servidas pela barra lateral que já existe, sem quebrar nenhum link antigo.

**Architecture:** A tabela de rotas (`src/application/appRoutes.ts`) é pura e testada por testes de nó — ela muda primeiro, sozinha. Depois cada painel de aba sai de `CommunitiesView.tsx` para um arquivo em `src/components/community/areas/`, ganha um componente de rota em `src/app/routes/communityRoutes.tsx` e entra no `AppRouter`. Os painéis que duplicam um componente que a área de destino já renderiza são apagados depois de uma comparação registrada. A barra de abas sai por último, junto com o estado `activeTab`.

**Tech Stack:** React 19, react-router 7 (roteador declarativo `BrowserRouter`), TypeScript, Vitest + Testing Library (`.spec.tsx`), Node test runner (`.test.ts`), Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-21-community-navigation-unification-design.md`

## Global Constraints

- Worktree `C:\Volley-navegacao`, branch `exec/community-navigation`; nunca editar `C:\Volley`.
- Endereços exatos, como na spec: `/comunidades/:id`, `/pessoas`, `/sessoes`, `/sessoes/presenca`, `/sessoes/lista-whatsapp`, `/sessoes/torneios`, `/sessoes/nova`, `/sessoes/ativa`, `/sessoes/:sessionId`, `/ligas`, `/desempenho`, `/desempenho/historico`, `/gestao`, `/gestao/regras`, `/gestao/dados`, `/plataforma`.
- `/comunidades/:id/sessoes/:sessionId` é declarada **depois** das rotas fixas de `sessoes`.
- Redirecionamentos obrigatórios: `?aba=ranking` → `/desempenho`; `?aba=historico` → `/desempenho/historico`; `?sessao=<id>` → `/desempenho/historico?sessao=<id>`; `/admin` → `/plataforma`.
- Seis itens de comunidade na lateral, nesta ordem: Visão geral, Sessões, Pessoas, Ligas, Desempenho, Gestão — mais "Trocar comunidade".
- Gestão exige cargo na comunidade (`permissions.role !== null`); sem cargo, redireciona para a Visão geral.
- Texto em pt-BR. Sem comentários em código novo, salvo quando explicarem uma decisão não óbvia, como o repositório já faz.
- `npm run typecheck`, `npx eslint --quiet <arquivos>` e `npx prettier --write <arquivos>` a cada tarefa; `npm test` e `npm run check:architecture` na tarefa final.
- A guarda de alterações não salvas **não pode** usar `useBlocker`: o app monta `BrowserRouter`, e `useBlocker` exige roteador de dados. Ela é feita por link guardado, como descreve a Tarefa 2.

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/application/appRoutes.ts` | Endereços, redirecionamentos, itens da lateral, títulos |
| `src/application/appRoutes.test.ts` | Testes de tudo acima |
| `src/components/community/unsavedGuard.ts` | Registro da guarda (existe; ganha o leitor da guarda ativa) |
| `src/components/common/GuardedLink.tsx` | Link que pergunta antes de sair de um formulário sujo |
| `src/components/community/areas/CommunityOverviewArea.tsx` | Resumo da comunidade |
| `src/components/community/areas/CommunityPresenceArea.tsx` | Presença |
| `src/components/community/areas/CommunityWhatsAppArea.tsx` | Lista de WhatsApp |
| `src/components/community/areas/CommunityLeaguesArea.tsx` | Ligas da comunidade |
| `src/components/community/areas/CommunityRulesArea.tsx` | Regras |
| `src/components/community/areas/CommunityDataArea.tsx` | Dados |
| `src/components/community/areas/CommunityAreaTabs.tsx` | Abas de subárea, com link guardado |
| `src/app/routes/communityRoutes.tsx` | Um componente de rota por área |
| `src/app/AppRouter.tsx` | Declaração das rotas |
| `src/components/community/CommunitiesView.tsx` | Encolhe até a lista de comunidades |

---

### Task 1: Endereços, redirecionamentos e a lateral

**Files:**

- Modify: `src/application/appRoutes.ts`
- Test: `src/application/appRoutes.test.ts`

**Interfaces:**

- Consumes: `paths`, `segmentsOf`, `extractCommunityId`, `getShellNavigationItems`, `getPageTitleForPath`, `pathForLegacyPage` (já existem).
- Produces:
  - `paths.presenca(communityId)`, `paths.listaWhatsapp(communityId)`, `paths.ligasComunidade(communityId)`, `paths.historico(communityId, options?: { sessao?: string })`, `paths.regras(communityId)`, `paths.dados(communityId)`, `paths.plataforma`;
  - `paths.desempenho(communityId)` passa a receber **nenhuma** opção e devolve só a raiz;
  - `resolveLegacyQueryRoute(pathname: string, search: string): RouteResolution` — traduz `?aba=` e `/admin`;
  - `resolveCommunityAreaAccess(input: { area: string | null; hasRole: boolean; communityId: string }): RouteResolution`;
  - `getShellNavigationItems` devolve seis itens de comunidade.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/application/appRoutes.test.ts`, acrescentar ao final:

```ts
test('paths das areas novas da comunidade', () => {
  assert.equal(paths.presenca('c1'), '/comunidades/c1/sessoes/presenca');
  assert.equal(paths.listaWhatsapp('c1'), '/comunidades/c1/sessoes/lista-whatsapp');
  assert.equal(paths.ligasComunidade('c1'), '/comunidades/c1/ligas');
  assert.equal(paths.desempenho('c1'), '/comunidades/c1/desempenho');
  assert.equal(paths.historico('c1'), '/comunidades/c1/desempenho/historico');
  assert.equal(paths.historico('c1', { sessao: 's1' }), '/comunidades/c1/desempenho/historico?sessao=s1');
  assert.equal(paths.gestao('c1'), '/comunidades/c1/gestao');
  assert.equal(paths.regras('c1'), '/comunidades/c1/gestao/regras');
  assert.equal(paths.dados('c1'), '/comunidades/c1/gestao/dados');
  assert.equal(paths.plataforma, '/plataforma');
});

test('enderecos antigos redirecionam para os novos', () => {
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?aba=ranking'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?aba=historico'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho/historico',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', '?sessao=s1'), {
    kind: 'redirect',
    to: '/comunidades/c1/desempenho/historico?sessao=s1',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/admin', ''), {
    kind: 'redirect',
    to: '/plataforma',
  });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/desempenho', ''), { kind: 'ok' });
  assert.deepEqual(resolveLegacyQueryRoute('/comunidades/c1/gestao', ''), { kind: 'ok' });
});

test('gestao exige cargo na comunidade', () => {
  assert.deepEqual(
    resolveCommunityAreaAccess({ area: 'gestao', hasRole: false, communityId: 'c1' }),
    { kind: 'redirect', to: '/comunidades/c1' },
  );
  assert.deepEqual(resolveCommunityAreaAccess({ area: 'gestao', hasRole: true, communityId: 'c1' }), {
    kind: 'ok',
  });
  assert.deepEqual(
    resolveCommunityAreaAccess({ area: 'pessoas', hasRole: false, communityId: 'c1' }),
    { kind: 'ok' },
  );
});

test('a lateral da comunidade lista as seis areas e marca a ativa', () => {
  const items = getShellNavigationItems({
    pathname: '/comunidades/c1/gestao/regras',
    isStaff: false,
    pendingChanges: 0,
  });
  assert.deepEqual(
    items.map((item) => item.label),
    ['Visão geral', 'Sessões', 'Pessoas', 'Ligas', 'Desempenho', 'Gestão', 'Trocar comunidade'],
  );
  assert.deepEqual(
    items.filter((item) => item.active).map((item) => item.id),
    ['comunidade-gestao'],
  );

  const naPresenca = getShellNavigationItems({
    pathname: '/comunidades/c1/sessoes/presenca',
    isStaff: false,
    pendingChanges: 0,
  });
  assert.deepEqual(
    naPresenca.filter((item) => item.active).map((item) => item.id),
    ['comunidade-sessoes'],
  );
});

test('a plataforma substitui a administracao no menu e no titulo', () => {
  const items = getShellNavigationItems({ pathname: '/plataforma', isStaff: true, pendingChanges: 0 });
  const plataforma = items.find((item) => item.id === 'plataforma');
  assert.equal(plataforma?.label, 'Plataforma');
  assert.equal(plataforma?.to, '/plataforma');
  assert.equal(plataforma?.active, true);
  assert.equal(getPageTitleForPath('/plataforma'), 'Administração da plataforma');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao'), 'Gestão da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao/regras'), 'Regras da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/gestao/dados'), 'Dados da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/presenca'), 'Presença');
  assert.equal(getPageTitleForPath('/comunidades/c1/sessoes/lista-whatsapp'), 'Lista de WhatsApp');
  assert.equal(getPageTitleForPath('/comunidades/c1/ligas'), 'Ligas da Comunidade');
  assert.equal(getPageTitleForPath('/comunidades/c1/desempenho/historico'), 'Histórico');
});
```

E ajustar os testes antigos que esperam o formato velho: no teste `paths monta as rotas globais e as aninhadas de comunidade`, trocar `paths.admin` por `paths.plataforma` e o valor `'/admin'` por `'/plataforma'`; apagar por inteiro o teste `desempenho carrega aba e sessão como query deep-linkável`, substituído pelos dois testes acima; no teste `sidebar global expõe administração só para staff`, trocar o id esperado `admin` por `plataforma`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-navegacao && node --import tsx --test src/application/appRoutes.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|not ok" | head -8
```

Esperado: falhas nos testes novos (`paths.presenca is not a function`, `resolveLegacyQueryRoute is not defined`).

- [ ] **Step 3: Implementar a tabela de rotas**

Em `src/application/appRoutes.ts`, substituir a entrada `admin: '/admin',` por:

```ts
  plataforma: '/plataforma',
```

Substituir o bloco de `desempenho` inteiro (da linha `desempenho: (` até o fechamento `},` antes de `gestao:`) por:

```ts
  desempenho: (communityId: string) => `/comunidades/${communityId}/desempenho`,
  historico: (communityId: string, options?: { sessao?: string }) => {
    const base = `/comunidades/${communityId}/desempenho/historico`;
    return options?.sessao ? `${base}?sessao=${encodeURIComponent(options.sessao)}` : base;
  },
```

Substituir `gestao: (communityId: string) => \`/comunidades/${communityId}/gestao\`,` por:

```ts
  gestao: (communityId: string) => `/comunidades/${communityId}/gestao`,
  regras: (communityId: string) => `/comunidades/${communityId}/gestao/regras`,
  dados: (communityId: string) => `/comunidades/${communityId}/gestao/dados`,
  presenca: (communityId: string) => `/comunidades/${communityId}/sessoes/presenca`,
  listaWhatsapp: (communityId: string) => `/comunidades/${communityId}/sessoes/lista-whatsapp`,
  ligasComunidade: (communityId: string) => `/comunidades/${communityId}/ligas`,
```

Acrescentar, depois de `resolveAdminRoute`:

```ts
export function resolveLegacyQueryRoute(pathname: string, search: string): RouteResolution {
  if (pathname === '/admin') return { kind: 'redirect', to: paths.plataforma };

  const segments = segmentsOf(pathname);
  const isDesempenho =
    segments[0] === 'comunidades' && segments[1] && segments[2] === 'desempenho' && !segments[3];
  if (!isDesempenho) return { kind: 'ok' };

  const query = new URLSearchParams(search);
  const sessao = query.get('sessao');
  if (sessao) return { kind: 'redirect', to: paths.historico(segments[1], { sessao }) };
  const aba = query.get('aba');
  if (aba === 'historico') return { kind: 'redirect', to: paths.historico(segments[1]) };
  if (aba === 'ranking') return { kind: 'redirect', to: paths.desempenho(segments[1]) };
  return { kind: 'ok' };
}

export function resolveCommunityAreaAccess(input: {
  area: string | null;
  hasRole: boolean;
  communityId: string;
}): RouteResolution {
  if (input.area === 'gestao' && !input.hasRole) {
    return { kind: 'redirect', to: paths.comunidade(input.communityId) };
  }
  return { kind: 'ok' };
}
```

No bloco de comunidade de `getShellNavigationItems`, substituir a lista inteira de itens (de `return [` até o `];` que fecha o bloco `if (communityId) {`) por:

```ts
    return [
      {
        id: 'comunidade-visao-geral',
        label: 'Visão geral',
        icon: 'dashboard',
        to: paths.comunidade(communityId),
        active: area === null,
      },
      {
        id: 'comunidade-sessoes',
        label: 'Sessões',
        icon: 'tournament',
        to: paths.sessoes(communityId),
        active: area === 'sessoes',
      },
      {
        id: 'comunidade-pessoas',
        label: 'Pessoas',
        icon: 'players',
        to: paths.pessoas(communityId),
        active: area === 'pessoas',
      },
      {
        id: 'comunidade-ligas',
        label: 'Ligas',
        icon: 'tournament',
        to: paths.ligasComunidade(communityId),
        active: area === 'ligas',
      },
      {
        id: 'comunidade-desempenho',
        label: 'Desempenho',
        icon: 'ranking',
        to: paths.desempenho(communityId),
        active: area === 'desempenho',
      },
      {
        id: 'comunidade-gestao',
        label: 'Gestão',
        icon: 'settings',
        to: paths.gestao(communityId),
        active: area === 'gestao',
      },
      {
        id: 'voltar-comunidades',
        label: 'Trocar comunidade',
        icon: 'history',
        to: paths.comunidades,
        active: false,
      },
    ];
```

No bloco global da mesma função, trocar o item de administração por:

```ts
  if (input.isStaff) {
    items.push({
      id: 'plataforma',
      label: 'Plataforma',
      icon: 'settings',
      to: paths.plataforma,
      active: path.startsWith(paths.plataforma),
    });
  }
```

Se a forma atual do item de staff for diferente da acima, manter a forma existente e trocar só `id`, `label`, `to` e `active` pelos valores mostrados.

Em `getPageTitleForPath`, substituir a linha `if (segments[0] === 'admin') return 'Administração da Plataforma';` por:

```ts
  if (segments[0] === 'plataforma') return 'Administração da plataforma';
```

e, no `switch (segments[2])` da comunidade, garantir estes retornos:

```ts
    case 'sessoes':
      if (segments[3] === 'presenca') return 'Presença';
      if (segments[3] === 'lista-whatsapp') return 'Lista de WhatsApp';
      if (segments[3] === 'torneios') return 'Torneios';
      if (segments[3] === 'nova') return 'Nova Sessão';
      if (segments[3] === 'ativa') return 'Sessão em Andamento';
      return segments[3] ? 'Detalhes da Sessão' : 'Sessões da Comunidade';
    case 'ligas':
      return 'Ligas da Comunidade';
    case 'desempenho':
      return segments[3] === 'historico' ? 'Histórico' : 'Desempenho';
    case 'gestao':
      if (segments[3] === 'regras') return 'Regras da Comunidade';
      if (segments[3] === 'dados') return 'Dados da Comunidade';
      return 'Gestão da Comunidade';
```

Manter os demais `case` do `switch` como estão.

Em `pathForLegacyPage`, trocar `paths.desempenho(communityId, { aba: 'historico' })` por `paths.historico(communityId)`.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /c/Volley-navegacao && npx prettier --write src/application/appRoutes.ts src/application/appRoutes.test.ts > /dev/null && node --import tsx --test src/application/appRoutes.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck
```

Esperado: `ℹ fail 0`. O typecheck **vai falhar** nos chamadores de `paths.desempenho(...)` com opções e de `paths.admin` — é o esperado nesta tarefa; a Tarefa 7 e a Tarefa 8 os corrigem. Para manter a branch compilando, aplicar agora a correção mecânica: em `src/app/routes/communityRoutes.tsx` e em `src/app/routes/globalRoutes.tsx`, trocar `paths.desempenho(id, { aba: 'historico' })` por `paths.historico(id)`, `paths.desempenho(id, { sessao })` por `paths.historico(id, { sessao })`, `paths.desempenho(id, { aba: 'ranking' })` por `paths.desempenho(id)` e `paths.admin` por `paths.plataforma`.

Rodar de novo até `npm run typecheck` ficar silencioso.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-navegacao && npx eslint --quiet src/application/appRoutes.ts src/application/appRoutes.test.ts && git add -- src/application/appRoutes.ts src/application/appRoutes.test.ts src/app/routes/communityRoutes.tsx src/app/routes/globalRoutes.tsx && git commit -q -F - <<'EOF'
feat: enderecos das areas da comunidade e da plataforma

paths ganha presenca, lista-whatsapp, ligas da comunidade, historico, regras,
dados e plataforma; desempenho deixa de carregar aba na query.
resolveLegacyQueryRoute traduz ?aba= e /admin, resolveCommunityAreaAccess
protege a gestao, e a lateral passa a listar as seis areas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Guarda de alterações não salvas na navegação

**Files:**

- Modify: `src/components/community/unsavedGuard.ts`
- Create: `src/components/common/GuardedLink.tsx`
- Test: `src/components/common/GuardedLink.spec.tsx`

**Interfaces:**

- Consumes: `UnsavedGuard` (`{ dirty, save, label }`), `UnsavedGuardProvider`, `useUnsavedGuard` (já existem).
- Produces:
  - `useUnsavedGuardGate(): (to: string, navigate: (to: string) => void) => void` — dispara o diálogo quando há guarda suja;
  - `GuardedLink({ to, className, children, onNavigate })` — link que passa pelo portão;
  - `UnsavedGuardHost({ children })` — provê o registro e desenha o diálogo.

O app monta `BrowserRouter`, então `useBlocker` não existe aqui: a guarda vive nos links do app, que é exatamente a cobertura que a troca de aba tinha.

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/components/common/GuardedLink.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { GuardedLink, UnsavedGuardHost } from './GuardedLink';
import { useUnsavedGuard } from '../community/unsavedGuard';

function Formulario({ dirty, save }: { dirty: boolean; save: () => void }) {
  useUnsavedGuard({ dirty, save, label: 'Regras' });
  return <p>formulário</p>;
}

function Tela({ dirty, save }: { dirty: boolean; save: () => void }) {
  return (
    <MemoryRouter initialEntries={['/a']}>
      <UnsavedGuardHost>
        <GuardedLink to="/b">Ir para B</GuardedLink>
        <Routes>
          <Route path="/a" element={<Formulario dirty={dirty} save={save} />} />
          <Route path="/b" element={<p>destino</p>} />
        </Routes>
      </UnsavedGuardHost>
    </MemoryRouter>
  );
}

describe('GuardedLink', () => {
  it('navega direto quando não há alteração pendente', () => {
    render(<Tela dirty={false} save={vi.fn()} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    expect(screen.getByText('destino')).toBeDefined();
  });

  it('pergunta antes de sair, nomeando onde está o trabalho', () => {
    render(<Tela dirty save={vi.fn()} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    expect(screen.getByRole('dialog').textContent).toContain('Regras');
    expect(screen.queryByText('destino')).toBeNull();
  });

  it('salvar guarda o rascunho e segue', () => {
    const save = vi.fn();
    render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e sair' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('destino')).toBeDefined();
  });

  it('descartar segue sem salvar, e cancelar fica onde está', () => {
    const save = vi.fn();
    const { unmount } = render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('destino')).toBeDefined();
    unmount();

    render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByText('destino')).toBeNull();
    expect(screen.getByText('formulário')).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-navegacao && npx vitest run src/components/common/GuardedLink.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Esperado: `Failed to resolve import "./GuardedLink"`.

- [ ] **Step 3: Implementar**

Em `src/components/community/unsavedGuard.ts`, acrescentar ao final:

```ts
export function createUnsavedGuardStore() {
  let guard: UnsavedGuard | null = null;
  const listeners = new Set<() => void>();
  return {
    register(next: UnsavedGuard | null) {
      guard = next;
      listeners.forEach((listener) => listener());
    },
    read(): UnsavedGuard | null {
      return guard;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

Criar `src/components/common/GuardedLink.tsx`:

```tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  UnsavedGuardProvider,
  createUnsavedGuardStore,
  type UnsavedGuard,
} from '../community/unsavedGuard';

const store = createUnsavedGuardStore();

export function UnsavedGuardHost({ children }: { children: ReactNode }) {
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [guard, setGuard] = useState<UnsavedGuard | null>(null);
  const navigate = useNavigate();

  const register = useCallback((next: UnsavedGuard | null) => {
    store.register(next);
  }, []);

  const seguir = (salvar: boolean) => {
    const destino = pendingTo;
    const ativo = guard;
    setPendingTo(null);
    setGuard(null);
    if (salvar) ativo?.save();
    store.register(null);
    if (destino) navigate(destino);
  };

  const gate = useMemo(
    () => (to: string) => {
      const ativo = store.read();
      if (!ativo?.dirty) {
        navigate(to);
        return;
      }
      setGuard(ativo);
      setPendingTo(to);
    },
    [navigate],
  );

  return (
    <UnsavedGuardProvider value={register}>
      <GuardGateProvider value={gate}>
        {children}
        {pendingTo && guard && (
          <div className="modal modal-open" role="dialog" aria-labelledby="guarda-titulo">
            <div className="modal-box max-w-md space-y-5">
              <h3 id="guarda-titulo" className="text-lg font-black uppercase tracking-tight">
                Você tem alterações não salvas
              </h3>
              <p className="text-sm leading-relaxed text-base-content/70">
                O que você digitou em <strong>{guard.label}</strong> ainda não foi salvo. Sair agora
                descarta essas alterações.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <button type="button" className="btn btn-primary" onClick={() => seguir(true)}>
                  Salvar e sair
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => seguir(false)}>
                  Sair sem salvar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPendingTo(null);
                    setGuard(null);
                  }}
                >
                  Continuar editando
                </button>
              </div>
            </div>
          </div>
        )}
      </GuardGateProvider>
    </UnsavedGuardProvider>
  );
}

export function GuardedLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const gate = useGuardGate();
  return (
    <Link
      to={to}
      className={className}
      onClick={(event) => {
        if (!gate) return;
        event.preventDefault();
        gate(to);
      }}
    >
      {children}
    </Link>
  );
}
```

Acrescentar, no topo do mesmo arquivo, o contexto do portão:

```tsx
import { createContext, useContext } from 'react';

type GuardGate = (to: string) => void;
const GuardGateContext = createContext<GuardGate | null>(null);
const GuardGateProvider = GuardGateContext.Provider;

function useGuardGate(): GuardGate | null {
  return useContext(GuardGateContext);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /c/Volley-navegacao && npx prettier --write src/components/common/GuardedLink.tsx src/components/common/GuardedLink.spec.tsx src/components/community/unsavedGuard.ts > /dev/null && npx vitest run src/components/common/GuardedLink.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/components/common/GuardedLink.tsx src/components/common/GuardedLink.spec.tsx src/components/community/unsavedGuard.ts
```

Esperado: `Tests  4 passed (4)`, typecheck silencioso, sem erro de ESLint.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-navegacao && git add -- src/components/common/GuardedLink.tsx src/components/common/GuardedLink.spec.tsx src/components/community/unsavedGuard.ts && git commit -q -F - <<'EOF'
feat: guarda de alteracoes nao salvas na navegacao

A troca de aba vira navegacao, entao a guarda sai do seletor de abas e passa a
viver no link: GuardedLink pergunta antes de sair de um formulario sujo, e
UnsavedGuardHost desenha o dialogo com salvar, descartar e continuar. O app usa
BrowserRouter, onde useBlocker do react-router nao existe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Área Gestão — Membros, Regras e Dados

**Files:**

- Create: `src/components/community/areas/CommunityRulesArea.tsx`, `src/components/community/areas/CommunityDataArea.tsx`, `src/components/community/areas/CommunityAreaTabs.tsx`
- Modify: `src/components/community/CommunitiesView.tsx` (remove os dois painéis e as abas correspondentes), `src/app/routes/communityRoutes.tsx`, `src/app/AppRouter.tsx`, `src/app/AppShell.tsx`
- Test: `src/app/routes/communityAreas.spec.tsx` (criar)

**Interfaces:**

- Consumes: `paths.gestao`, `paths.regras`, `paths.dados`, `resolveCommunityAreaAccess` (Tarefa 1); `GuardedLink`, `UnsavedGuardHost` (Tarefa 2); `useCommunityPermissions(community)`; `getCommunityPlayers(communityId, players)`; `rulesApi.getRules(community)`.
- Produces:
  - `CommunityAreaTabs({ items }: { items: { to: string; label: string; active: boolean }[] })`;
  - `CommunityRulesArea(props)` e `CommunityDataArea(props)` — mesmas propriedades que `CommunityRulesTab` e `CommunityDataTab` recebem hoje;
  - rotas `CommunityGestaoRoute` (Membros), `CommunityRulesRoute`, `CommunityDataRoute`.

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/routes/communityAreas.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CommunityAreaTabs } from '../../components/community/areas/CommunityAreaTabs';

describe('CommunityAreaTabs', () => {
  it('desenha uma aba por subárea, com link e a ativa marcada', () => {
    render(
      <MemoryRouter initialEntries={['/comunidades/c1/gestao/regras']}>
        <Routes>
          <Route
            path="/comunidades/:communityId/gestao/regras"
            element={
              <CommunityAreaTabs
                items={[
                  { to: '/comunidades/c1/gestao', label: 'Membros', active: false },
                  { to: '/comunidades/c1/gestao/regras', label: 'Regras', active: true },
                  { to: '/comunidades/c1/gestao/dados', label: 'Dados', active: false },
                ]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const abas = screen.getAllByRole('tab');
    expect(abas.map((aba) => aba.textContent)).toEqual(['Membros', 'Regras', 'Dados']);
    expect(abas[1].getAttribute('aria-selected')).toBe('true');
    expect(abas[0].getAttribute('href')).toBe('/comunidades/c1/gestao');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-navegacao && npx vitest run src/app/routes/communityAreas.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Esperado: `Failed to resolve import ".../CommunityAreaTabs"`.

- [ ] **Step 3: Criar a barra de subáreas**

Criar `src/components/community/areas/CommunityAreaTabs.tsx`:

```tsx
import { GuardedLink } from '../../common/GuardedLink';

export interface CommunityAreaTabItem {
  to: string;
  label: string;
  active: boolean;
}

export function CommunityAreaTabs({ items }: { items: CommunityAreaTabItem[] }) {
  return (
    <div role="tablist" className="tabs tabs-box flex-wrap justify-start">
      {items.map((item) => (
        <GuardedLink
          key={item.to}
          to={item.to}
          className={`tab whitespace-nowrap ${item.active ? 'tab-active' : ''}`}
        >
          {item.label}
        </GuardedLink>
      ))}
    </div>
  );
}
```

`GuardedLink` renderiza um `Link`, que vira `<a href>`; para o `role="tab"` e o `aria-selected` que o spec exige, acrescentar essas propriedades ao `GuardedLink` em `src/components/common/GuardedLink.tsx`:

```tsx
export function GuardedLink({
  to,
  className,
  children,
  role,
  ariaSelected,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  role?: string;
  ariaSelected?: boolean;
}) {
  const gate = useGuardGate();
  return (
    <Link
      to={to}
      className={className}
      role={role}
      aria-selected={ariaSelected}
      onClick={(event) => {
        if (!gate) return;
        event.preventDefault();
        gate(to);
      }}
    >
      {children}
    </Link>
  );
}
```

e passar `role="tab"` e `ariaSelected={item.active}` em `CommunityAreaTabs`.

- [ ] **Step 4: Extrair Regras e Dados para arquivos próprios**

Imprimir cada bloco para mover:

```bash
cd /c/Volley-navegacao && sed -n '3073,3220p' src/components/community/CommunitiesView.tsx > /tmp/regras.tsx && sed -n '3297,3467p' src/components/community/CommunitiesView.tsx > /tmp/dados.tsx && wc -l /tmp/regras.tsx /tmp/dados.tsx
```

Criar `src/components/community/areas/CommunityRulesArea.tsx` com o conteúdo de `/tmp/regras.tsx`, renomeando a função para `CommunityRulesArea`, exportando-a, e acrescentando no topo os imports que o TypeScript pedir — tipicamente:

```tsx
import { useState } from 'react';
import type { CommunityRules } from '../../../types';
import { useUnsavedGuard } from '../unsavedGuard';
```

Criar `src/components/community/areas/CommunityDataArea.tsx` com o conteúdo de `/tmp/dados.tsx`, renomeando a função para `CommunityDataArea` e exportando-a.

Os blocos usam funções auxiliares que vivem entre os painéis em `CommunitiesView.tsx` (por exemplo as linhas 3221–3296, entre Regras e Dados). Mover para o arquivo da área cada auxiliar que **só** ela usa; deixar em `CommunitiesView.tsx` as que outro painel ainda usa e importá-las de lá exportando-as. O compilador é o juiz: rodar `npm run typecheck` e mover o que ele acusar como ausente, um símbolo por vez.

As propriedades não mudam: `CommunityRulesArea` recebe `{ rules, onSave, canEditRules }` e `CommunityDataArea` recebe `{ community, players, sessions, onUpdateCommunity, onDeleteCommunity, onDuplicateCommunity, onClearCommunityHistory, canEditRules, canDeleteCommunity, canClearHistory }`.

- [ ] **Step 5: Ligar as três rotas de Gestão**

Em `src/app/routes/communityRoutes.tsx`, substituir a função `CommunityGestaoRoute` inteira por:

```tsx
function useGestaoContext() {
  const shell = useCommunityShell();
  const navigate = useNavigate();
  const { community, play, sess, comm, communityRules, auth } = shell;
  const permissions = useCommunityPermissions(community);
  const acesso = resolveCommunityAreaAccess({
    area: 'gestao',
    hasRole: permissions.role !== null,
    communityId: community.id,
  });
  return { shell, navigate, community, play, sess, comm, communityRules, auth, permissions, acesso };
}

function GestaoTabs({ communityId, ativa }: { communityId: string; ativa: 'membros' | 'regras' | 'dados' }) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.gestao(communityId), label: 'Membros', active: ativa === 'membros' },
        { to: paths.regras(communityId), label: 'Regras', active: ativa === 'regras' },
        { to: paths.dados(communityId), label: 'Dados', active: ativa === 'dados' },
      ]}
    />
  );
}

export function CommunityGestaoRoute() {
  const { community, play, auth, acesso } = useGestaoContext();
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <div className="space-y-5">
      <GestaoTabs communityId={community.id} ativa="membros" />
      <CommunityMembersPanel
        community={community}
        currentUserId={auth.user?.id ?? null}
        isSupabaseConfigured={auth.isSupabaseConfigured}
        globalRole={auth.profile?.role ?? null}
        players={communityPlayers}
        onLinkedPlayer={(player, communityId) =>
          play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId))
        }
      />
    </div>
  );
}

export function CommunityRulesRoute() {
  const { community, communityRules, permissions, acesso } = useGestaoContext();
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;

  return (
    <div className="space-y-5">
      <GestaoTabs communityId={community.id} ativa="regras" />
      <CommunityRulesArea
        rules={communityRules.getRules(community)}
        canEditRules={permissions.canEditRules}
        onSave={(draftRules) => {
          try {
            communityRules.saveRules(draftRules, permissions.canEditRules);
          } catch (err: any) {
            if (err.message === 'PERMISSION_DENIED') {
              alert('Erro: Ação não autorizada pelo nível de permissão.');
            }
          }
        }}
      />
    </div>
  );
}

export function CommunityDataRoute() {
  const { shell, navigate, community, play, sess, comm, permissions, acesso } = useGestaoContext();
  if (acesso.kind === 'redirect') return <Navigate to={acesso.to} replace />;

  return (
    <div className="space-y-5">
      <GestaoTabs communityId={community.id} ativa="dados" />
      <CommunityDataArea
        community={community}
        players={play.players}
        sessions={sess.sessions}
        canEditRules={permissions.canEditRules}
        canDeleteCommunity={permissions.canDeleteCommunity}
        canClearHistory={permissions.canClearHistory}
        onUpdateCommunity={(id, patch) => {
          try {
            return comm.updateCommunity(id, patch, permissions.canEditRules);
          } catch (err: any) {
            if (err.message === 'PERMISSION_DENIED') {
              alert('Erro: Ação não autorizada pelo nível de permissão.');
            }
            return false;
          }
        }}
        onDeleteCommunity={(id) => {
          if (!permissions.canDeleteCommunity) {
            alert('Erro: Ação não autorizada pelo nível de permissão.');
            return;
          }
          if (!window.confirm('Excluir esta comunidade? Os atletas continuarão cadastrados.')) {
            return;
          }
          shell.deleteCommunityAggregate(id);
          navigate(paths.comunidades);
        }}
        onDuplicateCommunity={(id, includeAthletes) => {
          const result = comm.duplicateCommunity(id, includeAthletes);
          if (result?.includeAthletes) {
            play.setPlayers((prev) =>
              applyCommunityMembershipDuplicate(prev, {
                sourceCommunityId: id,
                duplicateCommunityId: result.duplicate.id,
              }),
            );
          }
        }}
        onClearCommunityHistory={(id) => {
          if (!permissions.canClearHistory) {
            alert('Erro: Ação não autorizada pelo nível de permissão.');
            return;
          }
          sess.setSessions((prev) => applyCommunityHistoryClear(prev, id));
        }}
      />
    </div>
  );
}
```

Acrescentar ao topo do arquivo os imports necessários:

```tsx
import { Navigate, useNavigate } from 'react-router';
import { paths, resolveCommunityAreaAccess } from '@app/appRoutes';
import {
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLinkedCloudPlayer,
} from '@app/localCommunityUseCases';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { getCommunityPlayers } from '@logic/communityScope';
import { CommunityMembersPanel } from '../../components/community/CommunityMembersPanel';
import { CommunityAreaTabs } from '../../components/community/areas/CommunityAreaTabs';
import { CommunityRulesArea } from '../../components/community/areas/CommunityRulesArea';
import { CommunityDataArea } from '../../components/community/areas/CommunityDataArea';
```

Se algum destes já estiver importado no arquivo, não duplicar; se `getCommunityPlayers` vier de outro caminho no arquivo atual, usar o caminho que já está lá.

Em `src/app/AppRouter.tsx`, substituir:

```tsx
              <Route path="gestao" element={<CommunityGestaoRoute />} />
```

por:

```tsx
              <Route path="gestao" element={<CommunityGestaoRoute />} />
              <Route path="gestao/regras" element={<CommunityRulesRoute />} />
              <Route path="gestao/dados" element={<CommunityDataRoute />} />
```

e acrescentar `CommunityRulesRoute` e `CommunityDataRoute` à importação de `./routes/communityRoutes`.

Em `src/app/AppShell.tsx`, envolver o conteúdo do shell com o host da guarda: localizar `<main` e o seu fechamento `</main>`, e trocar o elemento `<Outlet />` que está dentro por:

```tsx
<UnsavedGuardHost>
  <Outlet />
</UnsavedGuardHost>
```

importando `UnsavedGuardHost` de `../components/common/GuardedLink`.

- [ ] **Step 6: Tirar as três abas de `CommunitiesView`**

Em `src/components/community/CommunitiesView.tsx`:

- apagar os blocos `{activeTab === 'members' && (...)}`, `{activeTab === 'rules' && (...)}` e `{activeTab === 'data' && (...)}`;
- apagar as funções `CommunityRulesTab` e `CommunityDataTab`, já movidas;
- remover `'members'`, `'rules'` e `'data'` de `TAB_ITEMS`;
- remover o filtro `visibleTabs` que existia só para `members`, deixando `const visibleTabs = TAB_ITEMS;`.

Remover de `CommunityTab`, em `src/application/screens/communitiesView/communitiesViewModel.ts`, os membros `'members'`, `'rules'` e `'data'`.

- [ ] **Step 7: Verificar**

```bash
cd /c/Volley-navegacao && F="src/components/community/areas/CommunityAreaTabs.tsx src/components/community/areas/CommunityRulesArea.tsx src/components/community/areas/CommunityDataArea.tsx src/components/common/GuardedLink.tsx src/app/routes/communityRoutes.tsx src/app/AppRouter.tsx src/app/AppShell.tsx src/components/community/CommunitiesView.tsx src/application/screens/communitiesView/communitiesViewModel.ts src/app/routes/communityAreas.spec.tsx" && npx prettier --write $F > /dev/null && npm run typecheck && npx vitest run src/app src/components/community 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npx eslint --quiet $F
```

Esperado: typecheck silencioso; specs passando. Os testes de `CommunitiesView.spec.tsx` que exercitam as abas Membros, Regras ou Dados falham aqui — mover cada um para `src/app/routes/communityAreas.spec.tsx`, adaptando o render para a rota correspondente, e apagar do arquivo antigo. Repetir até a suíte ficar verde.

- [ ] **Step 8: Commit**

```bash
cd /c/Volley-navegacao && git add -A -- src/components/community src/components/common src/app src/application/screens/communitiesView && git commit -q -F - <<'EOF'
feat: gestao da comunidade reune membros, regras e dados

Gestao deixa de abrir Regras e passa a abrir Membros, com Regras e Dados como
subareas de endereco proprio. Os dois paineis saem de CommunitiesView para
arquivos proprios, e quem nao tem cargo na comunidade e mandado para a visao
geral.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Área Sessões — lista, Presença e Lista de WhatsApp

**Files:**

- Create: `src/components/community/areas/CommunityPresenceArea.tsx`, `src/components/community/areas/CommunityWhatsAppArea.tsx`
- Modify: `src/components/community/CommunitiesView.tsx`, `src/app/routes/sessionRoutes.tsx`, `src/app/AppRouter.tsx`, `src/application/screens/communitiesView/communitiesViewModel.ts`
- Test: `src/app/routes/communityAreas.spec.tsx`

**Interfaces:**

- Consumes: `paths.sessoes`, `paths.presenca`, `paths.listaWhatsapp`, `paths.torneios` (Tarefa 1); `CommunityAreaTabs` (Tarefa 3); `presenceApi` e `whatsAppApi` do shell (`communityPresence`, `whatsAppLists`).
- Produces: `CommunityPresenceArea(props)` e `CommunityWhatsAppArea(props)` — mesmas propriedades de hoje; rotas `CommunityPresenceRoute` e `CommunityWhatsAppRoute`; `SessoesTabs` interna.

- [ ] **Step 1: Escrever o spec que falha**

Acrescentar a `src/app/routes/communityAreas.spec.tsx`:

```tsx
import { CommunityAreaTabs as Tabs } from '../../components/community/areas/CommunityAreaTabs';

describe('abas da área Sessões', () => {
  it('lista as quatro subáreas na ordem do uso', () => {
    render(
      <MemoryRouter initialEntries={['/comunidades/c1/sessoes/presenca']}>
        <Tabs
          items={[
            { to: '/comunidades/c1/sessoes', label: 'Sessões', active: false },
            { to: '/comunidades/c1/sessoes/presenca', label: 'Presença', active: true },
            { to: '/comunidades/c1/sessoes/lista-whatsapp', label: 'Lista de WhatsApp', active: false },
            { to: '/comunidades/c1/sessoes/torneios', label: 'Torneios', active: false },
          ]}
        />
      </MemoryRouter>,
    );
    const abas = screen.getAllByRole('tab');
    expect(abas.map((aba) => aba.textContent)).toEqual([
      'Sessões',
      'Presença',
      'Lista de WhatsApp',
      'Torneios',
    ]);
    expect(abas[1].getAttribute('aria-selected')).toBe('true');
  });
});
```

- [ ] **Step 2: Rodar e ver passar esse spec, e falhar o resto**

```bash
cd /c/Volley-navegacao && npx vitest run src/app/routes/communityAreas.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×"
```

Esperado: passa — a barra já existe desde a Tarefa 3. O que falta é ligar as rotas, feito nos passos seguintes; a prova real é o spec de rota do Passo 5.

- [ ] **Step 3: Extrair os dois painéis**

```bash
cd /c/Volley-navegacao && sed -n '2251,2415p' src/components/community/CommunitiesView.tsx > /tmp/presenca.tsx && sed -n '2450,2763p' src/components/community/CommunitiesView.tsx > /tmp/whats.tsx && wc -l /tmp/presenca.tsx /tmp/whats.tsx
```

Criar `src/components/community/areas/CommunityPresenceArea.tsx` com o conteúdo de `/tmp/presenca.tsx`, função renomeada para `CommunityPresenceArea` e exportada. Propriedades: `{ community, players, presenceApi, onCreateSession, canCreateSession }`.

Criar `src/components/community/areas/CommunityWhatsAppArea.tsx` com o conteúdo de `/tmp/whats.tsx`, função renomeada para `CommunityWhatsAppArea` e exportada. Propriedades: `{ community, players, whatsAppApi, canCreateSession, canEditRules }`.

Mover junto os auxiliares que só esses painéis usam (as linhas 2416–2449 e 2764–2829 são candidatas); o `npm run typecheck` acusa o que faltar.

- [ ] **Step 4: Ligar as rotas**

Em `src/app/routes/sessionRoutes.tsx`, acrescentar a barra de subáreas à rota da lista e criar as duas rotas novas:

```tsx
function SessoesTabs({
  communityId,
  ativa,
}: {
  communityId: string;
  ativa: 'lista' | 'presenca' | 'whatsapp' | 'torneios';
}) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.sessoes(communityId), label: 'Sessões', active: ativa === 'lista' },
        { to: paths.presenca(communityId), label: 'Presença', active: ativa === 'presenca' },
        {
          to: paths.listaWhatsapp(communityId),
          label: 'Lista de WhatsApp',
          active: ativa === 'whatsapp',
        },
        { to: paths.torneios(communityId), label: 'Torneios', active: ativa === 'torneios' },
      ]}
    />
  );
}

export function CommunityPresenceRoute() {
  const shell = useCommunityShell();
  const { community, play, communityPresence, communityRules } = shell;
  const permissions = useCommunityPermissions(community);
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="presenca" />
      <CommunityPresenceArea
        community={community}
        players={communityPlayers}
        presenceApi={communityPresence}
        canCreateSession={permissions.canCreateSession}
        onCreateSession={() =>
          shell.createSessionFromCommunity(
            community,
            communityPresence
              .getPresentPlayers(community.id, communityPlayers)
              .map((player) => player.id),
            communityRules.getRules(community),
          )
        }
      />
    </div>
  );
}

export function CommunityWhatsAppRoute() {
  const shell = useCommunityShell();
  const { community, play, whatsAppLists } = shell;
  const permissions = useCommunityPermissions(community);

  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="whatsapp" />
      <CommunityWhatsAppArea
        community={community}
        players={getCommunityPlayers(community.id, play.players)}
        whatsAppApi={whatsAppLists}
        canCreateSession={permissions.canCreateSession}
        canEditRules={permissions.canEditRules}
      />
    </div>
  );
}
```

Na `CommunitySessionsRoute` existente, envolver o `<HistoryView .../>` que ela já devolve:

```tsx
  return (
    <div className="space-y-5">
      <SessoesTabs communityId={community.id} ativa="lista" />
      <HistoryView contract={/* o mesmo contrato que já está ali */} />
    </div>
  );
```

E na `CommunityTournamentsRoute`, do mesmo jeito, com `ativa="torneios"`.

Em `src/app/AppRouter.tsx`, acrescentar as rotas **antes** de `sessoes/:sessionId`:

```tsx
              <Route path="sessoes/presenca" element={<CommunityPresenceRoute />} />
              <Route path="sessoes/lista-whatsapp" element={<CommunityWhatsAppRoute />} />
```

e incluir os dois nomes na importação de `./routes/sessionRoutes`.

- [ ] **Step 5: Spec de rota**

Acrescentar a `src/app/routes/communityAreas.spec.tsx` um teste que prova a ordem das rotas:

```tsx
import { resolveLegacyQueryRoute } from '@app/appRoutes';

describe('ordem das rotas de sessão', () => {
  it('presenca e lista-whatsapp não são lidos como id de sessão', () => {
    expect('/comunidades/c1/sessoes/presenca'.split('/').pop()).toBe('presenca');
    expect(resolveLegacyQueryRoute('/comunidades/c1/sessoes/presenca', '')).toEqual({ kind: 'ok' });
  });
});
```

A prova de verdade é o spec do roteador já existente em `src/app/AppRouter.spec.tsx`: acrescentar lá um caso que renderiza `/comunidades/c1/sessoes/presenca` e espera o título "Presença", seguindo o padrão dos casos que já existem no arquivo.

- [ ] **Step 6: Tirar as abas de `CommunitiesView`**

Apagar os blocos `{activeTab === 'presence' && (...)}`, `{activeTab === 'whatsapp' && (...)}` e `{activeTab === 'sessions' && (...)}`; apagar as funções `CommunityPresenceTab`, `CommunityWhatsAppListTab` e `CommunitySessionsTab`; remover `'presence'`, `'whatsapp'` e `'sessions'` de `TAB_ITEMS` e do tipo `CommunityTab`.

`CommunitySessionsTab` some sem substituto porque a área Sessões já renderiza `HistoryView` com `initialTab: 'sessions'` e `hideTabs: true`. Antes de apagar, comparar as duas listas e anotar no commit o que a aba tinha e a área não: ação de repetir sessão, colunas, estado vazio. O que faltar vai para o contrato de `HistoryView` na mesma tarefa.

- [ ] **Step 7: Verificar e commitar**

```bash
cd /c/Volley-navegacao && F="src/components/community/areas/CommunityPresenceArea.tsx src/components/community/areas/CommunityWhatsAppArea.tsx src/app/routes/sessionRoutes.tsx src/app/AppRouter.tsx src/components/community/CommunitiesView.tsx src/application/screens/communitiesView/communitiesViewModel.ts src/app/routes/communityAreas.spec.tsx src/app/AppRouter.spec.tsx" && npx prettier --write $F > /dev/null && npm run typecheck && npx vitest run src/app src/components/community 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npx eslint --quiet $F && git add -A -- src/components/community src/app src/application/screens/communitiesView && git commit -q -F - <<'EOF'
feat: presenca e lista de whatsapp viram subareas de sessoes

Preparar a pelada passa a morar junto das sessoes: lista, presenca, lista de
WhatsApp e torneios, cada uma com endereco proprio. A aba Sessoes e apagada
porque a area ja renderiza o mesmo historico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Área Ligas da comunidade

**Files:**

- Create: `src/components/community/areas/CommunityLeaguesArea.tsx`
- Modify: `src/components/community/CommunitiesView.tsx`, `src/app/routes/communityRoutes.tsx`, `src/app/AppRouter.tsx`, `src/application/screens/communitiesView/communitiesViewModel.ts`

**Interfaces:**

- Consumes: `paths.ligasComunidade` (Tarefa 1); `championships` do shell (`championships.championships`, `championshipTeams`, `championshipRounds`, `create`, `rescheduleRound`, `setRoundSkipped`, `updateRecurrence`), `shell.materializeChampionshipRound`, `shell.deleteChampionshipAggregate`.
- Produces: `CommunityLeaguesArea(props)` — as mesmas propriedades de `ChampionshipsTab`; rota `CommunityLeaguesRoute`.

- [ ] **Step 1: Extrair o painel**

```bash
cd /c/Volley-navegacao && sed -n '1311,1961p' src/components/community/CommunitiesView.tsx > /tmp/ligas.tsx && wc -l /tmp/ligas.tsx
```

Criar `src/components/community/areas/CommunityLeaguesArea.tsx` com esse conteúdo, função renomeada para `CommunityLeaguesArea` e exportada. Propriedades: `{ community, players, games, pointEvents, sessionTeams, championships, championshipTeams, championshipRounds, canManage, onCreateChampionship, onMaterializeRound, onDeleteChampionship, onRescheduleRound, onSetRoundSkipped, onUpdateChampionshipRecurrence }`.

`ChampionshipsTab` é exportada hoje; conferir se alguém a importa de fora (`grep -rn "ChampionshipsTab" src --include=*.tsx | grep -v CommunitiesView`) e atualizar esses pontos para o nome novo.

- [ ] **Step 2: Ligar a rota**

Em `src/app/routes/communityRoutes.tsx`:

```tsx
export function CommunityLeaguesRoute() {
  const shell = useCommunityShell();
  const { community, play, sess, championships } = shell;
  const permissions = useCommunityPermissions(community);

  return (
    <CommunityLeaguesArea
      community={community}
      players={getCommunityPlayers(community.id, play.players)}
      games={sess.games}
      pointEvents={sess.pointEvents}
      sessionTeams={sess.teams}
      championships={championships.championships}
      championshipTeams={championships.championshipTeams}
      championshipRounds={championships.championshipRounds}
      canManage={permissions.canEditRules}
      onCreateChampionship={championships.create}
      onMaterializeRound={shell.materializeChampionshipRound}
      onDeleteChampionship={shell.deleteChampionshipAggregate}
      onRescheduleRound={championships.rescheduleRound}
      onSetRoundSkipped={championships.setRoundSkipped}
      onUpdateChampionshipRecurrence={championships.updateRecurrence}
    />
  );
}
```

Em `src/app/AppRouter.tsx`, acrescentar dentro do bloco da comunidade, junto das demais áreas:

```tsx
              <Route path="ligas" element={<CommunityLeaguesRoute />} />
```

- [ ] **Step 3: Tirar a aba**

Apagar o bloco `{activeTab === 'championships' && (...)}`, a função `ChampionshipsTab` e o item `'championships'` de `TAB_ITEMS` e do tipo `CommunityTab`.

- [ ] **Step 4: Verificar e commitar**

```bash
cd /c/Volley-navegacao && F="src/components/community/areas/CommunityLeaguesArea.tsx src/app/routes/communityRoutes.tsx src/app/AppRouter.tsx src/components/community/CommunitiesView.tsx src/application/screens/communitiesView/communitiesViewModel.ts" && npx prettier --write $F > /dev/null && npm run typecheck && npx vitest run src/app src/components/community 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npx eslint --quiet $F && git add -A -- src/components/community src/app src/application/screens/communitiesView && git commit -q -F - <<'EOF'
feat: ligas da comunidade viram area com endereco proprio

O painel de campeonatos sai de CommunitiesView para a area Ligas, ao lado das
demais, e some da barra de abas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Visão geral, e o fim da barra de abas

**Files:**

- Create: `src/components/community/areas/CommunityOverviewArea.tsx`
- Modify: `src/components/community/CommunitiesView.tsx`, `src/components/community/CommunitiesView.spec.tsx`, `src/app/routes/communityRoutes.tsx`, `src/application/screens/communitiesView/communitiesViewModel.ts`, `src/app/routes/communitiesContract.ts`
- Test: `src/app/routes/communityAreas.spec.tsx`

**Interfaces:**

- Consumes: `paths.listaWhatsapp`, `paths.pessoas` (Tarefa 1); `getCommunitySummary` (já usado por `CommunityDetailView`).
- Produces: `CommunityOverviewArea(props)` com `{ community, players, sessions, games, pointEvents, sessionReports, onCreateSession, canCreateSession, canManageRoster }` — sem `onGoToWhatsApp` e `onGoToPlayers`, que viram links; `CommunityOverviewRoute` renderizando-a.

- [ ] **Step 1: Extrair o resumo**

```bash
cd /c/Volley-navegacao && sed -n '1086,1206p' src/components/community/CommunitiesView.tsx > /tmp/resumo.tsx && wc -l /tmp/resumo.tsx
```

Criar `src/components/community/areas/CommunityOverviewArea.tsx` com esse conteúdo, função renomeada para `CommunityOverviewArea` e exportada. Trocar os dois botões que chamavam `onGoToWhatsApp` e `onGoToPlayers` por links, mantendo as mesmas classes:

```tsx
<GuardedLink to={paths.listaWhatsapp(community.id)} className="btn btn-sm btn-primary">
  Lista de WhatsApp
</GuardedLink>
<GuardedLink to={paths.pessoas(community.id)} className="btn btn-sm">
  Atletas
</GuardedLink>
```

Remover `onGoToWhatsApp` e `onGoToPlayers` das propriedades.

- [ ] **Step 2: Apagar a barra de abas e os dois painéis duplicados**

Em `src/components/community/CommunitiesView.tsx`:

- apagar as funções `CommunityPlayersTab`, `CommunityRankingTab` e `CommunitySummaryTab`;
- apagar `TAB_ITEMS`, `visibleTabs`, `activeTab`, `setActiveTab`, `pedirTroca`, `resolverTroca`, `abaPendente`, `guardaRef`, `registrarGuarda`, o `UnsavedGuardProvider` e o modal de aba pendente;
- apagar `CommunityDetailView` inteira, já que sua última responsabilidade era hospedar as abas;
- em `CommunitiesView`, quando existe comunidade selecionada, redirecionar para a área: o componente passa a servir só `/comunidades` (lista, criação, descoberta e entrada por código).

Remover `initialCommunityTab` e o tipo `CommunityTab` de `communitiesViewModel.ts`, do contrato e de `src/app/routes/communitiesContract.ts`.

Antes de apagar `CommunityPlayersTab` e `CommunityRankingTab`, comparar cada um com `PlayersView` e com `RankingModule`, que as áreas Pessoas e Desempenho já renderizam. Anotar no corpo do commit o que existia só na aba e foi levado para o componente que fica — ou, se nada faltava, que a comparação não achou diferença.

- [ ] **Step 3: Visão geral vira rota**

Em `src/app/routes/communityRoutes.tsx`, substituir `CommunityOverviewRoute` por:

```tsx
export function CommunityOverviewRoute() {
  const shell = useCommunityShell();
  const { community, play, sess, communityRules } = shell;
  const permissions = useCommunityPermissions(community);
  const communityPlayers = getCommunityPlayers(community.id, play.players);

  return (
    <CommunityOverviewArea
      community={community}
      players={play.players}
      sessions={sess.sessions}
      games={sess.games}
      pointEvents={sess.pointEvents}
      sessionReports={sess.sessionReports}
      canCreateSession={permissions.canCreateSession}
      canManageRoster={permissions.canEditPlayerProfile}
      onCreateSession={() =>
        shell.createSessionFromCommunity(
          community,
          communityPlayers.filter((player) => player.ativo).map((player) => player.id),
          communityRules.getRules(community),
        )
      }
    />
  );
}
```

- [ ] **Step 4: Verificar e commitar**

```bash
cd /c/Volley-navegacao && npx prettier --write src/components/community src/app/routes src/application/screens/communitiesView > /dev/null && npm run typecheck && npx vitest run src/app src/components 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npx eslint --quiet src/components/community/areas/CommunityOverviewArea.tsx src/components/community/CommunitiesView.tsx src/app/routes/communityRoutes.tsx && wc -l src/components/community/CommunitiesView.tsx
```

Esperado: typecheck silencioso, specs verdes, e `CommunitiesView.tsx` abaixo de 1.200 linhas. Os testes de `CommunitiesView.spec.tsx` que exercitavam abas já movidas devem ter migrado nas tarefas anteriores; o que sobrar e falhar aqui vai para `communityAreas.spec.tsx`.

```bash
cd /c/Volley-navegacao && git add -A -- src/components/community src/app src/application/screens/communitiesView && git commit -q -F - <<'EOF'
feat: visao geral vira area e a barra de abas some

O resumo sai para a sua propria area, com links no lugar dos botoes que
trocavam de aba. CommunitiesView fica so com a lista de comunidades, a criacao,
a descoberta e a entrada por codigo. As abas Atletas e Ranking sao apagadas
porque Pessoas e Desempenho ja renderizam PlayersView e RankingModule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Desempenho com Histórico no caminho

**Files:**

- Modify: `src/app/routes/communityRoutes.tsx` (`CommunityPerformanceRoute`), `src/app/AppRouter.tsx`
- Create: `src/app/routes/LegacyQueryRedirect.tsx`
- Test: `src/app/routes/communityAreas.spec.tsx`

**Interfaces:**

- Consumes: `paths.desempenho`, `paths.historico`, `resolveLegacyQueryRoute` (Tarefa 1); `CommunityAreaTabs` (Tarefa 3).
- Produces: `CommunityPerformanceRoute` (só ranking), `CommunityHistoryRoute` (histórico), `LegacyQueryRedirect({ children })` — redireciona quando o endereço antigo com `?aba=` chega.

- [ ] **Step 1: Escrever o spec que falha**

Acrescentar a `src/app/routes/communityAreas.spec.tsx`:

```tsx
import { LegacyQueryRedirect } from './LegacyQueryRedirect';

describe('LegacyQueryRedirect', () => {
  it('manda ?aba=historico para o caminho do histórico', () => {
    render(
      <MemoryRouter initialEntries={['/comunidades/c1/desempenho?aba=historico']}>
        <Routes>
          <Route
            path="/comunidades/:communityId/desempenho"
            element={
              <LegacyQueryRedirect>
                <p>ranking</p>
              </LegacyQueryRedirect>
            }
          />
          <Route path="/comunidades/:communityId/desempenho/historico" element={<p>histórico</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('histórico')).toBeDefined();
  });

  it('deixa passar o endereço já novo', () => {
    render(
      <MemoryRouter initialEntries={['/comunidades/c1/desempenho']}>
        <Routes>
          <Route
            path="/comunidades/:communityId/desempenho"
            element={
              <LegacyQueryRedirect>
                <p>ranking</p>
              </LegacyQueryRedirect>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('ranking')).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-navegacao && npx vitest run src/app/routes/communityAreas.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Esperado: `Failed to resolve import "./LegacyQueryRedirect"`.

- [ ] **Step 3: Implementar o redirecionador e as duas rotas**

Criar `src/app/routes/LegacyQueryRedirect.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { resolveLegacyQueryRoute } from '@app/appRoutes';

export function LegacyQueryRedirect({ children }: { children: ReactNode }) {
  const location = useLocation();
  const resolution = resolveLegacyQueryRoute(location.pathname, location.search);
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;
  return <>{children}</>;
}
```

Em `src/app/routes/communityRoutes.tsx`, substituir `CommunityPerformanceRoute` inteira por duas rotas, cada uma com a barra de subáreas:

```tsx
function DesempenhoTabs({
  communityId,
  ativa,
}: {
  communityId: string;
  ativa: 'ranking' | 'historico';
}) {
  return (
    <CommunityAreaTabs
      items={[
        { to: paths.desempenho(communityId), label: 'Ranking', active: ativa === 'ranking' },
        { to: paths.historico(communityId), label: 'Histórico', active: ativa === 'historico' },
      ]}
    />
  );
}

export function CommunityPerformanceRoute() {
  const { community, play, sess } = useCommunityShell();
  const communityPlayers = getCommunityPlayers(community.id, play.players);
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <LegacyQueryRedirect>
      <div className="space-y-5">
        <DesempenhoTabs communityId={community.id} ativa="ranking" />
        <RankingModule
          players={communityPlayers}
          games={sess.games}
          pointEvents={sess.pointEvents}
          teams={sess.teams}
          sessions={communitySessions}
        />
      </div>
    </LegacyQueryRedirect>
  );
}

export function CommunityHistoryRoute() {
  const { community, play, sess } = useCommunityShell();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedSessionId = searchParams.get('sessao');
  const communitySessions = getCommunitySessions(community.id, sess.sessions);

  return (
    <div className="space-y-5">
      <DesempenhoTabs communityId={community.id} ativa="historico" />
      <HistoryView
        contract={buildHistoryViewContract({
          sessions: communitySessions,
          games: sess.games,
          pointEvents: sess.pointEvents,
          teams: sess.teams,
          players: play.players,
          sessionReports: sess.sessionReports,
          selectedHistorySessionId: selectedSessionId,
          setSelectedHistorySessionId: (id) =>
            navigate(id ? paths.historico(community.id, { sessao: id }) : paths.historico(community.id)),
          onDeleteSession: (sessionId) => {
            sess.deleteSession(sessionId);
            navigate(paths.historico(community.id));
          },
          onBackToDashboard: () => navigate(paths.comunidade(community.id)),
          initialTab: 'sessions',
          hideTabs: false,
        })}
      />
    </div>
  );
}
```

Em `src/app/AppRouter.tsx`, acrescentar a rota do histórico logo depois da de desempenho:

```tsx
              <Route path="desempenho/historico" element={<CommunityHistoryRoute />} />
```

e incluir `CommunityHistoryRoute` na importação.

- [ ] **Step 4: Verificar e commitar**

```bash
cd /c/Volley-navegacao && F="src/app/routes/LegacyQueryRedirect.tsx src/app/routes/communityRoutes.tsx src/app/AppRouter.tsx src/app/routes/communityAreas.spec.tsx" && npx prettier --write $F > /dev/null && npx vitest run src/app 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet $F && git add -A -- src/app && git commit -q -F - <<'EOF'
feat: historico da comunidade ganha caminho proprio

Desempenho deixa de usar ?aba=: ranking e historico viram caminhos, e
LegacyQueryRedirect traduz os enderecos antigos, inclusive o ?sessao= que
abria uma sessao especifica.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Administração da plataforma em `/plataforma`

**Files:**

- Modify: `src/app/AppRouter.tsx`, `src/app/routes/globalRoutes.tsx`
- Test: `src/app/AppRouter.spec.tsx`

**Interfaces:**

- Consumes: `paths.plataforma`, `resolveLegacyQueryRoute`, `resolveAdminRoute` (Tarefa 1); `LegacyQueryRedirect` (Tarefa 7).
- Produces: rota `/plataforma` servida por `AdminRoute`; `/admin` redirecionando.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/app/AppRouter.spec.tsx`, acrescentar, seguindo o padrão dos casos que já existem no arquivo para rotas protegidas:

```tsx
it('/admin redireciona para /plataforma', async () => {
  renderAppAt('/admin');
  await waitFor(() => expect(window.location.pathname).toBe('/plataforma'));
});
```

Se o arquivo não tiver `renderAppAt`, usar o mesmo utilitário de render que os outros casos do arquivo usam, com a rota inicial `/admin`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Volley-navegacao && npx vitest run src/app/AppRouter.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | head -5
```

Esperado: o caso novo falha, porque `/admin` ainda renderiza a tela.

- [ ] **Step 3: Trocar a rota**

Em `src/app/AppRouter.tsx`, substituir:

```tsx
            <Route path="/admin" element={<AdminRoute />} />
```

por:

```tsx
            <Route path="/plataforma" element={<AdminRoute />} />
            <Route path="/admin" element={<Navigate to="/plataforma" replace />} />
```

`Navigate` já está importado no arquivo.

Em `src/app/routes/globalRoutes.tsx`, nenhuma mudança de lógica é necessária: `resolveAdminRoute` continua mandando quem não é staff para o painel. Conferir se algum texto da tela diz "Administração da Plataforma" com maiúscula no meio e alinhar com o título novo, "Administração da plataforma".

- [ ] **Step 4: Verificar e commitar**

```bash
cd /c/Volley-navegacao && npx prettier --write src/app/AppRouter.tsx src/app/AppRouter.spec.tsx src/app/routes/globalRoutes.tsx > /dev/null && npx vitest run src/app 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/app/AppRouter.tsx src/app/AppRouter.spec.tsx src/app/routes/globalRoutes.tsx && git add -A -- src/app && git commit -q -F - <<'EOF'
feat: administracao da plataforma sai de /admin para /plataforma

O nome Gestao fica reservado a comunidade. /admin redireciona, entao nenhum
link antigo quebra.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Ponta a ponta, documentação e todos os gates

**Files:**

- Modify: `e2e/03-roles-and-permissions.spec.ts`, `e2e/04-player-management.spec.ts`, `e2e/05-session-wizard.spec.ts`, `e2e/06-live-session.spec.ts`, `e2e/10-settings-and-sync.spec.ts`
- Modify: `HANDOFF.md`
- Modify: `docs/architecture/execution/C6-REACHABILITY-MAP.md`

**Interfaces:**

- Consumes: as rotas das Tarefas 1 a 8.
- Produces: documentação; nenhum código novo.

- [ ] **Step 1: Atualizar os testes de ponta a ponta**

```bash
cd /c/Volley-navegacao && grep -rn "goto('/" e2e/*.ts | grep -E "comunidades|admin" | cut -c1-120
```

Para cada endereço listado, aplicar a tradução da spec: `/admin` vira `/plataforma`; `?aba=historico` vira `/desempenho/historico`; endereços de comunidade que apontavam para uma aba passam a apontar para a área correspondente. Um endereço que continua válido não muda.

- [ ] **Step 2: Rodar o e2e**

```bash
cd /c/Volley-navegacao && npx playwright test 2>&1 | tail -15
```

Esperado: a mesma contagem de antes, 12 passando. Se o Playwright não tiver navegador instalado nesta máquina, registrar isso no commit e seguir — os testes de unidade e de interface cobrem as rotas.

- [ ] **Step 3: HANDOFF e mapa de alcançabilidade**

Em `HANDOFF.md`, inserir antes da linha `### O que a XS-W6-03 entregou — publicação do conjunto de candidatos`:

```markdown
### Navegação da comunidade unificada — 2026-09-21

Branch `exec/community-navigation`, worktree `C:\Volley-navegacao`. Ver a
[spec](docs/superpowers/specs/2026-09-21-community-navigation-unification-design.md) e o
[plano](docs/superpowers/plans/2026-09-21-community-navigation-unification.md).

A comunidade tinha duas navegações: cinco áreas na lateral e dez abas dentro da Visão geral, com
quatro pares cobrindo o mesmo conteúdo. As abas não entravam na URL. Agora são seis áreas — Visão
geral, Sessões, Pessoas, Ligas, Desempenho e Gestão —, cada uma com endereço próprio, e as subáreas
(presença, lista de WhatsApp, torneios, histórico, regras, dados) também.

- Gestão passou a abrir Membros, com Regras e Dados ao lado; era a área que abria Regras enquanto
  Membros ficava escondido numa aba.
- `/admin` virou `/plataforma`, encerrando a colisão de nomes com Gestão.
- Nenhum endereço antigo quebrou: `?aba=` e `?sessao=` do Desempenho e `/admin` redirecionam.
- Três painéis foram apagados por duplicarem o componente que a área já renderiza: Atletas, Ranking
  e Sessões.
- A guarda de alterações não salvas saiu do seletor de abas e passou para os links, porque o app
  monta `BrowserRouter` e `useBlocker` exige roteador de dados.

`CommunitiesView.tsx` caiu de 3.483 linhas para o tamanho registrado no commit final.
```

Em `docs/architecture/execution/C6-REACHABILITY-MAP.md`, atualizar os caminhos citados no texto que mencionem abas da comunidade, usando os endereços novos. Rodar `grep -n "aba\|activeTab" docs/architecture/execution/C6-REACHABILITY-MAP.md` e ajustar só o que estiver desatualizado.

- [ ] **Step 4: Rodar todos os gates**

```bash
cd /c/Volley-navegacao && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues'; \
npm test > /tmp/nav-test.log 2>&1; grep -E "^ℹ (pass|fail)|Tests +[0-9]|Test Files" /tmp/nav-test.log; \
npm run check:architecture > /dev/null && echo ARCH ok && npm run build > /tmp/nav-build.log 2>&1 && echo BUILD ok
```

Esperado: typecheck silencioso; sem erro de ESLint; sem `[warn]` do Prettier; unitários e de interface com `fail 0`; `ARCH ok`; `BUILD ok`.

A suíte de banco não é tocada por esta fatia — nenhuma migration muda. Rodar mesmo assim, uma vez, para provar que nada regrediu:

```bash
cd /c/Volley-navegacao && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db > /tmp/nav-db.log 2>&1; grep -E "^ℹ (tests|pass|fail)" /tmp/nav-db.log
```

Esperado: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-navegacao && git add -A -- e2e HANDOFF.md docs/architecture/execution/C6-REACHABILITY-MAP.md && git commit -q -F - <<'EOF'
docs: registra a unificacao da navegacao da comunidade

Os testes de ponta a ponta passam a usar os enderecos novos, o HANDOFF descreve
a fatia e o mapa de alcancabilidade cita as areas em vez das abas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -10 && git status --short && wc -l src/components/community/CommunitiesView.tsx
```

Esperado: a spec mais nove commits, `git status` limpo, e `CommunitiesView.tsx` bem abaixo das 3.483 linhas do início.
