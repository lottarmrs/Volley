import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const architectureRoot = join(repoRoot, 'docs', 'architecture');
const apply = process.argv.includes('--apply');
const failures = [];
const changed = [];

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

function firstLines(content, count = 30) {
  return content.split(/\r?\n/).slice(0, count).join('\n');
}

function isExplicitlyNonTarget(file, content) {
  const path = repoPath(file);
  if (path.startsWith('docs/architecture/audit/')) return true;
  if (/\/C7-[^/]+\.md$/.test(path)) return true;
  const head = firstLines(content);
  return /Status:\s*`(?:HISTORICAL|SUPERSEDED|TRANSITIONAL)/i.test(head)
    || /NOT TARGET SOURCE OF TRUTH/i.test(head)
    || /Canonical-ID namespace:\s*`HISTORICAL-SOURCE-ALIASES`/.test(head);
}

function replaceExactly(content, from, to, label) {
  const count = content.split(from).length - 1;
  if (count !== 1) {
    failures.push(`${label}: expected exactly one occurrence, found ${count}`);
    return content;
  }
  return content.replace(from, to);
}

function writeChanged(path, original, next) {
  if (original === next) return;
  changed.push(repoPath(path));
  if (apply) writeFileSync(path, next, 'utf8');
}

const architectureFiles = walk(architectureRoot);
const targetFiles = architectureFiles.filter((file) => {
  const content = readFileSync(file, 'utf8');
  return !isExplicitlyNonTarget(file, content);
});

// R10 proved 46 target documents before the R11 manifest exists.
// On an idempotent rerun, CANONICAL-MANIFEST.md is the 47th target document.
const manifestPath = join(architectureRoot, 'CANONICAL-MANIFEST.md');
const expectedTargetCount = existsSync(manifestPath) ? 47 : 46;
if (targetFiles.length !== expectedTargetCount) {
  failures.push(`target corpus count drift: expected ${expectedTargetCount}, found ${targetFiles.length}`);
}

for (const file of targetFiles) {
  const original = readFileSync(file, 'utf8');
  const head = firstLines(original);
  const draftMatch = head.match(/> Status:\s*`DRAFT-CANONICAL\s*\/\s*([^`]+)`/);
  const canonicalMatch = head.match(/> Status:\s*`CANONICAL\s*\/\s*([^`]+)`/);

  if (!draftMatch && !canonicalMatch) {
    failures.push(`${repoPath(file)}: target document does not have DRAFT-CANONICAL or CANONICAL status`);
    continue;
  }

  if (draftMatch) {
    const next = original.replace(
      /^(> Status:\s*`)DRAFT-CANONICAL(\s*\/\s*[^`]+`)/m,
      '$1CANONICAL$2',
    );
    writeChanged(file, original, next);
  }
}

const verdictPath = join(architectureRoot, 'audit', 'C7-COMPLETENESS-VERDICT.md');
{
  const original = readFileSync(verdictPath, 'utf8');
  let next = original;
  if (next.includes('R10-PASS / READY-FOR-R11-PROMOTION')) {
    next = replaceExactly(
      next,
      '> Status: `R10-PASS / READY-FOR-R11-PROMOTION`',
      '> Status: `CANONICAL-PROMOTED / R11-COMPLETE`',
      'C7 completeness status',
    );
    next = replaceExactly(
      next,
      'COMPLETE ENOUGH FOR CANONICAL PROMOTION REVIEW',
      'CANONICAL / GOVERNING TARGET ARCHITECTURE',
      'C7 target verdict',
    );
    next = replaceExactly(
      next,
      'CANONICAL PROMOTION\n=\nREADY FOR R11',
      'CANONICAL PROMOTION\n=\nCOMPLETE / R11',
      'C7 promotion verdict',
    );
    next = next.replace(
      'R11 remains a distinct deliberate step because:\n\n```text\nR10 PASS\n≠\nSILENT STATUS PROMOTION\n```\n\nThe corpus therefore remains `DRAFT-CANONICAL` until R11 performs the reviewable promotion change.',
      'R11 was executed as a distinct deliberate promotion after R10 PASS. The promoted corpus is now the governing target architecture; this status change does not claim runtime parity or close registered OPEN/HYP items.',
    );
    next = next.replace('R11 PROMOTION REVIEW\n= AUTHORIZED TO START', 'R11 CANONICAL PROMOTION\n= COMPLETE');
    next = next.replace('# 9. What R11 may promote', '# 9. What R11 promoted');
    next = next.replace('CANONICAL PROMOTION\n=\nREADY FOR R11', 'CANONICAL PROMOTION\n=\nCOMPLETE / R11');
    next = next.replace(
      'The next correct step is:\n\n```text\nR11 DELIBERATE CANONICAL PROMOTION\n→\nEXECUTE C6 SLICES UNDER THE PROMOTED TARGET\n```',
      'The next correct step is:\n\n```text\nEXECUTE C6 SLICES UNDER THE PROMOTED TARGET\n```',
    );
  } else if (!next.includes('CANONICAL-PROMOTED / R11-COMPLETE')) {
    failures.push('C7 completeness verdict is not in the approved R10-ready or R11-complete state');
  }
  writeChanged(verdictPath, original, next);
}

const remediationPath = join(architectureRoot, 'audit', 'C7-REMEDIATION-STATUS.md');
{
  const original = readFileSync(remediationPath, 'utf8');
  let next = original;
  if (next.includes('R10-PASS / READY-FOR-R11')) {
    next = replaceExactly(
      next,
      '> Status: `R10-PASS / READY-FOR-R11`',
      '> Status: `R11-COMPLETE / CANONICAL-PROMOTED`',
      'C7 remediation status',
    );
    next = next.replaceAll('READY-FOR-R11', 'R11-COMPLETE');
    next = next.replaceAll('READY FOR R11', 'PROMOTED BY R11');
  } else if (!next.includes('R11-COMPLETE / CANONICAL-PROMOTED')) {
    failures.push('C7 remediation status is not in the approved R10-ready or R11-complete state');
  }
  writeChanged(remediationPath, original, next);
}

const r11RecordPath = join(architectureRoot, 'audit', 'C7-R11-CANONICAL-PROMOTION.md');
const r11Record = `# C7 R11 — Canonical Promotion Record\n\n> Status: \`R11-COMPLETE / PROMOTION-RECORD\`\n>\n> Owner: \`Architecture Governance\`\n>\n> Promotion date: \`2026-08-27\`\n>\n> R10 evidence: [\`C7-R10-RERUN.md\`](./C7-R10-RERUN.md)\n>\n> Governing manifest: [\`CANONICAL-MANIFEST.md\`](../CANONICAL-MANIFEST.md)\n\n---\n\n# 0. Promotion decision\n\nR10 satisfied the promotion gates: AP0 unresolved = 0, AP1 freezing blockers = 0, mechanical audit PASS, semantic audit 20/20 PASS, unexplained Current→Target mismatch = 0.\n\nTherefore R11 deliberately promotes the audited target corpus from \`DRAFT-CANONICAL\` to \`CANONICAL\`.\n\nThis promotion means:\n\n\`\`\`text\nTHE PROMOTED CORPUS\nIS THE GOVERNING TARGET ARCHITECTURE\n\`\`\`\n\nIt does not mean:\n\n\`\`\`text\nPRODUCTION RUNTIME PARITY\nC6 W0→W14 COMPLETE\nOPEN-* CLOSED\nHYP-* VALIDATED\nLEGACY REMOVED\n\`\`\`\n\n# 1. Promotion order\n\nThe promotion follows the audited sequence:\n\n\`\`\`text\nPRINCIPLES + GLOSSARY\n→ EAP\n→ owner N2 chapters\n→ ADR Catalog\n→ C4 registries\n→ C5 matrices\n→ C6 execution program\n→ C7 final verdict/status\n\`\`\`\n\nThe document-level C4 registries become canonical registries while each internal \`OPEN-*\` / \`HYP-*\` record preserves its own lifecycle state.\n\n# 2. Explicit exclusions\n\nR11 does not promote material explicitly classified as \`TRANSITIONAL\`, \`HISTORICAL\`, \`SUPERSEDED\`, audit evidence, or \`NOT TARGET SOURCE OF TRUTH\`.\n\nIn particular, \`docs/architecture/domain-model.md\` remains transitional legacy/current-model evidence.\n\n# 3. Runtime boundary\n\nCurrent runtime mismatches remain governed by C6 W0→W14. The Authority Ledger must be materialized before any real slice reaches \`CUTOVER_ACTIVE\`.\n\n# 4. Non-blocking repository finding\n\n\`C7-F-023\` remains AP2 / non-freezing: the orphan \`9router\` gitlink must be removed or restored as a valid submodule. The temporary/manual checkout workaround is not target repository health.\n\n# 5. Evidence\n\nPromotion baseline R10 HEAD:\n\n\`\`\`text\nb275ef9ea7dfc2acf4ebac6985f38ca674f2c083\n\`\`\`\n\nPromotion commit:\n\n\`\`\`text\nPENDING_RECORD_AFTER_PROMOTION\n\`\`\`\n\nThe exact promotion commit is recorded after the promotion commit exists; the permanent R11 checker rejects the placeholder on the final branch state.\n`;
if (existsSync(r11RecordPath)) {
  const original = readFileSync(r11RecordPath, 'utf8');
  if (original !== r11Record && original.includes('PENDING_RECORD_AFTER_PROMOTION')) {
    failures.push('existing R11 promotion record differs from deterministic expected content');
  }
} else {
  changed.push(repoPath(r11RecordPath));
  if (apply) writeFileSync(r11RecordPath, r11Record, 'utf8');
}

const manifest = `# Canonical Architecture Manifest — Volley\n\n> Status: \`CANONICAL / R11\`\n>\n> Owner: \`Architecture Governance\`\n>\n> Promotion date: \`2026-08-27\`\n>\n> Promotion record: [\`C7-R11-CANONICAL-PROMOTION.md\`](./audit/C7-R11-CANONICAL-PROMOTION.md)\n\n---\n\n# 0. Meaning of CANONICAL\n\nThe promoted corpus is the default governing **target architecture** for product/domain/platform decisions.\n\n\`CANONICAL\` does not assert that the current production/runtime implementation already conforms. Current→Target execution remains C6 W0→W14.\n\n# 1. Authority order\n\n\`\`\`text\nPRINCIPLES / GLOSSARY\n→ EAP N2 ownership and scope\n→ owner N2 detailed semantics\n→ ADR decision identities\n→ C4 invariants / Open Decisions / Hypotheses\n→ C5 cross-cutting implementation matrices\n→ C6 Current→Target execution program\n→ C7 audit/promotion evidence\n\`\`\`\n\nWhen sources appear to conflict, follow the ownership/governance rules in N2.23 and reopen the contradiction rather than silently choosing an implementation-friendly interpretation.\n\n# 2. Lifecycle preservation\n\nCanonicalization of a registry document does not alter the lifecycle of its records.\n\n\`\`\`text\nOPEN-* remains OPEN until its trigger/owner closes it.\nHYP-* remains a hypothesis until validated/rejected/superseded.\nTRANSITIONAL/HISTORICAL/SUPERSEDED material remains non-target evidence.\n\`\`\`\n\n# 3. Runtime boundary\n\nThe following are not implied by promotion:\n\n- C6 waves completed;\n- production parity achieved;\n- legacy sync/localStorage/CRUD/schema removed;\n- Authority Ledger already live;\n- quantitative SLO/RPO/RTO or provider choices silently decided.\n\n# 4. Promotion evidence\n\nR10 baseline:\n\n\`\`\`text\ncommit b275ef9ea7dfc2acf4ebac6985f38ca674f2c083\nworkflow Architecture Reference Check\nrun 33038116019\nR10 machine PASS\nR10 semantic 20/20 PASS\nAP0 = 0\nAP1 freezing blockers = 0\n\`\`\`\n\nPromotion commit:\n\n\`\`\`text\nPENDING_RECORD_AFTER_PROMOTION\n\`\`\`\n\n# 5. Known non-freezing debt\n\n\`C7-F-023\` (orphan \`9router\` gitlink) remains AP2 repository/CI hygiene and is not reclassified as solved by R11.\n`;
if (existsSync(manifestPath)) {
  const original = readFileSync(manifestPath, 'utf8');
  if (!original.includes('> Status: `CANONICAL / R11`')) failures.push('existing canonical manifest has unexpected status');
} else {
  changed.push(repoPath(manifestPath));
  if (apply) writeFileSync(manifestPath, manifest, 'utf8');
}

const packagePath = join(repoRoot, 'package.json');
{
  const original = readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(original);
  const desired = 'node scripts/check-architecture-references.mjs && node scripts/check-architecture-r10.mjs && node scripts/check-architecture-r11.mjs';
  if (pkg.scripts['check:architecture'] !== desired || pkg.scripts['check:architecture:r11'] !== 'node scripts/check-architecture-r11.mjs') {
    pkg.scripts['check:architecture'] = desired;
    pkg.scripts['check:architecture:r11'] = 'node scripts/check-architecture-r11.mjs';
    const next = `${JSON.stringify(pkg, null, 2)}\n`;
    writeChanged(packagePath, original, next);
  }
}

if (failures.length > 0) {
  console.error(`R11 promotion preflight failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!apply) {
  console.log(`R11 promotion preflight passed. ${changed.length} path(s) would change.`);
} else {
  console.log(`R11 promotion applied. ${changed.length} path(s) changed.`);
  for (const path of changed) console.log(`- ${path}`);
}
