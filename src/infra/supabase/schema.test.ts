import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readFixture(path: URL): string {
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
}

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260610161203_backend_operational_sync.sql',
    import.meta.url,
  ),
  'utf8',
);

const playerEvaluationsMigration = readFileSync(
  new URL('../../../supabase/migrations/20260624133200_player_evaluations.sql', import.meta.url),
  'utf8',
);

const avatarApprovalMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260624133117_player_avatars_approval.sql',
    import.meta.url,
  ),
  'utf8',
);

const baseSchema = readFileSync(
  new URL('../../../supabase/migrations/schema.sql', import.meta.url),
  'utf8',
);

const profileSignupFixMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260625182618_fix_profile_signup_role.sql',
    import.meta.url,
  ),
  'utf8',
);

const linkedPlayerSelfReadMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260629212554_linked_player_self_read.sql',
    import.meta.url,
  ),
  'utf8',
);

const roleManagementMigration = readFileSync(
  new URL('../../../supabase/migrations/20260624141708_role_management_rpc.sql', import.meta.url),
  'utf8',
);

const hardenedTriggerFunctionsMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260624134502_harden_trigger_functions.sql',
    import.meta.url,
  ),
  'utf8',
);

const rbacHardeningMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260624133529_rbac_global_roles_and_hardening.sql',
    import.meta.url,
  ),
  'utf8',
);

const communityMemberRoleRpcMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260707143343_community_member_role_remove_rpc.sql',
    import.meta.url,
  ),
);

const accountIdentityMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260722162234_account_identity_foundation.sql',
    import.meta.url,
  ),
);

const playerClaimCodesMigration = readFixture(
  new URL('../../../supabase/migrations/20260723230000_player_claim_codes.sql', import.meta.url),
);

const removePlayerLinkProposalSystemMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260724000000_remove_player_link_proposal_system.sql',
    import.meta.url,
  ),
);

const evaluationCommunityAuthorizationMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260724150000_evaluation_community_authorization.sql',
    import.meta.url,
  ),
);

const championshipSchedulingMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260725120000_championship_scheduling.sql',
    import.meta.url,
  ),
);

const championshipIntegrityMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726120000_championship_integrity.sql',
    import.meta.url,
  ),
);

const globalRoleCapabilitiesMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726090000_global_role_capabilities.sql',
    import.meta.url,
  ),
);

const communityRoleCapabilitiesMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726100000_community_role_capabilities.sql',
    import.meta.url,
  ),
);

const dropLegacyCommunitiesUpdatePolicyMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726160000_drop_legacy_communities_update_policy.sql',
    import.meta.url,
  ),
);

const mandatoryMfaAal2EnforcementMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726110000_mandatory_mfa_and_aal2_enforcement.sql',
    import.meta.url,
  ),
);

const communityProfilePrivacyMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726170000_community_profile_privacy.sql',
    import.meta.url,
  ),
);

const careerEventsMigration = readFixture(
  new URL('../../../supabase/migrations/20260727100000_career_events.sql', import.meta.url),
);

const careerGenerationMigration = readFixture(
  new URL('../../../supabase/migrations/20260727110000_career_events_generation.sql', import.meta.url),
);

const careerTotalsMigration = readFixture(
  new URL('../../../supabase/migrations/20260727120000_career_totals.sql', import.meta.url),
);

const careerMilestonesMigration = readFixture(
  new URL('../../../supabase/migrations/20260727150000_career_milestones.sql', import.meta.url),
);

const communityProfileSummaryReadonlyMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726200000_lock_community_profile_summary_readonly.sql',
    import.meta.url,
  ),
);

const profileVisibilityStatusMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260726210000_profile_visibility_status_rules.sql',
    import.meta.url,
  ),
);

const functionSecurityHardeningMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260610195250_harden_function_security.sql',
    import.meta.url,
  ),
);

const communityJoinSystemMigration = readFixture(
  new URL('../../../supabase/migrations/20260624204113_community_join_system.sql', import.meta.url),
);

const communityDiscoveryMigration = readFixture(
  new URL('../../../supabase/migrations/20260625192530_community_discovery.sql', import.meta.url),
);

const communityModelV2Migration = readFixture(
  new URL('../../../supabase/migrations/20260624203424_community_model_v2.sql', import.meta.url),
);

const globalAthleteIdentityMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260610161256_global_athlete_identity.sql',
    import.meta.url,
  ),
);

const communityPlayersOptimizationMigration = readFixture(
  new URL(
    '../../../supabase/migrations/20260617180615_community_players_optimization.sql',
    import.meta.url,
  ),
);

const membershipCloudServiceSource = readFileSync(
  new URL('./membershipCloudService.ts', import.meta.url),
  'utf8',
);

const requiredTables = [
  'community_members',
  'sessions',
  'teams',
  'games',
  'point_events',
  'game_reports',
  'session_reports',
  'community_presence',
  'whatsapp_list_drafts',
];

function extractSqlFunction(sql: string, functionName: string): string {
  return (
    sql.match(
      new RegExp(`create or replace function public\\.${functionName}\\([\\s\\S]*?\\$\\$;`, 'i'),
    )?.[0] ?? ''
  );
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function assertPlayerSoftDeleteUserUnlinkContract(sql: string, artifact: string): void {
  const guardFunction = sql.match(
    /create or replace function public\.guard_player_user_id\(\)[\s\S]*?\$\$;/i,
  )?.[0];
  const unlinkFunction = sql.match(
    /create or replace function public\.handle_player_soft_delete_user_unlink\(\)[\s\S]*?\$\$;/i,
  )?.[0];
  const guardTrigger = sql.match(
    /create trigger trg_guard_player_user_id\s+before update on public\.players\s+for each row execute function public\.guard_player_user_id\(\);/i,
  )?.[0];
  const unlinkTrigger = sql.match(
    /create trigger trg_player_soft_delete_user_unlink\s+before update on public\.players\s+for each row execute function public\.handle_player_soft_delete_user_unlink\(\);/i,
  )?.[0];

  assert.ok(guardFunction, `${artifact}: missing players.user_id guard function`);
  assert.match(guardFunction, /set search_path = public/i);
  assert.match(guardFunction, /new\.user_id is distinct from old\.user_id/i);
  assert.match(
    guardFunction,
    /current_setting\('app\.allow_user_link_promotion', true\)[\s\S]*<> 'on'/i,
  );
  assert.match(
    guardFunction,
    /and not \(\s*new\.deleted_at is not null\s+and old\.deleted_at is null\s+and new\.user_id is null\s*\) then/i,
  );
  assert.doesNotMatch(
    guardFunction,
    /and not \(\s*new\.deleted_at is not null\s+and old\.deleted_at is null\s*\) then/i,
  );
  assert.match(guardFunction, /raise exception 'user_id can only be changed/i);
  assert.match(guardFunction, /errcode = '42501'/i);

  assert.ok(unlinkFunction, `${artifact}: missing soft-delete user unlink function`);
  assert.match(unlinkFunction, /set search_path = public/i);
  assert.match(
    unlinkFunction,
    /if new\.deleted_at is not null and old\.deleted_at is null then\s+new\.user_id := null;/i,
  );

  assert.ok(guardTrigger, `${artifact}: missing players.user_id guard trigger`);
  assert.ok(unlinkTrigger, `${artifact}: missing soft-delete user unlink trigger`);
  assert.ok(
    sql.indexOf(guardTrigger) < sql.indexOf(unlinkTrigger),
    `${artifact}: guard trigger must be defined before unlink trigger`,
  );
  assert.ok(
    'trg_guard_player_user_id'.localeCompare('trg_player_soft_delete_user_unlink') < 0,
    `${artifact}: trigger names do not fire guard before unlink`,
  );

  assert.match(
    sql,
    /revoke execute on function public\.guard_player_user_id\(\) from public, anon, authenticated;/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.handle_player_soft_delete_user_unlink\(\) from public, anon, authenticated;/i,
  );
}

test('backend migration creates required operational tables', () => {
  for (const table of requiredTables) {
    assert.match(
      migration,
      new RegExp(`create table if not exists public\\.${table}\\b`, 'i'),
      `missing table ${table}`,
    );
  }
});

test('backend migration enables RLS and authenticated Data API grants', () => {
  for (const table of requiredTables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      `missing RLS for ${table}`,
    );
  }

  assert.match(
    migration,
    /grant select, insert, update, delete on[\s\S]*public\.sessions[\s\S]*to authenticated;/i,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on[\s\S]*public\.communities[\s\S]*to authenticated;/i,
  );
});

test('backend migration includes membership RLS helpers and policies', () => {
  assert.match(migration, /create or replace function public\.current_user_has_community_role/i);
  assert.match(migration, /create or replace function public\.add_community_member_by_email/i);
  assert.match(migration, /create policy "Community members can read memberships"/i);
  assert.match(migration, /create policy "Community owners and admins can update memberships"/i);
  assert.match(migration, /prevent_last_community_owner_change/i);
});

test('backend migration defines critical local id and lookup indexes', () => {
  for (const table of [
    'sessions',
    'teams',
    'games',
    'point_events',
    'game_reports',
    'session_reports',
    'community_presence',
    'whatsapp_list_drafts',
  ]) {
    assert.match(
      migration,
      new RegExp(`unique index if not exists ${table}_owner_local_id_idx`, 'i'),
      `missing local id index for ${table}`,
    );
    assert.match(
      migration,
      new RegExp(
        `index if not exists ${table}_(community_id|session_id|updated_at|deleted_at)_idx`,
        'i',
      ),
      `missing lookup index for ${table}`,
    );
  }
});

test('consolidated schema backfills the operational tables from the initial sync migration', () => {
  for (const table of requiredTables.filter((table) => table !== 'community_members')) {
    assert.match(
      baseSchema,
      new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, 'i'),
      `consolidated schema is missing ${table}`,
    );
    assert.match(
      baseSchema,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      `consolidated schema is missing RLS for ${table}`,
    );
    assert.match(
      baseSchema,
      new RegExp(
        `unique index if not exists ${table}_owner_local_id_idx on public\\.${table} \\(owner_id, local_id\\);`,
        'i',
      ),
      `consolidated schema is missing the local id upsert index for ${table}`,
    );
  }

  assert.match(
    baseSchema,
    /grant select, insert, update, delete on[\s\S]*public\.sessions[\s\S]*to authenticated;/i,
  );

  const sessionsPosition = baseSchema.indexOf('create table if not exists public.sessions (');
  for (const table of ['teams', 'games', 'point_events', 'game_reports', 'session_reports']) {
    const tablePosition = baseSchema.indexOf(`create table if not exists public.${table} (`);
    assert.ok(tablePosition > sessionsPosition, `${table} must be declared after sessions`);
  }

  // point_events picked up point taxonomy and facilitator-assist columns from later migrations.
  assert.match(baseSchema, /point_type text,\s*skill text,\s*fault text,\s*player_team_id text,/i);
  assert.match(baseSchema, /event_kind text not null default 'point',\s*assist_player_id text/i);

  // games briefly gained dedicated multiset columns, then had them dropped again in favor of
  // storing sets/setTargets inside the existing metadata jsonb column.
  assert.doesNotMatch(
    baseSchema,
    /create table(?: if not exists)? public\.games\s*\([\s\S]*?\bsets jsonb/i,
  );
  assert.doesNotMatch(baseSchema, /alter table public\.games\s+add column if not exists sets/i);
});

test('player evaluations migration defines per-organizer athlete evaluations', () => {
  assert.match(
    playerEvaluationsMigration,
    /create table if not exists public\.player_evaluations/i,
  );
  assert.match(playerEvaluationsMigration, /player_evaluations_owner_player_idx/i);
  assert.match(
    playerEvaluationsMigration,
    /alter table public\.player_evaluations enable row level security/i,
  );
  assert.match(
    playerEvaluationsMigration,
    /grant select, insert, update, delete on public\.player_evaluations to authenticated/i,
  );
  assert.match(playerEvaluationsMigration, /current_user_can_access_player\(player_id\)/i);
});

test('avatar candidate update policy includes WITH CHECK for Storage upserts', () => {
  const updatePolicy = avatarApprovalMigration.match(
    /create policy "Player admins can replace avatar candidates" on storage\.objects[\s\S]*?;\s*/i,
  )?.[0];

  assert.ok(updatePolicy, 'missing avatar candidate update policy');
  assert.match(updatePolicy, /for update to authenticated/i);

  const usingClause = updatePolicy.match(/using\s*\(([\s\S]*?)\)\s*with check/i)?.[1];
  const withCheckClause = updatePolicy.match(/with check\s*\(([\s\S]*?)\);/i)?.[1];

  assert.ok(usingClause, 'missing avatar candidate update USING clause');
  assert.ok(withCheckClause, 'missing avatar candidate update WITH CHECK clause');

  for (const clause of [usingClause, withCheckClause]) {
    assert.match(clause, /bucket_id\s*=\s*'avatars'/i);
    assert.match(clause, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*'proposals'/i);
    assert.match(clause, /public\.current_user_is_player_admin/i);
    assert.match(clause, /\(\(storage\.foldername\(name\)\)\[2\]\)::uuid/i);
  }
});

test('profile signup trigger creates a valid default RBAC user role', () => {
  assert.match(
    baseSchema,
    /role text not null check \(role in \('master', 'programmer', 'user'\)\) default 'user'/i,
  );
  assert.match(
    baseSchema,
    /create or replace function public\.handle_new_user\(\)[\s\S]*new\.email,\s*'user'/i,
  );
  assert.doesNotMatch(
    baseSchema,
    /create or replace function public\.handle_new_user\(\)[\s\S]*new\.email,\s*'organizer'/i,
  );

  assert.match(
    profileSignupFixMigration,
    /create or replace function public\.handle_new_user\(\)/i,
  );
  assert.match(profileSignupFixMigration, /new\.email,\s*'user'/i);
  assert.match(
    profileSignupFixMigration,
    /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated;/i,
  );
});

test('linked player self-read policy supports fresh browser account checks', () => {
  assert.match(
    linkedPlayerSelfReadMigration,
    /create policy "Linked users can read their own player"/i,
  );
  assert.match(linkedPlayerSelfReadMigration, /for select\s+to authenticated/i);
  assert.match(linkedPlayerSelfReadMigration, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(linkedPlayerSelfReadMigration, /and deleted_at is null/i);

  assert.match(baseSchema, /create policy "Linked users can read their own player"/i);
});

test('community member role RPC migration hardens role changes and removals', () => {
  assert.match(
    communityMemberRoleRpcMigration,
    /create or replace function public\.set_community_member_role\(\s*p_member_id uuid,\s*p_role text\s*\)/i,
  );
  assert.match(
    communityMemberRoleRpcMigration,
    /create or replace function public\.remove_community_member\(\s*p_member_id uuid\s*\)/i,
  );

  for (const functionName of ['set_community_member_role', 'remove_community_member']) {
    assert.match(
      communityMemberRoleRpcMigration,
      new RegExp(
        `create or replace function public\\.${functionName}[\\s\\S]*?security definer[\\s\\S]*?set search_path = public`,
        'i',
      ),
      `missing security definer/search_path for ${functionName}`,
    );
    assert.match(
      communityMemberRoleRpcMigration,
      new RegExp(
        `revoke execute on function public\\.${functionName}\\([^)]*\\) from public, anon;`,
        'i',
      ),
      `missing public/anon revoke for ${functionName}`,
    );
    assert.match(
      communityMemberRoleRpcMigration,
      new RegExp(
        `grant execute on function public\\.${functionName}\\([^)]*\\) to authenticated;`,
        'i',
      ),
      `missing authenticated grant for ${functionName}`,
    );
  }

  assert.match(communityMemberRoleRpcMigration, /public\.is_superadmin\(\)/i);
  assert.match(communityMemberRoleRpcMigration, /current_user_has_community_role/i);
  assert.match(
    communityMemberRoleRpcMigration,
    /p_role not in \('admin', 'moderator', 'member'\)/i,
  );
  assert.doesNotMatch(communityMemberRoleRpcMigration, /p_role not in \([^)]*'organizer'/i);
  assert.match(communityMemberRoleRpcMigration, /target_member\.role = 'owner'/i);
});

test('membership cloud service uses RPCs for sensitive member role mutations', () => {
  assert.match(membershipCloudServiceSource, /rpc\('set_community_member_role'/i);
  assert.match(membershipCloudServiceSource, /rpc\('remove_community_member'/i);
  assert.doesNotMatch(
    membershipCloudServiceSource,
    /\.from\('community_members'\)\s*[\s\S]{0,160}\.update\(/i,
  );
  assert.doesNotMatch(
    membershipCloudServiceSource,
    /\.from\('community_members'\)\s*[\s\S]{0,160}\.delete\(/i,
  );
});

test('account claim keeps canonical identity and records an immutable alias', () => {
  for (const dependency of ['player_evaluations', 'player_avatar_proposals']) {
    assert.match(
      baseSchema,
      new RegExp(`create table(?: if not exists)? public\\.${dependency}`, 'i'),
      `consolidated schema is missing ${dependency}`,
    );
  }
  assert.doesNotMatch(
    baseSchema,
    /create table public\.player_link_proposals/i,
    'consolidated schema must no longer define player_link_proposals',
  );

  assert.match(
    accountIdentityMigration,
    /create table if not exists public\.player_identity_claims/i,
  );
  assert.match(
    accountIdentityMigration,
    /create table if not exists public\.player_identity_aliases/i,
  );
  assert.match(accountIdentityMigration, /unique\s*\(legacy_player_id\)/i);
  assert.match(accountIdentityMigration, /unique\s*\(idempotency_key\)/i);
  assert.match(accountIdentityMigration, /canonical_player_id[\s\S]*legacy_player_id/i);
  assert.match(accountIdentityMigration, /jsonb_build_object\([\s\S]*canonical_player_id/i);

  const mergeFunction = accountIdentityMigration.match(
    /create or replace function public\.merge_player_identity_claim\([\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(mergeFunction, 'missing internal claim merge helper');
  assert.match(mergeFunction, /security definer[\s\S]*set search_path = public/i);
  assert.match(mergeFunction, /auth\.uid\(\)[\s\S]*p_reviewer/i);
  assert.match(mergeFunction, /idempotency_key[\s\S]*v_proposal\.id/i);
  assert.doesNotMatch(mergeFunction, /raw_user_meta_data|user_metadata|auth\.jwt/i);
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.merge_player_identity_claim\(uuid, uuid\) from public, anon, authenticated;/i,
  );
  assert.doesNotMatch(
    accountIdentityMigration,
    /grant execute on function public\.merge_player_identity_claim/i,
  );
});

test('approved legacy links merge into the existing account player', () => {
  assert.match(
    accountIdentityMigration,
    /create or replace function public\.merge_player_identity_claim/i,
  );
  assert.match(accountIdentityMigration, /where user_id = v_user_id[\s\S]*for update/i);
  assert.doesNotMatch(
    accountIdentityMigration,
    /update public\.players\s+set user_id = v_user_id\s+where id = v_legacy_player_id/i,
  );
  assert.match(accountIdentityMigration, /insert into public\.player_identity_aliases/i);
  assert.match(
    accountIdentityMigration,
    /set username = null,\s*user_id = null,[\s\S]*deleted_at = coalesce\(deleted_at, now\(\)\)/i,
  );
  assert.match(
    accountIdentityMigration,
    /perform set_config\('app\.allow_user_link_promotion', 'on', true\);/i,
  );
  assert.match(
    accountIdentityMigration,
    /drop function if exists public\.approve_player_link\(uuid\)[\s\S]*create or replace function public\.approve_player_link\([\s\S]*returns jsonb/i,
  );
  assert.match(
    accountIdentityMigration,
    /create or replace function public\.propose_player_link\([\s\S]*returns uuid[\s\S]*merge_player_identity_claim/i,
  );
});

test('claim migrates relational references before archiving the legacy player', () => {
  for (const relation of ['community_players', 'player_evaluations', 'player_avatar_proposals']) {
    assert.match(
      accountIdentityMigration,
      new RegExp(`public\\.${relation}[\\s\\S]*canonical`, 'i'),
      `missing explicit ${relation} merge policy`,
    );
  }

  assert.match(
    accountIdentityMigration,
    /on conflict \(community_id, player_id\)[\s\S]*do update/i,
  );
  assert.match(
    accountIdentityMigration,
    /deleted_at = case\s+when canonical\.status <> 'banned'\s+and excluded\.status <> 'banned'[\s\S]*then null/i,
  );
  assert.match(
    accountIdentityMigration,
    /player_evaluations[\s\S]*updated_at[\s\S]*id[\s\S]*player_id = v_canonical_player_id/i,
  );
  assert.match(
    accountIdentityMigration,
    /row_number\(\) over[\s\S]*player_avatar_proposals[\s\S]*status = 'superseded'/i,
  );
  assert.match(accountIdentityMigration, /status = 'superseded'[\s\S]*player_link_proposals/i);

  const mergeFunction = accountIdentityMigration.match(
    /create or replace function public\.merge_player_identity_claim\([\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(mergeFunction, 'missing internal claim merge helper');

  const archivePosition = mergeFunction.indexOf('set username = null');
  assert.ok(archivePosition >= 0, 'missing legacy player archive');
  for (const relation of [
    'insert into public.community_players',
    'delete from public.player_evaluations',
    'update public.player_avatar_proposals',
  ]) {
    const mergePosition = mergeFunction.indexOf(relation);
    assert.ok(mergePosition >= 0, `missing ${relation}`);
    assert.ok(mergePosition < archivePosition, `${relation} must happen before legacy archive`);
  }
});

test('claim rejects linked or archived legacy players before merge', () => {
  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  const proposeFunction = extractSqlFunction(accountIdentityMigration, 'propose_player_link');

  for (const [name, sql] of [
    ['merge helper', mergeFunction],
    ['propose RPC', proposeFunction],
  ] as const) {
    assert.ok(sql, `missing ${name}`);
    assert.match(
      sql,
      /user_id is not null[\s\S]*deleted_at is not null[\s\S]*raise exception 'Player already claimed' using errcode = '23505'/i,
      `${name} does not reject a linked or archived legacy player`,
    );
  }

  const legacyConflictPosition = mergeFunction.indexOf('v_legacy.user_id is not null');
  const firstMergePosition = mergeFunction.indexOf('update public.players as canonical');
  assert.ok(legacyConflictPosition >= 0 && legacyConflictPosition < firstMergePosition);
});

test('claim idempotency returns a completed result before mutable player state', () => {
  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  const proposalLockPosition = mergeFunction.indexOf('where id = p_proposal_id\n   for update');
  const completedClaimPosition = mergeFunction.indexOf(
    'from public.player_identity_claims\n   where proposal_id = v_proposal.id',
  );
  const completedReturnPosition = mergeFunction.indexOf('return v_existing_claim.result');
  const legacyLockPosition = mergeFunction.indexOf('into v_legacy');
  const canonicalLockPosition = mergeFunction.indexOf('into v_canonical');

  assert.ok(proposalLockPosition >= 0, 'proposal is not locked');
  assert.ok(completedClaimPosition > proposalLockPosition, 'claim read precedes proposal lock');
  assert.ok(completedReturnPosition > completedClaimPosition, 'completed claim is not returned');
  assert.ok(completedReturnPosition < legacyLockPosition, 'retry depends on legacy player state');
  assert.ok(
    completedReturnPosition < canonicalLockPosition,
    'retry depends on canonical player state',
  );

  const proposeFunction = extractSqlFunction(accountIdentityMigration, 'propose_player_link');
  const recoveredProposalPosition = proposeFunction.indexOf('claim.proposal_id');
  const recoveredResultPosition = proposeFunction.indexOf('claim.result');
  const activePlayerPosition = proposeFunction.indexOf('from public.players');
  assert.ok(recoveredProposalPosition >= 0, 'propose does not recover completed proposal id');
  assert.ok(recoveredResultPosition >= 0, 'propose does not read the completed result');
  assert.ok(recoveredProposalPosition < activePlayerPosition);
  assert.ok(recoveredResultPosition < activePlayerPosition);
});

test('claim entrypoints serialize consistently and prefer winner conflicts', () => {
  for (const functionName of ['merge_player_identity_claim', 'propose_player_link']) {
    const sql = extractSqlFunction(accountIdentityMigration, functionName);
    assert.ok(sql, `missing ${functionName}`);
    assert.match(sql, /hashtextextended\('player:'[\s\S]*hashtextextended\('user:'/i);
    assert.match(
      sql,
      /pg_advisory_xact_lock\(least\([^)]+\)\)[\s\S]*pg_advisory_xact_lock\(greatest\([^)]+\)\)/i,
    );
  }

  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  const mergeWinnerPosition = mergeFunction.indexOf('from public.player_identity_aliases');
  const mergeStatusPosition = mergeFunction.indexOf("v_proposal.status <> 'pending'");
  assert.ok(mergeWinnerPosition >= 0 && mergeWinnerPosition < mergeStatusPosition);
  assert.match(
    mergeFunction,
    /from public\.player_identity_claims[\s\S]*legacy_player_id = v_legacy_player_id\s+or user_id = v_user_id/i,
  );

  const approveFunction = extractSqlFunction(accountIdentityMigration, 'approve_player_link');
  assert.match(approveFunction, /v_uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(
    approveFunction,
    /return public\.merge_player_identity_claim\(p_proposal_id, v_uid\)/i,
  );
  assert.doesNotMatch(approveFunction, /pg_advisory_xact_lock|for update|from public\.players/i);

  const proposeFunction = extractSqlFunction(accountIdentityMigration, 'propose_player_link');
  assert.match(
    proposeFunction,
    /from public\.player_identity_claims[\s\S]*legacy_player_id = p_player_id\s+or user_id = v_uid/i,
  );
});

test('aliased players cannot be reactivated by stale direct uploads', () => {
  const guard = extractSqlFunction(accountIdentityMigration, 'guard_aliased_player_reactivation');
  assert.ok(guard, 'missing aliased-player reactivation guard');
  assert.match(guard, /security definer[\s\S]*set search_path = public/i);
  assert.match(guard, /player_identity_aliases[\s\S]*legacy_player_id = old\.id/i);
  assert.match(guard, /new\.active[\s\S]*new\.deleted_at is null/i);
  assert.match(guard, /raise exception 'Aliased player cannot be reactivated'/i);
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.guard_aliased_player_reactivation\(\) from public, anon, authenticated;/i,
  );
  assert.match(
    accountIdentityMigration,
    /create trigger trg_guard_aliased_player_reactivation\s+before update on public\.players\s+for each row execute function public\.guard_aliased_player_reactivation\(\);/i,
  );
  assert.equal(
    extractSqlFunction(baseSchema, 'guard_aliased_player_reactivation'),
    '',
    'guard_aliased_player_reactivation must be dropped from the consolidated schema',
  );
});

test('consolidated schema guards profile roles while preserving role RPC', () => {
  const expectedGuard = extractSqlFunction(roleManagementMigration, 'guard_profile_role');
  const actualGuard = extractSqlFunction(baseSchema, 'guard_profile_role');
  assert.ok(actualGuard, 'missing consolidated profile role guard');
  assert.equal(normalizeSql(actualGuard), normalizeSql(expectedGuard));

  const guardPosition = baseSchema.indexOf(
    'create or replace function public.guard_profile_role()',
  );
  const revokePosition = baseSchema.indexOf(
    'revoke execute on function public.guard_profile_role() from public, anon, authenticated;',
  );
  const triggerPosition = baseSchema.indexOf('create trigger trg_guard_profile_role');
  assert.ok(guardPosition >= 0 && guardPosition < revokePosition);
  assert.ok(revokePosition < triggerPosition);
  assert.match(
    baseSchema,
    /create trigger trg_guard_profile_role\s+before update on public\.profiles\s+for each row execute function public\.guard_profile_role\(\);/i,
  );

  const actualRpc = extractSqlFunction(baseSchema, 'set_user_role');
  assert.ok(actualRpc, 'missing legitimate set_user_role RPC');
  // The consolidated schema's set_user_role has since diverged from the original
  // role-management migration: production now requires AAL2 (mandatory MFA
  // hardening), so this is no longer a literal-equality comparison against that
  // migration — only the core role-change logic is asserted to still be present.
  // (Production's error messages were always plain ASCII; only this repo's migration
  // file and schema.sql carried accented text before finding 4 fixed that.)
  assert.match(actualRpc, /perform public\.require_aal2\(\);/i);
  assert.match(actualRpc, /if not public\.is_superadmin\(\) then/i);
  assert.match(actualRpc, /new_role not in \('master', 'programmer', 'user'\)/i);
  assert.match(
    actualRpc,
    /\(select count\(\*\) from public\.profiles where role = 'master'\) <= 1/i,
  );
  assert.match(actualRpc, /perform set_config\('app\.allow_role_change', 'on', true\)/i);
  assert.match(
    baseSchema,
    /revoke execute on function public\.set_user_role\(uuid, text\) from public, anon;[\s\S]*grant execute on function public\.set_user_role\(uuid, text\) to authenticated;/i,
  );
});

test('claim never promotes avatar implicitly and consolidated schema guards avatar', () => {
  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  assert.doesNotMatch(mergeFunction, /avatar_url\s*=/i);

  const expectedGuard = extractSqlFunction(hardenedTriggerFunctionsMigration, 'guard_avatar_url');
  const actualGuard = extractSqlFunction(baseSchema, 'guard_avatar_url');
  assert.ok(actualGuard, 'missing consolidated avatar guard');
  assert.equal(normalizeSql(actualGuard), normalizeSql(expectedGuard));
  assert.match(
    baseSchema,
    /revoke execute on function public\.guard_avatar_url\(\) from public, anon, authenticated;/i,
  );
  assert.match(
    baseSchema,
    /create trigger trg_guard_avatar_url\s+before update on public\.players\s+for each row execute function public\.guard_avatar_url\(\);/i,
  );
});

test('claim requires a ready canonical account', () => {
  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  assert.match(
    mergeFunction,
    /v_canonical\.username is null[\s\S]*v_canonical\.username <> public\.normalize_account_username\(v_canonical\.username\)[\s\S]*not public\.is_valid_account_username\(v_canonical\.username\)/i,
  );
  assert.match(
    mergeFunction,
    /raise exception 'Canonical account is not ready for player claim' using errcode = '22023'/i,
  );
  const readinessPosition = mergeFunction.indexOf('v_canonical.username is null');
  const childLockPosition = mergeFunction.indexOf('from public.community_players');
  assert.ok(readinessPosition >= 0 && readinessPosition < childLockPosition);
});

test('canonical account identity cannot be unlinked or reclaimed', () => {
  assert.match(
    accountIdentityMigration,
    /add column if not exists has_account_identity_history boolean not null default false/i,
  );
  const markerBackfillPosition = accountIdentityMigration.indexOf(
    'set has_account_identity_history = true',
  );
  const duplicateUnlinkPosition = accountIdentityMigration.indexOf('with ranked_player_links as');
  assert.ok(markerBackfillPosition >= 0 && markerBackfillPosition < duplicateUnlinkPosition);
  assert.match(
    accountIdentityMigration,
    /has_account_identity_history = true[\s\S]*user_id is not null[\s\S]*status = 'approved'/i,
  );
  assert.match(
    accountIdentityMigration,
    /check \(user_id is null or has_account_identity_history\)/i,
  );

  const identityGuard = extractSqlFunction(
    accountIdentityMigration,
    'guard_player_account_identity_history',
  );
  assert.match(identityGuard, /old\.has_account_identity_history/i);
  assert.match(identityGuard, /new\.user_id is distinct from old\.user_id/i);
  assert.match(identityGuard, /new\.deleted_at is not null/i);
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.guard_player_account_identity_history\(\) from public, anon, authenticated/i,
  );
  assert.equal(
    normalizeSql(identityGuard),
    normalizeSql(extractSqlFunction(baseSchema, 'guard_player_account_identity_history')),
  );
  for (const artifact of [accountIdentityMigration, baseSchema]) {
    assert.match(
      artifact,
      /create trigger trg_guard_player_account_identity_history\s+before update on public\.players\s+for each row execute function public\.guard_player_account_identity_history\(\);/i,
    );
    assert.ok(
      artifact.indexOf('create trigger trg_guard_player_account_identity_history') <
        artifact.indexOf('create trigger trg_player_soft_delete_user_unlink'),
    );
  }

  const unlinkFunction = extractSqlFunction(accountIdentityMigration, 'unlink_player_user');
  assert.match(unlinkFunction, /security definer[\s\S]*set search_path = public/i);
  assert.match(unlinkFunction, /v_uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(
    unlinkFunction,
    /raise exception 'Canonical account identity is immutable; unlink is unsupported'\s+using errcode = '0A000'/i,
  );
  assert.doesNotMatch(unlinkFunction, /current_user_is_player_admin/i);
  assert.doesNotMatch(unlinkFunction, /from public\.players|update public\.players|set_config/i);
  assert.equal(
    normalizeSql(unlinkFunction),
    normalizeSql(extractSqlFunction(baseSchema, 'unlink_player_user')),
  );
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.unlink_player_user\(uuid\) from public, anon;[\s\S]*grant execute on function public\.unlink_player_user\(uuid\) to authenticated;/i,
  );

  for (const functionName of ['merge_player_identity_claim', 'propose_player_link']) {
    const sql = extractSqlFunction(accountIdentityMigration, functionName);
    assert.match(sql, /v_legacy\.has_account_identity_history/i, functionName);
    assert.match(
      sql,
      /has_account_identity_history[\s\S]*raise exception 'Player already claimed' using errcode = '23505'/i,
      functionName,
    );
  }

  const proposeFunction = extractSqlFunction(accountIdentityMigration, 'propose_player_link');
  assert.ok(
    proposeFunction.indexOf('v_legacy.has_account_identity_history') <
      proposeFunction.indexOf('insert into public.player_link_proposals'),
  );
});

test('reject and cancel serialize with claim and only transition pending proposals', () => {
  for (const functionName of ['reject_player_link', 'cancel_my_link_proposal']) {
    const sql = extractSqlFunction(accountIdentityMigration, functionName);
    assert.ok(sql, `missing ${functionName}`);
    assert.match(sql, /security definer[\s\S]*set search_path = public/i);
    assert.match(sql, /v_uid uuid := \(select auth\.uid\(\)\)/i);
    assert.match(sql, /hashtextextended\('player:'[\s\S]*hashtextextended\('user:'/i);
    assert.match(
      sql,
      /pg_advisory_xact_lock\(least\([^)]+\)\)[\s\S]*pg_advisory_xact_lock\(greatest\([^)]+\)\)/i,
    );

    const proposalLockPosition = sql.indexOf('where id = p_proposal_id\n   for update');
    const revalidationPosition = sql.indexOf('Proposal changed while transition was starting');
    const pendingCheckPosition = sql.indexOf("v_proposal.status <> 'pending'");
    const conditionalUpdatePosition = sql.lastIndexOf("and status = 'pending'");
    assert.ok(proposalLockPosition >= 0);
    assert.ok(revalidationPosition > proposalLockPosition);
    assert.ok(pendingCheckPosition > revalidationPosition);
    assert.ok(conditionalUpdatePosition > pendingCheckPosition);
    assert.match(sql, /if not found then[\s\S]*Proposal no longer pending/i);
    assert.equal(
      extractSqlFunction(baseSchema, functionName),
      '',
      `${functionName} must be dropped from the consolidated schema`,
    );
    assert.match(
      accountIdentityMigration,
      new RegExp(
        `revoke execute on function public\\.${functionName}\\(uuid\\) from public, anon;[\\s\\S]*grant execute on function public\\.${functionName}\\(uuid\\) to authenticated;`,
        'i',
      ),
    );
  }
});

test('all claim reference writers reject archived or aliased players', () => {
  const guard = extractSqlFunction(accountIdentityMigration, 'guard_active_player_reference');
  assert.match(guard, /language plpgsql\s+security definer\s+set search_path = public/i);
  assert.match(guard, /from public\.players[\s\S]*where id = new\.player_id[\s\S]*for update/i);
  assert.match(
    guard,
    /from public\.player_identity_aliases[\s\S]*legacy_player_id = new\.player_id/i,
  );
  assert.match(guard, /v_deleted_at is not null or v_has_alias/i);
  assert.match(
    guard,
    /raise exception 'Player reference must target an active canonical player'\s+using errcode = '23503'/i,
  );
  assert.doesNotMatch(guard, /avatar_url|allow_avatar/i);
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.guard_active_player_reference\(\)\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    accountIdentityMigration,
    /grant execute on function public\.guard_active_player_reference\(\)/i,
  );

  for (const relation of [
    'community_players',
    'player_evaluations',
    'player_avatar_proposals',
    'player_link_proposals',
  ]) {
    assert.match(
      accountIdentityMigration,
      new RegExp(
        `create trigger trg_guard_active_player_reference[\\s\\S]*before insert or update on public\\.${relation}[\\s\\S]*guard_active_player_reference\\(\\);`,
        'i',
      ),
      relation,
    );
  }

  const mergeFunction = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  const aliasPosition = mergeFunction.indexOf('insert into public.player_identity_aliases');
  const archivePosition = mergeFunction.indexOf('set username = null');
  for (const relationMutation of [
    'insert into public.community_players',
    'update public.player_evaluations',
    'update public.player_avatar_proposals',
    'update public.player_link_proposals',
  ]) {
    const mutationPosition = mergeFunction.indexOf(relationMutation);
    assert.ok(mutationPosition >= 0 && mutationPosition < aliasPosition);
  }
  assert.ok(aliasPosition >= 0 && aliasPosition < archivePosition);
});

test('consolidated schema guard_active_player_reference drops the alias check and link proposal exemption', () => {
  const guard = extractSqlFunction(baseSchema, 'guard_active_player_reference');
  assert.match(guard, /language plpgsql\s+security definer\s+set search_path = public/i);
  assert.match(guard, /from public\.players[\s\S]*where id = new\.player_id[\s\S]*for update/i);
  assert.match(
    guard,
    /raise exception 'Player reference must target an active canonical player'\s+using errcode = '23503'/i,
  );
  assert.doesNotMatch(guard, /player_identity_aliases|v_has_alias/i);
  assert.doesNotMatch(guard, /tg_table_name = 'player_link_proposals'/i);
  assert.match(
    baseSchema,
    /revoke execute on function public\.guard_active_player_reference\(\)\s+from public, anon, authenticated/i,
  );

  for (const relation of ['community_players', 'player_evaluations', 'player_avatar_proposals']) {
    assert.match(
      baseSchema,
      new RegExp(
        `create trigger trg_guard_active_player_reference[\\s\\S]*before insert or update on public\\.${relation}[\\s\\S]*guard_active_player_reference\\(\\);`,
        'i',
      ),
      relation,
    );
  }
  assert.doesNotMatch(
    baseSchema,
    /before insert or update on public\.player_link_proposals/i,
    'consolidated schema must no longer trigger guard_active_player_reference on player_link_proposals',
  );
});

test('link proposal guard narrowly permits workflow updates after deterministic cleanup', () => {
  const guard = extractSqlFunction(accountIdentityMigration, 'guard_active_player_reference');
  const workflowBypass = guard.match(
    /if tg_table_name = 'player_link_proposals'[\s\S]*?return new;[\s\S]*?end if;/i,
  )?.[0];
  assert.ok(workflowBypass, 'missing link proposal workflow bypass');
  assert.match(workflowBypass, /tg_op = 'UPDATE'/i);
  assert.match(workflowBypass, /new\.player_id is not distinct from old\.player_id/i);
  assert.match(workflowBypass, /old\.status = 'pending'/i);
  assert.match(workflowBypass, /new\.status in \('approved', 'rejected', 'superseded'\)/i);
  assert.match(
    workflowBypass,
    /to_jsonb\(new\) - array\['status', 'reviewed_by', 'reviewed_at', 'updated_at'\]/i,
  );
  assert.match(
    workflowBypass,
    /to_jsonb\(old\) - array\['status', 'reviewed_by', 'reviewed_at', 'updated_at'\]/i,
  );
  assert.doesNotMatch(workflowBypass, /user_id|created_at|\bid\b/i);

  const requiredOldStatus = workflowBypass.match(/old\.status = '([^']+)'/i)?.[1];
  const allowedNewStatuses = workflowBypass
    .match(/new\.status in \(([^)]+)\)/i)?.[1]
    .split(',')
    .map((status) => status.trim().replaceAll("'", ''));
  assert.ok(requiredOldStatus && allowedNewStatuses);
  const bypassesTransition = (oldStatus: string, newStatus: string) =>
    oldStatus === requiredOldStatus && allowedNewStatuses.includes(newStatus);
  assert.equal(bypassesTransition('pending', 'approved'), true);
  assert.equal(bypassesTransition('pending', 'rejected'), true);
  assert.equal(bypassesTransition('pending', 'superseded'), true);
  assert.equal(bypassesTransition('pending', 'pending'), false);
  assert.equal(bypassesTransition('approved', 'pending'), false);
  assert.equal(bypassesTransition('approved', 'rejected'), false);
  assert.equal(bypassesTransition('rejected', 'superseded'), false);

  const cleanup = accountIdentityMigration.match(
    /update public\.player_link_proposals as proposal\s+set status = 'superseded'[\s\S]*?;/i,
  )?.[0];
  assert.ok(cleanup, 'missing invalid pending proposal cleanup');
  assert.match(cleanup, /proposal\.status = 'pending'/i);
  assert.match(cleanup, /player\.deleted_at is not null/i);
  assert.match(
    cleanup,
    /public\.player_identity_aliases[\s\S]*legacy_player_id = proposal\.player_id/i,
  );
  assert.match(cleanup, /set status = 'superseded'\s+where/i);

  const cleanupPosition = accountIdentityMigration.indexOf(cleanup);
  const guardPosition = accountIdentityMigration.indexOf(
    'create or replace function public.guard_active_player_reference()',
  );
  const proposalTriggerPosition = accountIdentityMigration.indexOf(
    'create trigger trg_guard_active_player_reference',
    guardPosition,
  );
  assert.ok(cleanupPosition >= 0 && cleanupPosition < guardPosition);
  assert.ok(guardPosition >= 0 && guardPosition < proposalTriggerPosition);

  const merge = extractSqlFunction(accountIdentityMigration, 'merge_player_identity_claim');
  const approve = extractSqlFunction(accountIdentityMigration, 'approve_player_link');
  assert.match(merge, /set status = 'approved',[\s\S]*reviewed_by[\s\S]*reviewed_at/i);
  assert.match(merge, /set status = 'superseded',[\s\S]*reviewed_by[\s\S]*reviewed_at/i);
  assert.match(approve, /return public\.merge_player_identity_claim/i);
  for (const functionName of ['reject_player_link', 'cancel_my_link_proposal']) {
    assert.match(
      extractSqlFunction(accountIdentityMigration, functionName),
      /set status = 'rejected',[\s\S]*reviewed_by[\s\S]*reviewed_at/i,
    );
  }
});

test('consolidated schema drops the link proposal workflow bypass and cleanup', () => {
  const guard = extractSqlFunction(baseSchema, 'guard_active_player_reference');
  assert.doesNotMatch(guard, /tg_table_name = 'player_link_proposals'/i);
  assert.doesNotMatch(
    baseSchema,
    /update public\.player_link_proposals as proposal\s+set status = 'superseded'/i,
  );
});

test('canonical account players cannot be deleted while pure legacy players can', () => {
  for (const artifact of [accountIdentityMigration, baseSchema]) {
    const guard = extractSqlFunction(artifact, 'guard_player_account_identity_delete');
    assert.match(guard, /language plpgsql\s+security definer\s+set search_path = public/i);
    assert.match(guard, /if old\.has_account_identity_history then/i);
    assert.match(
      guard,
      /raise exception 'Canonical account identity cannot be deleted'\s+using errcode = '42501'/i,
    );
    assert.match(guard, /return old;/i);
    assert.match(
      artifact,
      /revoke execute on function public\.guard_player_account_identity_delete\(\)\s+from public, anon, authenticated/i,
    );
    assert.doesNotMatch(
      artifact,
      /grant execute on function public\.guard_player_account_identity_delete\(\)/i,
    );
    assert.match(
      artifact,
      /create trigger trg_guard_player_account_identity_delete\s+before delete on public\.players\s+for each row execute function public\.guard_player_account_identity_delete\(\);/i,
    );

    const policy = artifact.match(
      /create policy "Users can delete owned legacy players"\s+on public\.players[\s\S]*?;/i,
    )?.[0];
    assert.ok(policy, 'missing legacy-only player DELETE policy');
    assert.match(policy, /for delete\s+to authenticated/i);
    assert.match(policy, /owner_id = \(select auth\.uid\(\)\)/i);
    assert.match(policy, /not has_account_identity_history/i);
  }
});

test('account identity migration preserves app staff link proposal read policy', () => {
  assert.match(
    rbacHardeningMigration,
    /create policy "App staff can read link proposals"\s+on public\.player_link_proposals[\s\S]*for select to authenticated using \(public\.is_app_staff\(\)\)/i,
  );
});

test('consolidated schema defines surviving guards exactly once', () => {
  const definitions = [
    /create or replace function public\.guard_profile_role\(\)/gi,
    /create or replace function public\.guard_avatar_url\(\)/gi,
  ];

  for (const definition of definitions) {
    assert.equal(baseSchema.match(definition)?.length, 1, definition.source);
  }
});

test('consolidated schema removes the player link proposal system', () => {
  for (const table of [
    'player_link_proposals',
    'player_identity_claims',
    'player_identity_aliases',
  ]) {
    assert.doesNotMatch(
      baseSchema,
      new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, 'i'),
      table,
    );
  }
  for (const functionName of [
    'propose_player_link',
    'approve_player_link',
    'reject_player_link',
    'cancel_my_link_proposal',
    'merge_player_identity_claim',
    'guard_aliased_player_reactivation',
  ]) {
    assert.doesNotMatch(
      baseSchema,
      new RegExp(`create or replace function public\\.${functionName}\\(`, 'i'),
      functionName,
    );
  }
  assert.doesNotMatch(baseSchema, /create policy "App staff can read link proposals"/i);
});

test('account identity migration creates one canonical player per account', () => {
  assert.match(
    accountIdentityMigration,
    /drop index if exists public\.players_user_id_active_unique_idx/i,
  );

  const userIdIndex = accountIdentityMigration.match(
    /create unique index if not exists players_user_id_unique_idx[\s\S]*?;/i,
  )?.[0];

  assert.ok(userIdIndex, 'missing global players.user_id unique index');
  assert.match(userIdIndex, /on public\.players \(user_id\)/i);
  assert.match(userIdIndex, /where user_id is not null/i);
  assert.doesNotMatch(userIdIndex, /deleted_at/i);
  assert.match(
    accountIdentityMigration,
    /row_number\(\) over\s*\(\s*partition by user_id\s*order by \(deleted_at is null\) desc, created_at, id\s*\)/i,
  );
  assert.match(accountIdentityMigration, /set user_id = null/i);

  const userIdConflictTargets =
    accountIdentityMigration.match(/on conflict \(user_id\)[^\n]*/gi) ?? [];
  assert.ok(userIdConflictTargets.length >= 2, 'missing canonical player conflict targets');
  for (const conflictTarget of userIdConflictTargets) {
    assert.match(conflictTarget, /where user_id is not null/i);
    assert.doesNotMatch(conflictTarget, /deleted_at/i);
  }

  assert.match(
    accountIdentityMigration,
    /create or replace function public\.ensure_account_ready/i,
  );
  assert.match(accountIdentityMigration, /insert into public\.players/i);
  assert.match(accountIdentityMigration, /lower\(username\)/i);
});

test('account usernames use the exact format and a validated table invariant', () => {
  const exactUsernamePattern = "'^[a-z0-9][a-z0-9_-]{2,29}$'";

  assert.ok(accountIdentityMigration.includes(exactUsernamePattern));
  assert.doesNotMatch(accountIdentityMigration, /\{1,28\}\[a-z0-9\]/i);
  assert.match(
    accountIdentityMigration,
    /add constraint players_username_account_format_check[\s\S]*check \(\s*username is null\s*or \(\s*username = lower\(username\)[\s\S]*username ~ '\^\[a-z0-9\]\[a-z0-9_-\]\{2,29\}\$'[\s\S]*\)\s*\) not valid/i,
  );
  const validationPosition = accountIdentityMigration.indexOf(
    'validate constraint players_username_account_format_check',
  );
  assert.ok(validationPosition >= 0, 'missing username constraint validation');
});

test('username remediation clears trim collisions before normalizing winners', () => {
  const clearPhase = accountIdentityMigration.match(
    /-- Username remediation phase 1: clear invalid values and normalized duplicates\.[\s\S]*?;/i,
  )?.[0];
  const normalizePhase = accountIdentityMigration.match(
    /-- Username remediation phase 2: normalize only the surviving winners\.[\s\S]*?;/i,
  )?.[0];

  assert.ok(clearPhase, 'missing collision-safe username clear phase');
  assert.match(
    clearPhase,
    /partition by public\.normalize_account_username\(username\)[\s\S]*order by created_at, id/i,
  );
  assert.match(clearPhase, /set username = null/i);
  assert.match(clearPhase, /normalized_username !~ '\^\[a-z0-9\]\[a-z0-9_-\]\{2,29\}\$'/i);
  assert.match(clearPhase, /username_rank > 1/i);
  assert.doesNotMatch(clearPhase, /set username = [a-z]+\.normalized_username/i);

  assert.ok(normalizePhase, 'missing winner-only username normalization phase');
  assert.match(normalizePhase, /set username = w\.normalized_username/i);
  assert.match(normalizePhase, /where username is not null/i);
  assert.match(normalizePhase, /username is distinct from w\.normalized_username/i);

  const indexPosition = accountIdentityMigration.indexOf('players_username_lower_idx');
  const clearPosition = accountIdentityMigration.indexOf('-- Username remediation phase 1');
  const normalizePosition = accountIdentityMigration.indexOf('-- Username remediation phase 2');
  const validationPosition = accountIdentityMigration.indexOf(
    'validate constraint players_username_account_format_check',
  );

  assert.ok(
    indexPosition >= 0 && indexPosition < clearPosition,
    'case-insensitive index not active',
  );
  assert.ok(clearPosition < normalizePosition, 'winner normalized before duplicate is cleared');
  assert.ok(normalizePosition < validationPosition, 'constraint validated before both phases');
  assert.doesNotMatch(
    accountIdentityMigration.slice(indexPosition, normalizePosition),
    /drop index[^;]*players_username_lower_idx/i,
  );
});

test('player insert policy blocks attacker-owned rows linked to a victim account', () => {
  assert.match(
    accountIdentityMigration,
    /drop policy if exists "Users can insert owned players" on public\.players/i,
  );

  const insertPolicy = accountIdentityMigration.match(
    /create policy "Users can insert unlinked owned players" on public\.players[\s\S]*?;/i,
  )?.[0];

  assert.ok(insertPolicy, 'missing hardened players INSERT policy');
  assert.match(insertPolicy, /for insert\s+to authenticated/i);
  assert.match(insertPolicy, /owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(insertPolicy, /and user_id is null/i);
});

test('account bootstrap RPC is authenticated, hardened and idempotent', () => {
  assert.match(accountIdentityMigration, /security definer[\s\S]*set search_path = public/i);
  assert.match(accountIdentityMigration, /v_uid uuid := \(select auth\.uid\(\)\)/i);
  assert.match(accountIdentityMigration, /state text[\s\S]*needs_username[\s\S]*ready/i);
  assert.match(
    accountIdentityMigration,
    /if v_player\.username is null[\s\S]*or v_player\.username <> public\.normalize_account_username\(v_player\.username\)[\s\S]*or not public\.is_valid_account_username\(v_player\.username\)[\s\S]*then[\s\S]*'needs_username'/i,
  );
  assert.match(
    accountIdentityMigration,
    /revoke execute on function public\.ensure_account_ready\(text\) from public, anon/i,
  );
  assert.match(
    accountIdentityMigration,
    /grant execute on function public\.ensure_account_ready\(text\) to authenticated/i,
  );
});

test('new auth users receive both profile and canonical player rows', () => {
  const signupTrigger = accountIdentityMigration.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?revoke execute on function public\.handle_new_user\(\)/i,
  )?.[0];

  assert.ok(signupTrigger, 'missing auth signup trigger function');
  assert.match(signupTrigger, /insert into public\.profiles/i);
  assert.match(signupTrigger, /insert into public\.players/i);
  assert.match(signupTrigger, /values \(new\.id, new\.id, v_name, null, true\)/i);
  assert.match(signupTrigger, /new\.raw_user_meta_data->>'username'/i);
  assert.match(
    signupTrigger,
    /begin[\s\S]*update public\.players[\s\S]*set username = v_username[\s\S]*exception\s+when unique_violation then\s+null;[\s\S]*end;/i,
  );
  assert.doesNotMatch(signupTrigger, /not exists \(select 1 from public\.players/i);
});

test('account identity migration composes a narrow guard with soft-delete unlink', () => {
  assertPlayerSoftDeleteUserUnlinkContract(accountIdentityMigration, 'account identity migration');
});

test('consolidated schema mirrors hardened account identity invariants', () => {
  assert.match(
    baseSchema,
    /create unique index if not exists players_user_id_unique_idx[\s\S]*where user_id is not null;/i,
  );
  assert.doesNotMatch(baseSchema, /players_user_id_unique_idx[\s\S]{0,120}deleted_at/i);
  assert.ok(baseSchema.includes("username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'"));
  assert.match(baseSchema, /constraint players_username_account_format_check/i);
  assert.match(
    baseSchema,
    /create policy "Users can insert unlinked owned players"[\s\S]*owner_id = \(select auth\.uid\(\)\)[\s\S]*and user_id is null/i,
  );
  assert.match(
    baseSchema,
    /values \(new\.id, new\.id, v_name, null, true\)[\s\S]*when unique_violation then\s+null;/i,
  );
});

test('consolidated schema composes a narrow guard with soft-delete unlink', () => {
  assertPlayerSoftDeleteUserUnlinkContract(baseSchema, 'consolidated schema');
});

test('player claim codes table exists with owner/staff-only read access', () => {
  assert.match(playerClaimCodesMigration, /create table if not exists public\.player_claim_codes/i);
  assert.match(playerClaimCodesMigration, /player_id uuid primary key/i);
  assert.match(playerClaimCodesMigration, /code text not null unique/i);
  assert.match(
    playerClaimCodesMigration,
    /alter table public\.player_claim_codes enable row level security/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /p\.owner_id = \(select auth\.uid\(\)\)[\s\S]*or public\.is_app_staff\(\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /revoke all on table public\.player_claim_codes from public, anon, authenticated/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /grant select on public\.player_claim_codes to authenticated/i,
  );
});

test('claim code generation trigger only fires for accountless players', () => {
  assert.match(
    playerClaimCodesMigration,
    /create or replace function public\.generate_player_claim_code/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /if new\.user_id is not null then\s*return new;\s*end if;/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /create trigger trg_generate_player_claim_code\s*after insert on public\.players/i,
  );
});

test('handle_new_user claims a matching code before creating a fresh player', () => {
  assert.match(playerClaimCodesMigration, /create or replace function public\.handle_new_user/i);
  assert.match(
    playerClaimCodesMigration,
    /v_claim_code text := upper\(trim\(new\.raw_user_meta_data->>'claim_code'\)\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /select player_id into v_claimed_player_id\s*from public\.player_claim_codes/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /perform set_config\('app\.allow_user_link_promotion', 'on', true\)/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /delete from public\.player_claim_codes where player_id = v_claimed_player_id/i,
  );
  assert.match(
    playerClaimCodesMigration,
    /if v_claimed_player_id is null then\s*insert into public\.players/i,
  );
});

test('consolidated schema mirrors the claim code table and updated handle_new_user', () => {
  assert.match(baseSchema, /create table if not exists public\.player_claim_codes/i);
  assert.match(baseSchema, /create or replace function public\.generate_player_claim_code/i);
  assert.match(
    baseSchema,
    /v_claim_code text := upper\(trim\(new\.raw_user_meta_data->>'claim_code'\)\)/i,
  );
});

test('remove player link proposal system migration drops the obsolete objects', () => {
  for (const statement of [
    'drop function if exists public.cancel_my_link_proposal(uuid);',
    'drop function if exists public.reject_player_link(uuid);',
    'drop function if exists public.approve_player_link(uuid);',
    'drop function if exists public.propose_player_link(uuid);',
    'drop function if exists public.merge_player_identity_claim(uuid, uuid);',
    'drop trigger if exists trg_guard_aliased_player_reactivation on public.players;',
    'drop function if exists public.guard_aliased_player_reactivation();',
    'drop table if exists public.player_link_proposals cascade;',
    'drop table if exists public.player_identity_aliases cascade;',
    'drop table if exists public.player_identity_claims cascade;',
  ]) {
    assert.ok(
      removePlayerLinkProposalSystemMigration.includes(statement),
      `missing statement: ${statement}`,
    );
  }

  const guard = extractSqlFunction(
    removePlayerLinkProposalSystemMigration,
    'guard_active_player_reference',
  );
  assert.ok(guard, 'missing rewritten guard_active_player_reference');
  assert.match(guard, /language plpgsql\s+security definer\s+set search_path = public/i);
  assert.match(guard, /from public\.players[\s\S]*where id = new\.player_id[\s\S]*for update/i);
  assert.match(
    guard,
    /raise exception 'Player reference must target an active canonical player'\s+using errcode = '23503'/i,
  );
  assert.doesNotMatch(guard, /player_identity_aliases|v_has_alias/i);
  assert.doesNotMatch(guard, /tg_table_name = 'player_link_proposals'/i);
  assert.match(
    removePlayerLinkProposalSystemMigration,
    /revoke execute on function public\.guard_active_player_reference\(\)\s+from public, anon, authenticated;/i,
  );
});

test('evaluation community authorization migration scopes player evaluation writes to community owner/admin', () => {
  assert.match(
    evaluationCommunityAuthorizationMigration,
    /alter table public\.player_evaluations\s+add column community_id uuid references public\.communities\(id\) on delete cascade;/i,
  );
  assert.match(
    evaluationCommunityAuthorizationMigration,
    /alter table public\.player_evaluations\s+alter column community_id set not null;/i,
  );

  assert.match(
    evaluationCommunityAuthorizationMigration,
    /drop policy if exists "Organizers can insert own player evaluations" on public\.player_evaluations;/i,
  );
  const insertPolicy = evaluationCommunityAuthorizationMigration.match(
    /create policy "Community owner or admin can insert player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(insertPolicy, 'missing rewritten insert policy');
  assert.match(insertPolicy, /for insert to authenticated/i);
  assert.match(insertPolicy, /owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(
    insertPolicy,
    /current_user_has_community_role\(community_id, array\['owner', 'admin'\]\)/i,
  );

  assert.match(
    evaluationCommunityAuthorizationMigration,
    /drop policy if exists "Organizers can update own player evaluations" on public\.player_evaluations;/i,
  );
  const updatePolicy = evaluationCommunityAuthorizationMigration.match(
    /create policy "Community owner or admin can update player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(updatePolicy, 'missing rewritten update policy');
  assert.match(updatePolicy, /for update to authenticated/i);
  assert.match(updatePolicy, /using \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(
    updatePolicy,
    /current_user_has_community_role\(community_id, array\['owner', 'admin'\]\)/i,
  );

  assert.match(
    evaluationCommunityAuthorizationMigration,
    /drop policy if exists "Organizers can delete own player evaluations" on public\.player_evaluations;/i,
  );
  const deletePolicy = evaluationCommunityAuthorizationMigration.match(
    /create policy "Community owner or admin can delete player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(deletePolicy, 'missing rewritten delete policy');
  assert.match(deletePolicy, /for delete to authenticated/i);
  assert.match(deletePolicy, /using \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(deletePolicy, /current_user_has_community_role/i);

  assert.doesNotMatch(
    evaluationCommunityAuthorizationMigration,
    /drop policy if exists "Community members can read player evaluations"/i,
    'read policy must be left unchanged',
  );
});

test('evaluation community authorization migration creates a player-scoped self_evaluations table', () => {
  assert.match(
    evaluationCommunityAuthorizationMigration,
    /create table public\.self_evaluations \(\s*player_id uuid primary key references public\.players\(id\) on delete cascade,\s*attributes jsonb not null default '\{\}'::jsonb,\s*updated_at timestamptz not null default now\(\)\s*\);/i,
  );
  assert.match(
    evaluationCommunityAuthorizationMigration,
    /alter table public\.self_evaluations enable row level security;/i,
  );

  for (const policy of [
    'Players can read their own self-evaluation',
    'Players can upsert their own self-evaluation',
    'Players can update their own self-evaluation',
  ]) {
    const policyBlock = evaluationCommunityAuthorizationMigration.match(
      new RegExp(`create policy "${policy}"[\\s\\S]*?;`, 'i'),
    )?.[0];
    assert.ok(policyBlock, `missing policy: ${policy}`);
    assert.match(policyBlock, /on public\.self_evaluations/i);
    assert.match(
      policyBlock,
      /from public\.players p\s*where p\.id = self_evaluations\.player_id\s*and p\.user_id = \(select auth\.uid\(\)\)/i,
    );
  }

  assert.doesNotMatch(
    evaluationCommunityAuthorizationMigration,
    /Players can delete their own self-evaluation/i,
    'self_evaluations is an upsert-only record, matching profiles (no delete policy)',
  );

  assert.match(
    evaluationCommunityAuthorizationMigration,
    /revoke all on table public\.self_evaluations from public, anon;/i,
  );
  assert.match(
    evaluationCommunityAuthorizationMigration,
    /grant select, insert, update on public\.self_evaluations to authenticated;/i,
  );
  assert.doesNotMatch(
    evaluationCommunityAuthorizationMigration,
    /grant select, insert, update, delete on public\.self_evaluations/i,
  );
});

test('consolidated schema mirrors community-authorized evaluation writes and self_evaluations', () => {
  assert.match(
    baseSchema,
    /create table public\.player_evaluations \(\s*id uuid primary key default gen_random_uuid\(\),\s*owner_id uuid not null references auth\.users\(id\) on delete cascade,\s*player_id uuid not null references public\.players\(id\) on delete cascade,\s*community_id uuid not null references public\.communities\(id\) on delete cascade,/i,
  );

  assert.doesNotMatch(
    baseSchema,
    /create policy "Organizers can insert own player evaluations"/i,
    'consolidated schema must no longer define the pre-authorization insert policy',
  );
  assert.doesNotMatch(baseSchema, /create policy "Organizers can update own player evaluations"/i);
  assert.doesNotMatch(baseSchema, /create policy "Organizers can delete own player evaluations"/i);

  const insertPolicy = baseSchema.match(
    /create policy "Community owner or admin can insert player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(insertPolicy, 'missing consolidated insert policy');
  assert.match(
    insertPolicy,
    /current_user_has_community_role\(community_id, array\['owner', 'admin'\]\)/i,
  );

  const updatePolicy = baseSchema.match(
    /create policy "Community owner or admin can update player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(updatePolicy, 'missing consolidated update policy');
  assert.match(
    updatePolicy,
    /current_user_has_community_role\(community_id, array\['owner', 'admin'\]\)/i,
  );

  const deletePolicy = baseSchema.match(
    /create policy "Community owner or admin can delete player evaluations"[\s\S]*?;/i,
  )?.[0];
  assert.ok(deletePolicy, 'missing consolidated delete policy');
  assert.match(deletePolicy, /using \(owner_id = \(select auth\.uid\(\)\)\)/i);

  assert.match(
    baseSchema,
    /create policy "Community members can read player evaluations" on public\.player_evaluations/i,
  );

  assert.match(baseSchema, /create or replace function public\.current_user_has_community_role/i);
  assert.match(
    baseSchema,
    /grant execute on function public\.current_user_has_community_role\(uuid, text\[\]\) to authenticated;/i,
  );

  assert.match(baseSchema, /create table public\.self_evaluations \(/i);
  assert.match(baseSchema, /alter table public\.self_evaluations enable row level security;/i);
  for (const policy of [
    'Players can read their own self-evaluation',
    'Players can upsert their own self-evaluation',
    'Players can update their own self-evaluation',
  ]) {
    assert.match(baseSchema, new RegExp(`create policy "${policy}"`, 'i'));
  }
  assert.match(baseSchema, /revoke all on table public\.self_evaluations from public, anon;/i);
  assert.match(
    baseSchema,
    /grant select, insert, update on public\.self_evaluations to authenticated;/i,
  );
});

test('championship scheduling migration creates championships, championship_teams, and championship_rounds', () => {
  assert.match(championshipSchedulingMigration, /create table public\.championships \(/i);
  assert.match(championshipSchedulingMigration, /create table public\.championship_teams \(/i);
  assert.match(championshipSchedulingMigration, /create table public\.championship_rounds \(/i);

  assert.match(championshipSchedulingMigration, /unique \(championship_id, round\)/i);

  for (const table of ['championships', 'championship_teams', 'championship_rounds']) {
    assert.match(
      championshipSchedulingMigration,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `missing RLS for ${table}`,
    );
    assert.match(
      championshipSchedulingMigration,
      new RegExp(`revoke all on table public\\.${table} from public, anon;`, 'i'),
      `missing revoke for ${table}`,
    );
    assert.match(
      championshipSchedulingMigration,
      new RegExp(
        `grant select, insert, update, delete on public\\.${table} to authenticated;`,
        'i',
      ),
      `missing grant for ${table}`,
    );
  }

  for (const policyName of [
    'Community owner or admin can insert championships',
    'Community owner or admin can update championships',
    'Community owner or admin can delete championships',
    'Community owner or admin can insert championship teams',
    'Community owner or admin can update championship teams',
    'Community owner or admin can delete championship teams',
    'Community owner or admin can insert championship rounds',
    'Community owner or admin can update championship rounds',
    'Community owner or admin can delete championship rounds',
  ]) {
    const policyBlock = championshipSchedulingMigration.match(
      new RegExp(`create policy "${policyName}"[\\s\\S]*?;`, 'i'),
    )?.[0];
    assert.ok(policyBlock, `missing policy: ${policyName}`);
    assert.match(
      policyBlock,
      /current_user_has_community_role\((?:c\.)?community_id, array\['owner', 'admin'\]\)/i,
      `policy "${policyName}" must check owner/admin community role`,
    );
  }

  for (const policyName of [
    'Community members can read championships',
    'Community members can read championship teams',
    'Community members can read championship rounds',
  ]) {
    assert.match(
      championshipSchedulingMigration,
      new RegExp(`create policy "${policyName}"`, 'i'),
      `missing read policy: ${policyName}`,
    );
  }
});

test('consolidated schema includes championship scheduling tables with RLS enabled', () => {
  for (const table of ['championships', 'championship_teams', 'championship_rounds']) {
    assert.match(
      baseSchema,
      new RegExp(`create table public\\.${table} \\(`, 'i'),
      `missing consolidated table ${table}`,
    );
    assert.match(
      baseSchema,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `missing consolidated RLS for ${table}`,
    );
  }
});

test('championship integrity migration preserves every fixture and the season team bridge', () => {
  assert.match(
    championshipIntegrityMigration,
    /drop constraint if exists championship_rounds_championship_id_round_key/i,
  );
  assert.match(championshipIntegrityMigration, /unique \(championship_id, local_id\)/i);
  assert.match(
    championshipIntegrityMigration,
    /add column if not exists championship_team_id uuid/i,
  );
  assert.match(championshipIntegrityMigration, /validate_championship_round_scope/i);
});

test('global role capabilities migration seeds master/programmer capabilities and defines has_capability', () => {
  assert.match(
    globalRoleCapabilitiesMigration,
    /create table public\.global_role_capabilities \(/i,
  );
  assert.match(
    globalRoleCapabilitiesMigration,
    /role text not null check \(role in \('master', 'programmer', 'user'\)\)/i,
  );
  assert.match(globalRoleCapabilitiesMigration, /primary key \(role, capability\)/i);

  const insertBlock = globalRoleCapabilitiesMigration.match(
    /insert into public\.global_role_capabilities \(role, capability\) values[\s\S]*?on conflict do nothing;/i,
  )?.[0];
  assert.ok(insertBlock, 'missing capability seed block');
  assert.match(insertBlock, /\('master', 'manage_community_ownership'\)/i);
  assert.match(insertBlock, /\('master', 'manage_global_roles'\)/i);
  assert.match(insertBlock, /\('programmer', 'view_all_profiles'\)/i);
  assert.match(insertBlock, /\('programmer', 'manage_communities_any'\)/i);
  // Critical: programmer must never hold manage_community_ownership — this is the
  // hard guard that keeps programmer from ever becoming or removing a community
  // owner via transfer_community_ownership (Task 2).
  assert.doesNotMatch(insertBlock, /\('programmer', 'manage_community_ownership'\)/i);

  assert.match(
    globalRoleCapabilitiesMigration,
    /alter table public\.global_role_capabilities enable row level security;/i,
  );
  assert.match(
    globalRoleCapabilitiesMigration,
    /create policy "Authenticated users can read global role capabilities"[\s\S]*?for select to authenticated\s*using \(true\);/i,
  );
  assert.match(
    globalRoleCapabilitiesMigration,
    /revoke all on table public\.global_role_capabilities from public, anon;/i,
  );
  assert.match(
    globalRoleCapabilitiesMigration,
    /grant select on table public\.global_role_capabilities to authenticated;/i,
  );

  const hasCapabilityFunction = extractSqlFunction(
    globalRoleCapabilitiesMigration,
    'has_capability',
  );
  assert.ok(hasCapabilityFunction, 'missing has_capability function');
  assert.match(hasCapabilityFunction, /security definer[\s\S]*set search_path = public/i);
  assert.match(
    hasCapabilityFunction,
    /join public\.global_role_capabilities c on c\.role = p\.role/i,
  );
  assert.match(hasCapabilityFunction, /p\.id = \(select auth\.uid\(\)\)/i);
  assert.match(
    globalRoleCapabilitiesMigration,
    /revoke execute on function public\.has_capability\(text\) from public, anon;/i,
  );
  assert.match(
    globalRoleCapabilitiesMigration,
    /grant execute on function public\.has_capability\(text\) to authenticated;/i,
  );
});

test('consolidated schema includes global role capabilities with RLS and has_capability', () => {
  assert.match(baseSchema, /create table public\.global_role_capabilities \(/i);
  assert.match(
    baseSchema,
    /alter table public\.global_role_capabilities enable row level security;/i,
  );
  assert.doesNotMatch(baseSchema, /\('programmer', 'manage_community_ownership'\)/i);
  assert.ok(
    extractSqlFunction(baseSchema, 'has_capability'),
    'consolidated schema missing has_capability function',
  );
});

test('community role capabilities migration adds organizador and capability-gates member RPCs', () => {
  assert.match(
    communityRoleCapabilitiesMigration,
    /check \(role in \('owner', 'admin', 'moderator', 'organizador', 'member'\)\)/i,
  );

  const insertBlock = communityRoleCapabilitiesMigration.match(
    /insert into public\.community_role_capabilities \(role, capability\) values[\s\S]*?on conflict do nothing;/i,
  )?.[0];
  assert.ok(insertBlock, 'missing community capability seed block');
  assert.match(insertBlock, /\('organizador', 'manage_sessions'\)/i);
  // organizador and moderator run sessions; they must never gain member management
  // or the ability to edit community info.
  assert.doesNotMatch(insertBlock, /\('organizador', 'manage_members'\)/i);
  assert.doesNotMatch(insertBlock, /\('organizador', 'edit_community_info'\)/i);
  assert.doesNotMatch(insertBlock, /\('moderator', 'manage_members'\)/i);
  assert.doesNotMatch(insertBlock, /\('moderator', 'edit_community_info'\)/i);
  // 'member' holds no capabilities at all by default.
  assert.doesNotMatch(insertBlock, /\('member',/i);

  for (const table of ['community_role_capabilities', 'community_role_capability_overrides']) {
    assert.match(
      communityRoleCapabilitiesMigration,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
    );
    assert.match(
      communityRoleCapabilitiesMigration,
      new RegExp(`revoke all on table public\\.${table} from public, anon;`, 'i'),
    );
  }

  const capabilityFn = extractSqlFunction(
    communityRoleCapabilitiesMigration,
    'community_has_capability',
  );
  assert.ok(capabilityFn, 'missing community_has_capability function');
  assert.match(capabilityFn, /security definer[\s\S]*set search_path = public/i);
  // An override row wins over the role default, in either direction.
  assert.match(
    capabilityFn,
    /coalesce\([\s\S]*select o\.granted[\s\S]*community_role_capability_overrides o/i,
  );
  assert.match(capabilityFn, /cm\.status = 'active'/i);

  for (const [fn, capability] of [
    ['set_community_member_role', 'manage_members'],
    ['remove_community_member', 'remove_members'],
  ] as const) {
    const body = extractSqlFunction(communityRoleCapabilitiesMigration, fn);
    assert.ok(body, `missing ${fn} function`);
    assert.match(
      body,
      new RegExp(
        `community_has_capability\\(target_member\\.community_id, '${capability}'\\)`,
        'i',
      ),
    );
    // The owner guard is what keeps these RPCs from ever touching an owner row,
    // for any caller including master/programmer.
    assert.match(body, /target_member\.role = 'owner'/i);
    assert.doesNotMatch(body, /array\['owner', ?'admin'\]/i);
  }

  const transfer = extractSqlFunction(
    communityRoleCapabilitiesMigration,
    'transfer_community_ownership',
  );
  assert.ok(transfer, 'missing transfer_community_ownership function');
  assert.match(transfer, /has_capability\('manage_community_ownership'\)/i);
  // Promote the new owner BEFORE demoting the old one, or the last-owner guard
  // trigger rejects the demote.
  const promoteAt = transfer.search(/set role = 'owner'/i);
  const demoteAt = transfer.search(/set role = 'admin'/i);
  assert.ok(promoteAt !== -1 && demoteAt !== -1, 'missing promote/demote statements');
  assert.ok(promoteAt < demoteAt, 'must promote the new owner before demoting the old one');
});

test('communities UPDATE is capability-gated with no legacy bypass policy', () => {
  // Both the capability layer and the follow-up drop are needed: the capability
  // migration's own drop targeted a policy name that no longer existed, leaving the
  // legacy policy live and OR-ing past any granted=false override.
  assert.match(
    communityRoleCapabilitiesMigration,
    /create policy "Community capability holders can update communities"/i,
  );
  assert.match(
    dropLegacyCommunitiesUpdatePolicyMigration,
    /drop policy if exists "Community owners and admins can update communities" on public\.communities;/i,
  );

  assert.match(baseSchema, /create policy "Community capability holders can update communities"/i);
  assert.doesNotMatch(
    baseSchema,
    /create policy "Community owners and admins can update communities"/i,
  );
  assert.doesNotMatch(baseSchema, /create policy "Users can update own communities"/i);
});

test('consolidated schema includes the community capability layer', () => {
  assert.match(baseSchema, /create table public\.community_role_capabilities \(/i);
  assert.match(baseSchema, /create table public\.community_role_capability_overrides \(/i);
  assert.match(
    baseSchema,
    /check \(role in \('owner', 'admin', 'moderator', 'organizador', 'member'\)\)/i,
  );
  for (const fn of [
    'community_has_capability',
    'set_community_member_role',
    'remove_community_member',
    'transfer_community_ownership',
  ]) {
    assert.ok(extractSqlFunction(baseSchema, fn), `consolidated schema missing ${fn}`);
  }
});

test('mandatory MFA migration derives requires_aal2 on ensure_account_ready', () => {
  for (const artifact of [mandatoryMfaAal2EnforcementMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'ensure_account_ready');
    assert.ok(fn, 'missing ensure_account_ready');
    assert.match(
      fn,
      /returns table \(\s*state text,[\s\S]*username text,\s*requires_aal2 boolean\s*\)/i,
      'requires_aal2 boolean must be the final output column',
    );
    // Both return branches (needs_username and ready) must select the derived value.
    const returnCalls = fn.match(/public\.account_requires_aal2\(v_uid\)/gi) ?? [];
    assert.equal(
      returnCalls.length,
      2,
      'both return query branches must call account_requires_aal2',
    );
  }

  assert.match(
    mandatoryMfaAal2EnforcementMigration,
    /drop function public\.ensure_account_ready\(text\);/i,
  );
});

test('account_requires_aal2 checks global master/programmer role and active owner/admin community membership', () => {
  for (const artifact of [mandatoryMfaAal2EnforcementMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'account_requires_aal2');
    assert.ok(fn, 'missing account_requires_aal2');
    assert.match(fn, /security definer[\s\S]*set search_path = public/i);
    assert.match(
      fn,
      /from public\.profiles\s*where id = p_uid and role in \('master', 'programmer'\)/i,
    );
    assert.match(
      fn,
      /from public\.community_members\s*where user_id = p_uid and role in \('owner', 'admin'\) and status = 'active'/i,
    );
  }
});

test('require_aal2 raises 42501 unless the caller jwt aal claim is aal2', () => {
  for (const artifact of [mandatoryMfaAal2EnforcementMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'require_aal2');
    assert.ok(fn, 'missing require_aal2');
    assert.match(fn, /set search_path = public/i);
    assert.match(fn, /auth\.jwt\(\) ->> 'aal'/i);
    assert.match(fn, /<> 'aal2'/i);
    assert.match(fn, /errcode = '42501'/i);
  }
});

test('the four sensitive role/ownership RPCs enforce AAL2 at the database layer', () => {
  for (const fn of [
    'set_user_role',
    'set_community_member_role',
    'remove_community_member',
    'transfer_community_ownership',
  ]) {
    const migrationFn = extractSqlFunction(mandatoryMfaAal2EnforcementMigration, fn);
    const schemaFn = extractSqlFunction(baseSchema, fn);
    assert.ok(migrationFn, `migration missing ${fn}`);
    assert.ok(schemaFn, `consolidated schema missing ${fn}`);
    assert.match(migrationFn, /perform public\.require_aal2\(\);/i, fn);
    assert.match(schemaFn, /perform public\.require_aal2\(\);/i, fn);
  }

  // set_community_member_role and remove_community_member authenticate first — an
  // unauthenticated caller must still see 'Nao autenticado', not an AAL2 error.
  for (const fn of ['set_community_member_role', 'remove_community_member']) {
    const schemaFn = extractSqlFunction(baseSchema, fn);
    const authCheckPosition = schemaFn.search(/raise exception 'Nao autenticado'/i);
    const aal2Position = schemaFn.search(/perform public\.require_aal2\(\);/i);
    assert.ok(authCheckPosition >= 0 && authCheckPosition < aal2Position, fn);
  }
});
test('consolidated schema carries every community join/discovery RPC verbatim', () => {
  // schema.sql is the "paste into the SQL Editor" snapshot. Every RPC below is live
  // in production but was missing from it entirely, so a fresh project stood up from
  // this file could not join, approve, discover, or leave a community at all.
  const expected: [string, string][] = [
    ['generate_join_code', communityJoinSystemMigration],
    ['disable_join_code', communityJoinSystemMigration],
    ['find_community_by_code', communityJoinSystemMigration],
    ['request_to_join_community', communityJoinSystemMigration],
    ['approve_join_request', communityJoinSystemMigration],
    ['reject_join_request', communityJoinSystemMigration],
    ['leave_community', communityJoinSystemMigration],
    ['set_community_visibility', communityDiscoveryMigration],
    ['search_public_communities', communityDiscoveryMigration],
    ['request_to_join_public', communityDiscoveryMigration],
    // Superseded twice; 20260624203424 holds the authoritative definition.
    ['add_community_member_by_email', communityModelV2Migration],
    ['propose_player_avatar', avatarApprovalMigration],
    ['approve_player_avatar', avatarApprovalMigration],
    ['reject_player_avatar', avatarApprovalMigration],
    ['find_player_by_username', globalAthleteIdentityMigration],
    // Superseded by 20260726210000, which added the active-membership filters —
    // 20260610161203 no longer holds the authoritative body.
    ['current_user_shares_profile', profileVisibilityStatusMigration],
    ['ensure_community_owner_member', migration],
    // schema.sql carried a hand-written copy of this one that predated community_id:
    // it only ever wrote owner_id, so a project stood up from the file logged audit
    // rows with no community attribution, and lacked the nullif(..., '') guard that
    // keeps an empty owner_id from blowing up the uuid cast.
    ['log_table_changes', migration],
    ['guard_community_member_owner_role', rbacHardeningMigration],
    ['sync_community_player_active_status', communityPlayersOptimizationMigration],
  ];

  for (const [fn, source] of expected) {
    const inSchema = extractSqlFunction(baseSchema, fn);
    assert.ok(inSchema, `consolidated schema missing ${fn}`);

    const inMigration = extractSqlFunction(source, fn);
    assert.ok(inMigration, `authoritative migration for ${fn} not found`);

    // Compare bodies modulo whitespace/case so a reformat does not fail the test but
    // a changed predicate or a dropped guard does.
    const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
    assert.equal(
      normalize(inSchema),
      normalize(inMigration),
      `${fn} in schema.sql does not match its authoritative migration definition`,
    );
  }
});

test('consolidated schema inlines the search_path that was applied by ALTER', () => {
  // 20260610161203 created prevent_last_community_owner_change WITHOUT a search_path;
  // 20260610195250 pinned it afterwards with `alter function`. Production therefore has
  // the pin, and schema.sql — which has no later ALTER to replay — must inline it.
  assert.match(
    functionSecurityHardeningMigration,
    /alter function public\.prevent_last_community_owner_change\(\) set search_path = public;/i,
  );
  const guard = extractSqlFunction(baseSchema, 'prevent_last_community_owner_change');
  assert.ok(guard, 'consolidated schema missing prevent_last_community_owner_change');
  assert.match(guard, /language plpgsql\s+set search_path = public/i);
  // The invariant itself: both the DELETE and the demote path must count owners.
  assert.match(guard, /tg_op = 'DELETE' and old\.role = 'owner'/i);
  assert.match(guard, /tg_op = 'UPDATE' and old\.role = 'owner' and new\.role <> 'owner'/i);
  assert.equal(guard.match(/owner_count <= 1/gi)?.length, 2);
});

test('consolidated schema grants the recovered RPCs to authenticated only', () => {
  // Every SECURITY DEFINER RPC must have PUBLIC/anon EXECUTE revoked; schema.sql
  // applies these per function rather than in bulk, so a missing pair is silent.
  const signatures = [
    'generate_join_code(uuid)',
    'disable_join_code(uuid)',
    'find_community_by_code(text)',
    'request_to_join_community(text)',
    'approve_join_request(uuid)',
    'reject_join_request(uuid)',
    'leave_community(uuid)',
    'set_community_visibility(uuid, text)',
    'search_public_communities(text)',
    'request_to_join_public(uuid)',
    'add_community_member_by_email(uuid, text, text)',
    'propose_player_avatar(uuid, text)',
    'approve_player_avatar(uuid)',
    'reject_player_avatar(uuid)',
    'find_player_by_username(text)',
    'current_user_shares_profile(uuid)',
  ];
  for (const sig of signatures) {
    const escaped = sig.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(
      baseSchema,
      new RegExp(`revoke execute on function public\\.${escaped} from public, anon;`, 'i'),
      `missing revoke for ${sig}`,
    );
    assert.match(
      baseSchema,
      new RegExp(`grant execute on function public\\.${escaped} to authenticated;`, 'i'),
      `missing grant for ${sig}`,
    );
  }

  // The three trigger-only functions are callable by nobody.
  for (const fn of [
    'ensure_community_owner_member',
    'prevent_last_community_owner_change',
    'guard_community_member_owner_role',
  ]) {
    assert.match(
      baseSchema,
      new RegExp(
        `revoke execute on function public\\.${fn}\\(\\) from public, anon, authenticated;`,
        'i',
      ),
      `missing revoke for trigger function ${fn}`,
    );
  }
});

test('consolidated schema wires the community and community_players triggers', () => {
  const triggers: [string, string, string][] = [
    ['create_community_owner_member', 'communities', 'ensure_community_owner_member'],
    [
      'prevent_last_community_owner_delete',
      'community_members',
      'prevent_last_community_owner_change',
    ],
    [
      'prevent_last_community_owner_update',
      'community_members',
      'prevent_last_community_owner_change',
    ],
    [
      'trg_guard_community_member_owner_role',
      'community_members',
      'guard_community_member_owner_role',
    ],
    [
      'trigger_sync_community_player_active_status',
      'community_players',
      'sync_community_player_active_status',
    ],
    ['set_community_players_updated_at', 'community_players', 'set_updated_at'],
  ];
  for (const [trigger, table, fn] of triggers) {
    assert.match(
      baseSchema,
      new RegExp(
        `create trigger ${trigger}\\s+[\\s\\S]{0,80}?on public\\.${table}\\s+for each row execute function public\\.${fn}\\(\\);`,
        'i',
      ),
      `missing or misdirected trigger ${trigger}`,
    );
  }
});

test('consolidated schema RLS is membership-scoped, not the pre-migration owner-only set', () => {
  // These four tables were still carrying the original owner_id-only policies, so a
  // fresh project reproduced from schema.sql would let no community member read
  // anything they did not personally create.
  const live = [
    ['Profiles are readable by self, staff, or member managers', 'profiles'],
    ['Community members can read communities', 'communities'],
    ['Community owners and admins can delete communities', 'communities'],
    ['Community members can read players', 'players'],
    ['Player admins can update players', 'players'],
    ['Community members can read community players', 'community_players'],
    ['Community members can read memberships', 'community_members'],
    ['Community owners and admins can insert memberships', 'community_members'],
    ['Community members can read community rules', 'community_rules'],
    ['Community members can read whatsapp templates', 'whatsapp_list_templates'],
    ['Community members can read modification logs', 'modification_logs'],
  ] as const;
  for (const [name, table] of live) {
    assert.match(
      baseSchema,
      new RegExp(`create policy "${name}" on public\\.${table}`, 'i'),
      `consolidated schema missing policy "${name}"`,
    );
  }

  // ...and the superseded names must be gone, or Postgres ORs them back in.
  const dropped = [
    'Users can read own profile',
    'Profiles are readable by self or shared communities',
    'Users can read own communities',
    'Users can insert own communities',
    'Users can delete own communities',
    'Users can read own players',
    'Users can update own players',
    'Users can read own community players',
    'Users can insert own community players',
    'Users can update own community players',
    'Users can delete own community players',
    'Users can read own community rules',
    'Users can read own whatsapp templates',
    'Users can read own logs',
  ];
  for (const name of dropped) {
    assert.doesNotMatch(
      baseSchema,
      new RegExp(`create policy "${name}"`, 'i'),
      `consolidated schema still carries superseded policy "${name}"`,
    );
  }

  // App-staff read access for the support panel, one policy per operational table.
  for (const table of [
    'communities',
    'community_members',
    'community_rules',
    'community_players',
    'sessions',
    'teams',
    'games',
    'point_events',
    'game_reports',
    'session_reports',
  ]) {
    assert.match(
      baseSchema,
      new RegExp(
        `create policy "App staff can read ${table}" on public\\.${table}\\s+for select to authenticated using \\(public\\.is_app_staff\\(\\)\\);`,
        'i',
      ),
      `missing app-staff read policy for ${table}`,
    );
  }
});

test('consolidated schema has the communities columns the join system needs', () => {
  // The join/discovery RPCs read communities.join_code and communities.visibility.
  // Without these columns schema.sql does not even execute.
  assert.match(
    baseSchema,
    /visibility text not null default 'private' check \(visibility in \('private', 'public'\)\)/i,
  );
  assert.match(baseSchema, /^\s*join_code text,$/im);
  assert.match(
    baseSchema,
    /create unique index if not exists communities_join_code_idx\s+on public\.communities \(join_code\) where join_code is not null;/i,
  );
});

test('community profile privacy migration replaces the broad profiles read policy', () => {
  assert.match(
    communityProfilePrivacyMigration,
    /drop policy if exists "Profiles are readable by self or shared communities" on public\.profiles;/i,
  );

  const policy = communityProfilePrivacyMigration.match(
    /create policy "Profiles are readable by self, staff, or member managers"[\s\S]*?;/i,
  )?.[0];
  assert.ok(policy, 'missing narrowed profiles read policy');
  assert.match(policy, /for select to authenticated/i);
  assert.match(policy, /id = \(select auth\.uid\(\)\)/i);
  assert.match(policy, /public\.is_app_staff\(\)/i);
  assert.match(
    policy,
    /public\.community_has_capability\(viewer\.community_id, 'manage_members'\)/i,
  );

  assert.doesNotMatch(
    baseSchema,
    /create policy "Profiles are readable by self or shared communities"/i,
  );
  assert.match(
    baseSchema,
    /create policy "Profiles are readable by self, staff, or member managers"/i,
  );
  // "App staff can read all profiles" is a separate permissive policy this task must
  // not touch: src/infra/supabase/profilesAdminCloudService.ts relies on it for the
  // global role-admin screen, and Postgres ORs permissive policies together.
  assert.match(baseSchema, /create policy "App staff can read all profiles" on public\.profiles/i);
});

test('community_profile_summary view exposes only id and name, never email', () => {
  assert.match(
    communityProfilePrivacyMigration,
    /create or replace view public\.community_profile_summary as/i,
  );
  const viewDefinition = communityProfilePrivacyMigration.match(
    /create or replace view public\.community_profile_summary as[\s\S]*?;/i,
  )?.[0];
  assert.ok(viewDefinition, 'missing community_profile_summary view definition');
  assert.match(viewDefinition, /select p\.id, p\.name/i);
  assert.doesNotMatch(viewDefinition, /email/i);
  assert.match(viewDefinition, /public\.current_user_shares_profile\(p\.id\)/i);
  assert.match(
    communityProfilePrivacyMigration,
    /grant select on public\.community_profile_summary to authenticated;/i,
  );
  assert.match(
    communityProfilePrivacyMigration,
    /revoke all on public\.community_profile_summary from anon;/i,
  );

  const schemaViewDefinition = baseSchema.match(
    /create or replace view public\.community_profile_summary as[\s\S]*?;/i,
  )?.[0];
  assert.ok(schemaViewDefinition, 'consolidated schema missing community_profile_summary view');
  assert.match(schemaViewDefinition, /select p\.id, p\.name/i);
  assert.doesNotMatch(schemaViewDefinition, /email/i);
});

test('current_user_shares_profile requires BOTH sides to be active members', () => {
  // Without the status filters, someone whose join request was still 'pending' — or
  // who had been 'rejected' — could read the name of every member of a community they
  // had merely asked to join, via community_profile_summary.
  for (const artifact of [profileVisibilityStatusMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'current_user_shares_profile');
    assert.ok(fn, 'missing current_user_shares_profile');
    assert.match(fn, /mine\.status = 'active'/i, 'viewer side must be an active member');
    assert.match(fn, /theirs\.status = 'active'/i, 'target side must be an active member');
    // Reading your own profile must not depend on any membership at all.
    assert.match(fn, /target_user_id = \(select auth\.uid\(\)\)/i);
  }
});

test('member managers can read a pending requester profile', () => {
  // The join-review panel renders `row.displayName || 'Solicitante'`, so requiring
  // target.status = 'active' in this policy made every pending request show the
  // placeholder instead of who was actually asking to join. Deciding on a request
  // requires seeing the requester, so the target's status is deliberately not filtered
  // here — the viewer still must be an active member holding manage_members.
  const policy = baseSchema.match(
    /create policy "Profiles are readable by self, staff, or member managers"[\s\S]*?\);/i,
  )?.[0];
  assert.ok(policy, 'consolidated schema missing the profiles select policy');
  assert.match(policy, /viewer\.status = 'active'/i);
  assert.match(policy, /community_has_capability\(viewer\.community_id, 'manage_members'\)/i);
  assert.doesNotMatch(
    policy,
    /target\.status/i,
    "target status must not be filtered, or pending requesters become unreadable",
  );
});

test('career_events is server-generated and read-only for clients', () => {
  for (const artifact of [careerEventsMigration, baseSchema]) {
    assert.match(artifact, /create table public\.career_events \(/i);
    assert.match(artifact, /source_key text not null unique/i);
    assert.match(artifact, /contract_version integer not null/i);
    assert.match(artifact, /alter table public\.career_events enable row level security;/i);

    // O revoke precisa citar authenticated E vir antes do grant: o padrao do Supabase
    // concede ALL, entao revogar so de anon deixa INSERT/UPDATE/DELETE abertos.
    const revoke = artifact.match(/revoke all on table public\.career_events from ([^;]*);/i)?.[1];
    assert.ok(revoke, 'missing revoke on career_events');
    assert.match(revoke, /\bauthenticated\b/i);
    assert.match(revoke, /\banon\b/i);

    const revokeAt = artifact.search(/revoke all on table public\.career_events/i);
    const grantAt = artifact.search(/grant select on table public\.career_events/i);
    assert.ok(revokeAt !== -1 && grantAt !== -1);
    assert.ok(revokeAt < grantAt, 'revoke must precede the grant');
  }
});

test('community_profile_summary is read-only for authenticated, not just anon', () => {
  // The view is single-table, so Postgres makes it auto-updatable, and it runs with
  // its owner's rights (postgres bypasses RLS). Supabase's default privileges already
  // grant `authenticated` ALL on new objects in public, so revoking only from `anon`
  // left INSERT/UPDATE/DELETE reachable — writes landed on public.profiles with no RLS
  // filter, and profiles has no DELETE or INSERT policy at all. Any authenticated user
  // could delete the profile of anyone sharing a community with them, cascading them
  // out of every community via community_members_user_id_fkey.
  for (const artifact of [communityProfileSummaryReadonlyMigration, baseSchema]) {
    const revoke = artifact.match(
      /revoke all on public\.community_profile_summary from ([^;]*);/i,
    )?.[1];
    assert.ok(revoke, 'missing revoke on community_profile_summary');
    assert.match(revoke, /\bauthenticated\b/i, 'revoke must include authenticated, not just anon');
    assert.match(revoke, /\banon\b/i);
  }

  // The revoke has to precede the grant, or it strips the select right back off.
  const revokeAt = baseSchema.search(
    /revoke all on public\.community_profile_summary from [^;]*;/i,
  );
  const grantAt = baseSchema.search(/grant select on public\.community_profile_summary to/i);
  assert.ok(revokeAt !== -1 && grantAt !== -1, 'missing grant/revoke pair');
  assert.ok(revokeAt < grantAt, 'revoke must come before the select grant');
});

test('career regeneration uses statement triggers, not row triggers', () => {
  // point_events chega em lote no sync; um trigger de linha recomputaria o mesmo
  // resumo uma vez por ponto.
  const triggers = careerGenerationMigration.match(/create trigger regenerate_career_after_[\s\S]*?;/gi) ?? [];
  assert.equal(triggers.length, 6, 'expected 6 triggers (ins/upd/del on point_events and games)');
  for (const trigger of triggers) {
    assert.match(trigger, /for each statement/i, 'trigger must be statement-level');
    assert.match(trigger, /referencing (new|old) table as touched_rows/i);
  }
  assert.doesNotMatch(careerGenerationMigration, /for each row/i);
});

test('career regeneration resolves local ids scoped by owner', () => {
  // point_events.player_id / teams.player_ids carregam ids LOCAIS; o indice unico e
  // (owner_id, local_id), entao o join tem de ser escopado por owner.
  const fn = extractSqlFunction(careerGenerationMigration, 'regenerate_career_events_for_sessions');
  assert.ok(fn, 'missing regenerate_career_events_for_sessions');
  assert.match(fn, /coalesce\(p\.local_id, p\.id::text\)/i);
  assert.match(fn, /pr\.owner_id = tr\.owner_id/i);
  // Apagar-e-inserir e o que torna a regeneracao idempotente.
  assert.match(fn, /delete from public\.career_events/i);
  assert.match(fn, /and session_id = any\(target_sessions\)/i);
  // So sessao e jogo finalizados entram, espelhando statistics.ts.
  assert.match(fn, /se\.status = 'finished'/i);
  assert.match(fn, /g\.status = 'finished'/i);
});

test('career rollup mirrors the credited-point rules of statistics.ts', () => {
  const fn = extractSqlFunction(careerGenerationMigration, 'regenerate_career_events_for_sessions');
  assert.ok(fn);
  assert.match(fn, /'attack','block','serve_ace','defense_counterattack','tip'/i);
  assert.match(fn, /pe\.point_type = 'winner'/i);
  // Destaque nunca conta como ponto nem erro.
  assert.match(fn, /event_kind is distinct from 'highlight'/i);
});

test('career_totals aggregates globally without community attribution', () => {
  for (const artifact of [careerTotalsMigration, baseSchema]) {
    const view = artifact.match(/create or replace view public\.career_totals as[\s\S]*?;/i)?.[0];
    assert.ok(view, 'missing career_totals view');
    assert.match(view, /group by ce\.player_id/i);
    // Nunca pode expor a comunidade de origem â€" e o que torna o total global seguro.
    assert.doesNotMatch(view, /community_id/i);

    const revoke = artifact.match(/revoke all on public\.career_totals from ([^;]*);/i)?.[1];
    assert.ok(revoke);
    assert.match(revoke, /\bauthenticated\b/i);
  }
});

test('recalculate_player_career resolves local team ids scoped by owner', () => {
  const fn = extractSqlFunction(baseSchema, 'recalculate_player_career');
  assert.ok(fn, 'consolidated schema missing recalculate_player_career');
  assert.match(fn, /p\.owner_id = t\.owner_id/i);
  assert.match(fn, /coalesce\(p\.local_id, p\.id::text\) = any\(t\.player_ids\)/i);
  assert.match(fn, /perform public\.regenerate_career_events_for_sessions\(affected\)/i);
  assert.match(fn, /perform public\.regenerate_player_milestones\(p_player_id\)/i);
});

const MILESTONE_SLUGS = [
  'first_session', 'first_win',
  'games_10', 'games_50', 'games_100',
  'points_100', 'points_500', 'points_1000',
  'streak_3', 'streak_5',
];

test('milestone generation covers exactly the ten agreed slugs', () => {
  const fn = extractSqlFunction(careerMilestonesMigration, 'regenerate_player_milestones');
  assert.ok(fn, 'missing regenerate_player_milestones');
  for (const slug of MILESTONE_SLUGS) {
    assert.match(fn, new RegExp(`'${slug}'`), `missing milestone ${slug}`);
  }
  // Marcos sao idempotentes por apagar-e-inserir + source_key unica.
  assert.match(fn, /delete from public\.career_events\s+where type = 'milestone'/i);
  assert.match(fn, /\|milestone:' \|\| h\.slug/i);
});

test('a won session requires more wins than losses', () => {
  // Empate nao conta como vitoria — e o que torna streak_3/streak_5 deterministicos.
  const fn = extractSqlFunction(careerMilestonesMigration, 'regenerate_player_milestones');
  assert.ok(fn);
  assert.match(fn, /games_won > so\.games_played - so\.games_won/i);
});

test('streak islands are built ONLY from won sessions', () => {
  // Regressao verificada no Postgres: com [V,V,D,V,V] a sequencia real maxima e 2, mas
  // deixando as sessoes perdidas no conjunto elas caem na mesma particao e inflam o
  // row_number seguinte para 3 — streak_3 era gravado sem ter sido conquistado, e de
  // forma permanente, porque a source_key do marco e fixa.
  for (const artifact of [careerMilestonesMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'regenerate_player_milestones');
    assert.ok(fn, 'missing regenerate_player_milestones');
    assert.match(
      fn,
      /won_sessions as \(\s*select r\.\* from running r where r\.session_won\s*\)/i,
      'streak must be computed over won sessions only',
    );
    assert.match(fn, /w\.seq - row_number\(\) over \(order by w\.seq\) as streak_key/i);
    // A forma antiga somava vitorias sobre TODAS as linhas: e exatamente o bug.
    assert.doesNotMatch(fn, /sum\(case when r\.session_won then 1 else 0 end\)/i);
  }
});

test('a player in two teams of one session counts the game once', () => {
  // Sem o distinct on, o join casa o mesmo jogo uma vez por time do jogador e
  // games_played conta em dobro, distorcendo o win rate. statistics.ts usa filter e
  // conta o jogo uma vez so.
  for (const artifact of [careerGenerationMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'regenerate_career_events_for_sessions');
    assert.ok(fn, 'missing regenerate_career_events_for_sessions');
    assert.match(fn, /select distinct on \(pt\.player_uuid, gr\.id\)/i);
    // A desambiguacao precisa preferir o time vencedor.
    assert.match(fn, /order by pt\.player_uuid, gr\.id, \(gr\.winner_team_id = pt\.team_ref\) desc/i);
  }
});

test('error counting keeps the legacy opponent_error branch', () => {
  // statistics.ts conta erro por point_type='error' E, no legado (point_type nulo,
  // anterior a taxonomia de junho), por reason='opponent_error' com o time do jogador
  // concedendo. Contar so o primeiro divergia do calculo de pontos logo acima, que ja
  // tratava o legado.
  for (const artifact of [careerGenerationMigration, baseSchema]) {
    const fn = extractSqlFunction(artifact, 'regenerate_career_events_for_sessions');
    assert.ok(fn);
    assert.match(fn, /pe\.reason = 'opponent_error'/i);
    assert.match(fn, /pe\.conceding_team_id in \(/i);
  }
});
