/**
 * Deterministic, human-readable global handles for athletes.
 *
 * A username is a slug of the athlete's full name (accents stripped), unique
 * across the whole roster. Used as the stable cross-community/cross-account
 * handle for the global athlete identity (players.id).
 */

const FALLBACK_SLUG = 'atleta';

/**
 * Turns a display name into a lowercase, accent-free, hyphenated slug.
 * `"Thaís Lottar"` -> `"thais-lottar"`. Returns '' when the name has no
 * slug-able characters (caller decides the fallback).
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

/**
 * Returns a username for `name` that is not already in `taken`, appending a
 * numeric suffix (`-2`, `-3`, ...) on collision. Mutates `taken` with the
 * result so repeated calls stay unique.
 */
export function generateUsername(name: string, taken: Set<string>): string {
  const base = slugify(name) || FALLBACK_SLUG;
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Batch version for backfilling: assigns a unique username to each name in
 * order, so the output is deterministic for a given input list.
 */
export function generateUsernames(names: string[], taken: Set<string> = new Set()): string[] {
  return names.map((name) => generateUsername(name, taken));
}

/**
 * Picks the username to persist for a new/edited athlete:
 * - guests never get a handle (returns whatever they already had, usually none);
 * - an athlete that already has a handle keeps it (handles are stable);
 * - a blank/slug-less name yields none (assign later when the name is set);
 * - otherwise derives a fresh unique slug, avoiding `takenUsernames`.
 */
export function resolveUsername(
  athlete: { nome: string; isGuest?: boolean; username?: string },
  takenUsernames: Iterable<string>,
): string | undefined {
  if (athlete.isGuest) return athlete.username;
  if (athlete.username) return athlete.username;
  if (!slugify(athlete.nome)) return undefined;
  return generateUsername(athlete.nome, new Set(takenUsernames));
}
