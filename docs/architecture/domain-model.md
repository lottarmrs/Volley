# Domain Model

This document records the product language used by the codebase. It is not a
database schema. It defines source-of-truth decisions so new code can move
business rules out of React components and IO services without changing behavior.

## Layers

- UI renders view models and sends user intentions.
- Application commands and queries orchestrate use cases.
- Domain modules hold pure business rules.
- Sync modules move local/cloud data and report issues.
- Storage adapters handle localStorage, Supabase, and future persistence engines.
- Supabase/Postgres enforce cloud authorization, constraints, and migrations.

## Identity

- `UserProfile` is an authenticated account profile.
- `AuthRole` is global: `master`, `programmer`, or `user`.
- Global role never replaces local community role.
- `master` can write globally.
- `programmer` is support/read-only in product UI.
- Normal users get write permission from `CommunityMember`.

## Communities

- `Community` is the organizational space.
- `CommunityMember` is the local role inside one community.
- Only active memberships grant write permissions.
- Pending, invited, and rejected memberships do not grant product mutations.
- Local-only communities keep local-first owner behavior.

## Athletes

- `Player` is the athlete identity. It may exist without an authenticated account.
- `Player.userId` links an athlete to one auth account.
- `PlayerLinkProposal` represents a request to bind a user to a player.
- Guest players cannot be linked to accounts.
- Direct self-link is local-only/creator-owned behavior; cloud players use RPC review flows.

## Sessions

- `Session` is a playable event.
- `Session.config` is the rules snapshot used for that event.
- A session cannot be ready for team generation without name, date, enough players,
  a matching config type, and a valid team count.
- Ranking and statistics remain derived from sessions, games, teams, point events,
  and reports. They are not primary write models.

## Sync

- `syncStatus` expresses local/cloud state, not product authorization.
- Failed upload items must remain local and pending.
- Cloud adapters may throw technical errors; domain modules return deterministic
  product decisions.
