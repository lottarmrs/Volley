import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const architectureRoot = join(repoRoot, 'docs', 'architecture');
const failures = [];
const allowPendingPromotionSha = process.env.ALLOW_PENDING_PROMOTION_SHA === '1';

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

function fail(path, message) {
  failures.push(`${repoPath(path)}: ${message}`);
}

const architectureFiles = walk(architectureRoot);
const targetFiles = architectureFiles.filter((file) => {
  const content = readFileSync(file, 'utf8');
  return !isExplicitlyNonTarget(file, content);
});

for (const file of targetFiles) {
  const content = readFileSync(file, 'utf8');
  const head = firstLines(content);
  if (!/> Status:\s*`CANONICAL\s*\/\s*[^`]+`/.test(head)) {
    fail(file, 'target document is not CANONICAL after R11');
  }
  if (/DRAFT-CANONICAL/.test(head)) fail(file, 'target document still carries DRAFT-CANONICAL status');
}

const manifestPath = join(architectureRoot, 'CANONICAL-MANIFEST.md');
if (!existsSync(manifestPath)) {
  failures.push('docs/architecture/CANONICAL-MANIFEST.md: missing R11 canonical manifest');
} else {
  const manifest = readFileSync(manifestPath, 'utf8');
  if (!/> Status:\s*`CANONICAL \/ R11`/.test(firstLines(manifest))) fail(manifestPath, 'manifest does not carry CANONICAL / R11 status');
  if (!/C6 W0→W14/.test(manifest)) fail(manifestPath, 'manifest lost explicit runtime Current→Target boundary');
  if (!/OPEN-\* remains OPEN/.test(manifest) || !/HYP-\* remains a hypothesis/.test(manifest)) {
    fail(manifestPath, 'manifest does not preserve OPEN/HYP lifecycle semantics');
  }
  const promotionBlock = manifest.match(/Promotion commit:[\s\S]{0,120}?```text\n([^\n]+)\n```/);
  const value = promotionBlock?.[1]?.trim();
  if (!value) fail(manifestPath, 'promotion commit record missing');
  else if (value === 'PENDING_RECORD_AFTER_PROMOTION') {
    if (!allowPendingPromotionSha) fail(manifestPath, 'promotion commit is still pending');
  } else if (!/^[0-9a-f]{40}$/.test(value)) {
    fail(manifestPath, `promotion commit is not a 40-character SHA: ${value}`);
  }
}

const r11Path = join(architectureRoot, 'audit', 'C7-R11-CANONICAL-PROMOTION.md');
if (!existsSync(r11Path)) {
  failures.push('docs/architecture/audit/C7-R11-CANONICAL-PROMOTION.md: missing R11 promotion record');
} else {
  const content = readFileSync(r11Path, 'utf8');
  if (!/> Status:\s*`R11-COMPLETE \/ PROMOTION-RECORD`/.test(firstLines(content))) fail(r11Path, 'unexpected R11 record status');
  if (!/C7-F-023/.test(content) || !/AP2/.test(content) || !/non-freezing/i.test(content)) {
    fail(r11Path, 'R11 record lost the non-blocking C7-F-023 classification');
  }
  const promotionBlock = content.match(/Promotion commit:[\s\S]{0,120}?```text\n([^\n]+)\n```/);
  const value = promotionBlock?.[1]?.trim();
  if (!value) fail(r11Path, 'promotion commit record missing');
  else if (value === 'PENDING_RECORD_AFTER_PROMOTION') {
    if (!allowPendingPromotionSha) fail(r11Path, 'promotion commit is still pending');
  } else if (!/^[0-9a-f]{40}$/.test(value)) {
    fail(r11Path, `promotion commit is not a 40-character SHA: ${value}`);
  }
}

const verdictPath = join(architectureRoot, 'audit', 'C7-COMPLETENESS-VERDICT.md');
{
  const content = readFileSync(verdictPath, 'utf8');
  if (!/> Status:\s*`CANONICAL-PROMOTED \/ R11-COMPLETE`/.test(firstLines(content))) {
    fail(verdictPath, 'final C7 verdict is not marked R11 complete');
  }
  if (/CANONICAL PROMOTION\n=\nREADY FOR R11/.test(content)) fail(verdictPath, 'final verdict still says promotion is only ready');
  if (/corpus therefore remains `DRAFT-CANONICAL`/i.test(content)) fail(verdictPath, 'final verdict still claims corpus is draft');
  if (!/PRODUCTION\/RUNTIME PARITY[\s\S]*NOT CLAIMED/.test(content)) fail(verdictPath, 'final verdict lost runtime-parity disclaimer');
}

const remediationPath = join(architectureRoot, 'audit', 'C7-REMEDIATION-STATUS.md');
{
  const content = readFileSync(remediationPath, 'utf8');
  if (!/> Status:\s*`R11-COMPLETE \/ CANONICAL-PROMOTED`/.test(firstLines(content))) {
    fail(remediationPath, 'remediation status is not marked R11 complete');
  }
}

// Canonical registries may be canonical documents while records remain open/hypothetical.
const openPath = join(architectureRoot, 'catalogs', 'OPEN-DECISIONS.md');
const hypPath = join(architectureRoot, 'catalogs', 'HYPOTHESES.md');
{
  const open = readFileSync(openPath, 'utf8');
  const hyp = readFileSync(hypPath, 'utf8');
  if (!/> Status:\s*`CANONICAL \/ C4`/.test(firstLines(open))) fail(openPath, 'Open Decision registry document is not canonical');
  if (!/\bOPEN-[A-Z0-9-]+\b/.test(open)) fail(openPath, 'Open Decision identities disappeared during promotion');
  if (!/not an implementation default/i.test(open)) fail(openPath, 'Open Decision non-default rule disappeared during promotion');
  if (!/> Status:\s*`CANONICAL \/ C4`/.test(firstLines(hyp))) fail(hypPath, 'Hypothesis registry document is not canonical');
  if (!/\bHYP-[A-Z0-9-]+\b/.test(hyp)) fail(hypPath, 'Hypothesis identities disappeared during promotion');
}

// Explicitly non-target material must remain non-target.
const domainModelPath = join(architectureRoot, 'domain-model.md');
{
  const head = firstLines(readFileSync(domainModelPath, 'utf8'), 35);
  if (!/TRANSITIONAL \/ LEGACY CURRENT-MODEL REFERENCE/.test(head)) fail(domainModelPath, 'legacy domain model lost transitional classification');
  if (!/NOT TARGET SOURCE OF TRUTH/i.test(head)) fail(domainModelPath, 'legacy domain model lost non-target warning');
}

const historicalRegistryPath = join(architectureRoot, 'governance', 'OPEN-DECISIONS-HYPOTHESES.md');
{
  const head = firstLines(readFileSync(historicalRegistryPath, 'utf8'));
  if (!/SUPERSEDED \/ PRE-CATALOG C4/.test(head)) fail(historicalRegistryPath, 'superseded pre-catalog registry was accidentally promoted');
}

if (failures.length > 0) {
  console.error(`R11 canonical promotion check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`R11 canonical promotion check passed: ${targetFiles.length} target architecture documents are CANONICAL; lifecycle/runtime exclusions preserved.`);
}
