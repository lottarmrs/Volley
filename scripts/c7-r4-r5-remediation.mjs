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
    throw new Error(`Required remediation pattern not found in ${path}: ${JSON.stringify(from)}`);
  }
  write(path, content.replace(from, to));
}

function replaceRegex(path, regex, replacement) {
  const content = read(path);
  const next = content.replace(regex, replacement);
  if (next !== content) write(path, next);
}

function replaceLiteralEverywhere(path, from, to) {
  const content = read(path);
  const next = content.split(from).join(to);
  if (next !== content) write(path, next);
}

// R4 — physical Markdown links in context-owned chapters.
const notif = 'docs/architecture/contexts/N2.10-notifications.md';
requiredReplace(
  notif,
  '[`N2.12-online-offline.md`](./N2.12-online-offline.md)',
  '[`N2.12-online-offline.md`](../platform/N2.12-online-offline.md)',
);
requiredReplace(
  notif,
  '[`N2.13-realtime.md`](./N2.13-realtime.md)',
  '[`N2.13-realtime.md`](../platform/N2.13-realtime.md)',
);
requiredReplace(
  notif,
  '[`N2.15-api-application-layer.md`](./N2.15-api-application-layer.md)',
  '[`N2.15-api-application.md`](../platform/N2.15-api-application.md)',
);
requiredReplace(
  notif,
  '[`N2.16-security-privacy-lgpd.md`](./N2.16-security-privacy-lgpd.md)',
  '[`N2.16-security-privacy-lgpd.md`](../security/N2.16-security-privacy-lgpd.md)',
);
requiredReplace(
  notif,
  '[`N2.17-reliability.md`](./N2.17-reliability.md)',
  '[`N2.17-reliability.md`](../platform/N2.17-reliability.md)',
);

const media = 'docs/architecture/contexts/N2.11-media.md';
requiredReplace(
  media,
  '[`N2.12-online-offline.md`](./N2.12-online-offline.md)',
  '[`N2.12-online-offline.md`](../platform/N2.12-online-offline.md)',
);
requiredReplace(
  media,
  '[`N2.15-api-application-layer.md`](./N2.15-api-application-layer.md)',
  '[`N2.15-api-application.md`](../platform/N2.15-api-application.md)',
);
requiredReplace(
  media,
  '[`N2.16-security-privacy-lgpd.md`](./N2.16-security-privacy-lgpd.md)',
  '[`N2.16-security-privacy-lgpd.md`](../security/N2.16-security-privacy-lgpd.md)',
);
requiredReplace(
  media,
  '[`N2.17-reliability.md`](./N2.17-reliability.md)',
  '[`N2.17-reliability.md`](../platform/N2.17-reliability.md)',
);

// R4 — superseded pre-catalog registry is retained as provenance, not as a second canonical ID namespace.
const legacyRegistry = 'docs/architecture/governance/OPEN-DECISIONS-HYPOTHESES.md';
requiredReplace(
  legacyRegistry,
  '# Canonical Open Decision / Hypothesis Registry — Volley',
  '# Superseded Open Decision / Hypothesis Registry — Volley',
);
requiredReplace(
  legacyRegistry,
  '> Status: `DRAFT-CANONICAL / C4`',
  '> Status: `SUPERSEDED / PRE-CATALOG C4`\n>\n> Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`\n>\n> Current authorities: [`OPEN-DECISIONS.md`](../catalogs/OPEN-DECISIONS.md) and [`HYPOTHESES.md`](../catalogs/HYPOTHESES.md).\n>\n> This file is preserved only as consolidation provenance. Its local `HYP-*` labels are historical source aliases unless the exact ID also exists in the current canonical catalog.',
);
requiredReplace(
  legacyRegistry,
  '> Normative detail: C2.01–C2.23 `OPEN`, `STRONG HYPOTHESIS`, `HYPOTHESES`, and equivalent sections.',
  '> Historical source detail: C2.01–C2.23 `OPEN`, `STRONG HYPOTHESIS`, `HYPOTHESES`, and equivalent sections as they existed before the current C4 catalogs superseded this registry.',
);

// The checker validates current canonical IDs, while explicitly classified historical source registries remain link-checked but not namespace-checked.
const checker = 'scripts/check-architecture-references.mjs';
requiredReplace(
  checker,
  'function checkCanonicalIds(file, content) {\n  for (const [kind, pattern] of Object.entries(ID_PATTERNS)) {',
  "function checkCanonicalIds(file, content) {\n  if (content.includes('Canonical-ID namespace: `HISTORICAL-SOURCE-ALIASES`')) return;\n\n  for (const [kind, pattern] of Object.entries(ID_PATTERNS)) {",
);

// R6 checker false positive: do not name an ADR identity that intentionally does not exist.
requiredReplace(
  'docs/architecture/adr/C7-R6-POST-C6-ADR-DELTA.md',
  'This review therefore **does not create ADR-MIG-010 merely to mirror C6 terminology**.',
  'This review therefore **does not create a new Migration ADR merely to mirror C6 terminology**.',
);

// R5 — canonical execution/correlation vocabulary propagation.
requiredReplace(
  notif,
  'source_event_id\nnotification_intent_id\ndelivery_id\nattempt_id\nprovider_message_id when safe\ncorrelation_id',
  'source_event_id\nnotification_intent_id\ndelivery_id\nattempt_id\nprovider_message_id when safe\nrequest_id when a transport attempt exists\ntrace_id when retained\nreference_id when exposed to support/user\njob_id for worker execution\nrelease_id',
);
requiredReplace(
  media,
  'correlation_id\ncommand_id\nintent_id\nasset_id\npurpose\npolicy_version\nprocessing result\nfailure class\nlatency',
  'command_id nullable\nrequest_id nullable\ntrace_id nullable\nreference_id nullable\njob_id nullable\nrelease_id\nintent_id\nasset_id\npurpose\npolicy_version\nprocessing result\nfailure class\nlatency',
);

// R5 — Match correction command vocabulary.
for (const path of [
  'docs/architecture/contexts/N2.07-live-match.md',
  'docs/architecture/platform/N2.15-api-application.md',
  'docs/architecture/matrices/C5.02-COMMAND-QUERY-EVENT-CAPABILITY-MATRIX.md',
]) {
  replaceRegex(path, /\bRevertEvent\b/g, 'RevertMatchEvent');
}

// R5 — Statistics canonical contribution name.
const stats = 'docs/architecture/contexts/N2.09-history-statistics.md';
requiredReplace(
  stats,
  'Nome conceitual:\n\n```text\nPlayerMatchStatContribution\n```\n\nou:\n\n```text\nMatchStatContribution\n```\n\nO nome final será fechado no Data Catalog, mas a semântica é esta.',
  'Nome canônico, fechado por C7 R5:\n\n```text\nPlayerMatchStatContribution\n```\n\nA semântica e o nome arquitetural estão fechados. O nome físico de tabela continua responsabilidade do Data Catalog/schema e não altera esta identidade de domínio/projection.',
);
replaceRegex(stats, /\bMatchStatContribution\b/g, 'PlayerMatchStatContribution');

// R5 — StandingsProjection canonical plural form in owner/consumer docs.
for (const path of [
  'docs/architecture/GLOSSARY.md',
  'docs/architecture/EAP-MASTER.md',
  'docs/architecture/contexts/N2.08-competitions.md',
  'docs/architecture/contexts/N2.09-history-statistics.md',
  'docs/architecture/platform/N2.14-data-architecture.md',
  'docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md',
  'docs/architecture/matrices/C5.02-COMMAND-QUERY-EVENT-CAPABILITY-MATRIX.md',
]) {
  replaceRegex(path, /\bStandingProjection\b/g, 'StandingsProjection');
}

// R5 — Player Skill Profile ownership propagation into C5/C4 labels.
const entityMatrix = 'docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md';
replaceLiteralEverywhere(entityMatrix, 'Rating / Identity sports evaluation', 'Identity / Player — Player Skill Profile');
replaceLiteralEverywhere(entityMatrix, 'Rating projection', 'Identity / Player — Player Skill Profile');
replaceLiteralEverywhere(entityMatrix, 'Rating/display', 'Identity / Player — Player Skill Profile');
replaceLiteralEverywhere(entityMatrix, '# 5. Rating / Team Formation / Voting entities', '# 5. Player Skill Profile / Team Formation / Voting entities');
replaceLiteralEverywhere(
  entityMatrix,
  'Stats ADRs; `HYP-STAT-001` naming | READY_WITH_OPEN_PARAMETER name/schema',
  'Stats ADRs; C7 R5 naming resolution | READY_TARGET',
);
replaceLiteralEverywhere(
  entityMatrix,
  'HYP-STAT-001     PlayerMatchStatContribution canonical name\n',
  '',
);

const openCatalog = 'docs/architecture/catalogs/OPEN-DECISIONS.md';
replaceLiteralEverywhere(
  openCatalog,
  '# 6. Team Formation / Rating / Voting Open Decisions',
  '# 6. Team Formation / Player Skill Profile / Voting Open Decisions',
);
replaceLiteralEverywhere(
  openCatalog,
  'Primary owner: Team Formation, except cross-context Rating questions that C5/C7 must assign to an explicit Skill Profile owner.',
  'Primary owner: Team Formation for balancing/voting; Identity / Player — Player Skill Profile for `OPEN-RATING-*` aggregation/profile questions.',
);

// Glossary cleanup if the old shorthand survived an earlier partial propagation.
replaceRegex('docs/architecture/GLOSSARY.md', /^### PlayerMatchStats$/gm, '### PlayerMatchStatContribution');
replaceLiteralEverywhere(
  'docs/architecture/GLOSSARY.md',
  'Projection/contribution estatística de um Player em uma única Match.',
  'Projection/contribution estatística rebuildable de um Player/MatchParticipation em uma única Match.',
);
replaceLiteralEverywhere(
  'docs/architecture/GLOSSARY.md',
  '### Request ID / Correlation ID\n\nIdentificador de uma tentativa técnica de execução/comunicação.\n\nUm command pode ter várias requests durante retry.',
  '### Request ID\n\nIdentificador de uma tentativa técnica de execução/comunicação. Um Command pode ter várias requests durante retry.\n\n---\n\n### Trace ID\n\nIdentificador da cadeia causal de tracing/instrumentation. Não é usado como idempotency key de domínio.\n\n---\n\n### Reference ID\n\nReferência opaca e segura que pode ser apresentada ao usuário/suporte e mapeada server-side para contexto diagnóstico. Não concede autorização e não precisa ser igual a Request ID ou Trace ID.\n\n---\n\n### Correlation\n\nRelação entre Command ID, Request ID, Trace ID, Reference ID, Job ID e Release ID. `correlation_id` não é um identificador canônico universal no target.',
);

console.log(`C7 R4/R5 remediation changed ${changed.size} file(s):`);
for (const path of [...changed].sort()) console.log(`- ${path}`);
