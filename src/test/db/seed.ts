import type { Client, PoolClient } from 'pg';

/**
 * Synthetic actors for the XS-W0-03 suites.
 *
 * Two separate Communities with disjoint membership is the shape the RLS/BOLA suites need:
 * every deny case substitutes a VALID id belonging to the other tenant (QA-INV-006), which
 * is what distinguishes a real authorization test from a "row not found" accident.
 */

export interface SeededWorld {
  readonly ownerA: string;
  readonly memberA: string;
  readonly ownerB: string;
  readonly outsider: string;
  readonly communityA: string;
  readonly communityB: string;
  readonly playerA: string;
  readonly playerB: string;
}

type Db = Client | PoolClient;

async function createUser(db: Db, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  );
  return rows[0].id;
}

async function ensureProfile(db: Db, userId: string, email: string): Promise<void> {
  // profiles may be trigger-created from auth.users depending on migration order; upsert so
  // the harness works either way without assuming which migration is active.
  await db.query(
    `insert into public.profiles (id, email)
     values ($1, $2)
     on conflict (id) do nothing`,
    [userId, email],
  );
}

/** Seeds two isolated tenants. Runs as the table owner, deliberately bypassing RLS. */
export async function seedWorld(db: Db): Promise<SeededWorld> {
  const ownerA = await createUser(db, 'owner-a@test.local');
  const memberA = await createUser(db, 'member-a@test.local');
  const ownerB = await createUser(db, 'owner-b@test.local');
  const outsider = await createUser(db, 'outsider@test.local');

  await ensureProfile(db, ownerA, 'owner-a@test.local');
  await ensureProfile(db, memberA, 'member-a@test.local');
  await ensureProfile(db, ownerB, 'owner-b@test.local');
  await ensureProfile(db, outsider, 'outsider@test.local');

  const communityA = await insertCommunity(db, 'Community A', ownerA);
  const communityB = await insertCommunity(db, 'Community B', ownerB);

  await addMember(db, communityA, ownerA, 'owner');
  await addMember(db, communityA, memberA, 'member');
  await addMember(db, communityB, ownerB, 'owner');

  const playerA = await insertPlayer(db, communityA, ownerA, 'Player A');
  const playerB = await insertPlayer(db, communityB, ownerB, 'Player B');

  return { ownerA, memberA, ownerB, outsider, communityA, communityB, playerA, playerB };
}

async function insertCommunity(db: Db, name: string, ownerId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into public.communities (name, owner_id) values ($1, $2) returning id',
    [name, ownerId],
  );
  return rows[0].id;
}

async function addMember(db: Db, communityId: string, userId: string, role: string): Promise<void> {
  await db.query(
    `insert into public.community_members (community_id, user_id, role, status)
     values ($1, $2, $3, 'active')
     on conflict do nothing`,
    [communityId, userId, role],
  );
}

async function insertPlayer(
  db: Db,
  communityId: string,
  ownerId: string,
  nome: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into public.players (nome, owner_id) values ($1, $2) returning id',
    [nome, ownerId],
  );
  const playerId = rows[0].id;
  await db.query(
    `insert into public.community_players (community_id, player_id)
     values ($1, $2)
     on conflict do nothing`,
    [communityId, playerId],
  );
  return playerId;
}
