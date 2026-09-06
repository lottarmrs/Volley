# XS-W5-02 Skill Rubric / Dimension Contract Design

## Context

XS-W5-01 shipped the evaluation source model: `player_evaluation_contributions` and
`player_evaluation_dimension_scores`, written by `public.record_player_evaluation`. It deliberately
left two fields as free text with no vocabulary and no foreign key — `rubric_version` on the
contribution and `dimension_key` on the score — and recorded that the contract belongs here.

Today any string is a valid rubric version and any string is a valid dimension. Nothing says which
dimensions exist, which version an evaluation was made under means anything, or what an omitted
dimension implies. The client's own vocabulary is eleven keys hardcoded in TypeScript
(`ATTRIBUTE_KEYS` in `src/logic/playerEvaluations.ts`): `saque`, `recepcao`, `levantamento`,
`ataque`, `bloqueio`, `defesa`, `velocidade`, `resistencia`, `leituraDeJogo`, `regularidade`,
`controleEmocional`.

`OPEN-BAL-001` keeps the canonical sports rubric open, so this slice must create a versioned
contract **without** declaring any dimension set final. The slice record allows an experimental
rubric only if four conditions hold: the version is explicit, the missing semantics are explicit,
`Overall` is excluded from source dimensions, and the migration provenance is explicit.

Architecture sources:

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, XS-W5-02;
- `docs/architecture/contexts/N2.02-player-skill-profile-ownership.md`, sections 2, 6 and 7;
- `docs/architecture/catalogs/OPEN-DECISIONS.md`, `OPEN-BAL-001` and `OPEN-RATING-001`;
- `docs/superpowers/specs/2026-09-05-xs-w5-01-versioned-player-evaluation-design.md`, which defers
  this contract here by name.

## Goals

- Register skill rubric versions and their source dimensions, as product-level data.
- Bind every evaluation and every dimension score to a registered version, structurally, so a score
  from one version cannot be stored against a contribution made under another.
- Make the missing-dimension semantics enforceable: a rubric declares, per dimension, whether a
  score is required.
- Seed exactly one version — the eleven keys the client already uses — marked experimental, with its
  provenance recorded.
- Expose the dimensions of a version as a read, so a resolver can request them by version instead of
  reading mutable Player fields.

## Non-goals

- No aggregation and no profile. `OPEN-RATING-001` stays open; XS-W5-03 owns
  `CommunityPlayerSkillProfile`.
- No change to the Team Balancer, the balancer worker, `Attributes`, or any client type. Rewiring
  Team Formation to read by rubric is W6's work; this slice only makes it possible.
- No `Derived Overall`. It is a derived projection owned by N2.02 §6 and never a source dimension.
- No per-Community rubric selection, and no Community-authored rubrics.
- No second seeded version, and no stable or production rubric of any kind.
- No command for creating rubrics at runtime; versions arrive by migration in this slice.
- No UI, no client code, no Realtime, no production deployment.

## Decisions

### The registry is product-level, not per-Community

A rubric version is global. Each evaluation names the version it was made under, and two Communities
evaluating under different versions stay comparable through that provenance.

N2.02 §2 draws the line: Player Skill Profile owns what a `PlayerEvaluation` **means**, while
Community owns membership, authorization and context. Letting a Community define its own dimensions
would move the authorship of meaning into Community and make global profiles incomparable. A
per-Community *selection* of which registered version to use is a coherent future addition; it is
not this slice, because there is exactly one version to select.

### `status` is pinned to `EXPERIMENTAL` by a single-value check

`skill_rubric_versions.status` carries `check (status = 'EXPERIMENTAL')`.

This is how `OPEN-BAL-001` becomes visible in the schema rather than remembered. Nothing can present
itself as a stable or production rubric while that decision is open, and the slice that closes it
must widen the constraint deliberately — the same device XS-W4-06 used to pin its ledger's initial
state.

### Source dimensions only, pinned the same way

`skill_rubric_dimensions.kind` carries `check (kind = 'SOURCE')`.

The slice record requires `Overall` to be excluded from source dimensions. `Derived Overall` is a
versioned derived projection under N2.02 §6, and N2.02 is explicit that it must never enter
canonical Team Formation input. Rather than blacklist key names — a list nobody can complete, since
`geral` or `nota_geral` would walk straight through — the table declares what it holds. A derived
kind requires widening the constraint on purpose, and a test asserts no seeded dimension is an Overall.

### Requiredness is per dimension, and the seed requires nothing

`skill_rubric_dimensions.is_required` says whether an evaluation under that version must carry a
score for that dimension, and `record_player_evaluation` enforces it.

That is what makes the missing semantics *explicit* rather than merely documented: XS-W5-01 already
made absence structural, since an omitted dimension writes no row, but nothing could demand a
dimension. A rubric can now say that serve and attack are required while emotional control is
optional.

The seeded version marks **every** dimension optional. Deciding which of the eleven a real
evaluation must carry is a sports judgement, and `OPEN-BAL-001` is exactly the decision that is
still open. The mechanism ships; no rubric uses it yet.

### The seed is `v0-legacy-11`, and its provenance says where it came from

One version is seeded, identified `v0-legacy-11`, holding the eleven keys in the client's own order,
with `provenance` recording that they were read from `ATTRIBUTE_KEYS` in
`src/logic/playerEvaluations.ts` rather than chosen by any sports process.

The identifier is not arbitrary: XS-W5-01's suite already writes `'v0-legacy-11'` as its default
rubric version, so seeding that exact string is what lets the new foreign key land without editing a
single existing test. The name is also honest about what it is — version zero, derived from the
legacy client vocabulary, eleven dimensions.

Seeding nothing was considered and rejected: the new foreign key would make every evaluation
impossible until somebody created a version, which would leave XS-W5-01 shipped and unusable.

### A score is bound to its contribution's version structurally

`player_evaluation_contributions` gains `unique (id, rubric_version)`.
`player_evaluation_dimension_scores` gains a `rubric_version` column carrying two composite foreign
keys: `(contribution_id, rubric_version)` to the contribution, and `(rubric_version, dimension_key)`
to the registry.

Storing a version-2 dimension against a version-1 contribution therefore cannot be represented, with
no help from the command. This is the idiom W3-05 already uses between `roster_revisions` and
`roster_revision_entries` — carry the parent's key down and make the pair the reference. The cost is
one redundant column per score, which buys a guarantee that survives any writer.

Enforcing only in the command was rejected for the reason this slice exists: a contract that lives
in one function is not a contract.

### The registry is publicly readable; the evaluations stay private

Both new tables grant `select` to `authenticated` and no write of any kind. A rubric is a published
contract, not sensitive data, and a client that eventually renders an evaluation form needs to know
the dimensions.

This is deliberately different from `player_evaluation_contributions` and
`player_evaluation_dimension_scores`, which carry no grant at all — the scores are opinions about
people, and their read surface belongs to XS-W5-03 and N2.02 §8.

## Data model

```sql
create table public.skill_rubric_versions (
  rubric_version text primary key,
  status text not null check (status = 'EXPERIMENTAL'),
  provenance text not null check (pg_catalog.btrim(provenance) <> ''),
  published_at timestamptz not null default pg_catalog.now(),
  constraint skill_rubric_versions_version_check
    check (pg_catalog.btrim(rubric_version) <> '')
);

create table public.skill_rubric_dimensions (
  rubric_version text not null references public.skill_rubric_versions(rubric_version)
    on delete restrict,
  dimension_key text not null,
  kind text not null check (kind = 'SOURCE'),
  is_required boolean not null,
  display_order integer not null check (display_order > 0),
  constraint skill_rubric_dimensions_pkey primary key (rubric_version, dimension_key),
  constraint skill_rubric_dimensions_order_key unique (rubric_version, display_order),
  constraint skill_rubric_dimensions_key_check check (pg_catalog.btrim(dimension_key) <> '')
);
```

Both tables enable row level security, revoke everything from `public`, `anon` and `authenticated`,
then grant `select` to `authenticated` and carry one read policy per table,
`for select to authenticated using (true)`. A published contract is readable by every authenticated
caller and writable by none: versions arrive by migration, so no role needs insert, update or delete.

Changes to the XS-W5-01 tables:

```sql
alter table public.player_evaluation_contributions
  add constraint player_evaluation_contributions_version_identity_key
    unique (id, rubric_version);

alter table public.player_evaluation_contributions
  add constraint player_evaluation_contributions_rubric_version_fkey
    foreign key (rubric_version) references public.skill_rubric_versions(rubric_version)
    on delete restrict;

alter table public.player_evaluation_dimension_scores
  add column rubric_version text not null;

alter table public.player_evaluation_dimension_scores
  add constraint player_evaluation_dimension_scores_contribution_fkey
    foreign key (contribution_id, rubric_version)
    references public.player_evaluation_contributions (id, rubric_version)
    on delete restrict;

alter table public.player_evaluation_dimension_scores
  add constraint player_evaluation_dimension_scores_dimension_fkey
    foreign key (rubric_version, dimension_key)
    references public.skill_rubric_dimensions (rubric_version, dimension_key)
    on delete restrict;
```

The pre-existing single-column `contribution_id` foreign key is dropped, because the composite one
supersedes it and keeping both would double every check.

Adding a `not null` column to `player_evaluation_dimension_scores` is safe: the table is new in the
previous slice, nothing has deployed, and the seeded version covers every value the existing suite
writes.

## The command

`public.record_player_evaluation` keeps its signature exactly — six parameters, the same return
columns — and is redefined to:

1. reject a `p_rubric_version` that is not a registered version, with
   `Rubric version is not registered` and `23514`;
2. reject any `dimension_key` that the version does not declare, with
   `Dimension is not part of this rubric version` and `23514`;
3. reject a missing dimension the version marks required, with
   `Rubric version requires a score for every required dimension` and `23514`;
4. write `rubric_version` into every dimension score row.

Every other behaviour is unchanged, including the supersede-then-insert order, the Player row lock,
the receipt handling, the capability check and every existing message.

Because the last definition in the migration chain wins, this redefinition lives in this slice's
migration and the XS-W5-01 file is not edited.

## Read surface

```sql
public.skill_rubric_dimensions_for(p_rubric_version text)
returns table (dimension_key text, is_required boolean, display_order integer)
```

`stable`, `set search_path = ''`, granted to `authenticated`, and deliberately **not**
`SECURITY DEFINER`: the tables it reads are already readable by that role, so a definer would take
privilege the function does not need. Ordered by `display_order`. An unregistered version returns no
rows rather than raising — asking what a version contains is a question, not an assertion that it
exists.

This is the exit gate's "request dimensions by rubric/version". Nothing in the client calls it yet.

## What this slice does not change

The Team Balancer, the balancer worker and `Attributes` are untouched. The client still reads
mutable Player fields, and the aggregation is still the client-side median in
`src/logic/playerEvaluations.ts` over legacy rows. The capability to read a rubric by version now
exists; using it is W6's work.

XS-W5-01's suite passes unchanged, which is the compatibility statement this slice makes: seeding
`v0-legacy-11` and enforcing the new foreign keys must not require editing a single existing test.

## Errors

| Condition | Code |
| --- | --- |
| Unregistered rubric version | `23514` |
| Dimension not declared by the version | `23514` |
| Required dimension omitted | `23514` |
| Every pre-existing refusal of `record_player_evaluation` | unchanged |

## Test strategy

A new suite, `src/test/db/skillRubricContract.dbtest.ts`. The slice is entirely SQL.

- The seed: exactly one version, `v0-legacy-11`, status `EXPERIMENTAL`, with the eleven keys in the
  client's order, every one `SOURCE`, every one optional, and a provenance naming `ATTRIBUTE_KEYS`.
- `status` refuses any value other than `EXPERIMENTAL`, and `kind` refuses any value other than
  `SOURCE` — the two constraints that keep `OPEN-BAL-001` visible.
- No seeded dimension is an Overall, under any spelling the client uses.
- Cross-version binding: a score naming a dimension from another version cannot be inserted, proven
  by inserting directly rather than through the command.
- The command refuses an unregistered version, an undeclared dimension, and an omitted required
  dimension, each asserted by message as well as code, using a second test-only version that marks
  one dimension required.
- `skill_rubric_dimensions_for` returns the eleven in `display_order`, and returns no rows for an
  unregistered version.
- Grants: both new tables are readable by `authenticated` and writable by no browser role; the two
  evaluation tables still carry no grant at all.
- The XS-W5-01 suite passes unchanged, run as part of the same verification.

## Migration shape

One migration file, `supabase/migrations/<timestamp>_skill_rubric_contract.sql`:

1. `skill_rubric_versions` and `skill_rubric_dimensions`, with RLS, revokes, the read grant and the
   read policy;
2. the seed of `v0-legacy-11` and its eleven dimensions;
3. the `alter table` statements binding the XS-W5-01 tables to the registry;
4. `skill_rubric_dimensions_for`;
5. `create or replace` of `record_player_evaluation` with the three new refusals;
6. revokes and grants for both functions.

The order matters for two reasons. The registry tables and the seed must exist before the foreign
keys reference them. And the `not null` column on the scores table is only safe because the
migration chain rebuilds from zero, so no row predates it — on any database that already held
scores, that statement would need a backfill first, and this slice does not write one because no
such database exists.

## Deployment and rollback

The migration adds two tables and one function, alters two tables from the previous slice, and
redefines one function. It is not purely additive, and it changes the behaviour of an existing
command by adding three refusals.

Rollback before any evaluation exists is dropping the new objects, dropping the added constraints
and column, and restoring the previous `record_player_evaluation` body. After evaluations exist, the
`rubric_version` column on the scores cannot be dropped without losing the binding, and rollback
means forward-fixing instead.

## Exit gate

- Every registered dimension belongs to an explicit version, and every evaluation and score names a
  registered version.
- A score cannot be stored against a contribution made under a different version, by construction.
- A rubric can require a dimension, and the command enforces it.
- Nothing in the schema claims a stable or production rubric while `OPEN-BAL-001` is open.
- The dimensions of a version can be requested by version, without reading any mutable Player field.
