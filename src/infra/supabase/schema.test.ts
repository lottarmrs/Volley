import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readFixture(path: URL): string {
  try {
    return readFileSync(path, 'utf8');
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

  assert.match(accountIdentityMigration, /create or replace function public\.ensure_account_ready/i);
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

  assert.ok(indexPosition >= 0 && indexPosition < clearPosition, 'case-insensitive index not active');
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
  assert.match(
    accountIdentityMigration,
    /security definer[\s\S]*set search_path = public/i,
  );
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
  assert.match(signupTrigger, /values \(new\.id, new\.id, v_name, null\)/i);
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
  assert.doesNotMatch(
    baseSchema,
    /players_user_id_unique_idx[\s\S]{0,120}deleted_at/i,
  );
  assert.ok(baseSchema.includes("username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'"));
  assert.match(baseSchema, /constraint players_username_account_format_check/i);
  assert.match(
    baseSchema,
    /create policy "Users can insert unlinked owned players"[\s\S]*owner_id = \(select auth\.uid\(\)\)[\s\S]*and user_id is null/i,
  );
  assert.match(
    baseSchema,
    /values \(new\.id, new\.id, v_name, null\)[\s\S]*when unique_violation then\s+null;/i,
  );
});

test('consolidated schema composes a narrow guard with soft-delete unlink', () => {
  assertPlayerSoftDeleteUserUnlinkContract(baseSchema, 'consolidated schema');
});
