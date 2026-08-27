import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const architectureRoot = join(repoRoot, 'docs', 'architecture');
const operationsRoot = join(repoRoot, 'docs', 'operations');

const failures = [];

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (stat.isFile() && extname(path).toLowerCase() === '.md') out.push(path);
  }
  return out;
}

function repoPath(path) {
  return relative(repoRoot, path).split(sep).join('/');
}

function fail(file, message) {
  failures.push(`${repoPath(file)}: ${message}`);
}

function stripMarkdownTarget(raw) {
  let target = raw.trim();
  if (target.startsWith('<') && target.includes('>')) {
    target = target.slice(1, target.indexOf('>'));
  } else {
    // Markdown optional title: (path "title"). Repository paths intentionally do not use spaces.
    const titleMatch = target.match(/^(\S+)\s+["'][^"']*["']$/);
    if (titleMatch) target = titleMatch[1];
  }
  return target;
}

function isExternal(target) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target);
}

function checkRelativeLinks(file, content) {
  const linkRe = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;
  for (const match of content.matchAll(linkRe)) {
    const target = stripMarkdownTarget(match[1]);
    if (!target || target.startsWith('#') || isExternal(target)) continue;

    const [pathPart] = target.split('#', 1);
    if (!pathPart) continue;

    let decoded;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      fail(file, `invalid percent-encoding in Markdown target ${JSON.stringify(target)}`);
      continue;
    }

    const resolved = normalize(resolve(dirname(file), decoded));
    if (!resolved.startsWith(repoRoot + sep) && resolved !== repoRoot) {
      fail(file, `relative link escapes repository: ${target}`);
      continue;
    }

    if (!existsSync(resolved)) {
      fail(file, `broken relative Markdown link: ${target} -> ${repoPath(resolved)}`);
    }
  }
}

function collectIds(file, pattern) {
  const content = readFileSync(file, 'utf8');
  return new Set([...content.matchAll(pattern)].map((m) => m[0]));
}

const adrCatalog = join(architectureRoot, 'adr', 'ADR-CATALOG.md');
const invariantCatalog = join(architectureRoot, 'catalogs', 'INVARIANT-CATALOG.md');
const openCatalog = join(architectureRoot, 'catalogs', 'OPEN-DECISIONS.md');
const hypothesisCatalog = join(architectureRoot, 'catalogs', 'HYPOTHESES.md');

const ID_PATTERNS = {
  ADR: /\bADR-[A-Z][A-Z0-9]*-\d{3}\b/g,
  GINV: /\bGINV-[A-Z0-9]+-\d{3}\b/g,
  OPEN: /\bOPEN-[A-Z0-9]+-\d{3}\b/g,
  HYP: /\bHYP-[A-Z0-9]+-\d{3}\b/g,
};

const knownIds = {
  ADR: collectIds(adrCatalog, ID_PATTERNS.ADR),
  GINV: collectIds(invariantCatalog, ID_PATTERNS.GINV),
  OPEN: collectIds(openCatalog, ID_PATTERNS.OPEN),
  HYP: collectIds(hypothesisCatalog, ID_PATTERNS.HYP),
};

function checkCanonicalIds(file, content) {
  if (content.includes('Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`')) return;

  for (const [kind, pattern] of Object.entries(ID_PATTERNS)) {
    const seen = new Set(content.match(pattern) ?? []);
    for (const id of seen) {
      if (!knownIds[kind].has(id)) {
        fail(file, `unknown canonical ${kind} reference: ${id}`);
      }
    }
  }
}

function checkEapCanonicalPaths() {
  const eap = join(architectureRoot, 'EAP-MASTER.md');
  const content = readFileSync(eap, 'utf8');
  const paths = new Set(
    [...content.matchAll(/`(docs\/architecture\/[^`\n]+\.md)`/g)].map((m) => m[1]),
  );

  for (const path of paths) {
    const absolute = join(repoRoot, path);
    if (!existsSync(absolute)) fail(eap, `registered canonical path does not exist: ${path}`);
  }
}

function checkDuplicateN3Ids(file, content) {
  if (!/\/N2\.\d{2}[^/]*\.md$/.test(repoPath(file))) return;

  const counts = new Map();
  const headingRe = /^#{1,6}\s+.*?\b(N3\.\d{2}\.\d{2})\b.*$/gm;
  for (const match of content.matchAll(headingRe)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    if (count > 1) fail(file, `duplicate N3 heading ID ${id} (${count} occurrences)`);
  }
}

const markdownFiles = [...walk(architectureRoot), ...walk(operationsRoot)];

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  checkRelativeLinks(file, content);
  checkCanonicalIds(file, content);
  checkDuplicateN3Ids(file, content);
}

checkEapCanonicalPaths();

if (failures.length > 0) {
  console.error(`Architecture reference check failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture reference check passed: ${markdownFiles.length} Markdown files, canonical IDs and N3 headings validated.`,
  );
}
