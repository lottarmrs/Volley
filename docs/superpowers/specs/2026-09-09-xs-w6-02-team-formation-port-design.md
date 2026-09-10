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
  algorithmVersion   provenance only — each adapter stamps BALANCE_ALGORITHM_VERSION itself;
                     nothing compares it at runtime (see below)
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

`algorithmVersion` never compared against `BalanceCandidate.algorithm` as first assumed here: that
field holds `'Simulated Annealing (Smart Balance Engine)'`, a display string meant for humans, not a
machine-comparable version. Comparing the request's version against it would either always mismatch
or require parsing a prose string, so it was unimplementable as written.

This spec originally had the port compare `algorithmVersion` against the exported
`BALANCE_ALGORITHM_VERSION` constant and refuse the result when they disagreed. **That guard was
removed**, in the branch-wide review's fix wave (`6247b9d`), because it could never fail: both
adapters (`src/application/teamFormationAdapters.ts`) populate `algorithmVersion` by stamping
`BALANCE_ALGORITHM_VERSION` themselves, and the port is the only production caller of either adapter
— so the runtime comparison was a constant checked against itself. There is no `ALGORITHM_VERSION_MISMATCH`
refusal code any more. `algorithmVersion` remains a field on `TeamFormationRequest` and still enters
the fingerprint as provenance, but nothing validates it at runtime today. A future caller that
supplies its own `algorithmVersion` independently of the adapters — or a `BalanceCandidate` that
carries a machine-readable version beside its display string — would need to reintroduce a real
check; neither exists yet.

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

The engine's `InfeasibleConstraintsError` is a **post-condition**, not a precondition: it is raised
at `src/logic/balancing.ts:1116` only after the full iteration budget has been spent and no solution
was found. So the precheck does not "move" it — it adds a cheap layer in front of it, and the
post-search refusal stays exactly as it is.

The precheck refuses only what is mechanically contradictory in the request itself, never what is
merely hard:

- empty roster, `teamCount < 1`, fewer participants than teams;
- the same pair present in both `pairsTogether` and `pairsSeparated`;
- a `pairsTogether` pair naming a participant id absent from `participants`;
- a `lockedPlayerIdxs` entry for a participant id that **is** present, pointing outside
  `0..teamCount-1`.

An id in `pairsSeparated` or `lockedPlayerIdxs` that is absent from `participants` is **not**
refused; it passes through to the engine, which tolerates it (see below).

**This list, and the claim that used to follow it, were wrong once already.** The first version of
this precheck refused any `hardConstraints` id absent from `participants` — all three constraint
kinds, not just `pairsTogether` — on the premise that each such refusal is "a statement the caller
made that cannot be satisfied by any assignment, decidable without search." That premise was never
checked against what the engine actually does, and it does not hold for two of the three kinds:
`buildInitialSolution` guards placement with `if (athlete)`, the lock penalty and `isFeasible` skip a
lock whose id resolves to `currentIdx === -1`, and a `pairsSeparated` pair with an absent member is
vacuously satisfied — there is no one to place together, so the constraint cannot be violated. Only
`pairsTogether` has no such escape: it names two people who must land on the same team, and if one
of them isn't playing, no assignment satisfies it.

The over-broad version was a real regression, not a theoretical one: the wizard reaches an orphaned
`lockedPlayerIdxs` entry whenever someone locks a player, goes back a step, and deselects them, and
the precheck refused that request outright — with no generation possible until the lock was cleared
by hand. The branch-wide review caught it before integration; the fix (`471e81b`) narrowed the
precheck to the four bullets above. Deciding whether a *satisfiable but demanding* combination should
be refused is separate from this and remains product policy, still open, and out of scope.

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
