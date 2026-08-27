# C7 R8 — Physical Truth-Class Normalization

> Status: `DRAFT-CANONICAL / C7-R8`
>
> Owner: `Data + bounded-context owners + Architecture Governance`
>
> Finding addressed: `C7-F-016`
>
> Source matrix: [`C5.01-ENTITY-DATA-STATE-MATRIX.md`](../matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md)

---

# 0. Rule

C5.01 is a **conceptual cross-cutting matrix**. Some rows intentionally use phrases such as:

```text
CURRENT_STATE + historical anchor
SOURCE/current
CURRENT_STATE + versioned source
```

That wording is useful at concept level but is too ambiguous for physical persistence.

R8 establishes the physical rule:

```text
ONE PERSISTED ARTIFACT
HAS ONE PRIMARY TRUTH CLASS
```

A conceptual domain capability may map to several persisted artifacts, each with one class.

Canonical primary classes for persisted target artifacts:

```text
SOURCE_FACT
CURRENT_STATE
IMMUTABLE_SNAPSHOT
DERIVED_PROJECTION
INFRA_OPERATIONAL
```

Blobs/ephemeral/local drafts retain their specialized storage class but must still have explicit authority and replaceability semantics.

---

# 1. What this rule prevents

Do not implement a row described as:

```text
CURRENT_STATE + historical record
```

as one mutable row and then claim that the mutable row is also immutable historical evidence.

Likewise:

```text
projection + source
```

cannot mean that deleting/rebuilding the projection destroys the only source.

When both current state and history are needed, use an explicit model such as:

```text
CURRENT_STATE row
+
SOURCE_FACT transition/revision records
```

or:

```text
current pointer
+
IMMUTABLE_SNAPSHOT revisions
```

according to owning-domain semantics.

---

# 2. Identity / participation normalization

## PlayerAccountLink

```text
PlayerAccountLink current effective relation
→ CURRENT_STATE

link proposal/approval/revocation audit if persisted separately
→ SOURCE_FACT or semantic audit according to purpose
```

The current link row is not the permanent audit trail.

## Participant / Guest Participant

`Participant` is a conceptual identity boundary, not a demand for one universal table.

Physical interpretation:

```text
SessionParticipant / active contextual participation relation
→ CURRENT_STATE while the Session roster is mutable

RosterRevisionEntry / MatchRosterEntry historical identity
→ IMMUTABLE_SNAPSHOT

MatchParticipation effective sporting participation
→ SOURCE_FACT
```

A current Participant row must not be mutated later and then reused as the sole historical snapshot.

---

# 3. Community settings normalization

C5 row:

```text
Community Defaults / Settings Version
→ CURRENT_STATE + versioned source for future snapshots
```

Physical target:

```text
Community.current_settings_version_id / current defaults pointer
→ CURRENT_STATE

CommunitySettingsVersion
→ IMMUTABLE_SNAPSHOT
```

Alternative physical co-location is allowed only if versions themselves are immutable rows and the Community points to the current version.

Changing defaults creates/activates a new version; it never rewrites a version already referenced by Session/Match snapshots.

---

# 4. Session configuration normalization

## TeamFormationConfig

Conceptually configuration is mutable before dependent artifacts and frozen afterward.

Physical model:

```text
Session current Team Formation configuration/pointer
→ CURRENT_STATE

TeamFormationConfigSnapshot bound to TeamFormationRequest/CandidateSet
→ IMMUTABLE_SNAPSHOT
```

A published CandidateSet never depends on a mutable config row without captured version/provenance.

## CourtRotationConfig / runtime state

If automated court rotation is implemented later:

```text
CourtRotationConfig
→ CURRENT_STATE configuration or immutable config version

CourtRotationRuntimeState
→ CURRENT_STATE runtime state

historical applied rotation facts/snapshots if required
→ SOURCE_FACT / IMMUTABLE_SNAPSHOT separately
```

The future runtime state must not be stuffed into a config blob and called historical evidence.

## SessionParticipant

```text
SessionParticipant before/start-time effective roster
→ CURRENT_STATE relation

RosterRevision / RosterRevisionEntry
→ IMMUTABLE_SNAPSHOT

SessionRosterAdjustment after start
→ SOURCE_FACT
```

History reads frozen revisions/adjustments, not the latest mutable SessionParticipant row alone.

---

# 5. Registration normalization

## RegistrationWindow

```text
RegistrationWindow
→ CURRENT_STATE aggregate root
```

Its `revision` is a concurrency/checkpoint primitive, not a separate source-fact row by itself.

## RegistrationEntry

C5 described it as `CURRENT_STATE + historical intent record`.

Physical target:

```text
RegistrationEntry
→ CURRENT_STATE
```

It contains the effective state of one registration intent instance:

```text
CONFIRMED
WAITLISTED
WITHDRAWN
REMOVED
```

Historical transition/provenance, when needed beyond the current row, is separate:

```text
RegistrationTransition / semantic audit event
→ SOURCE_FACT or semantic audit
```

A `PROMOTED` transition can be recorded there; it does not become a second current status.

Rejoin-after-withdraw creates a new intent/entry according to the existing hypothesis/policy rather than rewriting the old entry into a false continuous history.

## queue_sequence

```text
queue_sequence
→ immutable authoritative field of that RegistrationEntry intent
```

Its immutability does not turn the entire mutable RegistrationEntry row into an immutable snapshot.

---

# 6. Player Skill Profile normalization

```text
PlayerEvaluation revision
→ SOURCE_FACT

CommunityPlayerSkillProfile
→ DERIVED_PROJECTION

GlobalPlayerSkillProfile
→ DERIVED_PROJECTION

Derived Overall
→ DERIVED_PROJECTION
```

If a current-profile pointer/checkpoint is materialized, it is operational/current metadata and remains distinct from the evaluation source revisions.

No projection becomes the only retained evaluation source.

---

# 7. Team Formation / Voting normalization

## PlayerBalanceSnapshot

```text
PlayerBalanceSnapshot
→ IMMUTABLE_SNAPSHOT
```

## TeamFormationRequest

The canonical generation intent is treated as a frozen request/input record once accepted:

```text
TeamFormationRequest
→ IMMUTABLE_SNAPSHOT
```

It binds:

```text
roster_revision
config/policy versions
profile/input versions
seed
algorithm version
iteration budget
```

If asynchronous execution needs mutable processing status, use:

```text
TeamFormationJob / execution state
→ INFRA_OPERATIONAL
```

Do not mutate the frozen request to become a job queue.

## Ballot / Vote

If V1 permits changing a vote while the round is OPEN:

```text
EffectiveBallot
→ CURRENT_STATE
```

If vote revision history is required:

```text
BallotRevision / VoteCast history
→ SOURCE_FACT
```

The same mutable ballot row is not both current choice and immutable vote history.

## TeamDraw

Each draw revision is:

```text
TeamDrawRevision + assignments
→ IMMUTABLE_SNAPSHOT
```

The Session/current selection can reference:

```text
current_team_draw_revision_id
→ CURRENT_STATE pointer
```

Manual adjustment creates a new immutable revision.

---

# 8. Match normalization

## Match

```text
Match
→ CURRENT_STATE aggregate root
```

## MatchEvent

```text
MatchEvent
→ SOURCE_FACT
```

## MatchProjection

```text
MatchProjection
→ DERIVED_PROJECTION
```

## Lineup / Rotation

If basic implementation needs a live lineup:

```text
MatchLineupState
→ CURRENT_STATE
```

When historical lineup changes matter:

```text
LineupChangeEvent
→ SOURCE_FACT
```

or frozen preparation state:

```text
InitialLineupSnapshot
→ IMMUTABLE_SNAPSHOT
```

Do not use one mutable lineup JSON document as both live state and full historical evidence.

## MatchResult

Result corrections are revisioned.

Physical model:

```text
MatchResultRevision
→ SOURCE_FACT / append-oriented result fact

Match.current_result_revision_id
→ CURRENT_STATE pointer
```

A correction creates a new result revision or append-oriented correction semantics; it does not rewrite the old technical result out of existence.

---

# 9. Competition normalization

## CompetitionRulesetVersion

```text
CompetitionRulesetVersion
→ IMMUTABLE_SNAPSHOT

Competition.current_ruleset_version_id
→ CURRENT_STATE pointer
```

## Fixture slot dependency

Split definition from resolution if both are persisted:

```text
FixtureSlotSourceDefinition
→ IMMUTABLE_SNAPSHOT / structural definition

ResolvedFixtureSlot current assignment
→ CURRENT_STATE or DERIVED_PROJECTION according to owner implementation
```

Upstream dependency identity is never inferred from overwritten magic strings.

## OfficialCompetitionResult

```text
OfficialCompetitionResultRevision
→ SOURCE_FACT

Fixture/current_official_result_revision_id
→ CURRENT_STATE pointer
```

## CompetitionPenalty

```text
CompetitionPenalty revision/fact
→ SOURCE_FACT
```

Revocation/supersession is explicit rather than destructive rewrite.

## StandingsProjection

```text
StandingsProjection
→ DERIVED_PROJECTION
```

Never source.

---

# 10. Statistics normalization

```text
PlayerMatchStatContribution
→ DERIVED_PROJECTION

CaptureCoverage captured on contribution version
→ IMMUTABLE value/snapshot metadata of that projection version

StatisticalEligibility
→ DERIVED_PROJECTION / policy result

Career/Community/Competition/Ranking projections
→ DERIVED_PROJECTION

OfficialReportRevision once issued
→ IMMUTABLE_SNAPSHOT
```

The C7-R5 naming resolution closes the canonical architecture term `PlayerMatchStatContribution`; `HYP-STAT-001` is no longer an open naming blocker.

---

# 11. Notifications normalization

## NotificationIntent

Creation of a recipient-specific semantic communication intent is treated as:

```text
NotificationIntent
→ SOURCE_FACT
```

Its semantic origin/template/rendered snapshot fields are not rewritten on retry.

Separate mutable dimensions:

```text
NotificationReadState
→ CURRENT_STATE

NotificationDelivery
→ CURRENT_STATE operational/provider delivery state

NotificationDeliveryAttempt
→ INFRA_OPERATIONAL append history
```

No giant mutable notification row is simultaneously source intent + read state + N provider attempts.

## NotificationTemplateVersion

```text
NotificationTemplateVersion
→ IMMUTABLE_SNAPSHOT / versioned policy artifact
```

A current template pointer/config, if required, is separate current state.

---

# 12. Media normalization

## MediaAsset

```text
MediaAsset metadata/lifecycle
→ CURRENT_STATE
```

## Incoming/Sanitized/Variants

```text
Incoming object
→ PRIVATE_BLOB / untrusted temporary

Sanitized master
→ immutable private blob

MediaVariant
→ DERIVED blob + metadata
```

## Moderation

Do not combine proposal and decision history implicitly:

```text
MediaProposal
→ CURRENT_STATE while pending/current workflow needs it

ModerationDecision / decision revision if historical accountability required
→ SOURCE_FACT / semantic audit
```

## Domain attachment

```text
avatar_asset_id / cover_asset_id pointer
→ CURRENT_STATE on owning domain
```

Asset replacement does not rewrite immutable blob identity.

---

# 13. Quick / local aggregate normalization

`Quick Local Aggregate` in C5 is an umbrella authority concept, not one physical universal local table.

Within IndexedDB, owner-specific artifacts retain their own classes:

```text
Quick Session current state
→ CURRENT_STATE local-authoritative

Quick MatchEvent
→ SOURCE_FACT local-authoritative until handoff

Quick MatchProjection
→ DERIVED_PROJECTION

Roster/Rules snapshots
→ IMMUTABLE_SNAPSHOT

pending Match/Publish command
→ INFRA_OPERATIONAL irreplaceable local record
```

The fact that the **authority** is LOCAL_DEVICE does not collapse truth classes.

---

# 14. Physical-schema gate

Before a W2–W11 physical artifact is frozen, its schema design must answer:

```text
artifact name
primary truth class
owner
source/rebuild dependency
mutation policy
historical retention role
current pointer if revisioned
whether deletion/rebuild is allowed
```

A design review fails if it says only:

```text
"this table is current and historical and projection depending on use"
```

without explicit decomposition.

---

# 15. C5 interpretation after R8

Until C5.01 is mechanically regenerated, mixed cells are read through this normalization document.

Examples:

```text
RegistrationEntry
C5: CURRENT_STATE + historical intent
R8: RegistrationEntry CURRENT_STATE; transition history separate

TeamFormationRequest
C5: SOURCE/CURRENT
R8: immutable request snapshot; async job state separate

Ballot
C5: SOURCE_FACT/current effective choice
R8: effective ballot CURRENT_STATE; optional revisions SOURCE_FACT

MatchResult
C5: SOURCE_FACT/revisioned result
R8: immutable result revisions SOURCE_FACT + current pointer
```

R8 narrows physical interpretation; it does not change owner-domain semantics.

---

# 16. Exit criteria

```text
conceptual mixed cells acknowledged                 = YES
physical one-primary-class rule                     = YES
current vs history decomposition                    = explicit
source vs projection separation                     = explicit
local authority vs truth class separation           = explicit
schema-freeze gate                                  = explicit
```

`C7-F-016` is therefore remediated at architecture/data-planning level.

C6 implementation still needs to choose concrete table names/constraints in the relevant wave, but it no longer needs to invent what kind of truth each persisted artifact represents.
