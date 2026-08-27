import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * XS-W0-01 — Freeze architecture-risk expansion.
 *
 * These rules do NOT remove legacy and do NOT move authority. They pin the currently known
 * legacy coupling to an exact census so NEW target code cannot deepen it without an
 * explicit, reviewed exception.
 *
 * Every rule declares `baseline` as `path -> occurrence count`. The guard asserts exact
 * equality, which blocks three drift directions at once:
 *
 *   1. a new file matching the pattern             -> unlisted path   -> FAIL
 *   2. a new occurrence inside an allowlisted file -> count mismatch  -> FAIL
 *   3. an allowlisted path that no longer matches  -> stale entry     -> FAIL
 *
 * (3) is what keeps the allowlist finite: retiring legacy forces the entry to be deleted,
 * so the allowlist can only shrink as C6 waves progress. No file enters the allowlist
 * implicitly.
 *
 * `src/architecture/` is excluded from every scan because the guards themselves must be
 * able to name the forbidden patterns literally.
 */

export interface LegacyExpansionRule {
  readonly id: string;
  readonly slice: 'XS-W0-01';
  readonly title: string;
  /** Path prefixes to scan. Empty means the whole source tree. */
  readonly include: readonly string[];
  /** Path prefixes removed from the scan. */
  readonly exclude: readonly string[];
  readonly pattern: RegExp;
  readonly baseline: Readonly<Record<string, number>>;
  readonly rationale: string;
}

const SOURCE_ROOT = 'src';
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const GUARD_DIRECTORY = 'src/architecture';

function toPosix(path: string): string {
  return path.split(String.fromCharCode(92)).join('/');
}

export function listSourceFiles(root = SOURCE_ROOT): string[] {
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      const relative = toPosix(absolute);
      if (relative === GUARD_DIRECTORY || relative.startsWith(`${GUARD_DIRECTORY}/`)) continue;
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (SOURCE_EXTENSIONS.some((extension) => relative.endsWith(extension))) {
        files.push(relative);
      }
    }
  };

  walk(root);
  return files.sort();
}

function filesForRule(rule: LegacyExpansionRule): string[] {
  return listSourceFiles().filter((file) => {
    const included =
      rule.include.length === 0 || rule.include.some((prefix) => file.startsWith(prefix));
    const excluded = rule.exclude.some((prefix) => file.startsWith(prefix));
    return included && !excluded;
  });
}

export function countMatches(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return Array.from(source.matchAll(new RegExp(pattern.source, flags))).length;
}

/** Census of `path -> occurrence count` for every in-scope file that matches the rule. */
export function censusFor(rule: LegacyExpansionRule): Record<string, number> {
  const census: Record<string, number> = {};

  for (const file of filesForRule(rule)) {
    const occurrences = countMatches(readFileSync(file, 'utf8'), rule.pattern);
    if (occurrences > 0) census[file] = occurrences;
  }

  return census;
}

/** Property names declared by a TypeScript interface, read from source rather than imported. */
export function interfaceKeys(file: string, interfaceName: string): string[] {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`export interface ${interfaceName} {`);
  if (start < 0) throw new Error(`Interface not found: ${interfaceName} in ${file}`);

  let depth = 0;
  let end = start;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = source.slice(source.indexOf('{', start) + 1, end);
  return Array.from(body.matchAll(/^\s{2}(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/gm))
    .map((match) => match[1])
    .sort();
}

/** Keys of a top-level `export const <name> = { ... }` object literal, read from source. */
export function objectLiteralKeys(file: string, constName: string): string[] {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(`export const ${constName} = {`);
  if (start < 0) throw new Error(`Const not found: ${constName} in ${file}`);

  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = source.slice(open + 1, end);
  return Array.from(body.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm))
    .map((match) => match[1])
    .sort();
}

/**
 * Every binding a module imports, as sorted `source:binding` pairs.
 *
 * Freezing this for the Team Formation solver closes the route that a census of literal
 * `overall` text cannot see: a new, neutrally named module that computes a composite
 * rating and is imported into the objective. `*` marks a namespace import and a bare
 * `source:` marks a side-effect import.
 */
export function moduleImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const pairs: string[] = [];

  const statement =
    /import\s+(?:type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;

  for (const match of source.matchAll(statement)) {
    const [, clause, from, sideEffect] = match;
    if (sideEffect) {
      pairs.push(`${sideEffect}:`);
      continue;
    }

    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      for (const raw of named[1].split(',')) {
        const binding = raw
          .replace(/\btype\b/g, '')
          .trim()
          .split(/\s+as\s+/)[0]
          .trim();
        if (binding) pairs.push(`${from}:${binding}`);
      }
    }

    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) pairs.push(`${from}:*`);

    const defaultBinding = clause
      .replace(/\{[\s\S]*\}/, '')
      .replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '');
    for (const raw of defaultBinding.split(',')) {
      const binding = raw.trim();
      if (binding && /^[A-Za-z_$][\w$]*$/.test(binding)) pairs.push(`${from}:${binding}`);
    }
  }

  return Array.from(new Set(pairs)).sort();
}
