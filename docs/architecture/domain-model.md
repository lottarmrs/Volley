# Domain Model — Legacy / Transitional Current-Model Reference

> Status: `TRANSITIONAL / LEGACY CURRENT-MODEL REFERENCE`
>
> Target authority: **NO** — this document is not a target source of truth.
>
> Owner: `Architecture Governance + legacy implementation owners`
>
> Last reviewed: `2026-08-26 / C7-R2`
>
> Governing target: [`PRINCIPLES.md`](./PRINCIPLES.md), [`GLOSSARY.md`](./GLOSSARY.md), [`EAP-MASTER.md`](./EAP-MASTER.md), owner N2 chapters, [`adr/ADR-CATALOG.md`](./adr/ADR-CATALOG.md), and [`execution/C6-EXECUTION-MASTER.md`](./execution/C6-EXECUTION-MASTER.md).
>
> Review/removal trigger: archive or rewrite after C6 target paths replace the legacy contracts described below.

---

## How to read this file

This file records **current/legacy product language and implementation assumptions that existed before the architecture consolidation**.

It remains useful for:

- understanding Current State;
- migration mapping;
- identifying legacy dependencies;
- explaining why adapters/strangler slices exist;
- preserving historical rationale.

It must **not** be used to override target architecture.

In particular, statements below about:

```text
local-first shared state
generic sync
Player.userId as the account link
CommunityMember legacy role model
Commands updating shared local state after cloud failure
```

are evidence of the Current/Transitional system, not permission to introduce new target dependencies on those contracts.

When this document conflicts with canonical architecture:

```text
canonical target wins for design
+
C6 defines how runtime migrates safely
```

Do not silently edit the target to match this legacy file.

---

# Historical content preserved

This section preserves the former document content for migration evidence.

## Layers

- UI renders view models and sends user intentions.
- Application commands and queries orchestrate use cases.
- Domain modules hold pure business rules.
- Sync modules move local/cloud data and report issues.
- Storage adapters handle localStorage, Supabase, and future persistence engines.
- Supabase/Postgres enforce cloud authorization, constraints, and migrations.

### Target interpretation

The first three layering intentions remain useful. The generic Sync role and broad localStorage domain authority are strangler targets under C6; Supabase/Postgres remain infrastructure while semantic ownership belongs to bounded contexts/Application contracts.

## Identity

- `UserProfile` is an authenticated account profile.
- `AuthRole` is global: `master`, `programmer`, or `user`.
- Global role never replaces local community role.
- `master` can write globally.
- `programmer` is support/read-only in product UI.
- Normal users get write permission from `CommunityMember`.

### Target interpretation

Platform/staff roles, if retained, are **not** Community governance roles and are not Organizer responsibility. Target Community governance is `OWNER | ADMIN | MEMBER` plus contextual capabilities/operational responsibilities. Authorization remains server-derived and resource-contextual.

## Communities

- `Community` is the organizational space.
- `CommunityMember` is the local role inside one community.
- Only active memberships grant write permissions.
- Pending, invited, and rejected memberships do not grant product mutations.
- Local-only communities keep local-first owner behavior.

### Target interpretation

`CommunityMembership` and `CommunityPlayer` are distinct. Shared Community state is server-authoritative. The local-first sentence above is legacy/current behavior and must not be copied into target Community Commands.

## Athletes

- `Player` is the athlete identity. It may exist without an authenticated account.
- `Player.userId` links an athlete to one auth account.
- `PlayerLinkProposal` represents a request to bind a user to a player.
- Guest players cannot be linked to accounts.
- Direct self-link is local-only/creator-owned behavior; cloud players use RPC review flows.

### Target interpretation

The persistent sports identity remains `Player`, but target account linkage is an explicit controlled `PlayerAccountLink` relationship/workflow rather than permanent identity semantics embedded in `Player.userId`. Guest participation does not automatically create a Player.

## Sessions

- `Session` is a playable event.
- `Session.config` is the rules snapshot used for that event.
- A session cannot be ready for team generation without name, date, enough players,
  a matching config type, and a valid team count.
- Ranking and statistics remain derived from sessions, games, teams, point events,
  and reports. They are not primary write models.

### Target interpretation

The useful idea of readiness and frozen rules survives, but target Session is separated from Match, RegistrationWindow, TeamDraw and Competition. Historical Stats use MatchParticipation/Match facts rather than mutable current Team membership.

## Sync

- `syncStatus` expresses local/cloud state, not product authorization.
- Failed upload items must remain local and pending.
- Cloud adapters may throw technical errors; domain modules return deterministic
  product decisions.

### Target interpretation

These statements describe the legacy generic sync model. Target architecture has **no universal sync state machine**. Offline policy is classified per operation; Quick may be offline-owned until explicit handoff, cached reads are replaceable, Registration/Voting are online-authoritative, and shared Match offline behavior uses the explicit epoch/sequence/outbox protocol.

## Application Layer

- Application commands and queries live in `src/application/*`.
- Commands receive user intentions, current local state, timestamps, and IO gateways.
- Commands may update local state even when cloud IO fails, but must report recoverable
  technical issues.
- Product errors such as missing auth, missing athlete, or invalid link attempts are not
  logged as technical failures.
- Account-link UI renders a View Model from the application layer rather than deriving
  cloud/local state directly in JSX.
- Supabase services remain adapters; React components should not call them directly for
  flows that have commands or queries.
- Community membership operations live behind `src/application/communityMembershipUseCases.ts`.
- Community member panels should render `communityMembersViewModel` output instead of deriving role/editability rules in JSX.
- Sensitive membership role changes and removals go through Supabase RPCs (`set_community_member_role` and `remove_community_member`) behind the membership gateway; browser code should not mutate those rows directly.

### Target interpretation

The Application boundary, ViewModel separation, adapter isolation and semantic privileged operations are preserved. The statement that Commands may update shared local state when cloud IO fails is **not** a target general rule; authority depends on the operation class from N2.12 and the owner bounded context.

---

# Migration use only

When a C6 slice references this file, it should name the exact legacy concept being strangled, for example:

```text
Legacy Player.userId
Legacy CommunityMember role
Legacy LocalSyncPayload
Legacy Session.selectedPlayerIds[]
Legacy Team.playerIds[]
Legacy Game mutable score
Legacy syncStatus/cloudId/local_id
```

New target code must not expand those contracts merely because they are documented here.
