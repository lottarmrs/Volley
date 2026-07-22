# Account Identity & Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer toda sessao Supabase valida convergir para uma conta pronta com perfil e jogador canonico 1:1, usando estados de autenticacao tipados, onboarding de username, recovery, Google OAuth e shell de MFA.

**Architecture:** Supabase Auth continua dono de sessao, tokens e identidades. A camada de aplicacao define a maquina de estados e o contrato `AccountGateway`; uma RPC idempotente cria ou repara perfil/jogador, e adapters Supabase implementam os ports. React Router e um provider fino protegem a aplicacao atual sem mover regras de autorizacao para a UI.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, `@supabase/supabase-js` 2.x, PostgreSQL/Supabase migrations, Node test runner, Vitest, Testing Library.

## Global Constraints

- Preservar Supabase Auth como autoridade de identidade.
- Toda conta pronta possui exatamente um jogador canonico.
- `player.id` e UUID interno imutavel; `username` e identidade publica unica.
- Nunca persistir token manualmente em `localStorage` ou `sessionStorage`.
- Falha de perfil nao pode ser tratada como logout.
- Route guards melhoram UX; RLS/RPC garantem autorizacao.
- Cache de produto so pode abrir no estado `ready`.
- Manter a apresentacao visual atual; esta entrega muda fluxo, nao design.
- Nao adicionar TanStack Query, Dexie, XState ou Zod nesta entrega.
- Nao aplicar reset de dados de produto nesta entrega.

---

## File Map

**Novos arquivos**

- `src/application/authSession.ts`: estados tipados e derivacao pura do destino de auth.
- `src/application/authSession.test.ts`: matriz da maquina de estados.
- `src/application/accountUseCases.ts`: contrato de conta e comando idempotente de bootstrap.
- `src/application/accountUseCases.test.ts`: validacao e traducao de falhas do gateway.
- `src/infra/supabase/accountCloudService.ts`: adapter da RPC de conta.
- `src/infra/supabase/accountCloudService.test.ts`: mapeamento do retorno Supabase.
- `src/infra/supabase/authClient.ts`: adapter de senha, OAuth, recovery e AAL.
- `src/app/auth/AuthSessionProvider.tsx`: sessao unica e reconciliacao de conta.
- `src/app/auth/AuthSessionProvider.spec.tsx`: transicoes, retry e logout.
- `src/app/auth/AuthGuard.tsx`: redirecionamento e preservacao de destino.
- `src/app/auth/AuthGuard.spec.tsx`: matriz de rotas/estados.
- `src/app/auth/AuthPages.tsx`: paginas de login, recovery, callback, username e MFA.
- `src/app/AppRouter.tsx`: arvore publica, transicional e protegida.
- `src/app/AppRouter.spec.tsx`: jornadas essenciais de rota.
- `supabase/migrations/20260722150000_account_identity_foundation.sql`: invariantes e RPC.

**Arquivos modificados**

- `src/application/appResult.ts`: codigos de erro de conta/Auth.
- `src/application/appResult.test.ts`: novos codigos discriminados.
- `src/application/index.ts`: exports dos contratos.
- `src/lib/supabaseClient.ts`: manter cliente oficial como dependencia dos adapters.
- `src/hooks/useAuth.ts`: facade de compatibilidade sobre o provider.
- `src/components/account/AuthForm.tsx`: intents de login/cadastro/Google/recovery.
- `src/components/account/AccountSyncView.tsx`: consumir facade sem possuir auth.
- `src/App.tsx`: remover ownership da sessao e consumir conta pronta.
- `src/main.tsx`: montar router e provider.
- `src/infra/supabase/schema.test.ts`: contrato estatico da migration.
- `supabase/migrations/schema.sql`: refletir o schema consolidado.

## Spec Coverage

Este plano cobre as secoes 7.1, 7.2, 10, parte de 11.3 e a fase 1 da secao 15 da
especificacao. Claim historico, comunidades/avaliacoes, VUT/carreira, outbox/offline e
reset/cutover pertencem respectivamente aos planos 2 a 5 do programa. Essa separacao e
intencional: nenhum desses requisitos e removido, e cada plano posterior sera escrito
contra as interfaces realmente integradas pelo anterior.

---

### Task 1: Banco de conta e jogador canonico

**Files:**
- Create: `supabase/migrations/20260722150000_account_identity_foundation.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `public.profiles`, `public.players`, `auth.users`, `players.user_id`, `players.username`.
- Produces: RPC `public.ensure_account_ready(p_username text default null)` retornando estado, perfil completo, jogador e username; constraint de um jogador ativo por conta; trigger que cria perfil e jogador base.

- [ ] **Step 1: Write the failing schema contract**

Adicionar ao carregamento de fixtures de `src/infra/supabase/schema.test.ts`:

```ts
const accountIdentityMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260722150000_account_identity_foundation.sql',
    import.meta.url,
  ),
);
```

Adicionar os testes:

```ts
test('account identity migration creates one canonical player per account', () => {
  assert.match(accountIdentityMigration, /players_user_id_active_unique_idx/i);
  assert.match(accountIdentityMigration, /create or replace function public\.ensure_account_ready/i);
  assert.match(accountIdentityMigration, /insert into public\.players/i);
  assert.match(accountIdentityMigration, /on conflict \(user_id\)/i);
  assert.match(accountIdentityMigration, /lower\(username\)/i);
});

test('account bootstrap RPC is authenticated, hardened and idempotent', () => {
  assert.match(
    accountIdentityMigration,
    /security definer[\s\S]*set search_path = public/i,
  );
  assert.match(accountIdentityMigration, /v_uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(accountIdentityMigration, /state text[\s\S]*needs_username[\s\S]*ready/i);
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.ensure_account_ready\(text\) from public, anon/i,
  );
  assert.match(
    accountIdentityMigration,
    /grant execute on function public\.ensure_account_ready\(text\) to authenticated/i,
  );
});

test('new auth users receive both profile and canonical player rows', () => {
  assert.match(
    accountIdentityMigration,
    /create or replace function public\.handle_new_user\(\)[\s\S]*insert into public\.profiles[\s\S]*insert into public\.players/i,
  );
  assert.match(accountIdentityMigration, /new\.raw_user_meta_data->>'username'/i);
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `npm run test:unit -- --test-name-pattern="account identity|account bootstrap|canonical player"`

Expected: FAIL because `20260722150000_account_identity_foundation.sql` does not exist or lacks the asserted contracts.

- [ ] **Step 3: Create the migration**

Criar `supabase/migrations/20260722150000_account_identity_foundation.sql` com:

```sql
create unique index if not exists players_user_id_active_unique_idx
  on public.players (user_id)
  where user_id is not null and deleted_at is null;

create or replace function public.normalize_account_username(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(value));
$$;

create or replace function public.is_valid_account_username(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_account_username(value) ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$';
$$;

create or replace function public.ensure_account_ready(p_username text default null)
returns table (
  state text,
  profile_id uuid,
  profile_name text,
  profile_email text,
  profile_role text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  player_id uuid,
  username text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_name text;
  v_username text := public.normalize_account_username(p_username);
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name
    from auth.users
   where id = v_uid;

  insert into public.profiles (id, name, email, role)
  values (v_uid, v_name, v_email, 'user')
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  select * into v_profile from public.profiles where id = v_uid;

  select * into v_player
    from public.players
   where user_id = v_uid and deleted_at is null
   order by created_at
   limit 1
   for update;

  if nullif(v_username, '') is not null
     and not public.is_valid_account_username(v_username) then
    raise exception 'Invalid username' using errcode = '22023';
  end if;

  if v_player.id is null then
    insert into public.players (owner_id, user_id, name, username)
    values (v_uid, v_uid, v_name, nullif(v_username, ''))
    on conflict (user_id) where user_id is not null and deleted_at is null
    do update set updated_at = now()
    returning * into v_player;
  elsif v_player.username is null and nullif(v_username, '') is not null then
    if not public.is_valid_account_username(v_username) then
      raise exception 'Invalid username' using errcode = '22023';
    end if;
    update public.players
       set username = v_username, updated_at = now()
     where id = v_player.id
     returning * into v_player;
  end if;

  if v_player.username is null then
    return query select
      'needs_username'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      null::text;
  else
    return query select
      'ready'::text,
      v_profile.id,
      v_profile.name,
      v_profile.email,
      v_profile.role,
      v_profile.created_at,
      v_profile.updated_at,
      v_player.id,
      v_player.username;
  end if;
exception
  when unique_violation then
    raise exception 'Username unavailable' using errcode = '23505';
end;
$$;

revoke execute on function public.ensure_account_ready(text) from public, anon;
grant execute on function public.ensure_account_ready(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  insert into public.players (owner_id, user_id, name, username)
  values (
    new.id,
    new.id,
    v_name,
    case
      when public.is_valid_account_username(v_username)
       and not exists (select 1 from public.players p where lower(p.username) = v_username)
      then v_username
      else null
    end
  )
  on conflict (user_id) where user_id is not null and deleted_at is null do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

Atualizar `supabase/migrations/schema.sql` com as mesmas definicoes consolidadas. Nao
remover policies ou colunas existentes.

- [ ] **Step 4: Run local database and schema tests**

Run: `supabase db reset`

Expected: PASS; todas as migrations aplicadas sem erro.

Run: `npm run test:unit -- --test-name-pattern="account identity|account bootstrap|canonical player"`

Expected: PASS.

- [ ] **Step 5: Commit the database contract**

```bash
git add supabase/migrations/20260722150000_account_identity_foundation.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(auth): add canonical account player bootstrap"
```

---

### Task 2: Application contracts and auth state machine

**Files:**
- Create: `src/application/accountUseCases.ts`
- Create: `src/application/accountUseCases.test.ts`
- Create: `src/application/authSession.ts`
- Create: `src/application/authSession.test.ts`
- Modify: `src/application/appResult.ts`
- Modify: `src/application/appResult.test.ts`
- Modify: `src/application/index.ts`

**Interfaces:**
- Consumes: generic `AppResult<T>`.
- Produces: `AccountGateway`, `AccountSnapshot`, `ensureAccountReadyCommand`, `AuthSessionState`, `resolveAuthSessionState`.

- [ ] **Step 1: Write failing account use-case tests**

Criar `src/application/accountUseCases.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureAccountReadyCommand,
  type AccountGateway,
  type AccountSnapshot,
} from './accountUseCases';

const ready: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'user-1', name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  },
  playerId: 'player-1',
  username: 'ana-voleio',
};

test('ensureAccountReadyCommand delegates normalized username', async () => {
  let received: string | null | undefined;
  const gateway: AccountGateway = {
    ensureReady: async (username) => {
      received = username;
      return ready;
    },
  };
  const result = await ensureAccountReadyCommand(gateway, '  Ana-Voleio  ');
  assert.equal(result.ok, true);
  assert.equal(received, 'ana-voleio');
});

test('ensureAccountReadyCommand maps username conflict', async () => {
  const gateway: AccountGateway = {
    ensureReady: async () => {
      throw { code: '23505', message: 'Username unavailable' };
    },
  };
  const result = await ensureAccountReadyCommand(gateway, 'ana-voleio');
  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: 'product',
      code: 'username_unavailable',
      message: 'Este username ja esta em uso.',
      recoverable: false,
    },
  });
});
```

- [ ] **Step 2: Write failing auth state tests**

Criar `src/application/authSession.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthSessionState } from './authSession';
import type { UserProfile } from '@shared/types';

function profile(id: string): UserProfile {
  return {
    id, name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  };
}

test('anonymous session remains anonymous', () => {
  assert.deepEqual(resolveAuthSessionState({ session: null }), { kind: 'anonymous' });
});

test('unconfirmed email requires verification', () => {
  assert.equal(
    resolveAuthSessionState({ session: { userId: 'u1', emailConfirmed: false } }).kind,
    'email_verification',
  );
});

test('missing username requires onboarding without logging out', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: {
        state: 'needs_username', profile: profile('u1'), playerId: 'p1', username: null,
      },
    }).kind,
    'onboarding',
  );
});

test('administrative AAL requirement routes an AAL1 session to MFA', () => {
  assert.equal(
    resolveAuthSessionState({
      session: { userId: 'u1', emailConfirmed: true },
      account: { state: 'ready', profile: profile('u1'), playerId: 'p1', username: 'ana' },
      aal: { current: 'aal1', next: 'aal2' },
      requireAal2: true,
    }).kind,
    'mfa_required',
  );
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern="ensureAccountReadyCommand|session remains|requires verification|requires onboarding|AAL requirement"`

Expected: FAIL because the application modules and error code do not exist.

- [ ] **Step 4: Implement the contracts**

Criar `src/application/accountUseCases.ts`:

```ts
import { appOk, productError, technicalError, type AppResult } from './appResult';
import type { UserProfile } from '@shared/types';

export type AccountReadiness = 'needs_username' | 'ready';

export interface AccountSnapshot {
  state: AccountReadiness;
  profile: UserProfile;
  playerId: string;
  username: string | null;
}

export interface AccountGateway {
  ensureReady(username?: string | null): Promise<AccountSnapshot>;
}

export async function ensureAccountReadyCommand(
  gateway: AccountGateway,
  username?: string | null,
): Promise<AppResult<AccountSnapshot>> {
  const normalized = username?.trim().toLowerCase() || null;
  try {
    return appOk(await gateway.ensureReady(normalized));
  } catch (cause) {
    const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
    if (code === '23505') {
      return productError('username_unavailable', 'Este username ja esta em uso.');
    }
    if (code === '22023') {
      return productError('invalid_username', 'Use de 3 a 30 letras, numeros, _ ou -.');
    }
    return technicalError('Nao foi possivel preparar sua conta agora.', cause);
  }
}
```

Criar `src/application/authSession.ts`:

```ts
import type { AccountSnapshot } from './accountUseCases';

export type AuthSessionState =
  | { kind: 'initializing' }
  | { kind: 'anonymous' }
  | { kind: 'email_verification'; userId: string }
  | { kind: 'onboarding'; userId: string; playerId: string }
  | { kind: 'mfa_required'; userId: string; account: AccountSnapshot }
  | { kind: 'ready'; userId: string; account: AccountSnapshot }
  | { kind: 'recoverable_error'; userId: string; message: string };

export interface SessionIdentity {
  userId: string;
  emailConfirmed: boolean;
}

export interface AssuranceLevel {
  current: 'aal1' | 'aal2' | null;
  next: 'aal1' | 'aal2' | null;
}

export function resolveAuthSessionState(input: {
  session: SessionIdentity | null;
  account?: AccountSnapshot | null;
  aal?: AssuranceLevel | null;
  requireAal2?: boolean;
}): AuthSessionState {
  if (!input.session) return { kind: 'anonymous' };
  if (!input.session.emailConfirmed) {
    return { kind: 'email_verification', userId: input.session.userId };
  }
  if (!input.account || input.account.state === 'needs_username') {
    return {
      kind: 'onboarding',
      userId: input.session.userId,
      playerId: input.account?.playerId ?? '',
    };
  }
  if (input.requireAal2 && input.aal?.next === 'aal2' && input.aal.current !== 'aal2') {
    return { kind: 'mfa_required', userId: input.session.userId, account: input.account };
  }
  return { kind: 'ready', userId: input.session.userId, account: input.account };
}
```

Adicionar a `ProductErrorCode` em `src/application/appResult.ts`:

```ts
  | 'invalid_username'
  | 'username_unavailable'
  | 'email_not_confirmed'
  | 'mfa_required'
```

Exportar os dois modulos em `src/application/index.ts`:

```ts
export * from './accountUseCases';
export * from './authSession';
```

- [ ] **Step 5: Run application tests**

Run: `npm run test:unit -- --test-name-pattern="ensureAccountReadyCommand|session remains|requires verification|requires onboarding|AAL requirement|appResult"`

Expected: PASS.

- [ ] **Step 6: Commit application contracts**

```bash
git add src/application/accountUseCases.ts src/application/accountUseCases.test.ts src/application/authSession.ts src/application/authSession.test.ts src/application/appResult.ts src/application/appResult.test.ts src/application/index.ts
git commit -m "feat(auth): define account readiness state"
```

---

### Task 3: Supabase account and authentication adapters

**Files:**
- Create: `src/infra/supabase/accountCloudService.ts`
- Create: `src/infra/supabase/accountCloudService.test.ts`
- Create: `src/infra/supabase/authClient.ts`
- Create: `src/infra/supabase/authClient.test.ts`

**Interfaces:**
- Consumes: `AccountGateway`, Supabase client and official Auth methods.
- Produces: `accountCloudService`, `AuthClient`, `supabaseAuthClient`.

- [ ] **Step 1: Write failing adapter tests**

Criar `src/infra/supabase/accountCloudService.test.ts` com cliente injetado:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountCloudService } from './accountCloudService';

test('account adapter maps ensure_account_ready row', async () => {
  const calls: unknown[] = [];
  const service = createAccountCloudService({
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return {
        data: [{
          state: 'ready', profile_id: 'u1', profile_name: 'Ana',
          profile_email: 'ana@example.com', profile_role: 'user',
          profile_created_at: '2026-07-22T00:00:00Z',
          profile_updated_at: '2026-07-22T00:00:00Z',
          player_id: 'p1', username: 'ana',
        }],
        error: null,
      };
    },
  });
  assert.deepEqual(await service.ensureReady('ana'), {
    state: 'ready',
    profile: {
      id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user',
      createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
    },
    playerId: 'p1', username: 'ana',
  });
  assert.deepEqual(calls, [['ensure_account_ready', { p_username: 'ana' }]]);
});
```

Criar `src/infra/supabase/authClient.test.ts` verificando que o adapter delega sem
armazenar tokens:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from './authClient';

test('Google sign-in uses callback route', async () => {
  let options: unknown;
  const client = createAuthClient({
    signInWithOAuth: async (value: unknown) => {
      options = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signInWithGoogle();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});

test('Google identity linking uses the account callback route', async () => {
  let options: unknown;
  const client = createAuthClient({
    linkIdentity: async (value: unknown) => {
      options = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.linkGoogleIdentity();
  assert.deepEqual(options, {
    provider: 'google',
    options: { redirectTo: 'https://panelinha.test/auth/callback' },
  });
});
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern="account adapter|Google sign-in"`

Expected: FAIL because both adapters are absent.

- [ ] **Step 3: Implement the account adapter**

Criar `src/infra/supabase/accountCloudService.ts`:

```ts
import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

export function createAccountCloudService(client: RpcClient): AccountGateway {
  return {
    async ensureReady(username) {
      const { data, error } = await client.rpc('ensure_account_ready', {
        p_username: username ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== 'object') throw new Error('Invalid account bootstrap response');
      const value = row as Record<string, unknown>;
      return {
        state: String(value.state) as AccountSnapshot['state'],
        profile: {
          id: String(value.profile_id),
          name: value.profile_name == null ? null : String(value.profile_name),
          email: String(value.profile_email),
          role: String(value.profile_role) as AccountSnapshot['profile']['role'],
          createdAt: String(value.profile_created_at),
          updatedAt: String(value.profile_updated_at),
        },
        playerId: String(value.player_id),
        username: value.username == null ? null : String(value.username),
      };
    },
  };
}

export const accountCloudService = createAccountCloudService(supabase);
```

- [ ] **Step 4: Implement the auth adapter**

Criar `src/infra/supabase/authClient.ts` com os metodos oficiais:

```ts
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type { AssuranceLevel } from '@app/authSession';

export interface AuthClient {
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string, username: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  linkGoogleIdentity(): Promise<void>;
  requestPasswordRecovery(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getAssuranceLevel(): Promise<AssuranceLevel>;
  signOut(): Promise<void>;
}

export function createAuthClient(
  auth: typeof supabase.auth,
  location: Pick<Location, 'origin'> = window.location,
): AuthClient {
  const fail = (error: { message: string } | null) => { if (error) throw error; };
  return {
    async getSession() {
      const { data, error } = await auth.getSession(); fail(error); return data.session;
    },
    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await auth.signInWithPassword({ email, password }); fail(error);
    },
    async signUp(email, password, name, username) {
      const { error } = await auth.signUp({
        email,
        password,
        options: { data: { name, username } },
      });
      fail(error);
    },
    async signInWithGoogle() {
      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      fail(error);
    },
    async linkGoogleIdentity() {
      const { error } = await auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      fail(error);
    },
    async requestPasswordRecovery(email) {
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/recuperar-senha`,
      });
      fail(error);
    },
    async updatePassword(password) {
      const { error } = await auth.updateUser({ password }); fail(error);
    },
    async getAssuranceLevel() {
      const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel(); fail(error);
      return { current: data.currentLevel, next: data.nextLevel };
    },
    async signOut() {
      const { error } = await auth.signOut(); fail(error);
    },
  };
}

export const supabaseAuthClient = createAuthClient(supabase.auth);
```

Para evitar crash de import quando as variaveis locais nao existem, substituir a ultima
linha por um adapter indisponivel que retorna sessao anonima e falha apenas ao executar
um comando cloud:

```ts
const unavailable = new Error('Supabase is not configured.');
const unavailableAuthClient: AuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => { throw unavailable; },
  signUp: async () => { throw unavailable; },
  signInWithGoogle: async () => { throw unavailable; },
  linkGoogleIdentity: async () => { throw unavailable; },
  requestPasswordRecovery: async () => { throw unavailable; },
  updatePassword: async () => { throw unavailable; },
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
};

export const supabaseAuthClient = isSupabaseConfigured
  ? createAuthClient(supabase.auth)
  : unavailableAuthClient;
```

- [ ] **Step 5: Run adapter and type checks**

Run: `npm run test:unit -- --test-name-pattern="account adapter|Google sign-in"`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit adapters**

```bash
git add src/infra/supabase/accountCloudService.ts src/infra/supabase/accountCloudService.test.ts src/infra/supabase/authClient.ts src/infra/supabase/authClient.test.ts
git commit -m "feat(auth): add Supabase account adapters"
```

---

### Task 4: Auth session provider with recoverable bootstrap

**Files:**
- Create: `src/app/auth/AuthSessionProvider.tsx`
- Create: `src/app/auth/AuthSessionProvider.spec.tsx`
- Modify: `src/hooks/useAuth.ts`

**Interfaces:**
- Consumes: `AuthClient`, `AccountGateway`, `ensureAccountReadyCommand`, `resolveAuthSessionState`.
- Produces: `AuthSessionContextValue`, `useAuthSession`; compatibility facade `useAuth`.

- [ ] **Step 1: Write failing provider tests**

Criar `src/app/auth/AuthSessionProvider.spec.tsx` com adapters falsos e um probe:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthSessionProvider, useAuthSession } from './AuthSessionProvider';
import type { UserProfile } from '@shared/types';

function profile(id: string): UserProfile {
  return {
    id, name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  };
}

function Probe() {
  const auth = useAuthSession();
  return <div>{auth.state.kind}</div>;
}

it('becomes ready after session and account bootstrap', async () => {
  render(
    <AuthSessionProvider
      authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
      accountGateway={{
        ensureReady: async () => ({
          state: 'ready', profile: profile('u1'), playerId: 'p1', username: 'ana',
        }),
      }}
    >
      <Probe />
    </AuthSessionProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
});

it('keeps a valid session as recoverable_error when bootstrap fails', async () => {
  render(
    <AuthSessionProvider
      authClient={fakeAuthClient({ user: { id: 'u1', email_confirmed_at: 'now' } })}
      accountGateway={{ ensureReady: async () => { throw new Error('network'); } }}
    >
      <Probe />
    </AuthSessionProvider>,
  );
  await waitFor(() => expect(screen.getByText('recoverable_error')).toBeTruthy());
});
```

O helper `fakeAuthClient` deve implementar todos os metodos de `AuthClient` com no-op e
retornar a sessao recebida em `getSession`.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `npm run test:ui -- src/app/auth/AuthSessionProvider.spec.tsx`

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the provider**

Criar `src/app/auth/AuthSessionProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccountGateway, AccountSnapshot } from '@app/accountUseCases';
import { ensureAccountReadyCommand } from '@app/accountUseCases';
import { resolveAuthSessionState, type AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@infra/supabase/authClient';
import { accountCloudService } from '@infra/supabase/accountCloudService';
import { supabaseAuthClient } from '@infra/supabase/authClient';

export interface AuthSessionContextValue {
  state: AuthSessionState;
  session: Session | null;
  account: AccountSnapshot | null;
  retry(): Promise<void>;
  completeUsername(username: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
  authClient = supabaseAuthClient,
  accountGateway = accountCloudService,
}: {
  children: React.ReactNode;
  authClient?: AuthClient;
  accountGateway?: AccountGateway;
}) {
  const [state, setState] = useState<AuthSessionState>({ kind: 'initializing' });
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);

  const reconcile = useCallback(async (nextSession: Session | null, username?: string) => {
    setSession(nextSession);
    if (!nextSession) { setAccount(null); setState({ kind: 'anonymous' }); return; }
    if (!nextSession.user.email_confirmed_at) {
      setState({ kind: 'email_verification', userId: nextSession.user.id }); return;
    }
    const result = await ensureAccountReadyCommand(accountGateway, username);
    if (!result.ok) {
      setState({
        kind: 'recoverable_error', userId: nextSession.user.id, message: result.error.message,
      });
      return;
    }
    setAccount(result.value);
    const aal = await authClient.getAssuranceLevel().catch(() => null);
    setState(resolveAuthSessionState({
      session: { userId: nextSession.user.id, emailConfirmed: true },
      account: result.value,
      aal,
    }));
  }, [accountGateway, authClient]);

  useEffect(() => {
    let active = true;
    authClient.getSession().then((value) => active && reconcile(value));
    const unsubscribe = authClient.onSessionChange((value) => { if (active) void reconcile(value); });
    return () => { active = false; unsubscribe(); };
  }, [authClient, reconcile]);

  const value = useMemo<AuthSessionContextValue>(() => ({
    state, session, account,
    retry: async () => reconcile(session),
    completeUsername: async (username) => reconcile(session, username),
    signOut: async () => { await authClient.signOut(); await reconcile(null); },
  }), [account, authClient, reconcile, session, state]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used within AuthSessionProvider');
  return value;
}
```

- [ ] **Step 4: Replace `useAuth` ownership with a compatibility facade**

Em `src/hooks/useAuth.ts`, remover listeners, timeout e fetch de perfil. O hook passa a
ler `useAuthSession`, mantendo temporariamente os campos usados por `App.tsx`:

```ts
import { useAuthSession } from '../app/auth/AuthSessionProvider';
import { supabaseAuthClient } from '../infra/supabase/authClient';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export function useAuth() {
  const auth = useAuthSession();
  const user = auth.session?.user ?? null;
  const profile = auth.account?.profile ?? null;
  const role = profile?.role ?? 'user';
  return {
    state: auth.state,
    user,
    profile,
    loading: auth.state.kind === 'initializing',
    signIn: supabaseAuthClient.signIn,
    signUp: (email: string, password: string, name?: string) =>
      supabaseAuthClient.signUp(email, password, name ?? '', ''),
    signOut: auth.signOut,
    refreshProfile: auth.retry,
    isSupabaseConfigured,
    isMaster: role === 'master',
    isProgrammer: role === 'programmer',
    isStaff: role === 'master' || role === 'programmer',
    isAdmin: role === 'master',
  };
}
```

`signIn` e `signUp` permanecem apenas como compatibilidade ate a Task 6; as paginas
publicas passam a usar `AuthClient` diretamente.

- [ ] **Step 5: Run provider regression tests**

Run: `npm run test:ui -- src/app/auth/AuthSessionProvider.spec.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit provider and facade**

```bash
git add src/app/auth/AuthSessionProvider.tsx src/app/auth/AuthSessionProvider.spec.tsx src/hooks/useAuth.ts
git commit -m "refactor(auth): centralize session ownership"
```

---

### Task 5: Route guards and transition routes

**Files:**
- Create: `src/app/auth/AuthGuard.tsx`
- Create: `src/app/auth/AuthGuard.spec.tsx`

**Interfaces:**
- Consumes: `AuthSessionState`, `useAuthSession`, React Router location/navigation.
- Produces: `routeForAuthState`, `AuthGuard` preserving `from`.

- [ ] **Step 1: Write failing guard tests**

Criar `src/app/auth/AuthGuard.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { routeForAuthState } from './AuthGuard';
import type { AccountSnapshot } from '@app/accountUseCases';

const account: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user',
    createdAt: '2026-07-22T00:00:00Z', updatedAt: '2026-07-22T00:00:00Z',
  },
  playerId: 'p1',
  username: 'ana',
};

describe('routeForAuthState', () => {
  it('maps auth states to transition routes', () => {
    expect(routeForAuthState({ kind: 'anonymous' })).toBe('/entrar');
    expect(routeForAuthState({ kind: 'email_verification', userId: 'u1' })).toBe('/verificar-email');
    expect(routeForAuthState({ kind: 'onboarding', userId: 'u1', playerId: 'p1' })).toBe('/escolher-username');
    expect(routeForAuthState({ kind: 'mfa_required', userId: 'u1', account: account })).toBe('/confirmar-mfa');
    expect(routeForAuthState({ kind: 'ready', userId: 'u1', account })).toBeNull();
  });
});
```

- [ ] **Step 2: Run guard test and verify failure**

Run: `npm run test:ui -- src/app/auth/AuthGuard.spec.tsx`

Expected: FAIL because `AuthGuard` does not exist.

- [ ] **Step 3: Implement the guard**

Criar `src/app/auth/AuthGuard.tsx`:

```tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import type { AuthSessionState } from '@app/authSession';
import { useAuthSession } from './AuthSessionProvider';

export function routeForAuthState(state: AuthSessionState): string | null {
  switch (state.kind) {
    case 'initializing': return '/auth/loading';
    case 'anonymous': return '/entrar';
    case 'email_verification': return '/verificar-email';
    case 'onboarding': return '/escolher-username';
    case 'mfa_required': return '/confirmar-mfa';
    case 'recoverable_error': return '/auth/recuperar-sessao';
    case 'ready': return null;
  }
}

export function AuthGuard() {
  const { state } = useAuthSession();
  const location = useLocation();
  const destination = routeForAuthState(state);
  if (destination) {
    return <Navigate to={destination} replace state={{ from: location }} />;
  }
  return <Outlet />;
}
```

- [ ] **Step 4: Run guard tests and typecheck**

Run: `npm run test:ui -- src/app/auth/AuthGuard.spec.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit route guard**

```bash
git add src/app/auth/AuthGuard.tsx src/app/auth/AuthGuard.spec.tsx
git commit -m "feat(auth): add protected route guard"
```

---

### Task 6: Auth pages and account onboarding

**Files:**
- Create: `src/app/auth/AuthPages.tsx`
- Create: `src/app/auth/AuthPages.spec.tsx`
- Create: `src/app/AppRouter.tsx`
- Create: `src/app/AppRouter.spec.tsx`
- Modify: `src/components/account/AuthForm.tsx`
- Modify: `src/components/account/AccountSyncView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AuthClient`, `useAuthSession`, route `location.state.from`.
- Produces: working password signup/signin, Google OAuth, Google identity linking, recovery, username completion and recoverable retry.

- [ ] **Step 1: Write failing page journey tests**

Criar `src/app/auth/AuthPages.spec.tsx` cobrindo:

```tsx
it('submits username with signup', async () => {
  const signUp = vi.fn().mockResolvedValue(undefined);
  render(<AuthForm mode="signup" loading={false} onSignIn={vi.fn()} onSignUp={signUp}
    onGoogle={vi.fn()} onForgotPassword={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Nome de exibicao'), 'Ana');
  await userEvent.type(screen.getByLabelText('Username'), 'ana-voleio');
  await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
  await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(signUp).toHaveBeenCalledWith('ana@example.com', 'senha-segura', 'Ana', 'ana-voleio');
});

it('completes username onboarding and returns to intended route', async () => {
  const completeUsername = vi.fn().mockResolvedValue(undefined);
  renderAuthPage('/escolher-username', {
    state: { kind: 'onboarding', userId: 'u1', playerId: 'p1' }, completeUsername,
  }, { from: { pathname: '/comunidades' } });
  await userEvent.type(screen.getByLabelText('Username'), 'ana-voleio');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(completeUsername).toHaveBeenCalledWith('ana-voleio');
});
```

- [ ] **Step 2: Run page tests and verify failure**

Run: `npm run test:ui -- src/app/auth/AuthPages.spec.tsx`

Expected: FAIL because page contracts and username field do not exist.

- [ ] **Step 3: Expand `AuthForm` without redesigning it**

Alterar o contrato de `src/components/account/AuthForm.tsx` para:

```ts
export interface AuthFormProps {
  mode: 'signin' | 'signup';
  loading: boolean;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string, name: string, username: string): Promise<void>;
  onGoogle(): Promise<void>;
  onForgotPassword(): void;
}
```

No cadastro, renderizar `name` e `username`; no login, renderizar o comando de recovery.
Adicionar um botao Google com icone existente e manter classes/layout atuais. Validar
username com `/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/` antes de disparar `onSignUp`.

- [ ] **Step 4: Implement transition pages**

Criar `src/app/auth/AuthPages.tsx` exportando:

```tsx
export function LoginPage({ mode }: { mode: 'signin' | 'signup' }) {
  const navigate = useNavigate();
  return <AuthForm
    mode={mode}
    loading={false}
    onSignIn={supabaseAuthClient.signIn}
    onSignUp={supabaseAuthClient.signUp}
    onGoogle={supabaseAuthClient.signInWithGoogle}
    onForgotPassword={() => navigate('/recuperar-senha')}
  />;
}

export function UsernameOnboardingPage() {
  const { completeUsername } = useAuthSession();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  return <form onSubmit={async (event) => {
    event.preventDefault(); setError(null);
    try { await completeUsername(username); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel salvar o username.');
    }
  }}>
    <label htmlFor="username">Username</label>
    <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} />
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit">Continuar</button>
  </form>;
}

export function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return <form onSubmit={async (event) => {
    event.preventDefault(); await supabaseAuthClient.requestPasswordRecovery(email); setSent(true);
  }}>
    <label htmlFor="recovery-email">E-mail</label>
    <input id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
    <button type="submit">Enviar recuperacao</button>
    {sent ? <p>Confira seu e-mail.</p> : null}
  </form>;
}
```

No mesmo arquivo, implementar `AuthCallbackPage` como tela de espera que aguarda o
provider, `EmailVerificationPage` com instrucao e logout, `AuthLoadingPage` com o spinner
atual, e `RecoverableSessionPage` com `retry`. `MfaChallengePage` deve informar que a
confirmacao e exigida e chamar o fluxo TOTP implementado na Task 7.

Para manter a arvore compilavel antes da Task 7, exportar inicialmente:

```tsx
export function MfaSetupPage() { return <AuthLoadingPage />; }
export function MfaChallengePage() { return <AuthLoadingPage />; }
```

- [ ] **Step 5: Remove login ownership from account sync view**

Criar `src/app/AppRouter.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router';
import App from '../App';
import { AuthGuard } from './auth/AuthGuard';
import {
  AuthCallbackPage, AuthLoadingPage, EmailVerificationPage, LoginPage,
  MfaChallengePage, MfaSetupPage, PasswordRecoveryPage, RecoverableSessionPage,
  UsernameOnboardingPage,
} from './auth/AuthPages';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage mode="signin" />} />
      <Route path="/cadastro" element={<LoginPage mode="signup" />} />
      <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/loading" element={<AuthLoadingPage />} />
      <Route path="/auth/recuperar-sessao" element={<RecoverableSessionPage />} />
      <Route path="/verificar-email" element={<EmailVerificationPage />} />
      <Route path="/escolher-username" element={<UsernameOnboardingPage />} />
      <Route path="/configurar-mfa" element={<MfaSetupPage />} />
      <Route path="/confirmar-mfa" element={<MfaChallengePage />} />
      <Route element={<AuthGuard />}><Route path="/*" element={<App />} /></Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

Criar `src/app/AppRouter.spec.tsx` com `MemoryRouter`, provider falso e estas assercoes:

```tsx
it('renders login route without mounting the protected app', () => {
  renderRouter('/entrar', { kind: 'anonymous' });
  expect(screen.getByRole('heading', { name: /entrar/i })).toBeTruthy();
});

it('redirects protected route to onboarding and preserves destination', () => {
  renderRouter('/comunidades', { kind: 'onboarding', userId: 'u1', playerId: 'p1' });
  expect(screen.getByLabelText('Username')).toBeTruthy();
});
```

Depois, em `AccountSyncViewProps`, remover `onSignIn` e `onSignUp` e adicionar:

```ts
onLinkGoogleIdentity: () => Promise<void>;
```

Na secao de conta autenticada, adicionar o comando explicito:

```tsx
<button
  type="button"
  className="btn btn-outline btn-sm"
  onClick={() => handleAction('Vincular Google', onLinkGoogleIdentity)}
  disabled={actionLoading}
>
  Vincular Google
</button>
```

`App.tsx` passa `supabaseAuthClient.linkGoogleIdentity` para essa prop. O estado anonimo
deixa de ser renderizado nessa view porque as rotas protegidas so montam `App` no estado
`ready`. Em `App.tsx`, remover as props correspondentes ao montar `AccountSyncView`.

- [ ] **Step 6: Run page and type tests**

Run: `npm run test:ui -- src/app/auth/AuthPages.spec.tsx src/app/AppRouter.spec.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit auth journeys**

```bash
git add src/app/auth/AuthPages.tsx src/app/auth/AuthPages.spec.tsx src/app/AppRouter.tsx src/app/AppRouter.spec.tsx src/components/account/AuthForm.tsx src/components/account/AccountSyncView.tsx src/App.tsx
git commit -m "feat(auth): add onboarding and recovery journeys"
```

---

### Task 7: MFA TOTP shell and AAL2 challenge

**Files:**
- Modify: `src/infra/supabase/authClient.ts`
- Modify: `src/infra/supabase/authClient.test.ts`
- Modify: `src/app/auth/AuthPages.tsx`
- Modify: `src/app/auth/AuthPages.spec.tsx`

**Interfaces:**
- Consumes: Supabase `auth.mfa.listFactors`, `enroll`, `challenge`, `verify`.
- Produces: `MfaEnrollment`, `MfaChallenge`, `enrollTotp`, `verifyTotp`; conta retorna a rota pretendida apos `aal2`.

- [ ] **Step 1: Write failing MFA adapter tests**

Adicionar a `authClient.test.ts`:

```ts
test('TOTP verification challenges and verifies the selected factor', async () => {
  const calls: unknown[] = [];
  const client = createAuthClient(fakeAuth({
    listFactors: async () => ({ data: { totp: [{ id: 'factor-1', status: 'verified' }] }, error: null }),
    challenge: async (value) => { calls.push(['challenge', value]); return { data: { id: 'challenge-1' }, error: null }; },
    verify: async (value) => { calls.push(['verify', value]); return { data: {}, error: null }; },
  }), { origin: 'https://panelinha.test' });
  await client.verifyTotp('123456');
  assert.deepEqual(calls, [
    ['challenge', { factorId: 'factor-1' }],
    ['verify', { factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }],
  ]);
});
```

- [ ] **Step 2: Run MFA test and verify failure**

Run: `npm run test:unit -- --test-name-pattern="TOTP verification"`

Expected: FAIL because `verifyTotp` is absent.

- [ ] **Step 3: Implement MFA methods**

Adicionar a `AuthClient`:

```ts
export interface MfaEnrollment { factorId: string; qrCode: string; secret: string }
enrollTotp(): Promise<MfaEnrollment>;
verifyTotp(code: string): Promise<void>;
```

Adicionar ao adapter:

```ts
async enrollTotp() {
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp' });
  fail(error);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
},
async verifyTotp(code) {
  const factors = await auth.mfa.listFactors(); fail(factors.error);
  const factor = factors.data.totp.find((item) => item.status === 'verified');
  if (!factor) throw new Error('Nenhum fator TOTP verificado.');
  const challenge = await auth.mfa.challenge({ factorId: factor.id }); fail(challenge.error);
  const verified = await auth.mfa.verify({
    factorId: factor.id, challengeId: challenge.data.id, code,
  });
  fail(verified.error);
},
```

Adicionar tambem ao `unavailableAuthClient` para manter o contrato total:

```ts
enrollTotp: async () => { throw unavailable; },
verifyTotp: async () => { throw unavailable; },
```

- [ ] **Step 4: Complete the MFA page**

`MfaSetupPage` chama `enrollTotp`, exibe o QR real retornado pelo Supabase e verifica o
primeiro codigo antes de navegar para o destino preservado. `MfaChallengePage` recebe
seis digitos, chama `verifyTotp`, executa `auth.retry()` e volta
ao `location.state.from`. Se nao houver fator verificado, oferece `enrollTotp`, exibe o QR
retornado pelo Supabase e exige verificacao antes de prosseguir. Nao persistir secret ou
QR em storage.

- [ ] **Step 5: Run MFA and UI tests**

Run: `npm run test:unit -- --test-name-pattern="TOTP verification"`

Expected: PASS.

Run: `npm run test:ui -- src/app/auth/AuthPages.spec.tsx`

Expected: PASS para challenge valido, codigo invalido recuperavel e retorno de rota.

- [ ] **Step 6: Commit MFA shell**

```bash
git add src/infra/supabase/authClient.ts src/infra/supabase/authClient.test.ts src/app/auth/AuthPages.tsx src/app/auth/AuthPages.spec.tsx
git commit -m "feat(auth): add TOTP challenge shell"
```

---

### Task 8: Mount the auth boundary and gate product cache

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useCloudSync.spec.tsx`
- Modify: `src/application/cloudSyncStartupUseCases.ts`
- Modify: `src/application/cloudSyncStartupUseCases.test.ts`

**Interfaces:**
- Consumes: `AuthSessionProvider`, `AppRouter`, `AuthSessionState`.
- Produces: a single mounted auth owner; cloud startup only when `authState === 'ready'`.

- [ ] **Step 1: Write failing cache gate test**

Adicionar a `cloudSyncStartupUseCases.test.ts`:

```ts
test('startup never opens cloud/cache before account is ready', () => {
  const plan = planStartupCloudDownload({
    authState: 'onboarding',
    isSupabaseConfigured: true,
    userId: 'u1',
    autoSyncedForUserId: null,
    cacheOwnerId: 'u1',
    pendingChanges: 0,
  });
  assert.equal(plan.shouldDownload, false);
  assert.equal(plan.nextAutoSyncedForUserId, null);
});
```

- [ ] **Step 2: Run cache gate test and verify failure**

Run: `npm run test:unit -- --test-name-pattern="before account is ready"`

Expected: FAIL because `authState` is not part of the input.

- [ ] **Step 3: Add the readiness precondition**

Alterar o input e a primeira guarda de `planStartupCloudDownload`:

```ts
export interface StartupCloudDownloadInput {
  authState: 'initializing' | 'anonymous' | 'email_verification' | 'onboarding' |
    'mfa_required' | 'ready' | 'recoverable_error';
  isSupabaseConfigured: boolean;
  userId: string | null;
  autoSyncedForUserId: string | null;
  cacheOwnerId: string | null;
  pendingChanges: number;
}

if (input.authState !== 'ready') {
  return { shouldDownload: false, nextAutoSyncedForUserId: null };
}
```

Atualizar os testes existentes com `authState: 'ready'`.

- [ ] **Step 4: Mount router/provider**

Substituir o render de `src/main.tsx` por:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRouter } from './app/AppRouter';
import { AuthSessionProvider } from './app/auth/AuthSessionProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthSessionProvider>
        <AppRouter />
      </AuthSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

Em `App.tsx`, passar `auth.state.kind` para `planStartupCloudDownload`:

```ts
const plan = planStartupCloudDownload({
  authState: auth.state.kind,
  isSupabaseConfigured: auth.isSupabaseConfigured,
  userId: auth.user?.id ?? null,
  autoSyncedForUserId: autoSyncedForUser.current,
  cacheOwnerId: getLocalCacheOwnerId(),
  pendingChanges,
});
```

A facade `useAuth` deve expor `state` sem alterar os demais consumidores.

- [ ] **Step 5: Run the full local quality gate**

Run: `npm run lint`

Expected: PASS.

Run: `npm run lint:eslint`

Expected: PASS.

Run: `npm run format:check`

Expected: PASS.

Run: `npm run test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `supabase db reset`

Expected: PASS.

- [ ] **Step 6: Verify essential browser journeys**

Start: `npm run dev`

Verify at the printed local URL:

1. Anonymous access to `/` redirects to `/entrar` and preserves `/` as destination.
2. Password signup reaches email verification or onboarding without duplicate player.
3. Existing Auth account without product rows reaches onboarding and self-repairs.
4. Username conflict remains onboarding and shows an actionable error.
5. Recovery callback allows password update.
6. Google callback resumes the intended route.
7. Account bootstrap failure shows retry and does not fake logout.
8. App and cache mount only after `ready`.

- [ ] **Step 7: Commit the mounted boundary**

```bash
git add src/main.tsx src/App.tsx src/hooks/useAuth.ts src/application/cloudSyncStartupUseCases.ts src/application/cloudSyncStartupUseCases.test.ts src/hooks/useCloudSync.spec.tsx
git commit -m "feat(auth): gate app startup on ready account"
```

---

### Task 9: CAPTCHA for password and recovery flows

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/app/auth/CaptchaField.tsx`
- Create: `src/app/auth/CaptchaField.spec.tsx`
- Modify: `src/infra/supabase/authClient.ts`
- Modify: `src/infra/supabase/authClient.test.ts`
- Modify: `src/components/account/AuthForm.tsx`
- Modify: `src/app/auth/AuthPages.tsx`

**Interfaces:**
- Consumes: `VITE_TURNSTILE_SITE_KEY`, Cloudflare Turnstile and Supabase `captchaToken` options.
- Produces: optional development challenge and mandatory production token when the site key is configured.

- [ ] **Step 1: Install the focused Turnstile wrapper**

Run: `npm install @marsidev/react-turnstile`

Expected: dependency and lockfile updated without unrelated upgrades.

- [ ] **Step 2: Write failing token-forwarding tests**

Adicionar a `src/infra/supabase/authClient.test.ts`:

```ts
test('password sign-in forwards the CAPTCHA token to Supabase', async () => {
  let payload: unknown;
  const client = createAuthClient({
    signInWithPassword: async (value: unknown) => {
      payload = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signIn('ana@example.com', 'senha-segura', 'captcha-token');
  assert.deepEqual(payload, {
    email: 'ana@example.com',
    password: 'senha-segura',
    options: { captchaToken: 'captcha-token' },
  });
});
```

- [ ] **Step 3: Run the adapter test and verify failure**

Run: `npm run test:unit -- --test-name-pattern="CAPTCHA token"`

Expected: FAIL because auth methods do not accept or forward `captchaToken`.

- [ ] **Step 4: Extend auth methods with an optional token**

Alterar as assinaturas de `AuthClient`:

```ts
signIn(email: string, password: string, captchaToken?: string): Promise<void>;
signUp(
  email: string,
  password: string,
  name: string,
  username: string,
  captchaToken?: string,
): Promise<void>;
requestPasswordRecovery(email: string, captchaToken?: string): Promise<void>;
```

Encaminhar o token nos tres adapters:

```ts
await auth.signInWithPassword({ email, password, options: { captchaToken } });
await auth.signUp({
  email,
  password,
  options: { data: { name, username }, captchaToken },
});
await auth.resetPasswordForEmail(email, {
  redirectTo: `${location.origin}/recuperar-senha`,
  captchaToken,
});
```

- [ ] **Step 5: Add the Turnstile field**

Criar `src/app/auth/CaptchaField.tsx`:

```tsx
import { Turnstile } from '@marsidev/react-turnstile';

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env ?? {};

export function CaptchaField({ onToken }: { onToken(token: string | undefined): void }) {
  const siteKey = env.VITE_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(undefined)}
      onError={() => onToken(undefined)}
      options={{ language: 'pt-br', size: 'flexible' }}
    />
  );
}
```

O teste `CaptchaField.spec.tsx` deve mockar `@marsidev/react-turnstile`, disparar
`onSuccess('token-1')` e verificar `onToken('token-1')`.

- [ ] **Step 6: Connect forms to CAPTCHA**

`AuthForm` mantem `captchaToken` em estado, renderiza `<CaptchaField>` antes do submit e
passa o token para `onSignIn`/`onSignUp`. `PasswordRecoveryPage` faz o mesmo para
`requestPasswordRecovery`. Quando `VITE_TURNSTILE_SITE_KEY` existir, os botoes ficam
desabilitados ate receber um token; sem chave, desenvolvimento local continua funcional.

- [ ] **Step 7: Run CAPTCHA, auth and type checks**

Run: `npm run test:unit -- --test-name-pattern="CAPTCHA token"`

Expected: PASS.

Run: `npm run test:ui -- src/app/auth/CaptchaField.spec.tsx src/app/auth/AuthPages.spec.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit CAPTCHA integration**

```bash
git add package.json package-lock.json src/app/auth/CaptchaField.tsx src/app/auth/CaptchaField.spec.tsx src/infra/supabase/authClient.ts src/infra/supabase/authClient.test.ts src/components/account/AuthForm.tsx src/app/auth/AuthPages.tsx
git commit -m "feat(auth): protect credential flows with CAPTCHA"
```

---

### Task 10: Security verification and production configuration checklist

**Files:**
- Create: `docs/operations/auth-production-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed auth foundation and local Supabase migration.
- Produces: repeatable operator checklist; no production reset.

- [ ] **Step 1: Write the operator checklist**

Criar `docs/operations/auth-production-checklist.md` com itens verificaveis:

```markdown
# Auth Production Checklist

- [ ] Backup do projeto Supabase confirmado antes da migration.
- [ ] Redirect URLs incluem producao e `/auth/callback`.
- [ ] Google provider usa client ID/secret do ambiente correto.
- [ ] Confirmacao de email esta ativa.
- [ ] SMTP proprio esta configurado e testado.
- [ ] CAPTCHA esta ativo em cadastro, login e recovery.
- [ ] Rate limits foram revisados no dashboard.
- [ ] TOTP esta habilitado; SMS continua desabilitado.
- [ ] Service role nao existe em variavel `VITE_*`.
- [ ] `ensure_account_ready` nao executa para `anon`.
- [ ] Usuario autenticado le apenas perfil/jogador permitidos por RLS.
- [ ] Logs nao incluem access token, refresh token, secret TOTP ou senha.
- [ ] Smoke test de cadastro, recovery, Google, onboarding e logout passou.
- [ ] Nenhuma tabela de produto foi resetada nesta entrega.
```

Adicionar ao `README.md` um link para o checklist e para a especificacao aprovada.

- [ ] **Step 2: Run documentation and repository checks**

Run: `rg -n "service_role|SUPABASE_SERVICE" src .env.example`

Expected: nenhuma service role exposta em `src` ou variavel `VITE_*`.

Run: `npm run format:check`

Expected: PASS.

Run: `git diff --check`

Expected: PASS.

- [ ] **Step 3: Request code review**

Usar `superpowers:requesting-code-review` para revisar os commits desta entrega contra
`docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md`, com foco em
bootstrap idempotente, RLS, sessao recuperavel e isolamento antes de `ready`.

- [ ] **Step 4: Commit operational documentation**

```bash
git add docs/operations/auth-production-checklist.md README.md
git commit -m "docs(auth): add production readiness checklist"
```

## Completion Gate

Este plano termina somente quando:

- migrations e schema tests passam localmente;
- conta nova e conta Auth preexistente convergem para perfil + jogador 1:1;
- username invalido/conflitante e recuperavel sem duplicacao;
- sessao valida com falha de bootstrap nao vira logout;
- password, recovery, Google OAuth e TOTP possuem testes;
- login, cadastro e recovery encaminham CAPTCHA quando configurado;
- rotas preservam destino e protegem o app antes de `ready`;
- cache/sync nao inicializa antes de `ready`;
- suite completa, lint, format, build e `supabase db reset` passam;
- checklist de producao esta preenchivel;
- nenhuma migration foi aplicada no Supabase real e nenhum dado foi resetado por este plano.

Depois deste gate, escrever o plano 2 contra o codigo integrado: Player Claim,
Communities & Evaluations.
