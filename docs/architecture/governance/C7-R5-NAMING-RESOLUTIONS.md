# C7 R5 — Canonical Naming / Correlation Resolutions

> Status: `DRAFT-CANONICAL / C7-R5`
>
> Owner: `Architecture Governance + owning contexts`
>
> Findings addressed: `C7-F-009`, `C7-F-010`, `C7-F-011`, `C7-F-012`, `C7-F-017`

---

# 0. Rule

These are terminology/status resolutions only where the corpus already contained enough evidence to close ambiguity.

They do **not** close unrelated product/algorithm/security policy questions.

---

# 1. Statistical contribution

Canonical term:

```text
PlayerMatchStatContribution
```

Meaning:

> rebuildable statistical contribution for one Player/MatchParticipation in one Match, derived from effective Match facts and coverage/eligibility policy.

It replaces competing architecture-language aliases:

```text
PlayerMatchStats              # previous glossary shorthand
MatchStatContribution         # acceptable generic prose only
PlayerMatchStatContribution   # canonical entity/concept term
```

Why this term:

- identifies the Player dimension explicitly;
- identifies the Match as contribution unit;
- says this is a contribution/projection, not raw source fact;
- already matches the C5 implementation-facing model and the preferred candidate in N2.09;
- avoids collision with a future `MatchStats` aggregate/read DTO.

`HYP-STAT-001` therefore moves:

```text
UNVALIDATED
→ SUPPORTED / RESOLVED-NAMING
```

This does **not** decide physical table naming, JSONB-vs-columns policy or exact stat taxonomy; those remain Data/Statistics concerns.

---

# 2. Competition standings projection

Canonical term:

```text
StandingsProjection
```

Use plural `Standings` because the concept represents the derived competition classification/table as a whole.

`StandingProjection` becomes a non-canonical textual alias only.

Canonical relation:

```text
OfficialCompetitionResult[]
+ CompetitionPenalty[]
        ↓
StandingsProjection
```

The projection remains rebuildable and not directly editable.

---

# 3. Match event reversal command

Canonical semantic command name:

```text
RevertMatchEvent
```

The generic alias:

```text
RevertEvent
```

is deprecated in target command vocabulary because it loses bounded-context meaning.

Semantics:

```text
RevertMatchEvent
→ validates Match authority / epoch / expected sequence / correction policy
→ appends compensating correction semantics
→ never hard-deletes the original MatchEvent as the ordinary path
```

`OPEN-MATCH-003` remains open for the **scope of post-finish/result-changing correction capability**. Choosing the command name does not grant broader correction authority.

---

# 4. Correlation / execution identity taxonomy

The word `correlation` describes a relationship. It is not one overloaded canonical identifier.

## 4.1 `command_id`

```text
command_id
=
stable logical mutating intent identity
```

Rules:

- preserved across retries of the same logical Command;
- used for idempotency/unknown-outcome recovery;
- may span multiple request attempts;
- not a trace ID and not a user-facing authorization token.

Example:

```text
AwardPoint command_id=C1
request R1 times out
retry request R2
command_id remains C1
```

## 4.2 `request_id`

```text
request_id
=
one technical request / transport attempt
```

Rules:

- distinct per retry attempt;
- generated/ensured by trusted server boundary for remote execution;
- safe form may be echoed to client;
- one logical `command_id` may map to several `request_id`s.

## 4.3 `trace_id`

```text
trace_id
=
distributed execution trace identity
```

Rules:

- belongs to tracing/instrumentation, not domain idempotency;
- one request normally participates in one trace context;
- retry requests may have separate trace identities and remain correlated through `command_id` / support references;
- sampling may mean not every request has a retained trace.

## 4.4 `reference_id`

```text
reference_id
=
safe opaque support/user-facing error reference
```

Rules:

- may be shown in UI/support flows;
- server-side diagnostics can map it to request/trace/error context;
- it is not authorization evidence;
- it is not required to equal `request_id` or `trace_id`;
- target code should prefer `reference_id` over ambiguous `correlation_id` for this product-facing purpose.

Legacy browser `correlationId` in current `AppResult` is therefore treated as transitional vocabulary until the server-backed reference contract exists.

## 4.5 `job_id`

```text
job_id
=
logical asynchronous processing unit identity
```

Retries/attempts of one durable job may share `job_id` while attempt metadata is distinct.

## 4.6 `release_id`

```text
release_id
=
deployed artifact/version identity
```

Used to correlate regressions/telemetry with deployment version.

## 4.7 Canonical relationship

```text
logical Command
command_id C1
      │
      ├── request_id R1 ── trace_id T1
      │      ↓ response lost
      │
      └── request_id R2 ── trace_id T2
             ↓ receipt found / success

support-visible failure/success context
→ reference_id X

async consequence
→ job_id J

all signals
→ release_id V
```

No ID above replaces another.

---

# 5. Registry/status consequences

```text
C7-F-009  decision made: PlayerMatchStatContribution
C7-F-010  decision made: StandingsProjection
C7-F-011  decision made: explicit ID taxonomy; correlation_id no longer canonical catch-all
C7-F-012  decision made: RevertMatchEvent
C7-F-017  HYP-STAT-001 → SUPPORTED / RESOLVED-NAMING
```

Propagation targets:

```text
GLOSSARY.md
N2.09 Statistics
N2.07 Live Match
N2.15 API/Application
N2.19 Observability
C4 Hypotheses/Open owner metadata where applicable
C5 matrices
```

Until every large owner document is mechanically regenerated/edited, this resolution file is the C7 remediation authority for the affected ambiguous term only; it does not supersede unrelated content in those documents.
