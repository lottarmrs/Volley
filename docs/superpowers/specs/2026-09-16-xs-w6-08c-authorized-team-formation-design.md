# XS-W6-08c — Authorized team formation reachable from the wizard

Make the real team draw of every synced Community consume the server-authorized balance input
snapshot, so W4 Registration, the W6-01 capture and the W6-02 authorized adapter stop being
unreachable infrastructure. Last slice of the XS-W6-08 series, inserted into the C6 sequence after
XS-W6-02 like XS-W3-08 and XS-W3-09 were inserted into W3:

1. **XS-W6-08a** — evaluation model mandatory, `ORGANIZER` by legacy role, session creation guard.
   Published in `main` (`81b43d7`) and applied to Panelinha on 2026-09-16.
2. **XS-W6-08b** — attribute import. Cancelled on 2026-09-16: production attributes are bulk creation
   defaults, not evaluations.
3. **XS-W6-08c** (this slice).

This spec replaces the draft `2026-09-15-xs-w6-08-authorized-team-formation-design.md`, written
before XS-W6-08a and the cancellation of XS-W6-08b.

## Why this slice exists

The [reachability map](../../architecture/execution/C6-REACHABILITY-MAP.md) still leaves everything
the team draw needs without a caller:

- `capture_balance_input_snapshot` accepts only a target COMMUNITY Session in `DRAFT` or `SCHEDULED`
  with the current roster revision.
- A target Session is created only by sync, on the first upload of a Session that already entered
  `sessions` — at `confirmDivision`, after the draw. The wizard draft lives in `activeSession` and
  never uploads, and a Session created by sync has no roster revision.
- A COMMUNITY target Session gets a roster revision only through `finalize_session_roster`, which
  needs a `LOCKED` Registration Window. No W4 command has a caller.
- `fromAuthorizedSnapshot` exists and is tested; the wizard still draws from local attributes.

Production on 2026-09-16 (Panelinha): 6 Communities, all activated; `ORGANIZER` for 6 owners and 1
admin; 0 versioned evaluations; 9 Sessions, all legacy. Until the Community evaluates Players through
the existing editor, every participant of an authorized snapshot is estimated.

## Decisions taken with the user

1. **Full authorized chain**, not a client-side read of the community profile and not a shadow
   comparison.
2. **The roster reaches the server through W4 Registration, run behind the wizard.** The direct
   roster replacement stays QUICK-only, as C6 decided.
3. **Close `OPEN-REG-006` with an explicit reopen**, allowed only before the Session starts, so the
   organizer can still change who plays.
4. **When the chain cannot run, the wizard blocks and explains.** No fallback to the local draw for
   an authorized Session: one draw authority per cohort.
5. **The whole chain runs when the organizer generates teams**, with resumable steps. Moving between
   wizard steps does not call the server.
6. **Add `read_registration_window`**, so the diff and the recovery from `40001` come from the server
   instead of the device's memory.
7. **Mandatory model, so no activation lookup** (after XS-W6-08a). Every synced Community Session is
   authorized; offline, the chain fails and the wizard blocks. Quick Sessions and local-only
   Communities keep drawing offline.

## Part 1 — SQL

One migration: `supabase/migrations/20260916120000_reopen_registration.sql`, numbered after
`20260915180000_mandatory_evaluation_model.sql`.

### `reopen_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer)`

A dedicated command, not a `CLOSED → OPEN` entry in `assert_registration_lifecycle_transition`. That
table is indexed by `(from, to)` only; adding the pair would teach `open_registration` to reopen too.
`open_registration` keeps refusing to leave `CLOSED` or `LOCKED`.

Same shape as the other W4 lifecycle commands:

- locks the Session, then the Window; `P0002` when either is missing;
- `assert_target_session_write_authorized` before any receipt read (`42501`);
- a receipt for the same `command_id` returns the stored result;
- Session `lifecycle_status` must be `DRAFT` or `SCHEDULED`, otherwise `23514` — the "before the
  Session starts" of `HYP-REG-003`;
- Window already `OPEN`: records a receipt and returns the current revision, like its siblings;
- Window `CLOSED` or `LOCKED`: `p_expected_revision` must match (`40001`); status becomes `OPEN`,
  `revision` increments, `updated_at` moves, `opened_at` keeps the first opening;
- Window `DRAFT`: `23514`;
- `returns table (window_revision integer)`; `security definer`, `search_path = ''`, revoked from
  `public, anon`, granted to `authenticated`.

**Downstream artifacts.** Existing roster revisions stay immutable history. Finalizing again creates
the next revision, because `roster_revisions_registration_source_key` is keyed by the Registration
revision, which moved. `finalize_session_roster` reuses `session_participants` per player. No stale
marker is added: no CandidateSet or TeamDraw exists yet, and `capture_balance_input_snapshot` already
refuses a revision that is not the current one (`40001`). XS-W6-03 and XS-W6-07 must check roster
currency on their own.

### `read_registration_window(p_window_id uuid)`

Returns one row: `window_id`, `session_id`, `status`, `revision`, `capacity`,
`confirmed_player_ids uuid[]` (entries with status `CONFIRMED`, ordered by `joined_at, id`).

- `42501` when not authenticated; `P0002` when the Window does not exist;
- authorization is `assert_target_session_write_authorized` on the Window's Session: the confirmed
  list is Registration data the browser has no grant for, so only the Session organizer reads it;
- `language plpgsql`, `security definer`, `search_path = ''`, same grants as above.

`create_target_session`, `read_target_session` and `read_target_roster_revision` are used unchanged.

## Part 2 — Application orchestration

New module `src/application/authorizedTeamFormationUseCases.ts`: no React, no direct Supabase, a
gateway parameter with an infra default — the pattern of `balanceInputSnapshotUseCases.ts`.

Infra:

- new `src/infra/supabase/registrationCloudService.ts`: `createWindow`, `openWindow`,
  `reopenWindow`, `changeCapacity`, `addEntry`, `removeEntry`, `closeWindow`, `lockWindow`,
  `finalizeRoster`, `readWindow`, one RPC each, with response validation;
- `sessionCohortCloudService` gains `readRosterRevision(rosterRevisionId)` over
  `read_target_roster_revision`, returning `participantId`, `identityKind`, `playerId` per entry;
- `balanceInputSnapshotCloudService` is reused for `capture` and `read`.

### Step 0 — authority decision

`classifyFormationAuthority(session, communities)` is pure and synchronous:

| Session                                                                   | Result     |
| ------------------------------------------------------------------------- | ---------- |
| `authorityModel === 'target'`                                             | authorized |
| no `communityId`, or its Community has no UUID `cloudId` (local-only)     | local      |
| has `cloudId` and is not target (already synced as legacy)                | local      |
| any other Session of a synced Community                                   | authorized |

No activation lookup: XS-W6-08a activates every Community on the server. A target Session whose
Community is missing locally or has no UUID `cloudId` returns an authorized result that the chain
refuses with the generic technical error, since the draw cannot fall back to local.

### Local precheck, before any network call

- every selected Player has a `cloudId`, otherwise a product error naming them ("sincronize antes");
- every selected Player lists the Session's Community in `communityIds`, otherwise a product error
  naming them. The server stays the authority (`add_registration_entry` refuses with `42501`).

Guests are not special: `isGuest` is local-only, and sync uploads a guest as an ordinary Player linked
to the Community. On the server a synced guest is a valid `PLAYER` with no evaluation, so estimated.

### Progress record

`Session.authorizedFormation?: AuthorizedFormationProgress`, persisted with `activeSession` by the
existing wizard draft:

```ts
interface AuthorizedFormationProgress {
  windowId?: string;
  finalizedRosterRevisionId?: string;
  finalizedPlayerCloudIds?: string[];
  snapshotId?: string;
  snapshotRosterRevisionId?: string;
  pendingCommandIds: Record<string, string>;
}
```

A step takes its command id from `pendingCommandIds` or creates one, stores it before calling, and
removes it after success, so a retry replays the receipt instead of issuing a second command.
Per-entry commands key the pending id by step and player cloud id. The Window id is stored before
`create_registration_window`, whose receipt is keyed by the Window id. Every progress change is
reported through `onSessionChange(session)` before the next call, so the draft persists it even if
the app closes mid-chain; the use case also returns the final session with every result.

### The chain

1. **Target Session.** When the Session is not yet target: `create_target_session` with the local
   Session id, the Community cloud id, the name and the play mode (`STRUCTURED_MATCHES` for a
   tournament, `FREE_PLAY` otherwise — the sync's rule). On `23505`, `read_target_session` adopts it,
   as the sync does. The Session gets `cloudId` and `authorityModel: 'target'`; both confirmation
   paths spread `activeSession`, so they survive confirmation, and the sync skips the root afterwards.
2. **Registration.** Read the Window when `windowId` is known and compare `confirmed_player_ids` with
   the selected cloud ids as sets.
   - No Window (`windowId` unknown, or the read answers `P0002`): `create_registration_window` with
     capacity equal to the selected count, then `open_registration`.
   - `CLOSED` or `LOCKED` and the sets differ: `reopen_registration`.
   - `OPEN`, in this order, because capacity cannot drop below the confirmed count (REG-INV-017):
     remove every confirmed Player no longer selected (`remove_registration_entry`, reason
     `ORGANIZER_DESELECTED`); set capacity to the selected count when it differs
     (`change_registration_capacity`); add every selected Player not confirmed
     (`add_registration_entry`). Capacity rises before any addition, so nobody is waitlisted.
   - Then continue from the status: `OPEN` → `close_registration`; `CLOSED` → `lock_registration`;
     `LOCKED` → `finalize_session_roster`. Each command uses the revision returned by the previous one.
   - `LOCKED`, equal sets and no `finalizedRosterRevisionId` (a finalize whose response was lost):
     `finalize_session_roster` again, which returns the existing roster revision.
   - `LOCKED`, equal sets and `finalizedRosterRevisionId` set: the step is skipped.
3. **Capture.** `read_target_roster_revision` on the finalized revision gives the participant ↔
   player mapping. When `snapshotRosterRevisionId` equals it, `read_balance_input_snapshot` reuses
   `snapshotId`; otherwise `capture_balance_input_snapshot`, and the progress keeps the new ids.
4. **Request.** `fromAuthorizedSnapshot({ snapshot, teamCount, config })`, then every `participantId`
   is replaced by the local Player id: snapshot participant → roster entry `playerId` (cloud) → local
   `Player` with that `cloudId`. A participant without a match refuses the request. Hard constraints,
   the partnership matrix and `adaptBalanceCandidatesToDivisions` key by local id, so they keep
   working. Provenance stays `AUTHORIZED_SNAPSHOT` with the snapshot id and fingerprint. The result
   also carries `estimatedCount` and `participantCount` from the snapshot's `is_estimated`.

**`40001` in step 2 or 3.** Drop the stale pending id of that step and the finalized/snapshot ids,
then rerun the chain once; the rerun re-reads the Window. A second `40001` returns a conflict error.

### Error classification (pt-BR)

| Source                                                   | Kind        | Message                                                                                              |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `CLOUD_UNAVAILABLE` or network failure                   | offline     | Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.             |
| `42501` on create, Registration lifecycle or capture     | product     | Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.                      |
| `42501` on `add_registration_entry`                      | product     | {nome} não está no elenco da comunidade na nuvem.                                                    |
| local precheck: missing `cloudId`                        | product     | Sincronize antes de gerar os times: {nomes} ainda não estão na nuvem.                                |
| local precheck: not in the Community                     | product     | {nomes} não fazem parte desta comunidade.                                                            |
| second `40001`                                           | conflict    | O elenco mudou em outro aparelho. Tente de novo.                                                     |
| capture `23514`, message "…without live Community standing" | product  | Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.                           |
| any other `23514`                                        | product     | A sessão ou o elenco não estão prontos para formar times.                                            |
| `PGRST202`, `42883`                                      | technical   | A formação autorizada ainda não está disponível neste servidor.                                      |
| participant without local match                          | unexpected  | Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.   |
| anything else                                            | technical   | Não foi possível preparar os times. Verifique a conexão e tente novamente.                          |

A network failure is a thrown `TypeError` or an error message matching `Failed to fetch`,
`NetworkError`, `Load failed` or `fetch failed`.

## Part 3 — Wizard and screen

`useSessionWizard` receives `communities` (AppShell passes `comm.communities`) and an optional
`authorizedFormationGateway` for tests.

`generateDivisions`:

1. builds the plan exactly as today;
2. classifies authority synchronously; `local` runs today's path unchanged and synchronously;
3. `authorized` runs the precheck, then enters a **preparing** phase: `isGenerating` true and
   `generationStage` per chain step. A cancellation token is checked after every await; cancelling
   starts no Worker and keeps the persisted progress;
4. on success, the authorized request replaces `plan.request` and today's Worker path runs; the
   synchronous fallback uses the same plan, so a Worker failure never reverts to local notes;
5. on failure, generation stops and the message goes to `validationErrors.generation`.

`onSessionChange` writes to `activeSession` only while the same Session is still active, so a
cancelled wizard is not resurrected.

Regenerating with the same roster skips Registration, reuses the snapshot and draws with a new seed.

Screen (`SessionWizard.tsx`):

- preparing, in the Review step: an indeterminate `<progress>` and the stage text — "Preparando a
  sessão na nuvem…", "Confirmando o elenco…", "Congelando as notas dos atletas…". The status block
  becomes a small `SessionGenerationStatus` component;
- balancing: today's "Equilibrando os times…" with the percentage;
- results, for an authorized draw: the badge "Notas autorizadas da comunidade" and, when
  `estimatedCount > 0`, "{estimatedCount} de {participantCount} atletas sem avaliação — sorteio com
  notas estimadas. Avalie pelo perfil do atleta.";
- results also render `validationErrors.generation`, so a failed regenerate is visible there.

## Part 4 — Tests

### Database (real Postgres, `volley_test_pg2`)

`src/test/db/registrationReopen.dbtest.ts`:

- first run before the migration exists fails with `42883`;
- reopen from `LOCKED` and from `CLOSED`; from `OPEN` a no-op returning the revision; from `DRAFT`
  `23514`;
- refusals: Session not `DRAFT`/`SCHEDULED` (`23514`), non-organizer (`42501`), stale revision
  (`40001`); replay of the same `command_id` returns the receipt;
- after reopen, remove/add, close, lock and finalize give revision 2 reusing participant ids;
  capturing revision 1 then fails `40001` and revision 2 succeeds;
- `open_registration` still refuses `LOCKED → OPEN`;
- `read_registration_window` returns status, revision, capacity and confirmed ids in order; refuses a
  non-organizer (`42501`) and a missing Window (`P0002`).

`src/test/db/authorizedFormationChain.dbtest.ts` — the exact RPC sequence the client runs, from
`create_target_session` to `capture_balance_input_snapshot`, then the reopen round, on a legacy
Community whose owner holds `ORGANIZER` through the XS-W6-08a mirror (no manual grant).

### Unit (Node runner)

`src/application/authorizedTeamFormationUseCases.test.ts`, with an in-memory gateway modeling Window
status, revision, receipts, finalized revisions and snapshots:

- the authority table;
- both local prechecks, and a guest Player with `cloudId` passing;
- the happy path command order;
- resume after a failure at step N, reusing the pending command id and skipping completed steps;
- a lost finalize response replayed without a second roster revision;
- unchanged selection skipping Registration and reusing the snapshot;
- diff with removal, capacity change and addition;
- `40001`: one automatic rerun, then the conflict error;
- `23505` adoption on create;
- participant re-keying and refusal on a missing match; estimated counts;
- every row of the error table;
- cancellation between steps.

`src/infra/supabase/registrationCloudService.test.ts` — RPC names, parameters, response validation;
`sessionCohortCloudService.test.ts` gains `readRosterRevision` parsing.

### UI (Vitest)

- `useSessionWizard.spec.tsx`: a local Session never calls the chain and stays synchronous; an
  authorized Session goes through preparing and the Worker receives an `AUTHORIZED_SNAPSHOT` request;
  a chain error shows the alert and starts no Worker; cancelling during preparing starts no Worker; a
  precheck failure never calls the chain.
- `SessionGenerationStatus.spec.tsx`: stage text with an indeterminate bar; balancing text with the
  percentage; cancel.
- `sessionWizardContract.test.ts`: the model exposes `generationStage`, `authorizedDraw` and the
  estimated counts.

### Gates

`npm run typecheck`, ESLint and Prettier on tracked files, `npm test`, `npm run build`,
`npm run check:architecture`, the full `npm run test:db`.

## Documentation

- `docs/architecture/catalogs/OPEN-DECISIONS.md`: `OPEN-REG-006` closed with the reopen semantics.
- `docs/architecture/catalogs/HYPOTHESES.md`: `HYP-REG-003` accepted.
- `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`: `ReopenRegistration` row.
- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`: XS-W6-08c note.
- `docs/architecture/execution/C6-REACHABILITY-MAP.md`: the W4 lifecycle and entry commands used
  here, `finalize_session_roster`, `read_target_roster_revision`, `capture_balance_input_snapshot`,
  `read_balance_input_snapshot` and the two new RPCs become reachable by screen.
- `HANDOFF.md`: the slice, its evidence and its limits.

## Out of scope

- Candidate publication and voting (XS-W6-03 to XS-W6-06).
- TeamDraw authority (XS-W6-07): confirmed teams keep flowing through the generic sync.
- The broad evaluation source cutover (XS-W5-05): only the wizard draw of an authorized Session
  changes.
- Registration as a player-facing feature: self-join, waitlist, deadlines.
- Offline draw for Sessions of a synced Community.
- Quick Sessions and local-only Communities: unchanged, including offline.
- Sessions already synced as legacy: they keep drawing locally.

## Known limitations

- **Cancelling the wizard after preparing** leaves a `DRAFT` target Session with a Registration
  Window on the server — the XS-W3-08 family ("deleting a target Session does not propagate");
  mapping it to `cancel_target_session` stays a product decision.
- **A target Session stays invisible on other devices** (XS-W3-08): the bulk download filters
  `authority_model = 'legacy'`.
- **One organizer per Session in practice**: two organizers editing the same Registration at once get
  the conflict message, not a merge.
- **All estimated until evaluations exist**: production has none, so the first authorized draws treat
  every Player as 5; the screen says so.

## Delivery order

Branch `exec/c6-authorized-team-formation`, worktree `C:\Volley-xs-w6-08`.

1. Migration and database tests.
2. Infra services, orchestration use case and unit tests.
3. Wizard hook, screen and UI tests.
4. Documentation.

Applying the migration to Panelinha and any production verification wait for explicit user approval.
A real-user check needs an account with an organizing role in a synced Community; agents do not create
accounts.
