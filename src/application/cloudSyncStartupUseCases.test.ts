import test from 'node:test';
import assert from 'node:assert/strict';
import { planStartupCloudDownload } from './cloudSyncStartupUseCases';

test('planStartupCloudDownload does nothing when Supabase is disabled', () => {
  const plan = planStartupCloudDownload({
    authState: 'ready',
    isSupabaseConfigured: false,
    userId: 'user-1',
    autoSyncedForUserId: null,
    cacheOwnerId: null,
    pendingChanges: 0,
  });

  assert.equal(plan.shouldDownload, false);
  assert.equal(plan.nextAutoSyncedForUserId, null);
});

test('planStartupCloudDownload clears synced marker when there is no signed-in user', () => {
  const plan = planStartupCloudDownload({
    authState: 'ready',
    isSupabaseConfigured: true,
    userId: null,
    autoSyncedForUserId: 'user-1',
    cacheOwnerId: null,
    pendingChanges: 0,
  });

  assert.equal(plan.shouldDownload, false);
  assert.equal(plan.nextAutoSyncedForUserId, null);
});

test('planStartupCloudDownload downloads once per user when there are no local changes', () => {
  const plan = planStartupCloudDownload({
    authState: 'ready',
    isSupabaseConfigured: true,
    userId: 'user-1',
    autoSyncedForUserId: null,
    cacheOwnerId: 'user-1',
    pendingChanges: 0,
  });

  assert.equal(plan.shouldDownload, true);
  assert.equal(plan.nextAutoSyncedForUserId, 'user-1');
});

test('planStartupCloudDownload avoids overwriting pending local changes for the same owner', () => {
  const plan = planStartupCloudDownload({
    authState: 'ready',
    isSupabaseConfigured: true,
    userId: 'user-1',
    autoSyncedForUserId: null,
    cacheOwnerId: 'user-1',
    pendingChanges: 2,
  });

  assert.equal(plan.shouldDownload, false);
  assert.equal(plan.nextAutoSyncedForUserId, null);
});

test('planStartupCloudDownload downloads when the local cache belongs to another user', () => {
  const plan = planStartupCloudDownload({
    authState: 'ready',
    isSupabaseConfigured: true,
    userId: 'user-2',
    autoSyncedForUserId: null,
    cacheOwnerId: 'user-1',
    pendingChanges: 2,
  });

  assert.equal(plan.shouldDownload, true);
  assert.equal(plan.nextAutoSyncedForUserId, 'user-2');
});

test('startup never opens cloud/cache before account is ready', () => {
  const plan = planStartupCloudDownload({
    authState: 'onboarding',
    isSupabaseConfigured: true,
    userId: 'u1',
    autoSyncedForUserId: null,
    cacheOwnerId: 'u1',
    pendingChanges: 0,
  });
  assert.equal(plan.shouldDownload, false);
  assert.equal(plan.nextAutoSyncedForUserId, null);
});
