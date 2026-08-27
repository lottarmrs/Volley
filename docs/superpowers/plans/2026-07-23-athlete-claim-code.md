# Athlete Claim Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guest players created by staff get a short, single-use claim code; entering it during signup assigns that exact player to the new account directly, with no admin review.

**Architecture:** A new `player_claim_codes` table (RLS-restricted to the player's owner or app staff) is populated by an `AFTER INSERT` trigger whenever a player is created without an account. `handle_new_user()` — the trigger that already fires on every `auth.users` insert and already creates a default player — gains one new branch that, given a matching code, reassigns the existing guest player to the new account instead of creating a fresh one. The signup form gains an optional "Código do atleta" field that threads the code through `AuthClient.signUp` as Supabase auth metadata, the same way `username` already does.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, React, `@supabase/supabase-js`, Node test runner, Vitest, Testing Library.

**Companion spec:** `docs/superpowers/specs/2026-07-23-athlete-claim-code-design.md`

## Global Constraints

- The `claim_code` must never be visible through the general `players` read path that community members already have — only the player's `owner_id` or app staff (`is_app_staff()`) may read it. This is why it lives in its own table, not a column on `players`.
- Claiming a code must never block signup. An invalid, missing, or already-claimed code falls back to creating a fresh player — signup itself must always succeed.
- Every player created without an account (`user_id is null`) gets a code — not only ones flagged `isGuest` client-side. Do not trust a client flag for a security-relevant decision.
- A code is single-use: once claimed, its row is deleted and cannot be reused.
- Do not add TanStack Query, Dexie, XState, or Zod.
- Scope is password/email signup only. Google OAuth signup does not collect a claim code in this plan.
- Docker/local Supabase is not available in this environment — schema changes are verified via static contract tests (`schema.test.ts`) against the migration text, the same way every prior migration in this codebase has been verified. Real-Postgres verification happens separately, outside this plan, against the live project.

---

### Task 1: Claim code table, generation trigger, and signup integration

**Files:**
- Create: `supabase/migrations/20260723230000_player_claim_codes.sql`
- Modify: `supabase/migrations/schema.sql`
- Modify: `src/infra/supabase/schema.test.ts`

**Interfaces:**
- Consumes: `public.players`, `public.is_app_staff()`, `public.handle_new_user()` (existing, being replaced), `app.allow_user_link_promotion` transactional signal, `guard_player_user_id` trigger (existing, unaffected — must be respected, not bypassed incorrectly).
- Produces: table `public.player_claim_codes`, function `public.generate_player_claim_code()`, trigger `trg_generate_player_claim_code`, updated `public.handle_new_user()`.

- [ ] **Step 1: Write the failing schema contract tests**

Open `src/infra/supabase/schema.test.ts`. Near the top, alongside the other fixture reads (after the `accountIdentityMigration` block around line 88), add:

```ts
const playerClaimCodesMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260723230000_player_claim_codes.sql',
    import.meta.url,
  ),
);
```

At the end of the file, add:

```ts
test('player claim codes table exists with owner/staff-only read access', () => {
  assert.match(
    playerClaimCodesMigration,
    /create table if not exists public\.player_claim_codes/i,
  );
  assert.match(playerClaimCodesMigration, /player_id uuid primary key/i);
  assert.match(playerClaimCodesMigration, /code text not null unique/i);
  assert.match(
    playerClaimCodesMigration,
    /alter table public\.player_claim_codes enable row level security/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /p\.owner_id = \(select auth\.uid\(\)\)[\s\S]*or public\.is_app_staff\(\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /revoke all on table public\.player_claim_codes from public, anon, authenticated/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /grant select on public\.player_claim_codes to authenticated/i,
  );
});

test('claim code generation trigger only fires for accountless players', () => {
  assert.match(
    playerClaimCodesMigration,
    /create or replace function public\.generate_player_claim_code/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /if new\.user_id is not null then\s*return new;\s*end if;/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /create trigger trg_generate_player_claim_code\s*after insert on public\.players/i,
  );
});

test('handle_new_user claims a matching code before creating a fresh player', () => {
  assert.match(
    playerClaimCodesMigration,
    /create or replace function public\.handle_new_user/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /v_claim_code text := upper\(trim\(new\.raw_user_meta_data->>'claim_code'\)\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /select player_id into v_claimed_player_id\s*from public\.player_claim_codes/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /perform set_config\('app\.allow_user_link_promotion', 'on', true\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /delete from public\.player_claim_codes where player_id = v_claimed_player_id/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /if v_claimed_player_id is null then\s*insert into public\.players/i,
  );
});

test('consolidated schema mirrors the claim code table and updated handle_new_user', () => {
  assert.match(baseSchema, /create table if not exists public\.player_claim_codes/i);
  assert.match(baseSchema, /create or replace function public\.generate_player_claim_code/i);
  assert.match(
    baseSchema,
    /v_claim_code text := upper\(trim\(new\.raw_user_meta_data->>'claim_code'\)\)/i,
  );
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- --test-name-pattern="player claim codes|claim code generation trigger|handle_new_user claims a matching code|consolidated schema mirrors the claim code"`

Expected: FAIL — the migration file doesn't exist yet (`readFixture` returns `''`), so every `assert.match` against an empty string fails.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260723230000_player_claim_codes.sql`:

```sql
create table if not exists public.player_claim_codes (
  player_id uuid primary key references public.players(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_claim_codes enable row level security;

drop policy if exists "Owner or staff can read claim codes" on public.player_claim_codes;
create policy "Owner or staff can read claim codes"
  on public.player_claim_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = player_claim_codes.player_id
        and p.owner_id = (select auth.uid())
    )
    or public.is_app_staff()
  );

revoke all on table public.player_claim_codes from public, anon, authenticated;
grant select on public.player_claim_codes to authenticated;

create or replace function public.generate_player_claim_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if new.user_id is not null then
    return new;
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.player_claim_codes where code = v_code
    );
  end loop;

  insert into public.player_claim_codes (player_id, code)
  values (new.id, v_code);

  return new;
end;
$$;

revoke execute on function public.generate_player_claim_code()
  from public, anon, authenticated;

drop trigger if exists trg_generate_player_claim_code on public.players;
create trigger trg_generate_player_claim_code
  after insert on public.players
  for each row execute function public.generate_player_claim_code();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_username text := public.normalize_account_username(new.raw_user_meta_data->>'username');
  v_claim_code text := upper(trim(new.raw_user_meta_data->>'claim_code'));
  v_claimed_player_id uuid;
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, v_name, new.email, 'user')
  on conflict (id) do nothing;

  if nullif(v_claim_code, '') is not null then
    select player_id into v_claimed_player_id
      from public.player_claim_codes
     where code = v_claim_code
     for update;

    if v_claimed_player_id is not null then
      perform set_config('app.allow_user_link_promotion', 'on', true);

      update public.players
         set user_id = new.id,
             owner_id = new.id,
             has_account_identity_history = true,
             updated_at = now()
       where id = v_claimed_player_id
         and user_id is null;

      if found then
        delete from public.player_claim_codes where player_id = v_claimed_player_id;
      else
        v_claimed_player_id := null;
      end if;
    end if;
  end if;

  if v_claimed_player_id is null then
    insert into public.players (
      owner_id,
      user_id,
      name,
      username,
      has_account_identity_history
    )
    values (new.id, new.id, v_name, null, true)
    on conflict (user_id) where user_id is not null do nothing;
  end if;

  if public.is_valid_account_username(v_username) then
    begin
      update public.players
         set username = v_username,
             updated_at = now()
       where user_id = new.id
         and deleted_at is null
         and username is null;
    exception
      when unique_violation then
        null;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

Note: the `for update` lock on `player_claim_codes` and the guarded `where ... and
user_id is null` on the `players` UPDATE together make this safe against a
theoretical race of two signups claiming the same code concurrently — the second
transaction blocks on the row lock, then finds `found` false after the first
transaction commits and deletes the code row, so it falls through to creating a
fresh player instead of double-claiming.

- [ ] **Step 4: Append the same objects to the consolidated schema**

Open `supabase/migrations/schema.sql`. Find the existing `create or replace function
public.handle_new_user()` block (it's the one immediately preceded by `revoke
execute on function public.ensure_account_ready(text) ...` in the file) and replace
it in place with the new version above (same function, new body). Then append the
`player_claim_codes` table, its RLS policy, the two grants, the
`generate_player_claim_code` function, and its trigger — copy them verbatim from
Step 3, placed after the `handle_new_user` block.

- [ ] **Step 5: Run the schema tests and confirm they pass**

Run: `npm run test:unit -- --test-name-pattern="player claim codes|claim code generation trigger|handle_new_user claims a matching code|consolidated schema mirrors the claim code"`

Expected: PASS.

- [ ] **Step 6: Run the full unit suite and typecheck**

Run: `npm run test:unit`

Expected: PASS, no regressions (this task only adds SQL and test fixtures, no TypeScript source changes).

If exactly 2 unrelated failures appear in `schema.test.ts` with assertion errors
unrelated to claim codes (e.g. about proposal locking), this is a known, recurring
Windows checkout artifact on this repo: `core.autocrlf=true` sometimes converts
committed LF `.sql`/`schema.test.ts` files to CRLF on disk, which breaks raw-text
regex assertions elsewhere in the same file. Fix by checking `file <path>` for
"CRLF" on every file under `supabase/migrations/*.sql` and
`src/infra/supabase/schema.test.ts`, and for any that show CRLF, restore it from the
git blob with `git show HEAD:<path> > <path>`, then rerun. This is not a defect in
this task's changes.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260723230000_player_claim_codes.sql supabase/migrations/schema.sql src/infra/supabase/schema.test.ts
git commit -m "feat(players): add athlete claim code table and signup integration"
```

---

### Task 2: Thread the claim code through AuthClient.signUp

**Files:**
- Modify: `src/infra/supabase/authClient.ts`
- Modify: `src/infra/supabase/authClient.test.ts`

**Interfaces:**
- Consumes: `AuthClient` (existing interface, being extended), `supabase.auth.signUp` (Supabase SDK).
- Produces: `AuthClient.signUp(email, password, name, username, claimCode?, captchaToken?)` — the new parameter list every caller must match.

- [ ] **Step 1: Write the failing adapter test**

Add to `src/infra/supabase/authClient.test.ts`:

```ts
test('sign-up forwards the claim code as auth metadata', async () => {
  let payload: unknown;
  const client = createAuthClient({
    signUp: async (value: unknown) => {
      payload = value;
      return { data: {}, error: null };
    },
  } as never, { origin: 'https://panelinha.test' });
  await client.signUp('ana@example.com', 'senha-segura', 'Ana', 'ana-voleio', 'ABCD1234');
  assert.deepEqual(payload, {
    email: 'ana@example.com',
    password: 'senha-segura',
    options: {
      data: { name: 'Ana', username: 'ana-voleio', claim_code: 'ABCD1234' },
      captchaToken: undefined,
    },
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:unit -- --test-name-pattern="forwards the claim code"`

Expected: FAIL — `client.signUp` only accepts 5 args today (no `claimCode`), and the
current implementation never includes `claim_code` in `options.data`.

- [ ] **Step 3: Extend the interface and adapter**

In `src/infra/supabase/authClient.ts`, change the `signUp` signature in the
`AuthClient` interface (currently lines 9-15):

```ts
  signUp(
    email: string,
    password: string,
    name: string,
    username: string,
    claimCode?: string,
    captchaToken?: string,
  ): Promise<void>;
```

Change the adapter implementation (currently `async signUp(email, password, name, username, captchaToken) { ... }`):

```ts
    async signUp(email, password, name, username, claimCode, captchaToken) {
      const { error } = await auth.signUp({
        email,
        password,
        options: { data: { name, username, claim_code: claimCode }, captchaToken },
      });
      fail(error);
    },
```

`unavailableAuthClient`'s `signUp: async () => { throw unavailable; }` needs no
change — it already ignores its arguments and remains structurally compatible with
the wider signature.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test:unit -- --test-name-pattern="forwards the claim code"`

Expected: PASS.

- [ ] **Step 5: Run the full unit suite and typecheck**

Run: `npm run test:unit`

Expected: PASS, no regressions.

Run: `npm run typecheck`

Expected: FAIL at this point — `src/components/account/AuthForm.tsx` calls
`onSignUp(email, password, name.trim(), normalizedUsername, captchaToken)`, and its
own `AuthFormProps.onSignUp` type still only declares 5 parameters, so passing a
6-parameter-shaped call through `LoginPage`'s `onSignUp={supabaseAuthClient.signUp}`
wiring does not yet break — but Task 3 must update `AuthFormProps` to match, or the
new `claimCode` parameter is unreachable from the UI. This is expected; Task 3
closes the gap. Do not attempt to fix `AuthForm.tsx` in this task.

- [ ] **Step 6: Commit**

```bash
git add src/infra/supabase/authClient.ts src/infra/supabase/authClient.test.ts
git commit -m "feat(auth): forward claim code through AuthClient.signUp"
```

---

### Task 3: Claim code field on the signup form

**Files:**
- Modify: `src/components/account/AuthForm.tsx`
- Modify: `src/app/auth/AuthPages.spec.tsx`

**Interfaces:**
- Consumes: `AuthClient.signUp(email, password, name, username, claimCode?, captchaToken?)` (Task 2).
- Produces: `AuthFormProps.onSignUp` matching the same 6-parameter shape; no new exports.

- [ ] **Step 1: Update the existing signup test to expect the new parameter**

In `src/app/auth/AuthPages.spec.tsx`, the existing `'submits username with signup'`
test (around line 72) currently asserts:

```ts
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        'ana@example.com',
        'senha-segura',
        'Ana',
        'ana-voleio',
        undefined,
      ),
    );
```

Change the final line to add a second `undefined` (the new `claimCode` slot, left
empty since this test doesn't fill in a code), keeping `captchaToken`'s `undefined`
last:

```ts
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        'ana@example.com',
        'senha-segura',
        'Ana',
        'ana-voleio',
        undefined,
        undefined,
      ),
    );
```

Then add a new test in the same `describe('AuthForm', ...)` block, right after it:

```ts
  it('forwards an entered claim code on signup', async () => {
    const signUp = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AuthForm
          mode="signup"
          loading={false}
          onSignIn={vi.fn()}
          onSignUp={signUp}
          onGoogle={vi.fn()}
          onForgotPassword={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Nome de exibicao'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ana-voleio' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.change(screen.getByLabelText('Código do atleta'), {
      target: { value: 'abcd1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        'ana@example.com',
        'senha-segura',
        'Ana',
        'ana-voleio',
        'ABCD1234',
        undefined,
      ),
    );
  });
```

This asserts the field is optional (prior test leaves it blank and still submits)
and that its value is uppercased before being forwarded, matching how the migration
normalizes codes with `upper(trim(...))`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:ui -- src/app/auth/AuthPages.spec.tsx`

Expected: FAIL — the updated assertion has one more argument than
`AuthForm` currently calls `onSignUp` with, and `getByLabelText('Código do atleta')`
finds nothing because the field doesn't exist yet.

- [ ] **Step 3: Add the field to AuthForm**

In `src/components/account/AuthForm.tsx`:

Update `AuthFormProps.onSignUp` (currently lines 13-19) to match Task 2's new
`AuthClient.signUp` shape:

```ts
  onSignUp(
    email: string,
    password: string,
    name: string,
    username: string,
    claimCode?: string,
    captchaToken?: string,
  ): Promise<void>;
```

Add a `claimCode` state hook alongside the existing `username` state (after line 36,
`const [username, setUsername] = useState('');`):

```ts
  const [claimCode, setClaimCode] = useState('');
```

Update `handleSubmit`'s signup branch (currently line 65,
`await onSignUp(email, password, name.trim(), normalizedUsername, captchaToken);`)
to normalize and forward the code:

```ts
        const normalizedClaimCode = claimCode.trim().toUpperCase();
        await onSignUp(
          email,
          password,
          name.trim(),
          normalizedUsername,
          normalizedClaimCode || undefined,
          captchaToken,
        );
```

Also reset it alongside the other fields on success (in the same block as the
existing `setName(''); setUsername(''); setPassword('');` right after the
`onSignUp` call):

```ts
        setClaimCode('');
```

Add the field to the JSX, in the signup-only section, right after the existing
username `form-control` block (after the closing `</div>` that ends the username
field, before the always-rendered e-mail field):

```tsx
          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-xs font-bold uppercase tracking-wider"
                htmlFor="auth-claim-code"
              >
                <span className="label-text">Código do atleta</span>
              </label>
              <div className="relative">
                <input
                  id="auth-claim-code"
                  type="text"
                  placeholder="Opcional"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  className="input input-bordered w-full"
                  disabled={loading}
                />
              </div>
            </div>
          )}
```

(No icon on this field — it's optional and visually distinct from the required
identity fields above it, which all carry an icon.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:ui -- src/app/auth/AuthPages.spec.tsx`

Expected: PASS — both the updated existing test and the new claim-code test.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `npm run test:unit && npm run test:ui`

Expected: PASS, no regressions.

Run: `npm run typecheck`

Expected: PASS — this closes the gap Task 2 deliberately left open.

Run: `npm run lint:eslint`

Expected: PASS (0 errors — pre-existing warnings elsewhere in the codebase are
unrelated and unaffected by this change).

- [ ] **Step 6: Commit**

```bash
git add src/components/account/AuthForm.tsx src/app/auth/AuthPages.spec.tsx
git commit -m "feat(auth): add claim code field to the signup form"
```

---

## Completion Gate

This plan is done when:

- `player_claim_codes` exists with RLS restricted to the player's owner and app
  staff, verified by static schema contract tests (Docker/real Postgres remains
  unavailable in this environment, consistent with every prior migration in this
  codebase).
- Every player created without an account gets a code, via the insert trigger.
- A signup with a valid, unclaimed code assigns that exact player to the new
  account; a signup with a missing, invalid, or already-claimed code still succeeds
  and creates a fresh player.
- The signup form's new field is optional, normalizes to uppercase, and is fully
  wired end to end (`AuthForm` → `AuthClient.signUp` → `auth.signUp` metadata →
  `handle_new_user`).
- Full suite, typecheck, and lint pass.
- No migration has been applied to the real Supabase project as part of this plan
  (that verification happens separately, as it did for the account identity
  foundation migration).

After this gate, the separate "Remove Player Link Proposal System" plan can be
written and executed — it depends on nothing from this plan except that this one no
longer be in flight, to avoid two people editing `handle_new_user`/`schema.sql`
concurrently.
