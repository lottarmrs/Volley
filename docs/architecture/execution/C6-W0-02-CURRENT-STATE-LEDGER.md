# C6 XS-W0-02 — Current-state inventory and authority ledger

> Status: `TRANSITIONAL / C6-W0-02`
>
> Owner: `Migration / Architecture Governance`
>
> Parent: [`C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md`](C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md)
>
> Generated from `src/architecture/currentStateLedger.ts`. Do not edit by hand.

---

# 0. What this is

This document describes the **current implementation**, not the target architecture. It is
transitional evidence produced by C6 slice `XS-W0-02` so that later waves can retire legacy
deliberately instead of by guesswork.

The exit gate for the slice is:

```text
No W13 removal may begin for an entity whose current readers/writers are not inventoried.
```

That gate is enforced mechanically. `src/architecture/currentStateLedger.test.ts` reads
`LocalSyncPayload`, `OperationalSyncPayload` and `STORAGE_KEYS` from live source and fails if
any entity or key is missing an entry, if a recorded surface no longer exists, or if an entry
with no reader and no writer is not explicitly classified for retirement.

Inventoried entities: **31**.

# 1. Retirement order by target wave

| Wave | Entities |
| --- | --- |
| `W2` | communities, players, community rules, community players, community membership and join state |
| `W3` | sessions |
| `W4` | community presence |
| `W5` | player evaluations, self evaluations |
| `W6` | teams |
| `W7` | games, point events |
| `W8` | championships, championship teams, championship rounds, championship requests |
| `W9` | game reports, session reports, career events and totals |
| `W10` | whatsapp list templates |
| `W11` | player avatars and proposals |
| `W12` | whatsapp list drafts, active session pointer, session draft, last selected player ids, last session config, active community id, dismissed hints |
| `W13` | sync issue ledger |
| `W14` | best divisions cache, selected division index |

# 2. Entities with no remaining reader or writer

- `best divisions cache` — Read only by the migration importer; no production writer. N2.22 lists legacy best-division mirrors as RETIRE. Removal candidate with zero live readers.
- `selected division index` — Dead key: no reader or writer anywhere in src, including the migration importer. Only the clearLocalDomainCache sweep touches it. Strongest W14 removal candidate.
- `sync issue ledger` — Diagnostic surface for the generic sync it reports on; retires with syncService.

# 3. Inventory

## communities

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `communities` |
| Local storage key | `communities` |
| Cloud table / RPC | `communities`<br>`rpc:set_community_visibility`<br>`rpc:search_public_communities` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/communityCloudService.ts`<br>`hooks/useCommunities.ts` |
| Legacy readers | `hooks/useCommunities.ts`<br>`application/localCommunityUseCases.ts`<br>`logic/migrations.ts` |
| Current authority | Split: browser writes localStorage and pushes to cloud; neither side is authoritative. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | Parent of nearly everything: 29 child FKs cascade from communities(id). |
| Target owner | `N2.03-communities` |
| Target wave | `W2` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/community/CommunitiesView.tsx`<br>`app/AppShell.tsx` |

Community delete cascades to sessions, games, point_events, reports, championships and career_events, which conflicts with GINV-ID-005 and ADR-SEC-011 (account/privacy deletion is not sports-history cascade). Flagged for W2/W14.

## players

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `players` |
| Local storage key | `players` |
| Cloud table / RPC | `players`<br>`rpc:find_player_by_username` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/playerCloudService.ts`<br>`hooks/usePlayers.ts` |
| Legacy readers | `hooks/usePlayers.ts`<br>`application/localPlayerUseCases.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud; local edits win on newer updatedAt. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. Additional semantic-key fallback matching by normalized name. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | players(id) cascades to evaluations, self_evaluations, avatar proposals, claim codes, career_events; restrict from identity claims/aliases. |
| Target owner | `N2.02-identity-players` |
| Target wave | `W2` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/player/PlayerEditView.tsx`<br>`components/player/PlayerComponents.tsx` |

Player is the sports identity and must stay distinct from User and Participant (GINV-ID-001).

## community rules

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `rules` |
| Local storage key | `communityRules` |
| Cloud table / RPC | `community_rules` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/communityRulesCloudService.ts`<br>`hooks/useCommunityRules.ts` |
| Legacy readers | `hooks/useCommunityRules.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | community_rules -> communities(id) cascade. |
| Target owner | `N2.03-communities` |
| Target wave | `W2` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/community/CommunitiesView.tsx` |

Community defaults must never rewrite existing Session history (GINV-COM-003).

## whatsapp list templates

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `templates` |
| Local storage key | `whatsAppListTemplates` |
| Cloud table / RPC | `whatsapp_list_templates` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/whatsappTemplateCloudService.ts`<br>`hooks/useWhatsAppListTemplates.ts` |
| Legacy readers | `hooks/useWhatsAppListTemplates.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | whatsapp_list_templates -> communities(id) cascade. |
| Target owner | `N2.10-notifications` |
| Target wave | `W10` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `logic/whatsappList.ts` |

## championships

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `championships` |
| Local storage key | `championships` |
| Cloud table / RPC | `championships` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/championshipCloudService.ts`<br>`hooks/useChampionships.ts` |
| Legacy readers | `hooks/useChampionships.ts`<br>`logic/tournament.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | championships -> communities(id) cascade. |
| Target owner | `N2.08-competitions` |
| Target wave | `W8` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/championship/ChampionshipDetailView.tsx`<br>`components/championship/ChampionshipWizardView.tsx` |

Fixture and Match must stay separate in the target (GINV-MATCH-001, GINV-COMP-001).

## championship teams

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `championshipTeams` |
| Local storage key | `championshipTeams` |
| Cloud table / RPC | `championship_teams` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/championshipCloudService.ts`<br>`hooks/useChampionships.ts` |
| Legacy readers | `hooks/useChampionships.ts`<br>`logic/tournament.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | championship_teams -> championships(id) cascade. |
| Target owner | `N2.08-competitions` |
| Target wave | `W8` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/championship/ChampionshipDetailView.tsx` |

## championship rounds

| Field | Current state |
| --- | --- |
| Sources | `LocalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `championshipRounds` |
| Local storage key | `championshipRounds` |
| Cloud table / RPC | `championship_rounds` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/championshipCloudService.ts`<br>`hooks/useChampionships.ts` |
| Legacy readers | `hooks/useChampionships.ts`<br>`logic/tournament.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | championship_rounds -> championships(id) cascade, championship_teams(id) cascade, sessions(id) set null. |
| Target owner | `N2.08-competitions` |
| Target wave | `W8` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/championship/ChampionshipDetailView.tsx` |

ChampionshipRound is the current stand-in for Fixture; it is a named W8 legacy surface in C6.06.

## sessions

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `sessions` |
| Local storage key | `sessions` |
| Cloud table / RPC | `sessions`<br>`rpc:claim_session_ownership`<br>`rpc:transfer_session_ownership` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useSessions.ts` |
| Legacy readers | `hooks/useSessions.ts`<br>`application/sessionLifecycleUseCases.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud; ownership claim/transfer exists as RPC but merge is still generic. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | sessions -> communities(id) cascade; parent of teams/games/point_events/reports (cascade). |
| Target owner | `N2.04-sessions` |
| Target wave | `W3` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/session/SessionWizard.tsx`<br>`components/live/SessionActiveView.tsx`<br>`hooks/useLiveSession.ts` |

Carries legacy selectedPlayerIds/teamIds ID arrays (AF-TRANS-002, GINV-DATA-003) and Session-level control assumptions that W7 replaces with per-Match control.

## teams

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `teams` |
| Local storage key | `teams` |
| Cloud table / RPC | `teams` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useSessions.ts` |
| Legacy readers | `hooks/useSessions.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | teams -> communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.06-team-formation` |
| Target wave | `W6` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/session/SessionWizard.tsx`<br>`logic/balancing.ts` |

Target replaces ad hoc Team lists with TeamDraw bound to a RosterRevision (GINV-BAL-002).

## games

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `games` |
| Local storage key | `games` |
| Cloud table / RPC | `games` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useLiveSession.ts` |
| Legacy readers | `hooks/useSessions.ts`<br>`hooks/useLiveSession.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud with mutable score on the row. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | games -> communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.07-live-match` |
| Target wave | `W7` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/live/SessionActiveView.tsx`<br>`components/live/TeamScoreCard.tsx` |

Mutable Game score plus LWW is the exact pattern GINV-MATCH-002/003 forbid; target computes score server-side from a per-Match sequence.

## point events

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `pointEvents` |
| Local storage key | `points` |
| Cloud table / RPC | `point_events` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useLiveSession.ts` |
| Legacy readers | `hooks/useLiveSession.ts`<br>`logic/reports.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud; client-generated ordering. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | point_events -> communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.07-live-match` |
| Target wave | `W7` |
| Migration class | `IMPORT_AS_HISTORY` |
| Remaining surfaces | `components/live/SessionActiveView.tsx` |

Closest current analogue of MatchEvent. N2.22 requires a dedicated reconciliation/import path for unsent PointEvents rather than generic merge.

## game reports

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `gameReports` |
| Local storage key | `gameReports` |
| Cloud table / RPC | `game_reports` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useSessions.ts` |
| Legacy readers | `logic/reports.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | game_reports -> communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.09-history-statistics` |
| Target wave | `W9` |
| Migration class | `IMPORT_AS_HISTORY` |
| Remaining surfaces | `logic/reports.ts` |

Reports are separate from factual statistics and from subjective evaluations (GINV-STAT-001).

## session reports

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `sessionReports` |
| Local storage key | `sessionReports` |
| Cloud table / RPC | `session_reports` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useSessions.ts` |
| Legacy readers | `logic/reports.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | session_reports -> communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.09-history-statistics` |
| Target wave | `W9` |
| Migration class | `IMPORT_AS_HISTORY` |
| Remaining surfaces | `logic/reports.ts` |

## community presence

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `presenceRecords` |
| Local storage key | `communityPresence` |
| Cloud table / RPC | `community_presence` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useCommunityPresence.ts` |
| Legacy readers | `hooks/useCommunityPresence.ts`<br>`logic/communityPresence.ts`<br>`logic/migrations.ts` |
| Current authority | Split local/cloud. |
| Current merge | Dedicated mergePresenceRecords: unions item lists by player/guest key, then picks the newer updatedAt for the envelope. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | community_presence -> communities(id) cascade. |
| Target owner | `N2.05-registration` |
| Target wave | `W4` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/community/CommunitiesView.tsx` |

Current stand-in for Registration. Target Registration is server-authoritative with FIFO by monotonic server sequence (GINV-REG-002/003), so this cannot remain client-merged.

## whatsapp list drafts

| Field | Current state |
| --- | --- |
| Sources | `OperationalSyncPayload`, `STORAGE_KEYS` |
| Payload key | `drafts` |
| Local storage key | `whatsAppListDrafts` |
| Cloud table / RPC | `whatsapp_list_drafts` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/operationalCloudService.ts`<br>`hooks/useWhatsAppListTemplates.ts` |
| Legacy readers | `hooks/useWhatsAppListTemplates.ts`<br>`logic/whatsappList.ts` |
| Current authority | Split local/cloud. |
| Current merge | Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt. |
| Lifecycle fields | `createdAt`<br>`updatedAt`<br>`cloudId`<br>`syncStatus`<br>`deletedAt` |
| FK / delete | whatsapp_list_drafts -> communities(id) cascade. |
| Target owner | `N2.10-notifications` |
| Target wave | `W12` |
| Migration class | `MOVE_TO_INDEXEDDB` |
| Remaining surfaces | `logic/whatsappList.ts` |

N2.22 classifies structured drafts as IndexedDB candidates.

## community players

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `community_players` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/communityPlayerCloudService.ts` |
| Legacy readers | `application/communityPlayerSearchUseCases.ts`<br>`hooks/useCommunities.ts` |
| Current authority | Cloud table, reconciled from the merged local payload during syncNow. |
| Current merge | Orphan relations deleted during upload only when the payload represents merged state. |
| Lifecycle fields | `created_at`<br>`updated_at` |
| FK / delete | community_players -> communities(id) cascade, players(id) cascade. |
| Target owner | `N2.03-communities` |
| Target wave | `W2` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/community/AthleteUsernameSearch.tsx` |

CommunityPlayer is the sports relation and must stay independent from CommunityMembership governance (GINV-ID-003). A deprecated role column exists from migration 20260726190000.

## community membership and join state

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `community_members`<br>`rpc:set_community_member_role`<br>`rpc:remove_community_member`<br>`rpc:approve_join_request`<br>`rpc:reject_join_request`<br>`rpc:request_to_join_community`<br>`rpc:generate_join_code`<br>`rpc:leave_community`<br>`rpc:add_community_member_by_identifier` |
| Legacy writers | `infra/supabase/membershipCloudService.ts` |
| Legacy readers | `hooks/useCommunityMembers.ts`<br>`application/communityMembersViewModel.ts`<br>`domain/communityPermissions.ts` |
| Current authority | Server-authoritative already: mutations go through SECURITY DEFINER RPCs, never direct table writes. |
| Current merge | None. Not part of the generic sync payload. |
| Lifecycle fields | `status`<br>`role`<br>`created_at`<br>`updated_at` |
| FK / delete | community_members -> communities(id) cascade, profiles(id) cascade and set null. |
| Target owner | `N2.03-communities` |
| Target wave | `W2` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/community/CommunityMembersPanel.tsx` |

Closest current surface to the target model: already RPC-mediated. JoinRequest is not Membership (GINV-COM-002) and Organizer is operational, not governance (GINV-CAP-001).

## player evaluations

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `player_evaluations` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/playerEvaluationCloudService.ts` |
| Legacy readers | `logic/playerEvaluations.ts`<br>`logic/rating.ts` |
| Current authority | Cloud table with RLS restricted to owner/admin roles. |
| Current merge | Latest evaluation per evaluator selected by updatedAt in logic/playerEvaluations.ts. |
| Lifecycle fields | `created_at`<br>`updated_at` |
| FK / delete | player_evaluations -> players(id) cascade, communities(id) cascade. |
| Target owner | `N2.02-player-skill-profile-ownership` |
| Target wave | `W5` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/player/PlayerEditView.tsx` |

Feeds the Community then Global skill profile. Aggregation must stay per attribute and missing must never read as zero (GINV-RATING-001/002).

## self evaluations

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `self_evaluations` |
| Legacy writers | `infra/supabase/syncService.ts`<br>`infra/supabase/selfEvaluationCloudService.ts` |
| Legacy readers | `logic/playerEvaluations.ts` |
| Current authority | Cloud table. |
| Current merge | None beyond per-player replacement. |
| Lifecycle fields | `created_at`<br>`updated_at` |
| FK / delete | self_evaluations -> players(id) cascade. |
| Target owner | `N2.02-player-skill-profile-ownership` |
| Target wave | `W5` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/player/PlayerEditView.tsx` |

## career events and totals

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `career_events`<br>`career_totals` |
| Legacy writers | `database triggers (20260727110000_career_events_generation.sql)` |
| Legacy readers | `infra/supabase/careerCloudService.ts`<br>`hooks/usePlayerCareer.ts` |
| Current authority | Server-derived by trigger from session/game facts. |
| Current merge | None. Recalculated on claim. |
| Lifecycle fields | `created_at` |
| FK / delete | career_events -> players(id) cascade, communities(id) cascade, sessions(id) cascade. |
| Target owner | `N2.09-history-statistics` |
| Target wave | `W9` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/player/FutCardModal.tsx` |

Already a derived projection, but must declare an explicit rebuild contract to qualify as rebuildable (GINV-REL-003). Legacy rating/overall fields must not be imported into factual statistics.

## player avatars and proposals

| Field | Current state |
| --- | --- |
| Sources | `CloudServiceOnly` |
| Payload key | — |
| Local storage key | — |
| Cloud table / RPC | `player_avatar_proposals`<br>`rpc:propose_player_avatar`<br>`rpc:approve_player_avatar`<br>`rpc:reject_player_avatar` |
| Legacy writers | `infra/supabase/avatarStorageService.ts` |
| Legacy readers | `components/player/PlayerEditView.tsx` |
| Current authority | Server-authoritative through approval RPCs plus Storage bucket policy. |
| Current merge | None. |
| Lifecycle fields | `status`<br>`created_at` |
| FK / delete | player_avatar_proposals -> players(id) cascade. |
| Target owner | `N2.11-media` |
| Target wave | `W11` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/player/FutCard.tsx` |

Target requires MediaAsset identity rather than a URL, and raw upload stays private/untrusted until server processing reaches READY (GINV-MEDIA-001/002).

## active session pointer

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `activeSession` |
| Cloud table / RPC | — |
| Legacy writers | `hooks/useSessions.ts` |
| Legacy readers | `hooks/useSessions.ts`<br>`logic/migrations.ts` |
| Current authority | Local device only. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.04-sessions` |
| Target wave | `W12` |
| Migration class | `MOVE_TO_INDEXEDDB` |
| Remaining surfaces | `app/AppShell.tsx` |

## session draft

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `sessionDraft` |
| Cloud table / RPC | — |
| Legacy writers | `logic/sessionDraft.ts` |
| Legacy readers | `logic/sessionDraft.ts`<br>`logic/migrations.ts` |
| Current authority | Local device only. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.04-sessions` |
| Target wave | `W12` |
| Migration class | `MOVE_TO_INDEXEDDB` |
| Remaining surfaces | `hooks/useSessionWizard.ts` |

N2.22 classifies structured drafts as IndexedDB candidates.

## best divisions cache

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `bestDivisions` |
| Cloud table / RPC | — |
| Legacy writers | — |
| Legacy readers | `logic/migrations.ts` |
| Current authority | Local device only; no live writer remains. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.06-team-formation` |
| Target wave | `W14` |
| Migration class | `RETIRE` |
| Remaining surfaces | — |

Read only by the migration importer; no production writer. N2.22 lists legacy best-division mirrors as RETIRE. Removal candidate with zero live readers.

## selected division index

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `selectedDivisionIndex` |
| Cloud table / RPC | — |
| Legacy writers | — |
| Legacy readers | — |
| Current authority | None. Key is declared but unreferenced. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.06-team-formation` |
| Target wave | `W14` |
| Migration class | `RETIRE` |
| Remaining surfaces | — |

Dead key: no reader or writer anywhere in src, including the migration importer. Only the clearLocalDomainCache sweep touches it. Strongest W14 removal candidate.

## last selected player ids

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `lastSelectedPlayerIds` |
| Cloud table / RPC | — |
| Legacy writers | `app/AppShell.tsx`<br>`hooks/useSessionWizard.ts` |
| Legacy readers | `hooks/useSessionWizard.ts`<br>`logic/migrations.ts` |
| Current authority | Local device only. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.04-sessions` |
| Target wave | `W12` |
| Migration class | `MOVE_TO_INDEXEDDB` |
| Remaining surfaces | `components/session/SessionWizard.tsx` |

An ID array used as convenience state; must not become canonical roster authority (GINV-DATA-003).

## last session config

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `lastSessionConfig` |
| Cloud table / RPC | — |
| Legacy writers | `app/AppShell.tsx` |
| Legacy readers | `logic/migrations.ts` |
| Current authority | Local device only. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.04-sessions` |
| Target wave | `W12` |
| Migration class | `MOVE_TO_INDEXEDDB` |
| Remaining surfaces | `components/session/SessionWizard.tsx` |

## championship requests

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `championshipRequests` |
| Cloud table / RPC | — |
| Legacy writers | `hooks/useChampionships.ts` |
| Legacy readers | `hooks/useChampionships.ts` |
| Current authority | Local device only; never synced. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.08-competitions` |
| Target wave | `W8` |
| Migration class | `MIGRATE_TO_TARGET_MODEL` |
| Remaining surfaces | `components/championship/ChampionshipDetailView.tsx` |

Governance-adjacent state held only on one device. Governance is online-authoritative in the target (ADR-OFF-004), so this cannot stay local.

## sync issue ledger

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `syncIssueLedger` |
| Cloud table / RPC | — |
| Legacy writers | `logic/syncIssueLedger.ts` |
| Legacy readers | `logic/syncIssueLedger.ts` |
| Current authority | Local device only. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.22-migration-strangler` |
| Target wave | `W13` |
| Migration class | `RETIRE` |
| Remaining surfaces | `app/AppShell.tsx` |

Diagnostic surface for the generic sync it reports on; retires with syncService.

## active community id

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `activeCommunityId` |
| Cloud table / RPC | — |
| Legacy writers | `app/AppShell.tsx` |
| Legacy readers | `app/AppShell.tsx` |
| Current authority | Local device only; UI selection. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.03-communities` |
| Target wave | `W12` |
| Migration class | `REMAIN_LOCALSTORAGE` |
| Remaining surfaces | `app/AppShell.tsx` |

A selection pointer, not authority. GINV-AUTH-003 means it can never be treated as proof of access to that community.

## dismissed hints

| Field | Current state |
| --- | --- |
| Sources | `STORAGE_KEYS` |
| Payload key | — |
| Local storage key | `dismissedHints` |
| Cloud table / RPC | — |
| Legacy writers | `components/live/HighlightFab.tsx` |
| Legacy readers | `components/live/HighlightFab.tsx` |
| Current authority | Local device only; UI preference. |
| Current merge | None. |
| Lifecycle fields | — |
| FK / delete | n/a |
| Target owner | `N2.01-product-experience` |
| Target wave | `W12` |
| Migration class | `REMAIN_LOCALSTORAGE` |
| Remaining surfaces | `components/live/HighlightFab.tsx` |

N2.22 names dismissed hints explicitly as legitimate small localStorage.
