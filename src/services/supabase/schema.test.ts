import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260610161203_backend_operational_sync.sql',
    import.meta.url,
  ),
  'utf8',
);

const playerEvaluationsMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260624133200_player_evaluations.sql',
    import.meta.url,
  ),
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
  assert.match(
    playerEvaluationsMigration,
    /current_user_can_access_player\(player_id\)/i,
  );
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
