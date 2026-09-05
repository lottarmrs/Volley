# XS-W5-01 Versioned PlayerEvaluation Source Model Design

## Context

XS-W5-01 opens wave W5. W4 finished the Registration backbone; W5 separates subjective evaluation
source facts from the derived profiles and factual statistics that consume them. This slice owns the
source fact only: what one evaluator asserts about one Player inside one Community, under one rubric
version, with earlier assertions still readable.

The legacy model cannot express that. `public.player_evaluations` carries `owner_id`, `player_id`,
three opaque `jsonb` columns and, since `20260724150000_evaluation_community_authorization.sql`, a
`community_id` that is `not null`. Its unique index is
`player_evaluations_owner_player_idx on (owner_id, player_id)` — one evaluation per evaluator per
Player **globally**, not per Community. An evaluator active in two Communities collides with
themselves. There is no rubric version, no revision, and no effective state: a re-evaluation
overwrites the previous opinion and the earlier one is gone.

The dimension set is not a schema fact either. `ATTRIBUTE_KEYS` in `src/logic/playerEvaluations.ts`
lists eleven keys — `saque`, `recepcao`, `levantamento`, `ataque`, `bloqueio`, `defesa`,
`velocidade`, `resistencia`, `leituraDeJogo`, `regularidade`, `controleEmocional` — and aggregation
is a client-side median over legacy rows.

Architecture sources:

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, XS-W5-01;
- `docs/architecture/contexts/N2.02-player-skill-profile-ownership.md`, sections 2, 5, 7 and 8;
- `docs/architecture/catalogs/OPEN-DECISIONS.md`, `OPEN-BAL-001`, `OPEN-RATING-001`,
  `OPEN-RATING-002`;
- `docs/architecture/adr/ADR-CATALOG.md`, ADR-MIG-001 (one authority per aggregate) and ADR-MIG-006
  (legacy artifacts never receive invented target semantics).

## Goals

- Add a target source model scoped by Community, Player, evaluator and rubric version, where one
  evaluator holds exactly one effective contribution per Player per Community.
- Keep every superseded contribution readable, so the evaluation history is traceable rather than
  overwritten.
- Store dimension scores normalized, so an absent dimension is an absent row.
- Add one public semantic command that records a contribution and supersedes the caller's previous
  one atomically, requiring a contextual capability and an explicit Community.
- Leave the legacy table, its policies and its consumers untouched.

## Non-goals

- No aggregation, no `CommunityPlayerSkillProfile`, no `GlobalPlayerSkillProfile`. `OPEN-RATING-001`
  stays open and this slice computes nothing.
- No rubric registry and no dimension vocabulary. `OPEN-BAL-001` stays open; XS-W5-02 owns that
  contract.
- No import of legacy rows, and no cohort machinery.
- No read surface, no DTO, no client code, no UI.
- No change to `public.self_evaluations`.
- No change to the legacy `player_evaluations` schema, policies or uniqueness.
- No Realtime, no notification, no production deployment.

## Decisions

### A new target model beside the legacy table, not an evolution of it

The slice adds `public.player_evaluation_contributions` and
`public.player_evaluation_dimension_scores` and leaves `player_evaluations` alone. Widening the
legacy table instead — swapping its unique index and bolting on rubric and revision columns — would
put legacy and target authority in the same row, which ADR-MIG-001 forbids, and would leave nowhere
for a superseded revision to live.

### Append-only, with the effective contribution enforced by a partial unique index

Re-evaluating inserts a new row and stamps the previous one `superseded_at`. A partial unique index
on `(community_id, player_id, evaluator_user_id) where superseded_at is null` makes "one effective
contribution per evaluator per Player per Community" a constraint rather than a convention, and the
table is its own history.

The alternative shapes were rejected for concrete reasons. A root row plus an immutable revisions
child — the W3-05 roster shape — costs two tables and two writes for what is one opinion by one
person. A single row with a revision counter is cheapest to read and destroys exactly what the slice
exists to preserve.

### Dimension scores are rows, not a JSON object

`player_evaluation_dimension_scores` holds one row per `(contribution_id, dimension_key)`. An
evaluator who has no opinion about a dimension produces no row for it.

This is how N2.02 section 7's `missing ≠ 0` stops depending on application discipline. It also lets
XS-W5-02 introduce a rubric registry and point a foreign key at these keys without migrating stored
data, and lets a future aggregation read one dimension without parsing JSON.

### `rubric_version` is opaque text in this slice

The contribution records the rubric version it was made under, as free text with no foreign key and
no vocabulary check. XS-W5-02 owns the rubric contract, and `OPEN-BAL-001` keeps the canonical
dimension set open; creating a registry here would be this slice freezing a decision that is
explicitly not its own. The spec records that the foreign key belongs to XS-W5-02.

The score range is the product's current one, 0 to 10 inclusive, enforced by a named check
constraint so that a rubric with a different scale can widen it deliberately rather than by
accident.

### One command that supersedes and inserts in the same transaction

`record_player_evaluation` writes the new contribution and stamps the caller's previous effective
one in a single transaction. Splitting it into `submit` and `supersede` would admit a state where an
evaluator has been removed from effectiveness with nothing in their place, and someone would then
have to decide what aggregation does with that hole. An upsert that edits in place would reintroduce
destructive writes to the table that exists to be append-only.

### The evaluator is never a parameter

The command has no evaluator argument and resolves identity from `auth.uid()`, the same rule W4-03
applied when it refused to let a client name the Player it was registering. An evaluation is an
attributed opinion; letting a caller name the author would make the attribution meaningless.

### `player.evaluate` comes from a new explicit `EVALUATOR` responsibility

The command requires `public.current_user_has_community_capability(p_community_id,
'player.evaluate')`.

That capability is deliberately absent from `public.community_capabilities` today, and the function
says why in a comment: `player.evaluate` requires an explicit operational capability, and ADMIN does
not confer it (`GINV-CAP-002`). The invariant is explicit that governance roles do not automatically
evaluate Players unless an explicit capability, override or assignment says so.

The older `manage_evaluations` capability, from
`20260726100000_community_role_capabilities.sql`, belongs to `owner` and `admin` **by rank**, which
is exactly what the invariant forbids for the target path. Reusing it was considered and rejected on
that ground; it stays where it is, governing the legacy table's policies.

So this slice adds the missing source. `community_responsibilities` is already a per-person grant —
`(community_id, user_id, responsibility)` — and its vocabulary today is `('ORGANIZER')`, from which
`session.manage` is derived. The slice widens that check to `('ORGANIZER', 'EVALUATOR')` and adds
one branch to `community_capabilities` deriving `player.evaluate` from the new responsibility, in
the same shape as the existing ORGANIZER branch.

This touches a W2 governance file from a W5 slice, which is a real scope cost and is stated rather
than hidden. It is bounded: one widened check constraint and one `union` branch, adding no
capability to any existing holder. Nobody holds `EVALUATOR` until somebody is granted it, and no
rank confers it.

Deriving `player.evaluate` from the existing `ORGANIZER` responsibility instead would have cost no
new vocabulary and would still have been a per-person grant, but it fuses two duties the
architecture separates on purpose and leaves no way to have an evaluator who does not organise.

### The Player must have a living roster standing in that Community

You do not evaluate someone who does not play there. The command reuses
`app_private.registration_player_standing_alive(community_id, player_id)`, extracted in XS-W4-06,
which requires a live and active `community_players` relation and a live and active `players` row.

Its name belongs to Registration and this is its second context. Renaming it now would touch the
hardened W4-04 and W4-06 commands for aesthetics, and C6's non-loss rule discourages reopening a
neighbouring context for convenience. The debt is recorded here: the slice that needs a third caller
renames it.

### Nothing is imported, because there is nothing unscoped to import

The slice record asks for legacy evaluations "without trustworthy Community" to be preserved as
`LEGACY_UNSCOPED_EVALUATION` and excluded from target aggregates. That cohort is empty by
construction: `20260724150000_evaluation_community_authorization.sql` added `community_id` and set
it `not null` in the same migration, which is only possible against a table with no violating rows,
and its own comment records that the table had zero rows in production. No legacy row can lack a
Community.

So this slice imports nothing. The exit gate concerns new writes, the legacy table keeps its rows
and its authority, and a later slice migrates the cohort when there is one worth migrating.

### Self-evaluation stays out

`public.self_evaluations` is one row per Player, with no Community, no evaluator and no history. It
is a different fact from an evaluator's scoped contribution, and folding it in would force a
decision now about which Community a self-evaluation belongs to and what weight it carries — an
aggregation question owned by `OPEN-RATING-001`.

## Data model

```sql
create table public.player_evaluation_contributions (
  id uuid primary key,
  community_id uuid not null references public.communities(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  rubric_version text not null,
  recorded_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  superseded_by_id uuid references public.player_evaluation_contributions(id) on delete restrict,
  command_id uuid not null unique,
  constraint player_evaluation_contributions_rubric_version_check
    check (pg_catalog.btrim(rubric_version) <> ''),
  constraint player_evaluation_contributions_supersession_check
    check ((superseded_at is null) = (superseded_by_id is null))
);

create unique index player_evaluation_contributions_effective_key
  on public.player_evaluation_contributions (community_id, player_id, evaluator_user_id)
  where superseded_at is null;

create index player_evaluation_contributions_player_idx
  on public.player_evaluation_contributions (player_id);
create index player_evaluation_contributions_evaluator_idx
  on public.player_evaluation_contributions (evaluator_user_id);

create table public.player_evaluation_dimension_scores (
  contribution_id uuid not null
    references public.player_evaluation_contributions(id) on delete restrict,
  dimension_key text not null,
  value numeric not null,
  constraint player_evaluation_dimension_scores_pkey primary key (contribution_id, dimension_key),
  constraint player_evaluation_dimension_scores_key_check
    check (pg_catalog.btrim(dimension_key) <> ''),
  constraint player_evaluation_dimension_scores_value_range_check
    check (value >= 0 and value <= 10)
);
```

There is deliberately **no** `source` column. Every row this slice writes has the same origin — an
evaluator's own assessment — so a column with one possible value would be an enum nothing varies,
which is the kind of invented default C6 forbids. The slice that introduces a second origin, a
migrated legacy contribution or a self-evaluation, adds the column when it has a second value to put
in it. Keeping it out also avoids `EVALUATOR` meaning two different things in one slice, since that
token is now the responsibility that grants `player.evaluate`.

`on delete restrict` throughout: an evaluation is evidence, and neither deleting a Community nor
deleting a Player may silently destroy it. The consequence — that those deletes now fail while
contributions exist — is deliberate and belongs to the slice that defines evaluation retention.

Both tables enable row level security, are revoked from `public`, `anon` and `authenticated`, and
receive no policy. Only the `SECURITY DEFINER` command writes them, and it runs as the owner.

## Public contract

```sql
public.record_player_evaluation(
  p_command_id uuid,
  p_contribution_id uuid,
  p_community_id uuid,
  p_player_id uuid,
  p_rubric_version text,
  p_dimensions jsonb
)
returns table (
  contribution_id uuid,
  superseded_contribution_id uuid,
  dimension_count integer
)
```

`p_dimensions` is a JSON object mapping dimension key to numeric score, for example
`{"saque": 7, "ataque": 8.5}`. An object rather than an array, because a duplicate key is then
impossible to express rather than something the command must detect.

The command is `SECURITY DEFINER`, revoked from `public`, `anon` and `authenticated`, then granted
to `authenticated`. It returns no evaluator identity and no scores.

## Transaction flow

1. Validate arguments; any missing one raises `23514`.
2. `app_private.find_command_receipt(p_command_id, 'record_player_evaluation', p_contribution_id)`
   before any row lock, so a command id already recorded under another aggregate or command type
   raises `23505` before a lock is taken. The result is discarded here.
3. Resolve `auth.uid()`; a null actor raises `42501`.
4. Load the Player row `for update`. It is the only lock this command takes. The realistic race is
   one evaluator submitting twice — a double click — and without a lock both calls read the same
   effective contribution, both try to supersede it, and the second inserts a row the partial unique
   index then rejects with a raw `23505`, a code this codebase reserves for command id collisions.
   With the lock the second call waits, sees the first contribution as effective, and supersedes it,
   so the two chain instead of colliding. The Player row is the narrowest row both calls share;
   locking the Community row would serialize every evaluation in the Community for no added safety.
5. Require `public.current_user_has_community_capability(p_community_id, 'player.evaluate')`;
   otherwise `42501`. The capability derivation already requires the grant to name this Community,
   so no separate membership check is added.
6. Replay the receipt, after authorization, so a caller whose capability was revoked cannot read
   back an earlier result.
7. Require `app_private.registration_player_standing_alive(p_community_id, p_player_id)`; otherwise
   `23514`.
8. Validate `p_rubric_version` is non-blank and `p_dimensions` is a non-empty JSON object whose
   every value is a number within 0 to 10; otherwise `23514`.
9. Stamp the caller's existing effective contribution for this Community and Player, if any, with
   `superseded_at = now()` and `superseded_by_id = p_contribution_id`.
10. Insert the new contribution and its dimension rows.
11. `app_private.record_command_receipt(..., 'PLAYER_EVALUATION')`.

Steps 9 and 10 in that order matter: the partial unique index permits exactly one effective row, so
inserting before stamping would collide with the row being replaced.

## Security model

- Every function is `SECURITY DEFINER` with `set search_path = ''` and fully qualified references.
- Both tables carry RLS, no policy and no grant. The evaluation surface is not readable by any
  browser role in this slice, which is the conservative default while N2.02 section 8's composed
  read authorization has no target implementation yet.
- The Community is read from the locked row, never from a payload argument.
- The evaluator cannot be forged: there is no parameter for it.
- A capability override granted in Community A does not authorize a write in Community B, because
  the capability is checked against `p_community_id`, which is also the row that was locked and the
  scope of the standing check.

## Errors

| Condition | Code |
| --- | --- |
| Missing or malformed argument, blank rubric version, empty or out-of-range dimensions | `23514` |
| Player has no living roster standing in the Community | `23514` |
| Command id already used by another aggregate or command type | `23505` |
| Community or Player row absent | `P0002` |
| Anonymous caller, or caller without `player.evaluate` in that Community | `42501` |

There is no `40001`: the command takes no expected-revision token, because an evaluator's own
effective contribution is the only thing it replaces and the Player row lock serializes that.

## Interaction with the rest of the system

Nothing consumes the new tables. Aggregation stays where it is, client-side in
`src/logic/playerEvaluations.ts`, reading legacy rows through the existing sync path. An evaluator
who uses the new command changes no profile, no balancing input and nothing visible in the app.

That is the normal shape of a strangler slice — XS-W4-01 also delivered schema before any command
consumed it — and it is stated here so the slice is not mistaken for shipping a new evaluation
feature. The consumer is the profile slice, and the estimator it will need is still open under
`OPEN-RATING-001`.

The legacy uniqueness defect survives this slice: `player_evaluations` still permits one evaluation
per evaluator per Player globally, so an evaluator active in two Communities still collides there.
The target model is correct for new writes; retiring the legacy authority belongs to the cohort
migration.

## Test strategy

A new database suite, `src/test/db/playerEvaluationContributions.dbtest.ts`. The slice is entirely
SQL and adds no unit or UI test.

- Happy path: the contribution is effective, its dimension rows match the input exactly, the receipt
  is recorded, and the return shape carries the right counts.
- Supersession: re-evaluating stamps the previous row with `superseded_at` and `superseded_by_id`,
  leaves exactly one effective row, and keeps the superseded row and its dimension rows readable.
- The partial unique index refuses a second effective row for the same triple even when inserted
  directly, proving the invariant is enforced by the schema and not only by the command.
- Community isolation: the same evaluator evaluates the same Player in two Communities and both
  contributions are effective at once — the case the legacy unique index makes impossible.
- Evaluator identity: the command has no evaluator parameter, and an anonymous caller is refused.
  A capability override in another Community does not authorize a write here.
- Capability: a member without `player.evaluate` is refused with `42501`, and an `EVALUATOR`
  responsibility in that Community genuinely grants it. The `GINV-CAP-002` case is asserted
  directly: a Community `owner` and an `admin`, holding no `EVALUATOR` responsibility, are both
  refused — rank alone never evaluates. A revoked `EVALUATOR` responsibility is refused too.
- Governance untouched: `community_capabilities` still emits exactly the capabilities it emitted
  before for a governance rank and for an ORGANIZER, so the branch added here grants nothing to an
  existing holder.
- Standing: a Player with no living `community_players` relation in that Community is refused, and
  so is a soft-deleted Player who still has one.
- `missing ≠ 0`: a dimension omitted from `p_dimensions` produces no row, and no zero.
- Validation: blank rubric version, empty object, a non-numeric value and a value outside 0 to 10
  are each refused with `23514`, and nothing is written.
- Idempotency: the same `command_id` replays the receipt without writing a second contribution; a
  different `command_id` creates a new revision rather than a second effective row.
- Legacy untouched: the row count, the policies and the unique index of `player_evaluations` are
  identical before and after, and neither new table carries a grant to any browser role.

## Migration shape

One migration file, `supabase/migrations/<timestamp>_versioned_player_evaluation_source.sql`:

1. widen `community_responsibilities`' check constraint to `('ORGANIZER', 'EVALUATOR')`;
2. `create or replace` of `public.community_capabilities`, adding the branch that derives
   `player.evaluate` from an unrevoked `EVALUATOR` responsibility, and preserving the existing
   governance and ORGANIZER branches and the explanatory comment verbatim;
3. `player_evaluation_contributions` with its constraints and indexes, RLS enabled, grants revoked;
4. `player_evaluation_dimension_scores` likewise;
5. `public.record_player_evaluation`;
6. revokes and the grant to `authenticated`.

No data is backfilled. Steps 1 and 2 alter existing governance objects; they add a possible grant
that nobody holds and remove none, so no existing caller changes behavior. Everything else is
additive.

## Deployment and rollback

The migration is purely additive: two new tables and one new function, with no change to any
existing table, policy, grant or function. Rollback before any contribution exists is dropping the
three objects. After contributions exist there is nothing to roll back to — the legacy table never
stopped being authoritative, so the target rows are additional evidence rather than migrated authority.

## Exit gate

- A new evaluation write requires the `player.evaluate` capability in an explicitly named Community,
  granted per person and never by governance rank, and resolves its evaluator server-side.
- One evaluator holds exactly one effective contribution per Player per Community, enforced by index.
- Every superseded contribution and its dimension scores remain readable.
- An omitted dimension is an absent row, never a zero.
- `player_evaluations`, its policies and its consumers are byte-for-byte unchanged.
