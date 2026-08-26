# Schema Drift Diagnostics — Historical Procedure / Current Supporting Check

> Status: `TRANSITIONAL / DIAGNOSTIC — NOT SCHEMA AUTHORITY`
>
> Owner: `Data + Platform Operations`
>
> Last reviewed: `2026-08-26 / C7-R3`
>
> Current reconstruction authority: [`database-reconstruction-contract.md`](./database-reconstruction-contract.md).
>
> Governing target: [`N2.14-data-architecture.md`](../architecture/platform/N2.14-data-architecture.md) + [`N2.21-operations-deploy.md`](../architecture/operations/N2.21-operations-deploy.md).

---

# 0. C7 correction

Historically, this document treated `supabase/migrations/schema.sql` as a consolidated representation that had to be manually synchronized with production.

That model is no longer an accepted source-of-truth policy.

Current rule:

```text
schema change
→ versioned migration
→ reviewed deploy
→ production
```

not:

```text
production drift
→ manually edit schema.sql to match
```

During the transitional W0 period, `schema.sql` is treated as a **frozen legacy baseline segment** required by the historical reconstruction chain, not a continuously edited consolidated current snapshot. See `database-reconstruction-contract.md`.

The diagnostic techniques below remain valuable because they exposed real gaps such as missing functions/event triggers and differences between repository artifacts and deployed schema.

---

# 1. What this diagnostic can answer

It can help answer:

```text
Did selected deployed function bodies diverge from the repository artifact being inspected?
```

It cannot, by itself, answer:

```text
Is the whole database schema correct?
Is reconstruction from empty valid?
Are RLS/grants/indexes/triggers/event triggers correct?
Is production free from all drift?
```

A silent result from the function-body comparison is therefore **not** a full schema-integrity certificate.

---

# 2. Historical function-body comparison

The historical procedure queried function bodies from `pg_proc` and compared normalized hashes.

Example query preserved for diagnostic/reference use:

```sql
select string_agg(p.proname || '|' ||
         md5(translate(lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s', '', 'g')),
                       'áàâãéêíóôõúüçñ', 'aaaaeeiooouucn')), E'\n' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f';
```

The normalization intentionally ignores whitespace/comments/selected accents to reduce noise.

Historical comparison helper:

```js
const fs = require('fs'), crypto = require('crypto');
const s = fs.readFileSync('supabase/migrations/schema.sql', 'utf8');
const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\([\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\2/gi;
const bodies = {};
let m; while ((m = re.exec(s)) !== null) bodies[m[1].toLowerCase()] = m[3];
const de = 'áàâãéêíóôõúüçñ', para = 'aaaaeeiooouucn';
const fold = t => [...t].map(c => { const i = de.indexOf(c); return i < 0 ? c : para[i]; }).join('');
const norm = t => crypto.createHash('md5')
  .update(fold(t.toLowerCase().replace(/--[^\n]*/g, '').replace(/\s/g, ''))).digest('hex');
for (const linha of fs.readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const [nome, hash] = linha.trim().split('|');
  if (!(nome in bodies)) console.log('AUSENTE  ', nome);
  else if (norm(bodies[nome]) !== hash) console.log('DIVERGE  ', nome);
}
```

After C7, this helper should be read as **historical diagnostic code**, because `schema.sql` is no longer the conceptual current-schema authority to synchronize manually.

---

# 3. The critical limitation discovered by this procedure

Function-body comparison does not cover:

```text
tables
columns
constraints
RLS policies
grants
indexes
ordinary triggers
event triggers
extensions
function attributes/security posture
```

A previous investigation found that an event trigger (`ensure_rls`) and `rls_auto_enable` had escaped the narrow function-body comparison.

That lesson becomes a target invariant for W0:

```text
FRESH RECONSTRUCTION VERIFICATION
MUST INSPECT MORE THAN FUNCTION TEXT
```

---

# 4. Current drift policy

Normal production differences from the repository migration history are not “fixed” by editing a snapshot.

If unplanned drift is found:

```text
1 identify exact deployed difference
2 classify emergency/manual vs expected provider-managed state
3 create/reconcile a forward migration where repository ownership applies
4 test reconstruction in isolated environment
5 verify RLS/grants/constraints/functions/triggers as applicable
6 deploy through normal change process
7 close the drift record
```

Do not rewrite already-applied migrations retroactively.

---

# 5. Current check matrix

For sensitive changes, use checks appropriate to the object class:

| Object | Preferred evidence |
|---|---|
| table/column | catalog query + migration replay |
| FK/check/unique | catalog query + negative DB test |
| RLS enabled | `pg_class`/catalog query |
| RLS policy | `pg_policies` + actor tests |
| grant/revoke | privilege catalog / `has_*_privilege` checks |
| SECURITY DEFINER | function catalog + source review + authorization tests |
| trigger | catalog + behavior test |
| event trigger | `pg_event_trigger` + behavior test |
| index | catalog + query-plan evidence where relevant |
| RPC semantics | real DB integration/authorization/concurrency test |

---

# 6. Historical last comparison

The previous document recorded a 2026-07-30 comparison in which 56 functions were checked and three repository gaps were corrected, including `rls_auto_enable`/event-trigger coverage.

That remains useful historical evidence.

It does **not** establish that the present target schema, current production database or future migration chain is fully reconciled.

---

# 7. W0 replacement

C6 W0 should replace this manual diagnostic as the primary confidence mechanism with:

```text
empty isolated DB
→ canonical baseline/history
→ all forward migrations
→ structural catalog assertions
→ RLS/RPC/security tests
→ representative concurrency tests
```

A drift utility may continue to exist as a support tool, but it must never become a second schema authority.
