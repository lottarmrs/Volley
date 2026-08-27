import { readFileSync, writeFileSync } from 'node:fs';

const changed = new Set();

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content);
  changed.add(path);
}

function requiredReplace(path, from, to) {
  const content = read(path);
  if (!content.includes(from)) {
    throw new Error(`Required pattern not found in ${path}: ${JSON.stringify(from)}`);
  }
  write(path, content.replace(from, to));
}

function replaceAll(path, from, to) {
  const content = read(path);
  const next = content.split(from).join(to);
  if (next !== content) write(path, next);
}

function replaceRegex(path, regex, replacement) {
  const content = read(path);
  const next = content.replace(regex, replacement);
  if (next !== content) write(path, next);
}

// R10: pre-catalog C4 artifacts are provenance, not competing current registries.
requiredReplace(
  'docs/architecture/governance/C4-REGISTRY-MASTER.md',
  '# C4 — Architecture Registries Master\n\n> Status: `DRAFT-CANONICAL / C4`',
  '# Superseded C4 — Architecture Registries Master (Pre-Catalog)\n\n> Status: `SUPERSEDED / PRE-CATALOG C4`\n>\n> Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`\n>\n> Current registry authority: [`C4-INDEX.md`](../catalogs/C4-INDEX.md), [`INVARIANT-CATALOG.md`](../catalogs/INVARIANT-CATALOG.md), [`OPEN-DECISIONS.md`](../catalogs/OPEN-DECISIONS.md), [`HYPOTHESES.md`](../catalogs/HYPOTHESES.md).\n>\n> This file is retained only as consolidation provenance and must not be used as the current C4 source of truth.',
);

requiredReplace(
  'docs/architecture/governance/INVARIANT-CATALOG.md',
  '# Canonical Invariant Catalog — Volley\n\n> Status: `DRAFT-CANONICAL / C4`',
  '# Superseded Invariant Catalog — Volley (Pre-Catalog)\n\n> Status: `SUPERSEDED / PRE-CATALOG C4`\n>\n> Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`\n>\n> Current invariant authority: [`../catalogs/INVARIANT-CATALOG.md`](../catalogs/INVARIANT-CATALOG.md).\n>\n> The `GINV-001...` identities and `Q*` criticality labels below are historical pre-catalog vocabulary. Current global invariant identities/severity live only in the current catalog.\n>\n> This file is retained only as consolidation provenance.',
);

// R7 clarification: three orthogonal taxonomies, not aliases.
requiredReplace(
  'docs/architecture/governance/C7-R7-SEVERITY-FITNESS-GOVERNANCE.md',
  `Canonical invariant criticality remains exclusively:\n\n\`\`\`text\nI0\nI1\nI2\nI3\n\`\`\`\n\nMeaning and ownership remain in C4.\n\nThe accidental \`Q0/Q1\` notation found in C6 is **not** a synonym and must not survive as an architecture-severity vocabulary.\n\nAudit priority remains independently:\n\n\`\`\`text\nAP0\nAP1\nAP2\nAP3\n\`\`\`\n\nThese taxonomies answer different questions:\n\n\`\`\`text\nI0..I3\n→ how critical is preserving an invariant?\n\nAP0..AP3\n→ how urgently must an audit finding be remediated?\n\`\`\`\n\nDo not infer a numerical mapping such as \`AP0 = I0\`.`,
  `Canonical invariant criticality remains exclusively:\n\n\`\`\`text\nI0\nI1\nI2\nI3\n\`\`\`\n\nMeaning and ownership remain in the current C4 invariant catalog.\n\nN2.20 separately defines QA risk/evidence tiers:\n\n\`\`\`text\nQ0  integrity-critical evidence\nQ1  authoritative-workflow evidence\nQ2  derived/read/recovery evidence\nQ3  presentation/low-risk evidence\n\`\`\`\n\nThis Q-axis is legitimate only as **Quality Engineering test/evidence planning vocabulary**. It is not invariant severity and must not appear in a \`Severity\`/\`Criticality\` field as a substitute for \`I*\`.\n\nAudit priority remains independently:\n\n\`\`\`text\nAP0\nAP1\nAP2\nAP3\n\`\`\`\n\nThe three axes answer different questions:\n\n\`\`\`text\nI0..I3\n→ how critical is preserving an invariant?\n\nQ0..Q3\n→ how much / what kind of QA evidence should a changed risk family receive?\n\nAP0..AP3\n→ how urgently must an audit finding be remediated?\n\`\`\`\n\nThey are not aliases and have no automatic numerical mapping. A critical \`I0\` invariant commonly demands Q0-grade evidence, but that relationship is assigned by the test/release plan rather than encoded as \`Q0/I0\`.`,
);
requiredReplace(
  'docs/architecture/governance/C7-R7-SEVERITY-FITNESS-GOVERNANCE.md',
  'C7-F-014 undefined Q0/Q1 severity\n→ canonical decision resolved; C6 gate source normalized to I0/I1',
  'C7-F-014 Q0/Q1 used as invariant severity\n→ resolved: invariant severity is I0..I3; Q0..Q3 remains a distinct QA risk/evidence tier and C6/C5 must name the axes separately',
);
requiredReplace(
  'docs/architecture/governance/C7-R7-SEVERITY-FITNESS-GOVERNANCE.md',
  'A final R10 lexical/reference rerun must still confirm no stray architecture-critical `Q0/Q1` use remains elsewhere before promotion.',
  'A final R10 lexical/reference rerun must confirm there is no ambiguous `Q*/I*` fusion or use of `Q*` as invariant severity; explicit QA-risk use remains valid.',
);

// R5 lexical propagation.
for (const path of [
  'docs/architecture/EAP-MASTER.md',
  'docs/architecture/contexts/N2.02-player-skill-profile-ownership.md',
  'docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md',
  'docs/architecture/platform/N2.19-observability.md',
]) {
  replaceAll(path, 'Rating projection', 'Player Skill Profile projection');
  replaceAll(path, 'Rating/display', 'Player Skill Profile/display');
  replaceAll(path, 'Rating / Identity sports evaluation', 'Identity / Player — Player Skill Profile');
}

replaceAll('docs/architecture/PRINCIPLES.md', 'RevertEvent', 'RevertMatchEvent');

const glossary = 'docs/architecture/GLOSSARY.md';
replaceAll(glossary, '`RevertEvent`', '`legacy generic revert alias`');
replaceRegex(glossary, /\bRevertEvent\b/g, 'RevertMatchEvent');
replaceRegex(glossary, /^### PlayerMatchStats$/gm, '### Legacy per-Match stats shorthand');
replaceAll(glossary, '`PlayerMatchStats`', '`legacy per-Match stats shorthand`');
replaceAll(glossary, '`correlation_id`', '`generic correlation identifier`');
requiredReplace(
  glossary,
  'O antigo singular `StandingsProjection` é apenas alias textual legado e não deve ser usado para novos nomes de tabela/type/API.',
  'A antiga forma singular é apenas alias textual legado e não deve ser usada para novos nomes de tabela/type/API.',
);

replaceAll(
  'docs/architecture/contexts/N2.07-live-match.md',
  'correlation_id',
  'request_id / trace_id / reference_id conforme o propósito',
);
replaceRegex(
  'docs/architecture/platform/N2.18-performance-scalability.md',
  /(?<!Player)\bMatchStatContribution\b/g,
  'PlayerMatchStatContribution',
);

// Q-axis normalization outside N2.20: I* identifies invariant criticality; Q* may only identify QA evidence risk.
replaceAll(
  'docs/architecture/catalogs/HYPOTHESES.md',
  'Q0/Q1 invariants',
  'I0/I1 invariants in Q0/Q1 QA-risk families',
);

for (const path of [
  'docs/architecture/execution/C6-EXECUTION-MASTER.md',
  'docs/architecture/execution/C6.06-RELEASE-GATES-TRACEABILITY.md',
]) {
  replaceAll(path, 'Q0/I0/Q1/I1 invariants', 'I0/I1 invariants');
  replaceAll(path, 'Q0/I0 or Q1/I1 global invariant', 'I0 or I1 global invariant');
  replaceAll(path, 'Q0/Q1 global/local invariants', 'I0/I1 global/local invariants');
  replaceAll(path, 'Q0/Q1 invariants', 'I0/I1 invariants');
  replaceAll(path, 'Q0/I0', 'I0');
  replaceAll(path, 'Q1/I1', 'I1');
}

requiredReplace(
  'docs/architecture/matrices/C5-MATRICES-MASTER.md',
  'M5-CONFLICT-EVIDENCE\nQ0/I0/I1 rule has no adequate executable evidence',
  'M5-CONFLICT-EVIDENCE\nI0/I1 invariant or Q0/Q1 QA-risk family has no adequate executable evidence',
);
requiredReplace(
  'docs/architecture/matrices/C5.05-PERFORMANCE-OBSERVABILITY-TEST-MATRIX.md',
  '# 13. Q0/I0/I1 evidence matrix\n\nThe following high-impact families must have executable evidence at their owner layer before broad target rollout.',
  '# 13. Critical invariant evidence matrix — I0/I1 + QA risk\n\nThe following high-impact invariant families must have executable evidence at their owner layer before broad target rollout. `I0/I1` describe invariant criticality; N2.20 `Q0..Q3` separately controls QA evidence depth. This matrix does not combine them into one severity code.',
);

// R10 checker: Q* is allowed as QA risk tier; only ambiguous severity fusion is forbidden.
const r10 = 'scripts/check-architecture-r10.mjs';
requiredReplace(
  r10,
  "  { label: 'undefined Q0/Q1 invariant severity', re: /\\bQ[01]\\b/g },\n",
  "  { label: 'ambiguous Q0/I0 severity fusion', re: /\\bQ0\\s*\\/\\s*I0\\b/g },\n  { label: 'ambiguous Q1/I1 severity fusion', re: /\\bQ1\\s*\\/\\s*I1\\b/g },\n  { label: 'Q* used as invariant severity rather than QA risk tier', re: /\\bQ[01]\\s+(?:global\\/local\\s+)?invariants?\\b/gi },\n",
);
requiredReplace(
  r10,
  "  if (!/NOT TARGET SOURCE OF TRUTH/.test(head)) {\n    fail(file, 'legacy domain model lost NOT TARGET SOURCE OF TRUTH warning');\n  }",
  "  if (!/not (?:a )?target source of truth/i.test(head)) {\n    fail(file, 'legacy domain model lost NOT TARGET SOURCE OF TRUTH warning');\n  }",
);

console.log(`C7 R10 remediation changed ${changed.size} file(s):`);
for (const path of [...changed].sort()) console.log(`- ${path}`);
