import { currentStateLedger, type CurrentStateLedgerEntry } from './currentStateLedger';

/**
 * Renders the human-readable view of the XS-W0-02 ledger.
 *
 * The Markdown file is generated, never hand-edited: `currentStateLedger.test.ts` asserts
 * the committed document equals this output, so the narrative view cannot drift from the
 * machine-readable ledger it describes.
 */

function cell(value: string): string {
  return value.split('|').join('\\|');
}

function list(values: readonly string[]): string {
  return values.length ? values.map((value) => `\`${value}\``).join('<br>') : '—';
}

function section(entry: CurrentStateLedgerEntry): string {
  const rows: Array<[string, string]> = [
    ['Sources', entry.sources.map((source) => `\`${source}\``).join(', ')],
    ['Payload key', entry.payloadKey ? `\`${entry.payloadKey}\`` : '—'],
    ['Local storage key', entry.storageKey ? `\`${entry.storageKey}\`` : '—'],
    ['Cloud table / RPC', list(entry.cloudTableOrRpc)],
    ['Legacy writers', list(entry.legacyWriters)],
    ['Legacy readers', list(entry.legacyReaders)],
    ['Current authority', cell(entry.currentAuthority)],
    ['Current merge', cell(entry.currentMerge)],
    ['Lifecycle fields', list(entry.lifecycleFields)],
    ['FK / delete', cell(entry.foreignKeyDelete)],
    ['Target owner', `\`${entry.targetOwner}\``],
    ['Target wave', `\`${entry.targetWave}\``],
    ['Migration class', `\`${entry.migrationClass}\``],
    ['Remaining surfaces', list(entry.remainingSurfaces)],
  ];

  const body = rows.map(([label, value]) => `| ${label} | ${value} |`).join('\n');
  const notes = entry.notes ? `\n\n${cell(entry.notes)}` : '';

  return `## ${entry.entity}\n\n| Field | Current state |\n| --- | --- |\n${body}${notes}\n`;
}

export function renderCurrentStateLedgerMarkdown(): string {
  const byWave = new Map<string, string[]>();
  for (const entry of currentStateLedger) {
    const bucket = byWave.get(entry.targetWave) ?? [];
    bucket.push(entry.entity);
    byWave.set(entry.targetWave, bucket);
  }

  const waveOrder = Array.from(byWave.keys()).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );

  const summary = waveOrder
    .map((wave) => `| \`${wave}\` | ${byWave.get(wave)?.join(', ')} |`)
    .join('\n');

  const retiring = currentStateLedger
    .filter((entry) => entry.migrationClass === 'RETIRE')
    .map((entry) => `- \`${entry.entity}\` — ${cell(entry.notes ?? '')}`)
    .join('\n');

  return `# C6 XS-W0-02 — Current-state inventory and authority ledger

> Status: \`TRANSITIONAL / C6-W0-02\`
>
> Owner: \`Migration / Architecture Governance\`
>
> Parent: [\`C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md\`](C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md)
>
> Generated from \`src/architecture/currentStateLedger.ts\`. Do not edit by hand.

---

# 0. What this is

This document describes the **current implementation**, not the target architecture. It is
transitional evidence produced by C6 slice \`XS-W0-02\` so that later waves can retire legacy
deliberately instead of by guesswork.

The exit gate for the slice is:

\`\`\`text
No W13 removal may begin for an entity whose current readers/writers are not inventoried.
\`\`\`

That gate is enforced mechanically. \`src/architecture/currentStateLedger.test.ts\` reads
\`LocalSyncPayload\`, \`OperationalSyncPayload\` and \`STORAGE_KEYS\` from live source and fails if
any entity or key is missing an entry, if a recorded surface no longer exists, or if an entry
with no reader and no writer is not explicitly classified for retirement.

Inventoried entities: **${currentStateLedger.length}**.

# 1. Retirement order by target wave

| Wave | Entities |
| --- | --- |
${summary}

# 2. Entities with no remaining reader or writer

${retiring || '_None._'}

# 3. Inventory

${currentStateLedger.map(section).join('\n')}`;
}
