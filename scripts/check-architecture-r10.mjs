import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
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

function firstLines(content, count = 24) {
  return content.split(/\r?\n/).slice(0, count).join('\n');
}

function isExplicitlyNonTarget(file, content) {
  const path = repoPath(file);
  if (path.startsWith('docs/architecture/audit/')) return true;
  if (/\/C7-[^/]+\.md$/.test(path)) return true;
  const head = firstLines(content, 30);
  return /Status:\s*`(?:HISTORICAL|SUPERSEDED|TRANSITIONAL)/i.test(head)
    || /NOT TARGET SOURCE OF TRUTH/i.test(head)
    || /Canonical-ID namespace:\s*`HISTORICAL-SOURCE-ALIASES`/.test(head);
}

const architectureFiles = walk(architectureRoot);
const operationsFiles = walk(operationsRoot);
const targetArchitectureFiles = architectureFiles.filter((file) => {
  const content = readFileSync(file, 'utf8');
  return !isExplicitlyNonTarget(file, content);
});

const forbiddenTargetLexemes = [
  { label: 'deprecated Match command alias RevertEvent', re: /\bRevertEvent\b/g },
  { label: 'deprecated singular StandingProjection', re: /\bStandingProjection\b/g },
  { label: 'deprecated PlayerMatchStats entity alias', re: /\bPlayerMatchStats\b/g },
  { label: 'ambiguous Request ID / Correlation ID heading', re: /Request ID\s*\/\s*Correlation ID/g },
  { label: 'ambiguous Q0/I0 severity fusion', re: /\bQ0\s*\/\s*I0\b/g },
  { label: 'ambiguous Q1/I1 severity fusion', re: /\bQ1\s*\/\s*I1\b/g },
  { label: 'Q* used as invariant severity rather than QA risk tier', re: /\bQ[01]\s+(?:global\/local\s+)?invariants?\b/gi },
  { label: 'orphan Rating projection owner label', re: /\bRating projection\b/g },
  { label: 'orphan Rating\/display owner label', re: /\bRating\/display\b/g },
  { label: 'orphan Rating \/ Identity sports evaluation owner label', re: /\bRating \/ Identity sports evaluation\b/g },
  { label: 'ambiguous canonical correlation_id catch-all', re: /\bcorrelation_id\b/g },
];

for (const file of targetArchitectureFiles) {
  const content = readFileSync(file, 'utf8');
  for (const rule of forbiddenTargetLexemes) {
    const matches = [...content.matchAll(rule.re)];
    if (matches.length > 0) {
      const sample = matches.slice(0, 3).map((m) => m[0]).join(', ');
      fail(file, `${rule.label} (${matches.length} occurrence(s); sample: ${sample})`);
    }
  }

  const genericContribution = [...content.matchAll(/\bMatchStatContribution\b/g)]
    .filter((m) => content.slice(Math.max(0, m.index - 6), m.index) !== 'Player');
  if (genericContribution.length > 0) {
    fail(file, `noncanonical MatchStatContribution alias (${genericContribution.length} occurrence(s)); use PlayerMatchStatContribution for the canonical entity`);
  }
}

// All operational docs capable of influencing production must self-classify visibly.
for (const file of operationsFiles) {
  const content = readFileSync(file, 'utf8');
  const head = firstLines(content, 30);
  if (!/> Status:\s*`[^`]+`/.test(head)) fail(file, 'missing visible Status header');
  if (!/> Owner:\s*`[^`]+`/.test(head)) fail(file, 'missing visible Owner header');
  if (!/> Last reviewed:\s*`[^`]+`/.test(head)) fail(file, 'missing visible Last reviewed header');
  if (!/(Governing target|Current migration authority|Current reconstruction authority|Current operations authority):/i.test(head)) {
    fail(file, 'missing governing/current architecture authority pointer in header');
  }
}

// Known legacy architecture authority collision must remain visibly classified.
{
  const file = join(architectureRoot, 'domain-model.md');
  const head = firstLines(readFileSync(file, 'utf8'), 35);
  if (!/TRANSITIONAL \/ LEGACY CURRENT-MODEL REFERENCE/.test(head)) {
    fail(file, 'legacy domain model lost TRANSITIONAL classification');
  }
  if (!/not (?:a )?target source of truth/i.test(head)) {
    fail(file, 'legacy domain model lost NOT TARGET SOURCE OF TRUTH warning');
  }
}

// Superseded pre-catalog registry may retain old source aliases only under explicit namespace classification.
{
  const file = join(architectureRoot, 'governance', 'OPEN-DECISIONS-HYPOTHESES.md');
  const head = firstLines(readFileSync(file, 'utf8'), 30);
  if (!/Status:\s*`SUPERSEDED \/ PRE-CATALOG C4`/.test(head)) {
    fail(file, 'pre-catalog Open/Hyp registry is not visibly SUPERSEDED');
  }
  if (!/Canonical-ID namespace:\s*`HISTORICAL-SOURCE-ALIASES`/.test(head)) {
    fail(file, 'pre-catalog Open/Hyp registry lacks historical alias namespace marker');
  }
}

// C7 F-020: legacy global/staff roles must be explicitly scoped away from domain roles.
{
  const file = join(operationsRoot, 'auth-production-checklist.md');
  const head = firstLines(readFileSync(file, 'utf8'), 32);
  if (!/platform\/staff authorization vocabulary only/i.test(head)) {
    fail(file, 'legacy master/programmer role vocabulary is not explicitly scoped as platform/staff authorization');
  }
  if (!/OWNER \| ADMIN \| MEMBER/.test(head) || !/ORGANIZER/.test(head)) {
    fail(file, 'legacy role scope does not explicitly separate Community governance and Organizer responsibility');
  }
}

// C7 F-022: schema.sql must be self-described in the directory until W0 normalizes the physical history.
{
  const file = join(repoRoot, 'supabase', 'migrations', 'README.md');
  if (!existsSync(file)) {
    failures.push('supabase/migrations/README.md: missing schema authority notice');
  } else {
    const content = readFileSync(file, 'utf8');
    if (!/schema\.sql[\s\S]*FROZEN LEGACY BASELINE SEGMENT/.test(content)) {
      fail(file, 'schema.sql is not explicitly classified as frozen legacy baseline segment');
    }
    if (!/numbered migration files[\s\S]*FORWARD DELTA SEGMENTS/i.test(content)) {
      fail(file, 'numbered migrations are not explicitly classified as forward delta segments');
    }
  }
}

// Local invariant exact references must resolve to an owner N2 definition.
const ownerN2Files = targetArchitectureFiles.filter((file) => /\/N2\.\d{2}[^/]*\.md$/.test(repoPath(file)));
const localInvariantPattern = /\b(?:PX|ID|COM|SES|REG|BAL|MATCH|COMP|STAT|NOTIF|MEDIA|OFFLINE|RT|DATA|API|SEC|REL|PERF|OBS|QA|OPS|MIG|GOV)-INV-\d{3}\b/g;
const definedLocalInvariants = new Set();
for (const file of ownerN2Files) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(localInvariantPattern)) definedLocalInvariants.add(match[0]);
}
for (const file of targetArchitectureFiles) {
  const content = readFileSync(file, 'utf8');
  for (const id of new Set(content.match(localInvariantPattern) ?? [])) {
    if (!definedLocalInvariants.has(id)) fail(file, `unknown exact local invariant reference: ${id}`);
  }
}

// C6 slice references outside the execution program must resolve to an ID present in execution docs.
const executionRoot = join(architectureRoot, 'execution');
const executionFiles = walk(executionRoot);
const slicePattern = /\bXS-W(?:[0-9]|1[0-4])-\d{2}\b/g;
const knownSlices = new Set();
for (const file of executionFiles) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(slicePattern)) knownSlices.add(match[0]);
}
for (const file of targetArchitectureFiles) {
  if (repoPath(file).startsWith('docs/architecture/execution/')) continue;
  const content = readFileSync(file, 'utf8');
  for (const id of new Set(content.match(slicePattern) ?? [])) {
    if (!knownSlices.has(id)) fail(file, `unknown C6 execution slice reference: ${id}`);
  }
}

if (failures.length > 0) {
  console.error(`C7 R10 architecture audit check failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `C7 R10 architecture audit check passed: ${targetArchitectureFiles.length} target architecture docs, ${operationsFiles.length} operational docs, ${definedLocalInvariants.size} local invariant IDs and ${knownSlices.size} C6 slice IDs validated.`,
  );
}
