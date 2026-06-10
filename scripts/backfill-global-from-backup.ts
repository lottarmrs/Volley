/**
 * Backfill the global athlete roster from an app backup JSON.
 *
 * Reads a `panelinha_backup_*.json` export and, for the importing admin
 * (IMPORT_OWNER_ID), upserts its communities, its non-guest players (each
 * assigned a deterministic global username), and the community<->player links.
 *
 * Prerequisites: the Supabase project is provisioned and the migrations have
 * been applied in order (schema.sql -> 20260609120000 -> 20260610120000 ->
 * 20260610130000_global_athlete_identity).
 *
 * Usage:
 *   # Preview only, no writes, no DB connection required:
 *   npx tsx scripts/backfill-global-from-backup.ts <backup.json> --dry-run
 *
 *   # Real import (writes via the service-role key, bypassing RLS):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... IMPORT_OWNER_ID=<admin-uuid> \
 *     npx tsx scripts/backfill-global-from-backup.ts <backup.json>
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Community, Player } from '../src/types';
import { mapCommunityToDb } from '../src/services/supabase/communityCloudService';
import { mapPlayerToDb } from '../src/services/supabase/playerCloudService';
import { generateUsernames } from '../src/logic/username';

interface Backup {
  players?: Player[];
  communities?: Community[];
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const backupPath = args.find((arg) => !arg.startsWith('--'));
  return { dryRun, backupPath };
}

function loadBackup(path: string): Backup {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main() {
  const { dryRun, backupPath } = parseArgs(process.argv);
  if (!backupPath) {
    throw new Error('Usage: backfill-global-from-backup.ts <backup.json> [--dry-run]');
  }

  const backup = loadBackup(backupPath);
  const communities = backup.communities ?? [];
  const allPlayers = backup.players ?? [];
  const players = allPlayers.filter((player) => !player.isGuest);
  const skipped = allPlayers.length - players.length;

  // Deterministic usernames over the non-guest set, in file order.
  const usernames = generateUsernames(players.map((player) => player.nome));
  const linkCount = players.reduce(
    (total, player) => total + (player.communityIds?.length ?? 0),
    0,
  );

  console.log(`Backup: ${backupPath}`);
  console.log(`Communities: ${communities.length}`);
  console.log(
    `Players: ${allPlayers.length} total, ${players.length} importable, ${skipped} guests skipped`,
  );
  console.log(`Community links: ${linkCount}`);
  console.log('Planned usernames:');
  players.forEach((player, index) => console.log(`  ${player.nome} -> ${usernames[index]}`));

  if (dryRun) {
    console.log('\n[dry-run] No changes written.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.IMPORT_OWNER_ID;
  if (!url || !serviceKey || !ownerId) {
    throw new Error(
      'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and IMPORT_OWNER_ID to run a real import.',
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Communities -> map local id to cloud id.
  const communityCloudIdByLocalId = new Map<string, string>();
  for (const community of communities) {
    const record = mapCommunityToDb(community, ownerId);
    const { data, error } = await supabase
      .from('communities')
      .upsert(record, { onConflict: 'owner_id,local_id' })
      .select('id, local_id')
      .single();
    if (error) throw error;
    communityCloudIdByLocalId.set(community.id, data.id);
  }
  console.log(`\nUpserted ${communityCloudIdByLocalId.size} communities.`);

  // 2. Players (with their generated username) -> map local id to cloud id.
  const playerCloudIdByLocalId = new Map<string, string>();
  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const record = { ...mapPlayerToDb(player, ownerId), username: usernames[index] };
    const { data, error } = await supabase
      .from('players')
      .upsert(record, { onConflict: 'owner_id,local_id' })
      .select('id, local_id')
      .single();
    if (error) throw error;
    playerCloudIdByLocalId.set(player.id, data.id);
  }
  console.log(`Upserted ${playerCloudIdByLocalId.size} players.`);

  // 3. community_players links.
  const links: Array<{
    owner_id: string;
    community_id: string;
    player_id: string;
    active: boolean;
  }> = [];
  for (const player of players) {
    const playerCloudId = playerCloudIdByLocalId.get(player.id);
    if (!playerCloudId) continue;
    for (const localCommunityId of player.communityIds ?? []) {
      const communityCloudId = communityCloudIdByLocalId.get(localCommunityId);
      if (!communityCloudId) continue;
      links.push({
        owner_id: ownerId,
        community_id: communityCloudId,
        player_id: playerCloudId,
        active: true,
      });
    }
  }
  if (links.length > 0) {
    const { error } = await supabase
      .from('community_players')
      .upsert(links, { onConflict: 'community_id,player_id' });
    if (error) throw error;
  }
  console.log(`Upserted ${links.length} community-player links.`);
  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
