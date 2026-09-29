# Quem organiza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As ações de pelada, torneio, liga e histórico aparecem só para quem o servidor deixa
fazê-las, e o quadro da inscrição mostra quem organiza a pelada.

**Architecture:** O cliente passa a perguntar ao servidor a capacidade `session.manage` (e
`community.profile.update` para ligas) pela leitura que já existe
(`current_user_has_community_capability`), por uma função pura e dois hooks; sem nuvem, vale o cargo
como hoje. Uma RPC de leitura nova devolve o nome de quem organiza a pelada.

**Tech Stack:** React 19 + Vite 6 + TypeScript, Supabase Postgres, Node test runner, Vitest + RTL,
Postgres real (`*.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-29-quem-organiza-design.md`

## Global Constraints

- "Organiza pelada" = `session.manage` na nuvem (comunidade com `cloudId` **e** Supabase
  configurado); sem nuvem, `permissions.canCreateSession` (o cargo).
- Criar/excluir/aprovar em ligas = `canEditRules` (dono e admin); na nuvem, a capacidade
  `community.profile.update`, que o servidor dá exatamente a dono e admin.
- Excluir histórico = `canClearHistory` (dono).
- Enquanto a capacidade carrega: ações de comunidade **desabilitadas**; no painel, "Nova Sessão"
  **não aparece**.
- Textos exatos: "Organiza: \<nome\>"; "Você não administra nenhuma comunidade para criar uma liga."
- Sem comentários novos em TS/TSX; SQL com comentário curto do porquê. Commits em português sem
  acento, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nada em produção sem ok
  do usuário.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/domain/communityPermissions.ts` (+ teste) | `canManageSessions` (pura) |
| `src/application/communityCapabilitiesUseCases.ts` (+ teste) | lista de capacidades lidas |
| `src/hooks/useCanManageSessions.ts` (novo) | o sinal para uma comunidade |
| `src/hooks/useCommunitiesWithCapability.ts` (novo) | o sinal para várias comunidades |
| telas de comunidade e rotas (`communityRoutes.tsx`, `sessionRoutes.tsx`, `CommunitiesView.tsx`) | usam o sinal |
| `src/components/tournaments/TournamentsModule.tsx` (+ spec) | P13 |
| `src/app/routes/globalRoutes.tsx`, `src/application/screens/dashboard/*`, `src/components/dashboard/Dashboard.tsx` | P14 |
| `src/components/championship/ChampionshipDetailView.tsx`, `ChampionshipWizardView.tsx` | P12 |
| `src/application/screens/historyView/*`, `src/components/history/HistoryView.tsx` | P11 |
| `supabase/migrations/20260929140000_quem_organiza.sql`, `src/test/db/quemOrganiza.dbtest.ts`, `src/infra/supabase/sessionOrganizerCloudService.ts` (novo), `RegistrationBoardView.tsx` | P15 |

---

### Task 1: O sinal "organiza pelada"

**Files:**
- Modify: `src/domain/communityPermissions.ts`, `src/domain/communityPermissions.test.ts`
- Modify: `src/application/communityCapabilitiesUseCases.ts` (~linha 8) + teste
- Create: `src/hooks/useCanManageSessions.ts`, `src/hooks/useCommunitiesWithCapability.ts`
  (+ `src/hooks/useCommunitiesWithCapability.spec.tsx`)

**Interfaces:**
- Produces:
  - `canManageSessions(input: { cloud: boolean; capabilities: ReadonlySet<string>; resolved: boolean; roleCanCreateSession: boolean }): { allowed: boolean; pending: boolean }`
  - `useCanManageSessions(community: Community | null): { allowed: boolean; pending: boolean }`
  - `useCommunitiesWithCapability(communities: Community[], capability: string, roleAllows: (community: Community) => boolean): { allowedIds: ReadonlySet<string>; pending: boolean }`
    — para cada comunidade: na nuvem, pergunta `capability` ao servidor; sem nuvem, `roleAllows`.

- [ ] **Step 1: Testes que falham**

Em `src/domain/communityPermissions.test.ts`:

```ts
test('canManageSessions: na nuvem vale o servidor, sem nuvem o cargo', () => {
  const vazio = new Set<string>();
  const organiza = new Set(['session.manage']);
  assert.deepEqual(
    canManageSessions({ cloud: true, capabilities: organiza, resolved: true, roleCanCreateSession: false }),
    { allowed: true, pending: false },
  );
  assert.deepEqual(
    canManageSessions({ cloud: true, capabilities: vazio, resolved: true, roleCanCreateSession: true }),
    { allowed: false, pending: false },
  );
  assert.deepEqual(
    canManageSessions({ cloud: true, capabilities: vazio, resolved: false, roleCanCreateSession: true }),
    { allowed: false, pending: true },
  );
  assert.deepEqual(
    canManageSessions({ cloud: false, capabilities: vazio, resolved: false, roleCanCreateSession: true }),
    { allowed: true, pending: false },
  );
});
```

Em `communityCapabilitiesUseCases.test.ts` (existente): o carregamento pergunta também
`session.manage` e `community.profile.update` (o gateway falso registra as capacidades pedidas).

`src/hooks/useCommunitiesWithCapability.spec.tsx` (com `vi.mock('@app/communityCapabilitiesUseCases')`
e `vi.mock` do `useAuth` no padrão de `src/hooks/useCommunityCapabilities` — veja se há spec dele e
copie o jeito de mockar): duas comunidades na nuvem, o servidor dá a capacidade só na primeira →
`allowedIds` tem só a primeira; comunidade sem `cloudId` entra por `roleAllows`; enquanto
carrega, `pending: true`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
node --import tsx --test src/domain/communityPermissions.test.ts src/application/communityCapabilitiesUseCases.test.ts
npx vitest run src/hooks/useCommunitiesWithCapability.spec.tsx
```

- [ ] **Step 3: Implementar**

`src/domain/communityPermissions.ts`:

```ts
export function canManageSessions(input: {
  cloud: boolean;
  capabilities: ReadonlySet<string>;
  resolved: boolean;
  roleCanCreateSession: boolean;
}): { allowed: boolean; pending: boolean } {
  if (!input.cloud) return { allowed: input.roleCanCreateSession, pending: false };
  if (!input.resolved) return { allowed: false, pending: true };
  return { allowed: input.capabilities.has('session.manage'), pending: false };
}
```

`communityCapabilitiesUseCases.ts`:
`export const CAPABILITIES_OF_INTEREST = ['player.evaluate', 'session.manage', 'community.profile.update'] as const;`

`src/hooks/useCanManageSessions.ts`:

```ts
import type { Community } from '@shared/types';
import { canManageSessions } from '@domain/communityPermissions';
import { useAuth } from './useAuth';
import { useCommunityCapabilities } from './useCommunityCapabilities';
import { useCommunityPermissions } from './useCommunityPermissions';

export function useCanManageSessions(community: Community | null) {
  const auth = useAuth();
  const permissions = useCommunityPermissions(community);
  const { capabilities, resolved } = useCommunityCapabilities(community);
  return canManageSessions({
    cloud: auth.isSupabaseConfigured && !!community?.cloudId && !!auth.user,
    capabilities,
    resolved,
    roleCanCreateSession: permissions.canCreateSession,
  });
}
```

`src/hooks/useCommunitiesWithCapability.ts`: um `useEffect` que, para as comunidades com `cloudId`
(e Supabase configurado e usuário), chama `loadCommunityCapabilities(cloudId, userId)` e junta as
que devolvem `capability`; as sem nuvem entram se `roleAllows(community)`. Estado com a chave
`${ids}:${userId}` para descartar respostas velhas (mesmo padrão de `useCommunityCapabilities.ts`
— leia e siga). `pending` até todas responderem.

- [ ] **Step 4: Rodar e ver passar** — os comandos do Step 2 e `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/communityPermissions.ts src/domain/communityPermissions.test.ts src/application/communityCapabilitiesUseCases.ts src/application/communityCapabilitiesUseCases.test.ts src/hooks/useCanManageSessions.ts src/hooks/useCommunitiesWithCapability.ts src/hooks/useCommunitiesWithCapability.spec.tsx
git commit -m "feat: sinal de quem organiza pelada vem do servidor na nuvem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: As telas de comunidade e os torneios usam o sinal (P16, P13)

**Files:**
- Modify: `src/app/routes/communityRoutes.tsx` (~linha 111, Visão geral)
- Modify: `src/app/routes/sessionRoutes.tsx` (~97 Presença, ~124 WhatsApp, ~221 `canOpen`,
  ~297 `resolveSessionCreationAccess`, ~400 `CommunityTournamentsRoute`)
- Modify: `src/application/sessionCreationAccess.ts` (+ teste)
- Modify: `src/components/community/CommunitiesView.tsx` (~430 e ~549, cartão "Criar sessão")
- Modify: `src/components/tournaments/TournamentsModule.tsx` (+ `TournamentsModule.spec.tsx`)

**Interfaces:**
- Consumes: `useCanManageSessions` (Task 1).
- Produces: `resolveSessionCreationAccess(input: { pending: boolean; allowed: boolean }): SessionCreationAccess`;
  `TournamentsModule` prop nova `canManage: boolean`.

- [ ] **Step 1: Testes que falham**
  - `sessionCreationAccess.test.ts` (criar se não existir): `{ pending: true, allowed: false } → 'pending'`,
    `{ pending: false, allowed: true } → 'allowed'`, `{ pending: false, allowed: false } → 'blocked'`.
  - `TournamentsModule.spec.tsx`: com `canManage={false}`, não há "Novo Torneio" e clicar em
    "Ver Detalhes" de um torneio em andamento chama `onOpenTournament(t, false)`; com
    `canManage`, há o botão e o clique repassa `card.shouldOpenLive`. (Monte uma sessão
    `makeSession('t1', { type: 'tournament', status: 'active' })`; confira em
    `buildTournamentListViewModel` o que torna `shouldOpenLive` verdadeiro.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `sessionCreationAccess.ts`:

```ts
export function resolveSessionCreationAccess(input: {
  pending: boolean;
  allowed: boolean;
}): SessionCreationAccess {
  if (input.pending) return 'pending';
  return input.allowed ? 'allowed' : 'blocked';
}
```

  - Em cada rota listada: `const podeOrganizar = useCanManageSessions(community);` e troque
    `permissions.canCreateSession` por `podeOrganizar.allowed && !podeOrganizar.pending`
    (Visão geral, Presença, WhatsApp, `canOpen`); em `SessionWizardRoute`,
    `resolveSessionCreationAccess({ pending: podeOrganizar.pending || !permissions.membersResolved, allowed: podeOrganizar.allowed })`.
  - `CommunitiesView.tsx` (componente do cartão, ~linha 430): `const podeOrganizar = useCanManageSessions(community);`
    e `disabled={!podeOrganizar.allowed || podeOrganizar.pending}`.
  - `TournamentsModule`: prop `canManage: boolean`; "Novo Torneio" só com `canManage`;
    `onClick={() => onOpenTournament(t, canManage && card.shouldOpenLive)}`.
    `CommunityTournamentsRoute` passa `canManage={podeOrganizar.allowed}`.

- [ ] **Step 4: Rodar e ver passar** — os testes, `npx vitest run src/app/AppRouter.spec.tsx src/components/community`, `npm run lint`.
  Specs antigos que montam essas telas sem nuvem continuam valendo pelo cargo; se algum falhar
  por causa do hook novo (ex.: mock de `useAuth` sem `isSupabaseConfigured`), ajuste o mock.

- [ ] **Step 5: Commit**

```bash
git add src/app/routes/communityRoutes.tsx src/app/routes/sessionRoutes.tsx src/application/sessionCreationAccess.ts src/application/sessionCreationAccess.test.ts src/components/community/CommunitiesView.tsx src/components/tournaments/TournamentsModule.tsx src/components/tournaments/TournamentsModule.spec.tsx
git commit -m "feat: marcar pelada, presenca, lista e torneios seguem quem organiza no servidor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Painel e ligas globais (P14, P12)

**Files:**
- Modify: `src/app/routes/globalRoutes.tsx` (`PainelRoute`, ~linha 64)
- Modify: `src/application/screens/dashboard/dashboardModel.ts` (ou onde o modelo é tipado),
  `dashboardContract.ts` (+ teste), `src/components/dashboard/Dashboard.tsx` (~linha 45) (+ spec)
- Modify: `src/components/championship/ChampionshipDetailView.tsx` (~70, ~225, ~445, ~670)
- Modify: `src/components/championship/ChampionshipWizardView.tsx` (~28, ~222)

**Interfaces:**
- Consumes: `useCommunitiesWithCapability` (Task 1).
- Produces: `DashboardModel.canStartSession: boolean`.

- [ ] **Step 1: Testes que falham**
  - `dashboardContract.test.ts`: `buildDashboardContract({ ..., canStartSession: false })` →
    `model.canStartSession === false`.
  - `Dashboard.spec.tsx` (criar se não existir, montando com `buildDashboardContract` e listas
    vazias): sem `canStartSession`, não há "Nova Sessão"; com, há.
  - Ligas: spec do detalhe (criar `ChampionshipDetailView.spec.tsx` se viável; se o componente
    depender demais do shell, teste a regra num helper puro `championshipActions(canEditRules)`
    em `src/application/` e use-o no componente) — sem `canEditRules`, sem "Excluir liga",
    "Aprovar e remarcar" e "Recusar", e sem "Ver Sessão" para rodada materializada.
  - Wizard: com nenhuma comunidade administrada, aparece "Você não administra nenhuma comunidade
    para criar uma liga." e não há o formulário.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**
  - `PainelRoute`: `const organiza = useCommunitiesWithCapability(comm.communities, 'session.manage', () => true);`
    (o hook só consulta `roleAllows` para comunidade sem nuvem, e nela quem usa o aparelho é o
    dono — `permissionsForRole` com `isSupabaseConfigured=false` também libera).
    `canStartSession = comm.communities.length === 0 || (!organiza.pending && organiza.allowedIds.size > 0)`
    (sem comunidade, o botão leva a `/comecar`, como hoje).
  - `Dashboard.tsx`: o botão "Nova Sessão" só com `model.canStartSession`.
  - `ChampionshipDetailView.tsx`: `const permissions = useCommunityPermissions(community ?? null);`
    e "Excluir liga", "Ver Sessão" (rodada materializada), "Aprovar e remarcar" e "Recusar" só
    com `permissions.canEditRules`.
  - `ChampionshipWizardView.tsx`: `const administra = useCommunitiesWithCapability(comm.communities, 'community.profile.update', () => true)`;
    o `select` lista só `comm.communities.filter((c) => administra.allowedIds.has(c.id))`; o
    `communityId` inicial vem dessa lista; sem nenhuma (e sem `pending`), mostre
    `<p className="text-sm text-base-content/70">Você não administra nenhuma comunidade para criar uma liga.</p>`
    no lugar do formulário.

- [ ] **Step 4: Rodar e ver passar** — os testes, `npm run lint`, `npx vitest run src/app/AppRouter.spec.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/routes/globalRoutes.tsx src/application/screens/dashboard src/components/dashboard src/components/championship src/application
git commit -m "feat: painel e ligas globais so oferecem o que o servidor deixa fazer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Adicione só os arquivos que tocou; `git status` antes.)

---

### Task 4: Lixeira do histórico só para o dono (P11)

**Files:**
- Modify: `src/application/screens/historyView/historyViewContract.ts` (~linhas 6-45), `historyViewModel.ts` (+ teste)
- Modify: `src/components/history/HistoryView.tsx` (~103, ~646)
- Modify: `src/app/routes/sessionRoutes.tsx` (~139, ~268), `src/app/routes/communityRoutes.tsx` (~500)

**Interfaces:**
- Produces: `HistoryViewContractInput.onDeleteSession?: (id: string) => void` (opcional);
  `HistoryViewModel.canDeleteSession: boolean` (= `Boolean(input.onDeleteSession)`).

- [ ] **Step 1: Testes que falham** — no teste do contrato: sem `onDeleteSession`,
  `model.canDeleteSession === false` e o intent `deleteSession` não faz nada; com, `true`.
  No spec do `HistoryView` (se existir; senão crie um mínimo com uma sessão encerrada): sem
  `canDeleteSession`, não há o botão da lixeira (procure o `aria-label`/`title` atual dele, ~linha 646).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** — o contrato torna `onDeleteSession` opcional e expõe
  `canDeleteSession`; o `HistoryView` só renderiza a lixeira com `canDeleteSession`; as três rotas
  passam `onDeleteSession` só quando `permissions.canClearHistory` (use `useCommunityPermissions`
  onde ainda não houver).

- [ ] **Step 4: Rodar e ver passar** — os testes, `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/application/screens/historyView src/components/history/HistoryView.tsx src/app/routes/sessionRoutes.tsx src/app/routes/communityRoutes.tsx
git commit -m "feat: so o dono ve a lixeira do historico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Quem organiza no quadro (P15)

**Files:**
- Create: `supabase/migrations/20260929140000_quem_organiza.sql`, `src/test/db/quemOrganiza.dbtest.ts`
- Create: `src/infra/supabase/sessionOrganizerCloudService.ts` (+ caso de uso em
  `src/application/sessionOrganizerUseCases.ts` e teste)
- Modify: `src/components/session/RegistrationBoardView.tsx` (~63, ~443-460) (+ spec),
  `src/app/routes/sessionRoutes.tsx` (`CommunityRegistrationRoute`, ~234)

**Interfaces:**
- Produces:
  - RPC `public.get_session_organizer(p_session_id uuid) returns jsonb` (`{ user_id, name } | null`)
  - `loadSessionOrganizer(sessionCloudId: string, gateway?): Promise<AppResult<{ userId: string; name: string } | null>>`
  - `RegistrationBoardView` prop nova `organizerName?: string | null`

- [ ] **Step 1: Conferir o modelo** — `sessions.community_id` aponta para `communities.id`, o mesmo
  id de `community_memberships.community_id`? (`grep -n "community_id" supabase/migrations/20260610161203_backend_operational_sync.sql | head`
  e a FK de `community_memberships`). Se forem ids diferentes (legado × alvo), use a ponte que a
  policy de leitura de `session_organizer_assignments` usa (leia-a em
  `20260828034435_target_session_organizer_assignments.sql` e **copie o mesmo critério de
  leitura** para a RPC).

- [ ] **Step 2: dbtest que falha** — `src/test/db/quemOrganiza.dbtest.ts`, no padrão de
  `perfilDoAtleta.dbtest.ts` (helpers `conta`, `cena`, membros em `community_members`/
  `community_memberships` conforme o critério do Step 1): cria uma sessão da comunidade e uma
  atribuição ativa de organizador (insira direto como superusuário); então:
  - um membro ativo lê `{ user_id, name }` com o nome da ficha do organizador;
  - quem não é da comunidade recebe `42501`;
  - sem atribuição ativa, `null`;
  - atribuição revogada (`revoked_at`) não conta.

- [ ] **Step 3: Rodar e ver falhar** — `node --import tsx --test src/test/db/quemOrganiza.dbtest.ts`.

- [ ] **Step 4: Migration**

```sql
-- Quem organiza (spec 2026-09-29-quem-organiza-design.md): o quadro da inscricao mostra o nome
-- de quem organiza a pelada a todos os membros da comunidade.

create or replace function public.get_session_organizer(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_organizer uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.sessions s
      join public.community_memberships m on m.community_id = s.community_id
     where s.id = p_session_id
       and m.user_id = v_uid
       and m.status = 'active'
  ) then
    raise exception 'Not a member of this session''s Community' using errcode = '42501';
  end if;

  select a.organizer_user_id into v_organizer
    from public.session_organizer_assignments a
   where a.session_id = p_session_id
     and a.revoked_at is null
     and a.organizer_user_id is not null
   order by a.assigned_at desc
   limit 1;
  if v_organizer is null then
    return null;
  end if;

  select coalesce(nullif(pg_catalog.btrim(p.nickname), ''), p.name) into v_name
    from public.players p
   where p.user_id = v_organizer and p.deleted_at is null
   limit 1;
  if v_name is null then
    select pr.name into v_name from public.profiles pr where pr.id = v_organizer;
  end if;

  return pg_catalog.jsonb_build_object('user_id', v_organizer, 'name', coalesce(v_name, 'Membro'));
end;
$$;

revoke all on function public.get_session_organizer(uuid) from public, anon;
grant execute on function public.get_session_organizer(uuid) to authenticated;
```

  (Ajuste o `join` ao critério do Step 1.)

- [ ] **Step 5: Rodar e ver passar** — o dbtest; depois a bateria inteira em segundo plano.

- [ ] **Step 6: Cliente**
  - `sessionOrganizerCloudService.ts`: `fetchOrganizer(sessionCloudId)` →
    `supabase.rpc('get_session_organizer', { p_session_id })` (padrão de
    `communitySkillProfileCloudService.ts`); `sessionOrganizerUseCases.ts`: `loadSessionOrganizer`
    com `AppResult` (sem nuvem → `appOk(null)`), com teste.
  - `CommunityRegistrationRoute`: carrega o organizador quando há `sessionCloudId` e passa
    `organizerName`; repassa também a `organizerHandover` para o painel.
  - `RegistrationBoardView`: prop `organizerName?: string | null`; logo abaixo do cabeçalho,
    `{organizerName && <p className="text-sm text-base-content/70">Organiza: {organizerName}</p>}`;
    o bloco do botão "Quem organiza" só com `organizerHandover?.podeTransferir`; o painel recebe
    `organizadorAtual={organizerName ?? null}`.
  - Spec do quadro: "Organiza: Ana" aparece com `organizerName="Ana"`; sem `podeTransferir`, não
    há o botão "Quem organiza"; com, há.

- [ ] **Step 7: Rodar e ver passar** — specs, testes, `npm run lint`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260929140000_quem_organiza.sql src/test/db/quemOrganiza.dbtest.ts src/infra/supabase/sessionOrganizerCloudService.ts src/application/sessionOrganizerUseCases.ts src/application/sessionOrganizerUseCases.test.ts src/components/session/RegistrationBoardView.tsx src/components/session/RegistrationBoardView.spec.tsx src/app/routes/sessionRoutes.tsx
git commit -m "feat: o quadro mostra quem organiza a pelada a todos os membros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentos, verificação e publicação

- [ ] **Step 1: Documentos**
  - `docs/PERMISSOES.md`: A1, A2 (seção A), B1, B4, B5, B7, B9 (seção B) e P11–P16 (seção F)
    marcadas resolvidas (✅ riscadas); seção E registra "Parte 4a — quem organiza: ✅ feita em
    <data>" e que a 4b (P17, P18) vem a seguir.
  - `docs/JORNADA.md`: "Quem marca pelada?" (quem tem `ORGANIZER`, via "Deixar organizar"; dono,
    admin e moderador ganham ao assumir o cargo), "O atleta vê quem organiza?" (sim, no quadro).
- [ ] **Step 2: Verificação** — `npm run lint`, `npx eslint` nos tocados (só erros),
  `npx prettier --check` nos tocados, `npm test`, `npm run build`, `npm run test:db`.
- [ ] **Step 3: Commit** — `git add docs/PERMISSOES.md docs/JORNADA.md` e
  `docs: quem organiza na jornada e nas permissoes`.
- [ ] **Step 4: Publicação (só com ok do usuário)** — conferir última migration
  (`perfil_do_atleta`) e que `get_session_organizer` não existe; `apply_migration`; conferir
  `prosecdef`/`proconfig`/grants; advisors; merge, testes, push, deploy `READY`.
