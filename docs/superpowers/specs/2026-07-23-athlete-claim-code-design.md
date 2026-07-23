# Athlete Claim Code — Design

## Context

Plan 1 (Account Identity & Auth Foundation) shipped a full propose/review player-link
system: `player_link_proposals`, `player_identity_claims`, `player_identity_aliases`,
`merge_player_identity_claim`, and the `propose_player_link`/`approve_player_link`/
`reject_player_link`/`cancel_my_link_proposal` RPCs. It solves a general "merge two
players' histories together" problem — a user proposes a link to any existing player,
a community admin reviews and approves it, and the merge engine reconciles both
players' data into one canonical player.

That generality is no longer needed. The product decision going forward is simpler:

- A normal signup creates the account and its player together (1:1, "born together").
  This is already what `ensure_account_ready`/`handle_new_user` do.
- The only case where a player exists before its account does is a **guest player
  created by an admin/moderator/organizer** (e.g. adding an athlete's profile to a
  session before that athlete has signed up).
- That guest player should be claimable by the real athlete via a **short code**,
  entered once, at signup. Knowing the code is the proof of authorization — no admin
  review step.

Because the code can only be used at signup (before the account has any player yet),
there is never a "reconcile two players' histories" scenario for this flow. The
guest player simply *becomes* the new account's player. This removes the need for the
merge engine entirely for this path.

This also directly fixes an observed production symptom: sync failures reported as
"proposta de vínculo" / "avaliações de atletas" — "Falha desconhecida" — which
traced to the deployed app (pre-Plan-1, at `origin/main` `fa95802`) running against a
database that now has Plan 1's stricter guard triggers on `player_link_proposals`/
`player_evaluations`. Removing the proposal system removes that whole failure class.

**Production reset:** as part of scoping this work, the real Supabase project
(`csoslatxjjazrtrtylke`, "Panelinha") was fully reset — all `public.*` tables
truncated and all `auth.users` deleted — with explicit, typed user confirmation, no
backup available. This was executed before this design was written, not as part of
its implementation. It removes any legacy-data migration concern: there are no
existing players to backfill codes for.

## Global Constraints

- A player row's `claim_code` must never be visible through the general `players`
  read path that community members already have (`Community members can read
  players`, `Linked users can read their own player`). Only the player's `owner_id`
  or app staff (`is_app_staff()`) may read it.
- Claiming a code must never block signup. An invalid or already-claimed code falls
  back to creating a fresh player — signup itself must always succeed.
- Every player created without an account (`user_id is null`) gets a code — not just
  ones flagged `isGuest` client-side. The server must not trust a client flag for a
  security-relevant decision.
- A code is single-use: once claimed, it is deleted and cannot be reused.
- Do not add TanStack Query, Dexie, XState, or Zod (carried over from Plan 1's
  constraints — still applies to this codebase).
- Scope is password/email signup only for this iteration. Google OAuth signup does
  not collect a claim code in this pass (see Follow-ups).

## Data Model

New table, mirroring the existing `communities.join_code` pattern but kept as its own
table (not a column on `players`) specifically so it is never returned by the
general `players` SELECT policies:

```sql
create table public.player_claim_codes (
  player_id uuid primary key references public.players(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_claim_codes enable row level security;

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
```

No client-side INSERT/UPDATE/DELETE policies — code lifecycle is entirely
server-managed (trigger creates it, the claim function deletes it).

### Code generation trigger

```sql
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

create trigger trg_generate_player_claim_code
  after insert on public.players
  for each row execute function public.generate_player_claim_code();
```

Follows the same collision-retry-loop style already used by `generate_join_code`.

### Claim integration in `handle_new_user`

`handle_new_user()` already fires on every `auth.users` insert (password and OAuth
alike) and already creates a default player + applies a `username` from signup
metadata. It gains one new branch, evaluated before the existing "create a fresh
player" logic:

```sql
-- inside handle_new_user(), before the existing insert-a-fresh-player block
declare
  v_claim_code text := upper(trim(new.raw_user_meta_data->>'claim_code'));
  v_claimed_player_id uuid;
begin
  if nullif(v_claim_code, '') is not null then
    select player_id into v_claimed_player_id
      from public.player_claim_codes
     where code = v_claim_code
     for update;

    if v_claimed_player_id is not null then
      -- guard_player_user_id (BEFORE UPDATE trigger, unaffected by this design)
      -- blocks any user_id change outside this transactional signal.
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
        -- claimed player now stands in for the "create a fresh player" branch;
        -- skip it entirely for this signup.
      end if;
    end if;
  end if;
```

If the code doesn't exist, was already claimed, or the guarded UPDATE affects zero
rows (race with another claim), fall through unchanged to the existing "insert a
fresh player" path — signup completes normally either way.

## Signup UI

`AuthFormProps.onSignUp` gains an optional trailing `claimCode?: string` parameter,
matching the existing `username` pattern. In signup mode, `AuthForm` renders an
optional "Código do atleta" field alongside the existing name/username/email/password
fields, and forwards the value into `supabaseAuthClient.signUp(email, password, name,
username, claimCode, captchaToken)` → `auth.signUp({ ..., options: { data: { name,
username, claim_code: claimCode } } })`. `LoginPage` needs no changes — it already
forwards `AuthForm`'s callbacks through unchanged.

No dedicated success/failure UI is needed for a bad code — per the constraint above,
an invalid code silently falls back to normal signup. (Optional, non-blocking: a toast
noting "código não encontrado, criando um novo perfil" — left to implementation
judgment, not required.)

## Removal Scope

**Database** (new migration): drop, in dependency order —
`player_link_proposals` (table), `player_identity_claims`, `player_identity_aliases`,
functions `propose_player_link`, `approve_player_link`, `reject_player_link`,
`cancel_my_link_proposal`, `merge_player_identity_claim`,
`guard_active_player_reference`, `guard_aliased_player_reactivation`, and their
triggers. `guard_player_user_id`, `guard_player_account_identity_history`,
`guard_player_account_identity_delete`, `handle_player_soft_delete_user_unlink`,
`unlink_player_user` are unaffected — they guard `players.user_id` mutation in
general, not proposal review specifically, and remain relevant to the claim-code
`UPDATE` above (which must run under the same `allow_user_link_promotion` transactional
signal used elsewhere, since it changes `user_id` outside the normal RPC-only path
guarded by `guard_player_user_id`).

**Application**: delete `src/application/playerClaim.ts` (+ test),
`src/application/playerLinkUseCases.ts` (+ test), `src/infra/supabase/
playerLinkProposalCloudService.ts`, `src/infra/supabase/
playerIdentityAliasCloudService.ts` (+ test), `src/hooks/usePlayerLinkProposals.ts`
(+ spec). Remove the "Vínculo com Perfil de Atleta" section and related props from
`AccountSyncView.tsx`. Remove alias-repair/consolidation logic from
`src/infra/supabase/syncService.ts` (the `applyPlayerIdentityAliases` call sites and
the pre-upload alias-application pass added in Plan 1 Task 3).

## Testing

- Schema contract tests (`schema.test.ts` style, static text assertions — Docker
  remains unavailable in this environment, consistent with every prior task): claim
  code table/RLS/trigger exist; `handle_new_user`'s claim branch present; removed
  objects are genuinely absent from the consolidated `schema.sql`.
- Application-layer unit tests for the `AuthForm` claim code field wiring (mirrors
  existing username-field test pattern).
- Manual/real-Postgres verification against the reset `Panelinha` project once
  implemented, the same way Plan 1's migration was verified this session — this
  environment can now do that directly since the project is active.

## Follow-ups (explicitly out of scope for this design)

- Google OAuth signup does not collect a claim code in this pass. A returning-user
  "enter a code later" flow was explicitly rejected (code claim is signup-only) — if
  OAuth users need this, it requires a distinct two-step design, not a small addition.
- No UI is specified yet for staff/creators to *view* a guest player's claim code
  after creation (e.g. a "copiar código" affordance in the guest-creation flow or
  player detail view). The RLS/data model supports it; the surfacing UI is
  implementation's judgment call, follow existing patterns (e.g. how `join_code` is
  surfaced for communities).
