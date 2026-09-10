# W6-02 — TeamFormationRequest and the deterministic solver port

Introduce a versioned, normalized application port for team formation, and a canonical
fingerprint over its input and output. The existing engine is preserved: this slice gives it a
contract, not a replacement.

## What the investigation found

The engine is already deterministic. `createSeededRandom` (`src/logic/balancing.ts:897`) drives the
search, `baseSeed` comes from `config.balanceSeed` and defaults to 42, and the budget is an
iteration count derived from `balanceSpeed` and roster size. `Date.now()` appears only to fill
`BalanceCandidate.runtimeMillis`, which is reported and never controls the search.

Two production call sites reach the engine today: `src/hooks/useSessionWizard.ts:244` through the
Worker, and `src/application/sessionLifecycleUseCases.ts:532` directly. Nothing proves they agree.
That pair is what the C6 exit gate names, so the gate is concrete, not hypothetical.

The solver reads exactly seven things from `TournamentConfig | FreePlayConfig`: `balanceSpeed`,
`balanceConstraints`, `balanceMode`, `repetitionWeight`, `rotationType`, `balanceSeed` and the
weights resolved by `resolveBalanceWeights`. Everything else in those config types is UI and
tournament state the solver never touches.

## Decisions

Settled before design, and load-bearing for everything below:

1. **The port defines its own normalized input, with two adapters** — one from the authorized
   W6-01 snapshot, one from today's local `PlayerBalanceSnapshot[]`. Accepting only the server
   artifact would exclude Quick Session and any cloudless session, and would perform the source
   cutover that XS-W5-05 is supposed to conduct.
2. **The port ships with a real consumer.** Both existing call sites route through it, producing
   the same options as today. A port proven only by tests repeats the pattern the HANDOFF already
   criticizes — infrastructure delivered without a user.
3. **The feasibility precheck covers only what the engine already refuses**, plus cheap arithmetic.
   Enumerating the domain's hard constraints is product policy, and several of those constraints are
   still open in `OPEN-DECISIONS.md`.

## Input contract

```text
TeamFormationRequest
  contractVersion    'v1'
  algorithmVersion   the string BalanceCandidate.algorithm already reports
  participants       ordered FormationParticipant[]
  teamCount          integer >= 1
  objective          { policyVersion 'v0-legacy-weights', mode, rotationType,
                       repetitionWeight, weights }
  hardConstraints    BalanceConstraints
  budget             { seeds, maxIterations }
  seed               integer
  provenance         { kind 'LOCAL' }
                   | { kind 'AUTHORIZED_SNAPSHOT', snapshotId, inputFingerprint }
```

`FormationParticipant` carries the eleven attributes under the solver's existing English field
names, plus `heightCm`, `gender`, `position`, `secondaryPositions`, `isInjured`, `isEstimated` and
`participantId`.

`algorithmVersion` is not decorative: the port compares it against the `algorithm` string the engine
reports on every candidate and refuses the result when they disagree. A fingerprint that names a
version the engine did not actually run would be worse than no version at all, and this is the cheap
guard against an engine swap that forgets to bump the contract.

**Participant order is part of the contract.** `InitialTeamBuilder` starts from the order it
receives, so two logically identical requests in different orders produce different formations.
Each adapter fixes a canonical order — roster `entry_order` for the authorized snapshot, the
existing order for local input — and the fingerprint covers that order. Sorting by id for the
fingerprint alone would misreport what the solver actually consumed.

**The budget is explicit.** Today `balanceSpeed` becomes `numSeeds` and `maxIterations` inside the
solver, from a UI-facing enum and the roster size. While that stays internal, "same input, same
seed, same budget" is not verifiable, because the budget is not in the input. The local adapter
computes both values with today's exact formula and puts them in the request, so behavior is
unchanged and the claim becomes checkable.

Making that real requires plumbing: `balanceSnapshots` gains an optional explicit budget, and uses
it when given instead of deriving one from `balanceSpeed`. Without this the request's budget would
be a declaration the engine could silently ignore, which is worse than no budget field at all — the
fingerprint would then claim to cover something it does not. The derivation itself moves to the
adapter unchanged, and a test pins that the adapter's output equals today's formula for every
`balanceSpeed` value and a range of roster sizes.

**Provenance is in the request** so that the authorized snapshot's `input_fingerprint` reaches the
formation fingerprint. Without it, two formations built on different evaluations would share a
fingerprint whenever the resolved numbers happened to match.

`partnershipMatrix` stays a separate parameter rather than a request field. It is derived history
that changes on its own between runs, and putting it in the versioned contract would make the
fingerprint move for something the organizer never chose. It still enters the fingerprint as a
summary (count plus hash) so direct/Worker parity stays honest.

## Canonicalization and fingerprint

The fingerprint covers both halves: the canonical request, and a canonical projection of the
result — `solution` (teams with participant ids in order), `score`, `diagnostics`, `algorithm`,
`seed`, `iterations`. It excludes `runtimeMillis`. That field stays on `BalanceCandidate` and keeps
reaching the UI; canonicalization is a projection, not an amputation of the type.

Scores are not rounded. Both paths run identical code over identical input, and the Worker's
structured clone preserves doubles exactly, so the values are bit-identical. Rounding would only
hide a real divergence — the divergence the gate exists to catch.

The hash is a pure, synchronous FNV-1a over the canonical JSON, living in `src/domain/`. It is not
a cryptographic hash and the code says so. `SubtleCrypto` is asynchronous and would force the whole
port to become async for no benefit.

## Feasibility precheck

Refusals the engine already expresses as `InfeasibleConstraintsError` move ahead of the search, and
join cheap arithmetic ones: empty roster, `teamCount < 1`, fewer participants than teams. No new
hard constraint is introduced. A refusal is typed and returned before any expensive work.

## Placement and routing

Contract types in `src/shared/types/`, re-exported through `src/types.ts`. The port and its two
drivers — direct and Worker — in `src/application/`. Canonicalization, fingerprint and precheck are
pure and live in `src/domain/`, so the Worker imports them without dragging infrastructure along.

`BalanceRequest` carries the versioned request instead of `config`, which removes the Worker's need
to know `TournamentConfig | FreePlayConfig`. This requires updating the Worker's allowed-import list
in `src/architecture/legacyExpansionRules.ts:293`.

## Non-goals

No change to what any user sees: the same options, from the same engine, with the same numbers.
No source cutover — the wizard does not start consuming the authorized snapshot here; that is
XS-W5-05's gate and a later decision. No candidate publication, no voting, no UI work, no new hard
constraint, no objective-function change, and no removal of the legacy `balanceSnapshots` entry
point, which the port calls.

## Verification

Unit tests cover both adapters, the budget derivation matching today's formula exactly, the
canonical projection excluding `runtimeMillis`, order sensitivity, and each precheck refusal.

The parity gate compares the direct driver against the Worker's own handler, invoked with a stubbed
`self`, and asserts identical fingerprints for the same request.

**Known limit, stated rather than sold:** jsdom has no real `Worker`, so this proves parity of the
Worker's code path — contract, serialization and routing, which is where divergence would come
from — not of a real browser Worker. A future E2E slice can close that gap.

The existing balancing suite must stay green unchanged: it is the evidence that routing through the
port did not alter the engine's behavior.
