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
 * Picks the username to persist for a new/edited athlete. A handle belongs to
 * whoever registers an account: this function never mints one. It preserves an
 * existing handle (including a guest's, which is normally none) and otherwise
 * returns undefined — the athlete is addressed by players.id until an account
 * claims a handle.
 */
export function resolveUsername(
  athlete: { nome: string; isGuest?: boolean; username?: string },
  takenUsernames: Iterable<string>,
): string | undefined {
  void takenUsernames;
  return athlete.username;
}
