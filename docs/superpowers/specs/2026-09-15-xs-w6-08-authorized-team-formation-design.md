# XS-W6-08 — Authorized team formation reachable from the wizard

Make the real team draw of an activated Community consume the server-authorized balance input
snapshot, so W4 Registration, the W6-01 capture and the W6-02 authorized adapter stop being
unreachable infrastructure. Inserted into the C6 sequence after XS-W6-02, like XS-W3-08 and
XS-W3-09 were inserted into W3.

## Why this slice exists

The [reachability map](../../architecture/execution/C6-REACHABILITY-MAP.md) counts 8 reachable
commands out of ~46. Everything the team draw would need already exists on the server and has no
caller:

- `capture_balance_input_snapshot` accepts only a target COMMUNITY Session in `DRAFT` or
  `SCHEDULED`, of an activated Community, with a roster revision that is the current one.
- A target Session is created only by sync, on the first upload of a Session that already entered
  `sessions` — which happens at `confirmDivision`, after the draw. The wizard draft lives in
  `activeSession` and never uploads. A Session created by sync has no roster revision.
- The only way a COMMUNITY target Session gets a roster revision is `finalize_session_roster`, which
  requires a `LOCKED` Registration Window. None of the W4 commands has a caller.
- `fromAuthorizedSnapshot` exists and is tested; the wizard still draws only from local attributes.

Production state on 2026-09-15 (Panelinha): 6 Communities, none activated, 0 `player_evaluations`,
0 `community_responsibilities`, 9 Sessions, all legacy. This slice changes nothing for any of them
until a Community is activated and evaluated through the existing editor, and its organizer holds
the Organizador role (XS-W3-09).

## Decisions taken with the user

1. **Full authorized chain**, not a client-side read of the community profile and not a shadow
   comparison.
2. **The roster reaches the server through W4 Registration, run behind the wizard.** No new roster
   source for COMMUNITY Sessions; the direct replacement stays QUICK-only, as C6 decided.
3. **Close `OPEN-REG-006` with an explicit reopen**, allowed only before the Session starts, so the
   organizer can still go back and change who plays.
4. **When the chain cannot run, the wizard blocks and explains.** No fallback to the local draw for
   an authorized-cohort Session: one draw authority per cohort, as XS-W3-08 already does for
   creation.
5. **The whole chain runs when the organizer generates teams**, with resumable steps. Moving back
   and forth between wizard steps does not call the server.
6. **Add `read_registration_window`**, so the diff and the recovery from `40001` come from the
   server instead of the device's memory.

## Part 1 — SQL

One migration, numbered after `20260915155701`: `20260915HHMMSS_reopen_registration.sql`.

### `reopen_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer)`

A dedicated command, not a `CLOSED → OPEN` entry in `assert_registration_lifecycle_transition`.
That table is indexed by `(from, to)` only; adding the pair would teach `open_registration` to reopen
too (HANDOFF, W4-03 warnings). `open_registration` keeps refusing to leave `CLOSED` or `LOCKED`.

Same shape as the other W4 lifecycle commands:

- locks the Session, then the Window; `P0002` when either is missing;
- `assert_target_session_write_authorized` before any receipt read (`42501`);
- a receipt for the same `command_id` returns the stored result;
- Session `lifecycle_status` must be `DRAFT` or `SCHEDULED`, otherwise `23514` — this is the
  "before the Session starts" of `HYP-REG-003`;
- Window already `OPEN`: records a receipt and returns the current revision, like its siblings;
- Window `CLOSED` or `LOCKED`: `p_expected_revision` must match (`40001`), status becomes `OPEN`,
  `revision` increments, `updated_at` moves; `opened_at` keeps the first opening;
- any other status (`DRAFT`): `23514`;
- `returns table (window_revision integer)`; `security definer`, `search_path = ''`, revoked from
  `public, anon`, granted to `authenticated`.

**Downstream artifacts.** Existing roster revisions stay immutable history. Finalizing again creates
the next revision: `roster_revisions_registration_source_key` is keyed by the Registration revision,
which moved. `finalize_session_roster` reuses `session_participants` per player. No stale marker is
added: no CandidateSet or TeamDraw exists yet, and `capture_balance_input_snapshot` already refuses a
revision that is not the current one (`40001`). XS-W6-03 and XS-W6-07 must check roster currency on
their own.

### `read_registration_window(p_window_id uuid)`

Returns one row: `window_id`, `session_id`, `status`, `revision`, `capacity`,
`confirmed_player_ids uuid[]` (entries with status `CONFIRMED`, ordered by `joined_at, id`).

- `42501` when not authenticated;
- `P0002` when the Window does not exist;
- authorization is `assert_target_session_write_authorized` on the Window's Session. The list of
  confirmed players is Registration data the browser has no grant for today; only the Session
  organizer, who writes the Window, reads it;
- `language plpgsql`, `security definer`, `search_path = ''`, same grants as above.

### Session lookup for the chain

No change. `create_target_session`, `read_target_session` and `read_target_roster_revision` are used
as they are.

## Part 2 — Application orchestration

New module `src/application/authorizedTeamFormationUseCases.ts`: no React, no direct Supabase, a
gateway parameter with an infra default, `AppResult` return — the pattern of
`balanceInputSnapshotUseCases.ts`.

Infra:

- new `src/infra/supabase/registrationCloudService.ts`: `createWindow`, `openWindow`, `reopenWindow`,
  `changeCapacity`, `addEntry`, `removeEntry`, `closeWindow`, `lockWindow`, `finalizeRoster`,
  `readWindow`, each one RPC with response validation;
- `sessionCohortCloudService` gains `readRosterRevision(rosterRevisionId)` over
  `read_target_roster_revision`, returning `participantId`, `identityKind`, `playerId` per entry;
- `balanceInputSnapshotCloudService` is reused for `capture` and `read`.

### Step 0 — authority decision

`resolveFormationAuthority` mirrors the sync's creation rule (`syncService.ts`, first-upload branch):

| Session                                                        | Result                    |
| -------------------------------------------------------------- | ------------------------- |
| `authorityModel === 'target'`                                  | authorized                |
| no `communityId`, or Community has no UUID cloud id            | local                     |
| has `cloudId` and is not target (already synced as legacy)     | local                     |
| Community cloud id in `activatedCommunityIds`                  | authorized                |
| Community cloud id not activated                               | local                     |
| activation lookup throws                                       | **blocked** (`technical`) |

`isCommunityEvaluationActivated` is not used: it answers `false` on any failure, which here would draw
locally in silence.

### Local precheck, before any network call

- every selected player has a `cloudId`, otherwise a product error naming them ("sincronize antes");
- no selected player has `isGuest`, otherwise a product error naming them;
- every selected player lists the Session's Community in `communityIds`, otherwise a product error
  naming them. The server stays the authority (`add_registration_entry` refuses with `42501`).

### Progress record

`Session.authorizedFormation?: AuthorizedFormationProgress`, persisted with `activeSession` by the
wizard draft that already exists:

```ts
interface AuthorizedFormationProgress {
  windowId?: string;
  finalizedRosterRevisionId?: string;
  finalizedPlayerCloudIds?: string[];
  snapshotId?: string;
  snapshotRosterRevisionId?: string;
  pendingCommandIds: Partial<Record<AuthorizedFormationStep, string>>;
}
```

A step takes its command id from `pendingCommandIds` or creates one, stores it before calling, and
removes it after success. A retry therefore replays the receipt instead of issuing a second command.
The use case returns the next progress with every result, success or failure, and the hook writes it
to `activeSession`.

Per-entry commands (`addEntry`, `removeEntry`) key the pending id by step and player cloud id.

### The chain

1. **Target Session.** When the Session is not yet target: `create_target_session` with the local
   Session id, the Community cloud id, the name and the play mode (`STRUCTURED_MATCHES` for a
   tournament, `FREE_PLAY` otherwise — the sync's rule). On `23505`, `read_target_session` adopts it,
   exactly as the sync does. The Session gets `cloudId` and `authorityModel: 'target'`;
   `buildFreePlayDivisionConfirmationResult` and the tournament path spread `activeSession`, so both
   survive confirmation, and the sync skips the root afterwards.
2. **Registration.** Read the Window when `windowId` is known, and compare `confirmed_player_ids`
   with the selected players' cloud ids as sets.
   - No Window: `create_registration_window` with capacity equal to the selected count and a random
     `window_id`, then `open_registration`.
   - Window `CLOSED` or `LOCKED` and the sets differ: `reopen_registration`.
   - Window `OPEN`, in this order, because capacity cannot drop below the confirmed count
     (REG-INV-017): remove every confirmed player no longer selected
     (`remove_registration_entry`, reason `ORGANIZER_DESELECTED`); set capacity to the selected
     count when it differs (`change_registration_capacity`); add every selected player not confirmed
     (`add_registration_entry`). Capacity is raised before any addition, so nobody is waitlisted.
   - Then continue from the Window's status: `OPEN` → `close_registration`; `CLOSED` →
     `lock_registration`; `LOCKED` → `finalize_session_roster` with the current Window revision. Each
     command uses the revision returned by the previous one.
   - `LOCKED` with equal sets and no `finalizedRosterRevisionId` (a finalize whose response was lost)
     calls `finalize_session_roster` again: for an already-finalized Registration revision it returns
     the existing roster revision.
   - `LOCKED` with equal sets and `finalizedRosterRevisionId` set: the whole step is skipped.
3. **Capture.** `read_target_roster_revision` on the finalized revision gives the participant ↔
   player mapping. When `snapshotRosterRevisionId` equals the finalized revision, `read_balance_input_snapshot`
   reuses `snapshotId`; otherwise `capture_balance_input_snapshot` and the progress keeps the new ids.
4. **Request.** `fromAuthorizedSnapshot({ snapshot, teamCount, config })`, then every
   `participantId` is replaced by the local player id: snapshot participant → roster entry
   `playerId` (cloud) → local `Player` with that `cloudId`. A participant without a match refuses the
   whole request. Hard constraints (`pairsTogether`, `pairsSeparated`, `lockedPlayerIdxs`), the
   partnership matrix and `adaptBalanceCandidatesToDivisions` all key by local player id, so they
   keep working unchanged. Provenance stays `AUTHORIZED_SNAPSHOT` with the snapshot id and
   fingerprint.

**`40001` anywhere in step 2 or 3.** Re-read the Window (and, for capture, the finalized revision
through `read_target_session.current_roster_revision_id`), drop the stale pending id of that step,
and rerun the chain once. A second `40001` returns a conflict error.

### Error classification (pt-BR, each with its action)

| Source                                                    | Kind           | Message                                                                                             |
| --------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| activation lookup failed, `CLOUD_UNAVAILABLE`, fetch error | technical      | Esta comunidade usa as notas autorizadas. Conecte-se e tente de novo.                               |
| `42501` on create, Registration lifecycle or capture      | authorization  | Só quem tem o cargo Organizador nesta comunidade pode gerar os times. Peça o cargo a um administrador. |
| `42501` on `add_registration_entry`                       | product        | {nome} não está no elenco da comunidade na nuvem.                                                   |
| local precheck: missing `cloudId`                         | product        | Sincronize antes de gerar os times: {nomes} ainda não estão na nuvem.                               |
| local precheck: guest                                     | product        | Convidados não entram no sorteio autorizado. Remova {nomes} ou cadastre na comunidade.              |
| local precheck: not in the Community                      | product        | {nomes} não fazem parte desta comunidade.                                                           |
| second `40001`                                            | conflict       | O elenco mudou em outro aparelho. Tente de novo.                                                    |
| capture `23514`, message "Source Community has not activated…" | product   | As notas de um atleta vêm de uma comunidade que ainda não ativou o modelo novo.                     |
| capture `23514`, message "…without live Community standing" | product      | Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.                          |
| any other `23514` (lifecycle, rubric drift, empty roster)  | product        | A sessão ou o elenco não estão prontos para formar times.                                           |
| `PGRST202`, `42883`                                       | technical      | A formação autorizada ainda não está disponível neste servidor.                                     |
| participant without local match                           | unexpected     | Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.  |
| anything else                                             | technical      | Não foi possível preparar os times. Verifique a conexão e tente novamente.                         |

## Part 3 — Wizard and screen

`useSessionWizard` receives `communities` (AppShell passes `comm.communities`) and an optional
`authorizedFormationGateway` for tests.

`generateDivisions`:

1. builds the plan exactly as today;
2. resolves authority; `local` continues on today's path with no other change;
3. `authorized` enters a **preparing** phase: `isGenerating` true, `generationPhase: 'preparing'`,
   `generationStage` per chain step. A cancellation flag is checked after every await; cancelling
   starts no Worker and keeps the persisted progress;
4. on success, `plan.request` is replaced by the authorized request and the Worker path runs as
   today, with `generationPhase: 'balancing'`. The synchronous fallback uses the same plan, so a
   Worker failure never reverts to local notes;
5. on failure, generation stops and the message goes to `validationErrors.generation`, the alert the
   screen already renders.

Regenerating with the same roster (the results-step button, `advanceStep: false`) reaches step 3
with the Registration step skipped and the snapshot reused, and draws with a new seed.

Screen (`SessionWizard.tsx`, Review step and results):

- preparing: an indeterminate `<progress>` and the stage text — "Preparando a sessão na nuvem…",
  "Confirmando o elenco…", "Congelando as notas dos atletas…";
- balancing: today's "Equilibrando os times…" with the percentage;
- results: a small badge "Notas autorizadas da comunidade" when the divisions came from an authorized
  request. Nothing changes for a local draw.

## Part 4 — Tests

### Database (real Postgres, `volley_test_pg2`)

`src/test/db/registrationReopen.dbtest.ts`

- the first assertion is written before the RPC exists and must fail with `42883`;
- reopen from `LOCKED` and from `CLOSED`; reopen from `OPEN` is a no-op returning the revision;
  from `DRAFT` refuses `23514`;
- refusals: Session not `DRAFT`/`SCHEDULED` (`23514`), non-organizer (`42501`), stale revision
  (`40001`); replay of the same `command_id` returns the receipt;
- after reopen, remove/add, close, lock and finalize produce revision 2 reusing participant ids;
  capturing revision 1 then fails `40001` and revision 2 succeeds;
- `open_registration` still refuses `LOCKED → OPEN`;
- `read_registration_window` returns status, revision, capacity and confirmed player ids in order;
  refuses a non-organizer (`42501`) and a missing Window (`P0002`).

`src/test/db/authorizedFormationChain.dbtest.ts` — the exact RPC sequence the client runs, from
`create_target_session` to `capture_balance_input_snapshot`, then the reopen round, against an
activated Community with an Organizador. It proves the orchestration order against real SQL without
mocks.

### Unit (Node runner)

`src/application/authorizedTeamFormationUseCases.test.ts`, with an in-memory gateway that models
Window status, revision, receipts and roster revisions:

- the authority table, including the blocked lookup;
- each local precheck;
- the happy path command order;
- resume: a failure at step N, then a retry that reuses the pending command id and skips completed
  steps;
- unchanged selection skips Registration and reuses the snapshot;
- diff with removal, capacity change and addition;
- `40001`: one automatic re-read and rerun, then the conflict error;
- `23505` adoption on create;
- participant re-keying, and refusal on a missing match;
- every row of the error table.

`src/infra/supabase/registrationCloudService.test.ts` — RPC names, parameter mapping, response
validation. `sessionCohortCloudService` gains a `readRosterRevision` parsing test.

### UI (Vitest)

`src/hooks/useSessionWizard.spec.tsx`:

- a local Session never calls the gateway;
- an authorized Session goes through preparing, and the Worker receives a request with provenance
  `AUTHORIZED_SNAPSHOT` and local participant ids;
- a chain error shows the alert, resets generating and starts no Worker;
- regenerating with the same roster does not capture again;
- cancelling during preparing starts no Worker.

`SessionWizard` view: stage text, indeterminate bar, badge on results.

### Gates

`npm run typecheck`, ESLint and Prettier on tracked files, `npm test`, `npm run build`,
`npm run check:architecture`, the full `npm run test:db`.

## Documentation

- `docs/architecture/catalogs/OPEN-DECISIONS.md`: `OPEN-REG-006` closed with the reopen semantics.
- `docs/architecture/catalogs/HYPOTHESES.md`: `HYP-REG-003` accepted.
- `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`: `ReopenRegistration` row.
- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`: XS-W6-08 section.
- `docs/architecture/execution/C6-REACHABILITY-MAP.md`: re-derived. The W4 lifecycle and entry
  commands used here, `finalize_session_roster`, `read_target_roster_revision`,
  `capture_balance_input_snapshot`, `read_balance_input_snapshot` and the two new RPCs become
  reachable by screen.
- `HANDOFF.md`: the slice, its evidence and its limits.

## Out of scope

- Candidate publication and voting (XS-W6-03 to XS-W6-06).
- TeamDraw authority (XS-W6-07). Confirmed teams keep flowing through the generic sync; the draw
  result has no server artifact.
- The broad evaluation source cutover (XS-W5-05). Only the wizard draw of an authorized-cohort
  Session changes.
- Guests in the authorized draw.
- Registration as a player-facing feature: self-join, waitlist, deadlines.
- Offline draw in an activated Community.
- Quick and cloudless Sessions, and Communities that are not activated: unchanged.
- Owner and admin without the Organizador role stay refused, now with a message.

## Known limitations

- **Cancelling the wizard after preparing** leaves a `DRAFT` target Session with a Registration
  Window on the server. Same family as XS-W3-08's "deleting a target Session does not propagate";
  mapping cancellation to `cancel_target_session` stays a product decision.
- **A target Session stays invisible on other devices** (XS-W3-08 known problem): the bulk download
  filters `authority_model = 'legacy'`.
- **One organizer per Session in practice.** `read_registration_window` makes a second device
  recoverable, but two organizers editing the same Registration concurrently get the conflict
  message, not a merge.

## Delivery order

Branch `exec/c6-authorized-team-formation`, worktree `C:\Volley-xs-w6-08`.

1. Migration and database tests.
2. Infra services, orchestration use case and unit tests.
3. Wizard hook, screen and UI tests.
4. Documentation.

Applying the migration to Panelinha and any production verification wait for explicit user
approval. A real-user check needs an activated, evaluated Community and an account with the
Organizador role; agents do not create accounts.
