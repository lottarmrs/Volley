import {
  ACCEPTED_NON_PUBLIC_SEARCH_PATHS,
  LEGACY_SEARCH_PATH_PUBLIC,
  W2_HARDENING_PRIORITY,
} from './schemaSecurityBaseline';

/**
 * Renders the XS-W0-04 security hardening backlog.
 *
 * Generated from `schemaSecurityBaseline.ts` and asserted equal in
 * `schemaSecurityBacklog.test.ts`, so the human-readable backlog cannot drift from the
 * list the database suite actually enforces.
 */
export function renderSecurityBacklogMarkdown(): string {
  const later = LEGACY_SEARCH_PATH_PUBLIC.filter((name) => !W2_HARDENING_PRIORITY.includes(name));

  const row = (name: string, wave: string) => `| \`${name}\` | \`search_path=public\` | ${wave} |`;

  return `# C6 XS-W0-04 — Schema security hardening backlog

> Status: \`TRANSITIONAL / C6-W0-04\`
>
> Owner: \`Security / Data\`
>
> Parent: [\`C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md\`](C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md)
>
> Generated from \`src/test/db/schemaSecurityBaseline.ts\`. Do not edit by hand.

---

# 0. What this is

\`ADR-SEC-003\` and \`GINV-SEC-004\` treat every \`SECURITY DEFINER\` function as a privileged
endpoint. The target contract is:

\`\`\`text
SECURITY DEFINER only when required
SET search_path = ''
fully qualified object references
explicit grants and revokes
actor derived server-side from auth.uid()
no user-editable metadata used for authorization
\`\`\`

The current schema pins \`search_path = public\` on **${LEGACY_SEARCH_PATH_PUBLIC.length}** functions.
That is not the target: \`public\` is writable by the schema owner and resolves ahead of
\`pg_catalog\`, so it narrows the attack surface without closing it.

C6.01 is explicit that this must **not** become one large rewrite migration. Hardening
happens by touched surface, wave by wave, against this backlog.

# 1. Enforcement today

\`src/test/db/schemaSecurity.dbtest.ts\` runs against a real PostgreSQL and holds the line:

\`\`\`text
TARGET   no callable SECURITY DEFINER function is reachable by anon or PUBLIC
TARGET   anon holds no table privilege anywhere in public
TARGET   every SECURITY DEFINER function pins some search_path
BASELINE no NEW function may join the search_path=public list below
BASELINE hardened functions must be removed from the list, keeping it honest
\`\`\`

The baseline list may only shrink. A new privileged function using \`search_path=public\`
fails the suite; the fix is the function, not the list.

# 2. W2 priority — harden first

W2 covers identity, Community and authorization, so these are hardened as W2 touches them.

| Function | Current | Wave |
| --- | --- | --- |
${W2_HARDENING_PRIORITY.map((name) => row(name, 'W2')).join('\n')}

# 3. Later waves

Not touched by W2. These stay pending until their owning wave rewrites them, so that no
unrelated function is rewritten just to clear a list.

| Function | Current | Wave |
| --- | --- | --- |
${later.map((name) => row(name, 'later')).join('\n')}

# 4. Classified as acceptable

${Object.entries(ACCEPTED_NON_PUBLIC_SEARCH_PATHS)
  .map(
    ([name, config]) =>
      `- \`${name}\` (\`${config}\`) — event trigger function, invoked by the system and not directly callable. Verified in the suite rather than assumed.`,
  )
  .join('\n')}

# 5. Definition of done

A function leaves this backlog when it sets \`search_path = ''\`, fully qualifies every
referenced object, carries explicit grants with \`EXECUTE\` revoked from \`PUBLIC\`, and derives
its actor from \`auth.uid()\` rather than any client-supplied argument.
`;
}
